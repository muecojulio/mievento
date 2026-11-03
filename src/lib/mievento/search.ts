/**
 * Búsqueda de invitados para la puerta («Sin código»).
 *
 * Además del nombre, permite encontrar a alguien por su mesa, teléfono o
 * correo: son datos que ya están en la lista local. No hay red ni servicios
 * externos. Función pura, probada sin navegador.
 */
import type { Guest } from "./types.ts";

export type MatchField = "nombre" | "mesa" | "teléfono" | "correo";

export type GuestMatch = {
  guest: Guest;
  field: MatchField;
};

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Prioridad: nombre, mesa, teléfono, correo. Devuelve máximo `limit` coincidencias. */
export function searchGuests(guests: Guest[], query: string, limit = 8): GuestMatch[] {
  const text = query.trim();
  const q = fold(text);
  if (q.length < 2) return [];
  // Solo comparamos dígitos si la búsqueda realmente trae un número; si no,
  // una cadena vacía haría que cualquier teléfono "coincidiera".
  const qDigits = digits(text);
  const phoneQuery = qDigits.length >= 2 ? qDigits : null;
  const found: GuestMatch[] = [];
  for (const guest of guests) {
    let field: MatchField | null = null;
    if (fold(guest.name).includes(q)) field = "nombre";
    else if (fold(guest.note).includes(q)) field = "mesa";
    else if (phoneQuery && digits(guest.phone).includes(phoneQuery)) field = "teléfono";
    else if (fold(guest.email).includes(q)) field = "correo";
    if (field) found.push({ guest, field });
  }
  return found.sort((a, b) => a.guest.name.localeCompare(b.guest.name, "es")).slice(0, limit);
}

export function matchLabel(field: MatchField): string {
  if (field === "mesa") return "Mesa";
  if (field === "teléfono") return "Teléfono";
  if (field === "correo") return "Correo";
  return "Nombre";
}
