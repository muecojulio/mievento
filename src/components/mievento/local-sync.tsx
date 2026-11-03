import { useEffect, useRef, useState } from "react";
import {
  answerSync,
  completeSync,
  disconnectSync,
  offerSync,
  useSyncSnapshot,
} from "@/lib/mievento/local-sync";
import { Btn, fieldClass, Switch, useOnlineStatus } from "./ui";

export function LocalSync({ eventId }: { eventId?: string }) {
  const sync = useSyncSnapshot();
  const online = useOnlineStatus();
  const [code, setCode] = useState("");
  const [qr, setQr] = useState("");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [allowInternet, setAllowInternet] = useState(false);
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
    let stop: (() => void) | undefined;
    let cancelled = false;
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
        Misma red Wi-Fi o hotspot local, sin servidor ni internet para sincronizar. Mantén la app
        abierta en todas las puertas: la tablet principal coordina un bloqueo en vivo para que un
        mismo QR no pueda pasar en dos puertas ni escaneando al mismo tiempo.
      </p>
      <p role="status" className="my-3 text-sm font-medium text-ink">
        {sync.status}
      </p>
      <p className="mb-3 text-sm text-stone">
        La tablet principal envía su evento completo a cada puerta receptora. Puedes enlazar una
        segunda, tercera o más puertas repitiendo los pasos 1 a 3 sin desconectar las anteriores.
      </p>
      {eventId && online ? (
        <div className="mb-3 rounded-2xl border border-line px-3 py-1.5">
          <Switch
            checked={allowInternet}
            onChange={setAllowInternet}
            label="Puertas en distinta red (usar internet)"
            hint="Apagado usa solo Wi-Fi/hotspot local sin internet. Enciéndelo si cada puerta usa sus propios datos móviles."
          />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {eventId && (
          <Btn
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setMode("offer");
                setCode(await offerSync(eventId, { allowInternet: online && allowInternet }));
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
              else {
                await completeSync(input.trim());
                setCode("");
                setInput("");
              }
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
        <p role="alert" className="mt-3 text-sm text-alert">
          {error}
        </p>
      )}
      <p className="mt-3 text-xs text-stone">
        El QR permite acceder a los datos del evento: muéstralo solo al equipo autorizado. Caduca en
        10 minutos. Si la red Wi-Fi aísla dispositivos y no hay internet, usa «Puerta asignada por
        QR» para impedir que un mismo pase se use en dos entradas sin red.
      </p>
      <p className="mt-2 text-xs text-stone">
        Las pestañas de este navegador se actualizan automáticamente mediante BroadcastChannel, si
        está disponible.
      </p>
    </section>
  );
}
