"use client";

import { BarChart3, CalendarDays, Clock3, ExternalLink, List, LogOut, Store, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

import { postJson, salonToday } from "@/lib/calendar";

import { type AdminBooking, AdminBookingRow, BusinessSummary, NewAdminBooking, ScheduleControls, WaitlistPanel } from "./admin-business";
import { type AdminConfig, HoursSettings, ProfileSettings, type SaveBusiness, type SaveSettings, ServicesSettings } from "./admin-settings";
type Mode = "loading" | "login" | "ready" | "error";
type Tab = "agenda" | "resumo" | "espera" | "perfil" | "servicos" | "horarios";

const tabs = [
  { id: "agenda", label: "Agenda", Icon: CalendarDays },
  { id: "resumo", label: "Resumo", Icon: BarChart3 },
  { id: "espera", label: "Lista de espera", Icon: Users },
  { id: "perfil", label: "Perfil", Icon: Store },
  { id: "servicos", label: "Serviços", Icon: List },
  { id: "horarios", label: "Horários e folgas", Icon: Clock3 },
] as const;

const screen = "rounded-2xl border bg-card p-4 sm:p-6";
const secondary = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-default disabled:opacity-60";

function unauthorized(response: Response) {
  return response.status === 401 || response.status === 403;
}

export default function AdminPanel({ slug }: { slug: string }) {
  const router = useRouter();
  const salon = encodeURIComponent(slug);
  const base = "/api/salons/" + salon;
  const [day, setDay] = useState(salonToday);
  const [mode, setMode] = useState<Mode>("loading");
  const [tab, setTab] = useState<Tab>("agenda");
  const [items, setItems] = useState<AdminBooking[] | null>(null);
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [agendaFailed, setAgendaFailed] = useState(false);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const [agendaRevision, setAgendaRevision] = useState(0);
  const [settingsRevision, setSettingsRevision] = useState(0);
  const authVersion = useRef(0);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  function status(text: string, isError = false) {
    setMessage(text);
    setFailed(isError);
  }

  useEffect(() => {
    const controller = new AbortController();
    const version = authVersion.current;
    const outdated = () => controller.signal.aborted || authVersion.current !== version;
    async function load() {
      try {
        const response = await fetch(base + "/admin/bookings?day=" + encodeURIComponent(day) + "&includeCanceled=true", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (outdated()) return;
        if (unauthorized(response)) {
          authVersion.current += 1;
          setItems(null);
          setConfig(null);
          setMode("login");
          return;
        }
        if (!response.ok) throw new Error();
        const bookings: AdminBooking[] = await response.json();
        if (outdated()) return;
        setItems(bookings);
        setAgendaFailed(false);
        setMode("ready");
      } catch {
        if (outdated()) return;
        setAgendaFailed(true);
        setMode((current) => current === "ready" ? "ready" : "error");
      }
    }
    void load();
    return () => controller.abort();
  }, [base, day, agendaRevision]);

  useEffect(() => {
    if (mode !== "ready" || tab === "resumo") return;
    const controller = new AbortController();
    const version = authVersion.current;
    const outdated = () => controller.signal.aborted || authVersion.current !== version;
    async function load() {
      try {
        const response = await fetch(base + "/admin/settings", { signal: controller.signal, cache: "no-store" });
        if (outdated()) return;
        if (unauthorized(response)) {
          authVersion.current += 1;
          setItems(null);
          setConfig(null);
          setMode("login");
          setMessage("Entre novamente para administrar este local.");
          setFailed(true);
          return;
        }
        if (!response.ok) throw new Error();
        const settings: AdminConfig = await response.json();
        if (outdated()) return;
        setConfig(settings);
        setSettingsFailed(false);
      } catch {
        if (!outdated()) setSettingsFailed(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [base, mode, tab, settingsRevision]);

  const onAuth = useCallback(() => {
    authVersion.current += 1;
    setItems(null);
    setConfig(null);
    setMode("login");
    setMessage("Entre novamente para administrar este local.");
    setFailed(true);
  }, []);
  const reloadAgenda = () => setAgendaRevision((value) => value + 1);
  const saveBusiness: SaveBusiness = (path, payload, success) => mutate("/admin" + path, payload, success);
  const businessProps = { base, busy, onSave: saveBusiness, onError: (value: string) => status(value, true), onAuth };

  async function mutate(path: string, payload: unknown, success?: string) {
    setBusy(true);
    status("");
    try {
      const response = await postJson(base + path, payload);
      if (unauthorized(response)) {
        authVersion.current += 1;
        setItems(null);
        setConfig(null);
        setMode("login");
        status(path === "/login" ? "Confira seu e-mail e senha para este local." : "Entre novamente para administrar este local.", true);
        return false;
      }
      if (response.status === 409) {
        const conflict = path === "/admin/profile"
          ? "Este telefone já está em uso por outro estabelecimento."
          : path === "/admin/hours" || path === "/admin/blocks" || path === "/admin/special-hours" || path === "/admin/special-hours/remove" || path === "/admin/time-blocks"
            ? "A alteração entra em conflito com uma reserva já existente. Confira a agenda e tente novamente."
            : "Há um conflito com os dados atuais. Confira o cadastro e tente novamente.";
        status(conflict, true);
        return false;
      }
      if (!response.ok) {
        status(
          response.status === 429 ? "Muitas tentativas. Aguarde um minuto." :
            response.status === 400 ? "Confira os dados preenchidos e tente novamente." :
              "Não foi possível concluir a alteração. Tente novamente.",
          true,
        );
        return false;
      }
      if (success) status(success);
      return true;
    } catch {
      status("Falha de conexão. Tente novamente.", true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (await mutate("/login", { email: data.get("email"), password: data.get("password") })) {
      setMode("loading");
      setAgendaRevision((value) => value + 1);
    }
  }

  async function logout() {
    if (await mutate("/admin/logout", {})) {
      authVersion.current += 1;
      setItems(null);
      setConfig(null);
      setSettingsFailed(false);
      setTab("agenda");
      setMode("login");
    }
  }

  const saveSettings: SaveSettings = async (path, payload, success) => {
    const saved = await mutate("/admin" + path, payload, success);
    if (saved) {
      setSettingsRevision((value) => value + 1);
      if (path === "/profile") router.refresh();
    }
    return saved;
  };

  function switchTab(next: Tab) {
    setTab(next);
    status("");
  }

  function switchWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, position: number) {
    const index =
      event.key === "ArrowRight" ? (position + 1) % tabs.length :
        event.key === "ArrowLeft" ? (position + tabs.length - 1) % tabs.length :
          event.key === "Home" ? 0 :
            event.key === "End" ? tabs.length - 1 : -1;
    if (index < 0) return;
    event.preventDefault();
    const next = tabs[index].id;
    switchTab(next);
    tabRefs.current[next]?.focus();
  }

  const announcement = <p role="status" className={message
    ? "sticky top-2 z-10 rounded-xl border bg-card px-4 py-3 text-sm shadow-sm " + (failed ? "border-destructive/40 text-destructive" : "border-emerald-600/30 text-foreground")
    : "sr-only"}>{message}</p>;

  if (mode === "loading") return <p role="status">Carregando painel administrativo…</p>;
  if (mode === "error") return <button type="button" className={secondary} onClick={() => {
    setMode("loading");
    setAgendaRevision((value) => value + 1);
  }}>Falha ao carregar. Tentar novamente</button>;
  if (mode === "login") return <div className={screen + " max-w-md space-y-4"}>
    <div>
      <h2 className="text-lg font-semibold">Entrar na área administrativa</h2>
      <p className="mt-1 text-sm text-muted-foreground">Use o e-mail e a senha de administração deste local.</p>
    </div>
    <form className="studio-form" onSubmit={(event) => void login(event)}>
      <fieldset disabled={busy} className="grid gap-4">
        <label>E-mail administrativo<input name="email" type="email" autoComplete="username" required /></label>
        <label>Senha<input name="password" type="password" autoComplete="current-password" required /></label>
        <button type="submit" className="min-h-11 w-fit">{busy ? "Entrando…" : "Entrar"}</button>
      </fieldset>
    </form>
    {announcement}
  </div>;

  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link href={"/s/" + salon} className={secondary}><ExternalLink size={16} aria-hidden /> Ver página pública</Link>
      <button type="button" className={secondary} disabled={busy} onClick={() => void logout()}><LogOut size={16} aria-hidden /> Sair</button>
    </div>
    <div className="grid grid-cols-2 gap-1 rounded-xl border bg-muted/60 p-1 sm:grid-cols-3 lg:grid-cols-6" role="tablist" aria-label="Painel administrativo">
      {tabs.map(({ id, label, Icon }, position) => <button type="button" key={id} id={"admin-tab-" + id}
        ref={(element) => { tabRefs.current[id] = element; }}
        role="tab" aria-selected={tab === id} aria-controls={"admin-panel-" + id} tabIndex={tab === id ? 0 : -1}
        className={"flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-2 py-2 text-center text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring " + (
          tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
        )}
        onClick={() => switchTab(id)} onKeyDown={(event) => switchWithKeyboard(event, position)}>
        <Icon size={17} className="shrink-0" aria-hidden /> {label}
      </button>)}
    </div>
    {announcement}
    {tabs.map(({ id }) => <div key={id} id={"admin-panel-" + id} role="tabpanel" aria-labelledby={"admin-tab-" + id} hidden={tab !== id}>
      {tab !== id ? null : id === "resumo" ? <BusinessSummary {...businessProps} /> : id === "espera" ? <WaitlistPanel {...businessProps} config={config} onDone={reloadAgenda} /> : id === "agenda" ? <section className={screen}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Agenda do estabelecimento</h2>
            <p className="mt-1 text-sm text-muted-foreground">Consulte as reservas e gerencie os atendimentos do dia.</p>
          </div>
          <label className="grid gap-1.5 text-sm font-medium">Agenda do dia
            <input type="date" value={day} className="min-h-11 rounded-lg border bg-background px-3 py-2"
              onChange={(event) => {
                if (!event.target.value) return;
                setItems(null);
                setAgendaFailed(false);
                setDay(event.target.value);
              }} />
          </label>
        </div>
        <div className="mt-4"><NewAdminBooking key={day + ":" + agendaRevision} {...businessProps} config={config} day={day} onDone={reloadAgenda} /></div>
        {agendaFailed ? <button className={secondary + " mt-4"} type="button" onClick={() => setAgendaRevision((value) => value + 1)}>Falha ao carregar a agenda. Tentar novamente</button>
          : items === null ? <p className="mt-4 text-sm text-muted-foreground" role="status">Carregando agenda…</p>
            : items.length ? <ul className="mt-5 divide-y overflow-hidden rounded-xl border" aria-label="Reservas do dia">
              {items.map((booking) => <AdminBookingRow key={booking.id + ":" + booking.revision} {...businessProps}
                booking={booking} day={day} onDone={reloadAgenda} />)}
            </ul> : <p className="mt-5 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nenhuma reserva para esta data.</p>}
      </section> : settingsFailed ? <button className={secondary} type="button" onClick={() => {
        setSettingsFailed(false);
        setSettingsRevision((value) => value + 1);
      }}>Falha ao carregar as configurações. Tentar novamente</button>
        : config === null ? <p role="status">Carregando configurações…</p>
          : id === "perfil" ? <ProfileSettings key={JSON.stringify([config.name, config.address, config.description, config.directoryPhone, config.imageUrl])}
            config={config} busy={busy} onSave={saveSettings} onError={(text) => status(text, true)} />
            : id === "servicos" ? <ServicesSettings config={config} busy={busy} onSave={saveSettings} onError={(text) => status(text, true)} />
              : <div className="space-y-4"><HoursSettings config={config} busy={busy} onSave={saveSettings} onError={(text) => status(text, true)} /><ScheduleControls {...businessProps} /></div>}
    </div>)}
  </section>;
}
