export type Side = "novio" | "novia";
export type GuestStatus = "Pendiente" | "Ingresado";

export type WeddingEvent = {
  id: string;
  groom: string;
  bride: string;
  date: string;
  time: string;
  place: string;
  photo: Blob | null;
  secret: string;
  demo: boolean;
  createdAt: number;
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
};

export type AdmitResult =
  | { ok: true; guest: Guest }
  | {
      ok: false;
      reason: "invalid" | "other-event" | "used";
      guest?: Guest;
      message: string;
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
