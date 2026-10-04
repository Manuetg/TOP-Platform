import { afterEach, describe, expect, it, vi } from "vitest";
import {
  changeMessagingConversationMode,
  listMessagingConversations,
  listMessagingMessages,
  sendManualMessagingMessage,
} from "./messaging-inbox.api";

describe("messaging inbox api", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps business and cursor in conversation and message reads", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({ items: [], pageInfo: { nextCursor: null, hasNextPage: false } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await listMessagingConversations("business-2", "cursor 1", "token");
    await listMessagingMessages("business-2", "conversation-7", "cursor 2", "token");

    expect(fetchMock.mock.calls[0][0]).toContain("/businesses/business-2/messaging/conversations?cursor=cursor%201");
    expect(fetchMock.mock.calls[1][0]).toContain("/businesses/business-2/messaging/conversations/conversation-7/messages?cursor=cursor%202");
    const firstOptions = fetchMock.mock.calls.at(0)?.[1];
    expect(new Headers(firstOptions?.headers).get("Authorization")).toBe("Bearer token");
  });

  it("sends mode and manual message contracts without a recipient field", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      const body = path.endsWith("/mode")
        ? { conversationId: "conversation-7", mode: "HUMAN" }
        : { id: "message-1", text: "Hola", status: "PENDING", occurredAt: "2026-10-04T12:00:00Z" };
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    });

    await changeMessagingConversationMode("business-2", "conversation-7", "HUMAN");
    await sendManualMessagingMessage("business-2", "conversation-7", "Hola", "request-1");

    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ method: "PATCH", body: JSON.stringify({ mode: "HUMAN" }) }));
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: "POST", body: JSON.stringify({ text: "Hola", clientRequestId: "request-1" }) }));
    expect(String(fetchMock.mock.calls[1][1]?.body)).not.toContain("recipient");
  });
});
