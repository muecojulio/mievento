import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanLine } from "lucide-react";
import { EventForm } from "@/components/mievento/event-form";
import { Btn, Monogram, OnlineNote, usePhotoUrl } from "@/components/mievento/ui";
import { downloadBlob } from "@/lib/mievento/pass";
import { coupleNames, entryLabel, formatClock, formatLongDate, peopleLabel, sideLabel, slugFile, tally } from "@/lib/mievento/format";
import { closingCsv } from "@/lib/mievento/excel";
import { exportBackup, finishEvent, recycleCodes, removeEvent, reopenEvent, updateEvent, useEvent, useGuests } from "@/lib/mievento/store";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/evento/$eventId/")({
  component: Dashboard,
});

function Dashboard() {
  const { eventId } = Route.useParams();
  const event = useEvent(eventId);
  const guests = useGuests(eventId);
  const photo = usePhotoUrl(event?.photo);
  const counts = useMemo(() => tally(guests), [guests]);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmRecycle, setConfirmRecycle] = useState(false);
  const [notice, setNotice] = useState("");
  const navigate = useNavigate();
  if (!event) return null;

  const recent = guests
    .filter((guest) => guest.status === "Ingresado" && guest.scannedAt)
    .sort((a, b) => (b.scannedAt ?? 0) - (a.scannedAt ?? 0))
    .slice(0, 6);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8">
      <OnlineNote />
      <header className="mt-4 overflow-hidden rounded-3xl border border-line">
        <div className="aspect-[16/7]">
          {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : <Monogram groom={event.groom} bride={event.bride} />}
        </div>
        <div className="px-5 py-5">
          <p className="text-sm font-medium text-brass">Acceso del evento</p>
          <h1 className="mt-1 font-display text-4xl sm:text-5xl">{coupleNames(event)}</h1>
          <p className="mt-2 text-sm text-stone">
            {formatLongDate(event.date)}
            {event.time ? ` · ${event.time}` : ""}
            {event.place ? ` · ${event.place}` : ""}
          </p>
          {event.demo ? (
            <p className="mt-3 text-sm text-ink-soft">Ejemplo para probar el lector. Puedes borrarlo cuando crees el evento real.</p>
          ) : null}
        </div>
      </header>

      <section className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Novio" value={counts.novioIn} hint={`de ${counts.novioInvites}`} people={peopleLabel(counts.novioPeople)} />
        <Stat label="Novia" value={counts.noviaIn} hint={`de ${counts.noviaInvites}`} people={peopleLabel(counts.noviaPeople)} />
        <Stat label="Total" value={counts.totalIn} hint={`de ${counts.totalInvites}`} people={peopleLabel(counts.totalPeople)} />
      </section>
      <p className="mt-3 text-sm tabular-nums text-stone">
        Pendientes: {counts.pendingInvites} invitaciones · {peopleLabel(counts.pendingPeople)} todavía fuera. En lista, {peopleLabel(counts.expectedPeople)}.
      </p>
      <div className="mt-3">
        <Btn
          variant="ghost"
          onClick={() => downloadBlob(closingCsv(event, guests), `cierre-${slugFile(event)}.csv`)}
        >
          Descargar cierre
        </Btn>
        <p className="mt-2 text-sm text-stone">Archivo para Excel: quién entró, a qué hora, de qué lado y quién no llegó.</p>
      </div>

      {event.closed ? (
        <section className="mt-4 rounded-3xl border border-line px-5 py-5">
          <h2 className="font-display text-3xl">Evento terminado</h2>
          <p className="mt-2 max-w-xl text-sm text-stone">
            El lector no deja pasar. Si reciclas los códigos, las mismas imágenes vuelven a servir y quien ya entró queda otra vez en pendiente. La firma no cambia.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn onClick={() => setConfirmRecycle(true)}>Reciclar códigos</Btn>
            <Btn variant="ghost" onClick={() => void reopenEvent(event.id).then(() => setNotice("El evento sigue abierto. Los ingresos se conservan."))}>
              Seguir el evento
            </Btn>
          </div>
        </section>
      ) : (
        <Link
          to="/evento/$eventId/escaner"
          params={{ eventId }}
          className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-brass text-base font-medium text-paper transition-transform duration-150 active:scale-[0.96]"
        >
          <ScanLine className="size-5" />
          Escanear código
        </Link>
      )}
      {notice ? <p className="mt-3 text-sm text-ink-soft">{notice}</p> : null}

      <section className="mt-8">
        <h2 className="font-display text-2xl">Últimos ingresos</h2>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-stone">Cuando un pase sea válido, aparecerá aquí con su lado y su hora.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-3xl border border-line">
            {recent.map((guest) => (
              <li key={guest.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">{guest.name}</p>
                  <p className="text-sm text-stone">
                    {sideLabel(guest.side)} · {guest.arrived != null && guest.arrived !== guest.party ? `${guest.arrived} de ${peopleLabel(guest.party)}` : peopleLabel(guest.arrived ?? guest.party)}
                    {guest.entry && guest.entry !== "pase" ? ` · ${entryLabel(guest.entry)}` : ""}
                    {guest.note ? ` · ${guest.note}` : ""}
                  </p>
                </div>
                <p className="text-sm tabular-nums text-ink-soft">{guest.scannedAt ? formatClock(guest.scannedAt) : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-3xl border border-line p-4">
        <h2 className="font-display text-2xl">En esta tablet</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn variant="ghost" onClick={() => setEditing(true)}>
            Editar evento
          </Btn>
          <Btn
            variant="ghost"
            onClick={async () => {
              const json = await exportBackup(event.id);
              downloadBlob(new Blob([json], { type: "application/json" }), `mievento-${slugFile(event)}.json`);
            }}
          >
            Descargar copia
          </Btn>
          <Btn variant="quiet" onClick={() => setConfirmDelete(true)}>
            Eliminar evento
          </Btn>
          {event.closed ? null : (
            <Btn variant="quiet" onClick={() => setConfirmFinish(true)}>
              Terminar evento
            </Btn>
          )}
        </div>
        <p className="mt-3 text-sm text-stone">
          La copia incluye la llave de los códigos. No la compartas: con ella se podrían fabricar pases.
        </p>
      </section>

      {editing ? (
        <EventForm
          initial={event}
          title="Editar evento"
          submitLabel="Guardar cambios"
          onClose={() => setEditing(false)}
          onSubmit={async (draft) => {
            await updateEvent(event.id, draft);
            setEditing(false);
          }}
        />
      ) : null}

      {confirmFinish ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-3 sm:items-center" onClick={() => setConfirmFinish(false)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl bg-paper p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-3xl">¿Terminar este evento?</h2>
            <p className="mt-2 text-sm text-stone">
              El lector deja de aceptar pases. La lista y los códigos se quedan. Después puedes reciclarlos para que las mismas imágenes vuelvan a servir.
            </p>
            <div className="mt-5 flex gap-2">
              <Btn
                variant="ink"
                onClick={async () => {
                  await finishEvent(event.id);
                  setConfirmFinish(false);
                  setNotice("Evento terminado. El lector no deja pasar.");
                }}
              >
                Terminar
              </Btn>
              <Btn variant="ghost" onClick={() => setConfirmFinish(false)}>
                Cancelar
              </Btn>
            </div>
          </div>
        </div>
      ) : null}

      {confirmRecycle ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-3 sm:items-center" onClick={() => setConfirmRecycle(false)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl bg-paper p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-3xl">Reciclar códigos</h2>
            <p className="mt-2 text-sm text-stone">
              Las imágenes que ya enviaste vuelven a servir. Quien entró, también en la puerta, queda otra vez en pendiente. Si necesitas el registro de esta noche, descárgalo ahora.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Btn
                onClick={async () => {
                  downloadBlob(closingCsv(event, guests), `cierre-${slugFile(event)}.csv`);
                  const used = await recycleCodes(event.id);
                  setConfirmRecycle(false);
                  setNotice(recycleNotice(used));
                }}
              >
                Descargar cierre y reciclar
              </Btn>
              <Btn
                variant="ghost"
                onClick={async () => {
                  const used = await recycleCodes(event.id);
                  setConfirmRecycle(false);
                  setNotice(recycleNotice(used));
                }}
              >
                Reciclar
              </Btn>
              <Btn variant="quiet" onClick={() => setConfirmRecycle(false)}>
                Cancelar
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-3 sm:items-center" onClick={() => setConfirmDelete(false)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl bg-paper p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-3xl">¿Eliminar este evento?</h2>
            <p className="mt-2 text-sm text-stone">Se borran la lista, la foto y los códigos de esta tablet. Los pases ya enviados dejarán de servir.</p>
            <div className="mt-5 flex gap-2">
              <Btn
                variant="ink"
                onClick={async () => {
                  await removeEvent(event.id);
                  await navigate({ to: "/" });
                }}
              >
                Eliminar
              </Btn>
              <Btn variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function recycleNotice(used: number): string {
  if (used === 1) return "1 código vuelve a servir.";
  if (used > 1) return `${used} códigos vuelven a servir.`;
  return "Los códigos vuelven a servir.";
}

function Stat({ label, value, hint, people }: { label: string; value: number; hint: string; people: string }) {
  return (
    <article className="rounded-3xl border border-line px-3 py-4 sm:px-4">
      <p className="text-xs font-medium text-stone sm:text-sm">{label}</p>
      <p className="mt-1 font-display text-4xl tabular-nums sm:text-5xl">{value}</p>
      <p className="mt-1 text-xs text-ink-soft sm:text-sm">{hint}</p>
      <p className="text-xs text-brass sm:text-sm">{people}</p>
    </article>
  );
}
