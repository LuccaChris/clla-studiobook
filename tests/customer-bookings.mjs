import assert from "node:assert/strict";

if (!process.env.TEST_ORIGIN) throw new Error("Configure TEST_ORIGIN (somente banco descartável).");
const base = new URL("/api/salons/", process.env.TEST_ORIGIN).href;
const salon = "studio-amaral", serviceId = "demo-corte";
const headers = { "Content-Type": "application/json", "X-StudioBook": "1" };
const send = (path, payload) => fetch(base + path, { method: "POST", headers, body: JSON.stringify(payload) });
const manage = (action, payload) => send("customer-bookings/" + action, payload);
const at = (day) => fetch(base + salon + "/slots?" + new URLSearchParams({ day, serviceId })).then((r) => r.json());
const clock = new Date();
const date = (d) => {
  const f = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date(+clock + d * 86400000));
};
const dayWithTimes = [];
for (let n = 2; n <= 14 && dayWithTimes.length < 2; n++) {
  const day = date(n), options = await at(day);
  if (options.length) dayWithTimes.push({ day, time: options[0] });
}
assert.equal(dayWithTimes.length, 2);
const [first, second] = dayWithTimes;
const catalogue = await fetch(base + salon).then((r) => r.json());
const service = catalogue.services.find((s) => s.id === serviceId);
assert(service);
const quoted = { expectedPriceInCents: service.priceInCents, expectedMinutes: service.minutes };
const publicBooking = { ...first, serviceId, customer: "Confirmação de valor QA" };
const stalePrice = { ...quoted, expectedPriceInCents: service.priceInCents + 1 };
const staleDuration = { ...quoted, expectedMinutes: service.minutes + 1 };
for (const quote of [{}, stalePrice, staleDuration]) {
  const response = await send(salon + "/bookings", { ...publicBooking, ...quote });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { code: "service_changed", priceInCents: service.priceInCents, minutes: service.minutes });
  assert((await at(first.day)).includes(first.time), "Oferta não confirmada não pode ocupar a agenda");
}
const make = async (selection) => {
  const response = await send(salon + "/bookings", { ...selection, ...quoted, serviceId, customer: "Cliente fictício CI" });
  assert.equal(response.status, 200);
  const { manageCode } = await response.json();
  assert.match(manageCode, /^[a-f0-9]{64}$/);
  return manageCode;
};
const code = await make(first);
const other = await make(second);
assert.equal((await manage("details", { code: "" })).status, 404);
const details = async () => {
  const r = await manage("details", { code });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("cache-control"), /no-store/);
  return r.json();
};
const initial = await details();
assert.equal(initial.name, "Studio Amaral");
assert.equal(initial.status, "upcoming");
assert.equal(initial.day, first.day);
assert.equal(initial.time, first.time);
assert.equal(initial.minutes, 45);
assert.notEqual(code, other);
assert.equal((await manage("reschedule", { code, revision: initial.revision, ...second })).status, 409);
assert.equal((await details()).time, first.time);
assert(!(await at(first.day)).includes(first.time));
assert.equal((await manage("cancel", { code: other, revision: 0 })).status, 204);
assert.equal((await manage("reschedule", { code, revision: initial.revision, ...second })).status, 204);
assert((await at(first.day)).includes(first.time));
assert(!(await at(second.day)).includes(second.time));
const moved = await details();
assert.equal(moved.day, second.day);
assert.equal(moved.id, initial.id);
assert.equal(moved.revision, 1);
assert.equal((await manage("cancel", { code, revision: 0 })).status, 409);
assert.equal((await details()).status, "upcoming");
assert.equal((await manage("cancel", { code, revision: moved.revision })).status, 204);
assert((await at(second.day)).includes(second.time));
assert.equal((await details()).status, "cancelled");
console.log("Agendamento privado, conflito sem perder a reserva, remarcação, revisão e cancelamento verificados.");
