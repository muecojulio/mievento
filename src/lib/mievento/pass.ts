import { previewPathPrefix } from "@/lib/preview-path-prefix";
import { zipStore } from "@/lib/mievento/zip";
import type { Guest, QrMotif, WeddingEvent } from "@/lib/mievento/types";
import { coupleNames, formatLongDate, sidePhrase } from "@/lib/mievento/format";

export type PassView = {
  token: string;
  name: string;
  groom: string;
  bride: string;
  date: string;
  time: string;
  place: string;
  side: "novio" | "novia";
  party: number;
  motif: QrMotif;
};

export function passFromGuest(event: WeddingEvent, guest: Guest): PassView {
  return {
    token: guest.token,
    name: guest.name,
    groom: event.groom,
    bride: event.bride,
    date: event.date,
    time: event.time,
    place: event.place,
    side: guest.side,
    party: guest.party,
    motif: motifForToken(guest.token),
  };
}

export function passLink(pass: PassView): string {
  const params = new URLSearchParams();
  params.set("t", pass.token);
  params.set("n", pass.name);
  params.set("g", pass.groom);
  params.set("b", pass.bride);
  if (pass.date) params.set("d", pass.date);
  if (pass.time) params.set("h", pass.time);
  if (pass.place) params.set("p", pass.place);
  params.set("s", pass.side);
  params.set("c", String(pass.party));
  params.set("m", pass.motif);
  const prefix =
    typeof window === "undefined"
      ? ""
      : (previewPathPrefix(window.location.hostname, window.location.pathname) ?? "");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}${prefix}/pase#${params.toString()}`;
}

export function readPassHash(): PassView | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const token = params.get("t")?.trim();
  if (!token) return null;
  const party = Number(params.get("c") || "1");
  return {
    token,
    name: params.get("n")?.trim() || "Invitado",
    groom: params.get("g")?.trim() || "",
    bride: params.get("b")?.trim() || "",
    date: params.get("d")?.trim() || "",
    time: params.get("h")?.trim() || "",
    place: params.get("p")?.trim() || "",
    side: params.get("s") === "novia" ? "novia" : "novio",
    party: Number.isFinite(party) && party > 0 ? Math.min(20, Math.round(party)) : 1,
    motif: motifForToken(token),
  };
}

export function inviteText(pass: PassView): string {
  const when = [formatLongDate(pass.date), pass.time].filter(Boolean).join(" · ");
  const who = pass.groom && pass.bride ? coupleNames(pass) : "la celebración";
  return [
    `Hola ${pass.name}.`,
    `Tu pase para ${who}${when ? ` — ${when}` : ""}.`,
    pass.place ? `Lugar: ${pass.place}.` : "",
    `${sidePhrase(pass.side)}. ${pass.party === 1 ? "1 persona." : `${pass.party} personas.`}`,
    "Muestra el código en la entrada. Es de un solo uso.",
    passLink(pass),
  ]
    .filter(Boolean)
    .join("\n");
}

const MOTIF_IDS: QrMotif[] = ["hoja", "citrico", "ave", "flor"];

export function motifForToken(token: string): QrMotif {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return MOTIF_IDS[(hash >>> 0) % MOTIF_IDS.length];
}

const INK: Rgba = [28, 25, 21, 255];
const PAPER: Rgba = [244, 239, 230, 255];
const BRASS: Rgba = [140, 90, 50, 255];
const SAGE: Rgba = [47, 107, 69, 255];
const LEAF: Rgba = [31, 86, 52, 255];
type Rgba = [number, number, number, number];
let clipY = 0;

