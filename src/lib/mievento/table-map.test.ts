import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CARD_HEIGHT,
  CARD_WIDTH,
  clampPoint,
  clearPositions,
  defaultLayout,
  loadPositions,
  mapKey,
  mergeLayout,
  savePositions,
} from "./table-map.ts";
import type { TableGroup } from "./tables.ts";

const memory = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
  clear: () => memory.clear(),
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size;
  },
} as Storage;

function group(table: string): TableGroup {
  return { table, invitations: 2, admitted: 1, expectedPeople: 4, insidePeople: 2, guests: [] };
}

beforeEach(() => memory.clear());

describe("croquis de mesas", () => {
  it("normaliza la llave de la mesa igual que la vista de mesas", () => {
    assert.equal(mapKey("  MÉSA 2 "), mapKey("mesa 2"));
  });

  it("el acomodo inicial no se sale del plano", () => {
    const groups = Array.from({ length: 24 }, (_, index) => group(`Mesa ${index + 1}`));
    const layout = defaultLayout(groups);
    assert.equal(Object.keys(layout).length, 24);
    for (const point of Object.values(layout)) {
      assert.ok(point.x >= 0 && point.x <= BOARD_WIDTH - CARD_WIDTH);
      assert.ok(point.y >= 0 && point.y <= BOARD_HEIGHT - CARD_HEIGHT);
    }
  });

  it("clampPoint limita coordenadas negativas y excedidas", () => {
    assert.deepEqual(clampPoint({ x: -50, y: -10 }), { x: 0, y: 0 });
    assert.deepEqual(clampPoint({ x: 9999, y: 9999 }), {
      x: BOARD_WIDTH - CARD_WIDTH,
      y: BOARD_HEIGHT - CARD_HEIGHT,
    });
  });

  it("merge conserva posiciones guardadas y coloca las mesas nuevas", () => {
    const groups = [group("Mesa 1"), group("Mesa 2"), group("Mesa 3")];
    const layout = mergeLayout(groups, { [mapKey("Mesa 1")]: { x: 500, y: 300 } });
    assert.deepEqual(layout[mapKey("Mesa 1")], { x: 500, y: 300 });
    assert.ok(layout[mapKey("Mesa 2")]);
    assert.ok(layout[mapKey("Mesa 3")]);
    // Una mesa que ya no existe se descarta.
    assert.equal(mapKey("Mesa 99") in layout, false);
  });

  it("guarda, lee y borra posiciones por evento", () => {
    const positions = { [mapKey("Mesa 1")]: { x: 120, y: 80 } };
    savePositions("evento-a", positions);
    assert.deepEqual(loadPositions("evento-a"), positions);
    assert.deepEqual(loadPositions("evento-b"), {});
    clearPositions("evento-a");
    assert.deepEqual(loadPositions("evento-a"), {});
  });

  it("ignora datos corruptos o con coordenadas no numéricas", () => {
    memory.set("mievento-table-map-x", "{roto");
    assert.deepEqual(loadPositions("x"), {});
    memory.set("mievento-table-map-x", JSON.stringify({ a: { x: "12", y: 4 }, b: null }));
    assert.deepEqual(loadPositions("x"), {});
  });
});
