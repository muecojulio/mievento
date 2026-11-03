import { useSyncExternalStore } from "react";
import { onChange, publishRemoteChange, type Change, type ChangeMessage } from "@/lib/mievento/change-bus";
import { dbApplyPeerChange, dbGetAll, dbReplacePeerSnapshot } from "@/lib/mievento/db";
import type { AdmitResult, Guest, Side, WeddingEvent } from "@/lib/mievento/types";

type Signal = {
  version: 1;
  session: string;
  eventId: string;
  description: RTCSessionDescriptionInit;
  expires: number;
  stun?: boolean;
};

export type RemoteAdmitRequest =
  | {
      kind: "token";
      eventId: string;
      raw: string;
      doorName: string | null;
    }
  | {
      kind: "name";
      eventId: string;
      guestId: string;
      arrived?: number;
      doorName: string | null;
    }
  | {
      kind: "walkin";
      eventId: string;
      name: string;
      side: Side;
      party: number;
      doorName: string | null;
    };

export type PeerDoorInfo = {
  deviceId: string;
  doorId: string | null;
  doorName: string | null;
};

export type SyncSnapshot = {
  status: string;
  eventId: string;
  isHost: boolean;
  connectedCount: number;
  isConnected: boolean;
  peerDoors: PeerDoorInfo[];
};

type PeerLink = {
  session: string;
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
  incoming: string;
  receiving: Promise<void>;
  sending: Promise<void>;
  ready: boolean;
  door: PeerDoorInfo | null;
};

const STUN_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
];

const SERVER_SNAPSHOT: SyncSnapshot = {
  status: "Sin conexión",
  eventId: "",
  isHost: false,
  connectedCount: 0,
  isConnected: false,
  peerDoors: [],
};

const peers = new Map<string, PeerLink>();
let activeEventId = "";
let host = false;
let pendingOfferSession = "";
let unsubscribeBus: (() => void) | undefined;
let status = "Sin conexión";
let localDoorClaim: PeerDoorInfo | null = null;
let admitCoordinator: ((req: RemoteAdmitRequest) => Promise<AdmitResult>) | null = null;