export function paintPrettyQr(
  modules: { size: number; get: (row: number, col: number) => number },
  size: number,
  motif: QrMotif,
): { width: number; height: number; pixels: Uint8ClampedArray } {
  const width = size;
  const height = size;
  const pixels = new Uint8ClampedArray(width * height * 4);
  fill(pixels, width, height, PAPER);
  const n = modules.size;
  const quiet = 4;
  const cells = n + quiet * 2;
  const pad = Math.max(8, Math.round(size * 0.04));
  const band = Math.round(size * 0.2);
  const qrBox = size - pad * 2 - band;
  const cell = Math.max(2, Math.floor(qrBox / cells));
  const extra = qrBox - cell * cells;
  const originX = pad + Math.floor(extra / 2) + quiet * cell;
  const originY = pad + Math.floor(extra / 2) + quiet * cell;
  clipY = 0;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (!modules.get(row, col)) continue;
      const x = originX + col * cell;
      const y = originY + row * cell;
      fillRound(pixels, width, height, x, y, cell, cell * 0.22, INK);
    }
  }
  const figureTop = originY + (n + quiet) * cell;
  const figureBottom = size - pad;
  const figureH = Math.max(8, figureBottom - figureTop);
  const cx = size / 2;
  const cy = figureTop + figureH * 0.52;
  const scale = figureH * 0.44;
  clipY = figureTop;
  if (motif === "citrico") drawCitrus(pixels, width, height, cx, cy, scale);
  else if (motif === "ave") drawBird(pixels, width, height, cx, cy, scale);
  else if (motif === "flor") drawFlower(pixels, width, height, cx, cy, scale);
  else drawLeaf(pixels, width, height, cx, cy, scale);
  clipY = 0;
  return { width, height, pixels };
}

function fill(pixels: Uint8ClampedArray, w: number, h: number, color: Rgba) {
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    pixels[p] = color[0];
    pixels[p + 1] = color[1];
    pixels[p + 2] = color[2];
    pixels[p + 3] = color[3];
  }
}

function put(pixels: Uint8ClampedArray, w: number, h: number, x: number, y: number, color: Rgba) {
  const ix = x | 0;
  const iy = y | 0;
  if (ix < 0 || iy < 0 || ix >= w || iy >= h || iy < clipY) return;
  const p = (iy * w + ix) * 4;
  pixels[p] = color[0];
  pixels[p + 1] = color[1];
  pixels[p + 2] = color[2];
  pixels[p + 3] = color[3];
}

function fillRound(pixels: Uint8ClampedArray, w: number, h: number, x: number, y: number, size: number, radius: number, color: Rgba) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + Math.max(1, Math.round(size));
  const y1 = y0 + Math.max(1, Math.round(size));
  const r = Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const cx = px + 0.5;
      const cy = py + 0.5;
      const dx = cx < x0 + r ? x0 + r - cx : cx > x1 - r ? cx - (x1 - r) : 0;
      const dy = cy < y0 + r ? y0 + r - cy : cy > y1 - r ? cy - (y1 - r) : 0;
      if (dx * dx + dy * dy <= r * r) put(pixels, w, h, px, py, color);
    }
  }
}

function fillEllipse(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot: number,
  color: Rgba,
) {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const reach = rx + ry;
  for (let y = Math.floor(cy - reach); y <= Math.ceil(cy + reach); y++) {
    for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const u = dx * cos + dy * sin;
      const v = -dx * sin + dy * cos;
      if ((u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1) put(pixels, w, h, x, y, color);
    }
  }
}

function fillCircle(pixels: Uint8ClampedArray, w: number, h: number, cx: number, cy: number, r: number, color: Rgba) {
  fillEllipse(pixels, w, h, cx, cy, r, r, 0, color);
}

