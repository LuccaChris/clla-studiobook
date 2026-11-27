"use client";

import { type FormEvent,useEffect, useRef, useState } from "react";

import { addCalendarDays, salonToday } from "@/lib/calendar";

import { type AdminConfig, type SaveBusiness } from "./admin-settings";

export type AdminBooking = {
  id: string; customer: string; service: string; time: string; origin: string; status: string;
  priceInCents: number | null; amountDueCents: number | null; directCostCents: number | null;
  paidCents: number | null; payments: { id: string; amountCents: number; paidOn: string }[]; ended: boolean; revision: number; canMove: boolean;
};
type Wait = { id: string; customer: string; phone: string; service: string; serviceId: string; day: string; preferredTime: string | null; active: boolean };
type Summary = {
  receivedCents: number; pendingCents: number; forecastCents: number; completedRevenueCents: number;
  directCostsCents: number; fixedCostsCents: number | null; missingCosts: number; noShows: number;
  cancelled: number; recoveredWeek: number; cancelledWeek: number; origins: Record<string, number>;
  busyHours: { weekday: number; hour: number; total: number }[];
  idleHours: { weekday: number; hour: number; free: number }[];
  availableMinutes: number; bookedMinutes: number; knownClients: number; returningClients: number; unidentifiedVisits: number;
  services: { name: string; requested: number; completed: number; marginPerHourCents: number | null }[];
};
type Props = { base: string; busy: boolean; onSave: SaveBusiness; onError: (text: string) => void; onAuth: () => void };
const card = "rounded-2xl border bg-card p-4 sm:p-6";
const button = "inline-flex min-h-10 items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50";
const originLabels: Record<string, string> = { studiobook: "StudioBook", whatsapp: "WhatsApp", phone: "Telefone", in_person: "Presencial", waitlist: "Lista de espera", unknown: "Não registrada" };
const statusLabels: Record<string, string> = { scheduled: "Agendado", completed: "Concluído", no_show: "Faltou", cancelled: "Cancelado" };
const weekdays = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const format = (cents: number) => money.format(cents / 100);
const field = (cents: number | null) => cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",");
const displayDay = (day: string) => day.split("-").reverse().join("/");
function cents(data: FormData, name: string) {
  const value = String(data.get(name) ?? "").trim();
  if (!value) return null;
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(value)) return NaN;
  const [whole, decimal = ""] = value.split(/[.,]/);
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}
function MoneyInput({ label, name, value, required = false }: { label: string; name: string; value: number | null; required?: boolean }) {
  return <label>{label}<input name={name} inputMode="decimal" placeholder="0,00" defaultValue={field(value)} required={required} /></label>;
}

export function useRemote<T>(url: string, onAuth?: () => void) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data?: T; failed?: boolean }>();
  const key = url + "|" + revision;
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          onAuth?.();
          if (onAuth) return;
        }
        if (!response.ok) throw new Error();
        const data: T = await response.json();
        if (!controller.signal.aborted) setState({ key, data });
      } catch {
        if (!controller.signal.aborted) setState({ key, failed: true });
      }
    })();
    return () => controller.abort();
  }, [key, url, onAuth]);
  return { data: state?.key === key ? state.data : undefined, error: state?.key === key && state.failed, reload: () => setRevision((value) => value + 1) };
}

export function RemoteNotice({ error, reload, label }: { error?: boolean; reload: () => void; label: string }) {
  return error ? <button className={button} type="button" onClick={reload}>Falha ao carregar. Tentar novamente</button> : <p role="status" className="text-sm text-muted-foreground">{label}</p>;
}

function Slots({ url, preferredTime, onAuth }: { url: string; preferredTime?: string | null; onAuth?: () => void }) {
  const slots = useRemote<string[]>(url, onAuth);
  const times = slots.data?.filter((slot) => !preferredTime || preferredTime === slot);
  return <label>Horário disponível
    <select name="time" defaultValue="" required disabled={!times?.length} key={url}>
      <option value="">{!url ? "Selecione um serviço" : slots.error ? "Falha ao buscar horários" : !times ? "Buscando horários…" : times.length ? "Selecione um horário" : "Sem horários disponíveis"}</option>
      {times?.map((time) => <option key={time}>{time}</option>)}
    </select>
    {slots.error && <button className={button} type="button" onClick={slots.reload}>Recarregar horários</button>}
  </label>;
}

