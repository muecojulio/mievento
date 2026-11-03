import test from "node:test";
import assert from "node:assert/strict";
import { decryptBackup, encryptBackup, isEncryptedBackup } from "./backup-crypto.ts";

test("AES-GCM round trip and randomized salt/IV", async () => {
  const text = JSON.stringify({ kind: "mievento-backup", event: { secret: "secreto" } });
  const a = await encryptBackup(text, "contraseña segura");
  const b = await encryptBackup(text, "contraseña segura");
  assert.notEqual(a, b);
  assert.equal(a.includes("secreto"), false);
  assert.equal(isEncryptedBackup(a), true);
  assert.equal(await decryptBackup(a, "contraseña segura"), text);
});
test("wrong password and tampering are rejected", async () => {
  const encrypted = await encryptBackup("datos", "contraseña segura");
  await assert.rejects(decryptBackup(encrypted, "otra contraseña"), /incorrecta/);
  const envelope = JSON.parse(encrypted);
  envelope.data = (envelope.data[0] === "A" ? "B" : "A") + envelope.data.slice(1);
  await assert.rejects(decryptBackup(JSON.stringify(envelope), "contraseña segura"), /dañada/);
  await assert.rejects(decryptBackup(encrypted), /contraseña/);
});
test("legacy backups remain readable; unsupported formats and weak passwords fail", async () => {
  const legacy = '{"kind":"mievento-backup","version":1}';
  assert.equal(await decryptBackup(legacy), legacy);
  assert.equal(isEncryptedBackup(legacy), false);
  await assert.rejects(encryptBackup(legacy, "corta"), /10 caracteres/);
  const envelope = JSON.parse(await encryptBackup(legacy, "contraseña segura"));
  envelope.iterations = 999999999;
  await assert.rejects(
    decryptBackup(JSON.stringify(envelope), "contraseña segura"),
    /no compatible/,
  );
});
