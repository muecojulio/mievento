import { useEffect, useSyncExternalStore } from "react";
import type { PassView } from "@/lib/mievento/pass";
import type { QrMotif, Side } from "@/lib/mievento/types";

/**
 * Wallet de Mi Evento.
 *
 * El pase que llega por WhatsApp o correo se guarda en la tablet o el teléfono
 * (localStorage) con la fecha, el día, los nombres de los novios y su código.
 * Queda disponible sin internet: el lector solo necesita el código.
 *
 * No es Apple Wallet ni Google Wallet: esas carteras solo aceptan pases firmados
 * por Apple o por una cuenta de emisor de Google. Aquí el pase se guarda dentro
 * de la app y también como imagen de tamaño cartera.
 */

export type WalletPass = PassView & {
  savedAt: number;
};

const STORAGE_KEY = "mievento-wallet-v1";
const LIMIT = 60;
const EMPTY: WalletPass[] = [];
const SIDES: Side[] = ["novio", "novia"];
const MOTIFS: QrMotif[] = ["hoja", "citrico", "ave", "flor"];

let passes: WalletPass[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isWalletPass(value: unknown): value is WalletPass {
  if (!value || typeof value !== "object") return false;
  const raw = value as Record<string, unknown>;
  return (
    text(raw.token).length > 0 &&
    text(raw.name).length > 0 &&
    text(raw.date).length > 0 &&
    SIDES.includes(raw.side as Side) &&
    MOTIFS.includes(raw.motif as QrMotif) &&
    typeof raw.party === "number" &&
    (raw.party as number) > 0
  );
}

/** Lee el Wallet guardado. Nunca revienta: un JSON roto equivale a un Wallet vacío. */
export function parseWallet(raw: string | null | undefined): WalletPass[] {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return EMPTY;
    const clean: WalletPass[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (!isWalletPass(item)) continue;
      if (seen.has(item.token)) continue;
      seen.add(item.token);
      clean.push({
        token: item.token,
        name: text(item.name),
        groom: text(item.groom),
        bride: text(item.bride),
        date: text(item.date),
        time: text(item.time),
        place: text(item.place),
        side: item.side,
        party: Math.min(20, Math.max(1, Math.round(item.party))),
        motif: item.motif,
        savedAt: typeof item.savedAt === "number" ? item.savedAt : 0,
      });
      if (clean.length >= LIMIT) break;
    }
    return clean;
  } catch {
    return EMPTY;
  }
}

export function serializeWallet(list: WalletPass[]): string {
  return JSON.stringify(list);
}

/** Guarda o reemplaza un pase. El más reciente queda primero. */
export function upsertWallet(
  list: WalletPass[],
  pass: WalletPass,
  limit = LIMIT,
): WalletPass[] {
  const rest = list.filter((item) => item.token !== pass.token);
  return [pass, ...rest].slice(0, limit);
}

function readStored(): WalletPass[] {
  const store = storage();
  if (!store) return EMPTY;
  try {
    return parseWallet(store.getItem(STORAGE_KEY));
  } catch {
    return EMPTY;
  }
}

function persist(list: WalletPass[]) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, serializeWallet(list));
  } catch {
    /* sin espacio: el pase se queda solo en memoria */
  }
}

function ensureLoaded(): WalletPass[] {
  if (!loaded && typeof window !== "undefined") {
    passes = readStored();
    loaded = true;
  }
  return passes;
}

function subscribe(listener: () => void) {
  ensureLoaded();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function loadWallet(): WalletPass[] {
  if (typeof window === "undefined") return passes;
  const next = readStored();
  loaded = true;
  const changed =
    next.length !== passes.length ||
    next.some((item, index) => item.token !== passes[index]?.token);
  passes = next;
  if (changed) emit();
  return passes;
}

export function getWallet(): WalletPass[] {
  return ensureLoaded();
}

export function useWallet(): WalletPass[] {
  const list = useSyncExternalStore(
    subscribe,
    () => ensureLoaded(),
    () => EMPTY,
  );
  useEffect(() => {
    loadWallet();
  }, []);
  return list;
}

export function isInWallet(token: string): boolean {
  return ensureLoaded().some((item) => item.token === token);
}

export function savePassToWallet(pass: PassView): { added: boolean; count: number } {
  const current = ensureLoaded();
  const added = !isInWallet(pass.token);
  const entry: WalletPass = { ...pass, savedAt: Date.now() };
  passes = upsertWallet(current, entry);
  persist(passes);
  emit();
  return { added, count: passes.length };
}

export function removeFromWallet(token: string): void {
  const current = ensureLoaded().filter((item) => item.token !== token);
  passes = current;
  persist(current);
  emit();
}

/** Orden estable para la lista: por fecha del evento y después por nombre. */
export function sortWallet(list: WalletPass[]): WalletPass[] {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.name.localeCompare(b.name, "es");
  });
}

