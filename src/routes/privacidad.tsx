import { createFileRoute, Link } from "@tanstack/react-router";
import { Mark } from "@/components/mievento/ui";

export const Route = createFileRoute("/privacidad")({
  head: () => ({ meta: [{ title: "Privacidad · Mi Evento" }] }),
  component: Privacy,
});

function Privacy() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-8 sm:px-8">
      <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brass">
        <Mark className="h-6 w-8" />
        Volver
      </Link>
      <h1 className="mt-4 font-display text-4xl">Privacidad</h1>
      <div className="mt-6 grid gap-5 text-sm leading-relaxed text-ink-soft">
        <p>
          Mi Evento es una herramienta de puerta para quien organiza la celebración. No pide cuenta y no envía la lista de invitados a un servidor.
        </p>
        <section>
          <h2 className="font-display text-2xl text-ink">Qué se guarda</h2>
          <p className="mt-2">
            Nombres, lado (novio o novia), número de personas, correo, teléfono, mesa, foto del evento y si el pase está Pendiente o Ingresado. También una llave secreta que firma los códigos para que no se puedan falsificar.
          </p>
        </section>
        <section>
          <h2 className="font-display text-2xl text-ink">Dónde vive</h2>
          <p className="mt-2">
            Todo queda en la memoria local de esta tablet (IndexedDB), con índices por evento, por código y por estado para responder al instante en la puerta. La cámara solo se enciende cuando pulsas Escanear. La imagen no se sube a ningún lado.
          </p>
        </section>
        <section>
          <h2 className="font-display text-2xl text-ink">Wallet</h2>
          <p className="mt-2">
            El pase que el invitado guarda en su Wallet se queda en ese teléfono o tablet (almacenamiento
            del navegador), con la fecha, el día, los nombres de los novios y su código. No viaja a ningún
            servidor y se abre sin internet. Si borra los datos del sitio, también se borra el Wallet.
          </p>
        </section>
        <section>
          <h2 className="font-display text-2xl text-ink">Envío por WhatsApp y correo</h2>
          <p className="mt-2">
            Al enviar un pase se abre WhatsApp o el correo de la tablet, con el mensaje ya escrito. Mi Evento no tiene servidor de mensajería y no entrega los datos a un tercero. El invitado confirma el envío en su propia app.
          </p>
        </section>
        <section>
          <h2 className="font-display text-2xl text-ink">Copia de seguridad</h2>
          <p className="mt-2">
            El archivo de copia incluye la llave que impide falsificar los códigos. Quien tenga ese archivo puede fabricar pases válidos. No lo mandes por WhatsApp ni lo subas a una carpeta compartida. Guárdalo como guardarías las llaves del salón.
          </p>
        </section>
        <section>
          <h2 className="font-display text-2xl text-ink">Cómo borrar</h2>
          <p className="mt-2">
            Elimina el evento dentro de la app, o borra los datos del sitio en el navegador. Al borrar el evento se van la lista, las fotos y la llave de esa celebración.
          </p>
        </section>
        <section>
          <h2 className="font-display text-2xl text-ink">Ayudas en línea opcionales</h2>
          <p className="mt-2">
            Al crear el evento puedes buscar el lugar para tener clima del día, mapa y botones de “cómo llegar”
            en los pases, y la app avisa si la fecha cae en feriado. Esas ayudas usan servicios públicos sin
            cuenta ni llave (OpenStreetMap/Photon para lugares, Open-Meteo para el clima y Nager.Date para
            feriados de México). Lo único que sale de la tablet es el texto del lugar que escribes, sus
            coordenadas y la fecha del evento. <strong>Nunca se envían nombres, teléfonos, correos ni códigos de
            invitados.</strong> Si no hay internet —o si prefieres escribir el lugar a mano— todo lo demás
            funciona igual: la lista, los pases, el Wallet y el lector no dependen de esas ayudas. El detalle
            completo está en el archivo <code>APIS.md</code> del repositorio.
          </p>
        </section>
        <section>
          <h2 className="font-display text-2xl text-ink">Qué no hace esta app</h2>
          <p className="mt-2">
            No incluye rastreadores, no vende datos y no manda la lista a servicios externos. Las letras se cargan con la propia aplicación para que también sirva sin conexión después de la primera visita.
          </p>
        </section>
      </div>
    </main>
  );
}
