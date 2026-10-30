import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Btn, fieldClass } from "@/components/mievento/ui";
import { downloadBlob } from "@/lib/mievento/pass";
import { parseGuestFile, templateCsv, nameClashes, withoutRepeatedNames, type NameClash } from "@/lib/mievento/excel";
import { foldText, peopleLabel, sideLabel } from "@/lib/mievento/format";
import { addGuests, clearGuests, removeGuest, saveGuest, useEvent, useGuests } from "@/lib/mievento/store";
import type { DraftGuest, Guest, Side } from "@/lib/mievento/types";

export const Route = createFileRoute("/evento/$eventId/invitados")({
  head: () => ({ meta: [{ title: "Invitados · Mi Evento" }] }),
  component: GuestsPage,
});

type PendingFile = {
  drafts: DraftGuest[];
  skipped: number;
  clashes: NameClash[];
};

type Filter = "todos" | "novio" | "novia" | "Pendiente" | "Ingresado";

function clashLine(clash: NameClash): string {
  if (clash.already && clash.inFile > 1) return `${clash.name} · ${clash.inFile} veces, y ya está en la lista`;
  if (clash.already) return `${clash.name} · ya está en la lista`;
  return `${clash.name} · ${clash.inFile} veces en el archivo`;
}

function GuestsPage() {
  const { eventId } = Route.useParams();
  const event = useEvent(eventId);
  const guests = useGuests(eventId);
  const [filter, setFilter] = useState<Filter>("todos");
  const [query, setQuery] = useState("");
  const [report, setReport] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pending, setPending] = useState<PendingFile | null>(null);

  const visible = useMemo(() => {
    const q = foldText(query.trim());
    return guests.filter((guest) => {
      if (filter === "novio" || filter === "novia") {
        if (guest.side !== filter) return false;
      } else if (filter !== "todos" && guest.status !== filter) return false;
      if (!q) return true;
      return foldText(`${guest.name} ${guest.email} ${guest.phone} ${guest.note}`).includes(q);
    });
  }, [guests, filter, query]);

  if (!event) return null;

  async function commit(drafts: DraftGuest[], fileSkipped: number, omitted: number) {
    if (drafts.length === 0) {
      setReport(
        omitted
          ? "No se agregó nadie. Esos nombres ya estaban, o se repetían en el archivo."
          : "No encontré nombres. Revisa que la primera fila tenga la columna nombre.",
      );
      return;
    }
    const result = await addGuests(eventId, drafts);
    const rows = result.skipped + fileSkipped;
    const parts = [`Se agregaron ${result.added} invitados.`];
    if (omitted) parts.push(`Se omitieron ${omitted} nombres repetidos.`);
    if (rows) parts.push(`Se omitieron ${rows} filas.`);
    setReport(parts.join(" "));
  }

  async function startImport(file: File | undefined, forcedSide: Side | null) {
    if (!file) return;
    setBusy(true);
    setReport("");
    try {
      const parsed = await parseGuestFile(file);
      const drafts = forcedSide
        ? parsed.drafts.map((draft) => ({ ...draft, side: forcedSide }))
        : parsed.drafts;
      if (drafts.length === 0) {
        setReport("No encontré nombres. Revisa que la primera fila tenga la columna nombre.");
        return;
      }
      const clashes = nameClashes(
        drafts,
        guests.map((guest) => guest.name),
      );
      if (clashes.length > 0) {
        setPending({ drafts, skipped: parsed.skipped, clashes });
        setReport("");
        return;
      }
      await commit(drafts, parsed.skipped, 0);
    } catch {
      setReport("No se pudo leer ese archivo. Prueba con .xlsx o .csv.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="font-display text-4xl">Invitados</h1>
      <p className="mt-2 text-sm text-stone">
        Sube un Excel o CSV, en una hoja con la columna lado o en dos hojas llamadas Novio y Novia. Si un nombre se repite, te aviso antes de crear los códigos. La lista admite 2000.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {(
          [
            ["novio", "Excel del novio"],
            ["novia", "Excel de la novia"],
          ] as const
        ).map(([side, label]) => (
          <label
            key={side}
            className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-full bg-brass px-5 text-sm font-medium text-paper"
          >
            {busy ? "Leyendo…" : label}
            <input
              type="file"
              accept=".xlsx,.xls,.csv,text/csv"
              className="sr-only"
              disabled={busy}
              onChange={(input) => {
                const file = input.target.files?.[0];
                input.target.value = "";
                void startImport(file, side);
              }}
            />
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line px-5 text-sm font-medium text-ink">
          {busy ? "Leyendo…" : "Excel con los dos lados"}
          <input
            type="file"
            accept=".xlsx,.xls,.csv,text/csv"
            className="sr-only"
            disabled={busy}
            onChange={(input) => {
              const file = input.target.files?.[0];
              input.target.value = "";
              void startImport(file, null);
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
      {report ? (
        <div className="mt-3 text-sm text-ink-soft">
          <p>{report}</p>
          {guests.length > 0 ? (
            <Link to="/evento/$eventId/pases" params={{ eventId }} className="mt-2 inline-flex min-h-11 items-center font-medium text-brass">
              Enviar los pases por WhatsApp o correo
            </Link>
          ) : null}
        </div>
      ) : null}

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

      {pending ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-3 sm:items-center" onClick={() => setPending(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="clash-title" className="w-full max-w-md rounded-3xl bg-paper p-5" onClick={(e) => e.stopPropagation()}>
            <h2 id="clash-title" className="font-display text-3xl">Hay nombres repetidos</h2>
            <p className="mt-2 text-sm text-stone">
              Cada fila crea su propio código. Revisa si son la misma persona o dos invitados distintos.
            </p>
            <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto text-sm">
              {pending.clashes.slice(0, 8).map((clash) => (
                <li key={clash.name}>{clashLine(clash)}</li>
              ))}
            </ul>
            {pending.clashes.length > 8 ? (
              <p className="mt-2 text-sm text-stone">Y {pending.clashes.length - 8} más.</p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <Btn
                variant="ink"
                disabled={busy}
                onClick={async () => {
                  const current = pending;
                  setBusy(true);
                  try {
                    await commit(current.drafts, current.skipped, 0);
                    setPending(null);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Agregar todos
              </Btn>
              <Btn
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  const current = pending;
                  const filtered = withoutRepeatedNames(
                    current.drafts,
                    guests.map((guest) => guest.name),
                  );
                  setBusy(true);
                  try {
                    await commit(filtered.kept, current.skipped, filtered.omitted);
                    setPending(null);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Omitir repetidos
              </Btn>
              <Btn variant="quiet" onClick={() => setPending(null)}>
                Cancelar
              </Btn>
            </div>
          </div>
        </div>
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
            {sideLabel(guest.side)} · {guest.status === "Ingresado" && guest.arrived != null && guest.arrived !== guest.party ? `${guest.arrived} de ${peopleLabel(guest.party)}` : peopleLabel(guest.party)} · {guest.status}
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
            const arrived = guest.arrived == null ? null : Math.min(guest.arrived, count);
            await saveGuest({ ...guest, name: name.trim() || guest.name, email: email.trim(), phone: phone.trim(), party: count, arrived, note: note.trim() });
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
