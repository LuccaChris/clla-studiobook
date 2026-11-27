using System.Data;
using System.Globalization;
using System.Security.Cryptography;
using Npgsql;

static class Calendar
{
    // The requested dates change between endpoints. The slot rules stay shared.
    const string Day = "SELECT $3::date AS day";
    const string Period = """
        SELECT date::date AS day
        FROM generate_series($3::date, $4::date, interval '1 day') AS dates(date)
        """;
    const string SlotRules = """
        SELECT d.day, tick
        FROM requested_days d
        JOIN "BarberShop" b ON b.slug=$1
        JOIN "BarbershopService" s ON s."barbershopId"=b.id AND s.id=$2 AND s.active
        CROSS JOIN LATERAL generate_series(d.day+b.opens,
            d.day+b.closes-s.minutes*interval '1 minute',interval '15 minutes') tick
        WHERE extract(isodow FROM d.day)::int=ANY(b.workdays)
          AND d.day BETWEEN timezone('America/Sao_Paulo',now())::date
                        AND timezone('America/Sao_Paulo',now())::date+90
          AND tick > timezone('America/Sao_Paulo',now())
          AND NOT EXISTS (SELECT FROM salon_blocked_day d0 WHERE d0.salon_id=b.id AND d0.day=d.day)
          AND (b.break_start IS NULL OR tick + s.minutes*interval '1 minute' <= d.day+b.break_start
                                   OR tick >= d.day+b.break_end)
          AND NOT EXISTS (SELECT FROM booking k WHERE k.salon_id=b.id AND k.canceled_at IS NULL
              AND k.starts_at < tick+s.minutes*interval '1 minute' AND k.ends_at > tick)
        """;
    // Private rescheduling excludes only the already verified booking, not any other reservation.
    static readonly string RescheduleAvailability = "WITH requested_days AS (" + Day + ") " +
        SlotRules.Replace("AND s.active", "JOIN booking original ON original.id=$4 AND original.salon_id=b.id", StringComparison.Ordinal)
            .Replace("s.minutes*interval '1 minute'","(original.ends_at-original.starts_at)",StringComparison.Ordinal)
            .Replace("k.canceled_at IS NULL", "k.canceled_at IS NULL AND k.id<>$4", StringComparison.Ordinal);
    const string DailyAvailability = "WITH requested_days AS (" + Day + ") " + SlotRules;
    const string PeriodAvailability = "WITH requested_days AS (" + Period +
        "), available AS (" + SlotRules + ") SELECT DISTINCT day FROM available ORDER BY day";

    internal const int ChangeCutoffHours = 2;

    public static void Map(RouteGroupBuilder salon, NpgsqlDataSource db)
    {
        salon.MapGet("/slots", async (string slug,string serviceId,DateOnly day) =>
        {
            await using var cmd=db.CreateCommand(DailyAvailability + " ORDER BY tick");
            AddSelection(cmd,slug,serviceId,day);
            await using var reader=await cmd.ExecuteReaderAsync();
            var slots=new List<string>();
            while(await reader.ReadAsync()) slots.Add(reader.GetDateTime(1).ToString("HH:mm",CultureInfo.InvariantCulture));
            return slots;
        });
        salon.MapGet("/availability", async (string slug, string serviceId, DateOnly start, DateOnly end) =>
        {
            if (end < start || end.DayNumber - start.DayNumber >= 31) return Results.BadRequest();

            await using var cmd = db.CreateCommand(PeriodAvailability);
            AddSelection(cmd, slug, serviceId, start);
            cmd.Parameters.AddWithValue(end);
            await using var reader = await cmd.ExecuteReaderAsync();
            var days = new List<DateOnly>();
            while (await reader.ReadAsync()) days.Add(reader.GetFieldValue<DateOnly>(0));
            return Results.Ok(days);
        });
        salon.MapPost("/bookings",async (string slug,Reservation input) =>
        {
            if (string.IsNullOrWhiteSpace(input.Customer) || input.Customer.Length>100 ||
                string.IsNullOrWhiteSpace(input.ServiceId) ||
                !TimeOnly.TryParseExact(input.Time,"HH:mm",CultureInfo.InvariantCulture,DateTimeStyles.None,out var time))
                return Results.BadRequest();
            await using var conn=await db.OpenConnectionAsync();
            await using var tx=await conn.BeginTransactionAsync(IsolationLevel.ReadCommitted);
            // Serialize check + insert for the same salon, also across API replicas.
            await using var gate=new NpgsqlCommand("""SELECT id FROM "BarberShop" WHERE slug=$1 FOR UPDATE""",conn,tx);
            gate.Parameters.AddWithValue(slug);
            if(await gate.ExecuteScalarAsync() is not string salonId) return Results.NotFound();
            var secret = RandomNumberGenerator.GetBytes(32);
            var id = Guid.NewGuid();
            await using var insert=new NpgsqlCommand("""
                INSERT INTO booking(id,salon_id,service_name,customer,starts_at,ends_at,service_id,price_in_cents,manage_hash)
                SELECT $4,$5,s.nome,$6,tick,tick+s.minutes*interval '1 minute',s.id,s."priceInCents",$8
                FROM (
                """ + DailyAvailability + """

                ) slots JOIN "BarbershopService" s ON s.id=$2 AND s.active
                WHERE tick=$7
                """,conn,tx);
            AddSelection(insert,slug,input.ServiceId,input.Day);
            insert.Parameters.AddWithValue(id);
            insert.Parameters.AddWithValue(salonId);
            insert.Parameters.AddWithValue(input.Customer.Trim());
            insert.Parameters.AddWithValue(input.Day.ToDateTime(time));
            insert.Parameters.AddWithValue(SHA256.HashData(secret));
            if(await insert.ExecuteNonQueryAsync()!=1) return Results.Conflict();
            await tx.CommitAsync();
            return Results.Ok(new { time=input.Time, day=input.Day, manageCode=Convert.ToHexStringLower(secret) });
        });
    }

