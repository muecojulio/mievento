import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  answerSync,
  completeSync,
  disconnectSync,
  offerSync,
  subscribeSync,
  syncStatus,
} from "@/lib/mievento/local-sync";
import { Btn, fieldClass } from "./ui";

export function LocalSync({ eventId }: { eventId?: string }) {
  const status = useSyncExternalStore(subscribeSync, syncStatus, () => "Sin conexión");
  const [code, setCode] = useState("");
  const [qr, setQr] = useState("");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [mode, setMode] = useState<"offer" | "answer">(eventId ? "offer" : "answer");
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let alive = true;
    setQr("");
    if (code)
      void import("qrcode")
        .then((mod) =>
          mod.default.toDataURL(code, { width: 420, errorCorrectionLevel: "L", margin: 3 }),
        )
        .then((url: string) => {
          if (alive) setQr(url);
        })
        .catch(() => setError("No cabe en un QR. Copia el código de emparejamiento."));
    return () => {
      alive = false;
    };
  }, [code]);
  useEffect(() => {
    if (!scanning || !video.current) return;
    let stop: (() => void) | undefined,
      cancelled = false;
    void import("@zxing/browser")
      .then(async ({ BrowserQRCodeReader }) => {
        const controls = await new BrowserQRCodeReader().decodeFromVideoDevice(
          undefined,
          video.current!,
          (result) => {
            if (result) {
              setInput(result.getText());
              setScanning(false);
            }
          },
        );
        if (cancelled) controls.stop();
        else stop = () => controls.stop();
      })
      .catch(() => {
        setError("No se pudo abrir la cámara. Permite su acceso o pega el código.");
        setScanning(false);
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [scanning]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo conectar");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-6 rounded-3xl border border-line p-4">
      <h2 className="font-display text-2xl">Conectar tablets</h2>
      <p className="mt-2 text-sm text-stone">
        Misma red Wi-Fi, sin servidor ni internet para sincronizar. Mantén la app abierta en ambas
        tablets. La red debe permitir comunicación entre dispositivos.
      </p>
      <p role="status" className="my-3 text-sm font-medium">
        {status}
      </p>
      <p className="mb-3 text-sm text-stone">
        La tablet principal envía su evento completo: sustituye la copia de ese evento en la
        receptora. Guarda una copia antes de conectar. Después se comparten los cambios en ambos
        sentidos. Una pareja por pestaña emparejada.
      </p>
      <div className="flex flex-wrap gap-2">
        {eventId && (
          <Btn
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setMode("offer");
                setCode(await offerSync(eventId));
              })
            }
          >
            1. Generar QR principal
          </Btn>
        )}
        <Btn
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setMode("answer");
            setCode("");
            setInput("");
          }}
        >
          Recibir evento
        </Btn>
        <Btn
          variant="quiet"
          onClick={() => {
            disconnectSync();
            setCode("");
          }}
        >
          Desconectar
        </Btn>
      </div>
      {qr && (
        <img
          src={qr}
          alt={
            mode === "offer"
              ? "QR de oferta: escanear en la tablet receptora"
              : "QR de respuesta: escanear en la tablet principal"
          }
          className="mx-auto my-4 w-full max-w-sm rounded-xl"
        />
      )}
      {code && (
        <details className="my-3 text-sm">
          <summary>Copiar código de emparejamiento</summary>
          <textarea
            readOnly
            aria-label="Código generado"
            className={fieldClass}
            value={code}
            onFocus={(e) => e.target.select()}
          />
        </details>
      )}
      <p className="my-3 text-sm text-stone">
        {mode === "offer"
          ? "2. En la receptora: pulsa Recibir evento, escanea la oferta y genera la respuesta. 3. En la principal: escanea la respuesta y conecta."
          : "Escanea la oferta de la principal y genera una respuesta. Luego muestra el QR de respuesta a la principal."}
      </p>
      {scanning && <video ref={video} muted playsInline className="my-3 w-full rounded-xl" />}
      <label className="block text-sm">
        Código de la otra tablet
        <textarea
          className={`${fieldClass} mt-1`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="MESYNC1:…"
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Btn variant="ghost" onClick={() => setScanning(!scanning)}>
          {scanning ? "Cerrar cámara" : "Escanear QR"}
        </Btn>
        <Btn
          disabled={busy || !input}
          onClick={() =>
            void run(async () => {
              if (mode === "answer") setCode(await answerSync(input.trim()));
              else await completeSync(input.trim());
            })
          }
        >
          {busy
            ? "Preparando…"
            : mode === "answer"
              ? "Generar respuesta y recibir"
              : "Conectar con respuesta"}
        </Btn>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <p className="mt-3 text-xs text-stone">
        El QR permite acceder a los datos del evento: muéstralo solo al equipo autorizado. Caduca en
        10 minutos. Si se corta la conexión, vuelve a emparejar desde la copia más actualizada. Dos
        tablets desconectadas o escaneos simultáneos pueden aceptar el mismo pase; no hay bloqueo
        centralizado.
      </p>
      <p className="mt-2 text-xs text-stone">
        Las pestañas de este navegador se actualizan automáticamente mediante BroadcastChannel, si
        está disponible.
      </p>
    </section>
  );
}
