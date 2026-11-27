using System.Globalization;
using System.Security.Claims;
using System.Text.RegularExpressions;
using Npgsql;

static class AdminSettings
{
    public static void Map(RouteGroupBuilder admin, NpgsqlDataSource db)
    {
        admin.MapGet("/settings", async (HttpContext ctx) =>
        {
            var id = SalonId(ctx);
            var ct = ctx.RequestAborted;
            await using var cmd = db.CreateCommand("""
                SELECT b.nome,b.address,b.description,b.directory_phone,b."imageUrl",
                       to_char(b.opens::interval,'HH24:MI'),to_char(b.closes::interval,'HH24:MI'),
                       to_char(b.break_start::interval,'HH24:MI'),to_char(b.break_end::interval,'HH24:MI'),b.workdays,
                       (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                            'id',s.id,'name',s.nome,'description',s.description,'priceInCents',s."priceInCents",
                            'minutes',s.minutes,'active',s.active) ORDER BY s.nome,s.id),'[]'::jsonb)
                        FROM "BarbershopService" s WHERE s."barbershopId"=b.id)::text,
                       (SELECT COALESCE(jsonb_agg(jsonb_build_object('day',d.day,'note',d.note) ORDER BY d.day),'[]'::jsonb)
                        FROM salon_blocked_day d WHERE d.salon_id=b.id
                          AND d.day>=timezone('America/Sao_Paulo',now())::date)::text
                FROM "BarberShop" b WHERE b.id=$1
                """);
            cmd.Parameters.AddWithValue(id);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (!await r.ReadAsync(ct)) return Results.NotFound();
            return Results.Ok(new
            {
                name=r.GetString(0), address=r.GetString(1), description=r.GetString(2),
                directoryPhone=GetNullableText(r,3), imageUrl=r.GetString(4),
                opens=r.GetString(5), closes=r.GetString(6), breakStart=GetNullableText(r,7), breakEnd=GetNullableText(r,8),
                workdays=r.GetFieldValue<short[]>(9),
                services=System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(r.GetString(10)),
                blocks=System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(r.GetString(11))
            });
        });
        admin.MapPost("/profile", async (OwnerProfile input, HttpContext ctx) =>
        {
            var phone = input.DirectoryPhone?.Trim() ?? "";
            if (phone.Length>0 && NormalizePhone(phone) is not { }) return Results.BadRequest();
            var image = input.ImageUrl?.Trim() ?? "";
            if (!ValidName(input.Name,100) || !ValidName(input.Address,200) ||
                (input.Description?.Length ?? 0)>1200 || !SafeImage(image)) return Results.BadRequest();
            await using var cmd = db.CreateCommand("""
                UPDATE "BarberShop" SET nome=$2,address=$3,description=$4,directory_phone=$5,"imageUrl"=$6 WHERE id=$1
                """);
            cmd.Parameters.AddWithValue(SalonId(ctx));
            cmd.Parameters.AddWithValue(input.Name!.Trim());
            cmd.Parameters.AddWithValue(input.Address!.Trim());
            cmd.Parameters.AddWithValue(input.Description?.Trim() ?? "");
            cmd.Parameters.Add(NullableParameter(NpgsqlTypes.NpgsqlDbType.Text,NormalizePhone(phone)));
            cmd.Parameters.AddWithValue(image);
            try { return await cmd.ExecuteNonQueryAsync(ctx.RequestAborted)==1 ? Results.NoContent() : Results.NotFound(); }
            catch (PostgresException ex) when (ex.SqlState==PostgresErrorCodes.UniqueViolation)
            { return Results.Conflict(); }
        });
        admin.MapPost("/services", async (OwnerService input, HttpContext ctx) =>
        {
            if (!ValidName(input.Name,100) || (input.Description?.Length ?? 0)>500 ||
                input.PriceInCents is null or <0 or >10_000_000 || input.Minutes is null or <5 or >480 ||
                input.Active is null || (input.Id?.Length ?? 0)>200) return Results.BadRequest();
            var create=string.IsNullOrEmpty(input.Id);
            var id=SalonId(ctx);
            var ct=ctx.RequestAborted;
            await using var conn=await db.OpenConnectionAsync(ct);
            await using var tx=await conn.BeginTransactionAsync(ct);
            if (!await LockSalon(conn,tx,id,ct)) return Results.NotFound();
            await using var cmd = new NpgsqlCommand(create ? """
                INSERT INTO "BarbershopService" (id,"barbershopId",nome,description,"imageUrl","priceInCents",minutes,active)
                VALUES ($2,$1,$3,$4,'',$5,$6,$7)
                """ : """
                UPDATE "BarbershopService" SET nome=$3,description=$4,"priceInCents"=$5,minutes=$6,active=$7
                WHERE "barbershopId"=$1 AND id=$2
                """,conn,tx);
            cmd.Parameters.AddWithValue(id);
            cmd.Parameters.AddWithValue(create ? Guid.NewGuid().ToString("N") : input.Id!);
            cmd.Parameters.AddWithValue(input.Name!.Trim());
            cmd.Parameters.AddWithValue(input.Description?.Trim() ?? "");
            cmd.Parameters.AddWithValue(input.PriceInCents.Value);
            cmd.Parameters.AddWithValue(input.Minutes.Value);
            cmd.Parameters.AddWithValue(input.Active.Value);
            if (await cmd.ExecuteNonQueryAsync(ct)!=1) return Results.NotFound();
            await tx.CommitAsync(ct);
            return Results.NoContent();
        });
        admin.MapPost("/hours", async (OwnerHours input,HttpContext ctx) =>
        {
            if (!TryTime(input.Opens,out var opens) || !TryTime(input.Closes,out var closes) || opens>=closes ||
                input.Workdays is not { Length: >=1 and <=7 } workdays ||
                workdays.Any(day=>day is <1 or >7) || workdays.Distinct().Count()!=workdays.Length)
                return Results.BadRequest();
            TimeOnly? start=null,end=null;
            if (!string.IsNullOrEmpty(input.BreakStart) || !string.IsNullOrEmpty(input.BreakEnd))
            {
                if (!TryTime(input.BreakStart,out var a) || !TryTime(input.BreakEnd,out var z) ||
                    !(opens<a && a<z && z<closes)) return Results.BadRequest();
                (start,end)=(a,z);
            }
            var id=SalonId(ctx);
            var ct=ctx.RequestAborted;
            await using var conn=await db.OpenConnectionAsync(ct);
            await using var tx=await conn.BeginTransactionAsync(ct);
            if (!await LockSalon(conn,tx,id,ct)) return Results.NotFound();
            await using var guard=new NpgsqlCommand("""
                SELECT EXISTS (SELECT 1 FROM booking WHERE salon_id=$1 AND canceled_at IS NULL
                AND starts_at>timezone('America/Sao_Paulo',clock_timestamp())
                AND (NOT (extract(isodow FROM starts_at)::smallint=ANY($6))
                    OR starts_at < starts_at::date+$2 OR ends_at > starts_at::date+$3
                    OR ($4::time IS NOT NULL AND starts_at < starts_at::date+$5 AND ends_at > starts_at::date+$4)))
                """,conn,tx);
            AddHours(guard,id,opens,closes,start,end,workdays);
            if (await guard.ExecuteScalarAsync(ct) is true) return Results.Conflict();
            await using var save=new NpgsqlCommand("""
                UPDATE "BarberShop" SET opens=$2,closes=$3,break_start=$4,break_end=$5,workdays=$6 WHERE id=$1
                """,conn,tx);
            AddHours(save,id,opens,closes,start,end,workdays);
            await save.ExecuteNonQueryAsync(ct);
            await tx.CommitAsync(ct);
            return Results.NoContent();
        });
        admin.MapPost("/blocks", async (OwnerBlock input,HttpContext ctx) =>
        {
            if ((input.Note?.Length ?? 0)>160) return Results.BadRequest();
            var id=SalonId(ctx);
            var ct=ctx.RequestAborted;
            await using var conn=await db.OpenConnectionAsync(ct);
            await using var tx=await conn.BeginTransactionAsync(ct);
            if (!await LockSalon(conn,tx,id,ct)) return Results.NotFound();
            await using var check=new NpgsqlCommand("""
                SELECT $2::date BETWEEN timezone('America/Sao_Paulo',now())::date AND timezone('America/Sao_Paulo',now())::date+365,
                    EXISTS (SELECT FROM booking WHERE salon_id=$1 AND canceled_at IS NULL
                      AND starts_at >= $2::date AND starts_at < $2::date+1
                      AND ends_at > timezone('America/Sao_Paulo',clock_timestamp()))
                """,conn,tx);
            check.Parameters.AddWithValue(id);
            check.Parameters.AddWithValue(input.Day);
            await using (var r=await check.ExecuteReaderAsync(ct))
            {
                await r.ReadAsync(ct);
                if (!r.GetBoolean(0)) return Results.BadRequest();
                if (r.GetBoolean(1)) return Results.Conflict();
            }
            await using var save=new NpgsqlCommand("""
                INSERT INTO salon_blocked_day(salon_id,day,note) VALUES ($1,$2,$3)
                ON CONFLICT (salon_id,day) DO UPDATE SET note=EXCLUDED.note
                """,conn,tx);
            save.Parameters.AddWithValue(id);
            save.Parameters.AddWithValue(input.Day);
            save.Parameters.AddWithValue(input.Note?.Trim() ?? "");
            await save.ExecuteNonQueryAsync(ct);
            await tx.CommitAsync(ct);
            return Results.NoContent();
        });
        admin.MapPost("/blocks/remove", async (OwnerBlock input,HttpContext ctx) =>
        {
            await using var cmd=db.CreateCommand("DELETE FROM salon_blocked_day WHERE salon_id=$1 AND day=$2");
            cmd.Parameters.AddWithValue(SalonId(ctx));
            cmd.Parameters.AddWithValue(input.Day);
            await cmd.ExecuteNonQueryAsync(ctx.RequestAborted);
            return Results.NoContent();
        });
    }

