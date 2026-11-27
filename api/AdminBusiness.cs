using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

static class AdminBusiness
{
    static string SalonId(HttpContext ctx) => ctx.User.FindFirstValue("salon_id")!;
    static bool ValidCustomer(string? customer) => !string.IsNullOrWhiteSpace(customer) && customer.Length<=100;
    static bool ValidService(string? service) => !string.IsNullOrWhiteSpace(service) && service.Length<=200;
    static string? GetTime(NpgsqlDataReader r,int index) => r.IsDBNull(index) ? null : r.GetString(index);
    static int? GetMoney(NpgsqlDataReader r,int index) => r.IsDBNull(index)?null:r.GetInt32(index);
    static void Add(NpgsqlCommand cmd, params object[] values)
    {
        foreach (var value in values) cmd.Parameters.AddWithValue(value);
    }
    static void Nullable(NpgsqlCommand cmd,NpgsqlDbType type,object? value) =>
        cmd.Parameters.Add(AdminSettings.NullableParameter(type,value));

    public static void Map(RouteGroupBuilder admin,NpgsqlDataSource db)
    {
        admin.MapGet("/today", async (HttpContext ctx) =>
        {
            await using var cmd=db.CreateCommand("""
                WITH local_now AS (SELECT timezone('America/Sao_Paulo',statement_timestamp()) AS value),
                next_visit AS (
                    SELECT id,customer,service_name,starts_at FROM booking,local_now WHERE salon_id=$1
                      AND canceled_at IS NULL AND outcome='scheduled' AND starts_at>=local_now.value
                      AND starts_at<local_now.value::date+1 ORDER BY starts_at,id LIMIT 1
                ), tasks AS (
                    SELECT id,customer,service_name,starts_at,outcome,
                        CASE WHEN outcome='completed' THEN amount_due_cents-coalesce(paid_cents,0) END AS balance
                    FROM booking,local_now WHERE salon_id=$1 AND canceled_at IS NULL AND ends_at<=local_now.value
                      AND (outcome='scheduled' OR (outcome='completed' AND amount_due_cents>coalesce(paid_cents,0)))
                ), visible AS (
                    SELECT id,customer,service_name,starts_at,outcome,balance FROM tasks
                    ORDER BY starts_at DESC,id LIMIT 6
                )
                SELECT jsonb_build_object(
                    'day',(SELECT value::date FROM local_now),
                    'next',(SELECT jsonb_build_object('id',id,'customer',customer,'service',service_name,'time',to_char(starts_at,'HH24:MI')) FROM next_visit),
                    'tasks',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'customer',customer,'service',service_name,
                         'day',starts_at::date,'time',to_char(starts_at,'HH24:MI'),'balanceCents',balance,
                         'kind',CASE WHEN outcome='scheduled' THEN 'review' ELSE 'payment' END) ORDER BY starts_at DESC,id),'[]'::jsonb) FROM visible),
                    'reviewCount',count(*) FILTER (WHERE outcome='scheduled'),
                    'paymentCount',count(*) FILTER (WHERE outcome='completed'),
                    'pendingCents',coalesce(sum(balance),0)
                )::text FROM tasks
                """);
            Add(cmd,SalonId(ctx));
            return Results.Ok(JsonSerializer.Deserialize<JsonElement>((string)(await cmd.ExecuteScalarAsync(ctx.RequestAborted))!));
        });
        admin.MapGet("/bookings", async (DateOnly day, bool? includeCanceled, HttpContext ctx) =>
        {
            if (day.Year is <2000 or >2100) return Results.BadRequest();
            await using var cmd = db.CreateCommand("""
                SELECT id,customer,service_name,to_char(starts_at,'HH24:MI'),
                       origin,CASE WHEN canceled_at IS NOT NULL THEN 'cancelled' ELSE outcome END,
                       price_in_cents,amount_due_cents,paid_cents,direct_cost_cents,
                       (SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'amountCents',p.amount_cents,'paidOn',p.paid_on)
                           ORDER BY p.paid_on DESC,p.id),'[]'::jsonb)::text FROM salon_payment p WHERE p.booking_id=booking.id),
                       ends_at <= timezone('America/Sao_Paulo',clock_timestamp()), revision,
                       starts_at > timezone('America/Sao_Paulo',clock_timestamp())
                FROM booking
                WHERE salon_id=$1 AND starts_at >= $2::date AND starts_at < $2::date+1
                  AND ($3 OR canceled_at IS NULL) ORDER BY starts_at,id
                """);
            Add(cmd,SalonId(ctx),day,includeCanceled==true);
            await using var r=await cmd.ExecuteReaderAsync(ctx.RequestAborted);
            var items=new List<object>();
            while(await r.ReadAsync(ctx.RequestAborted)) items.Add(new {
                id=r.GetGuid(0),customer=r.GetString(1),service=r.GetString(2),time=r.GetString(3),
                origin=r.GetString(4),status=r.GetString(5),priceInCents=GetMoney(r,6),amountDueCents=GetMoney(r,7),
                paidCents=GetMoney(r,8),directCostCents=GetMoney(r,9),payments=JsonSerializer.Deserialize<JsonElement>(r.GetString(10)),ended=r.GetBoolean(11),
                revision=r.GetInt32(12),canMove=r.GetBoolean(13)
            });
            return Results.Ok(items);
        });
        admin.MapGet("/slots", async (string slug,string serviceId,DateOnly day,HttpContext ctx) =>
        {
            if (!ValidService(serviceId) || day.Year is <2000 or >2100) return Results.BadRequest();
            await using var cmd=db.CreateCommand(Calendar.OwnerDailyAvailability + " ORDER BY tick");
            Calendar.AddSelection(cmd,slug,serviceId,day);
            var times=new List<string>();
            await using var r=await cmd.ExecuteReaderAsync(ctx.RequestAborted);
            while (await r.ReadAsync(ctx.RequestAborted)) times.Add(r.GetDateTime(1).ToString("HH:mm",CultureInfo.InvariantCulture));
            return Results.Ok(times);
        });
        admin.MapPost("/bookings", (string slug, ManualBooking input, HttpContext ctx) => Create(db,slug,input,ctx));
        admin.MapGet("/bookings/{id:guid}/slots", async (string slug, Guid id, DateOnly day, HttpContext ctx) =>
        {
            if (day.Year is <2000 or >2100) return Results.BadRequest();
            await using var cmd=db.CreateCommand(Calendar.OwnerRescheduleAvailability + " ORDER BY tick");
            Add(cmd,slug,SalonId(ctx),day,id);
            var values=new List<string>();
            await using var r=await cmd.ExecuteReaderAsync(ctx.RequestAborted);
            while (await r.ReadAsync(ctx.RequestAborted)) values.Add(r.GetDateTime(1).ToString("HH:mm",CultureInfo.InvariantCulture));
            return Results.Ok(values);
        });
        admin.MapPost("/bookings/{id:guid}/move", (string slug, Guid id, AdminMove input, HttpContext ctx) => Move(db,slug,id,input,ctx));
        admin.MapPost("/bookings/{id:guid}/cancel", async (Guid id, AdminRevision input, HttpContext ctx) =>
        {
            await using var cmd=db.CreateCommand("""
                UPDATE booking SET canceled_at=now(),revision=revision+1 WHERE salon_id=$1 AND id=$2
                    AND canceled_at IS NULL AND outcome='scheduled' AND ($3::int IS NULL OR revision=$3)
                    AND ends_at > timezone('America/Sao_Paulo',clock_timestamp())
                """);
            Add(cmd,SalonId(ctx),id);
            Nullable(cmd,NpgsqlDbType.Integer,input.Revision);
            return await cmd.ExecuteNonQueryAsync(ctx.RequestAborted)==1 ? Results.NoContent() : Results.NotFound();
        });
        admin.MapPost("/bookings/{id:guid}/outcome", async (Guid id, AdminOutcome input, HttpContext ctx) =>
        {
            if (input.Outcome is not ("completed" or "no_show") || input.Revision is null or <0 ||
                (input.Outcome=="completed" && input.AmountDueCents is not (>=0 and <=10_000_000)) ||
                (input.Outcome=="no_show" && input.AmountDueCents is not null) ||
                input.DirectCostCents is <0 or >10_000_000 || (input.Outcome=="no_show" && input.DirectCostCents is not null))
                return Results.BadRequest();
            await using var cmd=db.CreateCommand("""
                UPDATE booking SET outcome=$3,amount_due_cents=$4,direct_cost_cents=$5,revision=revision+1
                WHERE salon_id=$1 AND id=$2 AND canceled_at IS NULL AND revision=$6
                  AND ends_at<=timezone('America/Sao_Paulo',clock_timestamp())
                  AND (outcome='scheduled' OR (outcome='completed' AND $3='completed' AND coalesce(paid_cents,0)<=$4))
                """);
            Add(cmd,SalonId(ctx),id,input.Outcome);
            Nullable(cmd,NpgsqlDbType.Integer,input.AmountDueCents);
            Nullable(cmd,NpgsqlDbType.Integer,input.DirectCostCents);
            Add(cmd,input.Revision.Value);
            return await cmd.ExecuteNonQueryAsync(ctx.RequestAborted)==1 ? Results.NoContent() : Results.Conflict();
        });
        admin.MapPost("/bookings/{id:guid}/payment", async (Guid id, AdminPayment input, HttpContext ctx) =>
        {
            if (input.AmountCents is not (>=1 and <=10_000_000) || input.Revision is null or <0 ||
                input.PaidOn is not DateOnly on || on.Year is <2000 or >2100) return Results.BadRequest();
            await using var cmd=db.CreateCommand("""
                WITH updated AS (
                    UPDATE booking SET paid_cents=coalesce(paid_cents,0)+$3,revision=revision+1
                    WHERE salon_id=$1 AND id=$2 AND outcome='completed' AND canceled_at IS NULL
                      AND revision=$5 AND coalesce(paid_cents,0)+$3<=amount_due_cents
                      AND $4::date BETWEEN starts_at::date AND timezone('America/Sao_Paulo',clock_timestamp())::date
                    RETURNING id
                ) INSERT INTO salon_payment(id,booking_id,amount_cents,paid_on) SELECT $6,id,$3,$4 FROM updated
                """);
            Add(cmd,SalonId(ctx),id,input.AmountCents.Value,on,input.Revision.Value,Guid.NewGuid());
            return await cmd.ExecuteNonQueryAsync(ctx.RequestAborted)==1 ? Results.NoContent() : Results.Conflict();
        });
        admin.MapPost("/bookings/{id:guid}/payment/{paymentId:guid}/remove", async (Guid id, Guid paymentId, AdminRevision input, HttpContext ctx) =>
        {
            if (input.Revision is null or <0) return Results.BadRequest();
            await using var cmd=db.CreateCommand("""
                WITH updated AS (
                    UPDATE booking k SET paid_cents=k.paid_cents-p.amount_cents,revision=k.revision+1
                    FROM salon_payment p WHERE k.salon_id=$1 AND k.id=$2 AND k.revision=$4 AND k.outcome='completed'
                       AND p.booking_id=k.id AND p.id=$3
                    RETURNING p.id
                ) DELETE FROM salon_payment p USING updated u WHERE p.id=u.id
                """);
            Add(cmd,SalonId(ctx),id,paymentId,input.Revision.Value);
            return await cmd.ExecuteNonQueryAsync(ctx.RequestAborted)==1 ? Results.NoContent() : Results.Conflict();
        });

        admin.MapGet("/waitlist", async (HttpContext ctx) =>
        {
            await using var cmd=db.CreateCommand("""
                SELECT w.id,w.customer,w.phone,w.service_id,s.nome,w.day,to_char(w.preferred_time::interval,'HH24:MI'),s.active
                FROM salon_waitlist w JOIN "BarbershopService" s ON s.id=w.service_id AND s."barbershopId"=w.salon_id
                WHERE w.salon_id=$1 AND w.closed_at IS NULL AND w.day>=timezone('America/Sao_Paulo',now())::date
                ORDER BY w.day,w.created_at,w.id
                """);
            Add(cmd,SalonId(ctx));
            await using var r=await cmd.ExecuteReaderAsync(ctx.RequestAborted);
            var items=new List<object>();
            while(await r.ReadAsync(ctx.RequestAborted)) items.Add(new {
                id=r.GetGuid(0),customer=r.GetString(1),phone=r.GetString(2),serviceId=r.GetString(3),service=r.GetString(4),
                day=r.GetFieldValue<DateOnly>(5),preferredTime=GetTime(r,6),active=r.GetBoolean(7)
            });
            return Results.Ok(items);
        });
        admin.MapPost("/waitlist", async (WaitRequest input,HttpContext ctx) =>
        {
            if (!ValidCustomer(input.Customer) || !ValidService(input.ServiceId) ||
                AdminSettings.NormalizePhone(input.Phone) is not string phone || input.Day.Year is <2000 or >2100)
                return Results.BadRequest();
            TimeOnly? preferred=null;
            if (!string.IsNullOrEmpty(input.PreferredTime))
            {
                if (!AdminSettings.TryTime(input.PreferredTime,out var parsed)) return Results.BadRequest();
                preferred=parsed;
            }
            await using var cmd=db.CreateCommand("""
                INSERT INTO salon_waitlist(id,salon_id,customer,phone,service_id,day,preferred_time)
                SELECT $2,$1,$3,$4,s.id,$6,$7 FROM "BarbershopService" s
                WHERE s.id=$5 AND s."barbershopId"=$1 AND s.active
                  AND $6::date BETWEEN timezone('America/Sao_Paulo',now())::date AND timezone('America/Sao_Paulo',now())::date+90
                """);
            Add(cmd,SalonId(ctx),Guid.NewGuid(),input.Customer!.Trim(),phone,input.ServiceId!,input.Day);
            Nullable(cmd,NpgsqlDbType.Time,preferred);
            return await cmd.ExecuteNonQueryAsync(ctx.RequestAborted)==1 ? Results.NoContent() : Results.BadRequest();
        });
        admin.MapPost("/waitlist/{id:guid}/close", async (Guid id,HttpContext ctx) =>
        {
            await using var cmd=db.CreateCommand("""
                UPDATE salon_waitlist SET closed_at=now() WHERE salon_id=$1 AND id=$2 AND closed_at IS NULL
                """);
            Add(cmd,SalonId(ctx),id);
            return await cmd.ExecuteNonQueryAsync(ctx.RequestAborted)==1 ? Results.NoContent() : Results.NotFound();
        });
        admin.MapGet("/summary", (DateOnly month, HttpContext ctx) => Summary(db,month,ctx));
        admin.MapPost("/summary/monthly-cost", async (MonthlyCost input,HttpContext ctx) =>
        {
            if (!ValidMonth(input.Month) || input.AmountCents is not (>=0 and <=100_000_000)) return Results.BadRequest();
            await using var cmd=db.CreateCommand("""
                INSERT INTO salon_monthly_cost(salon_id,month,amount_cents) VALUES ($1,$2,$3)
                ON CONFLICT (salon_id,month) DO UPDATE SET amount_cents=EXCLUDED.amount_cents
                """);
            Add(cmd,SalonId(ctx),input.Month,input.AmountCents.Value);
            await cmd.ExecuteNonQueryAsync(ctx.RequestAborted);
            return Results.NoContent();
        });
    }

