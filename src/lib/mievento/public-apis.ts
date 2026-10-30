/**
 * Ayudas en línea opcionales para Mi Evento — APIs públicas SIN llave ni registro.
 *
 * Principios (no negociables, ver APIS.md):
 * - Solo refuerzan funciones que la app ya tiene: lugar/fecha del evento,
 *   clima del día, "cómo llegar" y calendario del pase/Wallet.
 * - NUNCA reciben datos de invitados: ni nombres, ni teléfonos, ni correos,
 *   ni tokens de pases. Lo único que sale del dispositivo es el texto del
 *   lugar que escribe quien organiza, sus coordenadas y la fecha del evento.
 * - Todo es opcional y con respaldo offline: si no hay internet, si la API
 *   tarda o si falla, la app sigue igual (lector, lista y Wallet no dependen
 *   de ninguna llamada de red). Las respuestas se cachean en el dispositivo.
 *
 * Fuentes (repositorios públicos de GitHub, catalogadas en public-apis/public-apis):
 * - Clima:      open-meteo/open-meteo      -> https://api.open-meteo.com (datos CC BY 4.0)
 * - Lugares:    komoot/photon (Apache-2.0) -> https://photon.komoot.io (datos © OpenStreetMap, ODbL)
 * - Feriados:   nager/Nager.Date (MIT)     -> https://date.nager.at
 * - Mapas/calendario: enlaces públicos sin llave (Google Maps, Waze, Apple Maps,
 *   OpenStreetMap, Google Calendar). Son URLs, no llamadas con credenciales.
 *
 * Este módulo no importa nada de la app a propósito: las funciones puras
 * (parsers, URLs, consejos) se prueban sin navegador ni red.
 */

export type Coords = { lat: number; lon: number };

export function validCoords(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

export function roundCoord(value: number, digits = 5): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/* ------------------------------------------------------------------ fechas */

function parseIsoDay(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function isoOf(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function todayIso(now = new Date()): string {
  return isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Días desde `fromIso` hasta `dateIso` (negativo si ya pasó). null si la fecha no es válida. */
export function daysUntil(dateIso: string, fromIso: string = todayIso()): number | null {
  const a = parseIsoDay(dateIso);
  const b = parseIsoDay(fromIso);
  if (!a || !b) return null;
  const ms = Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d);
  return Math.round(ms / 86_400_000);
}

export function addDaysIso(dateIso: string, days: number): string {
  const p = parseIsoDay(dateIso);
  if (!p) return dateIso;
  const date = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return isoOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Suma horas a un día+hora locales "flotantes" (sin zona), cuidando el cambio de día. */
export function addHoursToDateTime(
  dateIso: string,
  timeHm: string,
  hours: number,
): { date: string; time: string } {
  const p = parseIsoDay(dateIso);
  const [hRaw, minRaw] = (timeHm || "18:00").split(":").map(Number);
  const h = Number.isFinite(hRaw) ? hRaw : 18;
  const min = Number.isFinite(minRaw) ? minRaw : 0;
  if (!p) return { date: dateIso, time: timeHm || "18:00" };
  const date = new Date(Date.UTC(p.y, p.m - 1, p.d, h + hours, min));
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return {
    date: isoOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()),
    time: `${hh}:${mm}`,
  };
}

export function countdownLabel(days: number | null): string {
  if (days == null) return "";
  if (days === 0) return "¡Es hoy!";
  if (days === 1) return "Es mañana";
  if (days > 1) return `Faltan ${days} días`;
  if (days === -1) return "Fue ayer";
  return `Fue hace ${Math.abs(days)} días`;
}

/* -------------------------------------------------- red (con timeout y caché) */

const TIMEOUT_MS = 7000;

async function fetchJson(url: string, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("offline");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

type CacheEnvelope<T> = { at: number; value: T };

function readCache<T>(key: string, maxAgeMs: number): T | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > maxAgeMs) return null;
    return parsed.value ?? null;
  } catch {
    return null;
  }
}

function readCacheStale<T>(key: string): { value: T; at: number } | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.at !== "number" || parsed.value == null) return null;
    return { value: parsed.value, at: parsed.at };
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T) {
  try {
    if (typeof window === "undefined") return;
    const envelope: CacheEnvelope<T> = { at: Date.now(), value };
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    /* sin espacio: la ayuda en línea simplemente no se cachea */
  }
}

