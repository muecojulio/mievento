import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dbAdmitGuest, dbPutEvent, dbPutGuests } from "./db.ts";
import {
  assignedDoorForGuest,
  computeDoorAssignment,
  defaultDoors,
  doorSummaries,
  effectiveDoorMode,
  matchExplicitDoor,
  normalizeDoors,
} from "./doors.ts";
import { closingCsv, parseCsv, rowsToDrafts } from "./excel.ts";
import { inviteText, passFromGuest } from "./pass.ts";
import { printSheetHtml } from "./print-sheet.ts";
import { admitToken, boot, configureEventDoors, createEvent, addGuests } from "./store.ts";
import {
  answerSync,
  completeSync,
  disconnectSync,
  isSyncConnectedForEvent,
  offerRequiresPin,
  offerSync,
  syncSnapshot,
} from "./local-sync.ts";
import { pairingProof } from "./pairing.ts";
import type { Guest, WeddingEvent } from "./types.ts";

describe("control de puertas sin internet (lógica pura)", () => {
  it("normaliza puertas, evita nombres duplicados y activa modo solo con >= 2 puertas", () => {
    const cleaned = normalizeDoors([
      { id: "P 1!", name: "  Puerta Norte  " },
      { id: "p1", name: "puerta norte" },
      { id: "p1", name: "Puerta Sur" },
      { id: "", name: "" },
    ]);
    assert.equal(cleaned.length, 2);
    assert.equal(cleaned[0].id, "p1");
    assert.equal(cleaned[0].name, "Puerta Norte");
    assert.equal(cleaned[1].id, "p12");
    assert.equal(cleaned[1].name, "Puerta Sur");

    assert.equal(effectiveDoorMode({ doorMode: "asignada", doors: [cleaned[0]] }), "unica");
    assert.equal(effectiveDoorMode({ doorMode: "asignada", doors: cleaned }), "asignada");
    assert.equal(effectiveDoorMode({ doorMode: "enlace", doors: cleaned }), "enlace");
  });

  it("reconoce puerta explícita por id, nombre, acentos o número de columna Excel", () => {
    const doors = [
      { id: "norte", name: "Acceso Jardín 1" },
      { id: "sur", name: "Portón Principal 2" },
    ];
    assert.equal(matchExplicitDoor("norte", doors)?.id, "norte");
    assert.equal(matchExplicitDoor("acceso jardin 1", doors)?.id, "norte");
    assert.equal(matchExplicitDoor("2", doors)?.id, "sur");
    assert.equal(matchExplicitDoor("Puerta 2", doors)?.id, "sur");
    assert.equal(matchExplicitDoor("porton", doors)?.id, "sur");
    assert.equal(matchExplicitDoor("inexistente", doors), null);
  });

  it("asigna puertas determinísticamente por lado, por mesa y automático", () => {
    const doors = defaultDoors(2);
    const novioGuest = { id: "g-novio", side: "novio" as const, note: "Mesa 4", door: null };
    const noviaGuest = { id: "g-novia", side: "novia" as const, note: "  mesa   4 ", door: null };

    assert.equal(computeDoorAssignment(doors, "lado", "ev1", novioGuest).id, "p1");
    assert.equal(computeDoorAssignment(doors, "lado", "ev1", noviaGuest).id, "p2");

    // En regla por mesa, distintas variantes de "Mesa 4" y "4" caen siempre en la misma puerta
    const byMesaA = computeDoorAssignment(doors, "mesa", "ev1", novioGuest);
    const byMesaB = computeDoorAssignment(doors, "mesa", "ev1", noviaGuest);
    const byMesaC = computeDoorAssignment(doors, "mesa", "ev1", { ...novioGuest, note: "4" });
    assert.equal(byMesaA.id, byMesaB.id);
    assert.equal(byMesaA.id, byMesaC.id);

    // La puerta explícita del invitado prevalece sobre cualquier regla automática
    assert.equal(
      computeDoorAssignment(doors, "lado", "ev1", { ...novioGuest, door: "Puerta 2" }).id,
      "p2",
    );

    // En modo "enlace" o "unica" no restringe a una puerta fija
    assert.equal(
      assignedDoorForGuest({ id: "ev1", doorMode: "enlace", doors, doorRule: "lado" }, novioGuest),
      null,
    );
  });

  it("resume pases e ingresos por puerta", () => {
    const doors = defaultDoors(2);
    const event = { id: "ev-sum", doorMode: "asignada" as const, doorRule: "lado" as const, doors };
    const list: Guest[] = [
      {
        id: "1",
        eventId: "ev-sum",
        name: "Uno",
        side: "novio",
        email: "",
        phone: "",
        party: 3,
        note: "",
        status: "Ingresado",
        token: "t1",
        scannedAt: 100,
        arrived: 2,
        entry: "pase",
      },
      {
        id: "2",
        eventId: "ev-sum",
        name: "Dos",
        side: "novia",
        email: "",
        phone: "",
        party: 4,
        note: "",
        status: "Pendiente",
        token: "t2",
        scannedAt: null,
        arrived: null,
        entry: null,
      },
    ];
    const summary = doorSummaries(event, list);
    assert.equal(summary.length, 2);
    assert.deepEqual(summary[0], {
      door: doors[0],
      invitations: 1,
      expectedPeople: 3,
      admitted: 1,
      insidePeople: 2,
    });
    assert.deepEqual(summary[1], {
      door: doors[1],
      invitations: 1,
      expectedPeople: 4,
      admitted: 0,
      insidePeople: 0,
    });
  });
});

