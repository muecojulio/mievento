import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarPlus, Mail, MessageCircle, Share2 } from "lucide-react";
import { Btn } from "@/components/mievento/ui";
import { peopleLabel, sidePhrase, waDigits } from "@/lib/mievento/format";
import {
  downloadBlob,
  icsFor,
  inviteText,
  passFromGuest,
  passLink,
  qrDataUrl,
  renderPassPng,
  type PassView,
} from "@/lib/mievento/pass";
import { useEvent, useGuests } from "@/lib/mievento/store";
import type { Guest, WeddingEvent } from "@/lib/mievento/types";

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

  if (!event) return null;
  const current = event;
  const ordered = [...guests].sort((a, b) => a.name.localeCompare(b.name, "es"));

  function sendNext() {
    if (ordered.length === 0) return;
    const guest = ordered[cursor % ordered.length];
    setCursor((value) => value + 1);
    void deliver(current, guest, "whatsapp").then((message) => setNote(message));
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="font-display text-4xl">Pases</h1>
      <p className="mt-2 max-w-xl text-sm text-stone">
        Cada código va firmado en esta tablet. Al enviarlo se abre WhatsApp o el correo con el mensaje listo y el enlace del pase. Nada sale hasta que tú confirmas el envío.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Btn onClick={sendNext} disabled={ordered.length === 0}>
          Enviar el siguiente
        </Btn>
        <p className="text-sm text-stone">{note}</p>
      </div>
      {ordered.length === 0 ? (
        <p className="mt-8 text-sm text-stone">Primero carga la lista de invitados.</p>
      ) : (
        <ul className="mt-6 grid gap-4">
          {ordered.map((guest) => (
            <PassRow key={guest.id} event={event} guest={guest} onNote={setNote} />
          ))}
        </ul>
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
  const [qr, setQr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    void qrDataUrl(guest.token, 360).then((url) => {
      if (alive) setQr(url);
    });
    return () => {
      alive = false;
    };
  }, [guest.token]);

  return (
    <li className="rounded-3xl border border-line p-4">
      <div className="flex gap-4">
        <div className="size-24 shrink-0 overflow-hidden rounded-2xl bg-paper-2">
          {qr ? <img src={qr} alt="" className="h-full w-full" /> : null}
        </div>
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