/* --------------------------------------- Photon (lugares, datos OpenStreetMap) */

export type PlaceSuggestion = {
  label: string;
  name: string;
  lat: number;
  lon: number;
  country: string;
};

function photonLabel(properties: Record<string, unknown>): string {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const name = text(properties.name);
  const street = [text(properties.street), text(properties.housenumber)].filter(Boolean).join(" ");
  const city = text(properties.city) || text(properties.town) || text(properties.village) || text(properties.county);
  const state = text(properties.state);
  const country = text(properties.country);
  const parts: string[] = [];
  for (const part of [name, street, city, state, country]) {
    if (part && !parts.some((seen) => seen.toLowerCase() === part.toLowerCase())) parts.push(part);
  }
  return parts.join(", ");
}

/** Interpreta la respuesta GeoJSON de Photon. Ojo: geometry.coordinates es [lon, lat]. */
export function parsePhoton(json: unknown): PlaceSuggestion[] {
  if (!json || typeof json !== "object") return [];
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  const out: PlaceSuggestion[] = [];
  for (const feature of features) {
    if (!feature || typeof feature !== "object") continue;
    const f = feature as { properties?: unknown; geometry?: unknown };
    const properties = (f.properties ?? {}) as Record<string, unknown>;
    const coordinates = (f.geometry as { coordinates?: unknown } | null)?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
    const lon = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    if (!validCoords(lat, lon)) continue;
    const label = photonLabel(properties);
    if (!label) continue;
    out.push({
      label,
      name: typeof properties.name === "string" ? properties.name.trim() : label,
      lat: roundCoord(lat),
      lon: roundCoord(lon),
      country: typeof properties.country === "string" ? properties.country.trim() : "",
    });
    if (out.length >= 6) break;
  }
  return out;
}

export function photonSearchUrl(query: string): string {
  const params = new URLSearchParams({ q: query.trim(), limit: "6" });
  return `https://photon.komoot.io/api/?${params.toString()}`;
}

/**
 * Busca el lugar del evento. Solo se envía el texto que escribió quien
 * organiza — jamás datos de la lista de invitados.
 */
export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const json = await fetchJson(photonSearchUrl(trimmed));
  return parsePhoton(json);
}

/* ------------------------------------------------ Open-Meteo (clima y zona) */

/** Open-Meteo publica pronóstico hasta 16 días; antes de eso avisamos cuándo estará. */
export const FORECAST_MAX_DAYS = 16;

const WMO_ES: Record<number, string> = {
  0: "Despejado",
  1: "Mayormente despejado",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Niebla",
  48: "Niebla helada",
  51: "Llovizna ligera",
  53: "Llovizna",
  55: "Llovizna intensa",
  56: "Llovizna helada",
  57: "Llovizna helada intensa",
  61: "Lluvia ligera",
  63: "Lluvia",
  65: "Lluvia intensa",
  66: "Lluvia helada",
  67: "Lluvia helada intensa",
  71: "Nieve ligera",
  73: "Nieve",
  75: "Nieve intensa",
  77: "Granos de nieve",
  80: "Chubascos ligeros",
  81: "Chubascos",
  82: "Chubascos intensos",
  85: "Chubascos de nieve",
  86: "Chubascos de nieve intensos",
  95: "Tormenta",
  96: "Tormenta con granizo",
  99: "Tormenta con granizo fuerte",
};

export function wmoLabelEs(code: number | null | undefined): string {
  if (code == null || !Number.isFinite(code)) return "Clima por confirmar";
  return WMO_ES[Math.round(code)] ?? "Clima variable";
}

export type EventWeather = {
  date: string;
  code: number;
  label: string;
  tempMax: number | null;
  tempMin: number | null;
  /** Temperatura aprox. a la hora del evento (serie horaria), si viene. */
  tempAtEvent: number | null;
  rainProb: number | null;
  rainMm: number | null;
  windMax: number | null;
  /** "18:42" ya en hora local del lugar (Open-Meteo con timezone=auto). */
  sunrise: string | null;
  sunset: string | null;
  timezone: string;
  advice: string[];
};

function numberOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function timeOfIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /T(\d{2}:\d{2})/.exec(value);
  return match ? match[1] : null;
}

