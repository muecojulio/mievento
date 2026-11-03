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

it("restaura una instantánea atómicamente y no sobrescribe invitados de otros eventos", async () => {
  const { dbReplacePeerSnapshot, dbGetAll, dbApplyPeerChange } = await import("./db.ts");
  const event = { id: "paired-event", secret: "paired-secret" } as WeddingEvent;
  const g = { id: "paired-guest", eventId: event.id, token: "paired-token" } as Guest;
  await dbReplacePeerSnapshot(event, [g]);
  await assert.rejects(dbReplacePeerSnapshot(event, [{ ...g, id: "guest", token: "other-token" }]), /otro evento/);
  assert.ok((await dbGetAll()).guests.some((item) => item.id === g.id));
  await dbApplyPeerChange({ type: "delete-guest", id: "guest", eventId: event.id });
  assert.ok((await dbGetAll()).guests.some((item) => item.id === "guest"));
  await dbReplacePeerSnapshot(event, []);
  assert.equal((await dbGetAll()).guests.some((item) => item.id === g.id), false);
  assert.ok((await dbGetAll()).guests.some((item) => item.id === "guest"));
});
