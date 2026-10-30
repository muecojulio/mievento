import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarPlus, Mail, MessageCircle, Share2, Wallet } from "lucide-react";
import { Btn, fieldClass } from "@/components/mievento/ui";
import {
  foldText,
  formatStamp,
  peopleLabel,
  sidePhrase,
  slugFile,
  waDigits,
} from "@/lib/mievento/format";
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
import { markGuestSent, useEvent, useGuests } from "@/lib/mievento/store";
import type { Guest, SendChannel, WeddingEvent } from "@/lib/mievento/types";

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
  const [autoChannel, setAutoChannel] = useState<"whatsapp" | "correo">("whatsapp");
  const [queue, setQueue] = useState<{ channel: "whatsapp" | "correo"; done: number; total: number } | null>(
    null,
  );
  const queueRef = useRef<{
    channel: "whatsapp" | "correo";
    ids: string[];
    index: number;
    timer: number | null;
  } | null>(null);

  useEffect(() => {
    return () => {
      const running = queueRef.current;
      if (running?.timer) window.clearTimeout(running.timer);
      queueRef.current = null;
    };
  }, []);

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
    void deliver(current, guest, "whatsapp").then(async (result) => {
      if (result.sent) await markGuestSent(guest.id, "whatsapp");
      setNote(result.message);
    });
  }

  function stopQueue() {
    const running = queueRef.current;
    if (running?.timer) window.clearTimeout(running.timer);
    queueRef.current = null;
    setQueue(null);
  }

  async function sendOne(guest: Guest, channel: "whatsapp" | "correo"): Promise<boolean> {
    const result = await deliver(current, guest, channel);
    if (result.sent) await markGuestSent(guest.id, channel);
    setNote(result.message);
    if (result.blocked) {
      stopQueue();
      setNote("El navegador bloqueó la ventana. Usa “Enviar el siguiente” y toca cada invitado.");
      return false;
    }
    return true;
  }

  function finishQueue() {
    queueRef.current = null;
    setQueue(null);
    setNote("Se enviaron todos los pases pendientes.");
  }

  function stepQueue() {
    const running = queueRef.current;
    if (!running) return;
    if (running.index >= running.ids.length) {
      finishQueue();
      return;
    }
    const id = running.ids[running.index];
    running.index += 1;
    setQueue({ channel: running.channel, done: running.index, total: running.ids.length });
    const guest = guests.find((item) => item.id === id);
    if (!guest) {
      running.timer = window.setTimeout(stepQueue, 80);
      return;
    }
    void sendOne(guest, running.channel)
      .then((keep) => {
        if (keep && queueRef.current === running) {
          running.timer = window.setTimeout(stepQueue, 1500);
        }
      })
      .catch(() => {
        if (queueRef.current === running) running.timer = window.setTimeout(stepQueue, 1500);
      });
  }

  function startQueue(channel: "whatsapp" | "correo") {
    const pending = [...guests]
      .filter(
        (guest) =>
          !guest.sentAt &&
          (channel === "whatsapp" ? Boolean(waDigits(guest.phone)) : Boolean(guest.email.trim())),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    if (pending.length === 0) {
      setNote(
        channel === "whatsapp"
          ? "No quedan invitados pendientes con teléfono."
          : "No quedan invitados pendientes con correo.",
      );
      return;
    }
    stopQueue();
    const running = {
      channel,
      ids: pending.map((guest) => guest.id),
      index: 1,
      timer: null as number | null,
    };
    queueRef.current = running;
    setQueue({ channel, done: 1, total: running.ids.length });
    void sendOne(pending[0], channel).then((keep) => {
      if (keep && queueRef.current === running) {
        running.timer = window.setTimeout(stepQueue, 1500);
      }
    });
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
      </div>
      <section className="mt-4 rounded-3xl border border-line p-4">
        <p className="text-sm font-medium text-ink">Enviar los pases automáticamente</p>
        <p className="mt-1 text-sm text-stone">
          La tablet abre un mensaje por invitado, en orden, y marca cada envío. Solo toma a quienes tienen
          teléfono o correo y todavía no reciben su pase.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["whatsapp", "WhatsApp"],
              ["correo", "Correo"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={autoChannel === id}
              onClick={() => setAutoChannel(id)}
              className={`min-h-11 rounded-full px-4 text-sm font-medium transition-colors duration-150 ${
                autoChannel === id ? "bg-ink text-paper" : "border border-line text-ink-soft"
              }`}
            >
              {label}
            </button>
          ))}
          {queue ? (
            <Btn variant="ink" onClick={stopQueue}>
              Detener · {queue.done} de {queue.total}
            </Btn>
          ) : (
            <Btn onClick={() => startQueue(autoChannel)} disabled={guests.length === 0 || packing !== null}>
              Enviar pendientes
            </Btn>
          )}
        </div>
        {note ? <p className="mt-3 text-sm text-ink-soft">{note}</p> : null}
      </section>
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
          <p className="mt-1 text-xs text-stone">
            {guest.sentAt
              ? `Enviado por ${channelLabel(guest.sentVia)} · ${formatStamp(guest.sentAt)}`
              : "Pase sin enviar"}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Btn
          variant="ghost"
          onClick={() =>
            void deliver(event, guest, "whatsapp").then(async (result) => {
              if (result.sent) await markGuestSent(guest.id, "whatsapp");
              onNote(result.message);
            })
          }
        >
          <MessageCircle className="size-4" />
          WhatsApp
        </Btn>
        <Btn
          variant="ghost"
          onClick={() =>
            void deliver(event, guest, "correo").then(async (result) => {
              if (result.sent) await markGuestSent(guest.id, "correo");
              onNote(result.message);
            })
          }
          disabled={!guest.email}
        >
          <Mail className="size-4" />
          Correo
        </Btn>
        <Btn
          variant="ghost"
          onClick={() =>
            void deliver(event, guest, "compartir").then(async (result) => {
              if (result.sent) await markGuestSent(guest.id, "compartir");
              onNote(result.message);
            })
          }
        >
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
        <a
          href={passLink(pass)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-brass"
        >
          Ver pase
        </a>
        <span className="inline-flex min-h-11 items-center gap-1 px-2 text-xs text-stone">
          <Wallet className="size-3.5" />
          Wallet en el enlace
        </span>
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

type DeliveryResult = { message: string; sent: boolean; blocked?: boolean };

function channelLabel(channel: SendChannel | null | undefined): string {
  if (channel === "correo") return "correo";
  if (channel === "compartir") return "compartir";
  return "WhatsApp";
}

async function deliver(
  event: WeddingEvent,
  guest: Guest,
  channel: SendChannel,
): Promise<DeliveryResult> {
  const pass: PassView = passFromGuest(event, guest);
  const text = inviteText(pass);
  if (channel === "correo") {
    if (!guest.email) return { message: "Este invitado no tiene correo.", sent: false };
    const subject = `Pase de ${event.groom} y ${event.bride}`;
    const href = `mailto:${encodeURIComponent(guest.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    window.location.href = href;
    return { message: `Correo listo para ${guest.name}.`, sent: true };
  }
  if (channel === "whatsapp") {
    const digits = waDigits(guest.phone);
    const href = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    let opened: Window | null = null;
    try {
      // `noopener` en las features hace que open() devuelva null aunque abra,
      // y aquí necesitamos saber si el navegador bloqueó la ventana.
      opened = window.open(href, "_blank");
      if (opened) opened.opener = null;
    } catch {
      opened = null;
    }
    if (!opened) {
      return {
        message: "El navegador bloqueó WhatsApp. Usa “Enviar el siguiente”.",
        sent: false,
        blocked: true,
      };
    }
    return {
      message: digits ? `WhatsApp listo para ${guest.name}.` : `Elige el contacto de ${guest.name} en WhatsApp.`,
      sent: true,
    };
  }
  try {
    const blob = await renderPassPng(pass);
    const file = new File([blob], "pase.png", { type: "image/png" });
    if (navigator.share) {
      const payload = navigator.canShare?.({ files: [file] })
        ? { title: "Pase", text, files: [file] }
        : { title: "Pase", text, url: passLink(pass) };
      await navigator.share(payload);
      return { message: `Pase de ${guest.name} compartido.`, sent: true };
    }
    await navigator.clipboard.writeText(text);
    return { message: "Enlace copiado.", sent: true };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { message: "Envío cancelado.", sent: false };
    }
    return { message: "No se pudo compartir. Usa WhatsApp o correo.", sent: false };
  }
}
