/** Read only the public reason, without exposing internal command payloads in the UI. */
export function auditReason(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  if ("command" in details && details.command && typeof details.command === "object" && "reason" in details.command && typeof details.command.reason === "string") return details.command.reason;
  return "reason" in details && typeof details.reason === "string" ? details.reason : null;
}