const serviceOptions = (config: AdminConfig) => config.services.filter((service) => service.active).map((service) => <option value={service.id} key={service.id}>{service.name}</option>);
const slotUrl = (base: string, id: string, day: string) => id && day ? base + "/slots?" + new URLSearchParams({ serviceId: id, day }) : "";

export function NewAdminBooking({ base, busy, onSave, config, day, onDone, configFailed, retryConfig, openOnMount = false }: Pick<Props,"base"|"busy"|"onSave"> & { config: AdminConfig | null; day: string; onDone: () => void; openOnMount?: boolean; configFailed: boolean; retryConfig: () => void }) {
  const [shown, setShown] = useState(openOnMount);
  const [serviceId, setServiceId] = useState("");
  const first = useRef<HTMLInputElement>(null);
  const hasConfig = config !== null;
  useEffect(() => {
    if (shown && hasConfig) first.current?.focus();
  }, [shown,hasConfig]);
  if (!shown) return <button className={button} type="button" onClick={() => setShown(true)}>+ Nova reserva manual</button>;
  return <div className="scroll-mt-24 rounded-xl border bg-muted/25 p-4">
    <h3 className="mb-3 font-semibold">Nova reserva manual</h3>
    {config ? <form className="studio-form" onSubmit={async (event) => {
      event.preventDefault();
      const f = new FormData(event.currentTarget);
      if (!f.get("time")) return;
      if (await onSave("/bookings", { customer: f.get("customer"), phone: f.get("phone"), serviceId, origin: f.get("origin"), time: f.get("time"), day }, "Reserva manual registrada.")) {
        setShown(false); setServiceId(""); onDone();
      }
    }}>
      <fieldset className="grid gap-3 sm:grid-cols-2" disabled={busy}>
        <label>Nome do cliente<input ref={first} name="customer" required maxLength={100} /></label>
        <label>Telefone com DDD (opcional)<input type="tel" name="phone" maxLength={32} /></label>
        <label>Serviço<select required value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">Selecione um serviço</option>{serviceOptions(config)}</select></label>
        <label>Canal<select name="origin"><option value="whatsapp">WhatsApp</option><option value="phone">Telefone</option><option value="in_person">Presencial</option></select></label>
        <Slots url={slotUrl(base + "/admin", serviceId, day)} />
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="submit">Salvar reserva</button>
          <button type="button" className={button} onClick={() => setShown(false)}>Fechar</button>
        </div>
      </fieldset>
    </form> : <RemoteNotice error={configFailed} reload={retryConfig} label="Carregando serviços…" />}
  </div>;
}

