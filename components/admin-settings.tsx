"use client";

import { CalendarOff, Clock3, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { addCalendarDays, salonToday } from "@/lib/calendar";

type AdminService = {
  preparation: string;
  id: string;
  name: string;
  description: string;
  priceInCents: number;
  minutes: number;
  active: boolean;
};

export type AdminConfig = {
  name: string;
  address: string;
  description: string;
  directoryPhone: string | null;
  imageUrl: string;
  opens: string;
  closes: string;
  breakStart: string | null;
  breakEnd: string | null;
  workdays: number[];
  services: AdminService[];
  blocks: { day: string; note: string }[];
};

type SaveRoute = "/profile" | "/services" | "/hours" | "/blocks" | "/blocks/remove";
export type SaveBusiness = (route: string, payload: unknown, success: string) => Promise<boolean>;
export type SaveSettings = (route: SaveRoute, payload: unknown, success: string) => Promise<boolean>;

type SettingsProps = {
  config: AdminConfig;
  busy: boolean;
  onSave: SaveSettings;
  onError: (message: string) => void;
};

const panel = "rounded-2xl border bg-card p-4 sm:p-6";
const primary = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-default disabled:opacity-60";
const secondary = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-default disabled:opacity-60";
const input = "min-h-11 w-full rounded-lg border bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring";
const field = "grid min-w-0 gap-1.5 text-sm font-medium";
const hint = "text-sm leading-relaxed text-muted-foreground";
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const shortDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" });
const weekdays = [
  [1, "Segunda-feira", "Seg"], [2, "Terça-feira", "Ter"], [3, "Quarta-feira", "Qua"],
  [4, "Quinta-feira", "Qui"], [5, "Sexta-feira", "Sex"], [6, "Sábado", "Sáb"], [7, "Domingo", "Dom"],
] as const;

function formValues(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return new FormData(event.currentTarget);
}

function value(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

function timeValue(time: string | null) {
  return time?.slice(0, 5) ?? "";
}

function publicPhone(phone: string | null) {
  if (!phone) return "";
  const local = /^55[1-9][0-9]{9,10}$/.test(phone) ? phone.slice(2) : phone;
  return local.replace(/^([0-9]{2})([0-9]{4,5})([0-9]{4})$/, "($1) $2-$3");
}

export function ProfileSettings({ config, busy, onSave, onError }: SettingsProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    const data = formValues(event);
    const directoryPhone = value(data, "directoryPhone");
    const imageUrl = value(data, "imageUrl");
    if (directoryPhone && (
      !/^\+?[0-9\s().-]+$/.test(directoryPhone) ||
      !/^(?:[1-9][0-9]{9,10}|55[1-9][0-9]{9,10})$/.test(directoryPhone.replace(/\D/g, ""))
    )) {
      onError("Informe um telefone brasileiro com DDD ou deixe esse campo vazio.");
      return;
    }
    const coverUrl = URL.canParse(imageUrl) ? new URL(imageUrl) : null;
    if (imageUrl && imageUrl !== "/banner.png" && (
      !coverUrl || coverUrl.protocol !== "https:" || coverUrl.username || coverUrl.password ||
      coverUrl.port || !coverUrl.hostname.includes(".") ||
      coverUrl.hostname.endsWith(".localhost") || /^[\d.]+$/.test(coverUrl.hostname)
    )) {
      onError("Use um endereço público de imagem que comece com https:// ou deixe o campo vazio.");
      return;
    }

    void onSave("/profile", {
      name: value(data, "name"),
      address: value(data, "address"),
      description: value(data, "description"),
      directoryPhone: directoryPhone || null,
      imageUrl,
    }, "Perfil atualizado.");
  }

  return <section className={panel}>
    <h2 className="text-lg font-semibold">Perfil do estabelecimento</h2>
    <p className={"mt-1 " + hint}>Atualize o que os clientes veem na página pública e na busca pelo telefone.</p>
    <form className="mt-5" onSubmit={submit}>
      <fieldset disabled={busy} className="grid gap-4">
        <label className={field}>Nome do estabelecimento
          <input name="name" className={input} defaultValue={config.name} maxLength={100} required />
        </label>
        <label className={field}>Endereço
          <input name="address" className={input} defaultValue={config.address} maxLength={200} required />
        </label>
        <label className={field}>Descrição
          <textarea name="description" className={input} defaultValue={config.description} maxLength={1200} rows={4} />
        </label>
        <label className={field}>Telefone público
          <input name="directoryPhone" className={input} type="tel" autoComplete="off" inputMode="tel"
            maxLength={32} defaultValue={publicPhone(config.directoryPhone)} placeholder="(11) 00000-0000"
            aria-describedby="admin-phone-hint" />
        </label>
        <p id="admin-phone-hint" className={"-mt-2 " + hint}>Opcional. É o número que o cliente usa para encontrar seu local, com DDD.</p>
        <label className={field}>Link da foto de capa
          <input name="imageUrl" className={input} type="text" inputMode="url" maxLength={1000}
            defaultValue={config.imageUrl} placeholder="https://…"
            aria-describedby="admin-cover-hint" />
        </label>
        <p id="admin-cover-hint" className={"-mt-2 " + hint}>Opcional. Use um link HTTPS para uma imagem pública.</p>
        <button type="submit" className={primary + " w-fit"}><Save size={17} aria-hidden /> Salvar perfil</button>
      </fieldset>
    </form>
  </section>;
}

function normalizePrice(raw: string) {
  if (!/^\d{1,6}(?:[.,]\d{1,2})?$/.test(raw)) return null;
  const [reais, centavos = ""] = raw.split(/[.,]/);
  const amount = Number(reais) * 100 + Number(centavos.padEnd(2, "0"));
  return amount <= 10_000_000 ? amount : null;
}

function ServiceForm({ service, busy, onSave, onError, onClose }: {
  service?: AdminService;
  busy: boolean;
  onSave: SaveSettings;
  onError: SettingsProps["onError"];
  onClose: () => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    const data = formValues(event);
    const priceInCents = normalizePrice(value(data, "price"));
    if (priceInCents === null) {
      onError("Informe um valor entre R$ 0,00 e R$ 100.000,00, com até duas casas decimais.");
      return;
    }

    const minutes = Number(value(data, "minutes"));
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) {
      onError("Informe uma duração inteira de 5 a 480 minutos.");
      return;
    }

    if (await onSave("/services", {
      id: service?.id,
      name: value(data, "name"),
      description: value(data, "description"),
      preparation: value(data, "preparation"),
      priceInCents,
      minutes,
      active: data.has("active"),
    }, service ? "Serviço atualizado." : "Serviço cadastrado.")) onClose();
  }

  return <form className="mt-4 rounded-xl border bg-background p-4" onSubmit={submit}>
    <fieldset disabled={busy} className="grid gap-4">
      <legend className="mb-3 font-semibold">{service ? "Editar serviço" : "Novo serviço"}</legend>
      <label className={field}>Nome do serviço
        <input name="name" className={input} defaultValue={service?.name} maxLength={100} required />
      </label>
      <label className={field}>Descrição do serviço
        <textarea name="description" className={input} defaultValue={service?.description} maxLength={500} rows={3} />
      </label>
      <label className={field}>Orientações de preparo (opcional)<textarea name="preparation" className={input} defaultValue={service?.preparation} maxLength={500} rows={3} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={field}>Preço (R$)
          <input name="price" className={input} type="text" inputMode="decimal" placeholder="0,00" maxLength={9}
            defaultValue={service ? (service.priceInCents / 100).toFixed(2).replace(".", ",") : undefined} required />
        </label>
        <label className={field}>Duração (minutos)
          <input name="minutes" className={input} type="number" min={5} max={480} step={1} defaultValue={service?.minutes ?? 30} required />
        </label>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="active" className="size-4 accent-foreground" defaultChecked={service?.active ?? true} />
        Disponível para novos agendamentos
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primary}><Save size={17} aria-hidden /> Salvar serviço</button>
        <button type="button" className={secondary} onClick={onClose}>Fechar edição</button>
      </div>
    </fieldset>
  </form>;
}

