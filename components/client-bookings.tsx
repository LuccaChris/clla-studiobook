"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { bookingAction, bookingDate, bookingLink, type ClientBooking, parseCodes, readCodes, subscribeCodes } from "@/lib/client-bookings";

const empty = () => "[]";

export default function ClientBookings({ compact = false }: { compact?: boolean }) {
  const saved = useSyncExternalStore(subscribeCodes, readCodes, empty);
  const [response, setResponse] = useState<{ saved: string; entries: { code: string; booking: ClientBooking }[]; failed: boolean }>();
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      const codes = parseCodes(saved);
      const values = await Promise.all(codes.map(async (code) => {
        try {
          const r = await bookingAction("details", { code });
          if (r.status === 404) return null;
          if (!r.ok) return false;
          return { code, booking: await r.json() as ClientBooking };
        } catch { return false; }
      }));
      if (active) setResponse({
        saved,
        entries: values.flatMap((value) => value ? [value] : []),
        failed: values.includes(false),
      });
    }
    function updateOnReturn() { if (document.visibilityState === "visible") void load(); }
    void load();
    document.addEventListener("visibilitychange", updateOnReturn);
    window.addEventListener("pageshow", updateOnReturn);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", updateOnReturn);
      window.removeEventListener("pageshow", updateOnReturn);
    };
  }, [saved, refresh]);

  const loaded = response?.saved === saved ? response : undefined;
  const sorted = [...(loaded?.entries ?? [])].sort((a, b) => {
    const first = a.booking.day + a.booking.time;
    const second = b.booking.day + b.booking.time;
    const au = a.booking.status === "upcoming", bu = b.booking.status === "upcoming";
    return au !== bu ? (au ? -1 : 1) : (au ? first.localeCompare(second) : second.localeCompare(first));
  });
  const items = compact ? sorted.filter((item) => item.booking.status === "upcoming").slice(0, 1) : sorted;
  if (compact && !items.length) return null;
  return (
    <section className={compact ? "space-y-3 rounded-2xl border bg-muted/40 p-5" : "space-y-4"}>
      {compact && <h2 className="text-lg font-semibold">Próximo agendamento</h2>}
      {!compact && !loaded && <p role="status">Consultando seus agendamentos…</p>}
      {loaded?.failed && (
        <p role="status">Alguns horários não puderam ser consultados.{" "}
          <button className="underline" onClick={() => setRefresh((value) => value + 1)}>Tentar novamente</button>
        </p>
      )}
      {!compact && loaded && !items.length && !loaded.failed && <p>Nenhum agendamento salvo neste navegador.</p>}
      <ul className="space-y-3">
        {items.map(({ booking, code }) => (
          <li key={booking.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
            <div>
              <p className="font-semibold">{booking.name}</p>
              <p>{booking.service} · {bookingDate(booking.day, booking.time)}</p>
              {booking.status !== "upcoming" && (
                <p className="text-sm text-muted-foreground">{booking.status === "cancelled" ? "Cancelado" : "Atendimento passado"}</p>
              )}
            </div>
            <Link href={bookingLink(code)} className="rounded-lg border px-3 py-2 font-medium">Ver detalhes</Link>
          </li>
        ))}
      </ul>
      {!compact && (
        <p className="text-sm text-muted-foreground">A lista fica neste navegador. Para abrir um agendamento em outro aparelho, use seu link privado.</p>
      )}
    </section>
  );
}
