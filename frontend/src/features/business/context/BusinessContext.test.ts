import { describe, expect, it } from "vitest";
import { resolveBusiness } from "./BusinessContext";
import type { Business } from "../types/business.types";

const business = (id: string, status: Business["status"] = "ACTIVE"): Business => ({ id, name: id, legalName: null, taxId: null, timezone: "America/Asuncion", currency: "PYG", status, createdAt: "2026-01-01", updatedAt: "2026-01-01" });
const membership = (businessId: string) => ({ businessId, role: "OWNER" as const });

describe("resolveBusiness", () => {
  it("returns no candidate for zero, suspended or archived businesses", () => {
    expect(resolveBusiness([], [])).toMatchObject({ candidates: [], business: null });
    expect(resolveBusiness([business("a", "SUSPENDED")], [membership("a")])).toMatchObject({ candidates: [] });
    expect(resolveBusiness([business("a", "ARCHIVED")], [membership("a")])).toMatchObject({ candidates: [] });
  });
  it("selects exactly one active business with matching membership", () => {
    expect(resolveBusiness([business("a")], [membership("a")])).toMatchObject({ business: { id: "a" }, membership: { businessId: "a", role: "OWNER" }, mismatch: false });
  });
  it("does not select multiple active businesses", () => {
    expect(resolveBusiness([business("a"), business("b")], [membership("a"), membership("b")])).toMatchObject({ business: null, candidates: [{ id: "a" }, { id: "b" }] });
  });
  it("fails closed for active businesses without matching memberships", () => {
    expect(resolveBusiness([business("a")], [])).toMatchObject({ business: null, membership: null, mismatch: true });
  });
});
