import { coupleNames, entryLabel, formatLongDate, formatStamp, headsIn, sideLabel } from "@/lib/mievento/format";
import type { DraftGuest, Guest, Side, WeddingEvent } from "@/lib/mievento/types";

const NAME_KEYS = ["nombre", "name", "invitado", "invitada", "guest", "nombres"];
const SIDE_KEYS = ["lado", "de", "origen", "familia", "side", "novio/novia", "grupo"];
const EMAIL_KEYS = ["email", "correo", "e-mail", "mail"];
const PHONE_KEYS = ["telefono", "teléfono", "whatsapp", "celular", "phone", "movil", "móvil"];
const PARTY_KEYS = ["personas", "pases", "pase", "boletos", "acompanantes", "acompañantes", "cupo", "cantidad"];
const NOTE_KEYS = ["mesa", "nota", "notas", "observaciones"];

export function nameKey(name: string): string {
  return norm(name).replace(/\s+/g, " ");
}

export type NameClash = {
  name: string;
  inFile: number;
  already: boolean;
};

export function nameClashes(drafts: DraftGuest[], existingNames: string[]): NameClash[] {
  const existing = new Set(existingNames.map(nameKey).filter(Boolean));
  const groups = new Map<string, { name: string; count: number }>();
  for (const draft of drafts) {
    const key = nameKey(draft.name);
    if (!key) continue;
    const current = groups.get(key);
    if (current) current.count += 1;
    else groups.set(key, { name: draft.name.trim(), count: 1 });
  }
  const clashes: NameClash[] = [];
  for (const [key, group] of groups) {
    const already = existing.has(key);
    if (group.count > 1 || already) clashes.push({ name: group.name, inFile: group.count, already });
  }
  clashes.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return clashes;
}

export function withoutRepeatedNames(
  drafts: DraftGuest[],
  existingNames: string[],
): { kept: DraftGuest[]; omitted: number } {
  const seen = new Set(existingNames.map(nameKey).filter(Boolean));
  const kept: DraftGuest[] = [];
  for (const draft of drafts) {
    const key = nameKey(draft.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(draft);
  }
  return { kept, omitted: drafts.length - kept.length };
}

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return "";
  return String(value).trim();
}

export function sideFromText(value: string): Side | null {
  const text = norm(value);
  if (!text) return null;
  if (text.includes("novia") || text === "bride" || text === "ella") return "novia";
  if (text.includes("novio") || text === "groom" || text === "el") return "novio";
  return null;
}

function sideFromSheet(name: string): Side | null {
  return sideFromText(name);
}

function headerIndex(headers: string[], keys: string[]): number {
  return headers.findIndex((header) => keys.some((key) => header === key || header.includes(key)));
}

function partyOf(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(20, Math.round(n));
}

export function rowsToDrafts(rows: unknown[][], sheetSide: Side | null): { drafts: DraftGuest[]; skipped: number } {
  const drafts: DraftGuest[] = [];
  let skipped = 0;
  if (rows.length === 0) return { drafts, skipped };

  let headerAt = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const candidate = rows[i].map((cell) => norm(cellText(cell)));
    if (headerIndex(candidate, NAME_KEYS) >= 0) {
      headerAt = i;
      headers = candidate;
      break;
    }
  }

  const start = headerAt >= 0 ? headerAt + 1 : 0;
  const nameCol = headerAt >= 0 ? headerIndex(headers, NAME_KEYS) : 0;
  const sideCol = headerAt >= 0 ? headerIndex(headers, SIDE_KEYS) : 1;
  const partyCol = headerAt >= 0 ? headerIndex(headers, PARTY_KEYS) : 2;
  const emailCol = headerAt >= 0 ? headerIndex(headers, EMAIL_KEYS) : 3;
  const phoneCol = headerAt >= 0 ? headerIndex(headers, PHONE_KEYS) : 4;
  const noteCol = headerAt >= 0 ? headerIndex(headers, NOTE_KEYS) : 5;

  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    const name = cellText(row[nameCol]);
    if (!name || norm(name) === "nombre") {
      if (row.some((cell) => cellText(cell))) skipped += 1;
      continue;
    }
    const side = (sideCol >= 0 ? sideFromText(cellText(row[sideCol])) : null) ?? sheetSide ?? "novio";
    drafts.push({
      name: name.slice(0, 80),
      side,
      email: emailCol >= 0 ? cellText(row[emailCol]).slice(0, 120) : "",
      phone: phoneCol >= 0 ? cellText(row[phoneCol]).slice(0, 32) : "",
      party: partyCol >= 0 ? partyOf(row[partyCol]) : 1,
      note: noteCol >= 0 ? cellText(row[noteCol]).slice(0, 40) : "",
    });
  }
  return { drafts, skipped };
}

