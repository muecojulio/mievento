import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Btn } from "@/components/mievento/ui";
import { downloadBlob } from "@/lib/mievento/pass";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CARD_HEIGHT,
  CARD_WIDTH,
  clampPoint,
  clearPositions,
  defaultLayout,
  loadPositions,
  mapKey,
  mergeLayout,
  savePositions,
  type Point,
  type TablePositions,
} from "@/lib/mievento/table-map";
import type { TableGroup } from "@/lib/mievento/tables";

type Drag = { key: string; offsetX: number; offsetY: number };

/**
 * Croquis del salón: arrastra las mesas y descarga el plano como PNG.
 * Las posiciones viven en localStorage; la imagen se dibuja en un canvas
 * local, sin librerías nuevas, sin red y sin subir la lista a ningún lado.
 */
export function TableMap({ eventId, groups, couple }: { eventId: string; groups: TableGroup[]; couple: string }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const positionsRef = useRef<TablePositions>({});
  const [positions, setPositions] = useState<TablePositions>(() => mergeLayout(groups, loadPositions(eventId)));
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  useEffect(() => {
    setPositions(mergeLayout(groups, loadPositions(eventId)));
  }, [eventId, groups]);

  function scale(event: ReactPointerEvent<HTMLDivElement>): { x: number; y: number } | null {
    const board = boardRef.current;
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: (event.clientX - rect.left) * (BOARD_WIDTH / rect.width),
      y: (event.clientY - rect.top) * (BOARD_HEIGHT / rect.height),
    };
  }

  function startDrag(event: ReactPointerEvent<HTMLDivElement>, key: string) {
    const point = scale(event);
    const current = positionsRef.current[key] ?? { x: 0, y: 0 };
    if (!point) return;
    dragRef.current = { key, offsetX: point.x - current.x, offsetY: point.y - current.y };
    setDragging(key);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* navegador sin captura de puntero */
    }
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const point = scale(event);
    if (!drag || !point) return;
    const next = clampPoint({ x: point.x - drag.offsetX, y: point.y - drag.offsetY });
    setPositions((previous) => ({ ...previous, [drag.key]: next }));
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(null);
    savePositions(eventId, positionsRef.current);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ya se liberó */
    }
  }

  function nudge(key: string, event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 40 : 10;
    const delta: Point = {
      x: event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
      y: event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
    };
    if (!delta.x && !delta.y) return;
    event.preventDefault();
    setPositions((previous) => {
      const next = { ...previous, [key]: clampPoint({ x: (previous[key]?.x ?? 0) + delta.x, y: (previous[key]?.y ?? 0) + delta.y }) };
      savePositions(eventId, next);
      return next;
    });
  }

  function reset() {
    clearPositions(eventId);
    setPositions(defaultLayout(groups));
  }

  async function download() {
    const canvas = document.createElement("canvas");
    const ratio = 2;
    canvas.width = BOARD_WIDTH * ratio;
    canvas.height = BOARD_HEIGHT * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#F4EFE6";
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    ctx.fillStyle = "#8C5A32";
    ctx.font = "bold 14px Arial, sans-serif";
    ctx.fillText("MI EVENTO · CROQUIS DE MESAS", 24, 28);
    ctx.fillStyle = "#1C1915";
    ctx.font = "bold 26px Arial, sans-serif";
    ctx.fillText(couple, 24, 56, BOARD_WIDTH - 48);
    for (const group of groups) {
      const point: Point = positionsRef.current[mapKey(group.table)] ?? { x: 0, y: 0 };
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(point.x, point.y, CARD_WIDTH, CARD_HEIGHT, 12);
      else ctx.rect(point.x, point.y, CARD_WIDTH, CARD_HEIGHT);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#DDD4C6";
      ctx.stroke();
      ctx.fillStyle = "#1C1915";
      ctx.font = "bold 18px Arial, sans-serif";
      ctx.fillText(group.table, point.x + 12, point.y + 30, CARD_WIDTH - 24);
      ctx.font = "14px Arial, sans-serif";
      ctx.fillStyle = "#2F6B45";
      ctx.fillText(`${group.admitted} de ${group.invitations} invitaciones`, point.x + 12, point.y + 56, CARD_WIDTH - 24);
      ctx.fillStyle = "#5C574F";
      ctx.fillText(`${group.insidePeople} de ${group.expectedPeople} personas dentro`, point.x + 12, point.y + 80, CARD_WIDTH - 24);
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob) downloadBlob(blob, `croquis-mesas-${eventId}.png`);
  }

  return (
    <section className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-stone">Arrastra cada mesa al lugar que tendrá en el salón. El acomodo se guarda en esta tablet.</p>
        <div className="flex flex-wrap gap-2">
          <Btn variant="ghost" onClick={() => void download()} disabled={groups.length === 0}>
            Descargar croquis
          </Btn>
          <Btn variant="quiet" onClick={reset} disabled={groups.length === 0}>
            Reacomodar
          </Btn>
        </div>
      </div>
      <div
        ref={boardRef}
        className="relative mt-3 w-full touch-none overflow-hidden rounded-3xl border border-line bg-paper-2"
        style={{ aspectRatio: `${BOARD_WIDTH} / ${BOARD_HEIGHT}` }}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 px-3 pt-2">
          <p className="text-[10px] font-medium tracking-wide text-brass sm:text-xs">MI EVENTO · CROQUIS</p>
          <p className="truncate text-xs font-medium text-ink sm:text-sm">{couple}</p>
        </div>
        {groups.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-stone">
            No hay mesas que mostrar con este filtro.
          </p>
        ) : (
          groups.map((group) => {
            const key = mapKey(group.table);
            const point = positions[key] ?? { x: 0, y: 0 };
            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                aria-label={`Mesa ${group.table}, arrastra para acomodar`}
                onPointerDown={(event) => startDrag(event, key)}
                onKeyDown={(event) => nudge(key, event)}
                className={`absolute cursor-grab touch-none rounded-2xl border border-line bg-paper p-2 shadow-sm ${dragging === key ? "z-10 cursor-grabbing border-brass" : ""}`}
                style={{
                  left: `${(point.x / BOARD_WIDTH) * 100}%`,
                  top: `${(point.y / BOARD_HEIGHT) * 100}%`,
                  width: `${(CARD_WIDTH / BOARD_WIDTH) * 100}%`,
                  minHeight: `${(CARD_HEIGHT / BOARD_HEIGHT) * 100}%`,
                }}
              >
                <p className="truncate text-xs font-medium sm:text-sm">{group.table}</p>
                <p className="mt-1 text-[10px] tabular-nums text-sage sm:text-xs">
                  {group.admitted}/{group.invitations} pases
                </p>
                <p className="text-[10px] tabular-nums text-stone sm:text-xs">
                  {group.insidePeople}/{group.expectedPeople} personas
                </p>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
