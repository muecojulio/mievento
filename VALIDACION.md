# Validación de Mi Evento

Revisión del 30 de octubre de 2026 sobre la rama `arena/ff13d199-mievento`.
La app ya existía; aquí se audita contra la lista de requisitos y se agrega lo que
faltaba (Wallet, envío automático, detección de códigos repetidos y carga por
lados). Todo el código nuevo compila, pasa el linter y el build de Vercel.

## Resumen

| # | Requisito | Estado |
| --- | --- | --- |
| 1 | App instalable en una tablet (PWA) | ✅ |
| 2 | Subir la lista del novio y de la novia en Excel | ✅ |
| 3 | Cada lectura deja el pase como validado | ✅ |
| 4 | Conteo del novio, de la novia y total | ✅ |
| 5 | Solo acepta QR de invitados en la lista | ✅ |
| 6 | El QR se guarda en el Wallet con fecha, día y nombres | ✅ (Wallet de la app + imagen) |
| 7 | Botón para escanear cada vez | ✅ |
| 8 | Crear uno o varios eventos con fecha y foto | ✅ |
| 9 | QR válido: muestra los datos del asistente | ✅ |
| 10 | QR inválido: aviso y paso no autorizado | ✅ |
| 11 | El QR se envía por correo o WhatsApp al invitado | ✅ (cola automática) |
| 12 | Validar con o sin internet | ✅ |
| 13 | Los códigos QR no se pueden falsificar | ✅ |
| 14 | Pendiente → Ingresado al instante y captura repetida detectada | ✅ |

## Punto por punto

### 1. App instalable en la tablet
`src/routes/__root.tsx` registra el manifiesto y el service worker (`public/sw.js`),
y el plugin de PWA entrega `display: standalone` e icono. En la portada hay
instrucciones y el acceso “Instalar en iPad o iPhone”. Al abrirla desde el ícono
corre sin barra de navegador y guarda la pantalla para abrir sin internet.

### 2. Lista del novio y de la novia en Excel
`src/lib/mievento/excel.ts` lee `.xlsx`, `.xls` y `.csv` con `read-excel-file`,
detecta encabezados (nombre, lado, personas, correo, teléfono, mesa) y también
acepta hojas llamadas Novio y Novia. En `Invitados` ahora hay tres entradas:
**Excel del novio**, **Excel de la novia** (fuerzan el lado aunque el archivo no
traiga la columna) y **Excel con los dos lados**. Antes de crear los códigos avisa
de nombres repetidos y ofrece omitirlos. Tope: 2000 invitados.

### 3 y 4. Ticket validado y conteo
`admitToken` cambia el invitado a `Ingresado` en IndexedDB (memoria de la tablet)
y guarda hora y tipo de entrada. `tally()` calcula invitaciones y personas de cada
lado; se muestran en el tablero (Novio / Novia / Total) y en la cabecera del lector.
También se puede ajustar cuántas personas entraron si el pase dice 4 y llegan 2.

### 5. Solo códigos de la lista
El código solo es válido si la firma HMAC coincide con el secreto del evento **y**
el invitado existe con ese mismo token en la lista local y en ese evento.

### 6. Wallet con fecha, día y nombres
Nuevo `src/lib/mievento/wallet.ts` y la pantalla `/wallet`.

- El invitado abre su pase (`/pase#…`), pulsa **Guardar en Wallet** y el pase queda
  guardado en el dispositivo con el código, el día completo (`jueves, 14 de
  noviembre de 2026`), la hora, el lugar y los nombres de los novios.
- Se abre sin internet y se puede exportar como **imagen tamaño cartera**
  (`renderWalletCardPng`) o agregar al calendario (`.ics`).
- El organizador ve en cada pase la etiqueta “Wallet en el enlace”.

> Nota honesta: Apple Wallet y Google Wallet nativas solo aceptan pases firmados
> por Apple o por una cuenta de emisor de Google. Sin esas credenciales, el Wallet
> de la app es la vía que funciona hoy en cualquier tablet y teléfono. Si se
> consiguen las credenciales, se puede añadir la descarga del `.pkpass` firmado o
> el enlace `save to Google Wallet` sin cambiar el resto del flujo.

### 7. Botón para escanear
En el tablero, “Escanear código”; en el lector, “Escanear código” enciende la
cámara (BarcodeDetector o ZXing como respaldo) y la apaga al terminar. También se
puede leer una foto del pase o escribir el código.

### 8. Eventos con fecha y foto
`EventForm` pide novio, novia, fecha, hora, lugar y foto (comprimida en el
dispositivo). Se pueden crear varios eventos; cada uno tiene su lista, su llave,
su foto y su tablero independiente.

### 9. QR válido
El lector muestra nombre, lado, número de personas, mesa, hora y estado
“Ingresado”, con la opción de anular el ingreso si fue un error.

