import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArchiveContactAction } from "./ArchiveContactAction";
import { archiveContact } from "../api/archive-contact";
import type { Contact } from "../types/contact.types";

vi.mock("../api/archive-contact", () => ({ archiveContact: vi.fn() }));
const contact: Contact = { id: "contact-1", businessId: "business-1", name: "Ana", lastName: null, fullName: "Ana", status: "ACTIVE", phone: "+595981123456", whatsapp: null, email: null, country: "Paraguay", city: null, documentType: null, documentNumber: null, createdAt: "2026-09-24T00:00:00Z", updatedAt: "2026-09-24T00:00:00Z" };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><ArchiveContactAction contact={contact} accessToken="token" /></QueryClientProvider>);
  return { client, ...view };
}
describe("archivo de Contact", () => {
  beforeEach(() => vi.resetAllMocks());
  it("confirma, conserva detalle y actualiza caché con respuesta pública", async () => {
    const user = userEvent.setup(); const archived = { ...contact, status: "ARCHIVED" as const }; vi.mocked(archiveContact).mockResolvedValue(archived);
    const { client } = setup(); const invalidation = vi.spyOn(client, "invalidateQueries");
    await user.click(screen.getByRole("button", { name: "Archivar contacto" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Archivar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("El contacto se archivó");
    expect(archiveContact).toHaveBeenCalledWith({ businessId: "business-1", contactId: "contact-1", accessToken: "token", signal: expect.any(AbortSignal) });
    expect(client.getQueryData(["contacts", "business-1", "contact-1"])).toEqual(archived);
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ["contacts", "business-1"] });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("mantiene error y permite reintentar sin cerrar el diálogo", async () => {
    const user = userEvent.setup(); vi.mocked(archiveContact).mockRejectedValueOnce(new Error("Sin permiso")).mockResolvedValueOnce({ ...contact, status: "ARCHIVED" }); setup();
    await user.click(screen.getByRole("button", { name: "Archivar contacto" }));
    const confirm = screen.getByRole("button", { name: "Archivar" }); await user.click(confirm);
    expect(await screen.findByRole("alert")).toHaveTextContent("Sin permiso"); expect(screen.getByRole("dialog")).toBeVisible();
    await user.click(confirm); expect(await screen.findByRole("status")).toHaveTextContent("El contacto se archivó");
  });
  it("aborta al cambiar de contexto y no escribe una respuesta tardía", async () => {
    let resolve!: (value: Contact) => void; vi.mocked(archiveContact).mockReturnValue(new Promise((done) => { resolve = done; }));
    const user = userEvent.setup(); const { unmount, client } = setup();
    await user.click(screen.getByRole("button", { name: "Archivar contacto" })); await user.click(screen.getByRole("button", { name: "Archivar" }));
    expect(screen.getByRole("button", { name: "Procesando…" })).toBeDisabled();
    const signal = vi.mocked(archiveContact).mock.calls[0][0].signal!; unmount(); expect(signal.aborted).toBe(true);
    await act(async () => resolve({ ...contact, status: "ARCHIVED" }));
    await waitFor(() => expect(client.getQueryData(["contacts", "business-1", "contact-1"])).toBeUndefined());
  });
});
