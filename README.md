# Mi Evento

Lector de acceso para una celebración. Se instala en la tablet, importa la lista
del novio y de la novia, y valida pases de un solo uso con o sin internet.

La lista, las fotos y la llave de los códigos se quedan en el dispositivo. No hay
cuenta ni servidor de invitados.

## Qué incluye

- **Eventos**: varios, cada uno con fecha, hora, lugar y foto.
- **Invitados**: Excel/CSV del novio, de la novia o de los dos lados, plantilla
  descargable, aviso de nombres repetidos y edición por invitado.
- **Pases**: código QR firmado (HMAC-SHA-256) por invitado, imagen lista para
  enviar, ZIP con todos los códigos y envío por WhatsApp, correo o compartir.
- **Envío automático**: cola que abre el mensaje de cada invitado pendiente y
  registra la hora y el canal del envío.
- **Lector**: botón para encender la cámara, lectura de una foto o del código
  escrito; conteo del novio, de la novia y total; invitados de última hora.
- **Duplicados**: si el mismo QR se lee otra vez (aunque sea una captura), se
  rechaza al instante y se muestra la hora del primer ingreso.
- **Wallet**: el invitado guarda su pase en el Wallet de la app con la fecha, el
  día y los nombres de los novios; se abre sin internet y se puede bajar como
  imagen o agregar al calendario.
- **Mesas**: en Invitados alternas entre «Lista» y «Mesas». Cada mesa agrupa a
  sus invitados (aunque el Excel mezcle acentos, mayúsculas o espacios en el
  nombre de la mesa), muestra cuántas invitaciones entraron y cuántas personas
  hay dentro, y se puede tocar para filtrar la lista. «Descargar mesas» genera
  un CSV imprimible con el resumen por mesa y el detalle de invitados, con la
  misma protección contra fórmulas que el cierre.
- **Sin código por más datos**: en la puerta se busca por nombre, mesa,
  teléfono o correo, además de autorizar por nombre como antes.
- **Croquis de mesas**: pestaña para arrastrar las mesas a su lugar en el
  salón (también con flechas del teclado) y descargar el plano como PNG. El
  acomodo se guarda solo en la tablet.
- **PIN local opcional**: sin cuenta ni servidor, un PIN guardado como hash
  protege terminar o borrar el evento, reciclar códigos, vaciar la lista y
  descargar copias o reportes. Escanear nunca lo pide.
- **Aviso de contactos repetidos**: al importar se detectan teléfonos y
  correos duplicados (con o sin `+52`) o que ya están en la lista, y se pueden
  omitir para no enviar dos pases a la misma persona.
- **Pases por hoja**: impresión de 8 credenciales por página con QR, nombre y
  código, generada en el dispositivo y lista para imprimir sin internet.
- **Cierre**: CSV de quién entró y quién no, copia de seguridad y opción de
  reciclar los códigos de un evento terminado.
- **Ayudas en línea (opcionales, sin llave ni cuenta)**: al escribir el lugar se
  puede buscar en OpenStreetMap para tener el clima de ese día (Open-Meteo), el
  mapa y botones de «cómo llegar» en cada pase; aviso si la fecha es feriado en
  México (Nager.Date) y botón de Google Calendar junto al `.ics`. Solo salen de
  la tablet el lugar y la fecha del evento —nunca la lista— y sin internet todo
  sigue igual. Detalle completo en [APIS.md](./APIS.md).

