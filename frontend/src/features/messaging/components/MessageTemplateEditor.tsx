import { useEffect, useRef } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, Info, Save, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../../shared/ui/Button";
import { OverlayPanel } from "../../../shared/ui/OverlayPanel";
import {
  messagingTemplateVariables,
} from "../constants/messaging-template-catalog";
import type { MessagingAutomationType } from "../types/messaging.types";
import {
  renderMessagingTemplate,
  validateMessagingTemplate,
} from "../utils/messaging-template";

const schema = z.object({
  content: z.string().superRefine((value, context) => {
    const message = validateMessagingTemplate(value);
    if (message) context.addIssue({ code: "custom", message });
  }),
});

type Fields = z.infer<typeof schema>;

interface MessageTemplateEditorProps {
  open: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  automationType: MessagingAutomationType | null;
  content: string;
  canWrite: boolean;
  isSaving: boolean;
  saveError: Error | null;
  onClose: () => void;
  onSave: (content: string) => Promise<void>;
}

const editorTitle: Record<MessagingAutomationType, string> = {
  BOOKING_CONFIRMED: "Mensaje de reserva confirmada",
  BOOKING_CANCELLED: "Mensaje de reserva cancelada",
};

export function MessageTemplateEditor({
  open,
  triggerRef,
  automationType,
  content,
  canWrite,
  isSaving,
  saveError,
  onClose,
  onSave,
}: MessageTemplateEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const form = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: { content },
    mode: "onChange",
  });
  const watchedContent = form.watch("content");
  const registration = form.register("content");

  useEffect(() => {
    if (open) form.reset({ content });
  }, [content, form, open]);

  if (!automationType) return null;

  function insertVariable(variable: string) {
    if (!canWrite || !textareaRef.current) return;
    const textarea = textareaRef.current;
    const current = form.getValues("content");
    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? start;
    const token = `{{${variable}}}`;
    const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
    form.setValue("content", next, { shouldDirty: true, shouldValidate: true });
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + token.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  async function submit(values: Fields) {
    await onSave(values.content);
  }

  return (
    <OverlayPanel
      open={open}
      label={editorTitle[automationType]}
      className="messaging-template-editor"
      layerClassName="messaging-template-editor-layer"
      closeLabel="Cerrar editor de mensaje"
      triggerRef={triggerRef}
      onClose={onClose}
      portal
      motion="dialog"
    >
      <div className="messaging-template-editor__header">
        <div>
          <span className="messaging-page__eyebrow">Mensajes</span>
          <h2>{editorTitle[automationType]}</h2>
          <p>Personalizá el texto que TOP enviará cuando ocurra este evento.</p>
        </div>
        <Button type="button" variant="ghost" iconOnly aria-label="Cerrar editor" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </Button>
      </div>

      <form className="messaging-template-editor__body" onSubmit={form.handleSubmit(submit)} noValidate>
        {!canWrite ? <p className="messaging-notice" role="status">Tu rol permite consultar este mensaje, pero no editarlo.</p> : null}
        <div className="messaging-template-editor__field">
          <label htmlFor="messaging-template-content">Mensaje</label>
          <textarea
            id="messaging-template-content"
            {...registration}
            ref={(node) => {
              registration.ref(node);
              textareaRef.current = node;
            }}
            disabled={!canWrite || isSaving}
            rows={9}
            aria-invalid={Boolean(form.formState.errors.content)}
            aria-describedby="messaging-template-help messaging-template-preview"
          />
          {form.formState.errors.content ? <p className="messaging-field-error" role="alert">{form.formState.errors.content.message}</p> : null}
          <div id="messaging-template-help" className="messaging-template-editor__help">
            <Info size={16} aria-hidden="true" />
            <span>Podés usar estas variables. Se reemplazan con los datos de cada reserva.</span>
          </div>
        </div>

        <div className="messaging-variable-list" aria-label="Variables disponibles">
          {messagingTemplateVariables.map((variable) => (
            <button
              key={variable.name}
              type="button"
              className="messaging-variable-chip"
              disabled={!canWrite || isSaving}
              onClick={() => insertVariable(variable.name)}
              title={`Insertar ${variable.label}`}
            >
              {`{{${variable.name}}}`}
            </button>
          ))}
        </div>

        <div className="messaging-template-preview" id="messaging-template-preview">
          <div className="messaging-template-preview__heading">
            <Eye size={17} aria-hidden="true" />
            <strong>Vista previa</strong>
          </div>
          <p>{renderMessagingTemplate(watchedContent || "")}</p>
        </div>

        {saveError ? <p className="messaging-form-error" role="alert">{saveError.message}</p> : null}

        <div className="messaging-template-editor__actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>Cancelar</Button>
          {canWrite ? <Button type="submit" loading={isSaving} loadingLabel="Guardando…" disabled={!form.formState.isValid || !form.formState.isDirty}>
            <Save size={17} aria-hidden="true" />
            Guardar mensaje
          </Button> : null}
        </div>
      </form>
    </OverlayPanel>
  );
}

