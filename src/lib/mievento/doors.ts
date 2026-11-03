/**
 * Control de puertas sin internet.
 *
 * Resuelve cómo evitar que 1 mismo código QR se pase en diferentes puertas:
 *
 * 1. Modo «asignada» (100 % sin internet ni red local, incluso en modo avión):
 *    cada código QR pertenece de forma determinista (o explícita) a UNA sola
 *    puerta. Con una tablet por puerta, la puerta asignada valida y marca el
 *    pase como usado en su memoria local (IndexedDB) y cualquier otra puerta
 *    lo rechaza al instante sin necesitar comunicación entre dispositivos.
 *
 * 2. Modo «enlace» (entrada libre por cualquier puerta):
 *    requiere enlace activo entre las tablets (red local Wi-Fi/hotspot sin
 *    internet, o con internet). Si no hay enlace activo, la app advierte que
 *    se requiere internet o conexión entre puertas para evitar doble paso.
 */
import { useSyncExternalStore } from "react";
import type { DoorMode, DoorRule, EventDoor, Guest, WeddingEvent } from "./types.ts";

export const MAX_DOORS = 12;
const TABLET_DOORS_KEY = "mievento-tablet-doors-v1";
const DEVICE_ID_KEY = "mievento-device-id-v1";

export type DoorSummary = {
  door: EventDoor;
  invitations: number;
  expectedPeople: number;
  admitted: number;
  insidePeople: number;
};

