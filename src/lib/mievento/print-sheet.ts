/**
 * Hoja imprimible de pases: varias credenciales por hoja, sin servidor.
 *
 * El HTML es autónomo (CSS en línea y códigos QR como data URL), así que se
 * puede abrir e imprimir sin internet. Se genera en el dispositivo; no se
 * sube ningún nombre ni código a terceros.
 */

export type PrintCard = {
  name: string;
  side: string;
  party: number;
  token: string;
  /** Data URL PNG del QR, generada en el dispositivo con `qrDataUrl`. */
  qr: string;
};

export type PrintSheetOptions = {
  title: string;
  subtitle: string;
  cards: PrintCard[];
  perPage?: number;
};

export function chunkForPrint<T>(items: T[], perPage = 8): T[][] {
  const size = Math.max(1, Math.min(24, Math.floor(perPage)));
  const sheets: T[][] = [];
  for (let index = 0; index < items.length; index += size) sheets.push(items.slice(index, index + size));
  return sheets;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Solo aceptamos imágenes PNG generadas localmente, nunca URLs externas. */
function safeQr(qr: string): string {
  return /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qr) ? qr : "";
}

export function printSheetHtml(options: PrintSheetOptions): string {
  const sheets = chunkForPrint(options.cards, options.perPage ?? 8);
  const title = escapeHtml(options.title);
  const subtitle = escapeHtml(options.subtitle);
  const body = sheets
    .map(
      (cards, page) => `
      <section class="sheet">
        <header class="head">
          <p class="brand">MI EVENTO · PASES PARA IMPRIMIR</p>
          <h1>${title}</h1>
          <p>${subtitle} · Hoja ${page + 1} de ${sheets.length}</p>
        </header>
        <div class="grid">
          ${cards
            .map((card) => {
              const qr = safeQr(card.qr);
              const people = Math.max(1, Math.round(card.party));
              return `
            <article class="card">
              ${qr ? `<img class="qr" src="${qr}" alt="Código QR" />` : ""}
              <p class="name">${escapeHtml(card.name)}</p>
              <p class="meta">${escapeHtml(card.side)} · ${people} ${people === 1 ? "persona" : "personas"}</p>
              <p class="code">${escapeHtml(card.token)}</p>
            </article>`;
            })
            .join("")}
        </div>
      </section>`,
    )
    .join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" /><title>${title} · Pases</title>
<style>
  @page { size: letter portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1c1915; }
  .sheet { break-after: page; page-break-after: always; }
  .sheet:last-child { break-after: auto; page-break-after: auto; }
  .head { border-bottom: 1px solid #ddd4c6; padding-bottom: 4mm; margin-bottom: 6mm; }
  .brand { font-size: 9pt; letter-spacing: .12em; color: #8c5a32; margin: 0; }
  h1 { font-size: 20pt; margin: 2mm 0 1mm; }
  .head p:last-child { font-size: 10pt; color: #5c574f; margin: 0; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6mm; }
  .card { border: 1px solid #ddd4c6; border-radius: 6px; padding: 4mm; text-align: center; break-inside: avoid; }
  .qr { width: 42mm; height: 42mm; object-fit: contain; }
  .name { font-size: 12pt; font-weight: bold; margin: 2mm 0 1mm; }
  .meta { font-size: 9pt; color: #5c574f; margin: 0 0 1mm; }
  .code { font-family: monospace; font-size: 7pt; color: #3f382f; word-break: break-all; margin: 0; }
  .hint { margin-top: 10mm; font-size: 9pt; color: #5c574f; }
  @media screen { body { padding: 8mm; background: #f4efe6; } .sheet { background: #fff; padding: 8mm; margin-bottom: 8mm; } }
</style></head><body>
${body || '<p class="hint">No hay pases para imprimir.</p>'}
<p class="hint">Recorta cada tarjeta. Un pase, un ingreso. Guarda estas hojas: contienen códigos válidos.</p>
</body></html>`;
}

/**
 * Abre la hoja en una pestaña nueva (gesto del usuario) y dispara la impresión.
 * Si el navegador bloquea la ventana, descarga el HTML para imprimirlo a mano.
 */
export function openPrintSheet(html: string, onDownload: (body: Blob) => void): "impresa" | "descargada" {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  let opened: Window | null = null;
  try {
    opened = window.open(url, "_blank");
  } catch {
    opened = null;
  }
  if (!opened) {
    onDownload(blob);
    URL.revokeObjectURL(url);
    return "descargada";
  }
  const win = opened;
  win.addEventListener(
    "load",
    () => {
      window.setTimeout(() => {
        try {
          win.focus();
          win.print();
        } catch {
          /* el navegador decide cuándo mostrar el diálogo */
        }
      }, 400);
    },
    { once: true },
  );
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return "impresa";
}
