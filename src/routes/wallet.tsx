import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarPlus, Download, Trash2 } from "lucide-react";
import { Mark, OnlineNote } from "@/components/mievento/ui";
import { DirectionsLinks, PassWeatherLine } from "@/components/mievento/place-extras";
import { formatLongDate, peopleLabel, sidePhrase } from "@/lib/mievento/format";
import { googleCalendarUrl } from "@/lib/mievento/public-apis";
import { downloadBlob, icsFor, qrDataUrl } from "@/lib/mievento/pass";
import {
  removeFromWallet,
  renderWalletCardPng,
  sortWallet,
  useWallet,
  type WalletPass,
} from "@/lib/mievento/wallet";

export const Route = createFileRoute("/wallet")({
  head: () => ({ meta: [{ title: "Wallet · Mi Evento" }] }),
  component: WalletPage,
});

function WalletPage() {
  const passes = sortWallet(useWallet());

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-6 sm:px-8">
      <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brass">
        <ArrowLeft className="size-4" />
        Inicio
      </Link>
      <header className="mt-2 flex items-center gap-3">
        <Mark className="h-8 w-12 text-brass" />
        <div>
          <h1 className="font-display text-4xl">Wallet</h1>
          <p className="text-sm text-stone">Tus pases guardados, con fecha y nombres. Abren sin internet.</p>
        </div>
      </header>

      <div className="mt-4">
        <OnlineNote />
      </div>

      {passes.length === 0 ? (
        <section className="mt-8 rounded-3xl border border-line px-6 py-12 text-center">
          <h2 className="font-display text-3xl">Todavía no hay pases</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm text-stone">
            Abre el enlace que te llegó por WhatsApp o correo y pulsa Guardar en Wallet. El pase queda
            aquí con el código, la fecha y los nombres de los novios.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex min-h-11 items-center rounded-full bg-brass px-5 text-sm font-medium text-paper"
          >
            Volver al inicio
          </Link>
        </section>
      ) : (
        <>
          <p className="mt-5 text-sm tabular-nums text-ink-soft">
            {passes.length === 1 ? "1 pase guardado" : `${passes.length} pases guardados`}
          </p>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2" data-testid="wallet-list">
            {passes.map((pass) => (
              <WalletCard key={pass.token} pass={pass} />
            ))}
          </ul>
        </>
      )}

      <p className="mt-8 text-sm text-stone">
        El pase se guarda en esta tablet o teléfono y no se manda a ningún servidor. Si borras los datos del
        navegador, se borra también.
      </p>
    </main>
  );
}

function WalletCard({ pass }: { pass: WalletPass }) {
  const [qr, setQr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void qrDataUrl(pass.token, 520, pass.motif)
      .then((url) => {
        if (alive) setQr(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pass.token, pass.motif]);

  const when = [formatLongDate(pass.date), pass.time].filter(Boolean).join(" · ");
  const googleCalendar = googleCalendarUrl({
    title: pass.groom && pass.bride ? `Boda de ${pass.groom} y ${pass.bride}` : "Mi Evento",
    details: `Pase de ${pass.name}. ${sidePhrase(pass.side)}. Muestra tu código en la entrada.`,
    location: pass.place,
    date: pass.date,
    time: pass.time,
    timezone: pass.tz || undefined,
  });

  async function saveImage() {
    setBusy(true);
    setNote("");
    try {
      const blob = await renderWalletCardPng(pass);
      downloadBlob(blob, "wallet-mi-evento.png");
      setNote("Imagen del pase guardada.");
    } catch {
      setNote("No se pudo generar la imagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      data-testid="wallet-card"
      className="rise overflow-hidden rounded-3xl border border-line bg-ink text-paper"
    >
      <div className="h-1.5 bg-brass" />
      <div className="px-4 py-4">
        <p className="text-xs font-medium tracking-wide text-paper-2">MI EVENTO · WALLET</p>
        <h2 className="mt-2 font-display text-2xl leading-tight">
          {pass.groom && pass.bride ? `${pass.groom} y ${pass.bride}` : "Celebración"}
        </h2>
        <p className="mt-1 text-sm text-paper-2">{when}</p>
        {pass.place ? <p className="text-sm text-paper-2">{pass.place}</p> : null}
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-xl">{pass.name}</p>
            <p className="text-sm text-paper-2">
              {sidePhrase(pass.side)} · {peopleLabel(pass.party)}
            </p>
          </div>
          <div className="size-28 shrink-0 overflow-hidden rounded-2xl bg-paper p-1.5">
            {qr ? (
              <img src={qr} alt={`Código de ${pass.name}`} className="h-full w-full" />
            ) : (
              <div className="h-full w-full animate-pulse rounded-xl bg-paper-2" />
            )}
          </div>
        </div>
        <div className="mt-3 grid gap-3">
          <PassWeatherLine pass={pass} dark />
          <DirectionsLinks place={pass} dark />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-paper/40 px-4 text-sm font-medium text-paper"
            onClick={() => void saveImage()}
            disabled={busy}
          >
            <Download className="size-4" />
            Imagen
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-paper/40 px-4 text-sm font-medium text-paper"
            onClick={() => {
              downloadBlob(new Blob([icsFor(pass)], { type: "text/calendar" }), "mi-evento.ics");
              setNote("Calendario listo.");
            }}
          >
            <CalendarPlus className="size-4" />
            Calendario
          </button>
          {googleCalendar ? (
            <a
              href={googleCalendar}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-paper/40 px-4 text-sm font-medium text-paper"
            >
              <CalendarPlus className="size-4" />
              Google Calendar
            </a>
          ) : null}
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium text-paper-2"
            onClick={() => removeFromWallet(pass.token)}
          >
            <Trash2 className="size-4" />
            Quitar
          </button>
        </div>
        {note ? <p className="mt-2 text-sm text-paper-2">{note}</p> : null}
      </div>
    </li>
  );
}
