/**
 * Prueba funcional del flujo de la puerta, sin navegador.
 *
 * Levanta IndexedDB (`fake-indexeddb`) y un localStorage en memoria, y ejercita
 * el código real de la app: importar la lista, generar pases firmados, admitir,
 * rechazar repetidos y falsificados, y guardar el pase en el Wallet.
 *
 * Uso: npm run test:flow
 */
import "fake-indexeddb/auto";

globalThis.window = globalThis;

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear(),
  key: (index) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size;
  },
};

const store = await import("@/lib/mievento/store");
const { dbGetAll } = await import("@/lib/mievento/db");
const wallet = await import("@/lib/mievento/wallet");

const results = [];
function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition) });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

await store.boot();

const event = await store.createEvent({
  groom: "Mateo",
  bride: "Valentina",
  date: "2026-11-14",
  time: "18:00",
  place: "Jardín del centro",
  photo: null,
});

const report = await store.addGuests(event.id, [
  { name: "Andrés Ríos", side: "novio", email: "andres@correo.com", phone: "5512345678", party: 2, note: "Mesa 1" },
  { name: "Elena Cruz", side: "novia", email: "elena@correo.com", phone: "5587654321", party: 2, note: "Mesa 4" },
]);
check("importa la lista del novio y de la novia", report.added === 2, `added=${report.added}`);

let guests = (await dbGetAll()).guests.filter((item) => item.eventId === event.id);
const andres = guests.find((item) => item.name === "Andrés Ríos");
check("genera un código firmado por invitado", andres?.token?.startsWith("ME1."), andres?.token);

const first = await store.admitToken(event.id, andres.token);
check("un código de la lista autoriza el paso", first.ok === true);

const repeated = await store.admitToken(event.id, andres.token);
check(
  "el mismo código (captura) no autoriza por segunda vez",
  repeated.ok === false && repeated.reason === "used",
  repeated.message,
);
check("el aviso marca la lectura como duplicada", repeated.duplicate === true);
check("el aviso trae la hora del primer ingreso", typeof repeated.firstEntryAt === "number");

guests = (await dbGetAll()).guests.filter((item) => item.eventId === event.id);
check(
  "el invitado queda como Ingresado en la memoria local",
  guests.find((item) => item.id === andres.id)?.status === "Ingresado",
);

const tampered = andres.token.replace(/.$/, andres.token.endsWith("A") ? "B" : "A");
const forged = await store.admitToken(event.id, tampered);
check("un código falsificado no autoriza el paso", forged.ok === false && forged.reason === "invalid");

const foreign = await store.admitToken(event.id, "ME1.otroevento.invitado.firmafirmafirmafirma");
check("un código que no está en la lista no autoriza el paso", foreign.ok === false && foreign.reason === "invalid");

const otherEvent = await store.createEvent({
  groom: "Luis",
  bride: "Ana",
  date: "2026-12-01",
  time: "17:00",
  place: "Salón",
  photo: null,
});
const crossEvent = await store.admitToken(otherEvent.id, andres.token);
check(
  "un pase de este evento no sirve en otro evento",
  crossEvent.ok === false && crossEvent.reason === "other-event",
);

const walkIn = await store.addWalkIn(event.id, { name: "Primo sin lista", side: "novia", party: 3 });
check("un invitado de última hora entra y cuenta", walkIn.ok === true && walkIn.guest.arrived === 3);

const sent = await store.markGuestSent(andres.id, "whatsapp");
check("se registra el envío del pase", sent?.sentVia === "whatsapp" && typeof sent?.sentAt === "number");
guests = (await dbGetAll()).guests;
check("el envío queda guardado en la tablet", guests.find((item) => item.id === andres.id)?.sentVia === "whatsapp");

const saved = wallet.savePassToWallet({
  token: andres.token,
  name: andres.name,
  groom: event.groom,
  bride: event.bride,
  date: event.date,
  time: event.time,
  place: event.place,
  side: andres.side,
  party: andres.party,
  motif: "hoja",
});
check("el pase se guarda en el Wallet con fecha y nombres", saved.added && wallet.isInWallet(andres.token));
check(
  "el Wallet conserva los nombres de los novios y el día",
  (memory.get(wallet.WALLET_STORAGE_KEY) ?? "").includes("Valentina") &&
    (memory.get(wallet.WALLET_STORAGE_KEY) ?? "").includes("2026-11-14"),
);

const failures = results.filter((item) => !item.ok);
console.log(`\n${results.length - failures.length}/${results.length} comprobaciones del flujo`);
process.exit(failures.length === 0 ? 0 : 1);
