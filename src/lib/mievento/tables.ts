/**
 * Agrupación de invitados por la columna «mesa» (guardada en `note`).
 *
 * Función pura: solo ordena y suma datos que ya están en la lista local.
 * No guarda nada, no consulta la red y no añade campos a IndexedDB.
 */
import type { Guest } from "./types.ts";

export const NO_TABLE = "Sin mesa";

export type TableGroup = {
  table: string;
  invitations: number;
  admitted: number;
  expectedPeople: number;
  insidePeople: number;
  guests: Guest[];
};

function headsInside(guest: Guest): number {
  if (guest.status !== "Ingresado") return 0;
  return guest.arrived ?? guest.party;
}

function tableKey(label: string): string {
  if (label === NO_TABLE) return NO_TABLE;
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * La mesa vacía va al final y el orden usa comparación numérica, de modo que
 * «Mesa 2» aparece antes de «Mesa 10». Variantes de acentos, mayúsculas y
 * espacios de la misma mesa se juntan (el Excel suele traerlas mezcladas).
 * Los grupos conservan a sus invitados para la tarjeta y para el CSV.
 */
export function tableGroups(guests: Guest[]): TableGroup[] {
  const groups = new Map<string, TableGroup>();
  for (const guest of guests) {
    const table = guest.note.trim() || NO_TABLE;
    const key = tableKey(table);
    const group = groups.get(key) ?? {
      table,
      invitations: 0,
      admitted: 0,
      expectedPeople: 0,
      insidePeople: 0,
      guests: [],
    };
    group.invitations += 1;
    if (guest.status === "Ingresado") group.admitted += 1;
    group.expectedPeople += guest.party;
    group.insidePeople += headsInside(guest);
    group.guests.push(guest);
    groups.set(key, group);
  }
  const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
  return [...groups.values()].sort((a, b) => {
    if (a.table === NO_TABLE) return b.table === NO_TABLE ? 0 : 1;
    if (b.table === NO_TABLE) return -1;
    return collator.compare(a.table, b.table);
  });
}
