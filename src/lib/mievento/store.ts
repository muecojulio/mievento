import { onChange, publishChange } from "@/lib/mievento/change-bus";
import { decryptBackup, encryptBackup } from "@/lib/mievento/backup-crypto";
import { useMemo, useSyncExternalStore } from "react";
import { makeToken, parseToken, randomId, randomSecret, safeEqual, signBody } from "@/lib/mievento/crypto";
import {
  dbAdmitGuest,
  dbDeleteEvent,
  dbDeleteGuest,
  dbGetAll,
  dbPutEvent,
  dbPutGuests,
  dbReplacePeerSnapshot,
} from "@/lib/mievento/db";
import {
  effectiveDoorMode,
  effectiveDoorRule,
  normalizeDoors,
  resolveTabletDoor,
} from "@/lib/mievento/doors";
import {
  isSyncClientForEvent,
  isSyncConnectedForEvent,
  registerAdmitCoordinator,
  requestRemoteAdmit,
} from "@/lib/mievento/local-sync";
import type {
  AdmitResult,
  DoorMode,
  DoorRule,
  DraftGuest,
  EntryKind,
  EventDoor,
  Guest,
  GuestStatus,
  ImportReport,
  SendChannel,
  Side,
  WeddingEvent,
} from "@/lib/mievento/types";

const EMPTY_EVENTS: WeddingEvent[] = [];
const EMPTY_GUESTS: Guest[] = [];
const SEEDED_KEY = "mievento-seeded";

let events: WeddingEvent[] = EMPTY_EVENTS;
let guests: Guest[] = EMPTY_GUESTS;
let ready = false;
let bootError: string | null = null;
let bootPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function bootInner() {
  try {
    const stored = await dbGetAll();
    events = stored.events.map(normalizeEvent).sort((a, b) => b.createdAt - a.createdAt);
    guests = stored.guests.map(normalizeGuest);
    if (events.length === 0 && !localStorage.getItem(SEEDED_KEY)) {
      await seedDemo();
      localStorage.setItem(SEEDED_KEY, "1");
    }
    onChange(() => {
      void dbGetAll()
        .then((stored) => {
          events = stored.events.map(normalizeEvent).sort((a, b) => b.createdAt - a.createdAt);
          guests = stored.guests.map(normalizeGuest);
          emit();
        })
        .catch(() => {
          bootError = "No se pudieron actualizar los datos sincronizados";
          emit();
        });
    });
    ready = true;
    bootError = null;
  } catch (error) {
    ready = true;
    bootError =
      error instanceof Error ? error.message : "No se pudo preparar la memoria de la tablet";
  }
  emit();
}

export function boot() {
  if (!bootPromise) bootPromise = bootInner();
  return bootPromise;
}

export function useReady() {
  return useSyncExternalStore(subscribe, () => ready, () => false);
}

export function useBootError() {
  return useSyncExternalStore(subscribe, () => bootError, () => null);
}

export function useEvents() {
  return useSyncExternalStore(subscribe, () => (ready ? events : EMPTY_EVENTS), () => EMPTY_EVENTS);
}

export function useGuests(eventId: string) {
  const all = useSyncExternalStore(
    subscribe,
    () => (ready ? guests : EMPTY_GUESTS),
    () => EMPTY_GUESTS,
  );
  return useMemo(() => all.filter((guest) => guest.eventId === eventId), [all, eventId]);
}

export function useEvent(eventId: string) {
  const list = useEvents();
  return list.find((event) => event.id === eventId) ?? null;
}

function replaceEvent(next: WeddingEvent) {
  const normalized = normalizeEvent(next);
  const rest = events.filter((event) => event.id !== normalized.id);
  events = [normalized, ...rest].sort((a, b) => b.createdAt - a.createdAt);
  emit();
}

function replaceGuest(next: Guest) {
  const normalized = normalizeGuest(next);
  const index = guests.findIndex((guest) => guest.id === normalized.id);
  guests =
    index === -1
      ? [...guests, normalized]
      : guests.map((guest) => (guest.id === normalized.id ? normalized : guest));
  emit();
}

