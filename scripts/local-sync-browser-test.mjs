import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("screenshots", { recursive: true });
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  headless: true,
});
const errors = [];
const aContext = await browser.newContext();
const bContext = await browser.newContext();
const a = await aContext.newPage();
const tab = await aContext.newPage();
const b = await bContext.newPage();
for (const p of [a, tab, b]) p.on("pageerror", (e) => errors.push(e.message));
try {
  await a.goto(process.env.APP_URL || "http://127.0.0.1:8080/");
  await a.getByText("Mateo y Valentina", { exact: false }).first().waitFor();
  await tab.goto(process.env.APP_URL || "http://127.0.0.1:8080/");
  await b.goto(process.env.APP_URL || "http://127.0.0.1:8080/");
  assert.equal(await a.locator("main").count(), 1, "single app root");
  await a.screenshot({ path: "screenshots/sync-desktop.png", fullPage: true });
  const id = await a.evaluate(async () => {
    const s = await import("/src/lib/mievento/store.ts");
    const e = await s.createEvent({
      groom: "Prueba",
      bride: "Sincronía",
      date: "2026-12-01",
      time: "18:00",
      place: "Salón",
      photo: null,
    });
    await s.addGuests(e.id, [
      { name: "Invitado Sync", side: "novio", email: "", phone: "", party: 2, note: "" },
    ]);
    return e.id;
  });
  await tab
    .getByText("Prueba & Sincronía", { exact: false })
    .first()
    .waitFor({ timeout: 10000 })
    .catch(async () => {
      const txt = await tab.locator("body").innerText();
      assert.ok(txt.includes("Prueba") && txt.includes("Sincronía"), txt);
    });
  console.log("PASS BroadcastChannel updates a second tab");
  const offer = await a.evaluate(
    async (id) => (await import("/src/lib/mievento/local-sync.ts")).offerSync(id),
    id,
  );
  const answer = await b.evaluate(
    async (offer) => (await import("/src/lib/mievento/local-sync.ts")).answerSync(offer),
    offer,
  );
  await a.evaluate(
    async (answer) => (await import("/src/lib/mievento/local-sync.ts")).completeSync(answer),
    answer,
  );
  await b.waitForFunction(
    async (id) => {
      const db = await import("/src/lib/mievento/db.ts");
      return (await db.dbGetAll()).guests.some((g) => g.eventId === id);
    },
    id,
    { timeout: 20000 },
  );
  console.log("PASS WebRTC QR offer/answer and initial snapshot");
  const guestId = await b.evaluate(async (id) => {
    const db = await import("/src/lib/mievento/db.ts");
    const g = (await db.dbGetAll()).guests.find((g) => g.eventId === id);
    const s = await import("/src/lib/mievento/store.ts");
    await s.admitByName(g.id);
    return g.id;
  }, id);
  await a.waitForFunction(async (guestId) => {
    const db = await import("/src/lib/mievento/db.ts");
    return (await db.dbGetAll()).guests.find((g) => g.id === guestId)?.status === "Ingresado";
  }, guestId);
  console.log("PASS receiver admissions propagate to host");
  await tab.evaluate(async (guestId) => {
    const s = await import("/src/lib/mievento/store.ts");
    await s.setArrived(guestId, 1);
  }, guestId);
  await b.waitForFunction(async (guestId) => {
    const db = await import("/src/lib/mievento/db.ts");
    return (await db.dbGetAll()).guests.find((g) => g.id === guestId)?.arrived === 1;
  }, guestId);
  console.log("PASS other-tab edits relay through paired tab");
  await a.goto(new URL(`evento/${id}`, process.env.APP_URL || "http://127.0.0.1:8080/").href);
  await a.getByRole("button", { name: "Copias y conexión de tablets" }).click();
  await a.getByRole("heading", { name: "Copia cifrada con contraseña" }).waitFor();
  await a.getByRole("button", { name: "1. Generar QR principal" }).click();
  await a.getByRole("img", { name: "QR de oferta: escanear en la tablet receptora" }).waitFor();
  console.log("PASS pairing QR renders");

  await a.screenshot({ path: "screenshots/sync-dashboard.png", fullPage: true });
  await a.setViewportSize({ width: 390, height: 844 });
  await a.screenshot({ path: "screenshots/sync-mobile.png", fullPage: true });
  assert.equal(
    await a.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    "mobile overflow",
  );
  assert.deepEqual(errors, []);
  console.log("PASS rendering, mobile width, clean runtime");
} finally {
  await browser.close();
}
