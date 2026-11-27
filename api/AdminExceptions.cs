using System.Security.Claims;
using System.Text.Json;
using Npgsql;

static class AdminExceptions
{
    static string Salon(HttpContext ctx) => ctx.User.FindFirstValue("salon_id")!;
    static void Add(NpgsqlCommand cmd,params object[] args)
    {
        foreach(var arg in args) cmd.Parameters.AddWithValue(arg);
    }
    public static void Map(RouteGroupBuilder admin,NpgsqlDataSource db)
    {
        admin.MapGet("/exceptions", async (HttpContext ctx) =>
        {
            await using var cmd=db.CreateCommand("""
                SELECT jsonb_build_object('leadMinutes',b.lead_minutes,'cutoffHours',b.cutoff_hours,'bufferMinutes',b.buffer_minutes,
                    'hours',coalesce((SELECT jsonb_agg(jsonb_build_object('day',h.day,
                    'start',to_char(h.opens::interval,'HH24:MI'),'end',to_char(h.closes::interval,'HH24:MI')) ORDER BY h.day)
                    FROM salon_day_hours h WHERE h.salon_id=b.id AND h.day>=timezone('America/Sao_Paulo',now())::date),'[]'::jsonb),
                    'blocks',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'day',x.day,'note',x.note,
                    'start',to_char(x.starts::interval,'HH24:MI'),'end',to_char(x.ends::interval,'HH24:MI')) ORDER BY x.day,x.starts,x.id)
                    FROM salon_time_block x WHERE x.salon_id=b.id AND x.day>=timezone('America/Sao_Paulo',now())::date),'[]'::jsonb))::text
                FROM "BarberShop" b WHERE b.id=$1
                """);
            Add(cmd,Salon(ctx));
            var value=await cmd.ExecuteScalarAsync(ctx.RequestAborted) as string;
            return value is null?Results.NotFound():Results.Ok(JsonSerializer.Deserialize<JsonElement>(value));
        });
        admin.MapPost("/rules", async (BookingRules input,HttpContext ctx) =>
        {
            if (input.LeadMinutes is not (>=0 and <=10080) || input.CutoffHours is not (>=0 and <=168)
             || input.BufferMinutes is not (>=0 and <=120)) return Results.BadRequest();
            await using var cmd=db.CreateCommand("""
                UPDATE "BarberShop" SET lead_minutes=$2,cutoff_hours=$3,buffer_minutes=$4 WHERE id=$1
                """);
            Add(cmd,Salon(ctx),input.LeadMinutes.Value,input.CutoffHours.Value,input.BufferMinutes.Value);
            return await cmd.ExecuteNonQueryAsync(ctx.RequestAborted)==1?Results.NoContent():Results.NotFound();
        });
        admin.MapPost("/special-hours", (ScheduleException input,HttpContext ctx) => Save(db,input,ctx,"hours"));
        admin.MapPost("/special-hours/remove", (ScheduleException input,HttpContext ctx) => Save(db,input,ctx,"remove"));
        admin.MapPost("/time-blocks", (ScheduleException input,HttpContext ctx) => Save(db,input,ctx,"block"));
        admin.MapPost("/time-blocks/{id:guid}/remove", async (Guid id,HttpContext ctx) =>
        {
            await using var cmd=db.CreateCommand("DELETE FROM salon_time_block WHERE salon_id=$1 AND id=$2");
            Add(cmd,Salon(ctx),id);
            return await cmd.ExecuteNonQueryAsync(ctx.RequestAborted)==1?Results.NoContent():Results.NotFound();
        });
    }

    static async Task<IResult> Save(NpgsqlDataSource db,ScheduleException input,HttpContext ctx,string action)
    {
        TimeOnly start=default,end=default;
        if (input.Day.Year is <2000 or >2100 || (input.Note?.Length ?? 0)>160 ||
            (action!="remove" && (!AdminSettings.TryTime(input.Start,out start)
                || !AdminSettings.TryTime(input.End,out end) || start>=end))) return Results.BadRequest();
        var ct=ctx.RequestAborted;
        var salon=Salon(ctx);
        await using var conn=await db.OpenConnectionAsync(ct);
        await using var tx=await conn.BeginTransactionAsync(ct);
        if (!await AdminSettings.LockSalon(conn,tx,salon,ct)) return Results.NotFound();
        await using var guard=new NpgsqlCommand("""
            SELECT $2::date BETWEEN timezone('America/Sao_Paulo',now())::date AND timezone('America/Sao_Paulo',now())::date+365,
                EXISTS (SELECT FROM salon_blocked_day WHERE salon_id=$1 AND day=$2),
                EXISTS (SELECT FROM booking k WHERE k.salon_id=$1 AND k.starts_at >= $2::date AND k.starts_at < $2::date+1
                    AND k.canceled_at IS NULL AND k.outcome='scheduled' AND k.ends_at > timezone('America/Sao_Paulo',clock_timestamp())
                    AND CASE $3
                        WHEN 'block' THEN k.starts_at < $2::date+$5 AND k.ends_at > $2::date+$4
                        WHEN 'hours' THEN k.starts_at < $2::date+$4 OR k.ends_at > $2::date+$5
                        ELSE NOT (extract(isodow FROM $2::date)::smallint=ANY(b.workdays)) OR
                             k.starts_at < $2::date+b.opens OR k.ends_at > $2::date+b.closes OR
                             (b.break_start IS NOT NULL AND k.starts_at < $2::date+b.break_end AND k.ends_at > $2::date+b.break_start)
                    END)
            FROM "BarberShop" b WHERE b.id=$1
            """,conn,tx);
        Add(guard,salon,input.Day,action,start,end);
        await using(var r=await guard.ExecuteReaderAsync(ct))
        {
            if (!await r.ReadAsync(ct)) return Results.NotFound();
            if (!r.GetBoolean(0)) return Results.BadRequest();
            if ((action=="hours" && r.GetBoolean(1)) || r.GetBoolean(2)) return Results.Conflict();
        }
        await using var cmd=new NpgsqlCommand(action switch
        {
            "block" => "INSERT INTO salon_time_block(salon_id,day,starts,ends,id,note) VALUES ($1,$2,$3,$4,$5,$6)",
            "hours" => """
                INSERT INTO salon_day_hours(salon_id,day,opens,closes) VALUES ($1,$2,$3,$4)
                ON CONFLICT (salon_id,day) DO UPDATE SET opens=EXCLUDED.opens,closes=EXCLUDED.closes
                """,
            _ => "DELETE FROM salon_day_hours WHERE salon_id=$1 AND day=$2"
        },conn,tx);
        Add(cmd,salon,input.Day);
        if (action!="remove") Add(cmd,start,end);
        if (action=="block") Add(cmd,Guid.NewGuid(),input.Note?.Trim() ?? "");
        await cmd.ExecuteNonQueryAsync(ct);
        await tx.CommitAsync(ct);
        return Results.NoContent();
    }
}

record BookingRules(int? LeadMinutes,int? CutoffHours,int? BufferMinutes);
record ScheduleException(DateOnly Day,string? Start,string? End,string? Note);
