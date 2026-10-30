import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Btn, fieldClass } from "@/components/mievento/ui";
import { downloadBlob } from "@/lib/mievento/pass";
import { parseGuestFile, templateCsv } from "@/lib/mievento/excel";
import { peopleLabel, sideLabel } from "@/lib/mievento/format";
import { addGuests, clearGuests, removeGuest, saveGuest, useEvent, useGuests } from "@/lib/mievento/store";
import type { Guest, Side } from "@/lib/mievento/types";

export const Route = createFileRoute("/evento/$eventId/invitados")({
  head: () => ({ meta: [{ title: "Invitados · Mi Evento" }] }),
  component: GuestsPage,
});

type Filter = "todos" | "novio" | "novia" | "Pendiente" | "Ingresado";

function GuestsPage() {
  const { eventId } = Route.useParams();
  const event = useEvent(eventId);
  const guests = useGuests(eventId);
  const [filter, setFilter] = useState<Filter>("todos");
  const [query, setQuery] = useState("");
  const [report, setReport] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return guests.filter((guest) => {
      if (filter === "novio" || filter === "novia") {
        if (guest.side !== filter) return false;
      } else if (filter !== "todos" && guest.status !== filter) return false;
      if (!q) return true;
      return `${guest.name} ${guest.email} ${guest.phone} ${guest.note}`.toLowerCase().includes(q);
    });
  }, [guests, filter, query]);

  if (!event) return null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="font-display text-4xl">Invitados</h1>
      <p className="mt-2 text-sm text-stone">
        Sube un Excel o CSV. Pueden ir en una sola hoja con la columna “lado”, o en dos hojas llamadas Novio y Novia.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-brass px-5 text-sm font-medium text-paper">
          {busy ? "Leyendo…" : "Subir Excel"}
          <input
            type="file"
            accept=".xlsx,.xls,.csv,text/csv"
            className="sr-only"
            disabled={busy}
            onChange={async (input) => {
              const file = input.target.files?.[0];
              input.target.value = "";
              if (!file) return;
              setBusy(true);
              setReport("");
              try {
                const parsed = await parseGuestFile(file);
                if (parsed.drafts.length === 0) {
                  setReport("No encontré nombres. Revisa que la primera fila tenga la columna nombre.");
                  return;
                }
                const result = await addGuests(eventId, parsed.drafts);
                setReport(
                  `Se agregaron ${result.added} invitados.${result.skipped || parsed.skipped ? ` Se omitieron ${result.skipped + parsed.skipped} filas.` : ""}`,
                );
              } catch {
                setReport("No se pudo leer ese archivo. Prueba con .xlsx o .csv.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        <Btn
          variant="ghost"
          onClick={() => downloadBlob(templateCsv(), "plantilla-invitados.csv")}
        >
          Descargar plantilla
        </Btn>
        <Btn variant="quiet" onClick={() => setConfirmClear(true)} disabled={guests.length === 0}>
          Vaciar lista
        </Btn>
      </div>
      {report ? <p className="mt-3 text-sm text-ink-soft">{report}</p> : null}

      <input
        className={`${fieldClass} mt-4`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar invitado"
        aria-label="Buscar invitado"
      />
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ["todos", "Todos"],
            ["novio", "Novio"],
            ["novia", "Novia"],
            ["Pendiente", "Pendientes"],
            ["Ingresado", "Ingresados"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium transition-colors duration-150 ${
              filter === id ? "bg-ink text-paper" : "border border-line text-ink-soft"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {guests.length === 0 ? (
        <p className="mt-8 text-sm text-stone">La lista está vacía. Sube el Excel para crear los códigos.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-3xl border border-line">
          {visible.map((guest) => (
            <GuestRow key={guest.id} guest={guest} />
          ))}
        </ul>
      )}
      {guests.length > 0 && visible.length === 0 ? (
        <p className="mt-4 text-sm text-stone">Nadie coincide con esa búsqueda.</p>
      ) : null}

      {confirmClear ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-3 sm:items-center" onClick={() => setConfirmClear(false)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl bg-paper p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-3xl">¿Vaciar la lista?</h2>
            <p className="mt-2 text-sm text-stone">
              Si ya enviaste pases, esos códigos dejarán de servir. El evento y su foto se conservan.
            </p>
            <div className="mt-5 flex gap-2">
              <Btn
                variant="ink"
                onClick={async () => {
                  await clearGuests(eventId);
                  setConfirmClear(false);
                  setReport("Lista vacía.");
                }}
              >
                Vaciar
              </Btn>
              <Btn variant="ghost" onClick={() => setConfirmClear(false)}>
                Cancelar
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function GuestRow({ guest }: { guest: Guest }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(guest.name);
  const [email, setEmail] = useState(guest.email);
  const [phone, setPhone] = useState(guest.phone);
  const [party, setParty] = useState(String(guest.party));
  const [note, setNote] = useState(guest.note);

  async function changeSide(side: Side) {
    await saveGuest({ ...guest, side });
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{guest.name}</p>
          <p className="text-sm text-stone">
            {sideLabel(guest.side)} · {peopleLabel(guest.party)} · {guest.status}
            {guest.note ? ` · ${guest.note}` : ""}
          </p>
        </div>
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${guest.status === "Ingresado" ? "bg-sage" : "bg-line"}`} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="min-h-11 rounded-full border border-line px-3 text-sm" onClick={() => void changeSide(guest.side === "novio" ? "novia" : "novio")}>
          Pasar a {guest.side === "novio" ? "novia" : "novio"}
        </button>
        <button type="button" className="min-h-11 px-3 text-sm font-medium text-brass" onClick={() => setOpen((value) => !value)}>
          {open ? "Cerrar" : "Editar"}
        </button>
      </div>
      {open ? (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-2"
          onSubmit={async (formEvent) => {
            formEvent.preventDefault();
            const count = Math.min(20, Math.max(1, Math.round(Number(party) || 1)));
            await saveGuest({ ...guest, name: name.trim() || guest.name, email: email.trim(), phone: phone.trim(), party: count, note: note.trim() });
            setOpen(false);
          }}
        >
          <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre" />
          <input className={fieldClass} value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Teléfono" placeholder="Teléfono" />
          <input className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Correo" placeholder="Correo" />
          <input className={fieldClass} value={party} onChange={(e) => setParty(e.target.value)} aria-label="Personas" inputMode="numeric" />
          <input className={fieldClass} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Mesa" placeholder="Mesa" />
          <div className="flex gap-2">
            <Btn type="submit">Guardar</Btn>
            <Btn variant="quiet" onClick={() => void removeGuest(guest.id)}>
              Quitar
            </Btn>
          </div>
        </form>
      ) : null}
    </li>
  );
}