export async function createEvent(input: {
  groom: string;
  bride: string;
  date: string;
  time: string;
  place: string;
  placeLat?: number | null;
  placeLon?: number | null;
  placeTz?: string;
  photo: Blob | null;
}): Promise<WeddingEvent> {
  const event: WeddingEvent = {
    id: randomId(),
    groom: input.groom.trim(),
    bride: input.bride.trim(),
    date: input.date,
    time: input.time || "18:00",
    place: input.place.trim(),
    placeLat: input.placeLat ?? null,
    placeLon: input.placeLon ?? null,
    placeTz: input.placeTz ?? "",
    photo: input.photo,
    secret: randomSecret(),
    demo: false,
    createdAt: Date.now(),
  };
  await dbPutEvent(event);
  replaceEvent(event);
  return event;
}

export async function finishEvent(eventId: string): Promise<void> {
  const current = events.find((event) => event.id === eventId);
  if (!current || current.closed) return;
  const next = { ...current, closed: true };
  await dbPutEvent(next);
  replaceEvent(next);
}

export async function reopenEvent(eventId: string): Promise<void> {
  const current = events.find((event) => event.id === eventId);
  if (!current?.closed) return;
  const next = { ...current, closed: false };
  await dbPutEvent(next);
  replaceEvent(next);
}

export async function recycleCodes(eventId: string): Promise<number> {
  const current = events.find((event) => event.id === eventId);
  if (!current?.closed) return 0;
  const list = guests.filter((guest) => guest.eventId === eventId);
  const used = list.filter((guest) => guest.status === "Ingresado").length;
  const reset = list.map((guest) =>
    guest.status === "Pendiente" &&
    guest.scannedAt == null &&
    guest.arrived == null &&
    guest.entry == null &&
    guest.admittedDoor == null
      ? guest
      : {
          ...guest,
          status: "Pendiente" as const,
          scannedAt: null,
          arrived: null,
          entry: null,
          admittedDoor: null,
        },
  );
  const changed = reset.filter((guest, index) => guest !== list[index]);
  const previousGuests = guests;
  guests = guests.map((guest) => reset.find((item) => item.id === guest.id) ?? guest);
  const reopened = { ...current, closed: false };
  replaceEvent(reopened);
  try {
    if (changed.length) await dbPutGuests(changed);
    await dbPutEvent(reopened);
  } catch (error) {
    guests = previousGuests;
    replaceEvent(current);
    throw error;
  }
  return used;
}

export async function updateEvent(
  eventId: string,
  patch: Partial<
    Pick<
      WeddingEvent,
      | "groom"
      | "bride"
      | "date"
      | "time"
      | "place"
      | "placeLat"
      | "placeLon"
      | "placeTz"
      | "photo"
      | "doors"
      | "doorMode"
      | "doorRule"
      | "strictDoorLink"
    >
  >,
): Promise<void> {
  const current = events.find((event) => event.id === eventId);
  if (!current) return;
  const next = normalizeEvent({ ...current, ...patch });
  await dbPutEvent(next);
  replaceEvent(next);
}

export async function configureEventDoors(
  eventId: string,
  config: {
    doorMode: DoorMode;
    doors: EventDoor[];
    doorRule?: DoorRule;
    strictDoorLink?: boolean;
  },
): Promise<void> {
  const cleanDoors = normalizeDoors(config.doors);
  const mode: DoorMode =
    config.doorMode !== "unica" && cleanDoors.length >= 2 ? config.doorMode : "unica";
  await updateEvent(eventId, {
    doorMode: mode,
    doors: cleanDoors,
    doorRule: config.doorRule ?? "auto",
    strictDoorLink: config.strictDoorLink ?? true,
  });
}

export async function removeEvent(eventId: string): Promise<void> {
  await dbDeleteEvent(eventId);
  events = events.filter((event) => event.id !== eventId);
  guests = guests.filter((guest) => guest.eventId !== eventId);
  emit();
}

