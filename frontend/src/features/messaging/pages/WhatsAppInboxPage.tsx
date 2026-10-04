import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCheck,
  Clock3,
  Info,
  MessageCircle,
  PanelRight,
  RefreshCw,
  Send,
  UserRound,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError } from "../../../shared/api/api-client";
import { Badge } from "../../../shared/ui/Badge";
import { Button } from "../../../shared/ui/Button";
import { formatBusinessInstant } from "../../../shared/utils/date-format";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import {
  useChangeMessagingConversationMode,
  useMessagingConversation,
  useMessagingConversations,
  useMessagingMessages,
  useSendManualMessagingMessage,
} from "../queries/use-messaging-inbox";
import type {
  ConversationInboxMessage,
  ConversationInboxSummary,
  ConversationMode,
  ConversationStatus,
} from "../types/messaging-inbox.types";
import "./WhatsAppInboxPage.css";

const MAX_MESSAGE_LENGTH = 4000;

const statusLabels: Record<ConversationStatus, string> = {
  ACTIVE: "Activa",
  CLOSED: "Cerrada",
};

const modeLabels: Record<ConversationMode, string> = {
  BOT: "Bot",
  HUMAN: "Humana",
};

const bookingStatusLabels: Record<string, string> = {
  DRAFT: "Borrador",
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  IN_PROGRESS: "En curso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No show",
};

function conversationTitle(conversation: Pick<ConversationInboxSummary, "contactName" | "externalParticipant">): string {
  return conversation.contactName?.trim() || conversation.externalParticipant || "Contacto sin nombre";
}

function safeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "Tu rol no permite realizar esta acción.";
    if (error.status === 404) return "La conversación ya no está disponible.";
    if (error.status === 409) return "La conversación cambió. Actualizá la pantalla e intentá nuevamente.";
    if (error.status === 400) return "Revisá los datos e intentá nuevamente.";
  }
  return fallback;
}

function newClientRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function badgeTone(status: ConversationStatus): "success" | "neutral" {
  return status === "ACTIVE" ? "success" : "neutral";
}

function messageText(message: ConversationInboxMessage): string {
  return message.text?.trim() || (message.messageType === "TEXT" ? "Mensaje sin contenido" : "Este tipo de mensaje todavía no se puede mostrar.");
}

