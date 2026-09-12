export type BusinessStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";
export interface Business { id: string; name: string; legalName: string; taxId: string; timezone: string; currency: string; status: BusinessStatus; createdAt: string; updatedAt: string; }
