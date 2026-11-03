import { useEffect, useMemo, useState } from "react";
import { DoorOpen, Link2, Plus, ShieldAlert, ShieldCheck, Trash2, WifiOff } from "lucide-react";
import { Btn, cn, fieldClass, Switch, useOnlineStatus } from "@/components/mievento/ui";
import {
  defaultDoors,
  doorRuleLabel,
  doorSummaries,
  effectiveDoorMode,
  effectiveDoorRule,
  getDeviceId,
  MAX_DOORS,
  normalizeDoors,
  setTabletDoorId,
  useTabletDoor,
} from "@/lib/mievento/doors";
import { peopleLabel } from "@/lib/mievento/format";
import { announceDoorClaim, useSyncSnapshot } from "@/lib/mievento/local-sync";
import { configureEventDoors } from "@/lib/mievento/store";
import type { DoorMode, DoorRule, EventDoor, Guest, WeddingEvent } from "@/lib/mievento/types";

export function DoorProtectionBanner({
  event,
  onOpenSetup,
  onConnectTablets,
}: {
  event: WeddingEvent;
  onOpenSetup?: () => void;
  onConnectTablets?: () => void;
}) {
  const online = useOnlineStatus();
  const sync = useSyncSnapshot();
  const mode = effectiveDoorMode(event);
  const rule = effectiveDoorRule(event);
  const doors = useMemo(() => normalizeDoors(event.doors), [event.doors]);
  const tabletDoor = useTabletDoor(event);

  useEffect(() => {
    announceDoorClaim({
      deviceId: getDeviceId(),
      doorId: tabletDoor?.id ?? null,
      doorName: tabletDoor?.name ?? null,
    });
  }, [tabletDoor?.id, tabletDoor?.name]);

  const linkedForEvent = sync.isConnected && sync.eventId === event.id;
  const duplicateTabletOnSameDoor =
    mode === "asignada" &&
    linkedForEvent &&
    tabletDoor != null &&
    sync.peerDoors.some(
      (peer) => peer.deviceId !== getDeviceId() && peer.doorId === tabletDoor.id,
    );

  if (mode === "unica") {
    if (online) return null;
    return (
      <section
        role="alert"
        data-testid="door-single-offline-alert"
        className="mt-4 rounded-3xl border border-brass/50 bg-paper-2 p-4 text-sm text-ink"
      >
        <div className="flex items-start gap-3">
          <WifiOff className="mt-0.5 size-5 shrink-0 text-brass" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              Sin internet · Si usas diferentes puertas, configura protección sin red o conéctate a internet
            </p>
            <p className="mt-1 text-stone">
              En una sola tablet ningún código QR pasa dos veces. Si hay más de una puerta y no están
              conectadas, <strong className="font-medium text-ink">tiene que haber internet</strong> (o
              activar <strong className="font-medium text-ink">Puerta asignada por QR</strong> / enlace
              local) para que un mismo código no se pueda pasar en otra puerta.
            </p>
            {onOpenSetup ? (
              <div className="mt-3">
                <Btn variant="ghost" onClick={onOpenSetup}>
                  <DoorOpen className="size-4" />
                  Proteger varias puertas sin internet
                </Btn>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  if (mode === "asignada") {
    if (!tabletDoor) {
      return (
        <section
          role="alert"
          data-testid="door-select-prompt"
          className="mt-4 rounded-3xl border border-brass bg-paper-2 p-4"
        >
          <div className="flex items-start gap-3">
            <DoorOpen className="mt-0.5 size-5 shrink-0 text-brass" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-2xl text-ink">Elige qué puerta controla esta tablet</p>
              <p className="mt-1 text-sm text-stone">
                Para evitar sin internet que 1 código QR se pase en diferentes puertas, cada tablet se
                encarga de una sola entrada y rechaza los pases de las demás.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {doors.map((door) => (
                  <Btn
                    key={door.id}
                    variant="ink"
                    data-testid={`pick-door-${door.id}`}
                    onClick={() => setTabletDoorId(event.id, door.id)}
                  >
                    {door.name}
                  </Btn>
                ))}
              </div>
              <p className="mt-2 text-xs text-stone">
                Importante: usa una sola tablet por puerta. No elijas la misma puerta en dos tablets desconectadas.
              </p>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section
        data-testid="door-assigned-active"
        className={cn(
          "mt-4 rounded-3xl border p-4",
          duplicateTabletOnSameDoor
            ? "border-alert bg-alert-soft text-ink"
            : "border-sage/40 bg-sage-soft text-ink",
        )}
      >
        <div className="flex items-start gap-3">
          {duplicateTabletOnSameDoor ? (
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-alert" />
          ) : (
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-sage" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {duplicateTabletOnSameDoor
                ? `Atención: dos tablets tienen elegida ${tabletDoor.name}`
                : `Protección sin internet activa · Esta tablet es ${tabletDoor.name}`}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {duplicateTabletOnSameDoor
                ? "Cambia una de las tablets a otra puerta para que un mismo QR no pueda validarse en ambas si se pierde la red."
                : `Solo autoriza códigos asignados a ${tabletDoor.name} (${doorRuleLabel(rule)}). Cualquier intento de usar un código en otra puerta se rechaza al instante, incluso sin internet ni Wi-Fi.`}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {doors.map((door) => (
                <button
                  key={door.id}
                  type="button"
                  data-testid={`switch-door-${door.id}`}
                  onClick={() => setTabletDoorId(event.id, door.id)}
                  className={cn(
                    "min-h-10 rounded-full px-3.5 text-xs font-medium transition-colors",
                    tabletDoor.id === door.id
                      ? "bg-ink text-paper"
                      : "border border-ink/20 bg-paper text-ink-soft",
                  )}
                >
                  {door.name}
                </button>
              ))}
              {onOpenSetup ? (
                <button
                  type="button"
                  onClick={onOpenSetup}
                  className="min-h-10 px-2 text-xs font-medium text-brass"
                >
                  Ajustar puertas
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // mode === "enlace"
  if (linkedForEvent) {
    return (
      <section
        data-testid="door-linked-active"
        className="mt-4 rounded-3xl border border-sage/40 bg-sage-soft p-4 text-ink"
      >
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-sage" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              Puertas sincronizadas ({sync.connectedCount + 1} activas)
              {tabletDoor ? ` · Esta tablet: ${tabletDoor.name}` : ""}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Bloqueo en vivo activo entre puertas: en cuanto un código QR ingresa en una entrada,
              queda bloqueado de inmediato en todas las demás sin necesitar internet.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {doors.map((door) => (
                <button
                  key={door.id}
                  type="button"
                  onClick={() => setTabletDoorId(event.id, door.id)}
                  className={cn(
                    "min-h-10 rounded-full px-3.5 text-xs font-medium transition-colors",
                    tabletDoor?.id === door.id
                      ? "bg-ink text-paper"
                      : "border border-ink/20 bg-paper text-ink-soft",
                  )}
                >
                  {door.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // mode === "enlace" y SIN conexión entre puertas -> Aviso obligatorio claro
  return (
    <section
      role="alert"
      data-testid="door-internet-warning"
      className="mt-4 rounded-3xl border border-alert bg-alert-soft p-4 text-ink"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-alert" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-alert">
            Aviso: tiene que haber internet o enlace activo entre puertas para que 1 código QR no pase en diferentes entradas
          </p>
          <p className="mt-1.5 text-sm text-ink-soft">
            {online
              ? "Este evento permite entrar por cualquier puerta, pero esta tablet no está conectada con las demás puertas. Enlaza las tablets ahora (por red local o internet) o cambia a «Puerta asignada por QR» para bloquearlo sin internet."
              : "No hay conexión a internet ni enlace local con las otras puertas. En entrada libre una tablet desconectada no puede saber si el mismo QR ya se pasó en otra puerta: tiene que haber internet (o enlazar las tablets / activar «Puerta asignada por QR») para que esto no pase."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {onConnectTablets ? (
              <Btn variant="ink" onClick={onConnectTablets}>
                <Link2 className="size-4" />
                Conectar tablets
              </Btn>
            ) : null}
            <Btn
              variant="ghost"
              onClick={() =>
                void configureEventDoors(event.id, {
                  doorMode: "asignada",
                  doors: doors.length >= 2 ? doors : defaultDoors(2),
                  doorRule: event.doorRule ?? "lado",
                  strictDoorLink: event.strictDoorLink ?? true,
                })
              }
            >
              <DoorOpen className="size-4" />
              Activar Puerta asignada (sin internet)
            </Btn>
            {onOpenSetup ? (
              <Btn variant="quiet" onClick={onOpenSetup}>
                Opciones
              </Btn>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export function DoorSetupSection({
  event,
  guests,
  onConnectTablets,
}: {
  event: WeddingEvent;
  guests: Guest[];
  onConnectTablets?: () => void;
}) {
  const mode = effectiveDoorMode(event);
  const rule = effectiveDoorRule(event);
  const savedDoors = useMemo(() => {
    const clean = normalizeDoors(event.doors);
    return clean.length >= 2 ? clean : defaultDoors(2);
  }, [event.doors]);
  const tabletDoor = useTabletDoor(event);
  const sync = useSyncSnapshot();
  const online = useOnlineStatus();
  const [newDoorName, setNewDoorName] = useState("");
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});

  const summaries = useMemo(
    () =>
      doorSummaries(
        {
          id: event.id,
          doors: savedDoors,
          doorMode: mode === "unica" ? "asignada" : mode,
          doorRule: rule,
        },
        guests,
      ),
    [event.id, savedDoors, mode, rule, guests],
  );

  async function selectMode(nextMode: DoorMode) {
    await configureEventDoors(event.id, {
      doorMode: nextMode,
      doors: savedDoors,
      doorRule: rule,
      strictDoorLink: event.strictDoorLink ?? true,
    });
  }

  async function selectRule(nextRule: DoorRule) {
    await configureEventDoors(event.id, {
      doorMode: mode === "unica" ? "asignada" : mode,
      doors: savedDoors,
      doorRule: nextRule,
      strictDoorLink: event.strictDoorLink ?? true,
    });
  }

  async function addDoor() {
    if (savedDoors.length >= MAX_DOORS) return;
    const nextIndex = savedDoors.length + 1;
    const label = newDoorName.trim() || `Puerta ${nextIndex}`;
    const nextDoors: EventDoor[] = [
      ...savedDoors,
      { id: `p${Date.now().toString(36).slice(-4)}${nextIndex}`, name: label },
    ];
    setNewDoorName("");
    await configureEventDoors(event.id, {
      doorMode: mode === "unica" ? "asignada" : mode,
      doors: nextDoors,
      doorRule: rule,
      strictDoorLink: event.strictDoorLink ?? true,
    });
  }

  async function renameDoor(doorId: string, rawName: string) {
    const trimmed = rawName.trim();
    if (!trimmed) return;
    const nextDoors = savedDoors.map((d) => (d.id === doorId ? { ...d, name: trimmed } : d));
    await configureEventDoors(event.id, {
      doorMode: mode,
      doors: nextDoors,
      doorRule: rule,
      strictDoorLink: event.strictDoorLink ?? true,
    });
  }

  async function removeDoor(doorId: string) {
    if (savedDoors.length <= 2) return;
    const nextDoors = savedDoors.filter((d) => d.id !== doorId);
    if (tabletDoor?.id === doorId) setTabletDoorId(event.id, null);
    await configureEventDoors(event.id, {
      doorMode: mode,
      doors: nextDoors,
      doorRule: rule,
      strictDoorLink: event.strictDoorLink ?? true,
    });
  }

  const modeCards: Array<{
    id: DoorMode;
    title: string;
    badge: string;
    desc: string;
  }> = [
    {
      id: "unica",
      title: "1 sola puerta",
      badge: "1 tablet",
      desc: "Una única entrada. El código se bloquea en esta tablet al primer escaneo.",
    },
    {
      id: "asignada",
      title: "Puerta asignada por QR",
      badge: "100 % sin internet ni Wi-Fi",
      desc: "Cada código QR solo es válido en su puerta asignada (1 tablet por puerta). Imposible pasar el mismo QR en dos puertas aunque estén en modo avión.",
    },
    {
      id: "enlace",
      title: "Cualquier puerta (enlazadas)",
      badge: "Wi-Fi local o internet",
      desc: "El invitado entra por cualquier puerta. Bloquea códigos al instante entre tablets conectadas; si no hay enlace ni internet, muestra aviso y detiene el paso.",
    },
  ];

  return (
    <section
      id="control-puertas"
      data-testid="door-setup-section"
      className="mt-8 rounded-3xl border border-line p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-medium tracking-wide text-brass uppercase">
            Seguridad anti-doble acceso
          </p>
          <h2 className="mt-1 font-display text-2xl">Control de diferentes puertas</h2>
        </div>
      </div>
      <p className="mt-2 text-sm text-stone">
        Elige cómo operarán las entradas para que un mismo código QR (o captura de pantalla) nunca
        pueda usarse en dos puertas distintas.
      </p>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        {modeCards.map((item) => {
          const active = mode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`door-mode-${item.id}`}
              aria-pressed={active}
              onClick={() => void selectMode(item.id)}
              className={cn(
                "flex flex-col justify-between rounded-2xl border p-3.5 text-left transition-colors",
                active
                  ? "border-brass bg-paper-2 text-ink"
                  : "border-line bg-paper text-ink-soft hover:border-brass/60",
              )}
            >
              <div>
                <span
                  className={cn(
                    "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                    active ? "bg-brass text-paper" : "bg-paper-2 text-stone",
                  )}
                >
                  {item.badge}
                </span>
                <p className="mt-2 font-display text-lg text-ink">{item.title}</p>
                <p className="mt-1 text-xs text-stone">{item.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {mode !== "unica" ? (
        <div className="mt-5 grid gap-5 border-t border-line pt-5">
          <div>
            <p className="text-sm font-medium text-ink">Puertas del evento ({savedDoors.length})</p>
            <p className="mt-0.5 text-xs text-stone">
              Nombra cada acceso (ej. Puerta 1, Acceso Jardín) y después elige cuál controla esta
              tablet.
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {savedDoors.map((door) => {
                const draft = editingNames[door.id] ?? door.name;
                const stat = summaries.find((s) => s.door.id === door.id);
                return (
                  <li key={door.id} className="rounded-2xl border border-line bg-paper p-3">
                    <div className="flex items-center gap-2">
                      <input
                        className="min-h-10 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 text-sm font-medium text-ink outline-none focus:border-brass"
                        value={draft}
                        aria-label={`Nombre de ${door.name}`}
                        onChange={(e) =>
                          setEditingNames((prev) => ({ ...prev, [door.id]: e.target.value }))
                        }
                        onBlur={() => {
                          if (draft.trim() && draft.trim() !== door.name) {
                            void renameDoor(door.id, draft);
                          }
                        }}
                      />
                      {savedDoors.length > 2 ? (
                        <button
                          type="button"
                          aria-label={`Quitar ${door.name}`}
                          onClick={() => void removeDoor(door.id)}
                          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-stone hover:text-alert"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </div>
                    {stat ? (
                      <p className="mt-2 text-xs tabular-nums text-stone">
                        {mode === "asignada"
                          ? `${stat.invitations} pases asignados (${peopleLabel(stat.expectedPeople)}) · ${stat.admitted} dentro`
                          : `${stat.admitted} ingresos registrados aquí (${peopleLabel(stat.insidePeople)})`}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {savedDoors.length < MAX_DOORS ? (
              <form
                className="mt-2.5 flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addDoor();
                }}
              >
                <input
                  className={cn(fieldClass, "min-w-44 flex-1")}
                  value={newDoorName}
                  onChange={(e) => setNewDoorName(e.target.value)}
                  placeholder={`Ej. Puerta ${savedDoors.length + 1} o Acceso Norte`}
                  aria-label="Nueva puerta"
                />
                <Btn type="submit" variant="ghost">
                  <Plus className="size-4" />
                  Agregar puerta
                </Btn>
              </form>
            ) : null}
          </div>

          {mode === "asignada" ? (
            <div>
              <p className="text-sm font-medium text-ink">
                ¿Cómo asignar la puerta de cada código QR?
              </p>
              <p className="mt-0.5 text-xs text-stone">
                Los invitados con puerta escrita en el Excel o editada manualmente siempre conservan
                esa puerta. Para el resto se aplica esta regla:
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {(
                  [
                    [
                      "lado",
                      "Por lado (Novio / Novia)",
                      "Novio en la primera puerta y Novia en la segunda. Funciona incluso con códigos QR ya impresos o enviados.",
                    ],
                    [
                      "mesa",
                      "Por mesa",
                      "Todos los invitados de una misma mesa entran siempre por la misma puerta.",
                    ],
                    [
                      "auto",
                      "Automático equitativo",
                      "Reparte los códigos en partes iguales de forma matemática; cada pase indica su puerta.",
                    ],
                    [
                      "manual",
                      "Manual o columna Excel",
                      "Usa la columna «puerta» del Excel o lo que elijas en Invitados (el resto va a la primera puerta).",
                    ],
                  ] as const
                ).map(([id, title, hint]) => (
                  <button
                    key={id}
                    type="button"
                    data-testid={`door-rule-${id}`}
                    aria-pressed={rule === id}
                    onClick={() => void selectRule(id)}
                    className={cn(
                      "rounded-2xl border p-3 text-left transition-colors",
                      rule === id
                        ? "border-brass bg-paper-2 text-ink"
                        : "border-line bg-paper text-ink-soft",
                    )}
                  >
                    <p className="text-sm font-medium text-ink">{title}</p>
                    <p className="mt-1 text-xs text-stone">{hint}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-paper-2/60 p-3.5">
              <Switch
                checked={event.strictDoorLink !== false}
                onChange={(checked) =>
                  void configureEventDoors(event.id, {
                    doorMode: mode,
                    doors: savedDoors,
                    doorRule: rule,
                    strictDoorLink: checked,
                  })
                }
                label="Exigir conexión activa entre puertas al escanear"
                hint="Recomendado. Si se cae el enlace local y no hay internet, detiene el lector y muestra aviso para que un QR no pueda pasar en dos puertas."
              />
              {event.strictDoorLink === false && (!sync.isConnected || sync.eventId !== event.id) ? (
                <p role="alert" className="mt-2 text-xs font-medium text-alert">
                  Atención: sin este bloqueo y sin conexión/internet activa entre las tablets, un
                  mismo código QR podría aceptarse en otra puerta antes de sincronizar.
                </p>
              ) : null}
              {onConnectTablets ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Btn variant="ink" onClick={onConnectTablets}>
                    <Link2 className="size-4" />
                    {sync.isConnected && sync.eventId === event.id
                      ? "Ver conexión de puertas"
                      : "Conectar tablets ahora"}
                  </Btn>
                  <span className="text-xs text-stone">
                    {sync.isConnected && sync.eventId === event.id
                      ? sync.status
                      : online
                        ? "Sin puertas enlazadas todavía"
                        : "Sin internet · usa misma red Wi-Fi/hotspot o cambia a Puerta asignada"}
                  </span>
                </div>
              ) : null}
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-ink">¿En qué puerta está esta tablet?</p>
            <p className="mt-0.5 text-xs text-stone">
              Este ajuste se guarda solo en esta tablet. Restaura la copia del evento en las otras
              tablets y elige en cada una su propia puerta.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {savedDoors.map((door) => (
                <button
                  key={door.id}
                  type="button"
                  data-testid={`tablet-door-${door.id}`}
                  aria-pressed={tabletDoor?.id === door.id}
                  onClick={() => setTabletDoorId(event.id, door.id)}
                  className={cn(
                    "min-h-11 rounded-full px-4 text-sm font-medium transition-colors",
                    tabletDoor?.id === door.id
                      ? "bg-ink text-paper"
                      : "border border-line bg-paper text-ink-soft",
                  )}
                >
                  {door.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