/** Consejos prácticos para la puerta y el salón/jardín, derivados del pronóstico. */
export function weatherAdvice(input: {
  code?: number | null;
  tempMax?: number | null;
  tempMin?: number | null;
  tempAtEvent?: number | null;
  rainProb?: number | null;
  windMax?: number | null;
  sunset?: string | null;
}): string[] {
  const advice: string[] = [];
  const rain = input.rainProb ?? null;
  const stormy = input.code != null && input.code >= 95;
  if (stormy) advice.push("Hay tormenta en el pronóstico: confirma carpa o salón cerrado y avisa a los invitados.");
  else if (rain != null && rain >= 50) advice.push("Probabilidad alta de lluvia: paraguas para invitados y resguardo para la tablet de la puerta.");
  else if (rain != null && rain >= 25) advice.push("Puede llover: ten paraguas a la mano en la entrada.");
  const evening = input.tempAtEvent ?? input.tempMin ?? null;
  if (evening != null && evening <= 12) advice.push("Refrescará a la hora del evento: sugiere llevar abrigo ligero.");
  if (input.tempMax != null && input.tempMax >= 30) advice.push("Día caluroso: agua y sombra para la fila de acceso.");
  if (input.windMax != null && input.windMax >= 40) advice.push("Viento fuerte: asegura letreros, arreglos y la carpa.");
  if (input.sunset) advice.push(`Atardecer a las ${input.sunset}: la hora dorada para fotos es aprox. una hora antes.`);
  return advice;
}

/** Interpreta la respuesta de Open-Meteo para UN día (start_date == end_date). */
export function parseOpenMeteo(json: unknown, dateIso: string, timeHm: string): EventWeather | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  const daily = (root.daily ?? {}) as Record<string, unknown>;
  const days = Array.isArray(daily.time) ? daily.time : [];
  const index = days.findIndex((day) => day === dateIso);
  if (index < 0) return null;
  const pick = (key: string): unknown => {
    const series = daily[key];
    return Array.isArray(series) ? series[index] : undefined;
  };
  const code = numberOrNull(pick("weather_code")) ?? -1;

  let tempAtEvent: number | null = null;
  const hourly = (root.hourly ?? {}) as Record<string, unknown>;
  const hours = Array.isArray(hourly.time) ? hourly.time : [];
  const temps = Array.isArray(hourly.temperature_2m) ? hourly.temperature_2m : [];
  const hourPrefix = `${dateIso}T${(timeHm || "18:00").slice(0, 2)}:`;
  const hourIndex = hours.findIndex((hour) => typeof hour === "string" && hour.startsWith(hourPrefix));
  if (hourIndex >= 0) tempAtEvent = numberOrNull(temps[hourIndex]);

  const weather: EventWeather = {
    date: dateIso,
    code,
    label: wmoLabelEs(code),
    tempMax: numberOrNull(pick("temperature_2m_max")),
    tempMin: numberOrNull(pick("temperature_2m_min")),
    tempAtEvent,
    rainProb: numberOrNull(pick("precipitation_probability_max")),
    rainMm: numberOrNull(pick("precipitation_sum")),
    windMax: numberOrNull(pick("wind_speed_10m_max")),
    sunrise: timeOfIso(pick("sunrise")),
    sunset: timeOfIso(pick("sunset")),
    timezone: typeof root.timezone === "string" ? root.timezone : "",
    advice: [],
  };
  weather.advice = weatherAdvice(weather);
  return weather;
}