function drawLeaf(pixels: Uint8ClampedArray, w: number, h: number, cx: number, cy: number, s: number) {
  fillEllipse(pixels, w, h, cx + s * 0.42, cy + s * 0.15, s * 0.16, s * 0.55, 0.9, LEAF);
  fillEllipse(pixels, w, h, cx - s * 0.08, cy - s * 0.02, s * 0.38, s * 0.92, -0.7, SAGE);
  fillEllipse(pixels, w, h, cx + s * 0.55, cy + s * 0.08, s * 0.22, s * 0.62, 0.85, SAGE);
  fillEllipse(pixels, w, h, cx - s * 0.12, cy - s * 0.02, s * 0.06, s * 0.7, -0.7, PAPER);
  fillEllipse(pixels, w, h, cx + s * 0.52, cy + s * 0.08, s * 0.035, s * 0.42, 0.85, PAPER);
}

function drawCitrus(pixels: Uint8ClampedArray, w: number, h: number, cx: number, cy: number, s: number) {
  fillEllipse(pixels, w, h, cx + s * 0.55, cy - s * 0.72, s * 0.16, s * 0.34, 0.5, SAGE);
  fillCircle(pixels, w, h, cx, cy, s * 0.92, BRASS);
  fillCircle(pixels, w, h, cx, cy, s * 0.78, PAPER);
  fillCircle(pixels, w, h, cx, cy, s * 0.68, BRASS);
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * i) / 8;
    fillEllipse(pixels, w, h, cx + Math.cos(a) * s * 0.22, cy + Math.sin(a) * s * 0.22, s * 0.045, s * 0.5, a, PAPER);
  }
  fillCircle(pixels, w, h, cx, cy, s * 0.14, PAPER);
}

function drawBird(pixels: Uint8ClampedArray, w: number, h: number, cx: number, cy: number, s: number) {
  fillEllipse(pixels, w, h, cx - s * 0.85, cy + s * 0.12, s * 0.42, s * 0.16, -0.35, INK);
  fillEllipse(pixels, w, h, cx - s * 0.05, cy + s * 0.08, s * 0.72, s * 0.36, -0.12, INK);
  fillEllipse(pixels, w, h, cx - s * 0.2, cy - s * 0.12, s * 0.42, s * 0.2, -0.9, SAGE);
  fillCircle(pixels, w, h, cx + s * 0.62, cy - s * 0.22, s * 0.24, INK);
  fillEllipse(pixels, w, h, cx + s * 0.92, cy - s * 0.16, s * 0.24, s * 0.08, 0.35, BRASS);
  fillCircle(pixels, w, h, cx + s * 0.68, cy - s * 0.28, s * 0.07, PAPER);
  fillCircle(pixels, w, h, cx + s * 0.68, cy - s * 0.28, s * 0.035, INK);
}

function drawFlower(pixels: Uint8ClampedArray, w: number, h: number, cx: number, cy: number, s: number) {
  fillEllipse(pixels, w, h, cx - s * 0.55, cy + s * 0.45, s * 0.18, s * 0.42, -0.8, SAGE);
  fillEllipse(pixels, w, h, cx + s * 0.55, cy + s * 0.42, s * 0.16, s * 0.38, 0.7, SAGE);
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8 - Math.PI / 2;
    fillEllipse(pixels, w, h, cx + Math.cos(a) * s * 0.42, cy + Math.sin(a) * s * 0.42, s * 0.28, s * 0.18, a, SAGE);
  }
  fillCircle(pixels, w, h, cx, cy, s * 0.26, BRASS);
  fillCircle(pixels, w, h, cx - s * 0.06, cy - s * 0.06, s * 0.08, PAPER);
}