export async function addGuests(eventId: string, drafts: DraftGuest[]): Promise<ImportReport> {
  const event = events.find((item) => item.id === eventId);
  if (!event) return { added: 0, skipped: drafts.length };
  const room = Math.max(0, 2000 - guests.filter((guest) => guest.eventId === eventId).length);
  const accepted = drafts.slice(0, room);
  const skipped = drafts.length - accepted.length;
  const created: Guest[] = [];
  for (let i = 0; i < accepted.length; i++) {
    const draft = accepted[i];
    const id = randomId();
    const token = await makeToken(event.secret, event.id, id);
    const door = draft.door?.trim() ? draft.door.trim().slice(0, 40) : null;
    created.push({
      id,
      eventId: event.id,
      name: draft.name.trim(),
      side: draft.side,
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      party: draft.party,
      note: draft.note.trim(),
      door,
      status: "Pendiente",
      token,
      scannedAt: null,
      arrived: null,
      entry: null,
      admittedDoor: null,
    });
    if (i > 0 && i % 40 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await dbPutGuests(created);
  guests = [...guests, ...created];
  emit();
  return { added: created.length, skipped };
}

export async function saveGuest(guest: Guest): Promise<void> {
  const normalized = normalizeGuest(guest);
  await dbPutGuests([normalized]);
  replaceGuest(normalized);
}

export async function removeGuest(guestId: string): Promise<void> {
  await dbDeleteGuest(guestId);
  guests = guests.filter((guest) => guest.id !== guestId);
  emit();
}

export async function setGuestSide(guestId: string, side: Side): Promise<void> {
  const guest = guests.find((item) => item.id === guestId);
  if (!guest || guest.side === side) return;
  await saveGuest({ ...guest, side });
}

export async function clearGuests(eventId: string): Promise<void> {
  const doomed = guests.filter((guest) => guest.eventId === eventId);
  await Promise.all(doomed.map((guest) => dbDeleteGuest(guest.id)));
  guests = guests.filter((guest) => guest.eventId !== eventId);
  emit();
}

export type AdmitOptions = {
  /** Identificador de la puerta activa de esta tablet (si no se lee de almacenamiento local). */
  tabletDoorId?: string | null;
  /** Etiqueta de la puerta que solicita el ingreso (usado también en solicitudes remotas). */
  doorName?: string | null;
  /** Uso interno cuando la tablet principal ejecuta un ingreso pedido por otra puerta conectada. */
  fromPeer?: boolean;
};

let admitChain: Promise<unknown> = Promise.resolve();

export function admitToken(
  eventId: string,
  raw: string,
  options?: AdmitOptions,
): Promise<AdmitResult> {
  const run = admitChain.then(() => admitInner(eventId, raw, options));
  admitChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function doorOfflineResult(): AdmitResult {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return {
    ok: false,
    reason: "door-offline",
    message: offline
      ? "Sin internet ni enlace entre puertas: se requiere conexión para que un QR no pase en otra entrada"
      : "Puertas sin enlazar: conecta las tablets o requiere internet para validar en varias puertas",
  };
}

async function admitInner(
  eventId: string,
  raw: string,
  options?: AdmitOptions,
): Promise<AdmitResult> {
  const parsed = parseToken(raw);
  if (!parsed) {
    return {
      ok: false,
      reason: "invalid",
      message: "Este código no está en la lista. El paso no está autorizado.",
    };
  }
  const event = events.find((item) => item.id === eventId);
  if (!event || parsed.eventId !== event.id) {
    const known = events.some((item) => item.id === parsed.eventId);
    return {
      ok: false,
      reason: known ? "other-event" : "invalid",
      message: known
        ? "Este pase es de otro evento. El paso no está autorizado."
        : "Este código no está en la lista. El paso no está autorizado.",
    };
  }
  const expected = await signBody(event.secret, `ME1.${parsed.eventId}.${parsed.guestId}`);
  if (!safeEqual(expected, parsed.sig)) {
    return {
      ok: false,
      reason: "invalid",
      message: "Este código no está en la lista. El paso no está autorizado.",
    };
  }

  const mode = effectiveDoorMode(event);
  const tabletDoor = resolveTabletDoor(event);
  const doorName = options?.doorName ?? tabletDoor?.name ?? null;

  if (!options?.fromPeer) {
    if (mode === "enlace") {
      if (isSyncClientForEvent(event.id)) {
        const remote = await requestRemoteAdmit({
          kind: "token",
          eventId: event.id,
          raw,
          doorName,
        });
        if (remote) {
          if (remote.ok) replaceGuest(remote.guest);
          else if (remote.guest) replaceGuest(remote.guest);
          return remote;
        }
        if (event.strictDoorLink !== false) return doorOfflineResult();
      } else if (!isSyncConnectedForEvent(event.id) && event.strictDoorLink !== false) {
        return doorOfflineResult();
      }
    } else if (mode === "unica" && isSyncClientForEvent(event.id)) {
      const remote = await requestRemoteAdmit({
        kind: "token",
        eventId: event.id,
        raw,
        doorName,
      });
      if (remote) {
        if (remote.ok) replaceGuest(remote.guest);
        else if (remote.guest) replaceGuest(remote.guest);
        return remote;
      }
    }
  }

  const tabletDoorId =
    options?.tabletDoorId !== undefined ? options.tabletDoorId : (tabletDoor?.id ?? null);
  return admitExisting(event, parsed.guestId, "pase", undefined, parsed.token, {
    tabletDoorId,
    doorName,
  });
}

export function admitByName(
  guestId: string,
  arrived?: number,
  options?: AdmitOptions,
): Promise<AdmitResult> {
  const run = admitChain.then(() => admitNamed(guestId, arrived, options));
  admitChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function admitNamed(
  guestId: string,
  arrived?: number,
  options?: AdmitOptions,
): Promise<AdmitResult> {
  const guest = guests.find((item) => item.id === guestId);
  if (!guest) {
    return {
      ok: false,
      reason: "invalid",
      message: "Este invitado ya no está en la lista. El paso no está autorizado.",
    };
  }
  const event = events.find((item) => item.id === guest.eventId);
  if (!event) {
    return {
      ok: false,
      reason: "invalid",
      message: "El evento ya no existe. El paso no está autorizado.",
    };
  }

  const mode = effectiveDoorMode(event);
  const tabletDoor = resolveTabletDoor(event);
  const doorName = options?.doorName ?? tabletDoor?.name ?? null;

  if (!options?.fromPeer) {
    if (mode === "enlace") {
      if (isSyncClientForEvent(event.id)) {
        const remote = await requestRemoteAdmit({
          kind: "name",
          eventId: event.id,
          guestId,
          arrived,
          doorName,
        });
        if (remote) {
          if (remote.ok) replaceGuest(remote.guest);
          else if (remote.guest) replaceGuest(remote.guest);
          return remote;
        }
        if (event.strictDoorLink !== false) return doorOfflineResult();
      } else if (!isSyncConnectedForEvent(event.id) && event.strictDoorLink !== false) {
        return doorOfflineResult();
      }
    } else if (mode === "unica" && isSyncClientForEvent(event.id)) {
      const remote = await requestRemoteAdmit({
        kind: "name",
        eventId: event.id,
        guestId,
        arrived,
        doorName,
      });
      if (remote) {
        if (remote.ok) replaceGuest(remote.guest);
        else if (remote.guest) replaceGuest(remote.guest);
        return remote;
      }
    }
  }

  const tabletDoorId =
    options?.tabletDoorId !== undefined ? options.tabletDoorId : (tabletDoor?.id ?? null);
  return admitExisting(event, guestId, "nombre", arrived, undefined, {
    tabletDoorId,
    doorName,
  });
}

async function admitExisting(
  event: WeddingEvent,
  guestId: string,
  entry: "pase" | "nombre",
  arrived?: number,
  token?: string,
  doorOpts?: { tabletDoorId?: string | null; doorName?: string | null },
): Promise<AdmitResult> {
  const result = await dbAdmitGuest({
    eventId: event.id,
    guestId,
    expectedSecret: event.secret,
    entry,
    arrived,
    token,
    tabletDoorId: doorOpts?.tabletDoorId,
    doorName: doorOpts?.doorName,
  });
  if (result.kind === "invalid") {
    return {
      ok: false,
      reason: "invalid",
      message: "Este código o invitado no está en la lista. El paso no está autorizado.",
    };
  }
  if (result.kind === "closed") {
    return {
      ok: false,
      reason: "closed",
      message: "El evento ya terminó. El paso no está autorizado.",
    };
  }
  if (result.kind === "no-door") {
    return {
      ok: false,
      reason: "no-door",
      message: "Elige primero qué puerta controla esta tablet antes de escanear.",
    };
  }
  if (result.kind === "wrong-door") {
    return {
      ok: false,
      reason: "wrong-door",
      guest: result.guest,
      doorName: result.assignedDoor.name,
      currentDoorName: result.currentDoor.name,
      message: `Este pase solo es válido en ${result.assignedDoor.name}`,
    };
  }
  replaceGuest(result.guest);
  if (result.kind === "used") {
    return {
      ok: false,
      reason: "used",
      guest: result.guest,
      duplicate: true,
      firstEntryAt: result.guest.scannedAt,
      doorName: result.guest.admittedDoor ?? null,
      message: entry === "pase" ? "Código ya utilizado" : "Esta persona ya ingresó",
    };
  }
  return { ok: true, guest: result.guest };
}

export function addWalkIn(
  eventId: string,
  input: { name: string; side: Side; party: number },
  options?: AdmitOptions,
): Promise<AdmitResult> {
  const run = admitChain.then(() => walkInInner(eventId, input, options));
  admitChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function walkInInner(
  eventId: string,
  input: { name: string; side: Side; party: number },
  options?: AdmitOptions,
): Promise<AdmitResult> {
  const event = events.find((item) => item.id === eventId);
  const name = input.name.trim().slice(0, 80);
  if (!event || !name) {
    return { ok: false, reason: "invalid", message: "Falta el nombre. El paso no está autorizado." };
  }
  if (event.closed) {
    return {
      ok: false,
      reason: "closed",
      message: "El evento ya terminó. El paso no está autorizado.",
    };
  }

  const mode = effectiveDoorMode(event);
  const tabletDoor = resolveTabletDoor(event);
  const doorName = options?.doorName ?? tabletDoor?.name ?? null;

  if (!options?.fromPeer) {
    if (mode === "asignada") {
      const doorId =
        options?.tabletDoorId !== undefined ? options.tabletDoorId : (tabletDoor?.id ?? null);
      const validDoor = normalizeDoors(event.doors).find((d) => d.id === doorId) ?? null;
      if (!validDoor) {
        return {
          ok: false,
          reason: "no-door",
          message: "Elige primero qué puerta controla esta tablet antes de registrar entradas.",
        };
      }
    } else if (mode === "enlace") {
      if (isSyncClientForEvent(event.id)) {
        const remote = await requestRemoteAdmit({
          kind: "walkin",
          eventId: event.id,
          name,
          side: input.side,
          party: input.party,
          doorName,
        });
        if (remote) {
          if (remote.ok) replaceGuest(remote.guest);
          return remote;
        }
        if (event.strictDoorLink !== false) return doorOfflineResult();
      } else if (!isSyncConnectedForEvent(event.id) && event.strictDoorLink !== false) {
        return doorOfflineResult();
      }
    } else if (mode === "unica" && isSyncClientForEvent(event.id)) {
      const remote = await requestRemoteAdmit({
        kind: "walkin",
        eventId: event.id,
        name,
        side: input.side,
        party: input.party,
        doorName,
      });
      if (remote) {
        if (remote.ok) replaceGuest(remote.guest);
        return remote;
      }
    }
  }

  const room = 2000 - guests.filter((guest) => guest.eventId === eventId).length;
  if (room <= 0) {
    return {
      ok: false,
      reason: "invalid",
      message: "La lista ya está llena. El paso no está autorizado.",
    };
  }
  const id = randomId();
  const party = clampParty(input.party);
  const doorId =
    options?.tabletDoorId !== undefined ? options.tabletDoorId : (tabletDoor?.id ?? null);
  const resolvedWalkInDoor =
    mode === "asignada"
      ? (normalizeDoors(event.doors).find((d) => d.id === doorId) ?? null)
      : null;

  const pending: Guest = {
    id,
    eventId: event.id,
    name,
    side: input.side,
    email: "",
    phone: "",
    party,
    note: "",
    door: resolvedWalkInDoor?.id ?? null,
    status: "Pendiente",
    token: await makeToken(event.secret, event.id, id),
    scannedAt: null,
    arrived: null,
    entry: null,
    admittedDoor: null,
  };
  const next = await commitAdmit(
    pending,
    "puerta",
    party,
    resolvedWalkInDoor?.name ?? doorName,
  );
  return { ok: true, guest: next };
}

async function commitAdmit(
  previous: Guest,
  entry: EntryKind,
  arrived: number,
  admittedDoor: string | null = null,
): Promise<Guest> {
  const next: Guest = {
    ...previous,
    status: "Ingresado" satisfies GuestStatus,
    scannedAt: Date.now(),
    arrived,
    entry,
    admittedDoor,
  };
  const existed = guests.some((guest) => guest.id === previous.id);
  replaceGuest(next);
  try {
    await dbPutGuests([next]);
  } catch (error) {
    if (existed) replaceGuest(previous);
    else {
      guests = guests.filter((guest) => guest.id !== previous.id);
      emit();
    }
    throw error;
  }
  return next;
}

registerAdmitCoordinator(async (req) => {
  if (req.kind === "token") {
    return admitToken(req.eventId, req.raw, { fromPeer: true, doorName: req.doorName });
  }
  if (req.kind === "name") {
    return admitByName(req.guestId, req.arrived, { fromPeer: true, doorName: req.doorName });
  }
  return addWalkIn(
    req.eventId,
    { name: req.name, side: req.side, party: req.party },
    { fromPeer: true, doorName: req.doorName },
  );
});

export async function setArrived(guestId: string, count: number): Promise<Guest | null> {
  const guest = guests.find((item) => item.id === guestId);
  if (!guest || guest.status !== "Ingresado") return null;
  const arrived = clampArrived(count, guest.party);
  if (guest.arrived === arrived) return guest;
  const next: Guest = { ...guest, arrived };
  replaceGuest(next);
  try {
    await dbPutGuests([next]);
  } catch (error) {
    replaceGuest(guest);
    throw error;
  }
  return next;
}

/** Deja constancia de que el pase salió por WhatsApp, correo o compartir. */
export async function markGuestSent(
  guestId: string,
  via: SendChannel,
  at: number = Date.now(),
): Promise<Guest | null> {
  const guest = guests.find((item) => item.id === guestId);
  if (!guest || guest.sentAt === at) return guest ?? null;
  const next: Guest = { ...guest, sentAt: at, sentVia: via };
  replaceGuest(next);
  try {
    await dbPutGuests([next]);
  } catch (error) {
    replaceGuest(guest);
    throw error;
  }
  return next;
}

export async function revertAdmit(guestId: string): Promise<void> {
  const guest = guests.find((item) => item.id === guestId);
  if (!guest || guest.status !== "Ingresado") return;
  const next: Guest = {
    ...guest,
    status: "Pendiente",
    scannedAt: null,
    arrived: null,
    entry: null,
    admittedDoor: null,
  };
  replaceGuest(next);
  try {
    await dbPutGuests([next]);
  } catch (error) {
    replaceGuest(guest);
    throw error;
  }
}

export async function exportBackup(eventId: string, password?: string): Promise<string> {
  const event = events.find((item) => item.id === eventId);
  if (!event) throw new Error("Evento no encontrado");
  const list = guests.filter((guest) => guest.eventId === eventId);
  let photo: string | null = null;
  if (event.photo) photo = await blobToDataUrl(event.photo);
  const json = JSON.stringify(
    {
      kind: "mievento-backup",
      version: 1,
      event: { ...event, photo },
      guests: list,
    },
    null,
    2,
  );
  return password === undefined ? json : encryptBackup(json, password);
}

export async function importBackup(file: File, password?: string): Promise<string> {
  const parsed = JSON.parse(await decryptBackup(await file.text(), password)) as {
    kind?: string;
    event?: WeddingEvent & { photo: string | null };
    guests?: Guest[];
  };
  if (parsed.kind !== "mievento-backup" || !parsed.event?.id || !parsed.event.secret) {
    throw new Error("Este archivo no es una copia de Mi Evento");
  }
  if (
    !Array.isArray(parsed.guests) ||
    parsed.guests.length > 2000 ||
    typeof parsed.event.secret !== "string" ||
    typeof parsed.event.id !== "string" ||
    [
      parsed.event.groom,
      parsed.event.bride,
      parsed.event.date,
      parsed.event.time,
      parsed.event.place,
    ].some((value) => typeof value !== "string") ||
    !Number.isFinite(parsed.event.createdAt) ||
    parsed.guests.some(
      (g) =>
        !g ||
        typeof g.id !== "string" ||
        typeof g.name !== "string" ||
        typeof g.token !== "string" ||
        g.eventId !== parsed.event!.id ||
        !["novio", "novia"].includes(g.side) ||
        !["Pendiente", "Ingresado"].includes(g.status),
    )
  ) {
    throw new Error("La copia contiene datos no válidos");
  }
  const photo = parsed.event.photo ? await dataUrlToBlob(parsed.event.photo) : null;
  const event = normalizeEvent({ ...parsed.event, photo, demo: false });
  const list = (parsed.guests ?? [])
    .filter((guest) => guest.eventId === event.id && guest.token && guest.name)
    .map(normalizeGuest);
  const stale = guests.filter(
    (guest) => guest.eventId === event.id && !list.some((item) => item.id === guest.id),
  );
  await dbReplacePeerSnapshot(event, list);
  events = [event, ...events.filter((item) => item.id !== event.id)];
  const others = guests.filter((guest) => guest.eventId !== event.id);
  guests = [...others, ...list];
  for (const guest of stale)
    publishChange({ type: "delete-guest", id: guest.id, eventId: event.id });
  publishChange({ type: "event", event });
  publishChange({ type: "guests", guests: list });
  emit();
  return event.id;
}

async function seedDemo() {
  const event: WeddingEvent = {
    id: randomId(),
    groom: "Mateo",
    bride: "Valentina",
    date: nextSaturday(),
    time: "18:00",
    place: "Jardín del centro",
    // Coordenadas del centro de la CDMX para que el ejemplo también muestre
    // clima, mapa y "cómo llegar" (ayudas en línea opcionales).
    placeLat: 19.43261,
    placeLon: -99.13321,
    placeTz: "America/Mexico_City",
    photo: null,
    secret: randomSecret(),
    demo: true,
    createdAt: Date.now(),
    motif: "hoja",
  };
  const samples: DraftGuest[] = [
    { name: "Andrés Ríos", side: "novio", email: "", phone: "", party: 2, note: "Mesa 1" },
    { name: "Carmen Ríos", side: "novio", email: "", phone: "", party: 1, note: "Mesa 1" },
    { name: "Diego Salinas", side: "novio", email: "", phone: "", party: 3, note: "Mesa 2" },
    { name: "Elena Cruz", side: "novia", email: "", phone: "", party: 2, note: "Mesa 4" },
    { name: "Pablo Herrera", side: "novia", email: "", phone: "", party: 1, note: "Mesa 4" },
    { name: "Inés Navarro", side: "novia", email: "", phone: "", party: 4, note: "Mesa 5" },
  ];
  const created: Guest[] = [];
  for (const draft of samples) {
    const id = randomId();
    created.push({
      id,
      eventId: event.id,
      ...draft,
      door: null,
      status: "Pendiente",
      token: await makeToken(event.secret, event.id, id),
      scannedAt: null,
      arrived: null,
      entry: null,
      admittedDoor: null,
    });
  }
  await dbPutEvent(event);
  await dbPutGuests(created);
  events = [event];
  guests = created;
}

function clampParty(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(20, Math.round(value));
}

function clampArrived(value: number, party: number): number {
  const max = clampParty(party);
  if (!Number.isFinite(value) || value < 1) return max;
  return Math.min(max, Math.round(value));
}

function normalizeEvent(raw: WeddingEvent): WeddingEvent {
  const doors = normalizeDoors(raw.doors);
  const doorMode = effectiveDoorMode({ doorMode: raw.doorMode, doors });
  const doorRule = effectiveDoorRule(raw);
  const strictDoorLink = raw.strictDoorLink !== false;
  return {
    ...raw,
    ...(doors.length > 0 ? { doors } : { doors: undefined }),
    ...(doorMode !== "unica" ? { doorMode, doorRule, strictDoorLink } : { doorMode: "unica" }),
  };
}

function normalizeGuest(raw: Guest): Guest {
  const party = clampParty(raw.party);
  const sentAt = typeof raw.sentAt === "number" && raw.sentAt > 0 ? raw.sentAt : null;
  const sentVia =
    raw.sentVia === "whatsapp" || raw.sentVia === "correo" || raw.sentVia === "compartir"
      ? raw.sentVia
      : null;
  const door = typeof raw.door === "string" && raw.door.trim() ? raw.door.trim().slice(0, 40) : null;
  if (raw.status !== "Ingresado") {
    return { ...raw, party, sentAt, sentVia, door, arrived: null, entry: null, admittedDoor: null };
  }
  const entry =
    raw.entry === "nombre" || raw.entry === "puerta" || raw.entry === "pase" ? raw.entry : "pase";
  const admittedDoor =
    typeof raw.admittedDoor === "string" && raw.admittedDoor.trim()
      ? raw.admittedDoor.trim().slice(0, 40)
      : null;
  return {
    ...raw,
    party,
    sentAt,
    sentVia,
    door,
    status: "Ingresado",
    arrived: clampArrived(typeof raw.arrived === "number" ? raw.arrived : party, party),
    entry,
    admittedDoor,
  };
}

function nextSaturday(): string {
  const date = new Date();
  const delta = (6 - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + delta);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob | null> {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const data = match[3] || "";
  if (match[2]) {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(data)], { type: mime });
}