export function openMeteoForecastUrl(lat: number, lon: number, dateIso: string): string {
  const params = new URLSearchParams({
    latitude: String(roundCoord(lat, 4)),
    longitude: String(roundCoord(lon, 4)),
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset",
    hourly: "temperature_2m",
    timezone: "auto",
    start_date: dateIso,
    end_date: dateIso,
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

export type WeatherResult =
  | { kind: "ok"; weather: EventWeather; fetchedAt: number; stale: boolean }
  | { kind: "too-early"; daysUntil: number; availableOn: string }
  | { kind: "past" }
  | { kind: "no-coords" }
  | { kind: "unavailable" };

const WEATHER_CACHE_MS = 6 * 60 * 60 * 1000;

function weatherCacheKey(lat: number, lon: number, dateIso: string, timeHm: string): string {
  return `mievento-weather-v1:${roundCoord(lat, 3)},${roundCoord(lon, 3)}:${dateIso}:${(timeHm || "18:00").slice(0, 2)}`;
}

export async function fetchEventWeather(input: {
  lat: number | null | undefined;
  lon: number | null | undefined;
  date: string;
  time?: string;
  force?: boolean;
  today?: string;
}): Promise<WeatherResult> {
  const { date } = input;
  const time = input.time || "18:00";
  if (!validCoords(input.lat, input.lon)) return { kind: "no-coords" };
  const lat = input.lat as number;
  const lon = input.lon as number;
  const days = daysUntil(date, input.today ?? todayIso());
  if (days == null) return { kind: "unavailable" };
  if (days < 0) return { kind: "past" };
  if (days > FORECAST_MAX_DAYS) {
    return { kind: "too-early", daysUntil: days, availableOn: addDaysIso(date, -FORECAST_MAX_DAYS) };
  }
  const key = weatherCacheKey(lat, lon, date, time);
  if (!input.force) {
    const cached = readCache<{ weather: EventWeather; fetchedAt: number }>(key, WEATHER_CACHE_MS);
    if (cached) return { kind: "ok", weather: cached.weather, fetchedAt: cached.fetchedAt, stale: false };
  }
  try {
    const json = await fetchJson(openMeteoForecastUrl(lat, lon, date));
    const weather = parseOpenMeteo(json, date, time);
    if (!weather) throw new Error("sin datos");
    const fetchedAt = Date.now();
    writeCache(key, { weather, fetchedAt });
    return { kind: "ok", weather, fetchedAt, stale: false };
  } catch {
    const stale = readCacheStale<{ weather: EventWeather; fetchedAt: number }>(key);
    if (stale) return { kind: "ok", weather: stale.value.weather, fetchedAt: stale.value.fetchedAt, stale: true };
    return { kind: "unavailable" };
  }
}

/** Zona horaria IANA del lugar (para el enlace de Google Calendar), vía Open-Meteo. */
export async function resolveTimezone(lat: number, lon: number): Promise<string | null> {
  if (!validCoords(lat, lon)) return null;
  const key = `mievento-tz-v1:${roundCoord(lat, 3)},${roundCoord(lon, 3)}`;
  const cached = readCache<string>(key, 30 * 24 * 60 * 60 * 1000);
  if (cached) return cached;
  try {
    const params = new URLSearchParams({
      latitude: String(roundCoord(lat, 4)),
      longitude: String(roundCoord(lon, 4)),
      daily: "sunrise",
      timezone: "auto",
      forecast_days: "1",
    });
    const json = (await fetchJson(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)) as {
      timezone?: unknown;
    };
    const tz = typeof json?.timezone === "string" && json.timezone.includes("/") ? json.timezone : null;
    if (tz) writeCache(key, tz);
    return tz;
  } catch {
    return null;
  }
}

/* ------------------------------------------- Nager.Date (feriados de México) */

export type PublicHoliday = { date: string; localName: string; name: string };

export function parseHolidays(json: unknown): PublicHoliday[] {
  if (!Array.isArray(json)) return [];
  const out: PublicHoliday[] = [];
  for (const item of json) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const date = typeof raw.date === "string" ? raw.date : "";
    if (!parseIsoDay(date)) continue;
    const types = Array.isArray(raw.types) ? raw.types : [];
    if (types.length > 0 && !types.includes("Public")) continue;
    out.push({
      date,
      localName: typeof raw.localName === "string" ? raw.localName : "",
      name: typeof raw.name === "string" ? raw.name : "",
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function holidayOn(list: PublicHoliday[], dateIso: string): PublicHoliday | null {
  return list.find((holiday) => holiday.date === dateIso) ?? null;
}

export function holidaysUrl(year: number, country = "MX"): string {
  return `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`;
}

/** Feriados oficiales de México del año de la fecha, cacheados 30 días en el dispositivo. */
export async function fetchMxHolidays(dateIso: string): Promise<PublicHoliday[] | null> {
  const parsed = parseIsoDay(dateIso);
  if (!parsed) return null;
  const key = `mievento-holidays-v1:MX:${parsed.y}`;
  const cached = readCache<PublicHoliday[]>(key, 30 * 24 * 60 * 60 * 1000);
  if (cached) return cached;
  try {
    const json = await fetchJson(holidaysUrl(parsed.y));
    const list = parseHolidays(json);
    writeCache(key, list);
    return list;
  } catch {
    return readCacheStale<PublicHoliday[]>(key)?.value ?? null;
  }
}

/* ------------------------------ enlaces públicos sin llave: mapas y calendario */

export type MapsUrls = { google: string; waze: string; apple: string; osm: string };

/** "Cómo llegar" sin ninguna API key: enlaces de búsqueda/navegación públicos. */
export function mapsUrls(input: {
  place?: string;
  lat?: number | null;
  lon?: number | null;
}): MapsUrls | null {
  const place = (input.place ?? "").trim();
  const hasCoords = validCoords(input.lat, input.lon);
  if (!hasCoords && !place) return null;
  const query = hasCoords
    ? `${roundCoord(input.lat as number)},${roundCoord(input.lon as number)}`
    : place;
  const encoded = encodeURIComponent(query);
  const label = encodeURIComponent(place || "Lugar del evento");
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    waze: hasCoords
      ? `https://www.waze.com/ul?ll=${roundCoord(input.lat as number)}%2C${roundCoord(input.lon as number)}&navigate=yes`
      : `https://www.waze.com/ul?q=${encoded}&navigate=yes`,
    apple: `https://maps.apple.com/?q=${encoded}${hasCoords ? `&ll=${roundCoord(input.lat as number)},${roundCoord(input.lon as number)}` : ""}`,
    osm: hasCoords
      ? `https://www.openstreetmap.org/?mlat=${roundCoord(input.lat as number)}&mlon=${roundCoord(input.lon as number)}#map=16/${roundCoord(input.lat as number)}/${roundCoord(input.lon as number)}&label=${label}`
      : `https://www.openstreetmap.org/search?query=${encoded}`,
  };
}

/** Mapa embebido de OpenStreetMap (sin llave). Requiere atribución OSM junto al mapa. */
export function osmEmbedUrl(lat: number, lon: number): string | null {
  if (!validCoords(lat, lon)) return null;
  const delta = 0.012;
  const bbox = [lon - delta, lat - delta, lon + delta, lat + delta]
    .map((value) => roundCoord(value, 6))
    .join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${roundCoord(lat, 6)}%2C${roundCoord(lon, 6)}`;
}

function stampOf(dateIso: string, timeHm: string): string {
  const day = dateIso.replaceAll("-", "");
  const [h, m] = (timeHm || "18:00").split(":");
  return `${day}T${(h ?? "18").padStart(2, "0")}${(m ?? "00").padStart(2, "0")}00`;
}

/**
 * Enlace "Añadir a Google Calendar" (plantilla pública, sin llave).
 * Usa la misma duración por defecto que el .ics de la app (4 horas).
 */
export function googleCalendarUrl(input: {
  title: string;
  details?: string;
  location?: string;
  date: string;
  time?: string;
  timezone?: string;
  durationHours?: number;
}): string | null {
  if (!parseIsoDay(input.date)) return null;
  const time = input.time || "18:00";
  const end = addHoursToDateTime(input.date, time, input.durationHours ?? 4);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${stampOf(input.date, time)}/${stampOf(end.date, end.time)}`,
  });
  if (input.details) params.set("details", input.details);
  if (input.location) params.set("location", input.location);
  if (input.timezone) params.set("ctz", input.timezone);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Resumen corto del clima para el pase del invitado ("Soleado · 24° a las 18:00"). */
export function weatherLine(weather: EventWeather, timeHm?: string): string {
  const parts: string[] = [weather.label];
  if (weather.tempAtEvent != null) {
    parts.push(`${Math.round(weather.tempAtEvent)}°${timeHm ? ` a las ${timeHm}` : ""}`);
  } else if (weather.tempMax != null && weather.tempMin != null) {
    parts.push(`${Math.round(weather.tempMin)}°–${Math.round(weather.tempMax)}°`);
  }
  if (weather.rainProb != null && weather.rainProb >= 20) {
    parts.push(`lluvia ${Math.round(weather.rainProb)}%`);
  }
  return parts.join(" · ");
}
