const ITERATIONS = 310_000;
const encoder = new TextEncoder();
function encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function decode(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
async function key(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  if (!globalThis.crypto?.subtle)
    throw new Error("El cifrado requiere una dirección HTTPS y un navegador actualizado.");
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export function isEncryptedBackup(text: string): boolean {
  return JSON.parse(text)?.kind === "mievento-encrypted-backup";
}
export async function encryptBackup(text: string, password: string): Promise<string> {
  if (password.length < 10) throw new Error("Usa una contraseña de al menos 10 caracteres.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const derived = await key(password, salt, ITERATIONS);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, derived, encoder.encode(text));
  return JSON.stringify({
    kind: "mievento-encrypted-backup",
    version: 1,
    cipher: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: encode(salt),
    iv: encode(iv),
    data: encode(new Uint8Array(data)),
  });
}
export async function decryptBackup(text: string, password?: string): Promise<string> {
  const envelope = JSON.parse(text);
  if (envelope?.kind !== "mievento-encrypted-backup") return text;
  if (!password) throw new Error("Esta copia necesita su contraseña.");
  if (
    envelope.version !== 1 ||
    envelope.cipher !== "AES-256-GCM" ||
    envelope.kdf !== "PBKDF2-SHA256" ||
    !Number.isInteger(envelope.iterations) ||
    envelope.iterations < 100_000 ||
    envelope.iterations > 1_000_000
  )
    throw new Error("Formato de cifrado no compatible.");
  try {
    const salt = decode(envelope.salt),
      iv = decode(envelope.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error("Formato inválido");
    const derived = await key(password, salt, envelope.iterations);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      derived,
      decode(envelope.data),
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(plain);
  } catch {
    throw new Error("Contraseña incorrecta o copia dañada. No se modificaron los datos.");
  }
}
