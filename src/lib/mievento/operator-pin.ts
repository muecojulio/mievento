/**
 * PIN opcional del operador, solo en este dispositivo.
 *
 * No hay cuenta ni servidor: se guarda un hash PBKDF2 con sal aleatoria en
 * localStorage. El PIN en claro nunca se almacena. Protege las acciones
 * destructivas del organizador; la puerta (escanear) sigue sin pedirlo.
 * Si no hay PIN configurado, las acciones no se bloquean.
 */
const STORAGE_KEY = "mievento-operator-pin";
const ITERATIONS = 120_000;
const KEY_BITS = 256;

export type PinRecord = {
  salt: string;
  hash: string;
  iterations: number;
};

export function validPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function hasPin(): boolean {
  return readPin() !== null;
}

export function readPin(): PinRecord | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PinRecord>;
    if (
      typeof parsed.salt !== "string" ||
      typeof parsed.hash !== "string" ||
      typeof parsed.iterations !== "number" ||
      parsed.iterations < 1 ||
      parsed.iterations > 1_000_000
    ) {
      return null;
    }
    return { salt: parsed.salt, hash: parsed.hash, iterations: parsed.iterations };
  } catch {
    return null;
  }
}

export function clearPin(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* almacenamiento bloqueado */
  }
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toBase64(bytes);
}

export async function derivePinHash(pin: string, salt: string, iterations: number): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations },
    key,
    KEY_BITS,
  );
  return toBase64(new Uint8Array(bits));
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Comparación de tiempo constante para no filtrar la longitud del hash. */
export function safeHashEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function setPin(pin: string): Promise<void> {
  if (!validPin(pin)) throw new Error("El PIN debe tener de 4 a 8 números.");
  const salt = randomSalt();
  const hash = await derivePinHash(pin, salt, ITERATIONS);
  const store = storage();
  if (!store) throw new Error("Este navegador no permite guardar el PIN.");
  store.setItem(STORAGE_KEY, JSON.stringify({ salt, hash, iterations: ITERATIONS } satisfies PinRecord));
}

/** Sin PIN configurado devuelve true: la protección es opcional. */
export async function checkPin(pin: string): Promise<boolean> {
  const record = readPin();
  if (!record) return true;
  if (!validPin(pin)) return false;
  const hash = await derivePinHash(pin, record.salt, record.iterations);
  return safeHashEqual(hash, record.hash);
}

export async function changePin(current: string, next: string): Promise<boolean> {
  if (hasPin() && !(await checkPin(current))) return false;
  await setPin(next);
  return true;
}
