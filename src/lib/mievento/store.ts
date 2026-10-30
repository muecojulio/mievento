import { useMemo, useSyncExternalStore } from "react";
import { makeToken, parseToken, randomId, randomSecret, safeEqual, signBody } from "@/lib/mievento/crypto";
import { dbDeleteEvent, dbDeleteGuest, dbGetAll, dbPutEvent, dbPutGuests } from "@/lib/mievento/db";
import type { AdmitResult, DraftGuest, EntryKind, Guest, GuestStatus, ImportReport, Side, WeddingEvent } from "@/lib/mievento/types";

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
    events = stored.events.sort((a, b) => b.createdAt - a.createdAt);
    guests = stored.guests.map(normalizeGuest);
    if (events.length === 0 && !localStorage.getItem(SEEDED_KEY)) {
      await seedDemo();
      localStorage.setItem(SEEDED_KEY, "1");
    }
    ready = true;
    bootError = null;
  } catch (error) {
    ready = true;
    bootError = error instanceof Error ? error.message : "No se pudo preparar la memoria de la tablet";
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
  const all = useSyncExternalStore(subscribe, () => (ready ? guests : EMPTY_GUESTS), () => EMPTY_GUESTS);
  return useMemo(() => all.filter((guest) => guest.eventId === eventId), [all, eventId]);
}

export function useEvent(eventId: string) {
  const list = useEvents();
  return list.find((event) => event.id === eventId) ?? null;
}

function replaceEvent(next: WeddingEvent) {
  const rest = events.filter((event) => event.id !== next.id);
  events = [next, ...rest].sort((a, b) => b.createdAt - a.createdAt);
  emit();
}

function replaceGuest(next: Guest) {
  const index = guests.findIndex((guest) => guest.id === next.id);
  guests = index === -1 ? [...guests, next] : guests.map((guest) => (guest.id === next.id ? next : guest));
  emit();
}

