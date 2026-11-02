import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { it } from "node:test";

it("actualiza la base anterior sin borrar eventos ni invitados", async () => {
  const request = indexedDB.open("mievento", 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    db.createObjectStore("events", { keyPath: "id" }).put({ id: "old-event" });
    const guests = db.createObjectStore("guests", { keyPath: "id" });
    guests.createIndex("byEvent", "eventId");
    guests.createIndex("byToken", "token", { unique: true });
    guests.createIndex("byEventStatus", ["eventId", "status"]);
    guests.put({ id: "old-guest", eventId: "old-event", token: "token", status: "Pendiente" });
  };
  const old = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  old.close();
  const { dbGetAll } = await import("./db.ts");
  const data = await dbGetAll();
  assert.equal(data.events[0].id, "old-event");
  assert.equal(data.guests[0].id, "old-guest");
  const open = indexedDB.open("mievento");
  const db = await new Promise<IDBDatabase>((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
  assert.equal(db.version, 2);
  assert.equal(db.transaction("guests").objectStore("guests").indexNames.contains("byEventStatus"), false);
  db.close();
});