Estas funciones se calculan con la lista que ya está en IndexedDB: no añaden
campos a la base local, no crean cuentas, no piden llaves, no usan la red y no
envían nombres ni códigos a ningún servicio. El PIN, el acomodo del croquis y
los QR se generan o se guardan en el dispositivo; todo funciona igual sin
internet. Las hojas impresas y las copias contienen códigos válidos: protégelas
como protegerías un pase enviado.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:8080
npm run typecheck
npm run lint
npm test           # pruebas de la app (y de la plataforma)
npm run test:flow  # flujo de la puerta completo, sin navegador
npm run build      # build para Vercel (.vercel/output)
```

## Publicar en Vercel

El proyecto ya trae `vercel.json` (`buildCommand`, `installCommand` y sin
framework detectado). No hacen falta variables de entorno: la app valida en el
dispositivo y no usa base de datos ni cuentas.

1. Importa el repositorio en Vercel.
2. Deploy. El build usa Nitro con `preset: "vercel"` y deja `.vercel/output`.
3. Abre la URL en la tablet y usa **Agregar a pantalla de inicio** para instalarla.

Los detalles de la auditoría de requisitos, lo que se agregó y las pruebas
ejecutadas están en [VALIDACION.md](./VALIDACION.md).

## Almacenamiento, seguridad y límites operativos

Los datos de eventos e invitados viven en IndexedDB, no en Postgres. El índice
`byEvent` se usa para borrar los invitados de un evento y `byToken` garantiza
la unicidad de los pases. La aplicación carga las listas en memoria; el índice
por estado no se consultaba y se retiró en la versión 2 de la base local. La
actualización conserva los registros existentes. No se añadieron índices SQL
para datos que la aplicación no guarda allí.

El service worker guarda únicamente la portada pública y recursos de compilación
locales; no guarda páginas de pases ni respuestas de API. El clima se conserva
6 horas y los feriados y zona horaria 30 días; pueden usarse datos anteriores
cuando no hay conexión. El modo offline depende de que el navegador ya haya
almacenado los recursos necesarios.

La admisión de un invitado existente se comprueba y registra en una transacción
local, incluso ante lecturas simultáneas en pestañas del mismo navegador. Esto
no sincroniza tablets distintas ni todas las ediciones abiertas en varias
pestañas: usa una sola tablet y una sola sesión de administración para el
control de puerta. Los datos locales y las copias de seguridad no están cifrados
por la aplicación; protege el dispositivo y las copias. Las celdas exportadas
al CSV se protegen contra fórmulas de hoja de cálculo.

El aviso de privacidad incluido es una base informativa: quien publique la app
debe añadir los datos del responsable, un medio de contacto y los requisitos
legales aplicables, y revisarlo con asesoría legal. Si en el futuro se habilita
el sistema de cuentas opcional, se debe revisar el aviso y probar la integración
OAuth y las URLs de retorno del proveedor: Better Auth 1.7 usa rutas de callback
distintas de la versión anterior. La aplicación actual no utiliza cuentas.

### Sincronía local y copias seguras

- **Copias:** en el resumen del evento, «Copias y conexión de tablets» (respeta el PIN configurado) → contraseña y confirmación → «Descargar copia cifrada». Se usa Web Crypto AES-256-GCM, IV aleatorio de 12 bytes, sal de 16 bytes y PBKDF2-SHA256 con 310 000 iteraciones. La contraseña no se guarda ni se puede recuperar. Inicio → «Restaurar una copia» admite tanto el nuevo sobre cifrado como el JSON v1 anterior. La restauración del evento y sus invitados es una única transacción; una contraseña incorrecta no modifica datos.
- **Pestañas:** BroadcastChannel notifica cambios confirmados en IndexedDB y cada pestaña recarga el estado, sin recargar la página. Las admisiones del mismo navegador siguen protegidas por la transacción atómica existente. No se comparten PIN ni ajustes locales del croquis.
- **Tablets:** abre la app previamente en ambas tablets, por HTTPS, y conéctalas a la misma Wi-Fi. En el evento principal genera la oferta QR. En la segunda tablet, desde Inicio → «Recibir evento», escanea esa oferta y genera la respuesta. Escanea la respuesta desde la principal y pulsa conectar. También se pueden copiar/pegar los códigos. El QR caduca en diez minutos y debe mantenerse privado. No se usan servidores de señalización, STUN ni TURN (`iceServers: []`); WebRTC cifra el canal con DTLS. Se admite **una pareja por pestaña emparejada**. El emparejamiento inicial sustituye el evento receptor completo; respalda primero y evita editar durante la transferencia.
- Tras la transferencia se propagan cambios de eventos, invitados, ingresos y eliminaciones en ambos sentidos, incluidas las ediciones hechas en otras pestañas. Se usan mensajes identificados, reloj lógico y desempate por identificador para cambios concurrentes de un registro durante la sesión; no hay sincronización de ediciones desconectadas. Mantén la pestaña emparejada abierta. Si se pierde la conexión, vuelve a emparejar desde la tablet que conserve la copia más actualizada.
- **Límites reales:** algunas redes de invitados aíslan dispositivos; WebRTC local no puede eludir ese aislamiento. Dos tablets pueden aceptar un mismo pase si escanean simultáneamente o están desconectadas: esto no es un bloqueo distribuido. El primer arranque de la app necesita que esté cargada/instalada; «sin servidor» se refiere al intercambio local, no al alojamiento inicial de la aplicación.

Pruebas: `npm run test:app` incluye cifrado, alteración del archivo, contraseña incorrecta, retrocompatibilidad y aislamiento transaccional. Con la app en ejecución y Chromium instalado, `node scripts/local-sync-browser-test.mjs` comprueba BroadcastChannel, emparejamiento WebRTC entre dos contextos aislados, ingresos de vuelta y retransmisión desde otra pestaña. Opcionalmente acepta `BROWSER_EXECUTABLE_PATH` y `APP_URL`.