export async function qrDataUrl(text: string, size = 640, motif?: QrMotif | null): Promise<string> {
  if (!motif) {
    const QR = await import("qrcode");
    return QR.toDataURL(text, {
      margin: 1,
      width: size,
      errorCorrectionLevel: "M",
      color: { dark: "#1C1915", light: "#F4EFE6" },
    });
  }
  const QR = await import("qrcode");
  const created = QR.create(text, { errorCorrectionLevel: "H" });
  const frame = paintPrettyQr(created.modules, size, motif);
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo dibujar el código");
  const image = ctx.createImageData(frame.width, frame.height);
  image.data.set(frame.pixels);
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

export function icsFor(pass: PassView): string {
  const day = pass.date.replaceAll("-", "");
  const time = (pass.time || "18:00").replace(":", "") + "00";
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const summary = pass.groom && pass.bride ? `Boda de ${coupleNames(pass)}` : "Mi Evento";
  const description = `Pase de ${pass.name}. ${sidePhrase(pass.side)}.`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mi Evento//Pase//ES",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${pass.token}@mievento`,
    `DTSTAMP:${stamp}`,
    day ? `DTSTART:${day}T${time}` : "",
    day ? `DTEND:${day}T${time}` : "",
    `SUMMARY:${escapeIcs(summary)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    pass.place ? `LOCATION:${escapeIcs(pass.place)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

function escapeIcs(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

export async function renderPassPng(pass: PassView): Promise<Blob> {
  const qr = await qrDataUrl(pass.token, 720, pass.motif);
  const image = await loadImage(qr);
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar el pase");
  ctx.fillStyle = "#F4EFE6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#8C5A32";
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);
  ctx.fillStyle = "#8C5A32";
  ctx.fillRect(36, 36, canvas.width - 72, 8);
  ctx.fillStyle = "#1C1915";
  ctx.font = "600 28px Fraunces, Georgia, serif";
  ctx.fillText("Mi Evento", 72, 110);
  ctx.font = "500 22px Outfit, sans-serif";
  ctx.fillStyle = "#5C574F";
  ctx.fillText("Pase de un solo uso", 72, 148);
  ctx.fillStyle = "#1C1915";
  ctx.font = "600 54px Fraunces, Georgia, serif";
  wrapText(ctx, pass.groom && pass.bride ? coupleNames(pass) : "Celebración", 72, 240, 760, 62);
  ctx.font = "500 28px Outfit, sans-serif";
  ctx.fillStyle = "#3F382F";
  const when = [formatLongDate(pass.date), pass.time].filter(Boolean).join("  ·  ");
  ctx.fillText(when || "Fecha en el pase", 72, 390);
  if (pass.place) {
    ctx.fillStyle = "#5C574F";
    ctx.font = "400 24px Outfit, sans-serif";
    ctx.fillText(pass.place, 72, 432);
  }
  ctx.fillStyle = "#1C1915";
  ctx.font = "600 40px Fraunces, Georgia, serif";
  ctx.fillText(pass.name, 72, 530);
  ctx.font = "500 24px Outfit, sans-serif";
  ctx.fillStyle = "#5C574F";
  ctx.fillText(`${sidePhrase(pass.side)}  ·  ${pass.party === 1 ? "1 persona" : `${pass.party} personas`}`, 72, 572);
  const qrSize = 460;
  const qx = (canvas.width - qrSize) / 2;
  ctx.drawImage(image, qx, 640, qrSize, qrSize);
  ctx.font = "400 20px Outfit, sans-serif";
  ctx.fillStyle = "#5C574F";
  ctx.fillText("Muestra este código en la entrada. No se puede reutilizar.", 72, 1160);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("No se pudo guardar el pase");
  return blob;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("QR"));
    img.src = src;
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  max: number,
  line: number,
) {
  const words = text.split(" ");
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
}

export async function qrCodesZip(
  list: Guest[],
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const files: { name: string; bytes: Uint8Array }[] = [];
  const total = list.length;
  for (let i = 0; i < total; i++) {
    const guest = list[i];
    const dataUrl = await qrDataUrl(guest.token, 360, motifForToken(guest.token));
    files.push({ name: codeFileName(i, guest.name), bytes: dataUrlBytes(dataUrl) });
    if (i % 8 === 7 || i === total - 1) {
      onProgress?.(i + 1, total);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return zipStore(files);
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function codeFileName(index: number, name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${String(index + 1).padStart(4, "0")}-${slug || "invitado"}.png`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
