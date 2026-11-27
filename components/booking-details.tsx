"use client";

import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";

import { addCalendarDays, salonToday } from "@/lib/calendar";
import {
  bookingAction, bookingDate, bookingLink, bookingPrice, type ClientBooking,
  downloadBooking, readFragment, saveCode, subscribeFragment,
} from "@/lib/client-bookings";

async function copyBookingLink(code: string) {
  await navigator.clipboard.writeText(new URL(bookingLink(code), window.location.origin).href);
}

type Loaded = { code: string; booking?: ClientBooking; error?: string };

export default function BookingDetails() {
  const code = useSyncExternalStore(subscribeFragment, readFragment, () => "");
  const [loaded, setLoaded] = useState<Loaded>();
  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"cancel" | "move">();
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [choices, setChoices] = useState<{ day: string; values?: string[] }>();
  const [reminder, setReminder] = useState(false);

  useEffect(() => {
    if (!code) return;
    let active = true;
    async function load() {
      try {
        const response = await bookingAction("details", { code });
        const value: Loaded = response.ok ? { code, booking: await response.json() } : {
          code, error: response.status === 404 ? "Este link não corresponde a um agendamento." : "Não foi possível consultar o agendamento agora.",
        };
        if (active) setLoaded(value);
      } catch { if (active) setLoaded({ code, error: "Não foi possível consultar o agendamento agora." }); }
    }
    void load();
    return () => { active = false; };
  }, [code, revision]);

  useEffect(() => {
    if (!code || !day || mode !== "move") return;
    let active = true;
    async function load() {
      try {
        const response = await bookingAction("slots", { code, day });
        const values: string[] | undefined = response.ok ? await response.json() : undefined;
        if (active) setChoices({ day, values });
      } catch { if (active) setChoices({ day }); }
    }
    void load();
    return () => { active = false; };
  }, [code, day, mode]);

  const b = loaded?.code === code ? loaded?.booking : undefined;
  const options = choices?.day === day ? choices : undefined;
  function resetMode() {
    setMode(undefined); setDay(""); setTime(""); setChoices(undefined);
  }
  async function mutate(event: FormEvent, action: "cancel" | "reschedule") {
    event.preventDefault();
    if (!b?.canChange || busy || (action === "reschedule" && !time)) return;
    setBusy(true); setFeedback("");
    try {
      const payload = { code, revision: b.revision, ...(action === "reschedule" ? { day, time } : {}) };
      const response = await bookingAction(action, payload);
      if (response.ok) {
        setFeedback(action === "cancel" ? "Agendamento cancelado." : "Novo horário confirmado.");
        resetMode();
      } else if (response.status === 409) {
        setFeedback("O horário mudou, ficou indisponível ou o prazo terminou. Confira os detalhes atualizados.");
        resetMode();
      } else {
        setFeedback("Não foi possível concluir. Consulte o agendamento antes de tentar novamente.");
      }
    } catch { setFeedback("Conexão interrompida. Confira o agendamento antes de tentar novamente."); }
    finally { setRevision((value) => value + 1); setBusy(false); }
  }

  if (!code) return <p>Abra o link privado recebido na confirmação do agendamento.</p>;
  if (!loaded || loaded.code !== code) return <p role="status">Consultando agendamento…</p>;
  if (!b) return <div className="space-y-3">
    <p role="status">{loaded.error}</p>
    <button className="underline" onClick={() => setRevision((value) => value + 1)}>Tentar novamente</button>
  </div>;

  return (
    <div className="space-y-5 rounded-2xl border bg-card p-5 sm:p-7">
      <div className="space-y-2">
        <p className="text-sm font-medium">{b.status === "cancelled" ? "Cancelado" : b.status === "past" ? "Atendimento passado" : "Confirmado"}</p>
        <h2 className="text-2xl font-semibold">{b.name}</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="text-sm text-muted-foreground">Serviço</dt><dd>{b.service}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Data e horário</dt><dd>{bookingDate(b.day, b.time)} <span className="text-sm">(Brasília)</span></dd></div>
          <div><dt className="text-sm text-muted-foreground">Duração e valor</dt><dd>{b.minutes} min · {bookingPrice(b.priceInCents)}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Endereço</dt><dd>{b.address}</dd></div>
        </dl>
      </div>
      {b.status === "upcoming" && (
        <div className="space-y-3 border-t pt-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reminder} onChange={(e) => setReminder(e.target.checked)} />
            Incluir lembrete de 1 hora no calendário
          </label>
          <button className="rounded-lg border px-3 py-2" onClick={() => downloadBooking(b, reminder)}>Adicionar ao calendário</button>
          <p className="text-sm text-muted-foreground">Se remarcar ou cancelar, atualize também o seu calendário.</p>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button className="rounded-lg border px-3 py-2" onClick={async () => {
          try { await copyBookingLink(code); setFeedback("Link privado copiado. Não compartilhe com desconhecidos."); }
          catch { setFeedback("Não foi possível copiar. Use o endereço desta página."); }
        }}>Copiar link privado</button>
        <button className="rounded-lg border px-3 py-2" onClick={() => setFeedback(saveCode(code)
          ? "Agendamento salvo neste navegador." : "Não foi possível salvar neste navegador.")}>Salvar neste navegador</button>
      </div>
      {b.status === "upcoming" && <p className="text-sm text-muted-foreground">
        {b.canChange ? `Você pode cancelar ou remarcar até ${b.changeCutoffHours} horas antes.`
          : "O prazo de cancelamento e remarcação online terminou. Entre em contato com o local."}
      </p>}
      {b.canChange && !mode && <div className="flex flex-wrap gap-3">
        <button className="rounded-lg bg-primary px-3 py-2 text-primary-foreground" onClick={() => setMode("move")}>Remarcar</button>
        <button className="rounded-lg border px-3 py-2" onClick={() => setMode("cancel")}>Cancelar agendamento</button>
      </div>}
      {b.canChange && mode && <form className="studio-form space-y-3 border-t pt-4" onSubmit={(event) => mutate(event, mode === "cancel" ? "cancel" : "reschedule")}>
        {mode === "cancel" ? <p>Confirma o cancelamento? Seu horário voltará a ficar disponível.</p> : <>
          <p>O horário antigo fica reservado até o novo ser confirmado.</p>
          <label>Nova data
            <input type="date" required min={salonToday()} max={addCalendarDays(salonToday(), 90)} value={day}
              onChange={(event) => { setDay(event.target.value); setTime(""); setChoices(undefined); }} />
          </label>
          {day && <>
            <label>Novo horário
              <select value={time} required onChange={(event) => setTime(event.target.value)} disabled={!options?.values?.length}>
                <option value="">{!options ? "Consultando horários…" : "Selecione um horário"}</option>
                {options?.values?.filter((slot) => day !== b.day || slot !== b.time).map((slot) => <option key={slot}>{slot}</option>)}
              </select>
            </label>
            {options && (options.values ? !options.values.some((slot) => day !== b.day || slot !== b.time) && <p>Sem novos horários disponíveis.</p>
              : <p>Não foi possível consultar os horários. Selecione a data novamente.</p>)}
          </>}
        </>}
        <div className="flex flex-wrap gap-3">
          <button disabled={busy || (mode === "move" && !time)}>{mode === "cancel" ? "Confirmar cancelamento" : "Confirmar novo horário"}</button>
          <button type="button" disabled={busy} onClick={resetMode}>Voltar</button>
        </div>
      </form>}
      <p role="status">{feedback}</p>
    </div>
  );
}
