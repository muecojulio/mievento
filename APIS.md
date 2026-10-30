# APIs públicas integradas (sin llave ni registro)

Mi Evento sigue siendo **offline-first y sin cuentas**: la lista, las fotos y la
llave de los códigos viven en la tablet. Las integraciones de este documento son
**ayudas opcionales en línea** que solo refuerzan funciones que la app ya tenía.
Si no hay internet, si un servicio tarda o si falla, la app trabaja igual que
siempre (con timeout de 7 s y caché local; el lector nunca espera a la red).

El cliente de todas ellas vive en `src/lib/mievento/public-apis.ts` (funciones
puras probadas en `public-apis.test.ts`) y la interfaz en
`src/components/mievento/place-extras.tsx`. Las APIs se eligieron del catálogo
público [public-apis/public-apis](https://github.com/public-apis/public-apis)
(MIT) verificando en cada repositorio que **no piden key ni registro**.

## Qué se integró y a qué función existente ayuda

| Función que ya existía | Ayuda nueva | API (sin key) | Repositorio público |
| --- | --- | --- | --- |
| Evento con fecha, hora y **lugar** | Buscar el lugar y guardar su ubicación exacta (lat/lon) | Photon · `photon.komoot.io/api/?q=…` | [komoot/photon](https://github.com/komoot/photon) (Apache-2.0), datos © OpenStreetMap (ODbL) |
| Evento (tablero) y **pase/Wallet** del invitado | Clima del día: condición, temperatura a la hora del evento, lluvia, viento, atardecer y consejos (paraguas, abrigo, agua/sombra, hora dorada) | Open-Meteo Forecast · `api.open-meteo.com/v1/forecast` | [open-meteo/open-meteo](https://github.com/open-meteo/open-meteo) (datos CC BY 4.0; se consumen por API, no se copia su código AGPL) |
| Evento: elegir la **fecha** | Aviso si el día es feriado oficial en México | Nager.Date · `date.nager.at/api/v3/PublicHolidays/{año}/MX` | [nager/Nager.Date](https://github.com/nager/Nager.Date) (MIT) |
| Pase/Wallet: llegar al lugar | Botones **Cómo llegar** (Google Maps, Waze, Apple Maps, OpenStreetMap) + mapa de OpenStreetMap en el tablero | Enlaces públicos de mapas (URLs de búsqueda `api=1`, sin credenciales) y `openstreetmap.org/export/embed.html` | [OpenStreetMap](https://www.openstreetmap.org/copyright) |
| Pase/Wallet: **añadir al calendario** | Botón *Añadir a Google Calendar* además del `.ics`; el `.ics` ahora reserva 4 h (antes duración cero) y lleva `GEO:` + enlace de ruta; el mensaje de WhatsApp/correo incluye “Cómo llegar” | Plantilla pública de Google Calendar `calendar.google.com/calendar/render?action=TEMPLATE` | — (URL pública documentada; sin SDK ni llave) |
| Zona horaria del lugar (para el enlace de calendario) | Se resuelve una vez al elegir el lugar y viaja en el enlace del pase (`z=`) | Open-Meteo con `timezone=auto` | [open-meteo/open-meteo](https://github.com/open-meteo/open-meteo) |

Detalles de comportamiento:

- **Clima**: Open-Meteo publica pronóstico hasta 16 días. Antes de eso el tablero
  dice a partir de qué día estará disponible; el resultado se cachea 6 h en la
  tablet y, sin conexión, se muestra el último guardado con su fecha.
- **Lugares**: al escribir el lugar (4+ caracteres, con pausa de 600 ms) se
  sugieren coincidencias de OpenStreetMap. Si se edita el texto después de
  elegir uno, la ubicación exacta se retira para no apuntar a otro sitio.
  Escribir el lugar a mano, sin buscar, sigue funcionando como siempre.
- **Feriados**: la lista del año se cachea 30 días. El aviso aparece al crear o
  editar el evento y en la tarjeta “El día del evento” del tablero.
- **Pases ya enviados**: su enlace no trae coordenadas y sigue sirviendo igual
  (los campos nuevos del pase/Wallet son opcionales y retrocompatibles).

## Privacidad: qué sale (y qué jamás sale) de la tablet

Sale **únicamente** lo que la persona que organiza ya escribió para el evento:

- el texto del lugar mientras lo busca (a Photon/OpenStreetMap),
- las coordenadas del lugar elegido y la fecha/hora del evento (a Open-Meteo),
- el año de la fecha (a Nager.Date).

**Jamás** se envían nombres de invitados, teléfonos, correos, mesas, fotos ni
tokens de pases. Tampoco hay rastreadores ni cuentas nuevas.

## Qué se descartó deliberadamente (y por qué)

| Idea | Motivo del descarte |
| --- | --- |
| Generar QR con una API externa (`api.qrserver.com`, etc.) | Enviaría el token firmado a un tercero, rompería el modo offline y la garantía antifalsificación. Los QR se siguen generando en el dispositivo. |
| Validar correos/teléfonos con APIs de terceros | Expondría datos personales de la lista a un tercero por una ganancia mínima. |
| Avatares por nombre (DiceBear, ui-avatars, Gravatar) | Mandarían nombres/correos de invitados fuera de la tablet. |
| Nominatim “crudo” para autocompletar | Su política de uso desaconseja el autocompletado; Photon es el buscador OSM pensado para eso (mismos datos, Apache-2.0). No se copia código GPL de Nominatim: solo se enlazan mapas de OSM. |
| Copiar código de Open-Meteo (AGPL) o Nominatim (GPL) al repo | Incompatible con mantener este repo simple: se consumen sus **APIs públicas** y se respetan las atribuciones de datos (CC BY 4.0 / ODbL). El código propio de `public-apis.ts` es original y sigue los formatos documentados en esos repositorios. |
| APIs con key “gratuita” (clima, mapas, mensajería) | El requisito es *sin key ni registro*; además la app promete cero variables de entorno en Vercel. |

## Atribuciones en la interfaz

- Clima: “Pronóstico de Open-Meteo” (CC BY 4.0) junto al dato y en el tablero.
- Lugares/mapa: “© OpenStreetMap contributors” bajo las sugerencias y el mapa.
- Feriados: Nager.Date, mencionado en la tarjeta del tablero y aquí.

## Verificación

```bash
node --experimental-strip-types --test src/lib/mievento/public-apis.test.ts  # parsers con respuestas reales de forma documentada, sin red
npm run typecheck && npm run lint && npm test && npm run test:flow
```

Nota: el sandbox de desarrollo solo tiene salida a GitHub/npm/PyPI, así que las
llamadas reales no se pueden probar desde ahí; por eso los parsers se prueban con
*fixtures* fieles a la documentación de cada API y toda la UI degrada sin red.
En la tablet (o en Vercel) las ayudas aparecen solas cuando hay conexión.
