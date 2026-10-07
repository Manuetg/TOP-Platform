import { X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ApiError } from "../../../shared/api/api-client";
import { Button } from "../../../shared/ui/Button";
import { Input } from "../../../shared/ui/Input";
import { OverlayPanel } from "../../../shared/ui/OverlayPanel";
import { businessDateAt } from "../../../shared/utils/business-date";
import { formatMoney } from "../../../shared/utils/money";
import { formatBusinessInstant } from "../../../shared/utils/date-format";
import { getFinanceExpense, getFinanceReport, type FinanceContext } from "../api/finance-api";
import type { FinanceCommandMutation } from "../queries/use-finance";
import type { FinanceReport } from "../types/finance.types";
import { buildCommand, commandTitles, initialDraft, type CommandDraft, type FinanceAction } from "./command-form";
import { ExpenseFields, SettlementFields } from "./ExpenseFields";
import { AccountField, MoneyField, SelectField } from "./FinanceFields";
import { financeErrorMessage } from "./FinanceFeedback";

interface Props { action: FinanceAction; context: FinanceContext; report: FinanceReport; mutation: FinanceCommandMutation; triggerRef: RefObject<HTMLElement | null>; onClose: () => void; onSaved: () => void; savedDraft?: CommandDraft; sourceRefreshed?: boolean; onPreserve?: (draft: CommandDraft, action: FinanceAction, refreshed: boolean) => void }
export function FinanceCommandDialog({ action, context, report, mutation, triggerRef, onClose, onSaved, savedDraft, sourceRefreshed = false, onPreserve }: Props) {
  const [draft, setDraft] = useState(() => savedDraft ?? initialDraft(action, businessDateAt(new Date(), report.timeZone)));
  const [error, setError] = useState<unknown>(null);
  const [currentAction, setCurrentAction] = useState(action);
  const [currentReport, setCurrentReport] = useState(report);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(sourceRefreshed);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const set = (key: keyof typeof draft, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));
  const busy = mutation.isPending || mutation.hasUncertainResult || refreshing;
  const conflict = error instanceof ApiError && error.status === 409;
  const hasOpening = action.type === "OPEN_ACCOUNT" || (action.type === "CREATE_ACCOUNT" && draft.hasOpening);
  const hasInstant = !action.openingCorrection && (hasOpening || ["SETTLE_EXPENSE", "TRANSFER", "CASH_MOVEMENT", "COUNT_CASH"].includes(action.type) || (action.type === "CREATE_EXPENSE" && draft.paid));
  const hasReason = !["CREATE_EXPENSE", "CREATE_CATALOG", "SETTLE_EXPENSE"].includes(action.type) && (action.type !== "CREATE_ACCOUNT" || draft.hasOpening);
  const close = () => { onPreserve?.(draft, currentAction, refreshed); onClose(); };
  async function submit(retry = false) {
    setError(null);
    try { await (retry ? mutation.retry() : mutation.execute(buildCommand(currentAction, draft))); if (alive.current) onSaved(); }
    catch (failure) { setError(failure); }
  }
  async function refreshSource() {
    setRefreshing(true);
    try {
      if (action.expense) {
        const latest = await getFinanceExpense(context, action.expense.id);
        if (alive.current) setCurrentAction({ ...action, expense: latest.expense });
      } else {
        const latest = await getFinanceReport(context, { from: report.from, to: report.to });
        const target = refreshTarget(action, latest);
        if (alive.current) { setCurrentAction(target); setCurrentReport(latest); }
      }
      if (alive.current) { setError(null); setRefreshed(true); }
    } catch (failure) { if (alive.current) setError(failure); }
    finally { if (alive.current) setRefreshing(false); }
  }
  return <OverlayPanel open label={commandTitles[action.type]} className="finance-dialog" layerClassName="finance-dialog-layer" closeLabel="Cerrar formulario" triggerRef={triggerRef} onClose={close} dismissible={!mutation.isPending && !refreshing} portal motion="dialog">
    <header><div><span>Finanzas · {report.currency}</span><h2>{action.openingCorrection ? "Corregir apertura mediante ajuste" : commandTitles[action.type]}</h2></div><Button type="button" variant="ghost" iconOnly aria-label="Cerrar formulario" disabled={mutation.isPending || refreshing} onClick={close}><X size={20} aria-hidden="true" /></Button></header>
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <fieldset className="finance-form-body" disabled={busy}>
        {currentAction.account ? <p>Cuenta: <strong>{currentAction.account.name}</strong></p> : null}
        {action.openingCorrection ? <p>La apertura original fue {formatMoney(currentAction.account!.opening!.amountMinor)} en {formatBusinessInstant(currentAction.account!.opening!.occurredAt, report.timeZone)}. Registra únicamente la diferencia positiva o negativa, en ese mismo corte; el origen se conserva.</p> : null}
        {currentAction.catalog ? <p>Catálogo: <strong>{currentAction.catalog.name}</strong></p> : null}
        {["ARCHIVE_ACCOUNT", "ARCHIVE_CATALOG"].includes(action.type) ? <p>El archivo conserva el historial y retira este elemento de las nuevas selecciones.</p> : null}
        {["CREATE_CATALOG", "CREATE_ACCOUNT"].includes(action.type) ? <><Input id="finance-name" label="Nombre" required value={draft.name} onChange={(event) => set("name", event.target.value)} />
          <SelectField id="finance-kind" label="Tipo" value={draft.kind} onChange={(value) => set("kind", value)}>{action.type === "CREATE_ACCOUNT" ? <><option value="CASH">Caja de efectivo</option><option value="BANK">Banco informativo</option></> : <><option value="CATEGORY">Categoría</option><option value="COUNTERPARTY">Contraparte</option></>}</SelectField></> : null}
        {action.type === "CREATE_ACCOUNT" ? <label className="finance-check"><input type="checkbox" checked={draft.hasOpening} onChange={(event) => set("hasOpening", event.target.checked)} /> Conozco el saldo de apertura</label> : null}
        {hasOpening ? <MoneyField id="opening-amount" label="Saldo de apertura" signed value={draft.amount} onChange={(value) => set("amount", value)} /> : null}
        {action.type === "CREATE_EXPENSE" ? <ExpenseFields draft={draft} setDraft={setDraft} report={currentReport} /> : null}
        {action.type === "SETTLE_EXPENSE" ? <><p>Gasto: <strong>{currentAction.expense!.description}</strong> · pendiente {formatMoney(currentAction.expense!.outstandingMinor)}</p><SettlementFields draft={draft} setDraft={setDraft} report={currentReport} />
          <Input id="settlement-reference" label="Referencia (opcional)" value={draft.reference} onChange={(event) => set("reference", event.target.value)} /></> : null}
        {action.type === "SET_EVIDENCE" ? <Input id="evidence-reference" label="Referencia del comprobante (opcional)" value={draft.reference} onChange={(event) => set("reference", event.target.value)} /> : null}
        {action.type === "LINK_PAYMENT" ? <><p>Cobro existente: {formatMoney(currentAction.payment!.amountMinor)}. La asignación conserva el saldo de la reserva.</p><AccountField id="payment-account" value={draft.accountId} onChange={(value) => set("accountId", value)} accounts={currentReport.accounts} /></> : null}
        {["TRANSFER", "CASH_MOVEMENT", "COUNT_CASH"].includes(action.type) ? <>{!action.openingCorrection ? <AccountField id="movement-account" label={action.type === "TRANSFER" ? "Desde cuenta" : "Cuenta"} value={draft.accountId} onChange={(value) => set("accountId", value)} accounts={action.type === "COUNT_CASH" ? currentReport.accounts.filter((item) => item.kind === "CASH") : currentReport.accounts} /> : null}
          {action.type === "TRANSFER" ? <AccountField id="transfer-to" label="Hacia cuenta" value={draft.toAccountId} onChange={(value) => set("toAccountId", value)} accounts={currentReport.accounts} /> : null}
          {action.type === "CASH_MOVEMENT" && !action.openingCorrection ? <SelectField id="movement-kind" label="Clase del movimiento" value={draft.kind} onChange={(value) => set("kind", value)}><option value="CONTRIBUTION">Aporte</option><option value="WITHDRAWAL">Retiro</option><option value="FINANCING">Financiación recibida</option><option value="ADJUSTMENT">Ajuste firmado</option></SelectField> : null}
          <MoneyField id="movement-amount" label={action.type === "COUNT_CASH" ? "Efectivo contado" : draft.kind === "ADJUSTMENT" ? "Diferencia (positiva o negativa)" : "Importe"} signed={draft.kind === "ADJUSTMENT"} value={draft.amount} onChange={(value) => set("amount", value)} /></> : null}
        {action.type === "ADJUST_COUNT" ? <p>Se registrará un movimiento por la diferencia {formatMoney(action.count!.differenceMinor)}. El arqueo original permanece.</p> : null}
        {action.type === "REVIEW_MOVEMENT" ? <p>La revisión manual conserva importes y saldos. No valida un extracto bancario.</p> : null}
        {hasInstant ? <><Input id="occurred-at" label="Fecha y hora (UTC)" type="datetime-local" required value={draft.occurredAt} onChange={(event) => set("occurredAt", event.target.value)} /><p className="finance-help">El detalle muestra la hora del negocio ({report.timeZone}). Este registro usa la hora UTC indicada.</p></> : null}
        {hasReason ? <Input id="finance-reason" label="Motivo" required minLength={2} value={draft.reason} onChange={(event) => set("reason", event.target.value)} /> : null}
        <p className="finance-help">Registras una operación ya realizada o un dato informado. TOP no ejecuta transferencias de dinero.</p>
      </fieldset>
      {error ? <p className="finance-form-error" role="alert">{financeErrorMessage(error)}</p> : null}
      {refreshed ? <p className="finance-help finance-conflict-help" role="status">Consultaste la versión actual. El borrador se conserva; revisa los datos y confirma una nueva intención de registro.</p> : null}
      {mutation.hasUncertainResult ? <div className="finance-form-error" role="status"><strong>Resultado pendiente de verificar</strong><p>Puede haberse guardado. El reintento envía exactamente el mismo registro y clave para evitar duplicados.</p></div> : null}
      <footer><Button type="button" variant="secondary" disabled={mutation.isPending || refreshing} onClick={close}>Cerrar y conservar borrador</Button>{mutation.hasUncertainResult ? <Button type="button" loading={mutation.isPending} onClick={() => { void submit(true); }}>Reintentar el mismo registro</Button> : conflict ? <Button type="button" loading={refreshing} onClick={() => { void refreshSource(); }}>Consultar versión actual</Button> : <Button type="submit" loading={mutation.isPending} disabled={refreshing}>{refreshed ? "Confirmar nuevo intento" : "Registrar"}</Button>}</footer>
    </form>
  </OverlayPanel>;
}
function refreshTarget(action: FinanceAction, report: FinanceReport): FinanceAction {
  const next = { ...action };
  if (action.account) next.account = report.accounts.find((item) => item.id === action.account!.id);
  if (action.catalog) next.catalog = report.catalogs.find((item) => item.id === action.catalog!.id);
  if (action.payment) next.payment = report.payments.find((item) => item.id === action.payment!.id);
  if (action.movement) next.movement = report.movements.find((item) => item.sourceType === action.movement!.sourceType && item.sourceId === action.movement!.sourceId);
  if (action.count) next.count = report.cashCounts.find((item) => item.id === action.count!.id);
  for (const key of ["account", "catalog", "payment", "movement", "count"] as const) if (action[key] && !next[key]) throw new Error("El origen ya no aparece en este período. Conserva tu borrador y revisa el contexto antes de continuar.");
  return next;
}
