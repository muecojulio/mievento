import { publishChange, type Change } from "@/lib/mievento/change-bus";
import { assignedDoorForGuest, effectiveDoorMode, normalizeDoors } from "@/lib/mievento/doors";
import type { EntryKind, EventDoor, Guest, WeddingEvent } from "@/lib/mievento/types";

const DB_NAME = "mievento";
const DB_VERSION = 2;

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("events")) {
        db.createObjectStore("events", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("guests")) {
        const guests = db.createObjectStore("guests", { keyPath: "id" });
        guests.createIndex("byEvent", "eventId", { unique: false });
        guests.createIndex("byToken", "token", { unique: true });
      }
      // No se consulta por estado: mantener ese índice solo encarece las escrituras.
      const guests = request.transaction!.objectStore("guests");
      if (guests.indexNames.contains("byEventStatus")) guests.deleteIndex("byEventStatus");
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
    request.onerror = () => {
      opening = null;
      reject(request.error ?? new Error("No se pudo abrir la memoria del evento"));
    };
  });
  return opening;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Error de memoria"));
  });
}

export async function dbGetAll(): Promise<{ events: WeddingEvent[]; guests: Guest[] }> {
  const db = await openDb();
  const tx = db.transaction(["events", "guests"], "readonly");
  const events = await requestToPromise(tx.objectStore("events").getAll() as IDBRequest<WeddingEvent[]>);
  const guests = await requestToPromise(tx.objectStore("guests").getAll() as IDBRequest<Guest[]>);
  return { events, guests };
}

export async function dbPutEvent(event: WeddingEvent): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("events", "readwrite");
  tx.objectStore("events").put(event);
  await txDone(tx);
  publishChange({ type: "event", event });
}

export async function dbPutGuests(guests: Guest[]): Promise<void> {
  if (guests.length === 0) return;
  const db = await openDb();
  const tx = db.transaction("guests", "readwrite");
  const store = tx.objectStore("guests");
  for (const guest of guests) store.put(guest);
  await txDone(tx);
  publishChange({ type: "guests", guests });
}

export async function dbDeleteGuest(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("guests", "readwrite");
  const guest = await requestToPromise(tx.objectStore("guests").get(id)) as Guest | undefined;
  tx.objectStore("guests").delete(id);
  await txDone(tx);
  if (guest) publishChange({ type: "delete-guest", id, eventId: guest.eventId });
}

export async function dbDeleteEvent(eventId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["events", "guests"], "readwrite");
  tx.objectStore("events").delete(eventId);
  const index = tx.objectStore("guests").index("byEvent");
  const keys = await requestToPromise(index.getAllKeys(eventId));
  for (const key of keys) tx.objectStore("guests").delete(key);
  await txDone(tx);
  publishChange({ type: "delete-event", eventId });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("No se pudo guardar"));
    tx.onabort = () => reject(tx.error ?? new Error("Guardado cancelado"));
  });
}

export type DbAdmitOutput =
  | { kind: "ok" | "used"; guest: Guest }
  | { kind: "invalid" }
  | { kind: "closed" }
  | { kind: "no-door" }
  | { kind: "wrong-door"; guest: Guest; assignedDoor: EventDoor; currentDoor: EventDoor };

