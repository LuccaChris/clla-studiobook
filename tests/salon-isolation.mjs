// Run against two provisioned salons in a disposable test database.
import assert from "node:assert/strict";

const env = name => {
  if (!process.env[name]) throw new Error("Configure " + name);
  return process.env[name];
};
const base = env("TEST_ORIGIN") + "/api/salons/";
const salonA = base + encodeURIComponent(env("TEST_SALON_A"));
const salonB = base + encodeURIComponent(env("TEST_SALON_B"));
assert.notEqual(salonA,salonB);
const headers = {"Content-Type":"application/json","X-StudioBook":"1"};
async function login(url, email, password) {
  return fetch(url + "/login", {method:"POST",headers,body:JSON.stringify({email,password})});
}
const credentialsA = [env("TEST_EMAIL_A"),env("TEST_PASSWORD_A")];
const credentialsB = [env("TEST_EMAIL_B"),env("TEST_PASSWORD_B")];
assert.notDeepEqual(credentialsA,credentialsB);
assert.equal((await login(salonB,...credentialsA)).status,401);
const session = async (url,credentials) => {
  const response = await login(url,...credentials);
  assert.equal(response.status,204);
  const cookie = response.headers.getSetCookie().find(c=>c.startsWith("studiobook.admin="));
  assert.ok(cookie);
  return {Cookie:cookie.split(";")[0]};
};
const a = await session(salonA,credentialsA);
const b = await session(salonB,credentialsB);
const agenda = "/admin/bookings?day=2026-01-01";
assert.equal((await fetch(salonA+agenda)).status,401);
for (const [local,foreign,sessionHeaders] of [[salonA,salonB,a],[salonB,salonA,b]]) {
  assert.equal((await fetch(local+agenda,{headers:sessionHeaders})).status,200);
  assert.equal((await fetch(foreign+agenda,{headers:sessionHeaders})).status,403);
  const response = await fetch(foreign+"/admin/bookings/00000000-0000-0000-0000-000000000000/cancel",
    {method:"POST",headers:{...headers,...sessionHeaders},body:"{}"});
  assert.equal(response.status,403);
}
console.log("Isolamento entre salões verificado.");
