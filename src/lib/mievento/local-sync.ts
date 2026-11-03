import { onChange, publishRemoteChange, type Change, type ChangeMessage } from "./change-bus";
import { dbApplyPeerChange, dbGetAll, dbReplacePeerSnapshot } from "./db";
import type { WeddingEvent, Guest } from "./types";

type Signal = {
  version: 1;
  session: string;
  eventId: string;
  description: RTCSessionDescriptionInit;
  expires: number;
};
let peer: RTCPeerConnection | null = null;
let data: RTCDataChannel | null = null;
let session = "",
  eventId = "",
  host = false;
let unsubscribe: (() => void) | undefined;
let status = "Sin conexión";
const listeners = new Set<() => void>();
const sent = new Set<string>();
const versions = new Map<string, [number, string]>();
let incoming = "";
let receiving: Promise<void> = Promise.resolve();
let sending: Promise<void> = Promise.resolve();
export function syncStatus() {
  return status;
}
export function subscribeSync(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function update(value: string) {
  status = value;
  for (const fn of listeners) fn();
}
export function disconnectSync() {
  unsubscribe?.();
  unsubscribe = undefined;
  if (peer) {
    peer.onconnectionstatechange = null;
    peer.close();
  }
  peer = null;
  data = null;
  incoming = "";
  sent.clear();
  versions.clear();
  update("Sin conexión");
}
function scope(change: Change) {
  return change.type === "event"
    ? change.event.id
    : change.type === "guests"
      ? change.guests[0]?.eventId
      : change.eventId;
}
function keys(change: Change) {
  return change.type === "guests"
    ? change.guests.map((g) => `g:${g.id}`)
    : [change.type === "delete-guest" ? `g:${change.id}` : `e:${scope(change)}`];
}
async function pack(value: unknown): Promise<string> {
  const object = value as { change?: Change; snapshot?: { event: WeddingEvent; guests: Guest[] } };
  const event =
    object.snapshot?.event ?? (object.change?.type === "event" ? object.change.event : undefined);
  if (!event?.photo) return JSON.stringify(value);
  const bytes = new Uint8Array(await event.photo.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return JSON.stringify(value, (key, val) =>
    key === "photo" && val instanceof Blob ? { mime: val.type, base64: btoa(binary) } : val,
  );
}
function unpack(text: string) {
  return JSON.parse(text, (key, value) =>
    key === "photo" && value?.base64
      ? new Blob([Uint8Array.from(atob(value.base64), (c) => c.charCodeAt(0))], {
          type: value.mime,
        })
      : value,
  );
}
function send(value: unknown) {
  const channel = data;
  sending = sending
    .then(async () => {
      const text = await pack(value);
      if (text.length > 32_000_000) throw new Error("Evento demasiado grande para sincronizar");
      for (let i = 0; i < text.length; i += 8000) {
        while (channel?.readyState === "open" && channel.bufferedAmount > 128000)
          await new Promise((resolve) => setTimeout(resolve, 30));
        if (channel?.readyState !== "open")
          throw new Error("Conexión interrumpida; vuelve a emparejar");
        channel.send(
          JSON.stringify({ part: text.slice(i, i + 8000), end: i + 8000 >= text.length }),
        );
      }
    })
    .catch((error) => update(error.message));
}
async function receive(text: string) {
  const value = unpack(text);
  if (value.snapshot) {
    if (
      host ||
      value.snapshot.event?.id !== eventId ||
      !Array.isArray(value.snapshot.guests) ||
      value.snapshot.guests.length > 2000
    )
      throw new Error("Evento recibido no válido");
    await dbReplacePeerSnapshot(value.snapshot.event, value.snapshot.guests);
    publishRemoteChange({
      id: crypto.randomUUID(),
      clock: 0,
      change: { type: "event", event: value.snapshot.event },
    });
    update("Conectada · sincronía local activa");
    return;
  }
  const message = value as ChangeMessage;
  if (
    !message.id ||
    !Number.isSafeInteger(message.clock) ||
    message.clock < 0 ||
    !message.change ||
    scope(message.change) !== eventId ||
    sent.has(message.id)
  )
    return;
  if (
    message.change.type === "guests" &&
    (message.change.guests.length > 2000 ||
      message.change.guests.some((g) => g.eventId !== eventId || !g.id || !g.token))
  )
    throw new Error("Invitados recibidos no válidos");
  sent.add(message.id);
  const newer = (key: string) => {
    const old = versions.get(key);
    return !old || message.clock > old[0] || (message.clock === old[0] && message.id > old[1]);
  };
  let change = message.change;
  if (change.type === "guests")
    change = { ...change, guests: change.guests.filter((g) => newer(`g:${g.id}`)) };
  else if (!keys(change).every(newer)) return;
  for (const key of keys(change)) versions.set(key, [message.clock, message.id]);
  await dbApplyPeerChange(change);
  publishRemoteChange({ ...message, change });
}
function attach(channel: RTCDataChannel) {
  data = channel;
  channel.onmessage = ({ data: raw }) => {
    receiving = receiving
      .then(async () => {
        const chunk = JSON.parse(raw);
        if (typeof chunk.part !== "string" || chunk.part.length > 8000)
          throw new Error("Paquete no válido");
        incoming += chunk.part;
        if (incoming.length > 32_000_000) throw new Error("Transferencia demasiado grande");
        if (chunk.end) {
          const text = incoming;
          incoming = "";
          await receive(text);
        }
      })
      .catch((error) => {
        disconnectSync();
        update(error.message);
      });
  };
  channel.onopen = async () => {
    update("Conectada · transfiriendo evento");
    unsubscribe = onChange((message) => {
      if (scope(message.change) !== eventId || sent.has(message.id)) return;
      sent.add(message.id);
      for (const key of keys(message.change)) versions.set(key, [message.clock, message.id]);
      send(message);
    });
    if (host) {
      try {
        const stored = await dbGetAll();
        const event = stored.events.find((e) => e.id === eventId);
        if (!event) throw new Error("El evento ya no existe");
        send({ snapshot: { event, guests: stored.guests.filter((g) => g.eventId === eventId) } });
        update("Conectada · sincronía local activa");
      } catch (error) {
        update(error instanceof Error ? error.message : "Error al transferir");
      }
    }
  };
  channel.onclose = () => update("Desconectada · vuelve a emparejar para actualizar");
  channel.onerror = () => update("Error de conexión · vuelve a emparejar");
}
function createPeer() {
  if (typeof RTCPeerConnection === "undefined") throw new Error("Este navegador no admite WebRTC");
  peer = new RTCPeerConnection({ iceServers: [] });
  peer.ondatachannel = ({ channel }) => attach(channel);
  peer.onconnectionstatechange = () => {
    if (peer?.connectionState === "failed" || peer?.connectionState === "disconnected")
      update("Conexión perdida. Comprueba la red y vuelve a emparejar.");
  };
  return peer;
}
async function signal(pc: RTCPeerConnection): Promise<string> {
  if (pc.iceGatheringState !== "complete")
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pc.removeEventListener("icegatheringstatechange", check);
        reject(new Error("No se pudo preparar la conexión local"));
      }, 15000);
      function check() {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(timeout);
          pc.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      }
      pc.addEventListener("icegatheringstatechange", check);
      check();
    });
  const text = JSON.stringify({
    version: 1,
    session,
    eventId,
    description: pc.localDescription?.toJSON(),
    expires: Date.now() + 10 * 60_000,
  });
  const compressed = await new Response(
    new Blob([text]).stream().pipeThrough(new CompressionStream("deflate")),
  ).arrayBuffer();
  let binary = "";
  for (const byte of new Uint8Array(compressed)) binary += String.fromCharCode(byte);
  return `MESYNC1:${btoa(binary)}`;
}
async function parse(text: string): Promise<Signal> {
  if (!text.startsWith("MESYNC1:") || text.length > 20000)
    throw new Error("Este QR no es de emparejamiento");
  const bytes = Uint8Array.from(atob(text.slice(8)), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  const reader = stream.getReader();
  let plain = "";
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    plain += decoder.decode(value, { stream: true });
    if (plain.length > 64000) {
      await reader.cancel();
      throw new Error("QR demasiado grande");
    }
  }
  const result = JSON.parse(plain) as Signal;
  if (
    result.version !== 1 ||
    !result.session ||
    !result.eventId ||
    result.expires < Date.now() ||
    !result.description?.sdp
  )
    throw new Error("QR inválido o caducado; genera uno nuevo");
  return result;
}
export async function offerSync(id: string) {
  disconnectSync();
  host = true;
  eventId = id;
  session = crypto.randomUUID();
  const pc = createPeer();
  attach(pc.createDataChannel("mievento", { ordered: true }));
  await pc.setLocalDescription(await pc.createOffer());
  update("Esperando la respuesta de la otra tablet");
  return signal(pc);
}
export async function answerSync(text: string) {
  const offer = await parse(text);
  if (offer.description.type !== "offer")
    throw new Error("Escanea el QR de oferta de la tablet principal");
  disconnectSync();
  host = false;
  eventId = offer.eventId;
  session = offer.session;
  const pc = createPeer();
  await pc.setRemoteDescription(offer.description);
  await pc.setLocalDescription(await pc.createAnswer());
  update("Muestra esta respuesta a la tablet principal");
  return signal(pc);
}
export async function completeSync(text: string) {
  const answer = await parse(text);
  if (
    !host ||
    !peer ||
    answer.session !== session ||
    answer.eventId !== eventId ||
    answer.description.type !== "answer"
  )
    throw new Error("La respuesta no corresponde a esta conexión");
  await peer.setRemoteDescription(answer.description);
  update("Conectando por la red local…");
}
