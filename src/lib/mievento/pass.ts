import { previewPathPrefix } from "@/lib/preview-path-prefix";
import type { Guest, WeddingEvent } from "@/lib/mievento/types";
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

export async function qrDataUrl(text: string, size = 640): Promise<string> {
  const QR = await import("qrcode");
  return QR.toDataURL(text, {
    margin: 1,
    width: size,
    errorCorrectionLevel: "M",
    color: { dark: "#1C1915", light: "#F4EFE6" },
  });
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
  const qr = await qrDataUrl(pass.token, 720);
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

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