export function AdminBookingRow({ booking: k, base, busy, onSave, onError, onAuth, day, onDone, highlight = false, initialEdit }: Props & { booking: AdminBooking; day: string; onDone: () => void; highlight?: boolean; initialEdit?: "complete" | "payment" }) {
  const [edit, setEdit] = useState<"move" | "complete" | "payment" | null>(() =>
    initialEdit === "payment" && k.status === "completed" ? "payment" : initialEdit === "complete" && k.status === "scheduled" && k.ended ? "complete" : null);
  const row = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (highlight) row.current?.focus();
  }, [highlight]);
  const [target, setTarget] = useState(day);
  const path = "/bookings/" + k.id;
  async function save(action: string, payload: object, message: string) {
    if (await onSave(path + action, { ...payload, revision: k.revision }, message)) {
      setEdit(null);
      onDone();
    }
  }
  const balance = (k.amountDueCents ?? 0) - (k.paidCents ?? 0);
  const payment = k.status === "completed" && k.amountDueCents !== null ?
    (k.paidCents ?? 0) < k.amountDueCents ? format(k.amountDueCents - (k.paidCents ?? 0)) + " a receber" : "Sem saldo pendente" : null;
  return <li ref={row} tabIndex={-1} className={"space-y-3 p-3 sm:p-4 focus-visible:outline-2 focus-visible:outline-ring " + (highlight ? "bg-muted/50" : "")}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="rounded-lg bg-muted px-2.5 py-1.5 text-sm font-semibold tabular-nums">{k.time}</span>
        <div className="min-w-0">
          <p className="wrap-anywhere font-semibold">{k.customer}</p>
          <p className="wrap-anywhere text-sm text-muted-foreground">{k.service} · {originLabels[k.origin]} · {statusLabels[k.status]}</p>
          {payment && <p className="text-sm font-medium">{payment}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {k.status === "scheduled" && !k.ended && <>
          {k.canMove && <button type="button" className={button} disabled={busy} onClick={() => setEdit("move")}>Remarcar</button>}
          <button type="button" className={button + " text-destructive"} disabled={busy} onClick={() => {
            if (window.confirm("Cancelar a reserva de " + k.customer + "?")) void save("/cancel", {}, "Reserva cancelada.");
          }}>Cancelar</button>
        </>}
        {k.status === "scheduled" && k.ended && <>
          <button type="button" className={button} disabled={busy} onClick={() => setEdit("complete")}>Concluir</button>
          <button type="button" className={button} disabled={busy} onClick={() => {
            if (window.confirm("Marcar falta de " + k.customer + "?")) void save("/outcome", { outcome: "no_show" }, "Falta registrada.");
          }}>Marcar falta</button>
        </>}
        {k.status === "no_show" && k.ended && <button type="button" className={button} disabled={busy}
          onClick={() => setEdit("complete")}>Corrigir falta</button>}
        {k.status === "completed" && <>
          <button type="button" className={button} disabled={busy} onClick={() => setEdit("complete")}>Editar valor e custo</button>
          <button type="button" className={button} disabled={busy} onClick={() => setEdit("payment")}>{balance > 0 ? "Registrar pagamento" : "Ver pagamentos"}</button>
        </>}
      </div>
    </div>
    {edit && <form className="studio-form rounded-xl border bg-muted/25 p-3" key={edit} onSubmit={async (event) => {
      event.preventDefault();
      const f = new FormData(event.currentTarget);
      if (edit === "move") {
        if (!f.get("time")) return;
        await save("/move", { day: target, time: f.get("time") }, "Reserva remarcada.");
      } else if (edit === "complete") {
        const due = cents(f, "due");
        const cost = cents(f, "cost");
        if (due === null || !Number.isFinite(due) || (cost !== null && !Number.isFinite(cost))) return onError("Confira os valores em reais.");
        await save("/outcome", { outcome: "completed", amountDueCents: due, directCostCents: cost }, k.status === "no_show" ? "Falta corrigida. Atendimento concluído." : "Atendimento concluído.");
      } else {
        const paid = cents(f, "paid");
        if (paid === null || !Number.isFinite(paid) || paid <= 0 || paid > balance) return onError("Informe um valor maior que zero e até o saldo a receber.");
        await save("/payment", { amountCents: paid, paidOn: f.get("paidOn") }, "Pagamento atualizado.");
      }
    }}>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        {edit === "move" ? <>
          <label>Novo dia<input type="date" value={target} min={salonToday()} max={addCalendarDays(salonToday(),90)} required onChange={(event) => setTarget(event.target.value)} /></label>
          <Slots url={target ? base + "/admin" + path + "/slots?" + new URLSearchParams({ day: target }) : ""} onAuth={onAuth} />
        </> : edit === "complete" ? <>
          <MoneyInput label="Valor a cobrar (R$)" name="due" value={k.amountDueCents ?? k.priceInCents} required />
          <MoneyInput label="Custo direto (R$)" name="cost" value={k.directCostCents} />
          <p className="text-sm text-muted-foreground sm:col-span-2">Inclua materiais e taxas. Informe zero se não houve custo; deixe em branco se ainda não souber.</p>
        </> : <>
          {k.payments.length > 0 && <ul className="divide-y sm:col-span-2" aria-label="Pagamentos registrados">
            {k.payments.map((p) => <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" key={p.id}>
              <span>{displayDay(p.paidOn)} · {format(p.amountCents)}</span>
              <button type="button" className={button} onClick={() => {
                if (window.confirm("Remover este lançamento? Isso não devolve dinheiro ao cliente.")) void save("/payment/" + p.id + "/remove", {}, "Lançamento removido.");
              }}>Remover lançamento</button>
            </li>)}
          </ul>}
          {balance > 0 && <>
            <MoneyInput label="Valor recebido agora (R$)" name="paid" value={balance} required />
            <label>Data do recebimento<input type="date" name="paidOn" min={day} max={salonToday()} defaultValue={salonToday()} required /></label>
            <p className="text-sm text-muted-foreground sm:col-span-2">Cada pagamento entra no mês em que foi recebido. Não há cobrança automática.</p>
          </>}
        </>}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          {(edit !== "payment" || balance > 0) && <button type="submit">Confirmar</button>}
          <button type="button" className={button} onClick={() => setEdit(null)}>Fechar</button>
        </div>
      </fieldset>
    </form>}
  </li>;
}

