import { apiRequest } from "../../../shared/api/api-client";
export interface Subscription {
  subscription: { planCode: string; planName: string };
  entitlements: { maxResources: number };
  usage: { resources: { used: number; available: number; percentage: number; state: "NORMAL" | "WARNING" | "LIMIT"; canCreate: boolean } };
  upgrade: { status: "AVAILABLE" | "REQUESTED"; requestedAt: string | null };
}
export function getSubscription(businessId: string, accessToken: string, signal: AbortSignal) { return apiRequest<Subscription>(`/businesses/${businessId}/subscription`, { accessToken, signal }); }
export function requestUpgrade(businessId: string, accessToken: string, signal: AbortSignal) { return apiRequest<Subscription["upgrade"]>(`/businesses/${businessId}/subscription/upgrade-request`, { method: "POST", accessToken, signal }); }
