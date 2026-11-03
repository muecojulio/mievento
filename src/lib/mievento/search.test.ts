import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchLabel, searchGuests, type MatchField } from "./search.ts";
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

const list = [
  guest({ id: "a", name: "Andrés Ríos", note: "Mesa 2", phone: "55 1234 5678", email: "andres@ejemplo.com" }),
  guest({ id: "b", name: "Elena Cruz", note: "Mesa 10", phone: "+52 55 8765 4321", email: "elena@ejemplo.com" }),
  guest({ id: "c", name: "Diego Salinas", note: "", phone: "", email: "" }),
];

describe("búsqueda en la puerta", () => {
  it("requiere al menos dos caracteres", () => {
    assert.deepEqual(searchGuests(list, "A"), []);
    assert.equal(searchGuests(list, "An").length, 1);
  });

  it("encuentra por nombre, sin importar acentos o mayúsculas", () => {
    const found = searchGuests(list, "elena");
    assert.equal(found[0].guest.id, "b");
    assert.equal(found[0].field, "nombre");
    assert.equal(searchGuests(list, "ANDRÉS")[0].guest.id, "a");
  });

  it("encuentra por mesa y devuelve a todos los de esa mesa", () => {
    const found = searchGuests(list, "mesa 2");
    assert.equal(found.length, 1);
    assert.equal(found[0].guest.id, "a");
    assert.equal(found[0].field, "mesa");
  });

  it("encuentra por teléfono aunque el Excel traiga espacios o +52", () => {
    const byLocal = searchGuests(list, "12345678");
    assert.equal(byLocal[0].guest.id, "a");
    assert.equal(byLocal[0].field, "teléfono");
    const byFull = searchGuests(list, "87654321");
    assert.equal(byFull[0].guest.id, "b");
  });

  it("encuentra por correo y no confunde letras con teléfonos", () => {
    const found = searchGuests(list, "ELENA@EJEMPLO.COM");
    assert.equal(found[0].guest.id, "b");
    assert.equal(found[0].field, "correo");
    assert.equal(searchGuests(list, "elena").every((match) => match.field !== "teléfono"), true);
  });

  it("respeta el límite y ordena por nombre", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      guest({ id: `g${index}`, name: `Invitado ${String(index).padStart(2, "0")} Mesa` }),
    );
    const found = searchGuests(many, "Mesa", 5);
    assert.equal(found.length, 5);
    assert.equal(found[0].guest.name, "Invitado 00 Mesa");
  });

  it("traduce el campo coincidente para la interfaz", () => {
    const fields: MatchField[] = ["nombre", "mesa", "teléfono", "correo"];
    assert.deepEqual(fields.map(matchLabel), ["Nombre", "Mesa", "Teléfono", "Correo"]);
  });
});
