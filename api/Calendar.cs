using System.Data;
using System.Globalization;
using Npgsql;

static class Calendar
{
    // Both listing and checkout evaluate exactly the same availability rule.
    const string Availability = """
        SELECT tick FROM "BarberShop" b JOIN "BarbershopService" s ON s."barbershopId"=b.id
        CROSS JOIN LATERAL generate_series($3::date+b.opens,
            $3::date+b.closes-s.minutes*interval '1 minute',interval '15 minutes') tick
        WHERE b.slug=$1 AND s.id=$2 AND extract(isodow FROM $3::date)::int=ANY(b.workdays)
          AND tick > timezone('America/Sao_Paulo',now())
          AND $3::date <= timezone('America/Sao_Paulo',now())::date+90
          AND NOT EXISTS (SELECT FROM booking k WHERE k.salon_id=b.id
              AND k.starts_at < tick+s.minutes*interval '1 minute' AND k.ends_at > tick)
        """;

    public static void Map(RouteGroupBuilder salon, NpgsqlDataSource db)
    {
        salon.MapGet("/slots", async (string slug,string serviceId,DateOnly day) =>
        {
            await using var cmd=db.CreateCommand(Availability+" ORDER BY tick");
            AddSelection(cmd,slug,serviceId,day);
            await using var reader=await cmd.ExecuteReaderAsync();
            var slots=new List<string>();
            while(await reader.ReadAsync()) slots.Add(reader.GetDateTime(0).ToString("HH:mm",CultureInfo.InvariantCulture));
            return slots;
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
                """ + Availability + """

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
