import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDaysIso,
  addHoursToDateTime,
  countdownLabel,
  daysUntil,
  googleCalendarUrl,
  holidayOn,
  mapsUrls,
  openMeteoForecastUrl,
  osmEmbedUrl,
  parseHolidays,
  parseOpenMeteo,
  parsePhoton,
  photonSearchUrl,
  validCoords,
  weatherAdvice,
  weatherLine,
  wmoLabelEs,
} from "./public-apis.ts";

/** Formas reales de respuesta (documentadas) de cada API pública sin llave. */

const PHOTON_FIXTURE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        name: "Jardín Mayita",
        street: "Av. de las Fuentes",
        housenumber: "120",
        city: "Ciudad de México",
        state: "Ciudad de México",
        country: "México",
        type: "house",
      },
      geometry: { type: "Point", coordinates: [-99.133209, 19.432608] },
    },
    {
      type: "Feature",
      properties: { name: "", city: "" },
      geometry: { type: "Point", coordinates: [0, 0] },
    },
    { type: "Feature", properties: { name: "Sin geometría" }, geometry: null },
  ],
};

const OPEN_METEO_FIXTURE = {
  latitude: 19.4326,
  longitude: -99.1332,
  timezone: "America/Mexico_City",
  daily: {
    time: ["2026-11-14"],
    weather_code: [61],
    temperature_2m_max: [22.4],
    temperature_2m_min: [11.2],
    precipitation_sum: [3.1],
    precipitation_probability_max: [70],
    wind_speed_10m_max: [18.5],
    sunrise: ["2026-11-14T06:52"],
    sunset: ["2026-11-14T17:58"],
  },
  hourly: {
    time: ["2026-11-14T17:00", "2026-11-14T18:00", "2026-11-14T19:00"],
    temperature_2m: [18.1, 16.4, 15.0],
  },
};

const NAGER_FIXTURE = [
  { date: "2026-01-01", localName: "Año Nuevo", name: "New Year's Day", types: ["Public"] },
  { date: "2026-09-16", localName: "Día de la Independencia", name: "Independence Day", types: ["Public"] },
  { date: "2026-05-10", localName: "Día de la Madre", name: "Mother's Day", types: ["Observance"] },
  { date: "no-es-fecha", localName: "Roto", name: "Broken", types: ["Public"] },
];

describe("Photon (lugares de OpenStreetMap, sin llave)", () => {
  it("arma la URL de búsqueda sin parámetros de credenciales", () => {
    const url = photonSearchUrl("Jardín Mayita CDMX");
    assert.ok(url.startsWith("https://photon.komoot.io/api/?"));
    assert.ok(!/key|token|api_key/i.test(url));
  });

  it("interpreta GeoJSON y respeta el orden [lon, lat]", () => {
    const list = parsePhoton(PHOTON_FIXTURE);
    assert.equal(list.length, 1);
    assert.equal(list[0].lat, 19.43261);
    assert.equal(list[0].lon, -99.13321);
    assert.ok(list[0].label.includes("Jardín Mayita"));
    assert.ok(list[0].label.includes("Av. de las Fuentes 120"));
    assert.ok(list[0].label.includes("México"));
    // La ciudad repetida como estado no se duplica en la etiqueta.
    assert.equal(list[0].label.split("Ciudad de México").length - 1, 1);
  });

  it("respuestas rotas equivalen a sin resultados, nunca revienta", () => {
    assert.deepEqual(parsePhoton(null), []);
    assert.deepEqual(parsePhoton({}), []);
    assert.deepEqual(parsePhoton({ features: "no" }), []);
  });
});

describe("Open-Meteo (clima sin llave)", () => {
  it("arma la URL de un solo día sin credenciales", () => {
    const url = openMeteoForecastUrl(19.4326, -99.1332, "2026-11-14");
    assert.ok(url.startsWith("https://api.open-meteo.com/v1/forecast?"));
    assert.ok(url.includes("start_date=2026-11-14"));
    assert.ok(url.includes("timezone=auto"));
    assert.ok(!/key|token|api_key/i.test(url));
  });

  it("traduce los códigos WMO al español", () => {
    assert.equal(wmoLabelEs(0), "Despejado");
    assert.equal(wmoLabelEs(61), "Lluvia ligera");
    assert.equal(wmoLabelEs(95), "Tormenta");
    assert.equal(wmoLabelEs(null), "Clima por confirmar");
  });

  it("interpreta el día del evento y la temperatura a su hora", () => {
    const weather = parseOpenMeteo(OPEN_METEO_FIXTURE, "2026-11-14", "18:00");
    assert.ok(weather);
    assert.equal(weather.label, "Lluvia ligera");
    assert.equal(weather.tempMax, 22.4);
    assert.equal(weather.tempAtEvent, 16.4);
    assert.equal(weather.rainProb, 70);
    assert.equal(weather.sunset, "17:58");
    assert.equal(weather.timezone, "America/Mexico_City");
    assert.ok(weather.advice.some((line) => line.toLowerCase().includes("lluvia")));
    assert.ok(weatherLine(weather, "18:00").includes("16° a las 18:00"));
  });

  it("si el día pedido no viene en la respuesta, devuelve null", () => {
    assert.equal(parseOpenMeteo(OPEN_METEO_FIXTURE, "2026-12-25", "18:00"), null);
    assert.equal(parseOpenMeteo(null, "2026-11-14", "18:00"), null);
  });

  it("los consejos cubren frío, calor y viento sin inventar datos", () => {
    assert.deepEqual(weatherAdvice({}), []);
    const cold = weatherAdvice({ tempAtEvent: 9 });
    assert.ok(cold.some((line) => line.includes("abrigo")));
    const hot = weatherAdvice({ tempMax: 34 });
    assert.ok(hot.some((line) => line.includes("agua")));
    const windy = weatherAdvice({ windMax: 55 });
    assert.ok(windy.some((line) => line.includes("Viento")));
  });
});