    public static void MapCustomer(WebApplication app, NpgsqlDataSource db)
    {
        var customer = app.MapGroup("/api/salons/customer-bookings").RequireRateLimiting("customer");
        customer.MapPost("/details", async (BookingCode input, HttpContext ctx) =>
        {
            var hash = ManageHash(input.Code);
            if (hash is null) return Results.NotFound();
            var record = await ReadBooking(db, hash, ctx.RequestAborted);
            return record is null ? Results.NotFound() : Results.Ok(record);
        });
        customer.MapPost("/slots", async (BookingDay input, HttpContext ctx) =>
        {
            var hash = ManageHash(input.Code);
            if (hash is null) return Results.NotFound();
            var record = await ReadBooking(db, hash, ctx.RequestAborted);
            if (record is null) return Results.NotFound();
            if (!record.CanChange) return Results.Conflict();
            await using var cmd = db.CreateCommand(RescheduleAvailability + " ORDER BY tick");
            AddSelection(cmd, record.Slug, record.ServiceId, input.Day);
            cmd.Parameters.AddWithValue(record.Id);
            await using var reader = await cmd.ExecuteReaderAsync(ctx.RequestAborted);
            var slots = new List<string>();
            while (await reader.ReadAsync(ctx.RequestAborted))
                slots.Add(reader.GetDateTime(1).ToString("HH:mm", CultureInfo.InvariantCulture));
            return Results.Ok(slots);
        });
        customer.MapPost("/cancel", async (BookingRevision input, HttpContext ctx) =>
            await ChangeBooking(db, input.Code, input.Revision, null, ctx.RequestAborted));
        customer.MapPost("/reschedule", async (BookingMove input, HttpContext ctx) =>
        {
            if (!TimeOnly.TryParseExact(input.Time, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var time))
                return Results.BadRequest();
            return await ChangeBooking(db, input.Code, input.Revision, input.Day.ToDateTime(time), ctx.RequestAborted);
        });
    }

    static byte[]? ManageHash(string? code)
    {
        if (code is null || code.Length != 64) return null;
        try { return SHA256.HashData(Convert.FromHexString(code)); }
        catch (FormatException) { return null; }
    }

    const string ReadSql = """
        SELECT k.id,b.slug,b.nome,b.address,k.service_id,k.service_name,k.price_in_cents,k.starts_at,
               extract(epoch FROM k.ends_at-k.starts_at)::int/60,
               k.canceled_at IS NOT NULL, k.starts_at <= timezone('America/Sao_Paulo',clock_timestamp()),
               k.starts_at > timezone('America/Sao_Paulo',clock_timestamp()) + $2 * interval '1 hour',k.revision
        FROM booking k JOIN "BarberShop" b ON b.id=k.salon_id WHERE k.manage_hash=$1
        """;