    static async Task<IResult> Create(NpgsqlDataSource db,string slug,ManualBooking input,HttpContext ctx)
    {
        if (!ValidCustomer(input.Customer) || !ValidService(input.ServiceId) ||
            input.Day.Year is <2000 or >2100 || !AdminSettings.TryTime(input.Time,out var time) ||
            (input.WaitId is null && input.Origin is not ("whatsapp" or "phone" or "in_person")))
            return Results.BadRequest();
        var salonId=SalonId(ctx);
        var ct=ctx.RequestAborted;
        await using var conn=await db.OpenConnectionAsync(ct);
        await using var tx=await conn.BeginTransactionAsync(ct);
        if (!await AdminSettings.LockSalon(conn,tx,salonId,ct)) return Results.NotFound();
        var id=Guid.NewGuid();
        var customer=input.Customer!.Trim();
        var phone=AdminSettings.NormalizePhone(input.Phone);
        if (!string.IsNullOrWhiteSpace(input.Phone) && phone is null) return Results.BadRequest();
        if (input.WaitId is Guid waitId)
        {
            await using var pending=new NpgsqlCommand("""
                SELECT customer,phone FROM salon_waitlist WHERE id=$1 AND salon_id=$2 AND service_id=$3 AND day=$4
                  AND (preferred_time IS NULL OR preferred_time=$5) AND closed_at IS NULL FOR UPDATE
                """,conn,tx);
            Add(pending,waitId,salonId,input.ServiceId!,input.Day,time);
            await using var entry=await pending.ExecuteReaderAsync(ct);
            if (!await entry.ReadAsync(ct)) return Results.Conflict();
            (customer,phone)=(entry.GetString(0),entry.GetString(1));
        }
        await using var insert=new NpgsqlCommand("""
            INSERT INTO booking(id,salon_id,service_name,customer,starts_at,ends_at,service_id,price_in_cents,origin,customer_phone)
            SELECT $4,$5,s.nome,$6,tick,tick+s.minutes*interval '1 minute',s.id,s."priceInCents",$8,$9
            FROM (
            """ + Calendar.OwnerDailyAvailability + """
            ) slots JOIN "BarbershopService" s ON s.id=$2 AND s."barbershopId"=$5 AND s.active
            WHERE tick=$7
            """,conn,tx);
        Add(insert,slug,input.ServiceId!,input.Day,id,salonId,customer,input.Day.ToDateTime(time),
            input.WaitId is null ? input.Origin! : "waitlist");
        Nullable(insert,NpgsqlDbType.Text,phone);
        if (await insert.ExecuteNonQueryAsync(ct)!=1) return Results.Conflict();
        if (input.WaitId is Guid fulfilled)
        {
            await using var close=new NpgsqlCommand("UPDATE salon_waitlist SET closed_at=now(),booking_id=$3 WHERE salon_id=$1 AND id=$2",conn,tx);
            Add(close,salonId,fulfilled,id);
            await close.ExecuteNonQueryAsync(ct);
        }
        await tx.CommitAsync(ct);
        return Results.Ok(new { id });
    }

