import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Camera, ImagePlus } from "lucide-react";
import { Btn, fieldClass, Switch } from "@/components/mievento/ui";
import { extractToken } from "@/lib/mievento/crypto";
import { formatClock, peopleLabel, sidePhrase } from "@/lib/mievento/format";
import { playSignal, setSignalEnabled, signalEnabled } from "@/lib/mievento/signal";
import { admitToken, revertAdmit, useEvent } from "@/lib/mievento/store";
import type { AdmitResult } from "@/lib/mievento/types";

export const Route = createFileRoute("/evento/$eventId/escaner")({
  head: () => ({ meta: [{ title: "Escanear · Mi Evento" }] }),
  component: ScannerPage,
});

type Stoppable = { stop: () => void };

function ScannerPage() {
  const { eventId } = Route.useParams();
  const event = useEvent(eventId);
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
      <p className="mt-2 text-sm text-stone">Pulsa el botón cada vez que llegue un invitado. Solo acepta códigos de esta lista.</p>

      {result && !live ? <ScanVerdict result={result} tone={tone} onClear={() => setResult(null)} onAgain={() => void startCamera()} /> : null}

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
    </main>
  );
}

function ScanVerdict({
  result,
  tone,
  onClear,
  onAgain,
}: {
  result: Exclude<AdmitResult, null>;
  tone: string;
  onClear: () => void;
  onAgain: () => void;
}) {
  return (
    <section data-testid="scan-result" className={`rise mt-5 rounded-3xl p-5 ${tone}`}>
      {result.ok ? (
        <>
          <p className="text-sm font-medium">Ingreso autorizado</p>
          <h2 className="mt-2 font-display text-4xl">{result.guest.name}</h2>
          <p className="mt-2 text-base">
            {sidePhrase(result.guest.side)} · {peopleLabel(result.guest.party)}
          </p>
          {result.guest.note ? <p className="mt-1 text-sm">{result.guest.note}</p> : null}
          <p className="mt-3 text-sm">Quedó como Ingresado{result.guest.scannedAt ? ` · ${formatClock(result.guest.scannedAt)}` : ""}.</p>
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
              {result.guest.scannedAt ? ` ingresó a las ${formatClock(result.guest.scannedAt)}` : ""}.
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
