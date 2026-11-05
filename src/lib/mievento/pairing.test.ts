import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidPin,
  newPairingPin,
  normalizePin,
  pairingProof,
  verifyPairingProof,
} from "./pairing.ts";

test("el PIN es de 6 dígitos, aleatorio y se normaliza", () => {
  const pins = new Set<string>();
  for (let i = 0; i < 200; i += 1) {
    const pin = newPairingPin();
    assert.match(pin, /^\d{6}$/);
    pins.add(pin);
  }
  assert.ok(pins.size > 150, "el PIN debe variar entre generaciones");
  assert.equal(normalizePin("123 456"), "123456");
  assert.equal(normalizePin("123-456"), "123456");
  assert.equal(normalizePin("12a34567"), "123456");
  assert.equal(isValidPin("123456"), true);
  assert.equal(isValidPin("12345"), false);
  assert.equal(isValidPin(""), false);
});

test("la prueba depende del PIN, de la sesión y del evento", async () => {
  const pin = "123456";
  const session = "sesion-a";
  const proof = await pairingProof(pin, session, "evento-1");
  assert.ok(proof.length > 20);
  // La prueba no contiene el PIN en claro.
  assert.equal(proof.includes(pin), false);
  assert.equal(await verifyPairingProof(pin, session, "evento-1", proof), true);
  // Otro PIN, otra sesión u otro evento no validan.
  assert.equal(await verifyPairingProof("654321", session, "evento-1", proof), false);
  assert.equal(await verifyPairingProof(pin, "sesion-b", "evento-1", proof), false);
  assert.equal(await verifyPairingProof(pin, session, "evento-2", proof), false);
});

test("la verificación rechaza entradas malformadas sin lanzar", async () => {
  assert.equal(await verifyPairingProof("123456", "s", "e", ""), false);
  assert.equal(await verifyPairingProof("123456", "s", "e", "no-es-base64"), false);
  assert.equal(await verifyPairingProof("123456", "s", "e", "A".repeat(200)), false);
  assert.equal(await verifyPairingProof("12", "s", "e", "AAAA"), false);
  await assert.rejects(pairingProof("12", "s", "e"), /6 dígitos/);
});