export function parseCsv(text: string): unknown[][] {
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const sample = lines[0];
  const delimiter = (sample.match(/;/g)?.length ?? 0) > (sample.match(/,/g)?.length ?? 0) ? ";" : ",";
  return lines.map((line) => splitCsv(line, delimiter));
}

function splitCsv(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export async function parseGuestFile(file: File): Promise<{ drafts: DraftGuest[]; skipped: number }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type.includes("csv") || file.type.startsWith("text/")) {
    const text = await file.text();
    const parsed = rowsToDrafts(parseCsv(text), null);
    return parsed;
  }
  const mod = await import("read-excel-file/browser");
  const sheets = await mod.default(file);
  const drafts: DraftGuest[] = [];
  let skipped = 0;
  for (const sheet of sheets) {
    const parsed = rowsToDrafts(sheet.data as unknown[][], sideFromSheet(sheet.sheet));
    drafts.push(...parsed.drafts);
    skipped += parsed.skipped;
  }
  return { drafts, skipped };
}

export function templateCsv(): Blob {
  const body = [
    "nombre,lado,personas,correo,telefono,mesa",
    "Andrés Ríos,novio,2,andres@correo.com,5512345678,1",
    "Elena Cruz,novia,2,elena@correo.com,5587654321,4",
  ].join("\n");
  return new Blob([`\uFEFF${body}\n`], { type: "text/csv;charset=utf-8" });
}

export function closingCsv(event: WeddingEvent, list: Guest[]): Blob {
  const admitted = list.filter((guest) => guest.status === "Ingresado").sort((a, b) => (a.scannedAt ?? 0) - (b.scannedAt ?? 0));
  const pending = list
    .filter((guest) => guest.status !== "Ingresado")
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const inside = admitted.reduce((sum, guest) => sum + headsIn(guest), 0);
  const lines = [
    ["Evento", coupleNames(event)],
    ["Fecha", formatLongDate(event.date)],
    ["Lugar", event.place || ""],
    ["Invitaciones que ingresaron", String(admitted.length)],
    ["Personas dentro", String(inside)],
    ["Invitaciones pendientes", String(pending.length)],
    [],
    ["Nombre", "Lado", "En el pase", "Entraron", "Estado", "Hora", "Cómo entró", "Correo", "Teléfono", "Mesa"],
    ...[...admitted, ...pending].map((guest) => [
      guest.name,
      sideLabel(guest.side),
      String(guest.party),
      guest.status === "Ingresado" ? String(headsIn(guest)) : "0",
      guest.status,
      guest.scannedAt ? formatStamp(guest.scannedAt) : "",
      entryLabel(guest.entry),
      guest.email,
      guest.phone,
      guest.note,
    ]),
  ];
  const body = lines.map((row) => row.map(csvCell).join(";")).join("\r\n");
  return new Blob([`\uFEFF${body}\r\n`], { type: "text/csv;charset=utf-8" });
}

function csvCell(value: string): string {
  if (/[;"\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
