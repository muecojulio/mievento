/* eslint-disable react-refresh/only-export-components -- el hook y sus diálogos viven juntos a propósito */
import { useState, type FormEvent, type ReactNode } from "react";
import { Btn, fieldClass } from "@/components/mievento/ui";
import {
  changePin,
  checkPin,
  clearPin,
  hasPin,
  setPin,
  validPin,
} from "@/lib/mievento/operator-pin";

/**
 * PIN local opcional para las acciones del organizador. La protección solo
 * existe si alguien configuró un PIN; escanear en la puerta nunca lo pide.
 */
export function usePinGuard() {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [settings, setSettings] = useState(false);

  function guard(action: () => void) {
    if (!hasPin()) {
      action();
      return;
    }
    setPending(() => action);
  }

  const dialogs: ReactNode = (
    <>
      {pending ? (
        <PinVerify
          onClose={() => setPending(null)}
          onVerified={() => {
            const action = pending;
            setPending(null);
            action();
          }}
        />
      ) : null}
      {settings ? <PinSettings onClose={() => setSettings(false)} /> : null}
    </>
  );

  return { guard, openSettings: () => setSettings(true), dialogs, hasPin };
}

function DialogShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-3 sm:items-center">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-3xl bg-paper p-5">
        <h2 className="font-display text-3xl">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function PinVerify({ onClose, onVerified }: { onClose: () => void; onVerified: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (await checkPin(pin)) onVerified();
      else setError("Ese PIN no es el de esta tablet. Inténtalo de nuevo.");
    } catch {
      setError("No se pudo comprobar el PIN en este navegador.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell title="PIN de la tablet">
      <p className="mt-2 text-sm text-stone">
        Esta acción cambia el evento o exporta la lista. Escribe el PIN del organizador para continuar.
      </p>
      <form className="mt-4 grid gap-2" onSubmit={(event) => void submit(event)}>
        <input
          className={fieldClass}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          placeholder="PIN de 4 a 8 números"
          aria-label="PIN del organizador"
          autoFocus
        />
        {error ? <p className="text-sm text-alert">{error}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          <Btn type="submit" disabled={busy || !pin}>
            {busy ? "Comprobando…" : "Continuar"}
          </Btn>
          <Btn variant="quiet" onClick={onClose}>
            Cancelar
          </Btn>
        </div>
      </form>
    </DialogShell>
  );
}

function PinSettings({ onClose }: { onClose: () => void }) {
  const configured = hasPin();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!validPin(next)) {
      setError("El PIN debe tener de 4 a 8 números.");
      return;
    }
    if (next !== confirm) {
      setError("Los dos PIN no coinciden.");
      return;
    }
    setBusy(true);
    try {
      let ok = true;
      if (configured) ok = await changePin(current, next);
      else await setPin(next);
      if (!ok) setError("El PIN actual no es correcto.");
      else {
        setNotice(configured ? "PIN actualizado en esta tablet." : "PIN guardado solo en esta tablet.");
        setCurrent("");
        setNext("");
        setConfirm("");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el PIN.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (!(await checkPin(current))) {
        setError("Escribe el PIN actual para quitarlo.");
        return;
      }
      clearPin();
      setNotice("PIN quitado. Las acciones vuelven a estar sin protección.");
      setCurrent("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell title={configured ? "Cambiar el PIN" : "Proteger con PIN"}>
      <p className="mt-2 text-sm text-stone">
        El PIN se guarda como hash solo en esta tablet. No hay cuenta ni recuperación: si lo olvidas, hay que borrar los datos del sitio.
      </p>
      <form className="mt-4 grid gap-2" onSubmit={(event) => void save(event)}>
        {configured ? (
          <input
            className={fieldClass}
            type="password"
            inputMode="numeric"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            placeholder="PIN actual"
            aria-label="PIN actual"
            autoComplete="off"
          />
        ) : null}
        <input
          className={fieldClass}
          type="password"
          inputMode="numeric"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          placeholder="PIN nuevo (4 a 8 números)"
          aria-label="PIN nuevo"
          autoComplete="off"
        />
        <input
          className={fieldClass}
          type="password"
          inputMode="numeric"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="Repetir PIN nuevo"
          aria-label="Repetir PIN nuevo"
          autoComplete="off"
        />
        {error ? <p className="text-sm text-alert">{error}</p> : null}
        {notice ? <p className="text-sm text-sage">{notice}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          <Btn type="submit" disabled={busy}>
            Guardar PIN
          </Btn>
          {configured ? (
            <Btn variant="ghost" disabled={busy} onClick={() => void remove()}>
              Quitar PIN
            </Btn>
          ) : null}
          <Btn variant="quiet" onClick={onClose}>
            Cerrar
          </Btn>
        </div>
      </form>
      <p className="mt-3 text-xs text-stone">
        Con PIN activo se pide antes de terminar o borrar el evento, reciclar códigos, vaciar la lista y descargar copias.
      </p>
    </DialogShell>
  );
}
