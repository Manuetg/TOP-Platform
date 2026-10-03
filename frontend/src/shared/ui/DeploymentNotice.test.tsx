import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { DeploymentNotice } from "./DeploymentNotice";

const state = vi.hoisted(() => ({ deployment: { profile: "standard" } }));
vi.mock("../config/deployment", () => ({ deploymentConfig: state.deployment }));

beforeEach(() => { state.deployment.profile = "standard"; });

it("no añade avisos al despliegue estándar", () => {
  const { container } = render(<DeploymentNotice />);
  expect(container).toBeEmptyDOMElement();
});

it("explica el transporte HTTP y las funciones de correo deshabilitadas", () => {
  state.deployment.profile = "lan-pilot";
  render(<DeploymentNotice />);
  const notice = screen.getByRole("complementary", { name: "Limitaciones del piloto" });
  expect(notice).toHaveTextContent("HTTP no está cifrada");
  expect(notice).toHaveTextContent("contraseñas y los datos pueden ser leídos por terceros");
  expect(notice).toHaveTextContent("recuperación de contraseña y el cambio de correo no están disponibles");
});
