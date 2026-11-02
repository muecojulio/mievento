import assert from "node:assert/strict";
import { it } from "node:test";
import { closingCsv } from "./excel.ts";
import type { Guest, WeddingEvent } from "./types.ts";

it("neutraliza fórmulas en campos exportados sin perder el escapado CSV", async () => {
  const event = { groom: "Ana", bride: "Luis", date: "2026-12-01", place: "+cmd" } as WeddingEvent;
  const guest = { name: '=HYPERLINK("https://evil.test")', side: "novio", party: 1, status: "Pendiente", email: "  @formula", phone: "-123", note: "normal;nota" } as Guest;
  const csv = await closingCsv(event, [guest]).text();
  assert.ok(csv.includes("'+cmd"));
  assert.ok(csv.includes(`"'=HYPERLINK(""https://evil.test"")"`));
  assert.ok(csv.includes("'  @formula"));
  assert.ok(csv.includes("'-123"));
  assert.ok(csv.includes('"normal;nota"'));
});