export function WaitlistPanel({ base, busy, onSave, onAuth, config, onDone }: Props & { config: AdminConfig | null; onDone: () => void }) {
  const list = useRemote<Wait[]>(base + "/admin/waitlist", onAuth);
  const [selected, setSelected] = useState<string | null>(null);
  const today = salonToday();
  return <section className={card + " space-y-5"}>
    <div><h2 className="text-lg font-semibold">Lista de espera</h2>
      <p className="text-sm text-muted-foreground">A lista não ocupa a agenda. Convide pelo WhatsApp e só confirme aqui depois que a pessoa aceitar.</p>
    </div>
    {config && <form className="studio-form rounded-xl border p-4" onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const f = new FormData(form);
      if (await onSave("/waitlist", { customer: f.get("customer"), phone: f.get("phone"), serviceId: f.get("serviceId"), day: f.get("day"), preferredTime: f.get("preferredTime") }, "Pessoa adicionada à lista.")) {
        form.reset(); list.reload();
      }
    }}>
      <fieldset className="grid gap-3 sm:grid-cols-2" disabled={busy}>
        <legend className="mb-3 font-semibold">Adicionar pessoa</legend>
        <label>Nome do cliente<input name="customer" required maxLength={100} /></label>
        <label>WhatsApp com DDD<input type="tel" name="phone" required maxLength={32} /></label>
        <label>Serviço<select name="serviceId" required defaultValue=""><option value="">Selecione um serviço</option>{serviceOptions(config)}</select></label>
        <label>Data desejada<input type="date" name="day" min={today} max={addCalendarDays(today,90)} defaultValue={today} required /></label>
        <label>Horário de preferência (opcional)<input type="time" name="preferredTime" /></label>
        <button className="w-fit self-end" type="submit">Adicionar à espera</button>
      </fieldset>
    </form>}
    {!list.data ? <RemoteNotice error={list.error} reload={list.reload} label="Carregando lista de espera…" /> : !list.data.length ?
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Ninguém aguardando nos próximos dias.</p> :
      <ul className="divide-y rounded-xl border">
        {list.data.map((w) => <li className="space-y-3 p-4" key={w.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="wrap-anywhere font-semibold">{w.customer}</p>
              <p className="wrap-anywhere text-sm text-muted-foreground">{w.service} · {displayDay(w.day)}{w.preferredTime ? " às " + w.preferredTime : " · qualquer horário"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy || !w.active} className={button} onClick={() => setSelected(w.id === selected ? null : w.id)}>Ver horários e convidar</button>
              <button type="button" disabled={busy} className={button} onClick={async () => {
                if (await onSave("/waitlist/" + w.id + "/close", {}, "Pessoa removida da lista.")) list.reload();
              }}>Remover</button>
            </div>
          </div>
          {!w.active && <p className="text-sm text-muted-foreground">Serviço desativado.</p>}
          {selected === w.id && <WaitOffer wait={w} base={base} busy={busy} onSave={onSave} onAuth={onAuth} onDone={() => {
            setSelected(null); list.reload(); onDone();
          }} />}
        </li>)}
      </ul>}
  </section>;
}

