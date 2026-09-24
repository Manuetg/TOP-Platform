import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../../shared/ui/Button";
import { ConfirmDialog } from "../../../shared/ui/ConfirmDialog";
import { archiveContact } from "../api/archive-contact";
import type { Contact } from "../types/contact.types";

export function ArchiveContactAction({ contact, accessToken }: { contact: Contact; accessToken?: string | null }) {
  const client = useQueryClient();
  const trigger = useRef<HTMLButtonElement>(null);
  const operation = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  useEffect(() => () => operation.current?.abort(), []);
  async function confirm() {
    if (operation.current || contact.status === "ARCHIVED") return;
    const controller = new AbortController();
    operation.current = controller;
    setLoading(true); setError(null);
    try {
      const archived = await archiveContact({ businessId: contact.businessId, contactId: contact.id, accessToken, signal: controller.signal });
      if (controller.signal.aborted) return;
      await client.cancelQueries({ queryKey: ["contacts", contact.businessId] });
      if (controller.signal.aborted) return;
      client.setQueryData(["contacts", contact.businessId, contact.id], archived);
      void client.invalidateQueries({ queryKey: ["contacts", contact.businessId] });
      void client.invalidateQueries({ queryKey: ["global-search"] });
      setSuccess(true); setOpen(false);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No pudimos archivar el contacto.");
    } finally {
      if (!controller.signal.aborted) { operation.current = null; setLoading(false); }
    }
  }
  return <div>
    <Button ref={trigger} type="button" variant="destructive" aria-disabled={contact.status === "ARCHIVED"} onClick={() => { if (contact.status === "ARCHIVED") return; setError(null); setOpen(true); }}>Archivar contacto</Button>
    {success && <p role="status">El contacto se archivó. Sus reservas e historial se conservan.</p>}
    <ConfirmDialog open={open} title="Archivar contacto" description={`Vas a archivar a ${contact.fullName}. Sus reservas e historial se conservan.`} confirmLabel="Archivar" destructive triggerRef={trigger} loading={loading} error={error} onCancel={() => setOpen(false)} onConfirm={() => void confirm()} />
  </div>;
}
