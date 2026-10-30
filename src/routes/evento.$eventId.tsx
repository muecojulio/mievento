import { createFileRoute, Outlet } from "@tanstack/react-router";
import { EventNav } from "@/components/mievento/ui";
import { useEvent, useReady } from "@/lib/mievento/store";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/evento/$eventId")({
  component: EventLayout,
});

function EventLayout() {
  const { eventId } = Route.useParams();
  const ready = useReady();
  const event = useEvent(eventId);

  if (!ready) {
    return <main className="min-h-dvh bg-paper" />;
  }

  if (!event) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
        <h1 className="font-display text-4xl">Este evento no está en la tablet</h1>
        <Link to="/" className="mt-4 inline-flex min-h-11 items-center justify-center font-medium text-brass">
          Volver a los eventos
        </Link>
      </main>
    );
  }

  return (
    <div className="min-h-dvh bg-paper text-ink md:grid md:grid-cols-[240px_1fr]">
      <EventNav eventId={eventId} />
      <div className="pb-24 md:pb-8">
        <Outlet />
      </div>
    </div>
  );
}
