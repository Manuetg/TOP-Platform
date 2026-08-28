import { fireEvent, render, screen } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";
import type { LoginResponse } from "../types/auth.types";

const session: LoginResponse = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  tokenType: "Bearer",
  expiresIn: 900,
  user: {
    id: "user-1",
    email: "jeni@example.com",
    status: "ACTIVE",
  },
  memberships: [
    {
      businessId: "business-1",
      role: "OWNER",
    },
  ],
};

function AuthConsumer() {
  const { session: currentSession, isAuthenticated, establishSession } =
    useAuth();

  return (
    <>
      <span>{isAuthenticated ? "authenticated" : "anonymous"}</span>
      <span>{currentSession?.user.email ?? "no-user"}</span>
      <button type="button" onClick={() => establishSession(session)}>
        establish
      </button>
    </>
  );
}

describe("AuthProvider", () => {
  it("starts without an authenticated session", () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    expect(screen.getByText("anonymous")).toBeInTheDocument();
    expect(screen.getByText("no-user")).toBeInTheDocument();
  });

  it("stores the authenticated session in memory", () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "establish" }));

    expect(screen.getByText("authenticated")).toBeInTheDocument();
    expect(screen.getByText("jeni@example.com")).toBeInTheDocument();
  });
});
