using System.Data;
using System.Globalization;
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
        JOIN "BarbershopService" s ON s."barbershopId"=b.id AND s.id=$2
        CROSS JOIN LATERAL generate_series(d.day+b.opens,
            d.day+b.closes-s.minutes*interval '1 minute',interval '15 minutes') tick
        WHERE extract(isodow FROM d.day)::int=ANY(b.workdays)
          AND d.day BETWEEN timezone('America/Sao_Paulo',now())::date
                        AND timezone('America/Sao_Paulo',now())::date+90
          AND tick > timezone('America/Sao_Paulo',now())
          AND NOT EXISTS (SELECT FROM booking k WHERE k.salon_id=b.id
              AND k.starts_at < tick+s.minutes*interval '1 minute' AND k.ends_at > tick)
        """;
    const string DailyAvailability = "WITH requested_days AS (" + Day + ") " + SlotRules;
    const string PeriodAvailability = "WITH requested_days AS (" + Period +
        "), available AS (" + SlotRules + ") SELECT DISTINCT day FROM available ORDER BY day";

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
            await using var insert=new NpgsqlCommand("""
                INSERT INTO booking(id,salon_id,service_name,customer,starts_at,ends_at)
                SELECT $4,$5,s.nome,$6,tick,tick+s.minutes*interval '1 minute'
                FROM (
                """ + DailyAvailability + """

                ) slots JOIN "BarbershopService" s ON s.id=$2
                WHERE tick=$7
                """,conn,tx);
            AddSelection(insert,slug,input.ServiceId,input.Day);
            insert.Parameters.AddWithValue(Guid.NewGuid());
            insert.Parameters.AddWithValue(salonId);
            insert.Parameters.AddWithValue(input.Customer.Trim());
            insert.Parameters.AddWithValue(input.Day.ToDateTime(time));
            if(await insert.ExecuteNonQueryAsync()!=1) return Results.Conflict();
            await tx.CommitAsync();
            return Results.Ok(new { time=input.Time, day=input.Day });
        });
    }
    static void AddSelection(NpgsqlCommand cmd,string slug,string serviceId,DateOnly day)
    {
        cmd.Parameters.AddWithValue(slug);
        cmd.Parameters.AddWithValue(serviceId);
        cmd.Parameters.AddWithValue(day);
    }
}
record Reservation(string Customer,string ServiceId,DateOnly Day,string Time);
