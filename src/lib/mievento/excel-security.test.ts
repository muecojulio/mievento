import assert from "node:assert/strict";
import { it } from "node:test";
import { closingCsv, tablesCsv } from "./excel.ts";
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

it("el plan de mesas agrupa, ordena y protege las celdas exportadas", async () => {
  const rows = [
    { name: "Ana", side: "novio", party: 2, status: "Ingresado", arrived: 2, note: "Mesa 10" },
    { name: "@SUM(A1)", side: "novia", party: 1, status: "Pendiente", note: "Mesa 2" },
    { name: "Luis", side: "novio", party: 3, status: "Pendiente", note: "" },
  ] as Guest[];
  const csv = await tablesCsv(rows).text();
  assert.ok(csv.indexOf("Mesa 2") < csv.indexOf("Mesa 10"));
  assert.ok(csv.indexOf("Mesa 10") < csv.indexOf("Sin mesa"));
  assert.ok(csv.includes("'@SUM(A1)"));
  assert.ok(csv.includes("Mesa 10;1;1;2;2"));
});