describe("Nager.Date (feriados de México, sin llave)", () => {
  it("solo conserva feriados públicos con fecha válida, ordenados", () => {
    const list = parseHolidays(NAGER_FIXTURE);
    assert.deepEqual(
      list.map((holiday) => holiday.date),
      ["2026-01-01", "2026-09-16"],
    );
  });

  it("detecta si la fecha del evento es feriado", () => {
    const list = parseHolidays(NAGER_FIXTURE);
    assert.equal(holidayOn(list, "2026-09-16")?.localName, "Día de la Independencia");
    assert.equal(holidayOn(list, "2026-09-17"), null);
  });
});

describe("enlaces de mapas y calendario (sin llave)", () => {
  it("sin lugar ni coordenadas no hay enlaces", () => {
    assert.equal(mapsUrls({ place: "  " }), null);
    assert.equal(osmEmbedUrl(0, 0), null);
  });

  it("con coordenadas genera Google, Waze, Apple y OSM navegables", () => {
    const urls = mapsUrls({ place: "Jardín Mayita", lat: 19.43261, lon: -99.13321 });
    assert.ok(urls);
    assert.ok(urls.google.includes("google.com/maps/search/?api=1"));
    assert.ok(urls.waze.includes("waze.com/ul?ll=19.43261%2C-99.13321"));
    assert.ok(urls.apple.includes("maps.apple.com"));
    assert.ok(urls.osm.includes("openstreetmap.org"));
    for (const url of Object.values(urls)) assert.ok(!/key=|token=/i.test(url));
    assert.ok(osmEmbedUrl(19.43261, -99.13321)?.includes("export/embed.html"));
  });

  it("con solo el texto del lugar usa búsqueda por nombre", () => {
    const urls = mapsUrls({ place: "Salón Los Pinos, Puebla" });
    assert.ok(urls);
    assert.ok(urls.google.includes(encodeURIComponent("Salón Los Pinos, Puebla")));
  });

  it("el enlace de Google Calendar lleva inicio, fin (+4 h) y zona horaria", () => {
    const url = googleCalendarUrl({
      title: "Boda de Mateo y Valentina",
      date: "2026-11-14",
      time: "18:00",
      timezone: "America/Mexico_City",
      location: "Jardín Mayita",
    });
    assert.ok(url);
    assert.ok(url.includes("dates=20261114T180000%2F20261114T220000"));
    assert.ok(url.includes("ctz=America%2FMexico_City"));
    assert.equal(googleCalendarUrl({ title: "X", date: "" }), null);
  });
});

describe("fechas y coordenadas", () => {
  it("cuenta los días y lo dice en español llano", () => {
    assert.equal(daysUntil("2026-11-14", "2026-11-01"), 13);
    assert.equal(daysUntil("2026-11-14", "2026-11-14"), 0);
    assert.equal(daysUntil("2026-11-14", "2026-11-20"), -6);
    assert.equal(daysUntil("", "2026-11-01"), null);
    assert.equal(countdownLabel(0), "¡Es hoy!");
    assert.equal(countdownLabel(13), "Faltan 13 días");
    assert.equal(countdownLabel(-1), "Fue ayer");
  });

  it("sumar horas cuida la medianoche (para el fin del evento en el calendario)", () => {
    assert.deepEqual(addHoursToDateTime("2026-11-14", "18:00", 4), { date: "2026-11-14", time: "22:00" });
    assert.deepEqual(addHoursToDateTime("2026-11-14", "22:30", 4), { date: "2026-11-15", time: "02:30" });
    assert.equal(addDaysIso("2026-11-14", -16), "2026-10-29");
  });

  it("rechaza coordenadas imposibles o el 0,0 de respuestas rotas", () => {
    assert.equal(validCoords(19.43, -99.13), true);
    assert.equal(validCoords(0, 0), false);
    assert.equal(validCoords(120, 0), false);
    assert.equal(validCoords("19.43", -99.13), false);
    assert.equal(validCoords(undefined, undefined), false);
  });
});