export function ServicesSettings({ config, busy, onSave, onError }: SettingsProps) {
  const [editor, setEditor] = useState<string | null>(null);

  return <section className={panel}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">Catálogo de serviços</h2>
        <p className={"mt-1 " + hint}>Ajuste preço e duração. Desative o que não aceita novos agendamentos.</p>
      </div>
      {editor === null && <button type="button" className={primary} disabled={busy} onClick={() => setEditor("")}>
        <Plus size={17} aria-hidden /> Adicionar serviço
      </button>}
    </div>
    {editor !== null && <ServiceForm key={editor || "novo"} service={config.services.find((service) => service.id === editor)}
      busy={busy} onSave={onSave} onError={onError} onClose={() => setEditor(null)} />}
    {config.services.length ? <ul className="mt-4 divide-y overflow-hidden rounded-xl border" aria-label="Serviços cadastrados">
      {config.services.map((service) => <li key={service.id} className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <p className="wrap-anywhere font-semibold">{service.name}</p>
          <p className={hint}>{money.format(service.priceInCents / 100)} · {service.minutes} min</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={"rounded-full border px-2.5 py-1 text-xs font-medium " + (
            service.active ? "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300" : "bg-muted text-muted-foreground"
          )}>{service.active ? "Ativo" : "Inativo"}</span>
          <button type="button" className={secondary} disabled={busy || editor !== null}
            aria-label={`Editar ${service.name}`} onClick={() => setEditor(service.id)}>
            <Pencil size={15} aria-hidden /> Editar
          </button>
        </div>
      </li>)}
    </ul> : <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nenhum serviço cadastrado.</p>}
  </section>;
}

