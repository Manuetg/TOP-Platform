import type { QueryKey } from "@tanstack/react-query";

const tenantPrefixes = ["resources", "amenities", "contacts", "bookings", "blocks", "dashboard", "seasonal-rates", "rate-plans", "availability", "payments", "global-search", "payment-history", "outstanding-balance", "business-profile"];
export function isTenantQuery(key: QueryKey): boolean { return tenantPrefixes.includes(String(key[0])); }

/** Match existing tenant key contracts without clearing unrelated application queries. */
export function isBusinessQuery(key: QueryKey, businessId: string): boolean {
  const prefix = key[0];
  if (!businessId) return false;
  if (["resources", "amenities", "contacts", "bookings", "blocks", "dashboard", "seasonal-rates"].includes(String(prefix))) return key[1] === businessId;
  if (prefix === "rate-plans") return key[key[1] === "selectable" ? 2 : 1] === businessId;
  if (["availability", "payments", "global-search", "payment-history", "outstanding-balance", "business-profile"].includes(String(prefix))) return key[2] === businessId;
  return false;
}
