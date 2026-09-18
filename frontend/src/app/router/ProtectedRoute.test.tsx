import { act, render, screen, waitFor } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryRouter,
  useLocation,
} from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BusinessBoundary } from "../../features/business/components/BusinessBoundary";
import { ProtectedRoute, PublicRoute } from "./ProtectedRoute";

const state = vi.hoisted(() => ({
  authStatus: "unauthenticated" as
    | "restoring"
    | "authenticated"
    | "unauthenticated",
  businessStatus: "ready" as
    | "loading"
    | "ready"
    | "empty"
    | "selection-required"
    | "error",
  privateMount: vi.fn(),
  retry: vi.fn(),
}));

vi.mock("../../features/auth/context/AuthContext", () => ({
  useAuth: () => ({ status: state.authStatus }),
}));

vi.mock("../../features/business/context/BusinessContext", () => ({
  useBusinessContext: () => ({
    status: state.businessStatus,
    retry: state.retry,
  }),
}));

function LoginContent() {
  const location = useLocation();
  return <p>Login at {`${location.pathname}${location.search}${location.hash}`}</p>;
}

function PrivateContent() {
  state.privateMount();
  const location = useLocation();
  return <p>Private at {`${location.pathname}${location.search}${location.hash}`}</p>;
}

function createRouter(initialEntry: string) {
  return createMemoryRouter(
    [
      {
        path: "/login",
        element: <PublicRoute />,
        children: [{ index: true, element: <LoginContent /> }],
      },
      {
        path: "/app",
        element: <ProtectedRoute />,
        children: [
          {
            path: "*",
            element: <PrivateContent />,
          },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  );
}

async function refreshCurrentRoute(
  router: ReturnType<typeof createRouter>,
) {
  const { pathname, search, hash } = router.state.location;
  await act(async () => {
    await router.navigate(`${pathname}${search}${hash}`, { replace: true });
  });
}

describe("protected routing", () => {
  beforeEach(() => {
    state.authStatus = "unauthenticated";
    state.businessStatus = "ready";
    state.privateMount.mockClear();
    state.retry.mockClear();
  });

  it("shows only an accessible loading state while authentication is restoring", () => {
    state.authStatus = "restoring";
    render(<RouterProvider router={createRouter("/app/resources")} />);

    expect(screen.getByText("Cargando sesión...")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(screen.queryByText(/Login at/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Private at/)).not.toBeInTheDocument();
    expect(state.privateMount).not.toHaveBeenCalled();
  });

  it("redirects an anonymous app request to login", async () => {
    const router = createRouter("/app");
    render(<RouterProvider router={router} />);

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toBe("?next=%2Fapp");
    expect(screen.getByText("Login at /login?next=%2Fapp")).toBeInTheDocument();
    expect(state.privateMount).not.toHaveBeenCalled();
  });

  it("preserves a private deep link for an anonymous user", async () => {
    const router = createRouter("/app/resources/123?tab=images#gallery");
    render(<RouterProvider router={router} />);

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(new URLSearchParams(router.state.location.search).get("next")).toBe(
      "/app/resources/123?tab=images#gallery",
    );
  });

  it("renders private content for an authenticated user", () => {
    state.authStatus = "authenticated";
    render(<RouterProvider router={createRouter("/app/resources")} />);

    expect(screen.getByText("Private at /app/resources")).toBeInTheDocument();
  });

  it("redirects an authenticated login route to a validated destination", async () => {
    state.authStatus = "authenticated";
    const router = createRouter(
      "/login?next=%2Fapp%2Fresources%2F123%3Ftab%3Dimages%23gallery",
    );
    render(<RouterProvider router={router} />);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/app/resources/123"),
    );
    expect(router.state.location.search).toBe("?tab=images");
    expect(router.state.location.hash).toBe("#gallery");
  });

  it("falls back to app for an unsafe authenticated login destination", async () => {
    state.authStatus = "authenticated";
    const router = createRouter("/login?next=%2Fapplication");
    render(<RouterProvider router={router} />);

    await waitFor(() => expect(router.state.location.pathname).toBe("/app"));
  });

  it("keeps a deep link through restoring to authenticated", async () => {
    state.authStatus = "restoring";
    const router = createRouter("/app/resources/123?tab=images#gallery");
    render(<RouterProvider router={router} />);

    state.authStatus = "authenticated";
    await refreshCurrentRoute(router);

    expect(
      await screen.findByText(
        "Private at /app/resources/123?tab=images#gallery",
      ),
    ).toBeInTheDocument();
  });

  it("moves from restoring to login when restoration fails", async () => {
    state.authStatus = "restoring";
    const router = createRouter("/app/resources");
    render(<RouterProvider router={router} />);

    state.authStatus = "unauthenticated";
    await refreshCurrentRoute(router);

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(screen.queryByText(/Private at/)).not.toBeInTheDocument();
  });

  it("removes private content after session loss and blocks browser back", async () => {
    state.authStatus = "authenticated";
    const router = createRouter("/app/resources");
    render(<RouterProvider router={router} />);
    expect(screen.getByText("Private at /app/resources")).toBeInTheDocument();

    state.authStatus = "unauthenticated";
    await refreshCurrentRoute(router);
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(screen.queryByText(/Private at/)).not.toBeInTheDocument();

    await router.navigate(-1);
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(screen.queryByText(/Private at/)).not.toBeInTheDocument();
  });

  it.each(["empty", "selection-required"] as const)(
    "keeps authenticated users in the Business flow for %s",
    (businessStatus) => {
      state.authStatus = "authenticated";
      state.businessStatus = businessStatus;
      const router = createMemoryRouter(
        [
          {
            path: "/app",
            element: (
              <ProtectedRoute>
                <BusinessBoundary>
                  <Outlet />
                </BusinessBoundary>
              </ProtectedRoute>
            ),
            children: [{ index: true, element: <PrivateContent /> }],
          },
        ],
        { initialEntries: ["/app"] },
      );

      render(<RouterProvider router={router} />);

      expect(router.state.location.pathname).toBe("/app");
      expect(screen.queryByText(/Login at/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Private at/)).not.toBeInTheDocument();
      expect(
        screen.getByText(
          businessStatus === "empty"
            ? "No tenés un negocio activo disponible."
            : "Seleccioná un negocio para continuar.",
        ),
      ).toBeInTheDocument();
    },
  );
});