type Ctx2D = CanvasRenderingContext2D;

function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrap(ctx: Ctx2D, value: string, x: number, y: number, max: number, line: number): number {
  const words = value.split(" ");
  let row = "";
  let yy = y;
  for (const word of words) {
    const next = row ? `${row} ${word}` : word;
    if (ctx.measureText(next).width > max && row) {
      ctx.fillText(row, x, yy);
      row = word;
      yy += line;
    } else {
      row = next;
    }
  }
  if (row) ctx.fillText(row, x, yy);
  return yy;
}

/**
 * Imagen del pase con proporción de cartera: nombres, fecha, lugar, invitado y
 * el código. Sirve para guardarlo en Fotos o compartirlo por WhatsApp.
 */
export async function renderWalletCardPng(pass: WalletPass): Promise<Blob> {
  const { qrDataUrl } = await import("@/lib/mievento/pass");
  const { formatLongDate, peopleLabel, sidePhrase } = await import("@/lib/mievento/format");
  const qr = await qrDataUrl(pass.token, 720, pass.motif);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo dibujar el código"));
    img.src = qr;
  });

  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1400;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar el pase");

  ctx.fillStyle = "#1C1915";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#8C5A32";
  ctx.fillRect(0, 0, canvas.width, 14);

  ctx.fillStyle = "#F4EFE6";
  ctx.font = "500 24px Outfit, system-ui, sans-serif";
  ctx.fillText("MI EVENTO  ·  WALLET", 64, 88);

  ctx.font = "600 58px Fraunces, Georgia, serif";
  const names = pass.groom && pass.bride ? `${pass.groom} y ${pass.bride}` : "Celebración";
  let cursor = wrap(ctx, names, 64, 176, 772, 66);

  ctx.fillStyle = "#E7E0D2";
  ctx.font = "500 30px Outfit, system-ui, sans-serif";
  cursor += 22;
  ctx.fillText(formatLongDate(pass.date), 64, cursor);
  if (pass.time) {
    cursor += 44;
    ctx.fillText(pass.time, 64, cursor);
  }
  if (pass.place) {
    cursor += 42;
    ctx.fillStyle = "#C9C0B0";
    ctx.font = "400 26px Outfit, system-ui, sans-serif";
    ctx.fillText(pass.place, 64, cursor);
  }

  ctx.fillStyle = "#8C5A32";
  ctx.fillRect(64, cursor + 34, 120, 3);

  ctx.fillStyle = "#F4EFE6";
  ctx.font = "600 46px Fraunces, Georgia, serif";
  const nameBottom = wrap(ctx, pass.name, 64, cursor + 116, 772, 52);
  ctx.fillStyle = "#C9C0B0";
  ctx.font = "400 26px Outfit, system-ui, sans-serif";
  ctx.fillText(
    `${sidePhrase(pass.side)}  ·  ${peopleLabel(pass.party)}`,
    64,
    nameBottom + 46,
  );

  const qrBox = 560;
  const qx = (canvas.width - qrBox) / 2;
  const qy = canvas.height - qrBox - 190;
  ctx.fillStyle = "#F4EFE6";
  roundRectPath(ctx, qx - 26, qy - 26, qrBox + 52, qrBox + 52, 36);
  ctx.fill();
  ctx.drawImage(image, qx, qy, qrBox, qrBox);

  ctx.fillStyle = "#C9C0B0";
  ctx.font = "400 24px Outfit, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("De un solo uso. Muéstralo en la entrada.", canvas.width / 2, canvas.height - 90);
  ctx.fillStyle = "#8C5A32";
  ctx.font = "500 22px Outfit, system-ui, sans-serif";
  ctx.fillText("Guardado sin internet en Mi Evento", canvas.width / 2, canvas.height - 54);
  ctx.textAlign = "start";

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("No se pudo guardar el pase");
  return blob;
}

export const WALLET_STORAGE_KEY = STORAGE_KEY;
