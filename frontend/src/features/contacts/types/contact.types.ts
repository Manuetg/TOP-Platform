export type ContactStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "ARCHIVED";

export interface Contact {
  id: string;
  businessId: string;
  name: string;
  lastName: string | null;
  fullName: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  documentType: string | null;
  documentNumber: string | null;
  country: string | null;
  city: string | null;
  status: ContactStatus;
  createdAt: string;
  updatedAt: string;
}