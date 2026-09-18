import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryRouter,
  useLocation,
} from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicRoute } from "../../../app/router/ProtectedRoute";
import type { LoginResponse } from "../types/auth.types";
import { AuthProvider } from "../context/AuthContext";
import { LoginPage } from "./LoginPage";

const dependencies = vi.hoisted(() => ({
  login: vi.fn(),
  recovery: vi.fn(),
}));

vi.mock("../api/login", () => ({ login: dependencies.login }));
vi.mock("../api/refresh-session", () => ({ refreshSession: vi.fn() }));
vi.mock("../../../shared/api/api-client", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("../../../shared/api/api-client")
  >();
  return {
    ...original,
    configureUnauthorizedRecovery: dependencies.recovery,
  };
});

const session: LoginResponse = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  tokenType: "Bearer",
  expiresIn: 900,
  user: { id: "user-1", email: "jeni@example.com", status: "ACTIVE" },
  memberships: [{ businessId: "business-1", role: "OWNER" }],
};

function PrivateContent() {
  const location = useLocation();
  return <p>Private at {`${location.pathname}${location.search}${location.hash}`}</p>;
}

function renderLogin(initialEntry: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/login",
        element: <PublicRoute />,
        children: [{ index: true, element: <LoginPage /> }],
      },
      {
        path: "/app",
        element: <Outlet />,
        children: [{ path: "*", element: <PrivateContent /> }],
      },
    ],
    { initialEntries: [initialEntry] },
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );

  return router;
}

describe("LoginPage routing", () => {
  beforeEach(() => {
    sessionStorage.clear();
    dependencies.login.mockReset();
    dependencies.recovery.mockReset();
  });

  it("establishes the session and returns to the requested private destination", async () => {
    dependencies.login.mockResolvedValue(session);
    const router = renderLogin(
      "/login?next=%2Fapp%2Fresources%2F123%3Ftab%3Dimages%23gallery",
    );

    await screen.findByRole("heading", { name: "Iniciar sesión" });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "jeni@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "TopPassword123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/app/resources/123"),
    );
    expect(router.state.location.search).toBe("?tab=images");
    expect(router.state.location.hash).toBe("#gallery");
    expect(dependencies.login).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Private at/)).toBeInTheDocument();
  });

  it("uses app as the post-login fallback when next is unsafe", async () => {
    dependencies.login.mockResolvedValue(session);
    const router = renderLogin("/login?next=https%3A%2F%2Fexample.com");

    await screen.findByRole("heading", { name: "Iniciar sesión" });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "jeni@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "TopPassword123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/app"));
  });
});
