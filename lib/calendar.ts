export function salonToday() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function postJson(path: string, payload: unknown) {
  return fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "X-StudioBook": "1" },
    body: JSON.stringify(payload) });
}

export function addCalendarDays(day: string, amount: number) {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function addCalendarMonths(month: string, amount: number) {
  const date = new Date(month + "-01T00:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}