function WaitOffer({ wait, base, busy, onSave, onAuth, onDone }: Pick<Props, "base" | "busy" | "onSave" | "onAuth"> & { wait: Wait; onDone: () => void }) {
  const slots = useRemote<string[]>(slotUrl(base + "/admin", wait.serviceId, wait.day), onAuth);
  const [time, setTime] = useState("");
  const options = slots.data?.filter((slot) => !wait.preferredTime || wait.preferredTime === slot);
  const available = !!time && !!options?.includes(time);
  const message = "Olá, " + wait.customer + "! Tenho um horário em " + displayDay(wait.day) + " às " + time + ". Você consegue? Me avise para eu confirmar.";
  return <form className="studio-form rounded-xl border bg-muted/25 p-3" onSubmit={async (event) => {
    event.preventDefault();
    if (!available || !window.confirm("A pessoa já aceitou este horário?")) return;
    if (await onSave("/bookings", { waitId: wait.id, serviceId: wait.serviceId, day: wait.day, time, customer: wait.customer }, "Horário confirmado e removido da espera.")) onDone();
    else slots.reload();
  }}>
    <fieldset disabled={busy} className="grid gap-3">
      {!options ? <RemoteNotice error={slots.error} reload={slots.reload} label="Buscando horários…" /> : !options.length ?
        <p className="text-sm text-muted-foreground">Nenhum horário compatível disponível.</p> : <label>Horário do convite
          <select value={available ? time : ""} onChange={(event) => setTime(event.target.value)} required>
            <option value="">Selecione um horário</option>{options.map((slot) => <option key={slot}>{slot}</option>)}
          </select>
        </label>}
      {available && <div className="flex flex-wrap gap-2">
        <a className={button} target="_blank" rel="noopener noreferrer" href={"https://wa.me/" + wait.phone + "?text=" + encodeURIComponent(message)}>Abrir convite no WhatsApp</a>
        <button type="submit">Confirmar reserva</button>
      </div>}
    </fieldset>
  </form>;
}