describe("anti-doble paso entre diferentes puertas sin internet (IndexedDB)", () => {
  it("impide que 1 QR pase en otra puerta aun con dos bases desconectadas y bloquea repetición en su propia puerta", async () => {
    const doors = defaultDoors(2);
    const event: WeddingEvent = {
      id: "ev-offline-doors",
      groom: "Mateo",
      bride: "Valentina",
      date: "2026-11-14",
      time: "18:00",
      place: "Jardín",
      photo: null,
      secret: "secreto-evento",
      demo: false,
      createdAt: 1,
      doorMode: "asignada",
      doorRule: "lado",
      doors,
    };
    const guestNovio: Guest = {
      id: "guest-novio-1",
      eventId: event.id,
      name: "Carlos Ruiz",
      side: "novio",
      email: "",
      phone: "",
      party: 2,
      note: "Mesa 1",
      status: "Pendiente",
      token: "ME1.ev-offline-doors.guest-novio-1.sig12345678901234",
      scannedAt: null,
      arrived: null,
      entry: null,
    };
    await dbPutEvent(event);
    await dbPutGuests([guestNovio]);

    // 1. Sin elegir puerta en la tablet -> no autoriza a ciegas
    const noDoor = await dbAdmitGuest({
      eventId: event.id,
      guestId: guestNovio.id,
      expectedSecret: event.secret,
      token: guestNovio.token,
      entry: "pase",
      tabletDoorId: null,
    });
    assert.equal(noDoor.kind, "no-door");

    // 2. En Puerta 2 (estando el invitado todavía Pendiente, simulando tablet en modo avión sin sincronizar):
    //    se rechaza de inmediato por pertenecer a Puerta 1.
    const wrongDoor = await dbAdmitGuest({
      eventId: event.id,
      guestId: guestNovio.id,
      expectedSecret: event.secret,
      token: guestNovio.token,
      entry: "pase",
      tabletDoorId: "p2",
    });
    assert.equal(wrongDoor.kind, "wrong-door");
    if (wrongDoor.kind === "wrong-door") {
      assert.equal(wrongDoor.assignedDoor.name, "Puerta 1");
      assert.equal(wrongDoor.currentDoor.name, "Puerta 2");
    }

    // 3. En Puerta 1 (su puerta correcta): entra una única vez y estampa "Puerta 1".
    const okDoor1 = await dbAdmitGuest({
      eventId: event.id,
      guestId: guestNovio.id,
      expectedSecret: event.secret,
      token: guestNovio.token,
      entry: "pase",
      tabletDoorId: "p1",
    });
    assert.equal(okDoor1.kind, "ok");
    if (okDoor1.kind === "ok") {
      assert.equal(okDoor1.guest.admittedDoor, "Puerta 1");
    }

    // 4. Segundo intento en Puerta 1: rechazado como código usado.
    const repeatDoor1 = await dbAdmitGuest({
      eventId: event.id,
      guestId: guestNovio.id,
      expectedSecret: event.secret,
      token: guestNovio.token,
      entry: "pase",
      tabletDoorId: "p1",
    });
    assert.equal(repeatDoor1.kind, "used");
  });

  it("importa la columna puerta del CSV y la exporta protegida en el cierre", async () => {
    const csv = "nombre,lado,personas,mesa,puerta\nLaura Gómez,novia,2,5,=Puerta 2\n";
    const parsed = rowsToDrafts(parseCsv(csv), null);
    assert.equal(parsed.drafts.length, 1);
    assert.equal(parsed.drafts[0].door, "=Puerta 2");

    const event = {
      id: "ev-csv",
      groom: "Ana",
      bride: "Luis",
      date: "2026-12-01",
      place: "Salón",
    } as WeddingEvent;
    const guest = {
      id: "g-csv",
      eventId: "ev-csv",
      name: "Laura Gómez",
      side: "novia",
      party: 2,
      status: "Pendiente",
      email: "",
      phone: "",
      note: "5",
      door: "=Puerta 2",
      token: "t",
      scannedAt: null,
      arrived: null,
      entry: null,
    } as Guest;
    const exported = await closingCsv(event, [guest]).text();
    assert.ok(exported.includes("'=Puerta 2"));
  });

  it("incluye la puerta asignada en el pase, texto de invitación y hoja imprimible", async () => {
    await boot();
    const ev = await createEvent({
      groom: "Diego",
      bride: "Sofía",
      date: "2026-11-21",
      time: "19:00",
      place: "Hacienda",
      photo: null,
    });
    await configureEventDoors(ev.id, {
      doorMode: "asignada",
      doors: [
        { id: "norte", name: "Acceso Norte" },
        { id: "sur", name: "Acceso Sur" },
      ],
      doorRule: "lado",
    });
    await addGuests(ev.id, [
      { name: "Mario Luna", side: "novio", email: "", phone: "", party: 2, note: "" },
      { name: "Lucía Vega", side: "novia", email: "", phone: "", party: 1, note: "" },
    ]);
    const { dbGetAll } = await import("./db.ts");
    const stored = await dbGetAll();
    const updatedEv = stored.events.find((e) => e.id === ev.id)!;
    const mario = stored.guests.find((g) => g.eventId === ev.id && g.name === "Mario Luna")!;
    const pass = passFromGuest(updatedEv, mario);
    assert.equal(pass.door, "Acceso Norte");
    assert.ok(inviteText(pass).includes("Acceso asignado: Acceso Norte"));
    const html = printSheetHtml({
      title: "Diego y Sofía",
      subtitle: "21 de noviembre",
      cards: [
        {
          name: mario.name,
          side: "Invitado del novio",
          party: 2,
          token: mario.token,
          qr: "data:image/png;base64,AAAA",
          door: pass.door,
        },
      ],
    });
    assert.ok(html.includes("Acceso Norte"));
  });

  it("serializa escaneos simultáneos entre múltiples puertas enlazadas sin internet y avisa al desconectar", async () => {
    // Simulador ligero de WebRTC en memoria para probar el hub multipuerta real
    class FakeChannel {
      label: string;
      readyState: RTCDataChannelState = "connecting";
      bufferedAmount = 0;
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((ev: { data: string }) => void) | null = null;
      peer: FakeChannel | null = null;
      constructor(label: string) {
        this.label = label;
      }
      send(data: string) {
        const target = this.peer;
        if (target && target.readyState === "open") {
          queueMicrotask(() => target.onmessage?.({ data }));
        }
      }
      close() {
        if (this.readyState === "closed") return;
        this.readyState = "closed";
        this.onclose?.();
        if (this.peer && this.peer.readyState !== "closed") {
          this.peer.readyState = "closed";
          this.peer.onclose?.();
        }
      }
    }

    const offerRegistry = new Map<string, FakePC>();
    class FakePC {
      id = Math.random().toString(36).slice(2);
      iceGatheringState = "complete";
      connectionState: RTCPeerConnectionState = "new";
      localDescription: RTCSessionDescriptionInit | null = null;
      remoteDescription: RTCSessionDescriptionInit | null = null;
      ondatachannel: ((ev: { channel: RTCDataChannel }) => void) | null = null;
      onconnectionstatechange: (() => void) | null = null;
      createdChannel: FakeChannel | null = null;
      remotePC: FakePC | null = null;

      createDataChannel(label: string) {
        const ch = new FakeChannel(label);
        this.createdChannel = ch;
        return ch as unknown as RTCDataChannel;
      }
      async createOffer() {
        return { type: "offer" as const, sdp: `sdp-offer-${this.id}` };
      }
      async createAnswer() {
        return { type: "answer" as const, sdp: `sdp-answer-${this.id}` };
      }
      async setLocalDescription(desc: RTCSessionDescriptionInit) {
        this.localDescription = {
          ...desc,
          toJSON: () => ({ type: desc.type, sdp: desc.sdp }),
        } as RTCSessionDescriptionInit;
        if (desc.type === "offer") offerRegistry.set(desc.sdp!, this);
      }
      async setRemoteDescription(desc: RTCSessionDescriptionInit) {
        this.remoteDescription = desc;
        if (desc.type === "offer") {
          this.remotePC = offerRegistry.get(desc.sdp!) ?? null;
        } else if (desc.type === "answer") {
          // Conectar canales de ambos extremos al completar el apretón de manos
          for (const candidate of offerRegistry.values()) {
            if (candidate === this && this.createdChannel) {
              const clientCh = new FakeChannel(this.createdChannel.label);
              this.createdChannel.peer = clientCh;
              clientCh.peer = this.createdChannel;
              this.connectionState = "connected";
              this.createdChannel.readyState = "open";
              clientCh.readyState = "open";
              // Notificar apertura al host
              queueMicrotask(() => this.createdChannel?.onopen?.());
            }
          }
        }
      }
      addEventListener() {}
      removeEventListener() {}
      close() {
        this.connectionState = "closed";
        this.createdChannel?.close();
      }
    }

    const prevRTC = globalThis.RTCPeerConnection;
    globalThis.RTCPeerConnection = FakePC as unknown as typeof RTCPeerConnection;
    try {
      await boot();
      const ev = await createEvent({
        groom: "Andrés",
        bride: "Camila",
        date: "2026-12-12",
        time: "20:00",
        place: "Jardín Sur",
        photo: null,
      });
      await configureEventDoors(ev.id, {
        doorMode: "enlace",
        doors: defaultDoors(3),
        strictDoorLink: true,
      });
      await addGuests(ev.id, [
        { name: "Invitado Único", side: "novio", email: "", phone: "", party: 2, note: "" },
      ]);
      const { dbGetAll } = await import("./db.ts");
      const guest = (await dbGetAll()).guests.find((g) => g.eventId === ev.id)!;

      // Sin enlazar puertas todavía -> bloquea y exige internet/enlace
      const blockedBeforeLink = await admitToken(ev.id, guest.token);
      assert.equal(blockedBeforeLink.ok, false);
      if (!blockedBeforeLink.ok) assert.equal(blockedBeforeLink.reason, "door-offline");

      // Enlazar Puerta 2 y Puerta 3 a la tablet principal (3 puertas activas sin internet)
      const offer2 = await offerSync(ev.id);
      const fakeAnswer2 = await (async () => {
        // Construir respuesta válida sin tocar el estado del host usando un segundo FakePC aislado
        const bytes = Uint8Array.from(atob(offer2.slice(8)), (c) => c.charCodeAt(0));
        const plain = await new Response(
          new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate")),
        ).text();
        const parsed = JSON.parse(plain);
        const ansPayload = JSON.stringify({
          ...parsed,
          description: { type: "answer", sdp: "sdp-ans-2" },
        });
        const comp = await new Response(
          new Blob([ansPayload]).stream().pipeThrough(new CompressionStream("deflate")),
        ).arrayBuffer();
        let bin = "";
        for (const b of new Uint8Array(comp)) bin += String.fromCharCode(b);
        return `MESYNC1:${btoa(bin)}`;
      })();
      await completeSync(fakeAnswer2);

      // Enlazar una tercera puerta sin desconectar la segunda
      const offer3 = await offerSync(ev.id);
      const bytes3 = Uint8Array.from(atob(offer3.slice(8)), (c) => c.charCodeAt(0));
      const plain3 = await new Response(
        new Blob([bytes3]).stream().pipeThrough(new DecompressionStream("deflate")),
      ).text();
      const parsed3 = JSON.parse(plain3);
      const ansPayload3 = JSON.stringify({
        ...parsed3,
        description: { type: "answer", sdp: "sdp-ans-3" },
      });
      const comp3 = await new Response(
        new Blob([ansPayload3]).stream().pipeThrough(new CompressionStream("deflate")),
      ).arrayBuffer();
      let bin3 = "";
      for (const b of new Uint8Array(comp3)) bin3 += String.fromCharCode(b);
      await completeSync(`MESYNC1:${btoa(bin3)}`);

      await new Promise((r) => setTimeout(r, 30));
      assert.equal(isSyncConnectedForEvent(ev.id), true);

      // Escaneo simultáneo del MISMO código QR desde Puerta 1, Puerta 2 y Puerta 3 al mismo milisegundo
      const [scan1, scan2, scan3] = await Promise.all([
        admitToken(ev.id, guest.token, { fromPeer: true, doorName: "Puerta 1" }),
        admitToken(ev.id, guest.token, { fromPeer: true, doorName: "Puerta 2" }),
        admitToken(ev.id, guest.token, { fromPeer: true, doorName: "Puerta 3" }),
      ]);
      const outcomes = [scan1, scan2, scan3];
      const authorized = outcomes.filter((o) => o.ok);
      const rejected = outcomes.filter((o) => !o.ok);
      assert.equal(authorized.length, 1, "Exactamente 1 puerta puede autorizar el QR");
      assert.equal(rejected.length, 2, "Las otras 2 puertas deben rechazarlo como usado");
      for (const rej of rejected) {
        if (!rej.ok) {
          assert.equal(rej.reason, "used");
          assert.equal(rej.duplicate, true);
          assert.equal(rej.doorName, "Puerta 1");
        }
      }

      // Al desconectar el enlace, vuelve a advertir que se necesita internet/enlace
      disconnectSync();
      assert.equal(isSyncConnectedForEvent(ev.id), false);
      const afterDisconnect = await admitToken(ev.id, guest.token);
      assert.equal(afterDisconnect.ok, false);
      if (!afterDisconnect.ok) assert.equal(afterDisconnect.reason, "door-offline");

      // También verificar que answerSync decodifica ofertas válidas
      const freshOffer = await offerSync(ev.id);
      const generatedAnswer = await answerSync(freshOffer);
      assert.ok(generatedAnswer.startsWith("MESYNC1:"));
      disconnectSync();

      // ── PIN de emparejamiento ────────────────────────────────────────────
      // La oferta con PIN no lleva el PIN dentro del QR.
      const offerWithPin = async () => {
        const offer = await offerSync(ev.id, { requirePin: true });
        const shown = syncSnapshot().pairingPin!;
        assert.match(shown, /^\d{6}$/);
        assert.equal(offer.includes(shown), false, "el PIN no debe viajar en el QR");
        assert.equal(await offerRequiresPin(offer), true);
        return { offer, shown, session: await decodeSignal(offer).then((s) => s.session) };
      };
      assert.equal(await offerRequiresPin(freshOffer), false);

      /** Decodifica un QR/código MESYNC1 a su sobre JSON. */
      const decodeSignal = async (text: string) => {
        const bytes = Uint8Array.from(atob(text.slice(8)), (c) => c.charCodeAt(0));
        return JSON.parse(
          await new Response(
            new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate")),
          ).text(),
        );
      };

      /** Construye la respuesta que devolvería una tablet receptora real. */
      const answerFor = async (offer: string, pin?: string) => {
        const bytes = Uint8Array.from(atob(offer.slice(8)), (c) => c.charCodeAt(0));
        const parsed = JSON.parse(
          await new Response(
            new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate")),
          ).text(),
        );
        const payload: Record<string, unknown> = {
          ...parsed,
          description: { type: "answer", sdp: `sdp-${Math.random().toString(36).slice(2)}` },
        };
        delete payload.pin;
        if (pin) payload.proof = await pairingProof(pin, parsed.session, parsed.eventId);
        const comp = await new Response(
          new Blob([JSON.stringify(payload)])
            .stream()
            .pipeThrough(new CompressionStream("deflate")),
        ).arrayBuffer();
        let bin = "";
        for (const b of new Uint8Array(comp)) bin += String.fromCharCode(b);
        return `MESYNC1:${btoa(bin)}`;
      };

      // PIN incorrecto → no enlaza, lo dice y cierra el enlace (nada de fuerza bruta)
      const wrong = await offerWithPin();
      await assert.rejects(
        completeSync(await answerFor(wrong.offer, wrong.shown === "000000" ? "111111" : "000000")),
        /PIN incorrecto/,
      );
      assert.equal(isSyncConnectedForEvent(ev.id), false);
      // Una respuesta fabricada sin la prueba del PIN tampoco enlaza
      const unproven = await offerWithPin();
      await assert.rejects(completeSync(await answerFor(unproven.offer)), /PIN incorrecto/);
      assert.equal(isSyncConnectedForEvent(ev.id), false);
      // PIN correcto → enlaza
      const good = await offerWithPin();
      await completeSync(await answerFor(good.offer, good.shown));
      await new Promise((r) => setTimeout(r, 30));
      assert.equal(isSyncConnectedForEvent(ev.id), true);
      assert.equal(syncSnapshot().pairingPin, null, "el PIN se consume al verificar");
      disconnectSync();

      // Flujo real receptor: answerSync exige el PIN y devuelve una prueba verificable.
      // (Receptor y principal comparten módulo aquí, así que esto va al final: answerSync
      //  toma el rol de receptora y descarta el estado de la principal.)
      const real = await offerWithPin();
      await assert.rejects(answerSync(real.offer), /pide el PIN/);
      await assert.rejects(answerSync(real.offer, { pin: "12345" }), /6 dígitos/);
      const receiverAnswer = await answerSync(real.offer, { pin: real.shown });
      const received = await decodeSignal(receiverAnswer);
      assert.equal(received.pin, undefined);
      assert.equal(received.proof, await pairingProof(real.shown, real.session, ev.id));
      assert.equal(received.session, real.session);
      disconnectSync();
      assert.equal(isSyncConnectedForEvent(ev.id), false);
    } finally {
      globalThis.RTCPeerConnection = prevRTC;
    }
  });
});
