import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  CloudSun,
  Droplets,
  MapPin,
  Navigation,
  RefreshCw,
  Sunset,
  Thermometer,
  Wind,
} from "lucide-react";
import { cn } from "@/components/mievento/ui";
import { formatLongDate, formatStamp } from "@/lib/mievento/format";
import {
  countdownLabel,
  daysUntil,
  fetchEventWeather,
  fetchMxHolidays,
  holidayOn,
  mapsUrls,
  osmEmbedUrl,
  validCoords,
  weatherLine,
  type PublicHoliday,
  type WeatherResult,
} from "@/lib/mievento/public-apis";
import type { WeddingEvent } from "@/lib/mievento/types";

/**
 * Piezas de interfaz de las ayudas en línea (ver public-apis.ts y APIS.md).
 * Todas son opcionales: sin internet o sin ubicación exacta no bloquean nada
 * y el lector de la puerta sigue funcionando igual.
 */

type PlaceLike = {
  place?: string;
  lat?: number | null;
  lon?: number | null;
  date?: string;
  time?: string;
};

function useEventWeather(place: PlaceLike, enabled = true) {
  const lat = place.lat ?? null;
  const lon = place.lon ?? null;
  const date = place.date ?? "";
  const time = place.time || "18:00";
  const [result, setResult] = useState<WeatherResult | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    (force = false) => {
      if (!enabled || !date) return;
      setLoading(true);
      void fetchEventWeather({ lat, lon, date, time, force })
        .then(setResult)
        .catch(() => setResult({ kind: "unavailable" }))
        .finally(() => setLoading(false));
    },
    [enabled, lat, lon, date, time],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  return { result, loading, refresh: () => load(true) };
}

export function useHoliday(date: string): PublicHoliday | null {
  const [holiday, setHoliday] = useState<PublicHoliday | null>(null);
  useEffect(() => {
    let alive = true;
    setHoliday(null);
    if (!date) return;
    void fetchMxHolidays(date)
      .then((list) => {
        if (alive && list) setHoliday(holidayOn(list, date));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [date]);
  return holiday;
}

/** Aviso al elegir la fecha: si cae en feriado oficial de México (Nager.Date). */
export function HolidayHint({ date, className }: { date: string; className?: string }) {
  const holiday = useHoliday(date);
  if (!holiday) return null;
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-2xl border border-line bg-paper-2 px-3 py-2.5 text-sm text-ink-soft",
        className,
      )}
      role="note"
    >
      <CalendarDays className="mt-0.5 size-4 shrink-0 text-brass" />
      <span>
        Ese día es feriado en México: <strong className="font-medium text-ink">{holiday.localName || holiday.name}</strong>.
        Puede ser puente para varios invitados — o día de más tráfico camino al lugar.
      </span>
    </p>
  );
}

/** Enlaces "cómo llegar" sin llave (Google Maps, Waze, Apple Maps, OpenStreetMap). */
export function DirectionsLinks({
  place,
  dark = false,
  className,
}: {
  place: PlaceLike;
  dark?: boolean;
  className?: string;
}) {
  const urls = mapsUrls({ place: place.place, lat: place.lat, lon: place.lon });
  if (!urls) return null;
  const chip = dark
    ? "border-paper/40 text-paper"
    : "border-line bg-paper text-ink";
  const items = [
    { label: "Google Maps", href: urls.google },
    { label: "Waze", href: urls.waze },
    { label: "Apple Maps", href: urls.apple },
    { label: "OpenStreetMap", href: urls.osm },
  ];
  return (
    <div className={className}>
      <p className={cn("flex items-center gap-1.5 text-xs font-medium", dark ? "text-paper-2" : "text-stone")}>
        <Navigation className="size-3.5" />
        Cómo llegar
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <a
            key={item.label}
            href={item.href}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium sm:min-h-9",
              chip,
            )}
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}

/** Línea breve de clima para el pase del invitado y su Wallet. Si no hay datos, no estorba. */
export function PassWeatherLine({ pass, dark = false }: { pass: PlaceLike; dark?: boolean }) {
  const { result } = useEventWeather(pass, validCoords(pass.lat, pass.lon));
  if (!result || result.kind !== "ok") return null;
  const firstAdvice = result.weather.advice.find((line) => !line.startsWith("Atardecer"));
  return (
    <div className={cn("text-sm", dark ? "text-paper-2" : "text-ink-soft")}>
      <p className="flex items-center gap-1.5">
        <CloudSun className={cn("size-4 shrink-0", dark ? "text-paper-2" : "text-brass")} />
        <span>
          Clima ese día: {weatherLine(result.weather, pass.time)}
          {result.stale ? " (último guardado)" : ""}
        </span>
      </p>
      {firstAdvice ? <p className="mt-1 pl-[1.375rem]">{firstAdvice}</p> : null}
      <p className={cn("mt-1 pl-[1.375rem] text-xs", dark ? "text-paper-2/80" : "text-stone")}>
        Pronóstico de Open-Meteo; puede cambiar conforme se acerque la fecha.
      </p>
    </div>
  );
}

/**
 * Tarjeta del tablero: cuenta regresiva, feriado, clima del día, mapa y rutas.
 * Refuerza la preparación del evento; no participa en la validación de pases.
 */
