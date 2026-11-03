import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_TABLE, tableGroups } from "./tables.ts";
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

describe("vista de mesas", () => {
  it("con la lista vacía no hay grupos", () => {
    assert.deepEqual(tableGroups([]), []);
  });

  it("agrupa, ordena numéricamente y deja 'Sin mesa' al final", () => {
    const groups = tableGroups([
      guest({ id: "a", note: "Mesa 10", party: 3, status: "Ingresado", arrived: 2 }),
      guest({ id: "b", note: "  Mesa 2 ", party: 2 }),
      guest({ id: "c", note: "", party: 1 }),
      guest({ id: "d", note: "Mesa 2", party: 4, status: "Ingresado" }),
    ]);
    assert.deepEqual(
      groups.map((group) => group.table),
      ["Mesa 2", "Mesa 10", NO_TABLE],
    );
    assert.equal(groups[0].invitations, 2);
    assert.equal(groups[0].admitted, 1);
    assert.equal(groups[0].expectedPeople, 6);
    assert.equal(groups[0].insidePeople, 4);
    assert.equal(groups[2].expectedPeople, 1);
  });

  it("cuenta a los que llegaron de menos y no suma a los pendientes", () => {
    const groups = tableGroups([
      guest({ id: "a", note: "Mesa 1", party: 6, status: "Ingresado", arrived: 2 }),
      guest({ id: "b", note: "Mesa 1", party: 3, status: "Pendiente" }),
    ]);
    assert.equal(groups[0].expectedPeople, 9);
    assert.equal(groups[0].insidePeople, 2);
    assert.equal(groups[0].admitted, 1);
  });

  it("junta variantes de acento, mayúsculas y espacios de la misma mesa", () => {
    const groups = tableGroups([
      guest({ id: "a", note: "Mesa 3" }),
      guest({ id: "b", note: "mesa 3 ", party: 1 }),
      guest({ id: "c", note: "MÉSA 3", party: 1 }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].table, "Mesa 3");
    assert.equal(groups[0].invitations, 3);
  });
});