    static async Task<IResult> Move(NpgsqlDataSource db,string slug,Guid id,AdminMove input,HttpContext ctx)
    {
        if (input.Day.Year is <2000 or >2100 || !AdminSettings.TryTime(input.Time,out var time)
            || input.Revision is null or <0) return Results.BadRequest();
        var ct=ctx.RequestAborted;
        var salonId=SalonId(ctx);
        await using var conn=await db.OpenConnectionAsync(ct);
        await using var tx=await conn.BeginTransactionAsync(ct);
        if (!await AdminSettings.LockSalon(conn,tx,salonId,ct)) return Results.NotFound();
        await using var move=new NpgsqlCommand("""
            UPDATE booking k SET starts_at=tick,ends_at=tick+(k.ends_at-k.starts_at),revision=k.revision+1
            FROM (
            """ + Calendar.OwnerRescheduleAvailability + """
            ) slots
            WHERE k.id=$4 AND k.salon_id=$2 AND k.revision=$6 AND k.canceled_at IS NULL AND k.outcome='scheduled' AND tick=$5 AND tick<>k.starts_at
            """,conn,tx);
        Add(move,slug,salonId,input.Day,id,input.Day.ToDateTime(time),input.Revision.Value);
        if (await move.ExecuteNonQueryAsync(ct)!=1) return Results.Conflict();
        await tx.CommitAsync(ct);
        return Results.NoContent();
    }

