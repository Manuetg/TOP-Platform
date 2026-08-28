import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
} from "react-router-dom";
import { AppLayout } from "./AppLayout";

function renderApp(initialEntry = "/app") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<h1>Inicio</h1>} />
          <Route path="calendar" element={<h1>Calendario</h1>} />
          <Route path="bookings" element={<h1>Reservas</h1>} />
          <Route path="availability" element={<h1>Disponibilidad</h1>} />
          <Route path="resources" element={<h1>Recursos</h1>} />
          <Route path="contacts" element={<h1>Contactos</h1>} />
          <Route path="pricing" element={<h1>Precios</h1>} />
          <Route path="payments" element={<h1>Pagos</h1>} />
          <Route path="blocks" element={<h1>Bloqueos</h1>} />
          <Route path="settings" element={<h1>Configuración</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppLayout", () => {
  it("renders the section associated with a deep link", () => {
    renderApp("/app/pricing");

    expect(
      screen.getByRole("heading", { name: "Precios" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Precios",
        current: "page",
      }),
    ).toBeInTheDocument();
  });

  it("navigates between sections through the AppShell", async () => {
    const user = userEvent.setup();

    renderApp("/app");

    expect(
      screen.getByRole("heading", { name: "Inicio" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getAllByRole("button", { name: "Reservas" })[0],
    );

    expect(
      screen.getByRole("heading", { name: "Reservas" }),
    ).toBeInTheDocument();
  });

  it("keeps Más without navigation until its flow is implemented", async () => {
    const user = userEvent.setup();

    renderApp("/app");

    await user.click(
      screen.getByRole("button", { name: "Más" }),
    );

    expect(
      screen.getByRole("heading", { name: "Inicio" }),
    ).toBeInTheDocument();
  });
});
