import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppInboxPage } from "./WhatsAppInboxPage";

const state = vi.hoisted(() => ({ role: "OWNER" as "OWNER" | "RECEPTIONIST", selected: false, closed: false, mode: "BOT" as "BOT" | "HUMAN", send: vi.fn(), changeMode: vi.fn() }));
const hooks = vi.hoisted(() => ({ conversations: vi.fn(), conversation: vi.fn(), messages: vi.fn(), changeMode: vi.fn(), send: vi.fn() }));

vi.mock("../../auth/context/AuthContext", () => ({ useAuth: () => ({ session: { accessToken: "token" } }) }));
vi.mock("../../business/context/BusinessContext", () => ({ useBusinessContext: () => ({ activeBusinessId: "business-1", activeBusiness: { timezone: "America/Asuncion" }, activeRole: state.role }) }));
vi.mock("../queries/use-messaging-inbox", () => ({
  useMessagingConversations: (...args: unknown[]) => hooks.conversations(...args),
  useMessagingConversation: (...args: unknown[]) => hooks.conversation(...args),
  useMessagingMessages: (...args: unknown[]) => hooks.messages(...args),
  useChangeMessagingConversationMode: (...args: unknown[]) => hooks.changeMode(...args),
  useSendManualMessagingMessage: (...args: unknown[]) => hooks.send(...args),
}));

const summary = (id: string, name: string) => ({ conversationId: id, channel: "WHATSAPP" as const, mode: state.mode, status: state.closed ? "CLOSED" as const : "ACTIVE" as const, externalParticipant: "+595981111111", contactId: "contact-1", contactName: name, lastMessageAt: "2026-10-04T12:00:00Z", lastMessagePreview: "Necesito disponibilidad", lastMessageDirection: "INBOUND" as const });
const detail = () => ({ ...summary("conversation-1", "Ana Pérez"), createdAt: "2026-10-04T11:00:00Z", closedAt: state.closed ? "2026-10-04T13:00:00Z" : null, contact: { id: "contact-1", name: "Ana Pérez", phone: "+595981111111", whatsapp: "+595981111111" }, booking: { id: "booking-1", status: "CONFIRMED" } });
const message = { id: "message-1", direction: "INBOUND" as const, messageType: "TEXT", text: "Necesito disponibilidad", occurredAt: "2026-10-04T12:00:00Z", status: null, origin: null };
const outboundMessages = [
  { id: "message-pending", direction: "OUTBOUND" as const, messageType: "TEXT", text: "Estamos revisando", occurredAt: "2026-10-04T12:01:00Z", status: "PENDING" as const, origin: "MANUAL" as const },
  { id: "message-sent", direction: "OUTBOUND" as const, messageType: "TEXT", text: "Tu reserva fue confirmada", occurredAt: "2026-10-04T12:02:00Z", status: "SENT" as const, origin: "AUTOMATION" as const },
  { id: "message-failed", direction: "OUTBOUND" as const, messageType: "IMAGE", text: null, occurredAt: "2026-10-04T12:03:00Z", status: "FAILED" as const, origin: "BOT" as const },
];

function renderPage() {
  hooks.conversations.mockReturnValue({ data: { pages: [{ items: [summary("conversation-1", "Ana Pérez"), summary("conversation-2", "Bruno López")], pageInfo: { nextCursor: null, hasNextPage: false } }] }, isPending: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn() });
  hooks.conversation.mockReturnValue({ data: state.selected ? detail() : undefined, isPending: state.selected ? false : false, error: null });
  hooks.messages.mockReturnValue({ data: { pages: [{ items: state.selected ? [message, ...outboundMessages] : [], pageInfo: { nextCursor: null, hasNextPage: false } }] }, isPending: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn() });
  hooks.changeMode.mockReturnValue({ mutateAsync: state.changeMode, isPending: false, error: null });
  hooks.send.mockReturnValue({ mutateAsync: state.send, isPending: false, error: null });
  return render(<MemoryRouter initialEntries={[state.selected ? "/app/whatsapp?conversation=conversation-1" : "/app/whatsapp"]}><WhatsAppInboxPage /></MemoryRouter>);
}

