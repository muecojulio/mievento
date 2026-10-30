import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractToken,
  makeToken,
  parseToken,
  randomId,
  randomSecret,
  safeEqual,
  signBody,
} from "./crypto.ts";
import { tally } from "./format.ts";
import type { Guest } from "./types.ts";

function guest(overrides: Partial<Guest>): Guest {
  return {
    id: "invitado01",
    eventId: "evento0001",
    name: "Andrés Ríos",
    side: "novio",
    email: "",
    phone: "",
    party: 2,
    note: "",
    status: "Pendiente",
    token: "",
    scannedAt: null,
    arrived: null,
    entry: null,
    ...overrides,
  };
}

describe("códigos de un solo uso", () => {
  it("el código que genera la app se lee de vuelta", async () => {
    const secret = randomSecret();
    const eventId = randomId();
    const guestId = randomId();
    const token = await makeToken(secret, eventId, guestId);
    const parsed = parseToken(token);
    assert.ok(parsed);
    assert.equal(parsed.eventId, eventId);
    assert.equal(parsed.guestId, guestId);
    assert.equal(parsed.token, token);
  });

  it("un código falsificado no coincide con la firma del evento", async () => {
    const secret = randomSecret();
    const eventId = randomId();
    const guestId = randomId();
    const token = await makeToken(secret, eventId, guestId);
    const parsed = parseToken(token);
    assert.ok(parsed);
    const forged = await makeToken(randomSecret(), eventId, guestId);
    const forgedParsed = parseToken(forged);
    assert.ok(forgedParsed);
    assert.equal(safeEqual(forgedParsed.sig, parsed.sig), false);
    const expected = await signBody(secret, `ME1.${parsed.eventId}.${parsed.guestId}`);
    assert.equal(safeEqual(expected, parsed.sig), true);
  });

  it("cambiar el invitado o el evento invalida la firma", async () => {
    const secret = randomSecret();
    const eventId = randomId();
    const guestId = randomId();
    const token = await makeToken(secret, eventId, guestId);
    const parsed = parseToken(token);
    assert.ok(parsed);
    const otherGuest = await signBody(secret, `ME1.${eventId}.${randomId()}`);
    const otherEvent = await signBody(secret, `ME1.${randomId()}.${guestId}`);
    assert.equal(safeEqual(otherGuest, parsed.sig), false);
    assert.equal(safeEqual(otherEvent, parsed.sig), false);
  });

  it("lee el código desde el enlace del pase y desde texto suelto", async () => {
    const token = await makeToken(randomSecret(), randomId(), randomId());
    assert.equal(extractToken(token), token);
    assert.equal(extractToken(`  ${token}  `), token);
    assert.equal(extractToken(`https://miapp.mx/pase#t=${token}&n=Ana`), token);
    assert.equal(extractToken("hola, aquí está tu pase"), "hola, aquí está tu pase");
  });

  it("textos ajenos no se confunden con un pase", () => {
    assert.equal(parseToken("https://ejemplo.mx"), null);
    assert.equal(parseToken("ME1.corto"), null);
    assert.equal(parseToken(""), null);
  });
});

describe("conteo del evento", () => {
  it("cuenta novio, novia y total con las personas que entraron", () => {
    const list = [
      guest({ id: "a", side: "novio", party: 2, status: "Ingresado", arrived: 2 }),
      guest({ id: "b", side: "novio", party: 3, status: "Ingresado", arrived: 1 }),
      guest({ id: "c", side: "novia", party: 4 }),
      guest({ id: "d", side: "novia", party: 1, status: "Ingresado", arrived: 1 }),
    ];
    const counts = tally(list);
    assert.equal(counts.novioIn, 2);
    assert.equal(counts.noviaIn, 1);
    assert.equal(counts.totalIn, 3);
    assert.equal(counts.novioPeople, 3);
    assert.equal(counts.noviaPeople, 1);
    assert.equal(counts.totalPeople, 4);
    assert.equal(counts.pendingInvites, 1);
    assert.equal(counts.expectedPeople, 10);
  });
});