export async function createEvent(input: {
  groom: string;
  bride: string;
  date: string;
  time: string;
  place: string;
  photo: Blob | null;
}): Promise<WeddingEvent> {
  const event: WeddingEvent = {
    id: randomId(),
    groom: input.groom.trim(),
    bride: input.bride.trim(),
    date: input.date,
    time: input.time || "18:00",
    place: input.place.trim(),
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
    guest.status === "Pendiente" && guest.scannedAt == null && guest.arrived == null && guest.entry == null
      ? guest
      : { ...guest, status: "Pendiente" as const, scannedAt: null, arrived: null, entry: null },
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
  patch: Partial<Pick<WeddingEvent, "groom" | "bride" | "date" | "time" | "place" | "photo">>,
): Promise<void> {
  const current = events.find((event) => event.id === eventId);
  if (!current) return;
  const next = { ...current, ...patch };
  await dbPutEvent(next);
  replaceEvent(next);
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
    created.push({
      id,
      eventId: event.id,
      name: draft.name.trim(),
      side: draft.side,
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      party: draft.party,
      note: draft.note.trim(),
      status: "Pendiente",
      token,
      scannedAt: null,
      arrived: null,
      entry: null,
    });
    if (i > 0 && i % 40 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await dbPutGuests(created);
  guests = [...guests, ...created];
  emit();
  return { added: created.length, skipped };
}

export async function saveGuest(guest: Guest): Promise<void> {
  await dbPutGuests([guest]);
  replaceGuest(guest);
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

let admitChain: Promise<unknown> = Promise.resolve();

export function admitToken(eventId: string, raw: string): Promise<AdmitResult> {
  const run = admitChain.then(() => admitInner(eventId, raw));
  admitChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function admitInner(eventId: string, raw: string): Promise<AdmitResult> {
  const parsed = parseToken(raw);
  if (!parsed) {
    return { ok: false, reason: "invalid", message: "Este código no está en la lista. El paso no está autorizado." };
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
    return { ok: false, reason: "invalid", message: "Este código no está en la lista. El paso no está autorizado." };
  }
  if (event.closed) {
    return { ok: false, reason: "closed", message: "El evento ya terminó. El paso no está autorizado." };
  }
  const guest = guests.find((item) => item.id === parsed.guestId && item.eventId === eventId);
  if (!guest || guest.token !== parsed.token) {
    return { ok: false, reason: "invalid", message: "Este código no está en la lista. El paso no está autorizado." };
  }
  if (guest.status === "Ingresado") {
    return {
      ok: false,
      reason: "used",
      guest,
      message: "Error: Este código ya fue utilizado",
    };
  }
  const next = await commitAdmit(guest, "pase", guest.party);
  return { ok: true, guest: next };
}

export function admitByName(guestId: string, arrived?: number): Promise<AdmitResult> {
  const run = admitChain.then(() => admitNamed(guestId, arrived));
  admitChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function admitNamed(guestId: string, arrived?: number): Promise<AdmitResult> {
  const guest = guests.find((item) => item.id === guestId);
  if (!guest) {
    return { ok: false, reason: "invalid", message: "Este invitado ya no está en la lista. El paso no está autorizado." };
  }
  const event = events.find((item) => item.id === guest.eventId);
  if (event?.closed) {
    return { ok: false, reason: "closed", guest, message: "El evento ya terminó. El paso no está autorizado." };
  }
  if (guest.status === "Ingresado") {
    return { ok: false, reason: "used", guest, message: "Esta persona ya ingresó" };
  }
  const next = await commitAdmit(guest, "nombre", clampArrived(arrived ?? guest.party, guest.party));
  return { ok: true, guest: next };
}

export function addWalkIn(
  eventId: string,
  input: { name: string; side: Side; party: number },
): Promise<AdmitResult> {
  const run = admitChain.then(() => walkInInner(eventId, input));
  admitChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function walkInInner(
  eventId: string,
  input: { name: string; side: Side; party: number },
): Promise<AdmitResult> {
  const event = events.find((item) => item.id === eventId);
  const name = input.name.trim().slice(0, 80);
  if (!event || !name) {
    return { ok: false, reason: "invalid", message: "Falta el nombre. El paso no está autorizado." };
  }
  if (event.closed) {
    return { ok: false, reason: "closed", message: "El evento ya terminó. El paso no está autorizado." };
  }
  const room = 2000 - guests.filter((guest) => guest.eventId === eventId).length;
  if (room <= 0) {
    return { ok: false, reason: "invalid", message: "La lista ya está llena. El paso no está autorizado." };
  }
  const id = randomId();
  const party = clampParty(input.party);
  const pending: Guest = {
    id,
    eventId: event.id,
    name,
    side: input.side,
    email: "",
    phone: "",
    party,
    note: "",
    status: "Pendiente",
    token: await makeToken(event.secret, event.id, id),
    scannedAt: null,
    arrived: null,
    entry: null,
  };
  const next = await commitAdmit(pending, "puerta", party);
  return { ok: true, guest: next };
}

async function commitAdmit(previous: Guest, entry: EntryKind, arrived: number): Promise<Guest> {
  const next: Guest = {
    ...previous,
    status: "Ingresado" satisfies GuestStatus,
    scannedAt: Date.now(),
    arrived,
    entry,
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

export async function revertAdmit(guestId: string): Promise<void> {
  const guest = guests.find((item) => item.id === guestId);
  if (!guest || guest.status !== "Ingresado") return;
  const next: Guest = { ...guest, status: "Pendiente", scannedAt: null, arrived: null, entry: null };
  replaceGuest(next);
  try {
    await dbPutGuests([next]);
  } catch (error) {
    replaceGuest(guest);
    throw error;
  }
}

export async function exportBackup(eventId: string): Promise<string> {
  const event = events.find((item) => item.id === eventId);
  if (!event) throw new Error("Evento no encontrado");
  const list = guests.filter((guest) => guest.eventId === eventId);
  let photo: string | null = null;
  if (event.photo) photo = await blobToDataUrl(event.photo);
  return JSON.stringify(
    {
      kind: "mievento-backup",
      version: 1,
      event: { ...event, photo },
      guests: list,
    },
    null,
    2,
  );
}

export async function importBackup(file: File): Promise<string> {
  const parsed = JSON.parse(await file.text()) as {
    kind?: string;
    event?: WeddingEvent & { photo: string | null };
    guests?: Guest[];
  };
  if (parsed.kind !== "mievento-backup" || !parsed.event?.id || !parsed.event.secret) {
    throw new Error("Este archivo no es una copia de Mi Evento");
  }
  const photo = parsed.event.photo ? await dataUrlToBlob(parsed.event.photo) : null;
  const event: WeddingEvent = { ...parsed.event, photo, demo: false };
  const list = (parsed.guests ?? [])
    .filter((guest) => guest.eventId === event.id && guest.token && guest.name)
    .map(normalizeGuest);
  const keep = new Set(list.map((guest) => guest.id));
  const stale = guests.filter((guest) => guest.eventId === event.id && !keep.has(guest.id));
  await dbPutEvent(event);
  for (const guest of stale) await dbDeleteGuest(guest.id);
  await dbPutGuests(list);
  events = [event, ...events.filter((item) => item.id !== event.id)];
  const others = guests.filter((guest) => guest.eventId !== event.id);
  guests = [...others, ...list];
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
      status: "Pendiente",
      token: await makeToken(event.secret, event.id, id),
      scannedAt: null,
      arrived: null,
      entry: null,
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

function normalizeGuest(raw: Guest): Guest {
  const party = clampParty(raw.party);
  if (raw.status !== "Ingresado") {
    return { ...raw, party, arrived: null, entry: null };
  }
  const entry = raw.entry === "nombre" || raw.entry === "puerta" || raw.entry === "pase" ? raw.entry : "pase";
  return {
    ...raw,
    party,
    status: "Ingresado",
    arrived: clampArrived(typeof raw.arrived === "number" ? raw.arrived : party, party),
    entry,
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
