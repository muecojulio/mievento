import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LayoutDashboard, ScanLine, Ticket, Users } from "lucide-react";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={className} aria-hidden="true">
      <path d="M4 28h56" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="42" cy="16" r="6.5" />
    </svg>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ink" | "ghost" | "sage" | "quiet";
};

export function Btn({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-transform duration-150 ease-out active:not-disabled:scale-[0.96] disabled:opacity-45",
        variant === "primary" && "bg-brass text-paper",
        variant === "ink" && "bg-ink text-paper",
        variant === "sage" && "bg-sage text-paper",
        variant === "ghost" && "border border-line bg-paper text-ink",
        variant === "quiet" && "bg-transparent px-3 text-ink-soft",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

export const fieldClass =
  "w-full min-h-11 rounded-xl border border-line bg-paper px-3 text-base text-ink outline-none transition-colors duration-150 focus:border-brass";

export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-4 py-1 text-left"
    >
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-sm text-stone">{hint}</span> : null}
      </span>
      <span
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-brass" : "bg-line",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-6 rounded-full bg-paper transition-transform duration-200",
            checked && "translate-x-5",
          )}
        />
      </span>
    </button>
  );
}

export function usePhotoUrl(blob: Blob | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

export function Monogram({ groom, bride }: { groom: string; bride: string }) {
  const letters = `${groom.trim().charAt(0) || ""}${bride.trim().charAt(0) || ""}`.toUpperCase();
  return (
    <div className="flex h-full w-full items-center justify-center bg-paper-2 text-ink">
      <div className="text-center">
        <Mark className="mx-auto mb-2 h-8 w-12 text-brass" />
        <p className="font-display text-4xl">{letters || "ME"}</p>
      </div>
    </div>
  );
}

export function EventNav({ eventId }: { eventId: string }) {
  const items = [
    { to: "/evento/$eventId", label: "Tablero", icon: LayoutDashboard, exact: true },
    { to: "/evento/$eventId/escaner", label: "Escanear", icon: ScanLine, exact: false },
    { to: "/evento/$eventId/invitados", label: "Invitados", icon: Users, exact: false },
    { to: "/evento/$eventId/pases", label: "Pases", icon: Ticket, exact: false },
  ] as const;
  return (
    <>
      <aside className="hidden border-r border-line bg-paper md:flex md:flex-col md:gap-2 md:px-4 md:py-6">
        <Link to="/" className="mb-6 flex items-center gap-2 px-2 text-ink">
          <Mark className="h-7 w-10 text-brass" />
          <span className="font-display text-xl">Mi Evento</span>
        </Link>
        {items.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            params={{ eventId }}
            activeOptions={{ exact: item.exact }}
            className="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-medium transition-colors duration-150"
            activeProps={{ className: "bg-ink text-paper" }}
            inactiveProps={{ className: "text-ink-soft" }}
          >
            <item.icon className="size-5" strokeWidth={1.75} />
            {item.label}
          </Link>
        ))}
      </aside>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-4 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1">
          {items.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              params={{ eventId }}
              activeOptions={{ exact: item.exact }}
              className="flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium"
              activeProps={{ className: "text-brass" }}
              inactiveProps={{ className: "text-stone" }}
            >
              <item.icon className="size-5" strokeWidth={1.75} />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}

export function OnlineNote() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  if (online) return null;
  return (
    <p className="rounded-2xl border border-line bg-paper-2 px-4 py-3 text-sm text-ink-soft">
      Sin internet. El acceso sigue funcionando en esta tablet.
    </p>
  );
}

export function useObjectNote() {
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 4200);
    return () => window.clearTimeout(id);
  }, [note]);
  return [note, setNote] as const;
}