    static async Task<CustomerBooking?> ReadBooking(NpgsqlDataSource db, byte[] hash, CancellationToken ct)
    {
        await using var cmd = db.CreateCommand(ReadSql);
        cmd.Parameters.AddWithValue(hash);
        cmd.Parameters.AddWithValue(ChangeCutoffHours);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return null;
        var starts = r.GetDateTime(7);
        var status = r.GetBoolean(9) ? "cancelled" : r.GetBoolean(10) ? "past" : "upcoming";
        return new CustomerBooking(r.GetGuid(0),r.GetString(1),r.GetString(2),r.GetString(3),r.GetString(4),
            r.GetString(5),r.GetInt32(6),starts.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            starts.ToString("HH:mm", CultureInfo.InvariantCulture),r.GetInt32(8),status,
            status=="upcoming" && r.GetBoolean(11),ChangeCutoffHours,r.GetInt32(12));
    }

    static async Task<IResult> ChangeBooking(NpgsqlDataSource db, string? code, int? revision,
        DateTime? requested, CancellationToken ct)
    {
        var hash = ManageHash(code);
        if (hash is null) return Results.NotFound();
        if (revision is null or < 0) return Results.BadRequest();
        await using var conn = await db.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        // Same gate as new bookings. Competing requests cannot claim a candidate slot mid-move.
        await using var gate = new NpgsqlCommand("""
            SELECT b.slug FROM "BarberShop" b JOIN booking k ON b.id=k.salon_id
            WHERE k.manage_hash=$1 FOR UPDATE OF b
            """, conn, tx);
        gate.Parameters.AddWithValue(hash);
        if (await gate.ExecuteScalarAsync(ct) is not string slug) return Results.NotFound();

        Guid id;
        string serviceId;
        DateTime previous;
        await using (var current = new NpgsqlCommand("""
            SELECT id,service_id,starts_at,
                   canceled_at IS NULL AND starts_at > timezone('America/Sao_Paulo',clock_timestamp()) + $2 * interval '1 hour'
                   ,revision
            FROM booking WHERE manage_hash=$1 FOR UPDATE
            """,conn,tx))
        {
            current.Parameters.AddWithValue(hash);
            current.Parameters.AddWithValue(ChangeCutoffHours);
            await using var r = await current.ExecuteReaderAsync(ct);
            if (!await r.ReadAsync(ct)) return Results.NotFound();
            (id, serviceId, previous) = (r.GetGuid(0),r.GetString(1),r.GetDateTime(2));
            if (!r.GetBoolean(3) || r.GetInt32(4) != revision) return Results.Conflict();
        }
        if (requested is DateTime start)
        {
            if (start == previous) return Results.Conflict();
            await using var change = new NpgsqlCommand("""
                UPDATE booking k SET starts_at=slots.tick,ends_at=slots.tick+(k.ends_at-k.starts_at),revision=k.revision+1
                FROM (
                """ + RescheduleAvailability + """
                ) slots JOIN "BarbershopService" s ON s.id=$2
                WHERE k.id=$4 AND k.canceled_at IS NULL AND slots.tick=$5
                """,conn,tx);
            AddSelection(change,slug,serviceId,DateOnly.FromDateTime(start));
            change.Parameters.AddWithValue(id);
            change.Parameters.AddWithValue(start);
            if (await change.ExecuteNonQueryAsync(ct) != 1) return Results.Conflict();
        }
        else
        {
            await using var cancel = new NpgsqlCommand("UPDATE booking SET canceled_at=now(),revision=revision+1 WHERE id=$1",conn,tx);
            cancel.Parameters.AddWithValue(id);
            if (await cancel.ExecuteNonQueryAsync(ct) != 1) return Results.Conflict();
        }
        await tx.CommitAsync(ct);
        return Results.NoContent();
    }

    static void AddSelection(NpgsqlCommand cmd,string slug,string serviceId,DateOnly day)
    {
        cmd.Parameters.AddWithValue(slug);
        cmd.Parameters.AddWithValue(serviceId);
        cmd.Parameters.AddWithValue(day);
    }
}
record Reservation(string Customer,string ServiceId,DateOnly Day,string Time);

record BookingCode(string? Code);
record BookingDay(string? Code, DateOnly Day);
record BookingRevision(string? Code, int? Revision);
record BookingMove(string? Code, int? Revision, DateOnly Day, string? Time);
record CustomerBooking(Guid Id, string Slug, string Name, string Address, string ServiceId, string Service,
    int PriceInCents, string Day, string Time, int Minutes, string Status, bool CanChange, int ChangeCutoffHours, int Revision);
