import { useState } from "react";
import { exportBackup, importBackup } from "@/lib/mievento/store";
import { isEncryptedBackup } from "@/lib/mievento/backup-crypto";
import { downloadBlob } from "@/lib/mievento/pass";
import { Btn, fieldClass } from "./ui";

export function EncryptedBackup({ eventId, filename }: { eventId: string; filename: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        if (password !== confirm) {
          setError("Las contraseñas no coinciden");
          return;
        }
        setBusy(true);
        try {
          const json = await exportBackup(eventId, password);
          downloadBlob(new Blob([json], { type: "application/json" }), filename);
          setPassword("");
          setConfirm("");
        } catch (e) {
          setError(e instanceof Error ? e.message : "No se pudo crear la copia");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="font-medium">Copia cifrada con contraseña</h3>
      <p className="text-sm text-stone">
        AES-256-GCM y PBKDF2. Guarda la contraseña: no se puede recuperar.
      </p>
      <label className="block text-sm">
        Contraseña (mínimo 10 caracteres)
        <input
          className={fieldClass}
          required
          minLength={10}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Repetir contraseña
        <input
          className={fieldClass}
          required
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      <Btn type="submit" disabled={busy}>
        {busy ? "Cifrando…" : "Descargar copia cifrada"}
      </Btn>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
export function RestoreBackup({ onRestored }: { onRestored: (id: string) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [encrypted, setEncrypted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return;
        setBusy(true);
        setError("");
        try {
          const id = await importBackup(file, encrypted ? password : undefined);
          setPassword("");
          await onRestored(id);
        } catch (e) {
          setError(e instanceof Error ? e.message : "No se pudo restaurar la copia");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block text-sm font-medium">
        Restaurar una copia
        <input
          className="mt-2 block w-full text-sm"
          type="file"
          accept="application/json,.json"
          onChange={async (e) => {
            const selected = e.target.files?.[0];
            setError("");
            setFile(null);
            setPassword("");
            if (!selected) return;
            try {
              if (selected.size > 32_000_000) throw new Error("La copia supera el límite de 32 MB");
              setEncrypted(isEncryptedBackup(await selected.text()));
              setFile(selected);
            } catch {
              setError("Archivo demasiado grande o JSON no válido");
            }
          }}
        />
      </label>
      {encrypted && (
        <label className="block text-sm">
          Contraseña de la copia
          <input
            type="password"
            required
            autoComplete="current-password"
            className={fieldClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      )}
      {file && (
        <>
          <p className="text-sm text-stone">
            Restaurar sustituye el evento con el mismo identificador. Las copias antiguas sin cifrar
            también son compatibles.
          </p>
          <Btn type="submit" disabled={busy}>
            {busy ? "Restaurando…" : "Restaurar evento"}
          </Btn>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
