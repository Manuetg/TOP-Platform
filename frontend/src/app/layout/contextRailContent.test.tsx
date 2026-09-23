import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContextRail } from "../../shared/ui/ContextRail";
import { getContextRailContent } from "./contextRailContent";

describe("context rail scope", () => {
  it.each(["/app", "/app/calendar", "/app/bookings/a", "/app/resources", "/app/payments"])("does not consume operational space on %s", (path) => {
    expect(getContextRailContent(path)).toBeNull();
  });
  it.each(["/app/resources/new", "/app/contacts/new", "/app/pricing/new"])("provides actual guidance on %s without synthetic tenant data", (path) => {
    const blocks = getContextRailContent(path);
    expect(blocks).not.toBeNull();
    render(<ContextRail title="Para tener en cuenta" blocks={blocks!} />);
    expect(screen.getByRole("complementary", { name: "Para tener en cuenta" })).toBeVisible();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
