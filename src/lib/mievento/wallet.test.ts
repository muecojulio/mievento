import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseWallet, serializeWallet, sortWallet, upsertWallet, type WalletPass } from "./wallet.ts";

function pass(overrides: Partial<WalletPass> = {}): WalletPass {
  return {
    token: "ME1.evento0001.invitado01.firmafirmafirma01",
    name: "Andrés Ríos",
    groom: "Mateo",
    bride: "Valentina",
    date: "2026-11-14",
    time: "18:00",
    place: "Jardín del centro",
    side: "novio",
    party: 2,
    motif: "hoja",
    savedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("wallet", () => {
  it("un Wallet vacío o roto no revienta", () => {
    assert.deepEqual(parseWallet(null), []);
    assert.deepEqual(parseWallet(""), []);
    assert.deepEqual(parseWallet("{no es json"), []);
    assert.deepEqual(parseWallet('{"token":"x"}'), []);
  });

  it("guarda y recupera el pase con fecha y nombres", () => {
    const saved = parseWallet(serializeWallet([pass()]));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].name, "Andrés Ríos");
    assert.equal(saved[0].date, "2026-11-14");
    assert.equal(saved[0].groom, "Mateo");
    assert.equal(saved[0].bride, "Valentina");
  });

  it("descarta entradas sin código, sin nombre o sin fecha", () => {
    const raw = serializeWallet([
      pass({ token: "ME1.a.b.c" }),
      pass({ token: "", name: "Sin código" }),
      pass({ token: "ME1.sin.nombre.c", name: "" }),
      pass({ token: "ME1.sin.fecha.c", date: "" }),
    ]);
    const saved = parseWallet(raw);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].token, "ME1.a.b.c");
  });

  it("no duplica el mismo código y deja el más reciente primero", () => {
    const older = pass({ savedAt: 1 });
    const newer = pass({ name: "Andrés Ríos (actualizado)", savedAt: 2 });
    const list = upsertWallet(upsertWallet([], older), newer);
    assert.equal(list.length, 1);
    assert.equal(list[0].savedAt, 2);
    assert.equal(list[0].name, "Andrés Ríos (actualizado)");
  });

  it("respeta el límite del Wallet", () => {
    let list: WalletPass[] = [];
    for (let i = 0; i < 5; i++) {
      list = upsertWallet(list, pass({ token: `ME1.token${i}.guest.sig`, savedAt: i }), 3);
    }
    assert.equal(list.length, 3);
    assert.equal(list[0].savedAt, 4);
  });

  it("ordena por fecha del evento para mostrar los pases", () => {
    const a = pass({ token: "a1.b.c", date: "2026-12-01", name: "Zoe" });
    const b = pass({ token: "a2.b.c", date: "2026-11-01", name: "Ana" });
    const order = sortWallet([a, b]);
    assert.equal(order[0].date, "2026-11-01");
    assert.equal(order[1].date, "2026-12-01");
  });
});
