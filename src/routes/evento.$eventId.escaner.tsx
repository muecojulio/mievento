import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, ImagePlus, Minus, Plus, UserPlus } from "lucide-react";
import { Btn, fieldClass, Switch } from "@/components/mievento/ui";
import { extractToken } from "@/lib/mievento/crypto";
import { foldText, formatClock, peopleLabel, sideLabel, sidePhrase, tally } from "@/lib/mievento/format";
import { playSignal, setSignalEnabled, signalEnabled } from "@/lib/mievento/signal";
import { addWalkIn, admitByName, admitToken, revertAdmit, setArrived, useEvent, useGuests } from "@/lib/mievento/store";
import type { AdmitResult, Guest, Side } from "@/lib/mievento/types";

export const Route = createFileRoute("/evento/$eventId/escaner")({
  head: () => ({ meta: [{ title: "Escanear · Mi Evento" }] }),
  component: ScannerPage,
});

type Stoppable = { stop: () => void };

function ScannerPage() {
  const { eventId } = Route.useParams();
  const event = useEvent(eventId);
  const guests = useGuests(eventId);
  const counts = useMemo(() => tally(guests), [guests]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<Stoppable | null>(null);
  const ignoreRef = useRef<{ token: string; until: number } | null>(null);
  const pendingRef = useRef<string | null>(null);
  const continuousRef = useRef(false);
  const [live, setLive] = useState(false);
  const [result, setResult] = useState<AdmitResult | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [manual, setManual] = useState("");
  const [signal, setSignal] = useState(true);
  const [continuous, setContinuous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lookup, setLookup] = useState("");
  const [doorOpen, setDoorOpen] = useState(false);
  const [doorName, setDoorName] = useState("");
  const [doorSide, setDoorSide] = useState<Side>("novio");
  const [doorParty, setDoorParty] = useState(1);

  useEffect(() => {
    setSignal(signalEnabled());
    return () => {
      controlsRef.current?.stop();
      const video = videoRef.current;
      const stream = video?.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (!event) return null;

  const query = foldText(lookup.trim());
  const matches =
    query.length < 2
      ? []
      : guests
          .filter((guest) => foldText(guest.name).includes(query))
          .sort((a, b) => a.name.localeCompare(b.name, "es"))
          .slice(0, 8);

  function showOutcome(outcome: AdmitResult) {
    setResult(outcome);
    playSignal(outcome.ok);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function authorize(guest: Guest) {
    setBusy(true);
    try {
      const outcome = await admitByName(guest.id);
      showOutcome(outcome);
      if (outcome.ok) setLookup("");
    } finally {
      setBusy(false);
    }
  }

  async function admitDoor() {
    setBusy(true);
    try {
      const outcome = await addWalkIn(eventId, { name: doorName, side: doorSide, party: doorParty });
      showOutcome(outcome);
      if (outcome.ok) {
        setDoorName("");
        setDoorParty(1);
        setDoorOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const video = videoRef.current;
    const stream = video?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    if (video) video.srcObject = null;
    setLive(false);
  }

  async function handleRaw(raw: string, fromCamera = false) {
    const token = extractToken(raw);
    const now = Date.now();
    if (!token) return;
    if (fromCamera) {
      if (pendingRef.current === token) return;
      if (ignoreRef.current && ignoreRef.current.token === token && now < ignoreRef.current.until) return;
      pendingRef.current = token;
    }
    setBusy(true);
    try {
      const outcome = await admitToken(eventId, raw);
      if (fromCamera && outcome.ok) ignoreRef.current = { token: outcome.guest.token, until: Date.now() + 8000 };
      else if (fromCamera && !outcome.ok && outcome.reason === "used") ignoreRef.current = { token, until: Date.now() + 2200 };
      setResult(outcome);
      playSignal(outcome.ok);
      if (!continuousRef.current) await stopCamera();
    } finally {
      if (pendingRef.current === token) pendingRef.current = null;
      setBusy(false);
    }
  }

  async function startCamera() {
    setCameraError("");
    setResult(null);
    const video = videoRef.current;
    if (!video) return;
    try {
      const Detector = detectorCtor();
      if (Detector) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        });
        video.srcObject = stream;
        await video.play();
        setLive(true);
        const detector = new Detector({ formats: ["qr_code"] });
        let stopped = false;
        controlsRef.current = {
          stop() {
            stopped = true;
          },
        };
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video);
            const value = codes[0]?.rawValue;
            if (value) await handleRaw(value, true);
          } catch {
            /* el cuadro todavía no está listo */
          }
          if (!stopped) window.setTimeout(() => void tick(), 240);
        };
        void tick();
        return;
      }
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromVideoDevice(undefined, video, (found) => {
        if (found) void handleRaw(found.getText(), true);
      });
      controlsRef.current = controls;
      setLive(true);
    } catch {
      setCameraError("No se pudo usar la cámara. Escribe el código o lee una foto del pase.");
      await stopCamera();
    }
  }

  async function onImage(file: File) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const Detector = detectorCtor();
      if (Detector) {
        const codes = await new Detector({ formats: ["qr_code"] }).detect(image);
        if (codes[0]?.rawValue) {
          await handleRaw(codes[0].rawValue, true);
          return;
        }
      }
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      const found = await reader.decodeFromImageElement(image);
      await handleRaw(found.getText(), true);
    } catch {
      setResult({
        ok: false,
        reason: "invalid",
        message: "No se encontró un código en esa imagen. El paso no está autorizado.",
      });
      playSignal(false);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const tone = !result ? "" : result.ok ? "bg-sage text-paper" : "bg-alert text-paper";

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6">
      <p className="text-sm font-medium text-brass">{event.groom} y {event.bride}</p>
      <h1 className="mt-1 font-display text-4xl">Escanear</h1>
      <p className="mt-2 text-sm text-stone">
        {event.closed
          ? "El evento ya terminó. El lector no deja pasar hasta que recicles los códigos."
          : "Pulsa el botón cada vez que llegue un invitado. Si no trae el código, búscalo por nombre."}
      </p>
      <p className="mt-3 text-sm tabular-nums text-ink-soft">
        {peopleLabel(counts.totalPeople)} dentro · {peopleLabel(counts.pendingPeople)} fuera
        <span className="text-stone"> · Novio {counts.novioPeople} · Novia {counts.noviaPeople}</span>
      </p>

      {result && !live ? (
        <ScanVerdict
          result={result}
          tone={tone}
          onClear={() => setResult(null)}
          onAgain={() => void startCamera()}
          onArrived={async (count) => {
            if (!result.ok) return;
            const next = await setArrived(result.guest.id, count);
            if (next) setResult({ ok: true, guest: next });
          }}
        />
      ) : null}

      {event.closed ? (
        <section className="mt-5 rounded-3xl border border-line p-5">
          <h2 className="font-display text-3xl">Evento terminado</h2>
          <p className="mt-2 text-sm text-stone">
            El lector no deja pasar. En el tablero puedes reciclar los códigos: las mismas imágenes vuelven a servir.
          </p>
          <Link
            to="/evento/$eventId"
            params={{ eventId }}
            className="mt-4 inline-flex min-h-11 items-center font-medium text-brass"
          >
            Ir al tablero
          </Link>
        </section>
      ) : (
        <>
      <div className={result && !live ? "hidden" : "relative mt-5 overflow-hidden rounded-3xl bg-ink"}>
        <video ref={videoRef} className={live ? "aspect-[3/4] w-full object-cover" : "hidden"} playsInline muted autoPlay />
        {!live ? (
          <div className="flex aspect-[3/4] flex-col items-center justify-center px-6 text-center">
            <p className="font-display text-3xl text-paper">Listo en la puerta</p>
            <p className="mt-2 max-w-xs text-sm text-paper-2">La cámara permanece apagada hasta que pulses el botón.</p>
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-paper/80" />
        )}
      </div>

      <div className="mt-4 grid gap-2">
        {live ? (
          <Btn variant="ink" onClick={() => void stopCamera()}>
            Cerrar cámara
          </Btn>
        ) : (
          <Btn data-testid="scan-open" onClick={() => void startCamera()} disabled={busy}>
            <Camera className="size-4" />
            Escanear código
          </Btn>
        )}
        <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-line text-sm font-medium">
          <ImagePlus className="size-4" />
          Leer una foto del código
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void onImage(file);
            }}
          />
        </label>
      </div>
      {cameraError ? <p className="mt-3 text-sm text-alert">{cameraError}</p> : null}

      <div className="mt-4 rounded-3xl border border-line px-4 py-2">
        <Switch
          checked={continuous}
          onChange={(value) => {
            continuousRef.current = value;
            setContinuous(value);
          }}
          label="Lectura continua"
          hint="Déjala apagada si prefieres un botón por persona."
        />
        <Switch
          checked={signal}
          onChange={(value) => {
            setSignal(value);
            setSignalEnabled(value);
          }}
          label="Señal al leer"
          hint="Un tono breve y una vibración."
        />
      </div>

      <form
        className="mt-4 grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void handleRaw(manual);
        }}
      >
        <label className="text-sm font-medium text-ink-soft" htmlFor="manual-code">
          O escribe el código
        </label>
        <input
          id="manual-code"
          data-testid="manual-code"
          className={fieldClass}
          value={manual}
          onChange={(event) => setManual(event.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="ME1…"
        />
        <Btn type="submit" variant="ghost" data-testid="manual-submit" disabled={!manual.trim() || busy}>
          Validar código
        </Btn>
      </form>

      <section className="mt-6 rounded-3xl border border-line p-4">
        <h2 className="font-display text-2xl">Sin código</h2>
        <p className="mt-1 text-sm text-stone">Busca el nombre de la lista y autoriza el ingreso. El pase queda usado igual.</p>
        <input
          className={`${fieldClass} mt-3`}
          value={lookup}
          onChange={(event) => setLookup(event.target.value)}
          placeholder="Buscar por nombre"
          aria-label="Buscar por nombre"
          autoCapitalize="words"
        />
        {query.length >= 2 && matches.length === 0 ? (
          <p className="mt-3 text-sm text-stone">Nadie en la lista se llama así.</p>
        ) : null}
        {matches.length > 0 ? (
          <ul className="mt-3 divide-y divide-line">
            {matches.map((guest) => (
              <li key={guest.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="font-medium">{guest.name}</p>
                  <p className="text-sm text-stone">
                    {sideLabel(guest.side)} · {peopleLabel(guest.party)}
                    {guest.note ? ` · ${guest.note}` : ""}
                    {guest.status === "Ingresado" ? " · Ya ingresó" : ""}
                  </p>
                </div>
                {guest.status === "Pendiente" ? (
                  <Btn className="shrink-0" disabled={busy} onClick={() => void authorize(guest)}>
                    Autorizar
                  </Btn>
                ) : (
                  <span className="shrink-0 text-sm text-stone">{guest.scannedAt ? formatClock(guest.scannedAt) : "Dentro"}</span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="mt-4 rounded-3xl border border-line p-4">
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
          onClick={() => setDoorOpen((value) => !value)}
        >
          <span>
            <span className="flex items-center gap-2 font-display text-2xl">
              <UserPlus className="size-5 text-brass" />
              Invitado de último momento
            </span>
            <span className="mt-1 block text-sm text-stone">Alguien que no estaba en el Excel. Entra y cuenta en el total.</span>
          </span>
        </button>
        {doorOpen ? (
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void admitDoor();
            }}
          >
            <input
              className={fieldClass}
              value={doorName}
              onChange={(event) => setDoorName(event.target.value)}
              placeholder="Nombre"
              aria-label="Nombre del invitado"
              required
            />
            <div className="grid grid-cols-2 gap-2">
              {(["novio", "novia"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setDoorSide(side)}
                  className={`min-h-11 rounded-full text-sm font-medium ${doorSide === side ? "bg-ink text-paper" : "border border-line text-ink-soft"}`}
                >
                  {sideLabel(side)}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Personas</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Menos personas"
                  disabled={doorParty <= 1}
                  onClick={() => setDoorParty((value) => Math.max(1, value - 1))}
                  className="inline-flex size-11 items-center justify-center rounded-full border border-line disabled:opacity-40"
                >
                  <Minus className="size-4" />
                </button>
                <span className="w-8 text-center text-lg tabular-nums">{doorParty}</span>
                <button
                  type="button"
                  aria-label="Más personas"
                  disabled={doorParty >= 20}
                  onClick={() => setDoorParty((value) => Math.min(20, value + 1))}
                  className="inline-flex size-11 items-center justify-center rounded-full border border-line disabled:opacity-40"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
            <Btn type="submit" disabled={busy || !doorName.trim()}>
              Dejar entrar
            </Btn>
          </form>
        ) : null}
      </section>
        </>
      )}
    </main>
  );
}

function ScanVerdict({
  result,
  tone,
  onClear,
  onAgain,
  onArrived,
}: {
  result: Exclude<AdmitResult, null>;
  tone: string;
  onClear: () => void;
  onAgain: () => void;
  onArrived: (count: number) => void;
}) {
  const arrived = result.ok ? (result.guest.arrived ?? result.guest.party) : 0;
  return (
    <section data-testid="scan-result" className={`rise mt-5 rounded-3xl p-5 ${tone}`}>
      {result.ok ? (
        <>
          <p className="text-sm font-medium">Ingreso autorizado</p>
          <h2 className="mt-2 font-display text-4xl">{result.guest.name}</h2>
          <p className="mt-2 text-base">
            {sidePhrase(result.guest.side)}
            {result.guest.entry === "puerta"
              ? ` · anotado en la puerta, ${peopleLabel(result.guest.party)}`
              : ` · en el pase, ${peopleLabel(result.guest.party)}`}
          </p>
          {result.guest.note ? <p className="mt-1 text-sm">{result.guest.note}</p> : null}
          {result.guest.party > 1 ? (
            <div className="mt-4">
              <p className="text-sm font-medium">¿Cuántos entraron?</p>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Menos personas"
                  disabled={arrived <= 1}
                  onClick={() => onArrived(arrived - 1)}
                  className="inline-flex size-11 items-center justify-center rounded-full border border-paper text-paper disabled:opacity-40"
                >
                  <Minus className="size-4" />
                </button>
                <p className="min-w-28 text-lg tabular-nums">{peopleLabel(arrived)}</p>
                <button
                  type="button"
                  aria-label="Más personas"
                  disabled={arrived >= result.guest.party}
                  onClick={() => onArrived(arrived + 1)}
                  className="inline-flex size-11 items-center justify-center rounded-full border border-paper text-paper disabled:opacity-40"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm">{peopleLabel(arrived)} dentro.</p>
          )}
          <p className="mt-3 text-sm">
            Quedó como Ingresado
            {result.guest.scannedAt ? ` · ${formatClock(result.guest.scannedAt)}` : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-full border border-paper px-5 text-sm font-medium text-paper transition-transform duration-150 active:scale-[0.96]"
              onClick={() => {
                void revertAdmit(result.guest.id).then(onClear);
              }}
            >
              Anular este ingreso
            </button>
            <Btn variant="ink" onClick={onAgain}>
              Escanear otro
            </Btn>
          </div>
        </>
      ) : (
        <>
          <h2 className="font-display text-3xl leading-tight break-words">{result.message}</h2>
          {result.guest ? (
            <p className="mt-3 text-base">
              {result.guest.name}
              {result.guest.scannedAt ? ` ingresó a las ${formatClock(result.guest.scannedAt)}` : "."}
            </p>
          ) : null}
          <p className="mt-2 text-sm">El paso no está autorizado.</p>
          <Btn variant="ink" className="mt-4" onClick={onAgain}>
            Escanear otro
          </Btn>
        </>
      )}
    </section>
  );
}

function detectorCtor():
  | (new (opts: { formats: string[] }) => {
      detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
    })
  | null {
  const host = window as unknown as {
    BarcodeDetector?: new (opts: { formats: string[] }) => {
      detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
    };
  };
  return host.BarcodeDetector ?? null;
}
