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
- **Cierre**: CSV de quién entró y quién no, copia de seguridad y opción de
  reciclar los códigos de un evento terminado.
- **Ayudas en línea (opcionales, sin llave ni cuenta)**: al escribir el lugar se
  puede buscar en OpenStreetMap para tener el clima de ese día (Open-Meteo), el
  mapa y botones de «cómo llegar» en cada pase; aviso si la fecha es feriado en
  México (Nager.Date) y botón de Google Calendar junto al `.ics`. Solo salen de
  la tablet el lugar y la fecha del evento —nunca la lista— y sin internet todo
  sigue igual. Detalle completo en [APIS.md](./APIS.md).

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