export function WhatsAppInboxPage() {
  const { session } = useAuth();
  const { activeBusiness, activeBusinessId, activeRole } = useBusinessContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [contextOpen, setContextOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const clientRequestId = useRef<string | null>(null);
  const previousBusinessId = useRef(activeBusinessId);
  const selectedConversationId = searchParams.get("conversation") ?? "";
  const canWrite = activeRole === "OWNER" || activeRole === "ADMIN";
  const queryOptions = { businessId: activeBusinessId, accessToken: session?.accessToken };

  const conversations = useMessagingConversations(queryOptions);
  const conversation = useMessagingConversation({ ...queryOptions, conversationId: selectedConversationId });
  const messages = useMessagingMessages({ ...queryOptions, conversationId: selectedConversationId });
  const changeMode = useChangeMessagingConversationMode(queryOptions);
  const sendMessage = useSendManualMessagingMessage(queryOptions);

  const conversationItems = useMemo(
    () => conversations.data?.pages.flatMap((page) => page.items) ?? [],
    [conversations.data],
  );
  const messageItems = useMemo(
    () => messages.data?.pages.flatMap((page) => page.items) ?? [],
    [messages.data],
  );
  const timezone = activeBusiness?.timezone ?? "America/Asuncion";
  const selected = conversation.data;
  const isComposerEnabled = Boolean(selected && selected.status === "ACTIVE" && selected.mode === "HUMAN" && canWrite);

  useEffect(() => {
    if (previousBusinessId.current && previousBusinessId.current !== activeBusinessId) {
      setSearchParams({}, { replace: true });
      setContextOpen(false);
      setDraft("");
      clientRequestId.current = null;
    }
    previousBusinessId.current = activeBusinessId;
  }, [activeBusinessId, setSearchParams]);

  useEffect(() => {
    setDraft("");
    setComposerError(null);
    clientRequestId.current = null;
    setContextOpen(false);
  }, [selectedConversationId]);

  function selectConversation(conversationId: string) {
    setSearchParams({ conversation: conversationId });
  }

  function goBackToList() {
    setSearchParams({}, { replace: true });
  }

  async function toggleMode(mode: ConversationMode) {
    if (!selected || !canWrite) return;
    try {
      await changeMode.mutateAsync({ conversationId: selected.conversationId, mode });
    } catch {
      // La mutation conserva el error normalizado para el estado visible.
    }
  }

  async function submitMessage() {
    const text = draft.trim();
    if (!text || !selected || !isComposerEnabled || sendMessage.isPending) return;
    setComposerError(null);
    const requestId = clientRequestId.current ?? newClientRequestId();
    clientRequestId.current = requestId;
    try {
      await sendMessage.mutateAsync({ conversationId: selected.conversationId, text, clientRequestId: requestId });
      setDraft("");
      clientRequestId.current = null;
    } catch {
      setComposerError("No pudimos enviar el mensaje. Podés reintentarlo sin perder el texto.");
    }
  }

  return (
    <section className="messaging-inbox" aria-labelledby="messaging-inbox-title">
      <header className="messaging-inbox__header">
        <div>
          <span className="messaging-inbox__eyebrow">Operación</span>
          <h1 id="messaging-inbox-title">WhatsApp</h1>
          <p>Atendé las conversaciones del negocio activo desde un solo lugar.</p>
        </div>
        <MessageCircle className="messaging-inbox__header-icon" size={30} aria-hidden="true" />
      </header>

      <div className={`messaging-inbox__workspace${selectedConversationId ? " has-selection" : ""}`}>
        <ConversationList
          items={conversationItems}
          selectedId={selectedConversationId}
          isLoading={conversations.isPending}
          error={conversations.error}
          hasNextPage={conversations.hasNextPage}
          isFetchingNextPage={conversations.isFetchingNextPage}
          onRetry={() => void conversations.refetch()}
          onLoadMore={() => void conversations.fetchNextPage()}
          onSelect={selectConversation}
          timezone={timezone}
        />

        {selectedConversationId ? (
          <main className="messaging-inbox__thread" aria-label="Conversación seleccionada">
            <ThreadHeader
              conversation={selected}
              canWrite={canWrite}
              isChangingMode={changeMode.isPending}
              modeError={changeMode.error}
              isLoading={conversation.isPending}
              detailError={conversation.error}
              onBack={goBackToList}
              onRetry={() => void conversation.refetch()}
              onTakeOver={() => void toggleMode("HUMAN")}
              onReturnToBot={() => void toggleMode("BOT")}
            />
            <MessageTimeline
              messages={messageItems}
              isLoading={messages.isPending}
              error={messages.error}
              hasNextPage={messages.hasNextPage}
              isFetchingNextPage={messages.isFetchingNextPage}
              timezone={timezone}
              onRetry={() => void messages.refetch()}
              onLoadMore={() => void messages.fetchNextPage()}
            />
            <Composer
              value={draft}
              enabled={isComposerEnabled}
              canWrite={canWrite}
              isSending={sendMessage.isPending}
              error={composerError}
              onChange={setDraft}
              onSubmit={() => void submitMessage()}
            />
          </main>
        ) : (
          <EmptyThread />
        )}

        {selectedConversationId ? (
          <aside className={`messaging-inbox__context${contextOpen ? " is-open" : ""}`} aria-label="Contexto de la conversación">
            <button type="button" className="messaging-inbox__context-toggle" onClick={() => setContextOpen((open) => !open)} aria-expanded={contextOpen}>
              <PanelRight size={17} aria-hidden="true" /> Contexto de la conversación
            </button>
            <ConversationContext conversation={selected} timezone={timezone} />
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function ConversationList({
  items,
  selectedId,
  isLoading,
  error,
  hasNextPage,
  isFetchingNextPage,
  onRetry,
  onLoadMore,
  onSelect,
  timezone,
}: {
  items: ConversationInboxSummary[];
  selectedId: string;
  isLoading: boolean;
  error: unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
  onSelect: (conversationId: string) => void;
  timezone: string;
}) {
  return (
    <section className="messaging-inbox__list" aria-labelledby="messaging-conversations-title">
      <div className="messaging-inbox__list-heading"><div><h2 id="messaging-conversations-title">Conversaciones</h2><span>{items.length} visibles</span></div><MessageCircle size={19} aria-hidden="true" /></div>
      {isLoading ? <div className="messaging-inbox__state" role="status"><RefreshCw size={21} className="top-motion-spin" aria-hidden="true" /><span>Cargando conversaciones...</span></div> : null}
      {!isLoading && error ? <div className="messaging-inbox__state" role="alert"><AlertCircle size={21} aria-hidden="true" /><span>No pudimos cargar las conversaciones.</span><Button type="button" size="sm" onClick={onRetry}>Reintentar</Button></div> : null}
      {!isLoading && !error && items.length === 0 ? <div className="messaging-inbox__state"><MessageCircle size={22} aria-hidden="true" /><strong>No hay conversaciones</strong><span>Las nuevas consultas aparecerán acá.</span></div> : null}
      {!isLoading && !error ? <div className="messaging-inbox__conversation-items">{items.map((item) => <ConversationListItem key={item.conversationId} item={item} selected={item.conversationId === selectedId} timezone={timezone} onSelect={onSelect} />)}</div> : null}
      {hasNextPage ? <Button type="button" variant="tertiary" size="sm" loading={isFetchingNextPage} loadingLabel="Cargando..." onClick={onLoadMore}>Cargar más conversaciones</Button> : null}
    </section>
  );
}

function ConversationListItem({ item, selected, timezone, onSelect }: { item: ConversationInboxSummary; selected: boolean; timezone: string; onSelect: (id: string) => void }) {
  return <button type="button" className={`messaging-inbox__conversation-item${selected ? " is-selected" : ""}`} aria-current={selected ? "page" : undefined} onClick={() => onSelect(item.conversationId)}>
    <span className="messaging-inbox__conversation-avatar" aria-hidden="true"><UserRound size={17} /></span>
    <span className="messaging-inbox__conversation-copy"><strong>{conversationTitle(item)}</strong><span>{item.lastMessagePreview || "Sin mensajes todavía"}</span></span>
    <span className="messaging-inbox__conversation-meta"><time dateTime={item.lastMessageAt ?? undefined}>{formatBusinessInstant(item.lastMessageAt, timezone, "")}</time><Badge tone="info">{modeLabels[item.mode]}</Badge><Badge tone={badgeTone(item.status)}>{statusLabels[item.status]}</Badge></span>
  </button>;
}

function EmptyThread() {
  return <section className="messaging-inbox__empty-thread" aria-label="Ninguna conversación seleccionada"><MessageCircle size={34} aria-hidden="true" /><h2>Seleccioná una conversación</h2><p>Elegí un contacto de la lista para revisar el historial y el contexto disponible.</p></section>;
}

function ThreadHeader({ conversation, canWrite, isChangingMode, modeError, isLoading, detailError, onBack, onRetry, onTakeOver, onReturnToBot }: { conversation: ReturnType<typeof useMessagingConversation>["data"]; canWrite: boolean; isChangingMode: boolean; modeError: unknown; isLoading: boolean; detailError: unknown; onBack: () => void; onRetry: () => void; onTakeOver: () => void; onReturnToBot: () => void }) {
  if (isLoading || !conversation && !detailError) return <header className="messaging-inbox__thread-header"><Button type="button" variant="tertiary" size="sm" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Volver</Button><div className="messaging-inbox__thread-loading" role="status">Cargando conversación...</div></header>;
  if (detailError || !conversation) return <header className="messaging-inbox__thread-header"><Button type="button" variant="tertiary" size="sm" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Volver</Button><div className="messaging-inbox__thread-error" role="alert"><AlertCircle size={16} aria-hidden="true" /><span>{safeErrorMessage(detailError, "No pudimos cargar la conversación.")}</span><Button type="button" variant="tertiary" size="sm" onClick={onRetry}>Reintentar</Button></div></header>;
  return <header className="messaging-inbox__thread-header">
    <Button type="button" variant="tertiary" size="sm" className="messaging-inbox__back-button" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />Volver</Button>
    <div className="messaging-inbox__thread-title"><span className="messaging-inbox__conversation-avatar" aria-hidden="true"><UserRound size={18} /></span><div><h2>{conversationTitle(conversation)}</h2><span>{conversation.externalParticipant}</span></div></div>
    <div className="messaging-inbox__thread-actions"><Badge tone="info">WhatsApp</Badge><Badge tone={badgeTone(conversation.status)}>{statusLabels[conversation.status]}</Badge><Badge tone="info">{modeLabels[conversation.mode]}</Badge>{conversation.status === "ACTIVE" && canWrite && conversation.mode === "BOT" ? <Button type="button" size="sm" loading={isChangingMode} loadingLabel="Tomando..." onClick={onTakeOver}><UserRound size={16} aria-hidden="true" />Tomar conversación</Button> : null}{conversation.status === "ACTIVE" && canWrite && conversation.mode === "HUMAN" ? <Button type="button" variant="secondary" size="sm" loading={isChangingMode} loadingLabel="Actualizando..." onClick={onReturnToBot}><Bot size={16} aria-hidden="true" />Devolver al bot</Button> : null}</div>
    {conversation.status === "CLOSED" ? <p className="messaging-inbox__thread-notice"><XCircle size={16} aria-hidden="true" />La conversación está cerrada y no admite nuevos mensajes.</p> : null}
    {!canWrite ? <p className="messaging-inbox__thread-notice"><Info size={16} aria-hidden="true" />Tu rol permite consultar esta conversación, pero no modificarla.</p> : null}
    {modeError ? <p className="messaging-inbox__thread-error" role="alert">{safeErrorMessage(modeError, "No pudimos actualizar el modo de la conversación.")}</p> : null}
  </header>;
}

function MessageTimeline({ messages, isLoading, error, hasNextPage, isFetchingNextPage, timezone, onRetry, onLoadMore }: { messages: ConversationInboxMessage[]; isLoading: boolean; error: unknown; hasNextPage: boolean; isFetchingNextPage: boolean; timezone: string; onRetry: () => void; onLoadMore: () => void }) {
  if (isLoading) return <div className="messaging-inbox__timeline-state" role="status"><RefreshCw size={22} className="top-motion-spin" aria-hidden="true" />Cargando mensajes...</div>;
  if (error) return <div className="messaging-inbox__timeline-state" role="alert"><AlertCircle size={22} aria-hidden="true" /><span>No pudimos cargar los mensajes.</span><Button type="button" size="sm" onClick={onRetry}>Reintentar</Button></div>;
  return <div className="messaging-inbox__timeline" aria-live="polite">
    {hasNextPage ? <Button type="button" variant="tertiary" size="sm" loading={isFetchingNextPage} loadingLabel="Cargando..." onClick={onLoadMore}>Cargar más mensajes</Button> : null}
    {messages.length === 0 ? <p className="messaging-inbox__timeline-empty">Todavía no hay mensajes.</p> : messages.map((message) => <MessageBubble key={message.id} message={message} timezone={timezone} />)}
  </div>;
}

function MessageBubble({ message, timezone }: { message: ConversationInboxMessage; timezone: string }) {
  const isOutbound = message.direction === "OUTBOUND";
  const status = message.status === "SENT" ? "Enviado" : message.status === "FAILED" ? "No enviado" : message.status === "PENDING" ? "Pendiente" : "";
  return <article className={`messaging-inbox__message${isOutbound ? " is-outbound" : " is-inbound"}`} aria-label={isOutbound ? "Mensaje saliente" : "Mensaje entrante"}>
    <p>{messageText(message)}</p>
    <footer><time dateTime={message.occurredAt}>{formatBusinessInstant(message.occurredAt, timezone)}</time>{message.origin ? <span>{message.origin === "MANUAL" ? "Manual" : message.origin === "BOT" ? "Bot" : "Automático"}</span> : null}{status ? <span>{status}{message.status === "SENT" ? <CheckCheck size={14} aria-hidden="true" /> : message.status === "PENDING" ? <Clock3 size={14} aria-hidden="true" /> : null}</span> : null}</footer>
  </article>;
}

function Composer({ value, enabled, canWrite, isSending, error, onChange, onSubmit }: { value: string; enabled: boolean; canWrite: boolean; isSending: boolean; error: string | null; onChange: (value: string) => void; onSubmit: () => void }) {
  if (!canWrite) return <p className="messaging-inbox__composer-notice"><Info size={16} aria-hidden="true" />Solo propietarios y administradores pueden enviar mensajes manuales.</p>;
  if (!enabled) return <p className="messaging-inbox__composer-notice"><Bot size={16} aria-hidden="true" />Tomá la conversación para habilitar el envío manual.</p>;
  return <form className="messaging-inbox__composer" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
    <label htmlFor="messaging-manual-message">Mensaje manual</label>
    <div className="messaging-inbox__composer-row"><textarea id="messaging-manual-message" value={value} maxLength={MAX_MESSAGE_LENGTH} onChange={(event) => onChange(event.target.value)} placeholder="Escribí una respuesta..." rows={3} aria-describedby="messaging-manual-message-count" /><Button type="submit" aria-label="Enviar mensaje" loading={isSending} loadingLabel="Enviando..."><Send size={17} aria-hidden="true" />Enviar</Button></div>
    <div id="messaging-manual-message-count" className="messaging-inbox__composer-meta"><span>Enter agrega una nueva línea.</span><span>{value.length}/{MAX_MESSAGE_LENGTH}</span></div>
    {error ? <p className="messaging-inbox__thread-error" role="alert">{error}<button type="submit">Reintentar</button></p> : null}
  </form>;
}

function ConversationContext({ conversation, timezone }: { conversation: ReturnType<typeof useMessagingConversation>["data"]; timezone: string }) {
  if (!conversation) return <div className="messaging-inbox__context-body" role="status">Cargando contexto...</div>;
  return <div className="messaging-inbox__context-body">
    <div className="messaging-inbox__context-heading"><Info size={18} aria-hidden="true" /><div><h2>Contexto</h2><span>Datos del negocio activo</span></div></div>
    <section><h3>Contacto</h3>{conversation.contact ? <dl><div><dt>Nombre</dt><dd>{conversation.contact.name}</dd></div><div><dt>Teléfono</dt><dd>{conversation.contact.phone || conversation.contact.whatsapp || conversation.externalParticipant}</dd></div></dl> : <p>No hay un contacto asociado todavía.</p>}</section>
    <section><h3>Reserva</h3>{conversation.booking ? <dl><div><dt>Estado</dt><dd><Badge tone={conversation.booking.status === "CONFIRMED" ? "success" : "neutral"}>{bookingStatusLabels[conversation.booking.status] ?? conversation.booking.status}</Badge></dd></div><div><dt>Referencia</dt><dd>{conversation.booking.id.slice(0, 8).toUpperCase()}</dd></div></dl> : <p>No hay una reserva asociada a esta conversación.</p>}</section>
    <section><h3>Conversación</h3><dl><div><dt>Creada</dt><dd>{formatBusinessInstant(conversation.createdAt, timezone)}</dd></div>{conversation.closedAt ? <div><dt>Cerrada</dt><dd>{formatBusinessInstant(conversation.closedAt, timezone)}</dd></div> : null}</dl></section>
  </div>;
}
