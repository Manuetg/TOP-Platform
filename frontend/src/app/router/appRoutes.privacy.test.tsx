import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "./appRoutes";

const auth = vi.hoisted(() => ({ status: "unauthenticated" }));
vi.mock("../../features/auth/context/AuthContext", () => ({
  useAuth: () => ({ status: auth.status, session: null }),
}));

describe("public cookie information route", () => {
  beforeEach(() => { auth.status = "unauthenticated"; });

  it.each(["unauthenticated", "restoring", "authenticated"])("is accessible while auth is %s", async (status) => {
    auth.status = status;
    const router = createMemoryRouter(appRoutes, { initialEntries: ["/cookies"] });
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole("heading", { name: "Cookies y almacenamiento local" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/cookies");
    expect(screen.getByRole("link", { name: "Preferencias" })).toHaveAttribute("href", "#preferencias");
  });
});
