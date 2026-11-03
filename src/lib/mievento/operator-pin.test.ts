import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  changePin,
  checkPin,
  clearPin,
  derivePinHash,
  hasPin,
  readPin,
  safeHashEqual,
  setPin,
  validPin,
} from "./operator-pin.ts";

// Web Crypto está disponible en Node 22 y en navegadores HTTPS/localhost.
// localStorage se simula con un mapa, igual que en la tablet pero en memoria.
const memory = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
  clear: () => memory.clear(),
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size;
  },
} as Storage;

beforeEach(() => memory.clear());

describe("PIN del operador", () => {
  it("solo acepta de 4 a 8 dígitos", () => {
    assert.equal(validPin("1234"), true);
    assert.equal(validPin("12345678"), true);
    assert.equal(validPin("123"), false);
    assert.equal(validPin("12a4"), false);
    assert.equal(validPin("123456789"), false);
  });

  it("guarda sal, hash e iteraciones, nunca el PIN en claro", async () => {
    await setPin("2468");
    const record = readPin();
    assert.ok(record);
    assert.equal(record.hash.includes("2468"), false);
    assert.ok(record.salt.length > 10);
    assert.equal(record.iterations, 120_000);
    assert.equal(memory.get("mievento-operator-pin")?.includes('"2468"'), false);
    assert.equal(hasPin(), true);
  });

  it("verifica el PIN correcto y rechaza los demás", async () => {
    await setPin("1357");
    assert.equal(await checkPin("1357"), true);
    assert.equal(await checkPin("1358"), false);
    assert.equal(await checkPin("xx"), false);
  });

  it("sin PIN configurado no bloquea ninguna acción", async () => {
    assert.equal(hasPin(), false);
    assert.equal(await checkPin(""), true);
  });

  it("cambiar requiere el PIN actual y permite quitarlo", async () => {
    await setPin("1111");
    assert.equal(await changePin("0000", "2222"), false);
    assert.equal(await checkPin("1111"), true);
    assert.equal(await changePin("1111", "2222"), true);
    assert.equal(await checkPin("2222"), true);
    clearPin();
    assert.equal(hasPin(), false);
  });

  it("ignora un registro corrupto o manipulado", () => {
    memory.set("mievento-operator-pin", "{no json");
    assert.equal(readPin(), null);
    memory.set("mievento-operator-pin", JSON.stringify({ salt: "a", hash: "b", iterations: 9e9 }));
    assert.equal(readPin(), null);
    memory.set("mievento-operator-pin", JSON.stringify({ salt: "a", hash: "b" }));
    assert.equal(readPin(), null);
  });

  it("derivePinHash es determinista y la comparación es de tiempo constante", async () => {
    const a = await derivePinHash("1234", "sal", 1000);
    const b = await derivePinHash("1234", "sal", 1000);
    const c = await derivePinHash("1235", "sal", 1000);
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.equal(safeHashEqual(a, b), true);
    assert.equal(safeHashEqual(a, "corto"), false);
  });
});
