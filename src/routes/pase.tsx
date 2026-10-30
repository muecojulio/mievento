import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarPlus, Download } from "lucide-react";
import { Btn, Mark } from "@/components/mievento/ui";
import { formatLongDate, peopleLabel, sidePhrase } from "@/lib/mievento/format";
import { downloadBlob, icsFor, qrDataUrl, readPassHash, renderPassPng, type PassView } from "@/lib/mievento/pass";

export const Route = createFileRoute("/pase")({
  head: () => ({ meta: [{ title: "Pase · Mi Evento" }] }),
  component: PassPage,
});

function PassPage() {
  const [pass, setPass] = useState<PassView | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const next = readPassHash();
    setPass(next);
    setReady(true);
    if (!next) return;
    void qrDataUrl(next.token).then(setQr).catch(() => setQr(null));
  }, []);

  if (!ready) {
    return <main className="min-h-dvh bg-paper" />;
  }

  if (!pass) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
        <Mark className="mx-auto h-8 w-12 text-brass" />
        <h1 className="mt-4 font-display text-4xl">Este enlace no trae un pase</h1>
        <p className="mt-3 text-stone">Pide a quien organiza el evento que te lo reenvíe.</p>
      </main>
    );
  }

  const when = [formatLongDate(pass.date), pass.time].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 py-8">
      <article className="rise overflow-hidden rounded-3xl border border-line bg-paper">
        <div className="h-2 bg-brass" />
        <div className="px-5 py-6">
          <div className="flex items-center gap-2 text-brass">
            <Mark className="h-6 w-9" />
            <p className="text-sm font-medium">Mi Evento</p>
          </div>
          <h1 className="mt-4 font-display text-4xl text-ink">
            {pass.groom && pass.bride ? `${pass.groom} y ${pass.bride}` : "Tu pase"}
          </h1>
          <p className="mt-2 text-sm text-ink-soft">{when}</p>
          {pass.place ? <p className="text-sm text-stone">{pass.place}</p> : null}
          <p className="mt-6 font-display text-3xl">{pass.name}</p>
          <p className="mt-1 text-sm text-stone">
            {sidePhrase(pass.side)} · {peopleLabel(pass.party)}
          </p>
          <div className="mt-6 rounded-2xl bg-paper-2 p-3">
            {qr ? <img src={qr} alt={`Código de acceso de ${pass.name}`} className="mx-auto w-full max-w-xs" /> : null}
          </div>
          <p className="mt-4 text-center text-sm text-stone">De un solo uso. Muéstralo en la entrada.</p>
        </div>
      </article>
      <div className="mt-4 grid gap-2">
        <Btn
          onClick={async () => {
            const blob = await renderPassPng(pass);
            downloadBlob(blob, "pase-mi-evento.png");
          }}
        >
          <Download className="size-4" />
          Guardar pase
        </Btn>
        <Btn
          variant="ghost"
          onClick={() => {
            downloadBlob(new Blob([icsFor(pass)], { type: "text/calendar" }), "mi-evento.ics");
          }}
        >
          <CalendarPlus className="size-4" />
          Añadir al calendario
        </Btn>
        <p className="px-2 text-center text-sm text-stone">
          Guarda la imagen en Fotos. El calendario del teléfono conserva la fecha, el día y los nombres.
        </p>
      </div>
    </main>
  );
}
