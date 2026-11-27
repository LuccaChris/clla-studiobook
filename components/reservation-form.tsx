"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Service } from "@/data/barbershop";
import { addCalendarDays, addCalendarMonths, postJson, salonToday } from "@/lib/calendar";
import { bookingLink, saveCode, validBookingCode } from "@/lib/client-bookings";

const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "UTC" });
const weekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function useCalendarValues(path: string, refresh: number) {
  const [result, setResult] = useState<{ path: string; refresh: number; values?: string[] }>();

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(path, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const values: string[] = await response.json();
        if (!controller.signal.aborted) setResult({ path, refresh, values });
      } catch {
        if (!controller.signal.aborted) setResult({ path, refresh });
      }
    }

    void load();
    return () => controller.abort();
  }, [path, refresh]);

  return result?.path === path && result.refresh === refresh ? result : undefined;
}

export default function ReservationForm({ slug, services }: { slug: string; services: Service[] }) {
  const [serviceId, setService] = useState(services[0]?.id ?? "");
  const [month, setMonth] = useState(() => salonToday().slice(0, 7));
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [quotes, setQuotes] = useState<Record<string, { priceInCents: number; minutes: number }>>({});
  const listed = services.find((service) => service.id === serviceId);
  const quote = listed ? quotes[serviceId] ?? listed : undefined;
  const preparation = listed?.preparation;
  const [waiting, setWaiting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<{ code: string; saved: boolean }>();

  const base = "/api/salons/" + encodeURIComponent(slug);
  const today = salonToday();
  const lastMonth = addCalendarDays(today, 90).slice(0, 7);
  const firstDay = month + "-01";
  const lastDay = addCalendarDays(addCalendarMonths(month, 1) + "-01", -1);
  const monthDate = new Date(firstDay + "T00:00:00Z");
  const firstWeekday = monthDate.getUTCDay();
  const availability = useCalendarValues(serviceId
    ? base + "/availability?" + new URLSearchParams({ serviceId, start: firstDay, end: lastDay })
    : "", refresh);
  const slots = useCalendarValues(serviceId && day
    ? base + "/slots?" + new URLSearchParams({ serviceId, day })
    : "", refresh);
  const availableDays = new Set(availability?.values);
  const availableSlots = slots?.values ?? [];

  function moveMonth(amount: number) {
    setMonth(addCalendarMonths(month, amount));
    setDay("");
    setTime("");
  }

  if (!services.length) return <p>O estabelecimento ainda não cadastrou serviços.</p>;

  return (
    <form className="studio-form reservation-form" onSubmit={async (event) => {
      event.preventDefault();
      if (!quote || !availableDays.has(day) || !availableSlots.includes(time) || !customer.trim()) return;
      setWaiting(true);
      setMessage("");
      setConfirmation(undefined);

      try {
        const response = await postJson(base + "/bookings", { serviceId, day, time, customer, phone, expectedPriceInCents: quote.priceInCents, expectedMinutes: quote.minutes });
        if (response.ok) {
          const data: { manageCode?: unknown } = await response.json().catch(() => ({}));
          if (validBookingCode(data.manageCode))
            setConfirmation({ code: data.manageCode, saved: saveCode(data.manageCode) });
          else setConfirmation(undefined);
          setMessage("Agendamento confirmado para " + day.split("-").reverse().join("/") + " às " + time + ".");
          setCustomer("");
          setPhone("");
          setDay("");
        } else if (response.status === 409) {
          const changed: { code?: unknown; priceInCents?: unknown; minutes?: unknown } = await response.json().catch(() => ({}));
          const { priceInCents, minutes } = changed;
          if (changed.code === "service_changed" && typeof priceInCents === "number" && typeof minutes === "number"
            && Number.isSafeInteger(priceInCents) && Number.isSafeInteger(minutes) && priceInCents >= 0 && minutes > 0) {
            setQuotes((previous) => ({ ...previous, [serviceId]: { priceInCents, minutes } }));
            setMessage("O valor ou a duração mudou para " + currency.format(priceInCents / 100) + " · " + minutes + " min. Nada foi reservado. Escolha um horário e confirme novamente se concordar.");
          } else {
            setMessage("Horário indisponível. Escolha outro.");
          }
        } else {
          setMessage(response.status === 400 ? "Confira o nome e o telefone, se informado." : "Não foi possível confirmar o agendamento.");
        }
        setTime("");
        setRefresh((value) => value + 1);
      } catch {
        setMessage("Conexão interrompida. Confirme com o estabelecimento antes de tentar novamente.");
      } finally {
        setWaiting(false);
      }
    }}>
      <fieldset disabled={waiting} className="space-y-4">
        <legend className="mb-3 text-xl font-semibold">Agendar atendimento</legend>
        <label>
          Serviço
          <select value={serviceId} onChange={(event) => {
            setService(event.target.value);
            setDay("");
            setTime("");
            setMessage("");
            setConfirmation(undefined);
          }}>
            {services.map((service) => {
              const terms = quotes[service.id] ?? service;
              return <option key={service.id} value={service.id}>
                {service.name} · {terms.minutes} min · {currency.format(terms.priceInCents / 100)}
              </option>;
            })}
          </select>
        </label>
        {preparation && <p className="whitespace-pre-wrap break-words rounded-xl border p-3 text-sm">
          <strong className="block">Antes do atendimento</strong>{preparation}
        </p>}
        <div className="booking-calendar" role="group" aria-label="Data do agendamento">
          <div className="calendar-heading">
            <button type="button" aria-label="Mês anterior" disabled={month <= today.slice(0, 7)} onClick={() => moveMonth(-1)}>‹</button>
            <span aria-live="polite">{monthLabel.format(monthDate)}</span>
            <button type="button" aria-label="Próximo mês" disabled={month >= lastMonth} onClick={() => moveMonth(1)}>›</button>
          </div>
          <div className="calendar-grid">
            {weekdayLabels.map((label) => <span key={label} aria-hidden>{label}</span>)}
            {Array.from({ length: firstWeekday }, (_, index) => <span key={"blank-" + index} aria-hidden />)}
            {Array.from({ length: Number(lastDay.slice(-2)) }, (_, index) => {
              const date = addCalendarDays(firstDay, index);
              return (
                <button
                  key={date}
                  type="button"
                  aria-label={dayLabel.format(new Date(date + "T00:00:00Z"))}
                  aria-pressed={day === date}
                  disabled={!availableDays.has(date)}
                  onClick={() => {
                    setDay(date);
                    setTime("");
                    setMessage("");
                    setConfirmation(undefined);
                  }}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        </div>
        <p role="status" className="text-sm">
          {!availability && "Consultando dias disponíveis…"}
          {availability && !availability.values && "Não foi possível consultar a disponibilidade."}
          {availability?.values?.length === 0 && "Nenhum dia disponível neste mês."}
        </p>
        {availability && !availability.values && <button type="button" onClick={() => setRefresh((value) => value + 1)}>Tentar novamente</button>}
        {day && (
          <div className="space-y-2"><label>
            Horário
            <select required value={time} disabled={!availableSlots.length} onChange={(event) => setTime(event.target.value)}>
              <option value="">
                {!slots ? "Buscando horários…" : availableSlots.length ? "Selecione" : "Nenhum horário disponível"}
              </option>
              {availableSlots.map((slot) => <option key={slot}>{slot}</option>)}
            </select>
          </label>
            {slots && !slots.values && <div className="space-y-2">
              <p role="status">Não foi possível consultar os horários.</p>
              <button type="button" onClick={() => setRefresh((value) => value + 1)}>Recarregar horários</button>
            </div>}
          </div>
        )}
        <label>
          Seu nome
          <input required maxLength={100} autoComplete="name" value={customer} onChange={(event) => setCustomer(event.target.value)} />
        </label>
        <label>Telefone com DDD (opcional)
          <input type="tel" maxLength={32} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
          <span className="text-sm font-normal text-muted-foreground">Visível apenas para o estabelecimento, para identificar seu histórico.</span>
        </label>
        <button disabled={!availableDays.has(day) || !availableSlots.includes(time) || !customer.trim()}>
          Confirmar agendamento
        </button>
      </fieldset>
      <p role="status" className="booking-message">{message}</p>
      {confirmation && (
        <div className="mt-3 space-y-2">
          <Link className="font-semibold underline underline-offset-4" href={bookingLink(confirmation.code)}>
            Ver detalhes do agendamento
          </Link>
          {!confirmation.saved && <p className="text-sm">Guarde o link privado. Este navegador não conseguiu salvar seu agendamento.</p>}
        </div>
      )}
    </form>
  );
}