    static bool ValidMonth(DateOnly month) => month.Year is >=2000 and <=2100 && month.Day==1;

    static async Task<IResult> Summary(NpgsqlDataSource db,DateOnly month,HttpContext ctx)
    {
        if (!ValidMonth(month)) return Results.BadRequest();
        await using var cmd=db.CreateCommand("""
            WITH month_bookings AS (
                SELECT * FROM booking WHERE salon_id=$1 AND starts_at >= $2::date AND starts_at < $3::date
            ), service_stats AS (
                SELECT service_id, CASE WHEN count(DISTINCT service_name)>1 THEN (array_agg(service_name ORDER BY starts_at DESC,id))[1] ELSE min(service_name) END AS name,
                    count(*) AS requested,
                    count(*) FILTER (WHERE canceled_at IS NULL AND outcome='completed') AS completed,
                    count(*) FILTER (WHERE canceled_at IS NULL AND outcome='completed' AND direct_cost_cents IS NULL) AS missing,
                    COALESCE(sum(amount_due_cents-direct_cost_cents) FILTER (WHERE canceled_at IS NULL AND outcome='completed'),0) AS margin,
                    COALESCE(sum(extract(epoch FROM ends_at-starts_at)/60) FILTER (WHERE canceled_at IS NULL AND outcome='completed'),0) AS minutes
                FROM month_bookings GROUP BY service_id,CASE WHEN service_id IS NULL THEN service_name END
            ), first_visits AS (
                SELECT DISTINCT customer_phone FROM month_bookings
                WHERE customer_phone IS NOT NULL AND canceled_at IS NULL AND outcome='completed'
            ), client_stats AS (
                SELECT count(*) AS tracked,count(*) FILTER (WHERE EXISTS (
                    SELECT FROM booking h WHERE h.salon_id=$1 AND h.customer_phone=c.customer_phone
                    AND h.starts_at<$2::date AND h.canceled_at IS NULL AND h.outcome='completed')) AS returning_count
                FROM first_visits c
            ), origins AS (
                SELECT origin,count(*) AS total FROM month_bookings GROUP BY origin
            ), hours AS (
                SELECT extract(isodow FROM starts_at)::int AS weekday,extract(hour FROM starts_at)::int AS hour,count(*) AS total
                FROM month_bookings WHERE canceled_at IS NULL AND outcome<>'no_show'
                GROUP BY 1,2 ORDER BY total DESC,1,2 LIMIT 8
            ), today AS (SELECT timezone('America/Sao_Paulo',clock_timestamp())::date AS day),
            week AS (SELECT day-extract(isodow FROM day)::int+1 AS starts FROM today),
            windows AS (
                SELECT d.day::date AS day,b.id,d.day+COALESCE(h.opens,b.opens) AS opens,
                    d.day+COALESCE(h.closes,b.closes) AS closes,
                    CASE WHEN h.day IS NULL THEN d.day+b.break_start END AS break_start,
                    CASE WHEN h.day IS NULL THEN d.day+b.break_end END AS break_end
                FROM "BarberShop" b CROSS JOIN generate_series($2::date::timestamp,($3::date-1)::timestamp,interval '1 day') AS d(day)
                LEFT JOIN salon_day_hours h ON h.salon_id=b.id AND h.day=d.day::date
                WHERE b.id=$1 AND (h.day IS NOT NULL OR extract(isodow FROM d.day)::smallint=ANY(b.workdays))
                    AND NOT EXISTS (SELECT FROM salon_blocked_day bd WHERE bd.salon_id=$1 AND bd.day=d.day::date)
            ), minute_status AS (
                SELECT tick, EXISTS (SELECT FROM month_bookings k
                    WHERE k.canceled_at IS NULL AND k.outcome<>'no_show' AND k.starts_at<tick+interval '1 minute' AND k.ends_at>tick) AS occupied
                FROM windows w CROSS JOIN LATERAL generate_series(w.opens,w.closes-interval '1 minute',interval '1 minute') minutes(tick)
                WHERE (w.break_start IS NULL OR tick<w.break_start OR tick>=w.break_end)
                  AND NOT EXISTS (SELECT FROM salon_time_block x WHERE x.salon_id=w.id AND x.day=w.day AND tick>=w.day+x.starts AND tick<w.day+x.ends)
            ), capacity AS (
                SELECT count(*) AS minutes,count(*) FILTER (WHERE occupied) AS occupied FROM minute_status
            ), idle AS (
                SELECT extract(isodow FROM tick)::int AS weekday,extract(hour FROM tick)::int AS hour,count(*) AS free
                FROM minute_status WHERE NOT occupied GROUP BY 1,2 ORDER BY free DESC,1,2 LIMIT 4
            )
            SELECT jsonb_build_object(
                'receivedCents',(SELECT coalesce(sum(p.amount_cents),0) FROM booking k JOIN salon_payment p ON p.booking_id=k.id WHERE k.salon_id=$1 AND p.paid_on >= $2 AND p.paid_on < $3),
                'pendingCents',COALESCE(sum(amount_due_cents-coalesce(paid_cents,0)) FILTER (WHERE canceled_at IS NULL AND outcome='completed'),0),
                'forecastCents',COALESCE(sum(price_in_cents) FILTER (WHERE canceled_at IS NULL AND outcome='scheduled' AND starts_at>timezone('America/Sao_Paulo',clock_timestamp())),0),
                'completedRevenueCents',COALESCE(sum(amount_due_cents) FILTER (WHERE canceled_at IS NULL AND outcome='completed'),0),
                'directCostsCents',COALESCE(sum(direct_cost_cents) FILTER (WHERE canceled_at IS NULL AND outcome='completed'),0),
                'missingCosts',count(*) FILTER (WHERE canceled_at IS NULL AND outcome='completed' AND direct_cost_cents IS NULL),
                'fixedCostsCents',(SELECT amount_cents FROM salon_monthly_cost WHERE salon_id=$1 AND month=$2),
                'availableMinutes',(SELECT minutes FROM capacity),
                'bookedMinutes',(SELECT occupied FROM capacity),
                'cancelledWeek',(SELECT count(*) FROM booking k WHERE k.salon_id=$1 AND k.canceled_at IS NOT NULL
                    AND k.starts_at >= (SELECT starts FROM week) AND k.starts_at < (SELECT starts+7 FROM week)),
                'noShows',count(*) FILTER (WHERE canceled_at IS NULL AND outcome='no_show'),
                'cancelled',count(*) FILTER (WHERE canceled_at IS NOT NULL),
                'services',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',name,'requested',requested,
                    'completed',completed,'marginPerHourCents',CASE WHEN missing=0 AND minutes>0 THEN round(margin*60/minutes) END)
                    ORDER BY requested DESC,name,service_id),'[]'::jsonb) FROM service_stats),
                'knownClients',(SELECT tracked FROM client_stats),
                'returningClients',(SELECT returning_count FROM client_stats),
                'unidentifiedVisits',count(*) FILTER (WHERE canceled_at IS NULL AND outcome='completed' AND customer_phone IS NULL),
                'origins',(SELECT coalesce(jsonb_object_agg(origin,total),'{}'::jsonb) FROM origins),
                'idleHours',(SELECT coalesce(jsonb_agg(idle ORDER BY free DESC,weekday,hour),'[]'::jsonb) FROM idle),
                'busyHours',(SELECT coalesce(jsonb_agg(hours ORDER BY total DESC,weekday,hour),'[]'::jsonb) FROM hours),
                'recoveredWeek',(SELECT count(*) FROM salon_waitlist w JOIN booking k ON k.id=w.booking_id
                    WHERE w.salon_id=$1 AND k.salon_id=$1 AND k.canceled_at IS NULL AND k.outcome<>'no_show'
                    AND k.starts_at >= (SELECT starts FROM week) AND k.starts_at < (SELECT starts+7 FROM week))
            )::text FROM month_bookings
            """);
        Add(cmd,SalonId(ctx),month,month.AddMonths(1));
        return Results.Ok(JsonSerializer.Deserialize<JsonElement>((string)(await cmd.ExecuteScalarAsync(ctx.RequestAborted))!));
    }
}

record ManualBooking(string? ServiceId,DateOnly Day,string? Time,string? Customer,string? Origin,Guid? WaitId,string? Phone);
record AdminRevision(int? Revision);
record AdminMove(DateOnly Day,string? Time,int? Revision);
record AdminOutcome(string? Outcome,int? AmountDueCents,int? DirectCostCents,int? Revision);
record AdminPayment(int? AmountCents,DateOnly? PaidOn,int? Revision);
record WaitRequest(string? ServiceId,DateOnly Day,string? PreferredTime,string? Customer,string? Phone);
record MonthlyCost(DateOnly Month,int? AmountCents);
