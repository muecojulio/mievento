import type { Guest, WeddingEvent } from "@/lib/mievento/types";

const DB_NAME = "mievento";
const DB_VERSION = 1;

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
        guests.createIndex("byEventStatus", ["eventId", "status"], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
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
}

export async function dbPutGuests(guests: Guest[]): Promise<void> {
  if (guests.length === 0) return;
  const db = await openDb();
  const tx = db.transaction("guests", "readwrite");
  const store = tx.objectStore("guests");
  for (const guest of guests) store.put(guest);
  await txDone(tx);
}

export async function dbDeleteGuest(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("guests", "readwrite");
  tx.objectStore("guests").delete(id);
  await txDone(tx);
}

export async function dbDeleteEvent(eventId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["events", "guests"], "readwrite");
  tx.objectStore("events").delete(eventId);
  const index = tx.objectStore("guests").index("byEvent");
  const keys = await requestToPromise(index.getAllKeys(eventId));
  for (const key of keys) tx.objectStore("guests").delete(key);
  await txDone(tx);
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("No se pudo guardar"));
    tx.onabort = () => reject(tx.error ?? new Error("Guardado cancelado"));
  });
}
