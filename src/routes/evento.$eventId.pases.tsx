import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarPlus, Mail, MessageCircle, Share2 } from "lucide-react";
import { Btn, fieldClass } from "@/components/mievento/ui";
import { foldText, peopleLabel, sidePhrase, slugFile, waDigits } from "@/lib/mievento/format";
import {
  downloadBlob,
  icsFor,
  inviteText,
  motifForToken,
  passFromGuest,
  passLink,
  qrCodesZip,
  qrDataUrl,
  renderPassPng,
  type PassView,
} from "@/lib/mievento/pass";
import { useEvent, useGuests } from "@/lib/mievento/store";
import type { Guest, WeddingEvent } from "@/lib/mievento/types";

const PAGE = 40;

export const Route = createFileRoute("/evento/$eventId/pases")({
  head: () => ({ meta: [{ title: "Pases · Mi Evento" }] }),
  component: PassesPage,
});

function PassesPage() {
  const { eventId } = Route.useParams();
  const event = useEvent(eventId);
  const guests = useGuests(eventId);
  const [cursor, setCursor] = useState(0);
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [packing, setPacking] = useState<{ done: number; total: number } | null>(null);

  const ordered = useMemo(() => {
    const q = foldText(query.trim());
    return [...guests]
      .filter((guest) => !q || foldText(guest.name).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [guests, query]);

  if (!event) return null;
  const current = event;
  const visible = ordered.slice(0, shown);

  function sendNext() {
    if (ordered.length === 0) return;
    const guest = ordered[cursor % ordered.length];
    setCursor((value) => value + 1);
    void deliver(current, guest, "whatsapp").then((message) => setNote(message));
  }

  async function downloadAll() {
    if (guests.length === 0 || packing) return;
    const list = [...guests].sort((a, b) => a.name.localeCompare(b.name, "es"));
    setPacking({ done: 0, total: list.length });
    setNote("");
    try {
      const blob = await qrCodesZip(list, (done, total) => setPacking({ done, total }));
      downloadBlob(blob, `codigos-${slugFile(current)}.zip`);
      setNote(`${list.length} códigos listos en el archivo.`);
    } catch {
      setNote("No se pudieron generar los códigos. Inténtalo de nuevo.");
    } finally {
      setPacking(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="font-display text-4xl">Pases</h1>
      <p className="mt-2 max-w-xl text-sm text-stone">
        Cada código lleva una figura al azar: hoja, naranja, pájaro o flor. Siempre la misma para ese pase. La puerta lo lee igual. Puedes generar hasta 2000 de una vez.
        {event.closed ? " El evento está terminado: en el tablero puedes reciclar estos códigos para que las mismas imágenes vuelvan a servir." : ""}
      </p>
      <p className="mt-3 text-sm tabular-nums text-ink-soft">{guests.length} códigos en este evento</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Btn onClick={sendNext} disabled={ordered.length === 0 || packing !== null}>
          Enviar el siguiente
        </Btn>
        <Btn variant="ghost" onClick={() => void downloadAll()} disabled={guests.length === 0 || packing !== null}>
          {packing ? `Generando ${packing.done} de ${packing.total}` : "Descargar todos los códigos"}
        </Btn>
        <p className="text-sm text-stone">{note}</p>
      </div>
      {guests.length > 0 ? (
        <input
          className={`${fieldClass} mt-5`}
          value={query}
          onChange={(input) => {
            setQuery(input.target.value);
            setShown(PAGE);
            setCursor(0);
          }}
          placeholder="Buscar invitado"
          aria-label="Buscar invitado"
        />
      ) : null}
      {ordered.length === 0 ? (
        <p className="mt-8 text-sm text-stone">{guests.length === 0 ? "Primero carga la lista de invitados." : "Nadie coincide con esa búsqueda."}</p>
      ) : (
        <>
          <ul className="mt-4 grid gap-4">
            {visible.map((guest) => (
              <PassRow key={guest.id} event={event} guest={guest} onNote={setNote} />
            ))}
          </ul>
          {shown < ordered.length ? (
            <Btn variant="ghost" className="mt-4" onClick={() => setShown((value) => value + PAGE)}>
              Ver más ({ordered.length - shown} restantes)
            </Btn>
          ) : null}
        </>
      )}
    </main>
  );
}

function PassRow({
  event,
  guest,
  onNote,
}: {
  event: WeddingEvent;
  guest: Guest;
  onNote: (note: string) => void;
}) {
  const pass = passFromGuest(event, guest);
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-3xl border border-line p-4">
      <div className="flex gap-4">
        <QrThumb token={guest.token} />
        <div className="min-w-0">
          <p className="font-display text-2xl">{guest.name}</p>
          <p className="text-sm text-stone">
            {sidePhrase(guest.side)} · {peopleLabel(guest.party)} · {guest.status}
          </p>
          <p className="mt-1 truncate text-sm text-ink-soft">{guest.phone || guest.email || "Sin teléfono ni correo"}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Btn variant="ghost" onClick={() => void deliver(event, guest, "whatsapp").then(onNote)}>
          <MessageCircle className="size-4" />
          WhatsApp
        </Btn>
        <Btn variant="ghost" onClick={() => void deliver(event, guest, "mail").then(onNote)} disabled={!guest.email}>
          <Mail className="size-4" />
          Correo
        </Btn>
        <Btn variant="ghost" onClick={() => void deliver(event, guest, "share").then(onNote)}>
          <Share2 className="size-4" />
          Compartir
        </Btn>
        <Btn
          variant="quiet"
          onClick={async () => {
            downloadBlob(await renderPassPng(pass), `pase-${guest.name}.png`);
            onNote(`Pase de ${guest.name} guardado.`);
          }}
        >
          Guardar imagen
        </Btn>
        <Btn
          variant="quiet"
          onClick={() => {
            downloadBlob(new Blob([icsFor(pass)], { type: "text/calendar" }), "mi-evento.ics");
          }}
        >
          <CalendarPlus className="size-4" />
          Calendario
        </Btn>
        <button type="button" className="min-h-11 px-3 text-sm text-brass" onClick={() => setOpen((value) => !value)}>
          {open ? "Ocultar código" : "Ver código"}
        </button>
      </div>
      {open ? (
        <p data-testid="guest-token" className="mt-2 break-all rounded-2xl bg-paper-2 px-3 py-2 text-xs text-ink-soft">
          {guest.token}
        </p>
      ) : null}
    </li>
  );
}

function QrThumb({ token }: { token: string }) {
  const motif = motifForToken(token);
  const ref = useRef<HTMLDivElement>(null);
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let alive = true;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void qrDataUrl(token, 280, motif).then((url) => {
        if (alive) setQr(url);
      });
    });
    observer.observe(node);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [token, motif]);
  return (
    <div ref={ref} className="size-24 shrink-0 overflow-hidden rounded-2xl bg-paper-2">
      {qr ? <img src={qr} alt="" className="h-full w-full" /> : null}
    </div>
  );
}

