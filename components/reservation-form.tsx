"use client";

import { useEffect, useState } from "react";

import type { Service } from "@/data/barbershop";
import { postJson, salonToday } from "@/lib/calendar";

export default function ReservationForm({slug,services}: {slug:string; services:Service[]}) {
  const [serviceId,setService] = useState(services[0]?.id ?? "");
  const [day,setDay] = useState(salonToday);
  const [slots,setSlots] = useState<string[]>([]);
  const [time,setTime] = useState("");
  const [customer,setCustomer] = useState("");
  const [waiting,setWaiting] = useState(false);
  const [refresh,setRefresh] = useState(0);
  const [message,setMessage] = useState("");
  const [slotStatus,setSlotStatus] = useState("");
  const base = "/api/salons/" + encodeURIComponent(slug);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setTime(""); setSlots([]);
      if (!serviceId || !day) return;
      setSlotStatus("Buscando horários…");
      try {
        const query = new URLSearchParams({serviceId,day});
        const r = await fetch(base + "/slots?" + query, {signal:controller.signal});
        if (!r.ok) throw new Error();
        const values: string[] = await r.json();
        if (controller.signal.aborted) return;
        setSlots(values);
        setSlotStatus(values.length ? "" : "Nenhum horário disponível neste dia.");
      } catch { if (!controller.signal.aborted) setSlotStatus("Não foi possível consultar os horários."); }
    }
    void load();
    return () => controller.abort();
  },[base,serviceId,day,refresh]);
  if (!services.length) return <p>O salão ainda não cadastrou serviços.</p>;
  return <form className="studio-form" onSubmit={async e => {
    e.preventDefault(); setWaiting(true); setMessage("");
    try {
      const r = await postJson(base + "/bookings", {serviceId, day, time, customer});
      if (r.ok) {
        setMessage("Reserva confirmada para " + day.split("-").reverse().join("/") + " às " + time + ".");
        setCustomer("");
      } else setMessage(r.status === 409 ? "Horário indisponível. Escolha outro." : "Falha ao reservar.");
      setRefresh(n => n+1);
    } catch { setMessage("Conexão interrompida. Confirme com o salão antes de tentar novamente."); }
    finally { setWaiting(false); }
  }}>
    <fieldset disabled={waiting} className="space-y-3">
      <legend className="text-xl font-semibold">Agendar atendimento</legend>
      <label>Serviço<select value={serviceId} onChange={e=>{setTime("");setService(e.target.value);}}>
        {services.map(s=><option key={s.id} value={s.id}>{s.name} · {s.minutes} min · {(s.priceInCents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</option>)}
      </select></label>
      <label>Data<input required type="date" value={day} min={salonToday()} onChange={e=>{setTime("");setDay(e.target.value);}} /></label>
      <label>Horário<select required value={time} onChange={e=>setTime(e.target.value)}>
        <option value="">Selecione</option>{slots.map(t=><option key={t}>{t}</option>)}
      </select></label>
      <p role="status">{slotStatus}</p>
      <label>Seu nome<input required maxLength={100} autoComplete="name" value={customer} onChange={e=>setCustomer(e.target.value)} /></label>
      <button disabled={!time || !customer.trim()}>Confirmar reserva</button>
    </fieldset>
    <p role="status">{message}</p>
  </form>;
}
