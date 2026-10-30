export type Side = "novio" | "novia";
export type GuestStatus = "Pendiente" | "Ingresado";
export type EntryKind = "pase" | "nombre" | "puerta";
export type QrMotif = "hoja" | "citrico" | "ave" | "flor";

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
};

export type SendChannel = "whatsapp" | "correo" | "compartir";

export type AdmitResult =
  | { ok: true; guest: Guest }
  | {
      ok: false;
      reason: "invalid" | "other-event" | "used" | "closed";
      guest?: Guest;
      message: string;
      /** El pase ya se había usado: lectura repetida (posible captura de pantalla). */
      duplicate?: boolean;
      /** Hora del primer ingreso, para el aviso de la puerta. */
      firstEntryAt?: number | null;
    };

export type DraftGuest = {
  name: string;
  side: Side;
  email: string;
  phone: string;
  party: number;
  note: string;
};

export type ImportReport = {
  added: number;
  skipped: number;
};