export function HoursSettings({ config, busy, onSave, onError }: SettingsProps) {
  const today = salonToday();
  const latestDay = addCalendarDays(today, 365);

  function saveHours(event: FormEvent<HTMLFormElement>) {
    const data = formValues(event);
    const opens = value(data, "opens");
    const closes = value(data, "closes");
    const breakStart = value(data, "breakStart");
    const breakEnd = value(data, "breakEnd");
    const workdays = data.getAll("workdays").map(Number);

    if (!workdays.length) return onError("Selecione pelo menos um dia de atendimento.");
    if (opens >= closes) return onError("O horário de fechamento deve vir depois da abertura.");
    if ((breakStart || breakEnd) && (
      !breakStart || !breakEnd || breakStart <= opens || breakEnd >= closes || breakStart >= breakEnd
    )) return onError("Preencha os dois horários de pausa e mantenha a pausa entre a abertura e o fechamento.");

    void onSave("/hours", {
      opens, closes, breakStart: breakStart || null, breakEnd: breakEnd || null, workdays,
    }, "Horários atualizados.");
  }

  async function addBlock(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const data = formValues(event);
    const day = value(data, "day");
    if (day < today || day > latestDay) return onError("Escolha uma data a partir de hoje e dentro dos próximos 365 dias.");
    if (await onSave("/blocks", { day, note: value(data, "note") }, "Folga adicionada.")) form.reset();
  }

  return <div className="grid items-start gap-4 lg:grid-cols-2">
    <section className={panel}>
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Clock3 size={20} aria-hidden /> Expediente semanal</h2>
      <p className={"mt-1 " + hint}>Defina os dias, horários e a pausa. Horário de Brasília.</p>
      <form className="mt-5" onSubmit={saveHours}>
        <fieldset key={JSON.stringify([config.opens, config.closes, config.breakStart, config.breakEnd, config.workdays])} disabled={busy} className="grid gap-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Dias de atendimento</legend>
            <div className="flex flex-wrap gap-2">
              {weekdays.map(([day, name, label]) => <label key={day}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm has-checked:bg-muted">
                <input type="checkbox" name="workdays" value={day} aria-label={name} className="size-4 accent-foreground"
                  defaultChecked={config.workdays.includes(day)} /> {label}
              </label>)}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <label className={field}>Abre às
              <input type="time" name="opens" className={input} defaultValue={timeValue(config.opens)} required />
            </label>
            <label className={field}>Fecha às
              <input type="time" name="closes" className={input} defaultValue={timeValue(config.closes)} required />
            </label>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Pausa diária (opcional)</p>
            <div className="grid grid-cols-2 gap-3">
              <label className={field}>Início da pausa
                <input type="time" name="breakStart" className={input} defaultValue={timeValue(config.breakStart)} />
              </label>
              <label className={field}>Fim da pausa
                <input type="time" name="breakEnd" className={input} defaultValue={timeValue(config.breakEnd)} />
              </label>
            </div>
          </div>
          <button type="submit" className={primary + " w-fit"}><Save size={17} aria-hidden /> Salvar horários</button>
        </fieldset>
      </form>
    </section>
    <section className={panel}>
      <h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarOff size={20} aria-hidden /> Folgas e bloqueios</h2>
      <p className={"mt-1 " + hint}>Feche um dia inteiro para feriados, férias ou outros compromissos.</p>
      <form className="mt-5" onSubmit={addBlock}>
        <fieldset disabled={busy} className="grid gap-4">
          <label className={field}>Data da folga
            <input type="date" name="day" className={input} min={today} max={latestDay} required />
          </label>
          <label className={field}>Motivo (opcional)
            <input name="note" className={input} placeholder="Ex.: feriado" maxLength={160} />
          </label>
          <button type="submit" className={primary + " w-fit"}><Plus size={17} aria-hidden /> Adicionar folga</button>
        </fieldset>
      </form>
      {config.blocks.length ? <ul className="mt-5 divide-y overflow-hidden rounded-xl border" aria-label="Folgas programadas">
        {config.blocks.map(({ day, note }) => {
          const date = shortDate.format(new Date(day + "T00:00:00Z"));
          return <li key={day} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <time className="text-sm font-semibold" dateTime={day}>{date}</time>
              {note && <p className={"wrap-anywhere " + hint}>{note}</p>}
            </div>
            <button type="button" className={secondary} disabled={busy} aria-label={`Remover folga de ${date}`}
              onClick={() => void onSave("/blocks/remove", { day }, "Folga removida.")}>
              <Trash2 size={15} aria-hidden /> Remover
            </button>
          </li>;
        })}
      </ul> : <p className="mt-5 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nenhuma folga programada.</p>}
    </section>
  </div>;
}
