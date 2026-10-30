import type { EntryKind, Guest, Side, WeddingEvent } from "@/lib/mievento/types";

export function formatLongDate(iso: string): string {
  if (!iso) return "Fecha por confirmar";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  const text = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatClock(ts: number): string {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

export function formatStamp(ts: number): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

export function foldText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function coupleNames(event: Pick<WeddingEvent, "groom" | "bride">): string {
  return `${event.groom} y ${event.bride}`;
}

export function sideLabel(side: Side): string {
  return side === "novia" ? "Novia" : "Novio";
}

export function sidePhrase(side: Side): string {
  return side === "novia" ? "Invitado de la novia" : "Invitado del novio";
}

export function entryLabel(entry: EntryKind | null): string {
  if (entry === "nombre") return "Búsqueda";
  if (entry === "puerta") return "En la puerta";
  if (entry === "pase") return "Pase";
  return "";
}

export function headsIn(guest: Guest): number {
  if (guest.status !== "Ingresado") return 0;
  return guest.arrived ?? guest.party;
}

export function waDigits(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 13 && digits.startsWith("521")) digits = `52${digits.slice(3)}`;
  if (digits.length === 10) digits = `52${digits}`;
  if (digits.length < 11 || digits.length > 15) return null;
  return digits;
}

export function peopleLabel(count: number): string {
  return count === 1 ? "1 persona" : `${count} personas`;
}

export function tally(guests: Guest[]) {
  const ofSide = (side: Side) => guests.filter((guest) => guest.side === side);
  const admitted = (list: Guest[]) => list.filter((guest) => guest.status === "Ingresado");
  const invited = (list: Guest[]) => list.reduce((sum, guest) => sum + guest.party, 0);
  const inside = (list: Guest[]) => list.reduce((sum, guest) => sum + headsIn(guest), 0);
  const novio = ofSide("novio");
  const novia = ofSide("novia");
  const novioIn = admitted(novio);
  const noviaIn = admitted(novia);
  const pending = guests.filter((guest) => guest.status !== "Ingresado");
  const allIn = admitted(guests);
  return {
    novioInvites: novio.length,
    noviaInvites: novia.length,
    totalInvites: guests.length,
    novioIn: novioIn.length,
    noviaIn: noviaIn.length,
    totalIn: allIn.length,
    novioPeople: inside(novio),
    noviaPeople: inside(novia),
    totalPeople: inside(guests),
    pendingInvites: pending.length,
    pendingPeople: invited(pending),
    expectedPeople: invited(guests),
  };
}

export function slugFile(event: Pick<WeddingEvent, "groom" | "bride">): string {
  return `${event.groom}-${event.bride}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
