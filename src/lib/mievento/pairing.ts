/**
 * PIN de emparejamiento entre tablets.
 *
 * El QR de oferta viaja por la red (foto, captura, hombro ajeno). Si solo se
 * necesita el QR para enlazar una tablet, quien lo fotografíe puede pedir el
 * evento completo. El PIN **no va dentro del QR**: se muestra en la pantalla
 * de la tablet principal y lo dicta al operador de la otra puerta. La tablet
 * receptora devuelve una prueba criptográfica derivada de ese PIN y la
 * principal la verifica antes de aceptar la conexión.
 *
 * Derivación: PBKDF2-SHA256 (120 000 iteraciones, sal = sesión) → HMAC-SHA256
 * sobre `pair:<sesión>:<evento>`. El PIN nunca se transmite ni se guarda.
 */

const ITERATIONS = 120_000;
const encoder = new TextEncoder();

export const PIN_LENGTH = 6;

/** PIN aleatorio uniforme de 6 dígitos (criptográficamente seguro). */
export function newPairingPin(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const n = (((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0) % 1_000_000;
  return String(n).padStart(PIN_LENGTH, "0");
}

/** Deja sólo dígitos; acepta “123 456”, “123-456” o “123456”. */
export function normalizePin(raw: string): string {
  return raw.replace(/\D+/g, "").slice(0, PIN_LENGTH);
}

export function isValidPin(raw: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(normalizePin(raw));
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function proofKey(pin: string, session: string): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle)
    throw new Error(
      "El emparejamiento con PIN requiere una dirección HTTPS y un navegador actualizado.",
    );
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(normalizePin(pin)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(`mievento-pair:${session}`),
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
}

/** Prueba que la tablet receptora devuelve junto con su respuesta. */
export async function pairingProof(pin: string, session: string, eventId: string): Promise<string> {
  if (!isValidPin(pin)) throw new Error(`El PIN de emparejamiento son ${PIN_LENGTH} dígitos.`);
  const key = await proofKey(pin, session);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`pair:${session}:${eventId}`),
  );
  return toBase64(new Uint8Array(signature));
}

/** Comparación en tiempo constante para no filtrar el PIN por temporización. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPairingProof(
  pin: string,
  session: string,
  eventId: string,
  proof: string,
): Promise<boolean> {
  if (!isValidPin(pin) || typeof proof !== "string" || proof.length === 0 || proof.length > 128)
    return false;
  try {
    return sameText(await pairingProof(pin, session, eventId), proof);
  } catch {
    return false;
  }
}