export function EventInsights({ event }: { event: WeddingEvent }) {
  const place: PlaceLike = {
    place: event.place,
    lat: event.placeLat ?? null,
    lon: event.placeLon ?? null,
    date: event.date,
    time: event.time,
  };
  const hasCoords = validCoords(place.lat, place.lon);
  const { result, loading, refresh } = useEventWeather(place);
  const [showMap, setShowMap] = useState(false);
  const days = daysUntil(event.date);
  const embed = hasCoords ? osmEmbedUrl(place.lat as number, place.lon as number) : null;

  return (
    <section className="mt-4 rounded-3xl border border-line px-5 py-5" aria-label="Preparación del día">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">El día del evento</h2>
          <p className="mt-1 text-sm text-stone">
            {formatLongDate(event.date)}
            {event.time ? ` · ${event.time}` : ""}
            {days != null && !event.closed ? ` · ${countdownLabel(days)}` : ""}
          </p>
        </div>
        {result?.kind === "ok" || result?.kind === "unavailable" ? (
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-paper px-4 text-sm font-medium text-ink disabled:opacity-45 sm:min-h-9"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            Actualizar
          </button>
        ) : null}
      </div>

      <HolidayHint date={event.date} className="mt-3" />

      {!hasCoords ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-ink-soft">
          <MapPin className="mt-0.5 size-4 shrink-0 text-brass" />
          <span>
            Sin ubicación exacta todavía. En <strong className="font-medium">Editar evento</strong> busca el lugar
            para ver aquí el clima de ese día, el mapa y los botones de “cómo llegar” en cada pase. Es opcional:
            el lector no lo necesita y sigue funcionando sin internet.
          </span>
        </p>
      ) : null}

      {result?.kind === "ok" ? (
        <div className="mt-4">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-2 font-display text-3xl">
              <CloudSun className="size-7 text-brass" />
              {result.weather.label}
            </span>
            <span className="text-lg tabular-nums text-ink-soft">
              {result.weather.tempAtEvent != null
                ? `${Math.round(result.weather.tempAtEvent)}° a las ${event.time || "18:00"}`
                : result.weather.tempMin != null && result.weather.tempMax != null
                  ? `${Math.round(result.weather.tempMin)}°–${Math.round(result.weather.tempMax)}°`
                  : ""}
            </span>
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-soft">
            {result.weather.tempMin != null && result.weather.tempMax != null ? (
              <li className="inline-flex items-center gap-1.5 tabular-nums">
                <Thermometer className="size-4 text-stone" /> Mín. {Math.round(result.weather.tempMin)}° · Máx.{" "}
                {Math.round(result.weather.tempMax)}°
              </li>
            ) : null}
            {result.weather.rainProb != null ? (
              <li className="inline-flex items-center gap-1.5 tabular-nums">
                <Droplets className="size-4 text-stone" /> Lluvia {Math.round(result.weather.rainProb)}%
                {result.weather.rainMm != null && result.weather.rainMm > 0
                  ? ` (${result.weather.rainMm.toFixed(1)} mm)`
                  : ""}
              </li>
            ) : null}
            {result.weather.windMax != null ? (
              <li className="inline-flex items-center gap-1.5 tabular-nums">
                <Wind className="size-4 text-stone" /> Viento hasta {Math.round(result.weather.windMax)} km/h
              </li>
            ) : null}
            {result.weather.sunset ? (
              <li className="inline-flex items-center gap-1.5 tabular-nums">
                <Sunset className="size-4 text-stone" /> Atardecer {result.weather.sunset}
              </li>
            ) : null}
          </ul>
          {result.weather.advice.length > 0 ? (
            <ul className="mt-3 grid gap-1.5 text-sm text-ink-soft">
              {result.weather.advice.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden="true" className="text-brass">·</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 text-xs text-stone">
            {result.stale ? "Mostrando el último pronóstico guardado en esta tablet. " : ""}
            Actualizado el {formatStamp(result.fetchedAt)}.
          </p>
        </div>
      ) : null}

      {result?.kind === "too-early" ? (
        <p className="mt-3 text-sm text-ink-soft">
          El pronóstico del clima (Open-Meteo) se publica 16 días antes: estará aquí a partir del{" "}
          <strong className="font-medium text-ink">{formatLongDate(result.availableOn)}</strong>. El mapa y las
          rutas de abajo ya sirven desde hoy.
        </p>
      ) : null}

      {result?.kind === "unavailable" && hasCoords ? (
        <p className="mt-3 text-sm text-ink-soft">
          Sin conexión por ahora, así que el clima no se pudo consultar. No afecta al evento: la lista, los pases
          y el lector siguen en esta tablet.
        </p>
      ) : null}

      {loading && !result ? <p className="mt-3 text-sm text-stone">Consultando el clima de ese día…</p> : null}

      <DirectionsLinks place={place} className="mt-4" />

      {embed ? (
        <div className="mt-4">
          {showMap ? (
            <>
              <iframe
                title={`Mapa de ${event.place || "el lugar del evento"}`}
                src={embed}
                loading="lazy"
                className="h-56 w-full rounded-2xl border border-line"
              />
              <p className="mt-1.5 text-xs text-stone">
                Mapa ©{" "}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-medium text-brass"
                >
                  OpenStreetMap contributors
                </a>
              </p>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowMap(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-paper px-4 text-sm font-medium text-ink sm:min-h-9"
            >
              <MapPin className="size-4 text-brass" />
              Ver mapa del lugar
            </button>
          )}
        </div>
      ) : null}

      <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-stone">
        Ayudas en línea sin llave ni cuenta — Clima: Open-Meteo (CC BY 4.0) · Lugares y mapa: © OpenStreetMap ·
        Feriados: Nager.Date. Solo salen de la tablet el lugar y la fecha del evento; la lista de invitados nunca
        se envía. Sin internet, esta tarjeta se queda en silencio y el acceso sigue igual.
      </p>
    </section>
  );
}
