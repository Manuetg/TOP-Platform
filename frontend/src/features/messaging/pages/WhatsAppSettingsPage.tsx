import { AlertCircle, Bot, Check, MessageCircle, Pencil, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import {
  messagingTemplateDefaults,
} from "../constants/messaging-template-catalog";
import { MessageTemplateEditor } from "../components/MessageTemplateEditor";
import {
  useMessagingAutomations,
  useMessagingSettings,
  useMessagingTemplates,
  useUpdateMessagingAutomation,
  useUpdateMessagingSettings,
  useUpdateMessagingTemplate,
} from "../queries/use-messaging-configuration";
import type { MessagingAutomationRule, MessagingAutomationType } from "../types/messaging.types";
import "./WhatsAppSettingsPage.css";

const automationCopy: Record<MessagingAutomationType, { title: string; description: string }> = {
  BOOKING_CONFIRMED: {
    title: "Reserva confirmada",
    description: "Envía un mensaje cuando la reserva queda confirmada.",
  },
  BOOKING_CANCELLED: {
    title: "Reserva cancelada",
    description: "Envía un mensaje cuando la reserva es cancelada.",
  },
};

const automationTypes: MessagingAutomationType[] = ["BOOKING_CONFIRMED", "BOOKING_CANCELLED"];

export function WhatsAppSettingsPage() {
  const { session } = useAuth();
  const { activeBusinessId, activeRole } = useBusinessContext();
  const canWrite = activeRole === "OWNER" || activeRole === "ADMIN";
  const queryOptions = { businessId: activeBusinessId, accessToken: session?.accessToken };
  const settings = useMessagingSettings(queryOptions);
  const automations = useMessagingAutomations(queryOptions);
  const templates = useMessagingTemplates(queryOptions);
  const updateSettings = useUpdateMessagingSettings(queryOptions);
  const updateAutomation = useUpdateMessagingAutomation(queryOptions);
  const updateTemplate = useUpdateMessagingTemplate(queryOptions);
  const [editingType, setEditingType] = useState<MessagingAutomationType | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const editorTrigger = useRef<HTMLElement>(null);

  const isLoading = settings.isPending || automations.isPending || templates.isPending;
  const firstError = settings.error ?? automations.error ?? templates.error;

  function effectiveTemplate(type: MessagingAutomationType): string {
    return templates.data?.find((template) => template.templateType === type)?.content ?? messagingTemplateDefaults[type];
  }

  function ruleFor(type: MessagingAutomationType): MessagingAutomationRule | undefined {
    return automations.data?.find((rule) => rule.automationType === type);
  }

  async function saveTemplate(content: string) {
    if (!editingType) return;
    try {
      await updateTemplate.mutateAsync({ templateType: editingType, content });
      setEditingType(null);
      setSavedMessage("Mensaje guardado correctamente.");
    } catch {
      // El editor muestra el error normalizado de la mutation.
    }
  }

  async function toggleBot() {
    if (!canWrite || !settings.data) return;
    setSavedMessage(null);
    try {
      await updateSettings.mutateAsync(!settings.data.botEnabled);
      setSavedMessage("Configuración del bot guardada.");
    } catch {
      // React Query conserva el error para mostrarlo junto al control.
    }
  }

  async function toggleAutomation(type: MessagingAutomationType, enabled: boolean) {
    if (!canWrite) return;
    setSavedMessage(null);
    try {
      await updateAutomation.mutateAsync({ automationType: type, enabled });
      setSavedMessage("Automatización guardada.");
    } catch {
      // React Query conserva el error para mostrarlo bajo la lista.
    }
  }

  async function retryAll() {
    await Promise.all([settings.refetch(), automations.refetch(), templates.refetch()]);
  }

  return (
    <section className="messaging-page" aria-labelledby="messaging-page-title">
      <header className="messaging-page__header">
        <span className="messaging-page__eyebrow">Configuración</span>
        <h1 id="messaging-page-title">WhatsApp</h1>
        <p>Configurá las respuestas automáticas y los mensajes que recibe cada huésped.</p>
      </header>

      {isLoading ? <div className="messaging-state" role="status"><RefreshCw size={24} aria-hidden="true" /><strong>Cargando configuración</strong><span>Consultando los mensajes del negocio activo.</span></div> : null}

      {!isLoading && firstError ? <div className="messaging-state" role="alert"><AlertCircle size={24} aria-hidden="true" /><strong>No pudimos cargar WhatsApp</strong><span>{firstError instanceof Error ? firstError.message : "Ocurrió un error inesperado."}</span><Button type="button" onClick={() => void retryAll()}>Reintentar</Button></div> : null}

      {!isLoading && !firstError && settings.data && automations.data && templates.data ? <div className="messaging-page__content">
        <section className="messaging-section messaging-section--general" aria-labelledby="messaging-general-title">
          <div className="messaging-section__heading">
            <div className="messaging-section__icon"><Bot size={21} aria-hidden="true" /></div>
            <div><h2 id="messaging-general-title">General</h2><p>Definí si TOP puede responder automáticamente las consultas recibidas.</p></div>
          </div>
          <label className={`messaging-switch${canWrite ? "" : " messaging-switch--readonly"}`}>
            <span><strong>Responder automáticamente</strong><small>TOP puede responder consultas y ayudar a iniciar reservas desde WhatsApp.</small></span>
            <input type="checkbox" checked={settings.data.botEnabled} disabled={!canWrite || updateSettings.isPending} onChange={() => void toggleBot()} />
            <span className="messaging-switch__visual" aria-hidden="true" />
          </label>
          {updateSettings.isError ? <p className="messaging-form-error" role="alert">{updateSettings.error instanceof Error ? updateSettings.error.message : "No pudimos guardar la configuración."}</p> : null}
        </section>

        <section className="messaging-section" aria-labelledby="messaging-automations-title">
          <div className="messaging-section__heading"><div className="messaging-section__icon"><MessageCircle size={21} aria-hidden="true" /></div><div><h2 id="messaging-automations-title">Automatizaciones</h2><p>Elegí qué eventos de reserva generan una respuesta automática.</p></div></div>
          <div className="messaging-automation-list">
            {automationTypes.map((type) => {
              const rule = ruleFor(type);
              const copy = automationCopy[type];
              return <article className="messaging-automation" key={type}>
                <div className="messaging-automation__copy"><h3>{copy.title}</h3><p>{copy.description}</p></div>
                <div className="messaging-automation__actions">
                  <label className={`messaging-switch messaging-switch--compact${canWrite ? "" : " messaging-switch--readonly"}`}>
                    <span className="messaging-visually-hidden">Activar {copy.title.toLowerCase()}</span>
                    <input type="checkbox" checked={rule?.enabled ?? false} disabled={!canWrite || updateAutomation.isPending} onChange={(event) => void toggleAutomation(type, event.target.checked)} />
                    <span className="messaging-switch__visual" aria-hidden="true" />
                  </label>
                  <Button type="button" variant="tertiary" size="sm" onClick={(event) => { editorTrigger.current = event.currentTarget; setSavedMessage(null); setEditingType(type); }}>
                    <Pencil size={16} aria-hidden="true" />Editar mensaje
                  </Button>
                </div>
              </article>;
            })}
          </div>
          {updateAutomation.isError ? <p className="messaging-form-error" role="alert">{updateAutomation.error instanceof Error ? updateAutomation.error.message : "No pudimos guardar la automatización."}</p> : null}
        </section>

        <section className="messaging-section" aria-labelledby="messaging-messages-title">
          <div className="messaging-section__heading"><div className="messaging-section__icon"><MessageCircle size={21} aria-hidden="true" /></div><div><h2 id="messaging-messages-title">Mensajes</h2><p>Revisá y personalizá el contenido de cada respuesta automática.</p></div></div>
          <div className="messaging-template-list">
            {automationTypes.map((type) => <article className="messaging-template" key={type}>
              <div><h3>{automationCopy[type].title}</h3><p>{effectiveTemplate(type).split("\n")[0]}</p></div>
              <Button type="button" variant="secondary" size="sm" onClick={(event) => { editorTrigger.current = event.currentTarget; setSavedMessage(null); setEditingType(type); }}><Pencil size={16} aria-hidden="true" />Editar mensaje</Button>
            </article>)}
          </div>
        </section>

        {savedMessage ? <p className="messaging-success" role="status"><Check size={17} aria-hidden="true" />{savedMessage}</p> : null}
        {!canWrite ? <p className="messaging-notice">Tu rol permite consultar esta configuración. Solo propietarios y administradores pueden modificarla.</p> : null}
      </div> : null}

      <MessageTemplateEditor
        open={Boolean(editingType)}
        triggerRef={editorTrigger}
        automationType={editingType}
        content={editingType ? effectiveTemplate(editingType) : ""}
        canWrite={canWrite}
        isSaving={updateTemplate.isPending}
        saveError={updateTemplate.error instanceof Error ? updateTemplate.error : null}
        onClose={() => { updateTemplate.reset(); setEditingType(null); }}
        onSave={saveTemplate}
      />
    </section>
  );
}

