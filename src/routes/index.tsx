import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { EventForm } from "@/components/mievento/event-form";
import { Btn, Mark, Monogram, OnlineNote, usePhotoUrl } from "@/components/mievento/ui";
import { coupleNames, formatLongDate, tally } from "@/lib/mievento/format";
import { qrDataUrl } from "@/lib/mievento/pass";
import { createEvent, importBackup, useBootError, useEvents, useGuests, useReady } from "@/lib/mievento/store";
import type { WeddingEvent } from "@/lib/mievento/types";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const ready = useReady();
  const error = useBootError();
  const events = useEvents();
  const [open, setOpen] = useState(false);
  const [installQr, setInstallQr] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    if (window.location.protocol !== "https:") return;
    void qrDataUrl(window.location.origin, 480).then(setInstallQr).catch(() => {});
  }, [ready]);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="rise flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 text-ink">
            <Mark className="h-8 w-12 text-brass" />
            <p className="font-display text-3xl sm:text-4xl">Mi Evento</p>
          </div>
          <p className="mt-2 max-w-md text-base text-stone">
            Lector de acceso para la tablet. Un pase, un ingreso.
          </p>
        </div>
        <Btn onClick={() => setOpen(true)} className="shrink-0">
          <Plus className="size-4" />
          Nuevo evento
        </Btn>
      </header>

      <div className="mt-6">
        <OnlineNote />
      </div>

      {error ? <p className="mt-4 text-sm text-alert">{error}</p> : null}

      {!ready ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="h-64 rounded-3xl border border-line bg-paper-2" />
          <div className="h-64 rounded-3xl border border-line bg-paper-2" />
        </div>
      ) : events.length === 0 ? (
        <section className="rise mt-10 rounded-3xl border border-line px-6 py-12 text-center">
          <h1 className="font-display text-4xl">Todavía no hay eventos</h1>
          <p className="mx-auto mt-3 max-w-sm text-stone">
            Crea el de los novios, sube la foto y después importa la lista en Excel.
          </p>
          <Btn className="mt-6" onClick={() => setOpen(true)}>
            Crear el primer evento
          </Btn>
        </section>
      ) : (
        <section className="stagger mt-8 grid gap-4 md:grid-cols-2">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </section>
      )}

      <section className="mt-10 grid gap-4 border-t border-line pt-8 md:grid-cols-[1.3fr_0.7fr]">
        <div>
          <h2 className="font-display text-2xl">Cómo se usa en la puerta</h2>
          <ol className="mt-4 grid gap-3 text-sm text-ink-soft">
            <li>1. Crea el evento, con fecha, hora y una foto.</li>
            <li>2. Sube el Excel del novio y de la novia.</li>
            <li>3. Envía cada pase por WhatsApp o correo. El invitado lo guarda en el teléfono.</li>
            <li>4. En la entrada pulsas Escanear. Si es válido, ves sus datos y queda como Ingresado.</li>
            <li>5. Si no trae el código, búscalo por nombre. Si no estaba en la lista, anótalo en la puerta.</li>
            <li>6. Si el pase dice cuatro y llegan dos, bajas el número. El total cuenta solo a quienes entraron.</li>
            <li>7. Si repiten el mismo código, aunque sea una captura, la tablet lo rechaza.</li>
            <li>8. Al terminar, cierra el evento. Si reciclas los códigos, las mismas imágenes vuelven a servir.</li>
          </ol>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <Link to="/privacidad" className="min-h-11 inline-flex items-center font-medium text-brass">
              Privacidad
            </Link>
            <a href="/?install=1&platform=ios" className="min-h-11 inline-flex items-center font-medium text-brass">
              Instalar en iPad o iPhone
            </a>
          </div>
        </div>
        <div className="rounded-3xl border border-line p-4">
          <p className="text-sm font-medium text-ink">Instalar como aplicación</p>
          <p className="mt-2 text-sm text-stone">
            En el navegador de la tablet: Compartir o el menú, y después Agregar a pantalla de inicio. Queda como app, no como una pestaña.
          </p>
          {installQr ? (
            <img src={installQr} alt="Código para abrir Mi Evento" className="mx-auto mt-4 w-40 rounded-2xl" />
          ) : (
            <p className="mt-4 text-sm text-stone">El código de instalación aparece cuando la app está publicada en una dirección segura.</p>
          )}
          <label className="mt-4 flex min-h-11 cursor-pointer items-center text-sm font-medium text-brass">
            Restaurar una copia
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const id = await importBackup(file);
                await navigate({ to: "/evento/$eventId", params: { eventId: id } });
              }}
            />
          </label>
        </div>
      </section>

      {open ? (
        <EventForm
          title="Nuevo evento"
          submitLabel="Crear evento"
          onClose={() => setOpen(false)}
          onSubmit={async (draft) => {
            const event = await createEvent(draft);
            await navigate({ to: "/evento/$eventId", params: { eventId: event.id } });
          }}
        />
      ) : null}
    </main>
  );
}

function EventCard({ event }: { event: WeddingEvent }) {
  const guests = useGuests(event.id);
  const photo = usePhotoUrl(event.photo);
  const counts = tally(guests);
  const pct = counts.totalInvites === 0 ? 0 : Math.round((counts.totalIn / counts.totalInvites) * 100);
  return (
    <Link
      to="/evento/$eventId"
      params={{ eventId: event.id }}
      className="rise block overflow-hidden rounded-3xl border border-line bg-paper transition-colors duration-150 hover:border-brass"
      data-testid="event-card"
    >
      <div className="aspect-[16/8]">
        {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : <Monogram groom={event.groom} bride={event.bride} />}
      </div>
      <div className="px-4 py-4">
        <h2 className="font-display text-3xl">{coupleNames(event)}</h2>
        <p className="mt-1 text-sm text-stone">
          {formatLongDate(event.date)}
          {event.time ? ` · ${event.time}` : ""}
        </p>
        <p className="mt-3 text-sm tabular-nums text-ink-soft">
          {counts.totalIn} de {counts.totalInvites} invitaciones · {counts.totalPeople} personas dentro
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper-2">
          <div className="h-full rounded-full bg-brass transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        {event.closed ? <p className="mt-3 text-xs font-medium text-brass">Terminado. Los códigos se pueden reciclar.</p> : null}
        {event.demo ? <p className="mt-3 text-xs font-medium text-brass">Ejemplo para probar el lector</p> : null}
      </div>
    </Link>
  );
}
