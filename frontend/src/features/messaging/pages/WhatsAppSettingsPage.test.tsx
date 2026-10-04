import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppSettingsPage } from "./WhatsAppSettingsPage";

const state = vi.hoisted(() => ({ role: "OWNER" as "OWNER" | "RECEPTIONIST", bot: true, automationMutation: vi.fn(), settingsMutation: vi.fn(), templateMutation: vi.fn() }));
const hooks = vi.hoisted(() => ({
  settings: vi.fn(), automations: vi.fn(), templates: vi.fn(), updateSettings: vi.fn(), updateAutomation: vi.fn(), updateTemplate: vi.fn(),
}));

vi.mock("../../auth/context/AuthContext", () => ({ useAuth: () => ({ session: { accessToken: "token" } }) }));
vi.mock("../../business/context/BusinessContext", () => ({ useBusinessContext: () => ({ activeBusinessId: "business-1", activeRole: state.role }) }));
vi.mock("../queries/use-messaging-configuration", () => ({
  useMessagingSettings: (...args: unknown[]) => hooks.settings(...args),
  useMessagingAutomations: (...args: unknown[]) => hooks.automations(...args),
  useMessagingTemplates: (...args: unknown[]) => hooks.templates(...args),
  useUpdateMessagingSettings: (...args: unknown[]) => hooks.updateSettings(...args),
  useUpdateMessagingAutomation: (...args: unknown[]) => hooks.updateAutomation(...args),
  useUpdateMessagingTemplate: (...args: unknown[]) => hooks.updateTemplate(...args),
}));

const baseData = () => ({
  settings: { data: { businessId: "business-1", botEnabled: state.bot }, isPending: false, isError: false, error: null, refetch: vi.fn() },
  automations: { data: [
    { id: null, businessId: "business-1", automationType: "BOOKING_CONFIRMED", enabled: true, templateId: null, createdAt: null, updatedAt: null },
    { id: null, businessId: "business-1", automationType: "BOOKING_CANCELLED", enabled: false, templateId: null, createdAt: null, updatedAt: null },
  ], isPending: false, isError: false, error: null, refetch: vi.fn() },
  templates: { data: [], isPending: false, isError: false, error: null, refetch: vi.fn() },
});

function renderPage() {
  const data = baseData();
  hooks.settings.mockReturnValue(data.settings);
  hooks.automations.mockReturnValue(data.automations);
  hooks.templates.mockReturnValue(data.templates);
  hooks.updateSettings.mockReturnValue({ mutateAsync: state.settingsMutation, isPending: false, isError: false, error: null, reset: vi.fn() });
  hooks.updateAutomation.mockReturnValue({ mutateAsync: state.automationMutation, isPending: false, isError: false, error: null, reset: vi.fn() });
  hooks.updateTemplate.mockReturnValue({ mutateAsync: state.templateMutation, isPending: false, isError: false, error: null, reset: vi.fn() });
  return render(<WhatsAppSettingsPage />);
}

describe("WhatsAppSettingsPage", () => {
  beforeEach(() => {
    state.role = "OWNER";
    state.bot = true;
    state.settingsMutation.mockReset().mockResolvedValue({ businessId: "business-1", botEnabled: false });
    state.automationMutation.mockReset().mockResolvedValue({ automationType: "BOOKING_CONFIRMED", enabled: false });
    state.templateMutation.mockReset().mockResolvedValue({ id: "template-1", businessId: "business-1", templateType: "BOOKING_CONFIRMED", channel: "WHATSAPP", content: "Mensaje personalizado", createdAt: "", updatedAt: "" });
  });

  it("loads bot status, toggles an automation, and opens the effective default template", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole("heading", { name: "WhatsApp" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Responder automáticamente/i })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: /Responder automáticamente/i }));
    expect(state.settingsMutation).toHaveBeenCalledWith(false);
    await user.click(screen.getByRole("checkbox", { name: /Activar reserva confirmada/i }));
    expect(state.automationMutation).toHaveBeenCalledWith({ automationType: "BOOKING_CONFIRMED", enabled: false });
    await user.click(screen.getAllByRole("button", { name: "Editar mensaje" })[0]);
    expect(screen.getByRole("dialog", { name: "Mensaje de reserva confirmada" })).toBeInTheDocument();
    expect((screen.getByLabelText("Mensaje") as HTMLTextAreaElement).value).toContain("fue confirmada");
    expect(screen.getByText(/Cabañas del Lago/)).toBeInTheDocument();
  });

  it("blocks unknown variables before saving and saves valid custom content", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByRole("button", { name: "Editar mensaje" })[0]);
    const textarea = screen.getByLabelText("Mensaje");
    await user.clear(textarea);
    fireEvent.change(textarea, { target: { value: "Hola {{unknown}}" } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("no está disponible"));
    expect(screen.getByRole("button", { name: "Guardar mensaje" })).toBeDisabled();
    await user.clear(textarea);
    fireEvent.change(textarea, { target: { value: "Hola {{guestName}}" } });
    await user.click(screen.getByRole("button", { name: "Guardar mensaje" }));
    expect(state.templateMutation).toHaveBeenCalledWith({ templateType: "BOOKING_CONFIRMED", content: "Hola {{guestName}}" });
  });

  it("keeps controls read-only for a receptionist", async () => {
    state.role = "RECEPTIONIST";
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole("checkbox", { name: /Responder automáticamente/i })).toBeDisabled();
    await user.click(screen.getAllByRole("button", { name: "Editar mensaje" })[0]);
    expect(screen.getByLabelText("Mensaje")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Guardar mensaje" })).not.toBeInTheDocument();
  });
});

