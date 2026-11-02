import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { it } from "node:test";
import { dbAdmitGuest, dbPutEvent, dbPutGuests } from "./db.ts";
import type { Guest, WeddingEvent } from "./types.ts";

it("serializa ingresos simultáneos en IndexedDB y verifica el evento vigente", async () => {
  const event = { id: "event", secret: "secret", closed: false } as WeddingEvent;
  const guest = { id: "guest", eventId: event.id, token: "token", party: 2, status: "Pendiente" } as Guest;
  await dbPutEvent(event);
  await dbPutGuests([guest]);
  const input = { eventId: event.id, guestId: guest.id, expectedSecret: event.secret, token: guest.token, entry: "pase" as const };
  const results = await Promise.all([dbAdmitGuest(input), dbAdmitGuest(input)]);
  assert.deepEqual(results.map((r) => r.kind).sort(), ["ok", "used"]);
  assert.equal((await dbAdmitGuest({ ...input, token: "wrong" })).kind, "invalid");
  assert.equal((await dbAdmitGuest({ ...input, expectedSecret: "old" })).kind, "invalid");
  await dbPutEvent({ ...event, closed: true });
  assert.equal((await dbAdmitGuest(input)).kind, "closed");
});

it("conserva índices utilizados y elimina el índice de estado sin uso", async () => {
  const request = indexedDB.open("mievento");
  const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const indexes = db.transaction("guests").objectStore("guests").indexNames;
  assert.ok(indexes.contains("byEvent"));
  assert.ok(indexes.contains("byToken"));
  assert.equal(indexes.contains("byEventStatus"), false);
  db.close();
});
