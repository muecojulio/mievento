import { useState } from "react";
import { Field, fieldClass, Btn, Monogram, usePhotoUrl } from "@/components/mievento/ui";
import type { WeddingEvent } from "@/lib/mievento/types";

export type EventDraft = {
  groom: string;
  bride: string;
  date: string;
  time: string;
  place: string;
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
      await onSubmit({ groom, bride, date, time, place, photo });
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
          <Field label="Lugar">
            <input className={fieldClass} value={place} onChange={(event) => setPlace(event.target.value)} maxLength={80} placeholder="Salón, jardín, parroquia" />
          </Field>
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
