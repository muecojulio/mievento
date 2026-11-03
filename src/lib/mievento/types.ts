export type Side = "novio" | "novia";
export type GuestStatus = "Pendiente" | "Ingresado";
export type EntryKind = "pase" | "nombre" | "puerta";
export type QrMotif = "hoja" | "citrico" | "ave" | "flor";

/**
 * Estrategia para evitar que un mismo código QR se pase en diferentes puertas:
 * - "unica": una sola puerta / una sola tablet.
 * - "asignada": sin internet ni red local (100 % offline); cada código QR solo
 *   es válido en su puerta asignada (una tablet por puerta).
 * - "enlace": el invitado puede entrar por cualquier puerta, pero exige enlace
 *   en vivo entre las tablets (red local Wi-Fi/hotspot sin internet o internet);
 *   si no hay conexión, avisa y bloquea para que un QR no pase en dos puertas.
 */
export type DoorMode = "unica" | "asignada" | "enlace";

/** Cómo se asigna cada pase a su puerta cuando `doorMode === "asignada"`. */
export type DoorRule = "auto" | "lado" | "mesa" | "manual";

export type EventDoor = {
  id: string;
  name: string;
};

export type WeddingEvent = {
  id: string;
  groom: string;
  bride: string;
  date: string;
  time: string;
  place: string;
  /**
   * Coordenadas y zona horaria del lugar, SOLO si quien organiza lo buscó con
   * la ayuda en línea (Photon/OpenStreetMap + Open-Meteo). Opcionales: los
   * eventos creados antes (y los escritos a mano) siguen sin ubicación exacta
   * y todo lo demás funciona igual, sin internet.
   */
  placeLat?: number | null;
  placeLon?: number | null;
  placeTz?: string;
  photo: Blob | null;
  secret: string;
  demo: boolean;
  createdAt: number;
  motif?: QrMotif;
  closed?: boolean;
  /** Puertas configuradas para el evento (cuando hay más de una entrada). */
  doors?: EventDoor[];
  /** Modo de protección entre puertas. Por omisión "unica". */
  doorMode?: DoorMode;
  /** Regla de reparto de pases por puerta en modo "asignada". */
  doorRule?: DoorRule;
  /** En modo "enlace", exigir conexión activa entre puertas para escanear (true por omisión). */
  strictDoorLink?: boolean;
};

export type Guest = {
  id: string;
  eventId: string;
  name: string;
  side: Side;
  email: string;
  phone: string;
  party: number;
  note: string;
  status: GuestStatus;
  token: string;
  scannedAt: number | null;
  arrived: number | null;
  entry: EntryKind | null;
  /** Última vez que se le envió el pase (WhatsApp, correo o compartir). */
  sentAt?: number | null;
  sentVia?: SendChannel | null;
  /** Puerta asignada manualmente o desde el Excel (id o nombre). */
  door?: string | null;
  /** Nombre de la puerta donde se registró el ingreso. */
  admittedDoor?: string | null;
};

export type SendChannel = "whatsapp" | "correo" | "compartir";

export type AdmitResult =
  | { ok: true; guest: Guest }
  | {
      ok: false;
      reason:
        | "invalid"
        | "other-event"
        | "used"
        | "closed"
        | "wrong-door"
        | "door-offline"
        | "no-door";
      guest?: Guest;
      message: string;
      /** El pase ya se había usado: lectura repetida (posible captura de pantalla). */
      duplicate?: boolean;
      /** Hora del primer ingreso, para el aviso de la puerta. */
      firstEntryAt?: number | null;
      /** Puerta donde ya se usó el código (used) o puerta asignada correcta (wrong-door). */
      doorName?: string | null;
      /** Puerta activa de esta tablet cuando el pase corresponde a otra puerta. */
      currentDoorName?: string | null;
    };

export type DraftGuest = {
  name: string;
  side: Side;
  email: string;
  phone: string;
  party: number;
  note: string;
  door?: string;
};

export type ImportReport = {
  added: number;
  skipped: number;
};