    static string SalonId(HttpContext ctx) => ctx.User.FindFirstValue("salon_id")!;
    static bool ValidName(string? value,int max) => !string.IsNullOrWhiteSpace(value) && value.Length<=max;
    static string? GetNullableText(NpgsqlDataReader r,int index) => r.IsDBNull(index)?null:r.GetString(index);
    static bool TryTime(string? value,out TimeOnly time) =>
        TimeOnly.TryParseExact(value,"HH:mm",CultureInfo.InvariantCulture,DateTimeStyles.None,out time);
    static NpgsqlParameter NullableParameter(NpgsqlTypes.NpgsqlDbType dbType,object? value) =>
        new() { NpgsqlDbType=dbType, Value=value ?? DBNull.Value };

    public static string? NormalizePhone(string? phone)
    {
        if (phone is null || phone.Length>32 || !Regex.IsMatch(phone,@"^\+?[0-9 ().-]+$")) return null;
        var number=Regex.Replace(phone,"[^0-9]","");
        if (number.Length is 10 or 11) number="55"+number;
        return Regex.IsMatch(number,@"^55[1-9][0-9]{9,10}$")?number:null;
    }
    static bool SafeImage(string image) => image.Length==0 || image=="/banner.png" ||
        (image.Length<=1000 && Uri.TryCreate(image,UriKind.Absolute,out var url) &&
            url.Scheme=="https" && url.HostNameType==UriHostNameType.Dns &&
            url.IdnHost.Contains('.') && !url.IdnHost.EndsWith(".localhost",StringComparison.OrdinalIgnoreCase) &&
            string.IsNullOrEmpty(url.UserInfo) && url.IsDefaultPort);

