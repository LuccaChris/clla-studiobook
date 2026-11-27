using System.Security.Claims;
using System.Text.RegularExpressions;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);
var cs = builder.Configuration.GetConnectionString("StudioBook")
    ?? throw new InvalidOperationException("Configure ConnectionStrings__StudioBook.");
await using var db = NpgsqlDataSource.Create(cs);
var hasher = new PasswordHasher<string>();
if (args.FirstOrDefault() == "admin")
{
    // Local operator command. Never replace an existing administrator implicitly.
    if (args.Length != 3 || !Regex.IsMatch(args[1], "^[a-z0-9]+(-[a-z0-9]+)*$"))
        throw new ArgumentException("admin <slug> <email>");
    var password = Environment.GetEnvironmentVariable("STUDIOBOOK_ADMIN_PASSWORD");
    if (password is null || password.Length < 12) throw new ArgumentException("Use uma senha de pelo menos 12 caracteres.");
    await using var add = db.CreateCommand("""
        INSERT INTO salon_admin (salon_id,email,password_hash)
        SELECT id,$2,$3 FROM "BarberShop" WHERE slug=$1
        """);
    add.Parameters.AddWithValue(args[1]);
    add.Parameters.AddWithValue(args[2].Trim().ToLowerInvariant());
    add.Parameters.AddWithValue(hasher.HashPassword(args[1], password));
    if (await add.ExecuteNonQueryAsync() != 1) throw new InvalidOperationException("Salão inexistente.");
    return;
}

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(o =>
{
    o.Cookie.Name = "studiobook.admin";
    o.Cookie.HttpOnly = true;
    o.Cookie.SameSite = SameSiteMode.Strict;
    o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    o.ExpireTimeSpan = TimeSpan.FromHours(8);
    o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
});
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.AddPolicy("customer", (HttpContext ctx) => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "", _ => new FixedWindowRateLimiterOptions
        { PermitLimit = 120, Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy("login", (HttpContext ctx) => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Request.RouteValues["slug"]?.ToString() ?? "", _ => new FixedWindowRateLimiterOptions
        { PermitLimit = 15, Window = TimeSpan.FromMinutes(1) }));
});
var app = builder.Build();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
// Browser mutations must use JSON and a custom header through the same-origin Next proxy.
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers.CacheControl = "no-store";
    if (HttpMethods.IsPost(ctx.Request.Method) &&
        (!ctx.Request.HasJsonContentType() || ctx.Request.Headers["X-StudioBook"] != "1"))
    { ctx.Response.StatusCode = 400; return; }
    await next();
});

app.MapGet("/api/salons", async () =>
{
    await using var cmd = db.CreateCommand("""SELECT slug,nome,address,"imageUrl" FROM "BarberShop" ORDER BY nome,id""");
    await using var r = await cmd.ExecuteReaderAsync();
    var salons = new List<object>();
    while (await r.ReadAsync()) salons.Add(new { slug=r.GetString(0), name=r.GetString(1), address=r.GetString(2), imageUrl=r.GetString(3) });
    return salons;
});
app.MapGet("/api/salons/directory/lookup", async (string? phone) =>
{
    if (AdminSettings.NormalizePhone(phone) is not string number) return Results.BadRequest();

    await using var cmd = db.CreateCommand("""
        SELECT slug, nome, address, layout
        FROM "BarberShop" WHERE directory_phone=$1
        """);
    cmd.Parameters.AddWithValue(number);
    await using var reader = await cmd.ExecuteReaderAsync();
    if (!await reader.ReadAsync()) return Results.NotFound();
    return Results.Ok(new
    {
        slug = reader.GetString(0),
        name = reader.GetString(1),
        address = reader.GetString(2),
        layout = reader.GetString(3)
    });
});

var salon = app.MapGroup("/api/salons/{slug}");
salon.MapGet("", async (string slug) =>
{
    await using var cmd = db.CreateCommand("""
        SELECT b.nome,b.address,b.description,b."imageUrl",b.layout,s.id,s.nome,s."priceInCents",s.minutes,s.preparation
        FROM "BarberShop" b LEFT JOIN "BarbershopService" s ON s."barbershopId"=b.id AND s.active
        WHERE b.slug=$1 ORDER BY s.nome,s.id
        """);
    cmd.Parameters.AddWithValue(slug);
    await using var r = await cmd.ExecuteReaderAsync();
    if (!await r.ReadAsync()) return Results.NotFound();
    var name = r.GetString(0);
    var address = r.GetString(1);
    var description = r.GetString(2);
    var imageUrl = r.GetString(3);
    var layout = r.GetString(4);
    var services = new List<object>();
    do
    {
        if (!r.IsDBNull(5))
            services.Add(new { id = r.GetString(5), name = r.GetString(6), priceInCents = r.GetInt32(7), minutes = r.GetInt32(8), preparation = r.GetString(9) });
    }
    while (await r.ReadAsync());
    return Results.Ok(new { name, address, description, imageUrl, layout, services });
});
salon.MapPost("/login", async (string slug, Login input, HttpContext ctx) =>
{
    if (string.IsNullOrWhiteSpace(input.Email) || string.IsNullOrEmpty(input.Password)) return Results.Unauthorized();
    await using var cmd=db.CreateCommand("""
        SELECT a.password_hash,a.salon_id FROM salon_admin a JOIN "BarberShop" b ON b.id=a.salon_id
        WHERE b.slug=$1 AND a.email=$2
        """);
    cmd.Parameters.AddWithValue(slug);
    cmd.Parameters.AddWithValue(input.Email.Trim().ToLowerInvariant());
    await using var reader = await cmd.ExecuteReaderAsync();
    if (!await reader.ReadAsync() ||
        hasher.VerifyHashedPassword(slug, reader.GetString(0), input.Password) == PasswordVerificationResult.Failed)
        return Results.Unauthorized();
    var identity = new ClaimsIdentity(new[]{new Claim("salon_id",reader.GetString(1))}, CookieAuthenticationDefaults.AuthenticationScheme);
    await ctx.SignInAsync(new ClaimsPrincipal(identity));
    return Results.NoContent();
}).RequireRateLimiting("login");
var admin=salon.MapGroup("/admin").RequireAuthorization();
admin.AddEndpointFilter(async (ctx,next) =>
{
    await using var check = db.CreateCommand("""SELECT id FROM "BarberShop" WHERE slug=$1""");
    check.Parameters.AddWithValue((string)ctx.HttpContext.Request.RouteValues["slug"]!);
    if (await check.ExecuteScalarAsync() is not string id || id != ctx.HttpContext.User.FindFirstValue("salon_id"))
        return Results.StatusCode(403);
    return await next(ctx);
});
admin.MapPost("/logout", async (HttpContext ctx) => { await ctx.SignOutAsync(); return Results.NoContent(); });
AdminBusiness.Map(admin, db);
AdminExceptions.Map(admin, db);
AdminSettings.Map(admin, db);
Calendar.Map(salon, db);
Calendar.MapCustomer(app, db);
app.Run();

record Login(string Email,string Password);
