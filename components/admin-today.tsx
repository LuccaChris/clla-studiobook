"use client";

import { ArrowRight, CalendarPlus, Check, Clock3, Link2, ListChecks } from "lucide-react";
import { useState } from "react";

import { addCalendarDays, salonToday } from "@/lib/calendar";

import { RemoteNotice, useRemote } from "./admin-business";
import { type AdminConfig } from "./admin-settings";

type Appointment = { id: string; customer: string; service: string; time: string };
type Task = Appointment & { day: string; kind: "review" | "payment"; balanceCents: number | null };
type TodayData = {
  day: string; next: Appointment | null; tasks: Task[]; reviewCount: number; paymentCount: number; pendingCents: number;
};
export type AgendaIntent = { day: string; bookingId?: string; edit?: "complete" | "payment"; create?: boolean };
const dateLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const short = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const smallButton = "inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring";
const card = "min-w-0 rounded-2xl border bg-card p-4 sm:p-5";

export function AdminToday({ base, publicPath, config, configFailed, retryConfig, onAuth, onAgenda, onFinance, revision }: {
  base: string; publicPath: string; config: AdminConfig | null; configFailed: boolean; retryConfig: () => void; onAuth: () => void;
  onAgenda: (intent: AgendaIntent) => void; onFinance: () => void; revision: number;
}) {
  const request = useRemote<TodayData>(base + "/admin/today?view=" + revision, onAuth);
  const data = request.data;
  const today = data?.day ?? salonToday();
  return <div className="space-y-4">
    <section className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border bg-muted/40 p-4 sm:p-6">
      <div>
        <p className="text-sm font-medium capitalize text-muted-foreground">{dateLabel.format(new Date(today + "T00:00:00Z"))}</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight">Hoje</h2>
        <p className="mt-1 text-sm text-muted-foreground">Veja quem vem e o que falta resolver.</p>
      </div>
      <button type="button" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground sm:w-auto" onClick={() => onAgenda({ day: today, create: true })}>
        <CalendarPlus size={19} aria-hidden /> Novo agendamento
      </button>
    </section>
    {!data ? <div className={card}><RemoteNotice error={request.error} reload={request.reload} label="Carregando os atendimentos de hoje…" /></div> : <>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className={card + " space-y-3"}>
          <h3 className="flex items-center gap-2 font-semibold"><Clock3 size={18} aria-hidden /> Próximo atendimento</h3>
          {data.next ? <div className="flex items-center gap-3">
            <time className="rounded-xl bg-muted px-3 py-2 text-xl font-bold tabular-nums">{data.next.time}</time>
            <div className="min-w-0">
              <p className="wrap-anywhere font-semibold">{data.next.customer}</p>
              <p className="wrap-anywhere text-sm text-muted-foreground">{data.next.service}</p>
            </div>
          </div> : <p className="text-sm text-muted-foreground">Nenhum outro atendimento marcado para hoje.</p>}
          <button type="button" className={smallButton} onClick={() => onAgenda({day: today, bookingId: data.next?.id})}>Ver agenda de hoje <ArrowRight size={16} aria-hidden /></button>
        </section>
      <section className={card + " space-y-3 lg:row-span-2"}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 font-semibold"><ListChecks size={18} aria-hidden /> Pendências pra resolver</h3>
            {data.tasks.length > 0 && <p className="mt-1 text-sm text-muted-foreground">
              {data.reviewCount} para concluir ou marcar falta · {data.paymentCount} com saldo a receber{data.pendingCents > 0 ? " (" + reais.format(data.pendingCents/100) + ")" : ""}
            </p>}
          </div>
          {data.paymentCount > 0 && <button type="button" className={smallButton} onClick={onFinance}>Ver financeiro</button>}
        </div>
        {!data.tasks.length ? <p className="flex items-center gap-2 rounded-xl bg-muted/50 p-3 text-sm"><Check size={18} aria-hidden /> Tudo em dia. Nenhuma pendência agora.</p>
          : <ul className="divide-y rounded-xl border">
            {data.tasks.map((task) => <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className="wrap-anywhere text-sm font-semibold">{task.customer}</p>
                <p className="wrap-anywhere text-sm text-muted-foreground">{task.service} · {task.day === today ? "Hoje" : short.format(new Date(task.day + "T00:00:00Z"))} às {task.time}{task.balanceCents !== null ? " · " + reais.format(task.balanceCents/100) + " a receber" : ""}</p>
              </div>
              <button type="button" className={smallButton} onClick={() => onAgenda({ day: task.day, bookingId: task.id, edit: task.kind === "payment" ? "payment" : undefined })}>
                {task.kind === "payment" ? "Registrar pagamento" : "Revisar atendimento"}
              </button>
            </li>)}
          </ul>}
        {data.reviewCount + data.paymentCount > data.tasks.length && <p className="text-sm text-muted-foreground">Mostrando as {data.tasks.length} pendências mais recentes. Consulte outras datas em Agenda.</p>}
      </section>
      <TomorrowSlots key={today} base={base} tomorrow={addCalendarDays(today,1)} path={publicPath} config={config} configFailed={configFailed} retryConfig={retryConfig} />
      </div>
    </>}
  </div>;
}

function TomorrowSlots({ base, tomorrow, path, config, configFailed, retryConfig }: { base: string; tomorrow: string; path: string; config: AdminConfig | null; configFailed: boolean; retryConfig: () => void }) {
  const services = config?.services.filter((service) => service.active) ?? [];
  const [chosen, setChosen] = useState("");
  const service = services.find((s) => s.id === chosen) ?? services[0];
  const slots = useRemote<string[]>(service ? base + "/slots?" + new URLSearchParams({ serviceId: service.id, day: tomorrow }) : "");
  const [copy, setCopy] = useState<"idle" | "done" | "manual">("idle");
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).href);
      setCopy("done");
    } catch {
      setCopy("manual");
    }
  }
  const count = slots.data?.length;
  return <section className={card + " space-y-3"}>
    <h3 className="flex items-center gap-2 font-semibold"><Link2 size={18} aria-hidden /> Horários livres amanhã</h3>
    {services.length > 1 && <label className="grid w-fit gap-1 text-sm">Serviço<select className="min-h-10 rounded-lg border bg-background px-2"
      value={service.id} onChange={(event) => setChosen(event.target.value)}>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
    {!service ? config ? <p className="text-sm text-muted-foreground">Cadastre um serviço ativo para consultar horários.</p>
      : <RemoteNotice error={configFailed} reload={retryConfig} label="Carregando serviços…" />
      : count === undefined ? <RemoteNotice error={slots.error} reload={slots.reload} label="Consultando os horários que o cliente pode reservar…" />
      : count === 0 ? <p className="text-sm text-muted-foreground">Nenhum horário disponível para {service.name} amanhã.</p>
      : <p className="text-sm text-muted-foreground"><strong className="text-foreground">{count === 1 ? "1 opção de início" : count + " opções de início"}</strong> para {service.name}. Próxima opção: {slots.data?.[0]}.</p>}
    {count !== undefined && count > 0 && <button type="button" className={smallButton} onClick={() => void copyLink()}>Copiar link para divulgar</button>}
    <p role="status" className={copy === "done" ? "text-sm font-medium" : "sr-only"}>{copy === "done" ? "Link copiado." : ""}</p>
    {copy === "manual" && <label className="grid gap-1 text-sm">Copie este link<input className="w-full rounded-lg border bg-background px-2 py-2" readOnly
      onFocus={(event) => event.target.select()} value={new URL(path, window.location.origin).href} /></label>}
  </section>;
}