export function BusinessSummary({ base, busy, onSave, onError, onAuth }: Props) {
  const [sort, setSort] = useState<"demand" | "margin">("demand");
  const [month, setMonth] = useState(() => salonToday().slice(0,7));
  const summary = useRemote<Summary>(base + "/admin/summary?month=" + month + "-01", onAuth);
  const stats = summary.data;
  const result = stats && (stats.fixedCostsCents === null || stats.missingCosts > 0 ? null :
    stats.completedRevenueCents - stats.directCostsCents - stats.fixedCostsCents);
  const occupancy = stats && stats.availableMinutes > 0 ? Math.round(stats.bookedMinutes / stats.availableMinutes * 100) : null;
  return <section className={card + " space-y-5"}>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Financeiro</h2><p className="text-sm text-muted-foreground">Acompanhe o dinheiro que entrou e quais serviços compensam mais.</p></div>
      <label className="grid gap-1 text-sm font-medium">Mês de referência<input className="min-h-10 rounded-lg border bg-background px-3" type="month" min="2000-01" max="2100-12" value={month}
        onChange={(event) => { if (event.target.value && event.target.validity.valid) setMonth(event.target.value); }} /></label>
    </div>
    {!stats ? <RemoteNotice error={summary.error} reload={summary.reload} label="Carregando resumo…" /> : <>
      <dl className="grid gap-2 sm:grid-cols-3">
        {[["Recebi neste mês", format(stats.receivedCents)], ["Falta receber dos atendimentos do mês", format(stats.pendingCents)],
          ["Lucro estimado do mês", result == null ? "Dados incompletos" : format(result)]].map(([label,value]) =>
          <div key={label} className="rounded-xl border bg-muted/30 p-3"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>)}
      </dl>
      <p className="text-sm text-muted-foreground"><strong className="text-foreground">Previsto em reservas futuras neste mês:</strong> {format(stats.forecastCents)}.</p>
      <p className="text-sm text-muted-foreground">O lucro estimado usa o valor dos atendimentos concluídos no mês, mesmo se ainda não foram pagos, menos custos diretos e despesas fixas. Recebimentos seguem a data do pagamento.
        {stats.missingCosts > 0 && " Falta registrar o custo de " + stats.missingCosts + " atendimento(s)."}</p>
      <form className="studio-form rounded-xl border p-3" key={month + ":" + stats.fixedCostsCents} onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const amountCents = cents(new FormData(event.currentTarget),"fixed");
        if (amountCents === null || !Number.isFinite(amountCents)) return onError("Informe o total das despesas fixas em reais.");
        if (await onSave("/summary/monthly-cost", { month: month + "-01", amountCents }, "Despesas fixas atualizadas.")) summary.reload();
      }}>
        <fieldset className="flex flex-wrap items-end gap-2" disabled={busy}>
          <MoneyInput label="Despesas fixas do mês (R$)" name="fixed" value={stats.fixedCostsCents} required />
          <button type="submit">Salvar despesas</button>
        </fieldset>
      </form>
      <div className="grid gap-3 md:grid-cols-2">
        <section className="space-y-2 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Serviços mais solicitados</h3>
            <button type="button" className={button} onClick={() => setSort(sort === "demand" ? "margin" : "demand")}>{sort === "demand" ? "Ordenar por margem/h" : "Ordenar por demanda"}</button>
          </div>
          <p className="text-sm text-muted-foreground">Demanda inclui reservas depois canceladas. Margem/h é dos atendimentos concluídos, antes das despesas fixas.</p>
          {!stats.services.length ? <p className="text-sm text-muted-foreground">Sem reservas no período.</p> :
            <ol className="divide-y">{(sort === "demand" ? stats.services : [...stats.services].sort((a,b) => (b.marginPerHourCents ?? -Infinity) - (a.marginPerHourCents ?? -Infinity))).map((s,index) => <li className="flex items-start justify-between gap-3 py-2 text-sm" key={index}>
              <span className="wrap-anywhere">{s.name}<small className="block text-muted-foreground">{s.requested} solicitadas · {s.completed} concluídas</small></span>
              <span className="shrink-0 font-medium">{s.marginPerHourCents === null ? "Sem margem" : format(s.marginPerHourCents) + "/h"}</span>
            </li>)}</ol>}
        </section>
        <section className="space-y-2 rounded-xl border p-4">
          <h3 className="font-semibold">Origem das reservas</h3>
          {!Object.keys(stats.origins).length ? <p className="text-sm text-muted-foreground">Sem reservas no período.</p> :
            <dl className="divide-y">{Object.entries(stats.origins).sort((a,b) => b[1]-a[1]).map(([source,total]) => <div className="flex justify-between py-2 text-sm" key={source}>
              <dt>{originLabels[source] ?? source}</dt><dd className="font-semibold tabular-nums">{total}</dd>
            </div>)}</dl>}
        </section>
        <section className="space-y-2 rounded-xl border p-4">
          <h3 className="font-semibold">Agenda do mês</h3>
          <p className="text-sm">{stats.cancelled} cancelamento(s) · {stats.noShows} falta(s)</p>
          {occupancy !== null && <p className="text-sm">{occupancy}% do tempo disponível ocupado pela agenda <span className="text-muted-foreground">(estimativa com os horários atuais)</span>.</p>}
          {(stats.busyHours.length > 0 || stats.idleHours.length > 0) && <details><summary className="cursor-pointer text-sm font-medium">Ver padrões de horários no mês</summary>
            {stats.busyHours.length > 0 && <><p className="mt-2 text-sm text-muted-foreground">Com mais reservas</p>
              <ul className="space-y-1 text-sm">{stats.busyHours.map((h) => <li key={h.weekday + ":" + h.hour}>{weekdays[h.weekday-1]} às {String(h.hour).padStart(2,"0")}h · {h.total}</li>)}</ul></>}
            {stats.idleHours.length > 0 && <><p className="mt-2 text-sm text-muted-foreground">Com mais tempo livre</p>
              <ul className="space-y-1 text-sm">{stats.idleHours.map((h) => <li key={h.weekday + ":" + h.hour}>{weekdays[h.weekday-1]} às {String(h.hour).padStart(2,"0")}h · {Math.round(h.free/6)/10}h livres</li>)}</ul></>}
          </details>}
        </section>
        <section className="space-y-2 rounded-xl border p-4">
          <h3 className="font-semibold">Nesta semana</h3>
          <p className="text-sm">{stats.cancelledWeek} cancelamento(s) · {stats.recoveredWeek} reserva(s) confirmada(s) pela lista de espera.</p>
          <p className="text-sm text-muted-foreground">Abriu uma vaga? Confira a lista de espera antes de divulgar o horário.</p>
        </section>
        <section className="space-y-2 rounded-xl border p-4 md:col-span-2">
          <h3 className="font-semibold">Clientes atendidos no mês</h3>
          <p className="text-sm">{stats.knownClients - stats.returningClients} novo(s) no histórico · {stats.returningClients} recorrente(s)</p>
          <p className="text-sm text-muted-foreground">Considera apenas atendimentos concluídos com telefone. {stats.unidentifiedVisits} atendimento(s) sem telefone não entram nessa contagem.</p>
        </section>
      </div>
    </>}
  </section>;
}