### 10. QR inválido
Se rechaza con un aviso y el pase no cambia de estado. Cubre: código inventado,
firma alterada, código de otro evento, evento cerrado y pase ya usado.

### 11. Envío del QR
En `Pases`, cada invitado tiene WhatsApp, Correo y Compartir (Web Share con la
imagen del pase), y se registra en la lista la hora y el canal del envío. Nuevo
**envío automático en cola**: eliges WhatsApp o Correo y la tablet abre un mensaje
por invitado, en orden, marcando cada envío y saltando a quienes no tienen
teléfono/correo o ya lo recibieron. Si el navegador bloquea ventanas, se detiene y
avisa para seguir con “Enviar el siguiente”.

> El envío 100 % desatendido (sin tocar “enviar” en WhatsApp o en el correo)
> requiere un proveedor con API y credenciales. La app no guarda secretos ni crea
> cuentas: por eso la cola abre el mensaje ya escrito.

### 12. Con o sin internet
La lista, los pases, las fotos y el Wallet viven en IndexedDB/localStorage. El
service worker cachea la aplicación después de la primera visita. No hay llamadas
de red para validar: el lector funciona en modo avión.

### 13. Códigos no falsificables
`src/lib/mievento/crypto.ts`:

- Secreto aleatorio de 32 bytes por evento (`crypto.getRandomValues`), guardado solo
  en la tablet.
- Token `ME1.<evento>.<invitado>.<firma>` con HMAC-SHA-256 del cuerpo.
- Comparación en tiempo constante (`safeEqual`).
- Además de la firma, se exige que el invitado exista en la lista con ese token.

Cualquier cambio de evento, invitado o firma invalida el código (probado).

### 14. Pendiente → Ingresado y captura repetida
`admitToken` cambia el estado en memoria y en disco inmediatamente. Si el mismo
código vuelve a leerse (aunque sea una captura de pantalla), la respuesta es
`reason: "used"`, `duplicate: true` y `firstEntryAt`. El lector muestra:

> **Alerta de la puerta · código repetido**
> **Código ya utilizado**
> *Nombre del invitado*
> Primera entrada a las 20:14.
> Puede ser una captura de pantalla del mismo código. No se permite un segundo ingreso.
> El paso no está autorizado.

## Verificación ejecutada

```bash
npm run typecheck   # ✅ sin errores
npm run lint        # ✅ 0 errores (4 avisos previos de fast-refresh/ref)
npm run build       # ✅ genera .vercel/output (preset vercel de Nitro)
npm run test:flow   # ✅ 15/15 comprobaciones del flujo real de la puerta
```

`npm run test:flow` importa el código real de la app con IndexedDB simulado y
comprueba: importación de la lista, firma de pases, ingreso válido, segundo intento
con el mismo código (duplicado con hora), código falsificado, código fuera de la
lista, pase de otro evento, invitado de última hora, registro de envío y guardado
en Wallet.

Pruebas unitarias: 71/71 (`node --experimental-strip-types --test …`).
`npm test` además corre las pruebas de la plataforma, que en este checkout fallan
16 porque dependen de `.grok/` (carpeta de la plataforma que no viene en el
repositorio); no tocan el código de la app.

Servidor de producción (`vite preview` del build de Nitro): `/`, `/wallet`,
`/pase` y `/privacidad` responden 200 y renderizan sin errores.

## Publicar en Vercel

`vercel.json` fija el build y la instalación:

```json
{
  "framework": null,
  "buildCommand": "npm run build",
  "installCommand": "npm install --omit=dev --no-audit --no-fund"
}
```

- `npm run build` compila con Vite + Nitro (`preset: "vercel"`) y deja
  `.vercel/output` con la función y los estáticos.
- **No requiere variables de entorno**: la app no usa base de datos ni cuentas.
  (`npm run build` incluye `db:migrate`, que se salta solo si no hay
  `DATABASE_URL` ni migraciones.)
- La cámara del lector necesita HTTPS; Vercel lo da por defecto.
- Después de publicar, abre la URL en la tablet → menú del navegador → **Agregar a
  pantalla de inicio**.

## Prueba manual recomendada en la tablet

1. Crear un evento con fecha y foto.
2. Subir el Excel del novio y el de la novia.
3. En Pases: enviar uno por WhatsApp y abrir el enlace en otro teléfono.
4. En ese teléfono: **Guardar en Wallet** → abrir `/wallet` sin internet.
5. En la tablet: Escanear el pase → aparece el invitado y queda Ingresado.
6. Volver a escanear el mismo QR → **código repetido** con la hora del primero.
7. Probar un QR inventado → aviso y paso no autorizado.
8. Modo avión en la tablet → repetir 5 y 6.
