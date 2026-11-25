"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { postJson, salonToday } from "@/lib/calendar";

type Booking = {id:string; customer:string; service:string; time:string};

export default function AdminPanel({slug}: {slug:string}) {
  const base = "/api/salons/" + encodeURIComponent(slug);
  const [day,setDay] = useState(salonToday);
  const [mode,setMode] = useState<"loading"|"login"|"agenda"|"error">("loading");
  const [items,setItems] = useState<Booking[]>([]);
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  const [revision,setRevision] = useState(0);
  useEffect(()=>{
    const controller = new AbortController();
    async function load() {
      try {
        const r = await fetch(base + "/admin/bookings?day=" + day,{signal:controller.signal,cache:"no-store"});
        if (controller.signal.aborted) return;
        if (r.status===401 || r.status===403) { setItems([]);setMode("login");return; }
        if (!r.ok) throw new Error();
        const entries: Booking[] = await r.json();
        if (!controller.signal.aborted) {setItems(entries);setMode("agenda");}
      } catch {if(!controller.signal.aborted) setMode("error");}
    }
    void load();
    return ()=>controller.abort();
  },[base,day,revision]);
  async function mutate(path:string,payload:unknown) {
    setBusy(true);setMessage("");
    try {
      const r = await postJson(base+path,payload);
      if (!r.ok) {
        if (r.status===401 || r.status===403) {setItems([]);setMode("login");}
        setMessage(r.status===401?"Confira seu e-mail e senha.":r.status===429?"Muitas tentativas. Aguarde um minuto.":"Não foi possível concluir.");
        return;
      }
      setItems([]);setMode("loading");setRevision(n=>n+1);
    } catch {setMessage("Falha de conexão.");}
    finally {setBusy(false);}
  }
  if(mode==="loading") return <p role="status">Carregando…</p>;
  if(mode==="error") return <button onClick={()=>setRevision(n=>n+1)}>Falha ao carregar. Tentar novamente</button>;
  if(mode==="login") return <form className="studio-form space-y-4" onSubmit={e=>{
    e.preventDefault();
    const form=new FormData(e.currentTarget);
    void mutate("/login",{email:form.get("email"),password:form.get("password")});
  }}>
    <label>E-mail administrativo<input name="email" type="email" autoComplete="username" required /></label>
    <label>Senha<input name="password" type="password" autoComplete="current-password" required /></label>
    <button disabled={busy}>Entrar</button><p role="status">{message}</p>
  </form>;
  return <section className="studio-form space-y-4">
    <Link href={"/s/" + slug} className="block underline">Registrar atendimento</Link>
    <label>Agenda do dia<input type="date" value={day} onChange={e=>{if(e.target.value){setItems([]);setMode("loading");setDay(e.target.value);}}} /></label>
    <ul>{items.map(b=><li className="flex items-center justify-between gap-3 border-b py-3" key={b.id}>
      <span>{b.time} · {b.customer} · {b.service}</span>
      <button disabled={busy} onClick={()=>{if(window.confirm("Cancelar a reserva de "+b.customer+"?")) void mutate("/admin/bookings/"+b.id+"/cancel",{});}}>Cancelar</button>
    </li>)}</ul>
    {!items.length && <p>Nenhuma reserva para esta data.</p>}
    <button disabled={busy} onClick={()=>void mutate("/admin/logout",{})}>Sair</button>
    <p role="status">{message}</p>
  </section>;
}