const pendingAdmits = new Map<
  string,
  {
    resolve: (result: AdmitResult | null) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

const listeners = new Set<() => void>();
const sent = new Set<string>();
const versions = new Map<string, [number, string]>();

let cachedSnapshot: SyncSnapshot = SERVER_SNAPSHOT;

function buildSnapshot(): SyncSnapshot {
  let connectedCount = 0;
  const doorMap = new Map<string, PeerDoorInfo>();
  if (localDoorClaim?.deviceId) {
    doorMap.set(localDoorClaim.deviceId, localDoorClaim);
  }
  for (const link of peers.values()) {
    if (link.channel?.readyState === "open" && link.ready) {
      connectedCount += 1;
      if (link.door?.deviceId) {
        doorMap.set(link.door.deviceId, link.door);
      }
    }
  }
  return {
    status,
    eventId: activeEventId,
    isHost: host,
    connectedCount,
    isConnected: connectedCount > 0,
    peerDoors: [...doorMap.values()],
  };
}

function emit() {
  cachedSnapshot = buildSnapshot();
  for (const fn of listeners) fn();
}

function update(value: string) {
  status = value;
  emit();
}

function refreshStatusFromPeers() {
  const openCount = [...peers.values()].filter(
    (link) => link.channel?.readyState === "open" && link.ready,
  ).length;
  if (openCount > 0) {
    status =
      openCount === 1
        ? "Conectada · sincronía y bloqueo de puertas activos"
        : `Conectada · ${openCount + 1} puertas enlazadas en vivo`;
  }
  emit();
}

export function syncStatus() {
  return status;
}

export function syncSnapshot(): SyncSnapshot {
  return cachedSnapshot;
}

export function subscribeSync(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useSyncSnapshot(): SyncSnapshot {
  return useSyncExternalStore(subscribeSync, syncSnapshot, () => SERVER_SNAPSHOT);
}

export function isSyncConnectedForEvent(targetEventId: string): boolean {
  if (!targetEventId || activeEventId !== targetEventId) return false;
  for (const link of peers.values()) {
    if (link.channel?.readyState === "open" && link.ready) return true;
  }
  return false;
}

export function isSyncClientForEvent(targetEventId: string): boolean {
  return !host && isSyncConnectedForEvent(targetEventId);
}

export function registerAdmitCoordinator(
  handler: (req: RemoteAdmitRequest) => Promise<AdmitResult>,
) {
  admitCoordinator = handler;
}

function failAllPendingAdmits() {
  for (const [id, entry] of pendingAdmits) {
    clearTimeout(entry.timer);
    pendingAdmits.delete(id);
    entry.resolve(null);
  }
}

function closeLink(sessionKey: string) {
  const link = peers.get(sessionKey);
  if (!link) return;
  peers.delete(sessionKey);
  link.pc.onconnectionstatechange = null;
  if (link.channel) {
    link.channel.onmessage = null;
    link.channel.onclose = null;
    link.channel.onerror = null;
  }
  try {
    link.pc.close();
  } catch {
    /* ignore */
  }
}

export function disconnectSync() {
  unsubscribeBus?.();
  unsubscribeBus = undefined;
  failAllPendingAdmits();
  for (const key of [...peers.keys()]) closeLink(key);
  pendingOfferSession = "";
  activeEventId = "";
  host = false;
  sent.clear();
  versions.clear();
  update("Sin conexión");
}

function ensureChangeBusSubscription() {
  if (unsubscribeBus) return;
  unsubscribeBus = onChange((message) => {
    if (scope(message.change) !== activeEventId || sent.has(message.id)) return;
    sent.add(message.id);
    for (const key of keys(message.change)) versions.set(key, [message.clock, message.id]);
    broadcastToPeers(message);
  });
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

function sendToLink(link: PeerLink, value: unknown) {
  const channel = link.channel;
  link.sending = link.sending
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
    .catch((error) => {
      closeLink(link.session);
      if (!host) failAllPendingAdmits();
      if (peers.size === 0) update(error instanceof Error ? error.message : "Conexión interrumpida");
      else refreshStatusFromPeers();
    });
}

function broadcastToPeers(value: unknown, exceptSession?: string) {
  for (const link of peers.values()) {
    if (link.session === exceptSession) continue;
    if (link.channel?.readyState === "open" && link.ready) {
      sendToLink(link, value);
    }
  }
}

function broadcastRosterFromHost() {
  if (!host) return;
  const list: PeerDoorInfo[] = [];
  if (localDoorClaim) list.push(localDoorClaim);
  for (const link of peers.values()) {
    if (link.ready && link.door) list.push(link.door);
  }
  broadcastToPeers({ doorRoster: list });
  emit();
}

export function announceDoorClaim(info: PeerDoorInfo) {
  localDoorClaim = info;
  if (host) {
    broadcastRosterFromHost();
  } else {
    broadcastToPeers({ doorClaim: info });
    emit();
  }
}

export async function requestRemoteAdmit(req: RemoteAdmitRequest): Promise<AdmitResult | null> {
  if (host || activeEventId !== req.eventId) return null;
  const openLink = [...peers.values()].find(
    (link) => link.channel?.readyState === "open" && link.ready,
  );
  if (!openLink) return null;

  const reqId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;

  const result = await new Promise<AdmitResult | null>((resolve) => {
    const timer = setTimeout(() => {
      pendingAdmits.delete(reqId);
      resolve(null);
    }, 4000);
    pendingAdmits.set(reqId, { resolve, timer });
    sendToLink(openLink, { admitReq: { reqId, payload: req } });
  });

  if (result && result.ok) {
    await dbApplyPeerChange({ type: "guests", guests: [result.guest] });
    publishRemoteChange({
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `admit-${reqId}`,
      clock: 0,
      change: { type: "guests", guests: [result.guest] },
    });
  } else if (result && !result.ok && result.guest) {
    await dbApplyPeerChange({ type: "guests", guests: [result.guest] });
  }
  return result;
}

async function receiveFromLink(link: PeerLink, text: string) {
  const value = unpack(text);

  if (value.snapshot) {
    if (
      host ||
      value.snapshot.event?.id !== activeEventId ||
      !Array.isArray(value.snapshot.guests) ||
      value.snapshot.guests.length > 2000
    )
      throw new Error("Evento recibido no válido");
    await dbReplacePeerSnapshot(value.snapshot.event, value.snapshot.guests);
    link.ready = true;
    publishRemoteChange({
      id: crypto.randomUUID(),
      clock: 0,
      change: { type: "event", event: value.snapshot.event },
    });
    if (localDoorClaim) sendToLink(link, { doorClaim: localDoorClaim });
    refreshStatusFromPeers();
    return;
  }

  if (value.doorClaim && host) {
    const claim = value.doorClaim as PeerDoorInfo;
    if (claim && typeof claim.deviceId === "string") {
      link.door = {
        deviceId: claim.deviceId.slice(0, 64),
        doorId: typeof claim.doorId === "string" ? claim.doorId.slice(0, 32) : null,
        doorName: typeof claim.doorName === "string" ? claim.doorName.slice(0, 40) : null,
      };
      broadcastRosterFromHost();
    }
    return;
  }

  if (Array.isArray(value.doorRoster) && !host) {
    const firstOther = (value.doorRoster as PeerDoorInfo[]).find(
      (item) => item && typeof item.deviceId === "string" && item.deviceId !== localDoorClaim?.deviceId,
    );
    link.door = firstOther ?? null;
    emit();
    return;
  }

  if (value.admitReq && host) {
    const { reqId, payload } = value.admitReq as { reqId: string; payload: RemoteAdmitRequest };
    if (!reqId || !payload || payload.eventId !== activeEventId || !admitCoordinator) return;
    const outcome = await admitCoordinator(payload);
    sendToLink(link, { admitRes: { reqId, result: outcome } });
    return;
  }

  if (value.admitRes && !host) {
    const { reqId, result } = value.admitRes as { reqId: string; result: AdmitResult };
    const waiting = pendingAdmits.get(reqId);
    if (waiting) {
      clearTimeout(waiting.timer);
      pendingAdmits.delete(reqId);
      waiting.resolve(result);
    }
    return;
  }

  const message = value as ChangeMessage;
  if (
    !message.id ||
    !Number.isSafeInteger(message.clock) ||
    message.clock < 0 ||
    !message.change ||
    scope(message.change) !== activeEventId ||
    sent.has(message.id)
  )
    return;
  if (
    message.change.type === "guests" &&
    (message.change.guests.length > 2000 ||
      message.change.guests.some((g) => g.eventId !== activeEventId || !g.id || !g.token))
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
  if (host) {
    broadcastToPeers({ ...message, change }, link.session);
  }
}

function attachChannel(link: PeerLink, channel: RTCDataChannel) {
  link.channel = channel;
  channel.onmessage = ({ data: raw }) => {
    link.receiving = link.receiving
      .then(async () => {
        const chunk = JSON.parse(raw);
        if (typeof chunk.part !== "string" || chunk.part.length > 8000)
          throw new Error("Paquete no válido");
        link.incoming += chunk.part;
        if (link.incoming.length > 32_000_000) throw new Error("Transferencia demasiado grande");
        if (chunk.end) {
          const text = link.incoming;
          link.incoming = "";
          await receiveFromLink(link, text);
        }
      })
      .catch((error) => {
        closeLink(link.session);
        if (!host) failAllPendingAdmits();
        update(error instanceof Error ? error.message : "Error en sincronía local");
      });
  };
  channel.onopen = async () => {
    ensureChangeBusSubscription();
    if (host) {
      update("Conectada · transfiriendo evento");
      try {
        const stored = await dbGetAll();
        const event = stored.events.find((e) => e.id === activeEventId);
        if (!event) throw new Error("El evento ya no existe");
        link.ready = true;
        sendToLink(link, {
          snapshot: { event, guests: stored.guests.filter((g) => g.eventId === activeEventId) },
        });
        broadcastRosterFromHost();
        refreshStatusFromPeers();
      } catch (error) {
        update(error instanceof Error ? error.message : "Error al transferir");
      }
    } else {
      update("Conectada · recibiendo evento");
    }
  };
  channel.onclose = () => {
    closeLink(link.session);
    if (!host) failAllPendingAdmits();
    if ([...peers.values()].some((p) => p.channel?.readyState === "open" && p.ready)) {
      refreshStatusFromPeers();
    } else {
      update("Desconectada · vuelve a emparejar para sincronizar puertas");
    }
  };
  channel.onerror = () => {
    closeLink(link.session);
    if (!host) failAllPendingAdmits();
    if ([...peers.values()].some((p) => p.channel?.readyState === "open" && p.ready)) {
      refreshStatusFromPeers();
    } else {
      update("Error de conexión · vuelve a emparejar");
    }
  };
}

function createPeerLink(sessionKey: string, useStun = false): PeerLink {
  if (typeof RTCPeerConnection === "undefined") throw new Error("Este navegador no admite WebRTC");
  const pc = new RTCPeerConnection({ iceServers: useStun ? STUN_SERVERS : [] });
  const link: PeerLink = {
    session: sessionKey,
    pc,
    channel: null,
    incoming: "",
    receiving: Promise.resolve(),
    sending: Promise.resolve(),
    ready: false,
    door: null,
  };
  peers.set(sessionKey, link);
  pc.ondatachannel = ({ channel }) => attachChannel(link, channel);
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
      closeLink(sessionKey);
      if (!host) failAllPendingAdmits();
      if ([...peers.values()].some((p) => p.channel?.readyState === "open" && p.ready)) {
        refreshStatusFromPeers();
      } else {
        update("Conexión perdida. Comprueba la red y vuelve a emparejar.");
      }
    }
  };
  return link;
}

async function encodeSignal(
  pc: RTCPeerConnection,
  sessionKey: string,
  useStun = false,
): Promise<string> {
  if (pc.iceGatheringState !== "complete") {
    await new Promise<void>((resolve, reject) => {
      const waitMs = useStun ? 4500 : 15000;
      const timeout = setTimeout(() => {
        pc.removeEventListener("icegatheringstatechange", check);
        if (useStun && pc.localDescription?.sdp) {
          resolve();
        } else {
          reject(new Error("No se pudo preparar la conexión local"));
        }
      }, waitMs);
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
  }
  const payload: Signal = {
    version: 1,
    session: sessionKey,
    eventId: activeEventId,
    description: pc.localDescription!.toJSON(),
    expires: Date.now() + 10 * 60_000,
    ...(useStun ? { stun: true } : {}),
  };
  const text = JSON.stringify(payload);
  const compressed = await new Response(
    new Blob([text]).stream().pipeThrough(new CompressionStream("deflate")),
  ).arrayBuffer();
  let binary = "";
  for (const byte of new Uint8Array(compressed)) binary += String.fromCharCode(byte);
  return `MESYNC1:${btoa(binary)}`;
}

async function parseSignal(text: string): Promise<Signal> {
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

export async function offerSync(id: string, options?: { allowInternet?: boolean }) {
  const useStun = Boolean(options?.allowInternet);
  if (!host || activeEventId !== id) {
    disconnectSync();
  } else if (pendingOfferSession) {
    const prev = peers.get(pendingOfferSession);
    if (prev && !prev.ready) closeLink(pendingOfferSession);
  }
  host = true;
  activeEventId = id;
  const nextSession = crypto.randomUUID();
  pendingOfferSession = nextSession;
  const link = createPeerLink(nextSession, useStun);
  attachChannel(link, link.pc.createDataChannel("mievento", { ordered: true }));
  await link.pc.setLocalDescription(await link.pc.createOffer());
  update(
    peers.size > 1
      ? "Esperando respuesta de la siguiente puerta…"
      : "Esperando la respuesta de la otra tablet",
  );
  return encodeSignal(link.pc, nextSession, useStun);
}

export async function answerSync(text: string) {
  const offer = await parseSignal(text);
  if (offer.description.type !== "offer")
    throw new Error("Escanea el QR de oferta de la tablet principal");
  disconnectSync();
  host = false;
  activeEventId = offer.eventId;
  const useStun = Boolean(offer.stun);
  const link = createPeerLink(offer.session, useStun);
  await link.pc.setRemoteDescription(offer.description);
  await link.pc.setLocalDescription(await link.pc.createAnswer());
  update("Muestra esta respuesta a la tablet principal");
  return encodeSignal(link.pc, offer.session, useStun);
}

export async function completeSync(text: string) {
  const answer = await parseSignal(text);
  const link = peers.get(answer.session);
  if (
    !host ||
    !link ||
    answer.eventId !== activeEventId ||
    answer.description.type !== "answer"
  )
    throw new Error("La respuesta no corresponde a esta conexión");
  if (pendingOfferSession === answer.session) pendingOfferSession = "";
  await link.pc.setRemoteDescription(answer.description);
  update("Conectando puertas…");
}
