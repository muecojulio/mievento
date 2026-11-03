/**
 * Croquis de mesas: posiciones en un plano lógico de 1000 × 700.
 *
 * Todo se guarda en localStorage por evento; no hay servidor ni imágenes
 * subidas. Las posiciones se expresan en unidades del plano, así que el
 * tablero puede cambiar de tamaño en pantalla sin perder el acomodo.
 */
import type { TableGroup } from "./tables.ts";

export const BOARD_WIDTH = 1000;
export const BOARD_HEIGHT = 700;
export const CARD_WIDTH = 210;
export const CARD_HEIGHT = 104;
const PREFIX = "mievento-table-map-";

export type Point = { x: number; y: number };
export type TablePositions = Record<string, Point>;

export function mapKey(table: string): string {
  return table
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Acomodo inicial en columnas, con margen y separación uniformes. */
export function defaultLayout(groups: TableGroup[]): TablePositions {
  const gapX = 24;
  const gapY = 24;
  const marginX = 24;
  // Espacio reservado arriba para el título del croquis exportado a PNG.
  const marginY = 70;
  const perColumn = Math.max(1, Math.floor((BOARD_HEIGHT - marginY - gapY) / (CARD_HEIGHT + gapY)));
  const positions: TablePositions = {};
  groups.forEach((group, index) => {
    const column = Math.floor(index / perColumn);
    const row = index % perColumn;
    positions[mapKey(group.table)] = clampPoint({
      x: marginX + column * (CARD_WIDTH + gapX),
      y: marginY + row * (CARD_HEIGHT + gapY),
    });
  });
  return positions;
}

export function clampPoint(point: Point): Point {
  return {
    x: Math.min(BOARD_WIDTH - CARD_WIDTH, Math.max(0, Math.round(point.x))),
    y: Math.min(BOARD_HEIGHT - CARD_HEIGHT, Math.max(0, Math.round(point.y))),
  };
}

/** Conserva lo que el organizador ya acomodó y coloca las mesas nuevas. */
export function mergeLayout(groups: TableGroup[], saved: TablePositions): TablePositions {
  const fresh = defaultLayout(groups);
  const result: TablePositions = { ...fresh };
  for (const [key, point] of Object.entries(saved)) {
    if (!(key in fresh) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    result[key] = clampPoint(point);
  }
  return result;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadPositions(eventId: string): TablePositions {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(PREFIX + eventId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Point>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const clean: TablePositions = {};
    for (const [key, point] of Object.entries(parsed)) {
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) clean[key] = clampPoint(point);
    }
    return clean;
  } catch {
    return {};
  }
}

export function savePositions(eventId: string, positions: TablePositions): void {
  try {
    storage()?.setItem(PREFIX + eventId, JSON.stringify(positions));
  } catch {
    /* almacenamiento lleno o bloqueado: el croquis sigue en pantalla */
  }
}

export function clearPositions(eventId: string): void {
  try {
    storage()?.removeItem(PREFIX + eventId);
  } catch {
    /* almacenamiento bloqueado */
  }
}
