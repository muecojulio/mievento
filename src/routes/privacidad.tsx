import { createFileRoute, Link } from "@tanstack/react-router";
import { Mark } from "@/components/mievento/ui";

export const Route = createFileRoute("/privacidad")({
  head: () => ({ meta: [{ title: "Privacidad · Mi Evento" }] }),
  component: Privacy,
});

function Privacy() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-8 sm:px-8">
      <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brass"><Mark className="h-6 w-8" />Volver</Link>
      <h1 className="mt-4 font-display text-4xl">Aviso de privacidad</h1>
      <div className="mt-6 grid gap-5 text-sm leading-relaxed text-ink-soft">
        <p>Este aviso describe el funcionamiento de Mi Evento. La persona u organización que recopila la lista y organiza la celebración es responsable de informar a sus invitados cómo trata sus datos. Antes de publicar este aviso debe completarlo con su identidad, contacto y los requisitos legales aplicables.</p>
        <section><h2 className="font-display text-2xl text-ink">Datos y finalidad</h2><p className="mt-2">La app puede guardar nombres, lado de la familia, correo, teléfono, número de personas, mesa o notas, estado y hora de ingreso, y registro de envío; también datos y foto del evento, códigos de acceso y la llave que los firma. Se usan para organizar la lista, emitir y compartir pases, controlar el ingreso y elaborar un reporte de cierre.</p></section>
        <section><h2 className="font-display text-2xl text-ink">Almacenamiento y conservación</h2><p className="mt-2">La lista, la foto y la llave se guardan en IndexedDB en el navegador del dispositivo; el Wallet y algunas preferencias y resultados de servicios en línea se guardan en almacenamiento local. Permanecen hasta que se eliminen o se borren los datos del sitio; el navegador también puede eliminarlos. No hay sincronización automática entre dispositivos ni cifrado propio de la app: protege el dispositivo y limita quién puede usarlo.</p></section>
        <section><h2 className="font-display text-2xl text-ink">Cámara, pases y copias</h2><p className="mt-2">La cámara se usa con permiso para leer códigos; la app no sube las imágenes de lectura. Los enlaces y las imágenes de pases contienen datos del evento, el nombre y un código: quien los reciba puede compartirlos. Las copias de seguridad incluyen la lista y la llave secreta; quien tenga una copia puede crear pases válidos. Guarda y comparte estos archivos de forma segura.</p></section>
        <section><h2 className="font-display text-2xl text-ink">Servicios externos</h2><p className="mt-2">Al escribir un lugar, las sugerencias pueden enviar el texto a Photon; Open-Meteo recibe coordenadas para el clima y la zona horaria, Nager.Date recibe el año de consulta y el mapa incrustado de OpenStreetMap recibe la ubicación. Estos proveedores también pueden recibir datos técnicos como la dirección IP. Al abrir mapas o Google Calendar, o compartir por WhatsApp, correo u otra app, se envían los datos incluidos en el enlace o mensaje al servicio elegido, conforme a sus propias políticas. No se envía automáticamente la lista completa de invitados a estos servicios.</p></section>
        <section><h2 className="font-display text-2xl text-ink">Caché y funcionamiento sin conexión</h2><p className="mt-2">Se guardan recursos de la aplicación y resultados de clima, feriados y zona horaria para reducir consultas y facilitar el uso sin internet. El clima puede mostrarse desactualizado cuando no hay conexión. La disponibilidad sin conexión depende de los recursos que el navegador haya guardado previamente.</p></section>
        <section><h2 className="font-display text-2xl text-ink">Acceso, corrección y eliminación</h2><p className="mt-2">Solicita acceso, corrección o eliminación de tus datos a quien organiza el evento. Esa persona puede editar o borrar invitados y eliminar el evento en la app. También puede borrar los datos del sitio en el navegador. Estas acciones no eliminan automáticamente copias exportadas, mensajes enviados ni Wallets guardados por otras personas; deben tratarse por separado.</p></section>
        <section><h2 className="font-display text-2xl text-ink">Alcance</h2><p className="mt-2">La versión descrita no requiere cuenta ni envía la lista a un servidor propio. El proveedor de alojamiento y los servicios externos pueden procesar información técnica al recibir solicitudes. Este texto es una base informativa, no sustituye la revisión legal ni identifica por sí solo al responsable del tratamiento.</p></section>
      </div>
    </main>
  );
}