// La lectura y el cambio de estado ocurren en una sola transacción compartida
// entre pestañas del mismo navegador. En modo «asignada» también verifica en
// la misma transacción que el pase pertenezca a la puerta de esta tablet.
export async function dbAdmitGuest(input: {
  guestId: string;
  eventId: string;
  expectedSecret: string;
  token?: string;
  entry: EntryKind;
  arrived?: number;
  tabletDoorId?: string | null;
  doorName?: string | null;
}): Promise<DbAdmitOutput> {
  const db = await openDb();
  const tx = db.transaction(["events", "guests"], "readwrite");
  const done = txDone(tx);
  const events = tx.objectStore("events");
  const guests = tx.objectStore("guests");
  const [event, guest] = await Promise.all([
    requestToPromise(events.get(input.eventId) as IDBRequest<WeddingEvent | undefined>),
    requestToPromise(guests.get(input.guestId) as IDBRequest<Guest | undefined>),
  ]);
  let result: DbAdmitOutput;
  if (
    !event ||
    event.secret !== input.expectedSecret ||
    !guest ||
    guest.eventId !== event.id ||
    (input.token !== undefined && guest.token !== input.token)
  ) {
    result = { kind: "invalid" };
  } else if (event.closed) {
    result = { kind: "closed" };
  } else {
    const mode = effectiveDoorMode(event);
    let stampDoor: string | null = input.doorName?.trim() || null;
    let blocked: DbAdmitOutput | null = null;

    if (mode === "asignada") {
      const doors = normalizeDoors(event.doors);
      const currentDoor = input.tabletDoorId
        ? doors.find((door) => door.id === input.tabletDoorId) ?? null
        : null;
      if (!currentDoor) {
        blocked = { kind: "no-door" };
      } else {
        const assignedDoor = assignedDoorForGuest(event, guest);
        if (assignedDoor && assignedDoor.id !== currentDoor.id) {
          blocked = { kind: "wrong-door", guest, assignedDoor, currentDoor };
        } else {
          stampDoor = currentDoor.name;
        }
      }
    }

    if (blocked) {
      result = blocked;
    } else if (guest.status === "Ingresado") {
      result = { kind: "used", guest };
    } else {
      const party = Number.isFinite(guest.party) ? Math.max(1, Math.min(20, Math.round(guest.party))) : 1;
      const requested = input.arrived ?? party;
      const arrived = Number.isFinite(requested) && requested >= 1 ? Math.min(party, Math.round(requested)) : party;
      const next: Guest = {
        ...guest,
        status: "Ingresado",
        scannedAt: Date.now(),
        arrived,
        entry: input.entry,
        admittedDoor: stampDoor,
      };
      guests.put(next);
      result = { kind: "ok", guest: next };
    }
  }
  await done;
  if (result.kind === "ok") publishChange({ type: "guests", guests: [result.guest] });
  return result;
}

/** Apply a paired peer's operation atomically, without echoing it back. */
export async function dbApplyPeerChange(change: Change): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["events", "guests"], "readwrite");
  const done = txDone(tx);
  const es = tx.objectStore("events"), gs = tx.objectStore("guests");
  if (change.type === "event") es.put(change.event);
  if (change.type === "guests") for (const guest of change.guests) {
    const existing = await requestToPromise(gs.get(guest.id)) as Guest | undefined;
    if (existing && existing.eventId !== guest.eventId) { tx.abort(); await done.catch(() => undefined); throw new Error("El cambio pertenece a otro evento"); }
    gs.put(guest);
  }
  if (change.type === "delete-guest") {
    const existing = await requestToPromise(gs.get(change.id)) as Guest | undefined;
    if (existing?.eventId === change.eventId) gs.delete(change.id);
  }
  if (change.type === "delete-event") {
    es.delete(change.eventId);
    const keys = await requestToPromise(gs.index("byEvent").getAllKeys(change.eventId));
    for (const id of keys) gs.delete(id);
  }
  await done;
}

export async function dbReplacePeerSnapshot(event: WeddingEvent, list: Guest[]): Promise<void> {
  if (!event.id || !event.secret || list.length > 2000 || new Set(list.map((g) => g.id)).size !== list.length || list.some((g) => g.eventId !== event.id || !g.id || !g.token)) throw new Error("Evento recibido no válido");
  const db = await openDb();
  const tx = db.transaction(["events", "guests"], "readwrite");
  const done = txDone(tx);
  const store = tx.objectStore("guests");
  for (const guest of list) {
    const existing = await requestToPromise(store.get(guest.id)) as Guest | undefined;
    if (existing && existing.eventId !== event.id) { tx.abort(); await done.catch(() => undefined); throw new Error("La copia contiene identificadores de otro evento"); }
  }
  const keys = await requestToPromise(store.index("byEvent").getAllKeys(event.id));
  for (const key of keys) store.delete(key);
  tx.objectStore("events").put(event);
  for (const guest of list) store.put(guest);
  await done;
}