    static async Task<bool> LockSalon(NpgsqlConnection conn,NpgsqlTransaction tx,string id,CancellationToken ct)
    {
        await using var cmd=new NpgsqlCommand("""SELECT id FROM "BarberShop" WHERE id=$1 FOR UPDATE""",conn,tx);
        cmd.Parameters.AddWithValue(id);
        return await cmd.ExecuteScalarAsync(ct) is string;
    }
    static void AddHours(NpgsqlCommand cmd,string id,TimeOnly opens,TimeOnly closes,TimeOnly? start,TimeOnly? end,short[] days)
    {
        cmd.Parameters.AddWithValue(id);
        cmd.Parameters.AddWithValue(opens);
        cmd.Parameters.AddWithValue(closes);
        cmd.Parameters.Add(NullableParameter(NpgsqlTypes.NpgsqlDbType.Time,start));
        cmd.Parameters.Add(NullableParameter(NpgsqlTypes.NpgsqlDbType.Time,end));
        cmd.Parameters.AddWithValue(days);
    }
}
record OwnerProfile(string? Name,string? Address,string? Description,string? DirectoryPhone,string? ImageUrl);
record OwnerService(string? Id,string? Name,string? Description,int? PriceInCents,int? Minutes,bool? Active);
record OwnerHours(string? Opens,string? Closes,string? BreakStart,string? BreakEnd,short[]? Workdays);
record OwnerBlock(DateOnly Day,string? Note);
