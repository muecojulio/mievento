import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contactClashes, emailKey, phoneKey, withoutRepeatedContacts } from "./excel.ts";
import type { DraftGuest, Guest } from "./types.ts";

function draft(overrides: Partial<DraftGuest>): DraftGuest {
  return { name: "Ana", side: "novio", email: "", phone: "", party: 1, note: "", ...overrides };
}

function existing(overrides: Partial<Guest>): Guest {
  return {
    id: "g1",
    eventId: "e1",
    name: "Ya en lista",
    side: "novio",
    email: "",
    phone: "",
    party: 1,
    note: "",
    status: "Pendiente",
    token: "ME1.x",
    scannedAt: null,
    arrived: null,
    entry: null,
    ...overrides,
  };
}

describe("duplicados por contacto al importar", () => {
  it("normaliza teléfonos mexicanos y correos", () => {
    assert.equal(phoneKey("55 1234 5678"), "5512345678");
    assert.equal(phoneKey("+52 55 1234 5678"), "5512345678");
    assert.equal(phoneKey("123"), null);
    assert.equal(emailKey("  ANA@Ejemplo.com "), "ana@ejemplo.com");
    assert.equal(emailKey("sin arroba"), null);
  });

  it("detecta el mismo teléfono con y sin +52 dentro del archivo", () => {
    const clashes = contactClashes(
      [draft({ name: "Ana", phone: "5512345678" }), draft({ name: "Ana Ríos", phone: "+52 55 1234 5678" })],
      [],
    );
    assert.equal(clashes.length, 1);
    assert.equal(clashes[0].kind, "teléfono");
    assert.equal(clashes[0].inFile, 2);
    assert.equal(clashes[0].already, false);
  });

  it("avisa si el contacto ya está en la lista", () => {
    const clashes = contactClashes(
      [draft({ name: "Nuevo", email: "ana@ejemplo.com" })],
      [existing({ email: "ANA@EJEMPLO.COM" })],
    );
    assert.equal(clashes.length, 1);
    assert.equal(clashes[0].already, true);
    assert.equal(clashes[0].kind, "correo");
  });

  it("no reporta contactos únicos ni vacíos", () => {
    assert.deepEqual(contactClashes([draft({ name: "Ana", phone: "5512345678" })], []), []);
    assert.deepEqual(contactClashes([draft({ name: "Ana" })], []), []);
  });

  it("omite repetidos conservando la primera fila y respeta la lista existente", () => {
    const rows = [
      draft({ name: "Primero", phone: "5512345678" }),
      draft({ name: "Segundo", phone: "+52 55 1234 5678" }),
      draft({ name: "Tercero", email: "ana@ejemplo.com" }),
      draft({ name: "Cuarto", email: "ANA@ejemplo.com" }),
      draft({ name: "Sin datos" }),
    ];
    const result = withoutRepeatedContacts(rows, [existing({ phone: "5587654321" })]);
    assert.deepEqual(
      result.kept.map((row) => row.name),
      ["Primero", "Tercero", "Sin datos"],
    );
    assert.equal(result.omitted, 2);
  });
});
