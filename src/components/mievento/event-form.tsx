import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { Field, fieldClass, Btn, Monogram, usePhotoUrl } from "@/components/mievento/ui";
import { HolidayHint } from "@/components/mievento/place-extras";
import { resolveTimezone, searchPlaces, type PlaceSuggestion } from "@/lib/mievento/public-apis";
import type { WeddingEvent } from "@/lib/mievento/types";

export type EventDraft = {
  groom: string;
  bride: string;
  date: string;
  time: string;
  place: string;
  placeLat: number | null;
  placeLon: number | null;
  placeTz: string;
  photo: Blob | null;
};

export function EventForm({
  initial,
  title,
  submitLabel,
  onClose,
  onSubmit,
}: {
  initial?: WeddingEvent | null;
  title: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (draft: EventDraft) => Promise<void>;
}) {
  const [groom, setGroom] = useState(initial?.groom ?? "");
  const [bride, setBride] = useState(initial?.bride ?? "");
  const [date, setDate] = useState(initial?.date ?? "");
  const [time, setTime] = useState(initial?.time ?? "18:00");
  const [place, setPlace] = useState(initial?.place ?? "");
  const [placeLat, setPlaceLat] = useState<number | null>(initial?.placeLat ?? null);
  const [placeLon, setPlaceLon] = useState<number | null>(initial?.placeLon ?? null);
  const [placeTz, setPlaceTz] = useState(initial?.placeTz ?? "");
  const [pickedLabel, setPickedLabel] = useState(
    initial?.placeLat != null && initial?.placeLon != null ? (initial?.place ?? "") : "",
  );
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const searchSeq = useRef(0);

  // Búsqueda opcional del lugar en OpenStreetMap (Photon, sin llave). Solo se
  // envía el texto del lugar que se está escribiendo; sin internet, el campo
  // sigue funcionando a mano como siempre.
  useEffect(() => {
    const query = place.trim();
    if (query.length < 4 || query === pickedLabel) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchPlaces(query)
        .then((list) => {
          if (searchSeq.current !== seq) return;
          setSuggestions(list);
          setSearchFailed(false);
        })
        .catch(() => {
          if (searchSeq.current !== seq) return;
          setSuggestions([]);
          setSearchFailed(true);
        })
        .finally(() => {
          if (searchSeq.current === seq) setSearching(false);
        });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [place, pickedLabel]);

  function onPlaceChange(value: string) {
    setPlace(value);
    if (pickedLabel && value !== pickedLabel) {
      // El texto ya no es el lugar elegido: la ubicación exacta dejaría de
      // corresponder, así que se quita (el lugar escrito a mano se conserva).
      setPickedLabel("");
      setPlaceLat(null);
      setPlaceLon(null);
      setPlaceTz("");
    }
  }

  function pickPlace(suggestion: PlaceSuggestion) {
    const label = suggestion.label.slice(0, 120);
    setPlace(label);
    setPickedLabel(label);
    setPlaceLat(suggestion.lat);
    setPlaceLon(suggestion.lon);
    setSuggestions([]);
    setSearchFailed(false);
    void resolveTimezone(suggestion.lat, suggestion.lon).then((tz) => setPlaceTz(tz ?? ""));
  }
  const [photo, setPhoto] = useState<Blob | null>(initial?.photo ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const photoUrl = usePhotoUrl(photo);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Elige una imagen.");
      return;
    }
    setPhoto(await compressPhoto(file));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!groom.trim() || !bride.trim() || !date) {
      setError("Escribe los nombres y la fecha.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit({ groom, bride, date, time, place, placeLat, placeLon, placeTz, photo });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el evento");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-3 sm:items-center" role="presentation" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-form-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
        className="rise max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-paper p-5 shadow-none"
      >
        <h2 id="event-form-title" className="font-display text-3xl text-ink">
          {title}
        </h2>
        <p className="mt-1 text-sm text-stone">La foto y la lista se quedan en esta tablet.</p>
        <div className="mt-5 grid gap-4">
          <div className="overflow-hidden rounded-2xl border border-line">
            <div className="aspect-[16/8]">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Monogram groom={groom || "M"} bride={bride || "V"} />
              )}
            </div>
            <label className="flex min-h-11 cursor-pointer items-center justify-center text-sm font-medium text-brass">
              {photo ? "Cambiar foto" : "Añadir foto del evento"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => void onPhoto(event.target.files?.[0])}
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Novio">
              <input className={fieldClass} value={groom} onChange={(event) => setGroom(event.target.value)} maxLength={40} required />
            </Field>
            <Field label="Novia">
              <input className={fieldClass} value={bride} onChange={(event) => setBride(event.target.value)} maxLength={40} required />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha">
              <input className={fieldClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </Field>
            <Field label="Hora">
              <input className={fieldClass} type="time" value={time} onChange={(event) => setTime(event.target.value)} />
            </Field>
          </div>
          <HolidayHint date={date} />
          <div>
            <Field label="Lugar">
              <input
                className={fieldClass}
                value={place}
                onChange={(event) => onPlaceChange(event.target.value)}
                maxLength={120}
                placeholder="Salón, jardín, parroquia — escribe para buscarlo en el mapa"
                autoComplete="off"
              />
            </Field>
            {placeLat != null && placeLon != null ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-sage">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" />
                  Ubicación exacta lista: clima, mapa y «cómo llegar» en los pases.
                </span>
                <button
                  type="button"
                  className="font-medium text-brass"
                  onClick={() => {
                    setPickedLabel("");
                    setPlaceLat(null);
                    setPlaceLon(null);
                    setPlaceTz("");
                  }}
                >
                  Quitar
                </button>
              </p>
            ) : (
              <p className="mt-2 text-sm text-stone">
                Al escribir, solo ese texto se busca en OpenStreetMap para sugerir el lugar (sin cuenta ni llave).
                La lista de invitados no sale de la tablet. También puedes escribirlo a mano, sin buscar.
              </p>
            )}
            {searching ? <p className="mt-2 text-sm text-stone">Buscando lugares…</p> : null}
            {searchFailed && !searching ? (
              <p className="mt-2 text-sm text-stone">
                Sin conexión para buscar lugares. Escribe el lugar a mano: el evento se guarda igual.
              </p>
            ) : null}
            {suggestions.length > 0 ? (
              <ul className="mt-2 divide-y divide-line rounded-2xl border border-line" aria-label="Lugares sugeridos">
                {suggestions.map((suggestion) => (
                  <li key={`${suggestion.lat},${suggestion.lon},${suggestion.label}`}>
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink"
                      onClick={() => pickPlace(suggestion)}
                    >
                      <MapPin className="size-4 shrink-0 text-brass" />
                      <span className="min-w-0">{suggestion.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {suggestions.length > 0 ? (
              <p className="mt-1.5 text-xs text-stone">Lugares: © OpenStreetMap contributors (búsqueda Photon).</p>
            ) : null}
          </div>
          {error ? <p className="text-sm text-alert">{error}</p> : null}
          <div className="flex gap-2">
            <Btn type="submit" className="flex-1" disabled={busy}>
              {busy ? "Guardando…" : submitLabel}
            </Btn>
            <Btn variant="ghost" onClick={onClose}>
              Cancelar
            </Btn>
          </div>
        </div>
      </form>
    </div>
  );
}

async function compressPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1400;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob ?? file;
  } catch {
    return file;
  }
}