export function defaultDoors(count = 2): EventDoor[] {
  const safe = Math.max(2, Math.min(MAX_DOORS, Math.round(count)));
  return Array.from({ length: safe }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Puerta ${index + 1}`,
  }));
}

function sanitizeDoorId(raw: string, fallbackIndex: number): string {
  const clean = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "")
    .slice(0, 16);
  return clean || `p${fallbackIndex + 1}`;
}

export function foldDoorText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDoors(raw?: EventDoor[] | null): EventDoor[] {
  if (!Array.isArray(raw)) return [];
  const out: EventDoor[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  for (let i = 0; i < raw.length && out.length < MAX_DOORS; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object") continue;
    const name = typeof item.name === "string" ? item.name.trim().slice(0, 40) : "";
    if (!name) continue;
    const foldedName = foldDoorText(name);
    if (!foldedName || seenNames.has(foldedName)) continue;
    let id = sanitizeDoorId(typeof item.id === "string" ? item.id : "", out.length);
    let suffix = 2;
    while (seenIds.has(id)) {
      id = `${id.slice(0, 13)}${suffix}`;
      suffix += 1;
    }
    seenIds.add(id);
    seenNames.add(foldedName);
    out.push({ id, name });
  }
  return out;
}

export function effectiveDoorMode(
  event: Pick<WeddingEvent, "doorMode" | "doors"> | null | undefined,
): DoorMode {
  if (!event) return "unica";
  const doors = normalizeDoors(event.doors);
  if (doors.length < 2) return "unica";
  if (event.doorMode === "asignada" || event.doorMode === "enlace") return event.doorMode;
  return "unica";
}

export function effectiveDoorRule(
  event: Pick<WeddingEvent, "doorRule"> | null | undefined,
): DoorRule {
  const rule = event?.doorRule;
  if (rule === "lado" || rule === "mesa" || rule === "manual" || rule === "auto") return rule;
  return "auto";
}

export function fnv1aHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Busca si el texto explícito del invitado (columna «puerta» del Excel o
 * elección manual) coincide con alguna de las puertas del evento.
 */
export function matchExplicitDoor(
  rawDoor: string | null | undefined,
  doors: EventDoor[],
): EventDoor | null {
  if (!rawDoor || doors.length === 0) return null;
  const trimmed = rawDoor.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const byId = doors.find((door) => door.id.toLowerCase() === lower);
  if (byId) return byId;

  const folded = foldDoorText(trimmed);
  const byExactName = doors.find((door) => foldDoorText(door.name) === folded);
  if (byExactName) return byExactName;

  // Permite escribir "1", "2", "puerta 2", "acceso 2" o "entrada 2" en el Excel.
  const numMatch = /^(?:puerta|acceso|entrada|porton|gate|p|#)?\s*(\d{1,2})$/.exec(folded);
  if (numMatch) {
    const num = Number(numMatch[1]);
    const byNumberInName = doors.find((door) => {
      const m = /(\d{1,2})\s*$/.exec(foldDoorText(door.name));
      return m ? Number(m[1]) === num : false;
    });
    if (byNumberInName) return byNumberInName;
    if (num >= 1 && num <= doors.length) return doors[num - 1];
  }

  if (folded.length >= 3) {
    const partial = doors.filter((door) => foldDoorText(door.name).includes(folded));
    if (partial.length === 1) return partial[0];
  }
  return null;
}

/**
 * Calcula qué puerta le toca a un invitado dada una lista de puertas (>= 2) y
 * una regla. Es 100 % determinista y no depende de red ni de configuración
 * regional: todas las tablets obtienen exactamente la misma puerta.
 */
export function computeDoorAssignment(
  doors: EventDoor[],
  rule: DoorRule,
  eventId: string,
  guest: Pick<Guest, "id" | "side" | "note" | "door">,
): EventDoor {
  const explicit = matchExplicitDoor(guest.door, doors);
  if (explicit) return explicit;

  if (rule === "lado") {
    if (doors.length === 2) {
      return guest.side === "novia" ? doors[1] : doors[0];
    }
    const novioCount = Math.max(1, Math.ceil(doors.length / 2));
    const novioPool = doors.slice(0, novioCount);
    const noviaPool = doors.slice(novioCount);
    const pool = guest.side === "novia" && noviaPool.length > 0 ? noviaPool : novioPool;
    return pool[fnv1aHash(`${eventId}:lado:${guest.id}`) % pool.length];
  }

  if (rule === "mesa") {
    const table = foldDoorText(guest.note || "");
    if (table) {
      // Saca el número si es "Mesa 4" vs "4" para que ambas formas caigan igual
      const normalizedTable = table.replace(/^mesa\s+/, "");
      return doors[fnv1aHash(`${eventId}:mesa:${normalizedTable}`) % doors.length];
    }
    return doors[fnv1aHash(`${eventId}:${guest.id}`) % doors.length];
  }

  if (rule === "manual") {
    return doors[0];
  }

  return doors[fnv1aHash(`${eventId}:${guest.id}`) % doors.length];
}

/**
 * Devuelve la puerta obligatoria del invitado SOLO si el evento está en modo
 * «asignada» con al menos 2 puertas. En modo «unica» o «enlace» devuelve null.
 */
export function assignedDoorForGuest(
  event: Pick<WeddingEvent, "id" | "doors" | "doorMode" | "doorRule"> | null | undefined,
  guest: Pick<Guest, "id" | "side" | "note" | "door">,
): EventDoor | null {
  if (!event || effectiveDoorMode(event) !== "asignada") return null;
  const doors = normalizeDoors(event.doors);
  if (doors.length < 2) return null;
  return computeDoorAssignment(doors, effectiveDoorRule(event), event.id, guest);
}

/** Resumen de invitaciones e ingresos por puerta (para el tablero y ajustes). */
export function doorSummaries(
  event: Pick<WeddingEvent, "id" | "doors" | "doorMode" | "doorRule">,
  guests: Guest[],
): DoorSummary[] {
  const doors = normalizeDoors(event.doors);
  if (doors.length < 2) return [];
  const mode = effectiveDoorMode(event);
  const rule = effectiveDoorRule(event);
  const map = new Map<string, DoorSummary>(
    doors.map((door) => [
      door.id,
      { door, invitations: 0, expectedPeople: 0, admitted: 0, insidePeople: 0 },
    ]),
  );

  for (const guest of guests) {
    const inside = guest.status === "Ingresado" ? (guest.arrived ?? guest.party) : 0;
    if (mode === "asignada") {
      const target = computeDoorAssignment(doors, rule, event.id, guest);
      const bucket = map.get(target.id);
      if (bucket) {
        bucket.invitations += 1;
        bucket.expectedPeople += guest.party;
        if (guest.status === "Ingresado") {
          bucket.admitted += 1;
          bucket.insidePeople += inside;
        }
      }
    } else if (guest.status === "Ingresado" && guest.admittedDoor) {
      const matched = matchExplicitDoor(guest.admittedDoor, doors);
      const bucket = matched ? map.get(matched.id) : undefined;
      if (bucket) {
        bucket.admitted += 1;
        bucket.insidePeople += inside;
      }
    }
  }
  return doors.map((door) => map.get(door.id)!);
}

export function doorRuleLabel(rule: DoorRule): string {
  if (rule === "lado") return "Por lado (Novio / Novia)";
  if (rule === "mesa") return "Por mesa";
  if (rule === "manual") return "Manual o columna Excel";
  return "Automático por código";
}

// ── Identidad de puerta por tablet (guardada solo en este dispositivo) ──────

const doorListeners = new Set<() => void>();
let doorRevision = 0;

function emitTabletDoor() {
  doorRevision += 1;
  for (const fn of doorListeners) fn();
}

function subscribeTabletDoor(listener: () => void) {
  doorListeners.add(listener);
  if (typeof window !== "undefined") {
    const onStorage = (e: StorageEvent) => {
      if (e.key === TABLET_DOORS_KEY) emitTabletDoor();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      doorListeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }
  return () => doorListeners.delete(listener);
}

function readDoorMap(store: Storage | null): Record<string, string> {
  if (!store) return {};
  try {
    const raw = store.getItem(TABLET_DOORS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

function sessionStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function localStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function getDeviceId(): string {
  const ss = sessionStore();
  if (ss) {
    const existing = ss.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const created = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `dev-${Math.random().toString(36).slice(2, 10)}`;
    try {
      ss.setItem(DEVICE_ID_KEY, created);
    } catch {
      /* ignore */
    }
    return created;
  }
  return "local-device";
}

export function getTabletDoorId(eventId: string): string | null {
  if (!eventId) return null;
  const fromSession = readDoorMap(sessionStore())[eventId];
  if (fromSession) return fromSession;
  const fromLocal = readDoorMap(localStore())[eventId];
  return fromLocal ?? null;
}

export function setTabletDoorId(eventId: string, doorId: string | null): void {
  if (!eventId) return;
  for (const store of [sessionStore(), localStore()]) {
    if (!store) continue;
    const map = readDoorMap(store);
    if (doorId && doorId.trim()) map[eventId] = doorId.trim();
    else delete map[eventId];
    try {
      store.setItem(TABLET_DOORS_KEY, JSON.stringify(map));
    } catch {
      /* ignore quota */
    }
  }
  emitTabletDoor();
}

export function resolveTabletDoor(
  event: Pick<WeddingEvent, "id" | "doors" | "doorMode"> | null | undefined,
): EventDoor | null {
  if (!event) return null;
  const doors = normalizeDoors(event.doors);
  if (doors.length < 2) return null;
  const savedId = getTabletDoorId(event.id);
  const found = savedId ? doors.find((door) => door.id === savedId) ?? null : null;
  if (found) return found;
  // En modo «enlace» cualquier puerta puede admitir; usamos la primera como
  // etiqueta inicial, pero en modo «asignada» exigimos elección explícita en
  // cada tablet para que dos tablets no se queden por descuido en Puerta 1.
  if (effectiveDoorMode(event) === "enlace") return doors[0];
  return null;
}

export function useTabletDoor(
  event: Pick<WeddingEvent, "id" | "doors" | "doorMode"> | null | undefined,
): EventDoor | null {
  useSyncExternalStore(
    subscribeTabletDoor,
    () => `${doorRevision}:${event ? getTabletDoorId(event.id) ?? "" : ""}`,
    () => "",
  );
  return resolveTabletDoor(event);
}
