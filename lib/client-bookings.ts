import { postJson } from "@/lib/calendar";

export type ClientBooking = {
  id: string;
  slug: string;
  name: string;
  address: string;
  service: string;
  priceInCents: number;
  day: string;
  time: string;
  minutes: number;
  status: "upcoming" | "cancelled" | "past";
  canChange: boolean;
  changeCutoffHours: number;
  revision: number;
};

const key = "studiobook.client-bookings.v1";
const changed = "studiobook:client-bookings";
const formatDay = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" });
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const validBookingCode = (code: unknown): code is string =>
  typeof code === "string" && /^[a-f0-9]{64}$/i.test(code);

export function parseCodes(raw: string): string[] {
  try {
    const entries: unknown = JSON.parse(raw);
    return Array.isArray(entries)
      ? [...new Set(entries.filter(validBookingCode).map((code) => code.toLowerCase()))].slice(0, 25)
      : [];
  } catch {
    return [];
  }
}

export function readCodes() {
  try { return localStorage.getItem(key) ?? "[]"; } catch { return "[]"; }
}

export function subscribeCodes(update: () => void) {
  window.addEventListener("storage", update);
  window.addEventListener(changed, update);
  return () => {
    window.removeEventListener("storage", update);
    window.removeEventListener(changed, update);
  };
}

export function saveCode(code: string) {
  if (!validBookingCode(code)) return false;
  try {
    localStorage.setItem(key, JSON.stringify([code.toLowerCase(), ...parseCodes(readCodes()).filter(
      (saved) => saved !== code.toLowerCase(),
    )].slice(0, 25)));
    window.dispatchEvent(new Event(changed));
    return true;
  } catch {
    return false;
  }
}

export function bookingLink(code: string) {
  return "/agendamentos/detalhes#" + code;
}

export function readFragment() {
  const code = window.location.hash.slice(1);
  return validBookingCode(code) ? code.toLowerCase() : "";
}

export function subscribeFragment(update: () => void) {
  window.addEventListener("hashchange", update);
  return () => window.removeEventListener("hashchange", update);
}

export function bookingAction(action: string, data: object) {
  return postJson("/api/salons/customer-bookings/" + action, data);
}

export function bookingDate(day: string, time: string) {
  return formatDay.format(new Date(day + "T00:00:00Z")) + " às " + time;
}

export function bookingPrice(cents: number) {
  return money.format(cents / 100);
}

const tz = new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", timeZoneName: "longOffset" });
function bookingInstant(day: string, time: string) {
  const wall = new Date(day + "T" + time + ":00Z");
  const offset = tz.formatToParts(wall).find((part) => part.type === "timeZoneName")?.value.slice(3);
  return new Date(day + "T" + time + ":00" + (offset || "Z"));
}

function escapeCalendar(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/[,;]/g, "\\$&");
}

function foldCalendar(line: string) {
  const encoder = new TextEncoder();
  let result = "", bytes = 0;
  for (const char of line) {
    const length = encoder.encode(char).length;
    if (bytes + length > 73) { result += "\r\n "; bytes = 1; }
    result += char;
    bytes += length;
  }
  return result;
}

export function downloadBooking(b: ClientBooking, reminder: boolean) {
  const start = bookingInstant(b.day, b.time);
  const end = new Date(+start + b.minutes * 60_000);
  const timestamp = (d: Date) => d.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//StudioBook//Agendamentos//PT-BR", "BEGIN:VEVENT",
    "UID:" + b.id + "@studiobook", "SEQUENCE:" + b.revision, "DTSTAMP:" + timestamp(new Date()),
    "DTSTART:" + timestamp(start), "DTEND:" + timestamp(end),
    "SUMMARY:" + escapeCalendar(b.service + " · " + b.name), "LOCATION:" + escapeCalendar(b.address),
    ...(reminder ? ["BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:Seu horário no StudioBook", "END:VALARM"] : []),
    "END:VEVENT", "END:VCALENDAR",
  ];
  const url = URL.createObjectURL(new Blob([lines.map(foldCalendar).join("\r\n") + "\r\n"], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "studiobook-agendamento.ics";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
