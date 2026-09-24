import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryRouter,
  useLocation,
} from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicRoute } from "../../../app/router/ProtectedRoute";
import { ApiError } from "../../../shared/api/api-client";
import type { LoginResponse } from "../types/auth.types";
import { AuthProvider, useAuth } from "../context/AuthContext";
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

function AuthStatus() {
  const { status, session } = useAuth();
  return <output data-testid="auth-status">{`${status}:${session?.user.id ?? "none"}`}</output>;
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
        <AuthStatus />
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );

  return router;
}

describe("LoginPage routing", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    dependencies.login.mockReset();
    dependencies.recovery.mockReset();
  });

  it("establishes the session and returns to the requested private destination", async () => {
    dependencies.login.mockResolvedValue(session);
    const router = renderLogin(
      "/login?next=%2Fapp%2Fresources%2F123%3Ftab%3Dimages%23gallery",
    );

    await screen.findByRole("heading", { name: /Bienvenido/ });
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
    expect(await screen.findByText(/Private at/)).toBeInTheDocument();
  });

  it("uses app as the post-login fallback when next is unsafe", async () => {
    dependencies.login.mockResolvedValue(session);
    const router = renderLogin("/login?next=https%3A%2F%2Fexample.com");

    await screen.findByRole("heading", { name: /Bienvenido/ });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "jeni@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "TopPassword123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/app"));
  });

  it("validates required fields and associates errors with their controls", async () => {
    renderLogin("/login");

    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText("Ingresa tu correo electrónico.")).toBeInTheDocument();
    expect(screen.getByText("Ingresa tu contraseña.")).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Correo electrónico")).toHaveAttribute("aria-describedby", "email-error");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("aria-describedby", "password-error");
    expect(dependencies.login).not.toHaveBeenCalled();
  });

  it("rejects an invalid email without calling the login API", async () => {
    renderLogin("/login");
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "not-an-email" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "TopPassword123!" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByText("Ingresa un correo electrónico válido.")).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toHaveAttribute("aria-invalid", "true");
    expect(dependencies.login).not.toHaveBeenCalled();
  });

  it("persists the session locally when Mantener sesión iniciada is checked", async () => {
    dependencies.login.mockResolvedValue(session);
    renderLogin("/login");
    fireEvent.click(screen.getByLabelText("Mantener sesión iniciada"));
    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "jeni@example.com" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "TopPassword123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    await waitFor(() => expect(localStorage.getItem("top.auth.session.v1")).toContain('"mode":"PERSISTENT"'));
    expect(sessionStorage.getItem("top.auth.session.v1")).toBeNull();
  });

  it("allows the password to be revealed without changing the login contract", () => {
    renderLogin("/login");

    const password = screen.getByLabelText("Contraseña");
    const toggle = screen.getByRole("button", { name: "Mostrar contraseña" });

    expect(password).toHaveAttribute("type", "password");
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ocultar contraseña" })).toHaveAttribute("aria-pressed", "true");
  });

  it("allows a corrected submission after client validation fails", async () => {
    dependencies.login.mockResolvedValue(session);
    const router = renderLogin("/login");
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    await waitFor(() => expect(screen.getByText("Ingresa tu correo electrónico.")).toBeVisible());
    expect(dependencies.login).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "jeni@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "TopPassword123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/app"));
    expect(dependencies.login).toHaveBeenCalledTimes(1);
  });

  it("shows pending state and ignores duplicate form submissions until the request settles", async () => {
    let resolveLogin!: (value: LoginResponse) => void;
    dependencies.login.mockReturnValue(new Promise<LoginResponse>((resolve) => {
      resolveLogin = resolve;
    }));
    const router = renderLogin("/login");
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "jeni@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "TopPassword123!" },
    });

    const submitButton = screen.getByRole("button", { name: "Iniciar sesión" });
    const form = submitButton.closest("form");
    expect(form).not.toBeNull();
    // Two events in one batch exercise the synchronous lock, before disabled renders.
    act(() => {
      fireEvent.submit(form!);
      fireEvent.submit(form!);
    });

    const pendingButton = await screen.findByRole("button", { name: "Ingresando..." });
    expect(pendingButton).toBeDisabled();
    fireEvent.submit(form!);
    expect(dependencies.login).toHaveBeenCalledTimes(1);

    resolveLogin(session);
    await waitFor(() => expect(router.state.location.pathname).toBe("/app"));
    expect(dependencies.login).toHaveBeenCalledTimes(1);
  });

  it.each([
    { status: 400, message: "Revisa los datos ingresados." },
    { status: 401, message: "El correo o la contraseña no son correctos." },
    { status: 403, message: "Tu usuario está deshabilitado." },
    { status: 500, message: "No pudimos iniciar sesión. Intenta nuevamente." },
  ])("shows the expected user-facing message for HTTP $status", async ({ status, message }) => {
    dependencies.login.mockRejectedValue(new ApiError(status, "backend detail"));
    const router = renderLogin("/login");
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "jeni@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "TopPassword123!" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(router.state.location.pathname).toBe("/login");
    expect(screen.queryByText(/Private at/)).not.toBeInTheDocument();
    expect(screen.getByTestId("auth-status")).toHaveTextContent("unauthenticated:none");
    expect(sessionStorage.getItem("top.auth.session.v1")).toBeNull();
  });

  it("shows a recoverable message when the network fails", async () => {
    dependencies.login.mockRejectedValue(new Error("network down"));
    const router = renderLogin("/login");
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "jeni@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "TopPassword123!" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos iniciar sesión. Intentá nuevamente.",
    );
    expect(router.state.location.pathname).toBe("/login");
    expect(screen.getByTestId("auth-status")).toHaveTextContent("unauthenticated:none");
  });

  it("allows retry after failure and clears the old error after success", async () => {
    dependencies.login
      .mockRejectedValueOnce(new ApiError(401, "invalid credentials"))
      .mockResolvedValueOnce(session);
    const router = renderLogin("/login");
    const email = screen.getByLabelText("Correo electrónico");
    const password = screen.getByLabelText("Contraseña");
    fireEvent.change(email, { target: { value: "jeni@example.com" } });
    fireEvent.change(password, { target: { value: "wrong-password" } });

    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El correo o la contraseña no son correctos.",
    );

    fireEvent.change(password, { target: { value: "TopPassword123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/app"));
    expect(dependencies.login).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated:user-1");
  });
});
