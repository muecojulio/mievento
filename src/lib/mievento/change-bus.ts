import type { Guest, WeddingEvent } from "./types";

export type Change =
  | { type: "event"; event: WeddingEvent }
  | { type: "guests"; guests: Guest[] }
  | { type: "delete-guest"; id: string; eventId: string }
  | { type: "delete-event"; eventId: string };
export type ChangeMessage = { id: string; clock: number; change: Change };
const listeners = new Set<(message: ChangeMessage, remote: boolean) => void>();
let channel: BroadcastChannel | undefined;
let clock = 0;
const seen = new Set<string>();
function deliver(message: ChangeMessage, remote: boolean) {
  if (seen.has(message.id)) return;
  seen.add(message.id);
  if (seen.size > 10000) seen.delete(seen.values().next().value!);
  clock = Math.max(clock, message.clock);
  for (const listener of listeners) listener(message, remote);
}
export function startChangeBus() {
  if (!channel && typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("mievento-changes-v1");
    channel.onmessage = ({ data }) => {
      if (data?.id && data?.change) deliver(data, true);
    };
  }
}
export function onChange(listener: (message: ChangeMessage, remote: boolean) => void) {
  startChangeBus();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function publishChange(change: Change) {
  startChangeBus();
  const message = { id: crypto.randomUUID(), clock: ++clock, change };
  deliver(message, false);
  channel?.postMessage(message);
}
export function publishRemoteChange(message: ChangeMessage) {
  deliver(message, true);
  channel?.postMessage(message);
}