async function deliver(event: WeddingEvent, guest: Guest, channel: "whatsapp" | "mail" | "share"): Promise<string> {
  const pass: PassView = passFromGuest(event, guest);
  const text = inviteText(pass);
  if (channel === "mail") {
    if (!guest.email) return "Este invitado no tiene correo.";
    const href = `mailto:${encodeURIComponent(guest.email)}?subject=${encodeURIComponent(`Pase de ${event.groom} y ${event.bride}`)}&body=${encodeURIComponent(text)}`;
    window.location.href = href;
    return `Correo listo para ${guest.name}.`;
  }
  if (channel === "whatsapp") {
    const digits = waDigits(guest.phone);
    const href = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(href, "_blank", "noopener,noreferrer");
    return digits ? `WhatsApp listo para ${guest.name}.` : `Elige el contacto de ${guest.name} en WhatsApp.`;
  }
  try {
    const blob = await renderPassPng(pass);
    const file = new File([blob], "pase.png", { type: "image/png" });
    if (navigator.share) {
      const payload = navigator.canShare?.({ files: [file] })
        ? { title: "Pase", text, files: [file] }
        : { title: "Pase", text, url: passLink(pass) };
      await navigator.share(payload);
      return `Pase de ${guest.name} compartido.`;
    }
    await navigator.clipboard.writeText(text);
    return "Enlace copiado.";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "Envío cancelado.";
    return "No se pudo compartir. Usa WhatsApp o correo.";
  }
}
