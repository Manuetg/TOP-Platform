import { X } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { OverlayPanel } from "../../../shared/ui/OverlayPanel";
import { formatBusinessInstant } from "../../../shared/utils/date-format";
import { formatMoney } from "../../../shared/utils/money";
import type { FinanceContext } from "../api/finance-api";
import { useFinanceAudit } from "../queries/use-finance";
import type { FinanceAccount, FinanceMovement, FinanceReport } from "../types/finance.types";
import { commandTitles } from "./command-form";
import { FinanceError } from "./FinanceFeedback";
import { auditReason } from "./finance-audit";

export const sourceLabels: Record<FinanceMovement["sourceType"], string> = { OPENING: "Apertura", SETTLEMENT: "Pago de gasto", PAYMENT: "Cobro bruto de reserva", VOID: "Reverso de cobro", REFUND: "Devolución externa", TRANSFER: "Transferencia interna", MOVEMENT: "Movimiento de cuenta" };
interface SourceProps { source: FinanceMovement; context: FinanceContext; report: FinanceReport; triggerRef: RefObject<HTMLElement | null>; onClose: () => void }
export function FinanceSourceDetail({ source, context, report, triggerRef, onClose }: SourceProps) {
  const query = useFinanceAudit(context, source.sourceType, source.sourceId);
  const payment = report.payments.find((item) => item.id === (source.paymentId ?? (source.sourceType === "PAYMENT" ? source.sourceId : null)));
  const bookingId = source.bookingId ?? payment?.bookingId;
  return <OverlayPanel open label="Origen e historial del movimiento" className="finance-dialog" layerClassName="finance-dialog-layer" closeLabel="Cerrar origen" triggerRef={triggerRef} onClose={onClose} portal motion="dialog">
    <header><h2>Origen e historial del movimiento</h2><Button type="button" variant="ghost" iconOnly aria-label="Cerrar origen" onClick={onClose}><X size={20} aria-hidden="true" /></Button></header>
    <div className="finance-detail-body"><h3>{source.description}</h3><p>{sourceLabels[source.sourceType]} · {formatMoney(source.amountMinor)} · {formatBusinessInstant(source.occurredAt, report.timeZone)}</p><p>Versión de origen {source.sourceVersion}. {source.includedInBalance ? "Incluido en el saldo registrado." : "Fuera del corte de apertura."}</p>
      {source.sourceType === "VOID" ? <p>El reverso corrige el registro en la fecha original del cobro y conserva su historial.</p> : source.sourceType === "REFUND" ? <p>La devolución registra una salida de su cuenta propia en la fecha declarada del reintegro externo.</p> : null}
      {bookingId ? <Link className="finance-text-link" to={`/app/bookings/${bookingId}/payments`}>Abrir cobro original de la reserva</Link> : null}
      {source.reviewDetails ? <p>Revisión registrada por {source.reviewDetails.actorUserId} · {formatBusinessInstant(source.reviewDetails.occurredAt, report.timeZone)} · motivo: {source.reviewDetails.reason}{source.reviewStale ? " · desactualizada" : ""}</p> : null}
      <h3>Historial</h3>{query.isLoading ? <p role="status">Cargando historial.</p> : query.isError ? <FinanceError error={query.error} onRetry={() => { void query.refetch(); }} /> : query.data?.length ? <ol>{query.data.map((audit) => <li key={audit.id}><strong>{({ VOID_PAYMENT: "Anulación de cobro", REFUND_PAYMENT: "Devolución externa", SET_TERMINAL_FINAL_AMOUNT: "Importe final de cancelación" } as Record<string,string>)[audit.action] ?? commandTitles[audit.action as keyof typeof commandTitles] ?? audit.action}</strong><p>{formatBusinessInstant(audit.occurredAt, report.timeZone)} · actor {audit.actorUserId}</p>{auditReason(audit.details) ? <p>Motivo: {auditReason(audit.details)}</p> : null}<p>Origen: {audit.sourceId}</p></li>)}</ol> : <p>Sin auditoría Finance adicional. El hecho original permanece en su módulo de origen.</p>}
    </div>
  </OverlayPanel>;
}
export function FinanceAccountDetail({ account, context, report, triggerRef, onClose }: { account: FinanceAccount; context: FinanceContext; report: FinanceReport; triggerRef: RefObject<HTMLElement | null>; onClose: () => void }) {
  const [source, setSource] = useState<FinanceMovement | null>(null);
  const sourceTrigger = useRef<HTMLElement | null>(null);
  const rows = report.balanceSources.filter((item) => item.accountId === account.id);
  return <><OverlayPanel open label="Origen del saldo registrado" className="finance-dialog" layerClassName="finance-dialog-layer" closeLabel="Cerrar saldo" triggerRef={triggerRef} onClose={onClose} portal motion="dialog">
    <header><h2>Origen del saldo registrado</h2><Button type="button" variant="ghost" iconOnly aria-label="Cerrar saldo" onClick={onClose}><X size={20} aria-hidden="true" /></Button></header>
    <div className="finance-detail-body"><h3>{account.name}</h3><strong className="finance-account-balance">{account.balanceMinor === null ? "Saldo desconocido" : formatMoney(account.balanceMinor)}</strong><p>Todos los orígenes desde la apertura hasta el fin excluido {report.to}, incluidos los anteriores al inicio del filtro. Estos importes explican el saldo; los movimientos del período tienen un alcance diferente.</p>
      {account.balanceMinor === null ? <p>Sin apertura informada no existe un saldo conocido que reconstruir.</p> : <ul className="finance-balance-sources">{rows.map((item) => <li key={item.id}><div><strong>{sourceLabels[item.sourceType]}</strong><p>{item.description} · {formatBusinessInstant(item.occurredAt, report.timeZone)}</p></div><strong className="finance-amount">{formatMoney(item.amountMinor)}</strong><Button type="button" variant="secondary" size="sm" onClick={(event) => { sourceTrigger.current = event.currentTarget; setSource(item); }}>Ver origen e historial</Button></li>)}</ul>}
    </div>
  </OverlayPanel>{source ? <FinanceSourceDetail source={source} context={context} report={report} triggerRef={sourceTrigger} onClose={() => setSource(null)} /> : null}</>;
}