type Exception = { day: string; start: string; end: string };
type PartialBlock = Exception & {id: string; note: string};
function isPartialBlock(x: Exception): x is PartialBlock { return "id" in x; }
type Rules = { leadMinutes: number; cutoffHours: number; bufferMinutes: number; hours: Exception[]; blocks: PartialBlock[] };

export function ScheduleControls({ base, busy, onSave, onAuth }: Props) {
  const config = useRemote<Rules>(base + "/admin/exceptions", onAuth);
  const rules = config.data;
  const today = salonToday();
  if (!rules) return <RemoteNotice error={config.error} reload={config.reload} label="Carregando regras de agendamento…" />;
  return <div className="space-y-4">
    <section className={card + " space-y-3"}>
      <h2 className="text-lg font-semibold">Regras de agendamento</h2>
      <form className="studio-form" onSubmit={async (event) => {
        event.preventDefault(); const f = new FormData(event.currentTarget);
        if (await onSave("/rules", { leadMinutes: Number(f.get("lead")), cutoffHours: Number(f.get("cutoff")), bufferMinutes: Number(f.get("buffer")) }, "Regras atualizadas.")) config.reload();
      }}>
        <fieldset className="grid gap-3 sm:grid-cols-3" disabled={busy}>
          <label>Antecedência mínima (min)<input name="lead" type="number" min={0} max={10080} defaultValue={rules.leadMinutes} required /></label>
          <label>Prazo para o cliente alterar (h)<input name="cutoff" type="number" min={0} max={168} defaultValue={rules.cutoffHours} required /></label>
          <label>Intervalo entre serviços (min)<input name="buffer" type="number" min={0} max={120} defaultValue={rules.bufferMinutes} required /></label>
          <p className="text-sm text-muted-foreground sm:col-span-3">A antecedência e o prazo valem para o cliente. O intervalo afeta novos horários, sem mover reservas já feitas.</p>
          <button className="w-fit" type="submit">Salvar regras</button>
        </fieldset>
      </form>
    </section>
    <section className={card + " space-y-3"}>
      <h2 className="text-lg font-semibold">Horário especial e bloqueio parcial</h2>
      <p className="text-sm text-muted-foreground">Horário especial substitui o expediente e a pausa padrão naquele dia. Se houver pausa, registre um bloqueio parcial separado.</p>
      <form className="studio-form" onSubmit={async (event) => {
        event.preventDefault(); const form = event.currentTarget; const f = new FormData(form);
        if (await onSave(String(f.get("type")), { day: f.get("day"), start: f.get("start"), end: f.get("end"), note: f.get("note") }, "Exceção salva.")) {
          form.reset(); config.reload();
        }
      }}>
        <fieldset className="grid gap-3 sm:grid-cols-2" disabled={busy}>
          <label>Tipo de exceção<select name="type"><option value="/time-blocks">Bloqueio parcial</option><option value="/special-hours">Horário especial</option></select></label>
          <label>Data da exceção<input type="date" name="day" required min={today} max={addCalendarDays(today,365)} /></label>
          <label>Início<input type="time" name="start" required /></label>
          <label>Fim<input type="time" name="end" required /></label>
          <label>Motivo privado (para bloqueio)<input name="note" maxLength={160} /></label>
          <button className="w-fit self-end" type="submit">Salvar exceção</button>
        </fieldset>
      </form>
      {[...rules.hours, ...rules.blocks].sort((a,b) => a.day.localeCompare(b.day) || a.start.localeCompare(b.start)).map((x) => <div key={isPartialBlock(x) ? x.id : x.day}
        className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm">
        <span>{displayDay(x.day)} · {x.start} às {x.end} · {isPartialBlock(x) ? x.note || "Bloqueio parcial" : "Horário especial"}</span>
        <button type="button" className={button} disabled={busy} onClick={async () => {
          if (await onSave(isPartialBlock(x) ? "/time-blocks/" + x.id + "/remove" : "/special-hours/remove", { day: x.day }, "Exceção removida.")) config.reload();
        }}>Remover</button>
      </div>)}
    </section>
  </div>;
}
