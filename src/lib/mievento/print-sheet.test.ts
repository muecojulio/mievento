import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chunkForPrint, escapeHtml, printSheetHtml, type PrintCard } from "./print-sheet.ts";

function card(overrides: Partial<PrintCard> = {}): PrintCard {
  return {
    name: "Ana Ríos",
    side: "Invitado del novio",
    party: 2,
    token: "ME1.abc.def.ghi",
    qr: "data:image/png;base64,iVBORw0KGgo=",
    ...overrides,
  };
}

describe("hoja imprimible de pases", () => {
  it("reparte en hojas de 8 y respeta el límite", () => {
    assert.deepEqual(chunkForPrint([1, 2, 3], 8), [[1, 2, 3]]);
    assert.deepEqual(chunkForPrint([1, 2, 3, 4], 2), [
      [1, 2],
      [3, 4],
    ]);
    assert.equal(chunkForPrint(Array.from({ length: 19 }, (_, i) => i), 8).length, 3);
    assert.equal(chunkForPrint([1, 2, 3], 0).length, 3);
  });

  it("escapa nombres y datos para no inyectar HTML", () => {
    assert.equal(escapeHtml('<b>&"\'</b>'), "&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;");
    const html = printSheetHtml({
      title: "Boda <script>alert(1)</script>",
      subtitle: "14 & 15",
      cards: [card({ name: "<img src=x onerror=alert(1)>" })],
    });
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(!html.includes("<img src=x onerror"));
    assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
    assert.ok(html.includes("14 &amp; 15"));
  });

  it("solo incrusta QR locales en data URL", () => {
    const html = printSheetHtml({
      title: "Boda",
      subtitle: "",
      cards: [card({ qr: "https://tercero.test/qr.png" }), card({ qr: "data:image/png;base64,AAAA" })],
    });
    assert.equal(html.includes("https://tercero.test"), false);
    assert.equal((html.match(/class="qr"/g) ?? []).length, 1);
  });

  it("genera una sección por hoja con estilos de impresión", () => {
    const html = printSheetHtml({
      title: "Mateo y Valentina",
      subtitle: "Sábado 14 de noviembre",
      cards: Array.from({ length: 9 }, (_, index) => card({ name: `Invitado ${index}` })),
    });
    assert.equal((html.match(/class="sheet"/g) ?? []).length, 2);
    assert.ok(html.includes("@page"));
    assert.ok(html.includes("Hoja 2 de 2"));
    assert.ok(html.includes("Invitado 8"));
  });

  it("con lista vacía produce un aviso y nada de códigos", () => {
    const html = printSheetHtml({ title: "Boda", subtitle: "", cards: [] });
    assert.ok(html.includes("No hay pases para imprimir"));
    assert.equal(html.includes("class=\"card\""), false);
  });
});