describe("WhatsAppInboxPage", () => {
  beforeEach(() => {
    state.role = "OWNER";
    state.selected = false;
    state.closed = false;
    state.mode = "BOT";
    state.send.mockReset().mockResolvedValue({ id: "message-2" });
    state.changeMode.mockReset().mockResolvedValue(detail());
    vi.clearAllMocks();
  });

  it("shows conversations and opens a selected thread from the URL state", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole("heading", { name: "Conversaciones" })).toBeInTheDocument();
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("Bruno López")).toBeInTheDocument();
    expect(screen.queryByText("conversation-1")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ana Pérez/ }));
    state.selected = true;
    renderPage();
    expect(screen.getByRole("heading", { name: "Ana Pérez" })).toBeInTheDocument();
  });

  it("allows an owner to take a bot conversation and send with a client request id", async () => {
    state.selected = true;
    renderPage();
    const user = userEvent.setup();
    expect(screen.getByRole("button", { name: /Tomar conversación/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Tomar conversación/ }));
    expect(state.changeMode).toHaveBeenCalledWith({ conversationId: "conversation-1", mode: "HUMAN" });

    state.mode = "HUMAN";
    renderPage();
    const composer = screen.getByLabelText("Mensaje manual");
    await user.type(composer, "Hola desde TOP");
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));
    await waitFor(() => expect(state.send).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "conversation-1", text: "Hola desde TOP", clientRequestId: expect.any(String) })));
  });

  it("releases a human conversation back to the bot", async () => {
    state.selected = true;
    state.mode = "HUMAN";
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /Devolver al bot/ }));
    expect(state.changeMode).toHaveBeenCalledWith({ conversationId: "conversation-1", mode: "BOT" });
  });

  it("renders inbound and outbound message direction, status and origin", () => {
    state.selected = true;
    state.mode = "HUMAN";
    renderPage();
    expect(screen.getByRole("article", { name: "Mensaje entrante" })).toHaveTextContent("Necesito disponibilidad");
    expect(screen.getAllByRole("article", { name: "Mensaje saliente" })).toHaveLength(3);
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText("Enviado")).toBeInTheDocument();
    expect(screen.getByText("No enviado")).toBeInTheDocument();
    expect(screen.getByText("Este tipo de mensaje todavía no se puede mostrar.")).toBeInTheDocument();
    expect(screen.getByText("Automático")).toBeInTheDocument();
  });

  it("keeps receptionist controls read-only and hides the composer", () => {
    state.selected = true;
    state.role = "RECEPTIONIST";
    renderPage();
    expect(screen.queryByRole("button", { name: /Tomar conversación|Devolver al bot/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Solo propietarios y administradores pueden enviar/)).toBeInTheDocument();
  });

  it("does not offer changes or sending for a closed conversation", () => {
    state.selected = true;
    state.closed = true;
    renderPage();
    expect(screen.getByText(/La conversación está cerrada/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Mensaje manual")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tomar conversación|Devolver al bot/ })).not.toBeInTheDocument();
  });

  it("keeps the current tenant and booking context visible without exposing technical conversation identity", () => {
    state.selected = true;
    renderPage();
    expect(screen.getAllByText("Ana Pérez").length).toBeGreaterThan(0);
    expect(screen.getByText("Confirmada")).toBeInTheDocument();
    expect(screen.getByText("BOOKING-")).toBeInTheDocument();
    expect(screen.queryByText("resource-1")).not.toBeInTheDocument();
  });

  it("keeps manual text when sending fails so retry is possible", async () => {
    state.selected = true;
    state.mode = "HUMAN";
    state.send.mockRejectedValue(new Error("network"));
    renderPage();
    const user = userEvent.setup();
    const composer = screen.getByLabelText("Mensaje manual");
    await user.type(composer, "Reintentar este texto");
    await user.click(screen.getByRole("button", { name: "Enviar mensaje" }));
    await waitFor(() => expect(screen.getByDisplayValue("Reintentar este texto")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos enviar el mensaje");
    const firstRequestId = state.send.mock.calls[0][0].clientRequestId;
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(state.send).toHaveBeenCalledTimes(2));
    expect(state.send.mock.calls[1][0].clientRequestId).toBe(firstRequestId);
  });
});
