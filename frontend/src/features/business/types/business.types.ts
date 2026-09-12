export type BusinessStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";
export interface Business { id: string; name: string; legalName: string | null; taxId: string | null; timezone: string; currency: string; status: BusinessStatus; createdAt: string; updatedAt: string; }
