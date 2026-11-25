export function salonToday() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function postJson(path: string, payload: unknown) {
  return fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "X-StudioBook": "1" },
    body: JSON.stringify(payload) });
}
