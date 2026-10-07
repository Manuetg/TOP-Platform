import { X } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "../../../shared/ui/Button";
import { OverlayPanel } from "../../../shared/ui/OverlayPanel";
import { formatBusinessInstant, formatPureDate } from "../../../shared/utils/date-format";
import { formatMoney } from "../../../shared/utils/money";
import type { FinanceContext } from "../api/finance-api";
import { useFinanceExpense } from "../queries/use-finance";
import { FinanceError } from "./FinanceFeedback";
import { commandTitles } from "./command-form";
import { auditReason } from "./finance-audit";
import { FinanceEvidenceAttachmentPanel } from "../v2/FinanceEvidenceAttachmentPanel";
import { FINANCE_V2_INTEGRATION } from "../pages/FinanceV2IntegrationConfig";

export function FinanceExpenseDetail({ id, context, timeZone, triggerRef, onClose }: { id: string; context: FinanceContext; timeZone: string; triggerRef: RefObject<HTMLElement | null>; onClose: () => void }) {
  const query = useFinanceExpense(context, id);
  const expense = query.data?.expense;
  return <OverlayPanel open label="Detalle del gasto" className="finance-dialog" layerClassName="finance-dialog-layer" closeLabel="Cerrar detalle" triggerRef={triggerRef} onClose={onClose} portal motion="dialog">
    <header><h2>Detalle del gasto</h2><Button type="button" variant="ghost" iconOnly aria-label="Cerrar detalle" onClick={onClose}><X size={20} aria-hidden="true" /></Button></header>
    <div className="finance-detail-body">{query.isLoading ? <p role="status">Cargando gasto.</p> : query.isError ? <FinanceError error={query.error} onRetry={() => { void query.refetch(); }} /> : expense ? <>
      <h3>{expense.description}</h3><p>Detalle vigente · versión {expense.version} · consumo {formatPureDate(expense.consumedOn)}</p>
      <dl><div><dt>Total</dt><dd>{formatMoney(expense.amountMinor)}</dd></div><div><dt>Pagado</dt><dd>{formatMoney(expense.paidAmountMinor)}</dd></div><div><dt>Pendiente actual</dt><dd>{formatMoney(expense.outstandingMinor)}</dd></div></dl>
      <p>{expense.evidenceMissing ? "Evidencia faltante" : expense.reference === null ? "Sin referencia textual; consulta los comprobantes adjuntos." : `Referencia privada: ${expense.reference}`}</p><p>Registró: {expense.recordedByUserId} · {formatBusinessInstant(expense.createdAt, timeZone)}</p>
      <h3>Líneas</h3><ul>{expense.lines.map((line) => <li key={line.id}>{line.label} · {line.categoryName} · {line.resourceName ?? "Sin asignar"} · {line.operational ? "Operativo" : "No operativo"} · {formatMoney(line.amountMinor)}</li>)}</ul>
      <h3>Pagos del gasto</h3>{expense.settlements.length ? <ul>{expense.settlements.map((payment) => <li key={payment.id}>{formatMoney(payment.amountMinor)} · {formatBusinessInstant(payment.occurredAt, timeZone)} · {payment.reference ?? "Sin referencia"} · registró {payment.recordedByUserId}</li>)}</ul> : <p>Sin pagos registrados.</p>}
      <h3>Historial auditable</h3><ol>{query.data!.audit.map((audit) => <li key={audit.id}><strong>{commandTitles[audit.action as keyof typeof commandTitles] ?? audit.action}</strong><p>{formatBusinessInstant(audit.occurredAt, timeZone)} · actor {audit.actorUserId}</p>{auditReason(audit.details) ? <p>Motivo: {auditReason(audit.details)}</p> : null}<p>Origen: {audit.sourceId}</p></li>)}</ol>
    </> : null}</div>
    <FinanceEvidenceAttachmentPanel context={context} access={{role:"OWNER",...FINANCE_V2_INTEGRATION}} expenseId={id} expenseVersion={expense?.version} />
  </OverlayPanel>;
}
