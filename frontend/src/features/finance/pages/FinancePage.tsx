import { Download, RefreshCw, WalletCards } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError } from "../../../shared/api/api-client";
import { Button } from "../../../shared/ui/Button";
import { Input } from "../../../shared/ui/Input";
import { addCalendarDays, businessDateAt } from "../../../shared/utils/business-date";
import { formatBusinessInstant, formatPureDate } from "../../../shared/utils/date-format";
import { formatMoney } from "../../../shared/utils/money";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { exportFinanceReport, type FinanceContext } from "../api/finance-api";
import { FinanceCommandDialog } from "../components/FinanceCommandDialog";
import { FinanceExpenseDetail } from "../components/FinanceExpenseDetail";
import { FinanceError, financeErrorMessage } from "../components/FinanceFeedback";
import { AccountsPanel, ExpensesPanel, MovementsPanel, PaymentsPanel } from "../components/FinancePanels";
import { FinanceAccountDetail, FinanceSourceDetail } from "../components/FinanceSourceDetail";
import type { CommandDraft, FinanceAction } from "../components/command-form";
import { useFinanceCommand, useFinanceReport } from "../queries/use-finance";
import type { FinanceMovement, FinanceQuery, FinanceReport } from "../types/finance.types";
import "./Finance.css";
import { FinanceV2Bridge } from "../v2/FinanceV2Bridge";
import { financeV2Views } from "../v2/v2-ui.types";
import { FINANCE_V2_INTEGRATION } from "./FinanceV2IntegrationConfig";

const tabs = [{ id: "overview", label: "Panorama" }, { id: "expenses", label: "Gastos" }, { id: "accounts", label: "Cuentas y catálogos" }, { id: "payments", label: "Cobros" }, { id: "movements", label: "Movimientos y arqueos" }, ...financeV2Views] as const;
function actionKey(action: FinanceAction) { return `${action.type}:${action.expense?.id ?? action.account?.id ?? action.catalog?.id ?? action.payment?.id ?? action.movement?.id ?? action.count?.id ?? "new"}:${Boolean(action.openingCorrection)}`; }
export function FinancePage() {
  const { session, status } = useAuth();
  const { activeBusinessId, activeBusiness, activeRole } = useBusinessContext();
  const key = JSON.stringify([status, session?.user.id, activeBusinessId, activeRole, activeBusiness?.status, activeBusiness?.timezone]);
  if (status !== "authenticated" || !session || !activeBusiness || !activeBusinessId) return <p role="status">Selecciona un negocio para consultar Finanzas.</p>;
  if (activeRole !== "OWNER") return <FinanceError error={new ApiError(403, "Acceso reservado al dueño.")} />;
  return <FinanceContent key={key} businessName={activeBusiness.name} timeZone={activeBusiness.timezone} context={{ businessId: activeBusinessId, userId: session.user.id, accessToken: session.accessToken }} />;
}
function FinanceContent({ businessName, timeZone, context }: { businessName: string; timeZone: string; context: FinanceContext }) {
  const [params, setParams] = useSearchParams();
  const today = businessDateAt(new Date(), timeZone);
  const period = { from: params.get("from") ?? `${today.slice(0, 8)}01`, to: params.get("to") ?? addCalendarDays(today, 1) };
  const [draft, setDraft] = useState<FinanceQuery>(period);
  const [periodError, setPeriodError] = useState("");
  const [action, setAction] = useState<FinanceAction | null>(null);
  const [actionReport, setActionReport] = useState<FinanceReport | null>(null);
  const pendingAction = useRef<{ action: FinanceAction; report: FinanceReport } | null>(null);
  const [savedDrafts, setSavedDrafts] = useState<Record<string, { draft: CommandDraft; action: FinanceAction; refreshed: boolean; report: FinanceReport }>>({});
  const [expenseId, setExpenseId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [source, setSource] = useState<FinanceMovement | null>(null);
  const [notice, setNotice] = useState("");
  const [exportError, setExportError] = useState<unknown>(null);
  const [exporting, setExporting] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const alive = useRef(true);
  // Captures the mounted business/identity for asynchronous export completion.
  const exportController = useRef<AbortController | null>(null);
  const report = useFinanceReport(context, period);
  const mutation = useFinanceCommand(context);
  const tab = tabs.find((item) => item.id === params.get("view"))?.id ?? "overview";
  useEffect(() => { alive.current = true; return () => { alive.current = false; exportController.current?.abort(); }; }, []);
  useEffect(() => { setDraft({ from: period.from, to: period.to }); }, [period.from, period.to]);
  function selectTab(view: string) { const next = new URLSearchParams(params); next.set("view", view); setParams(next); }
  function applyPeriod() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.from) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.to) || draft.from >= draft.to) { setPeriodError("Indica fechas válidas con fin posterior al inicio."); return; }
    const next = new URLSearchParams(params); next.set("from", draft.from); next.set("to", draft.to); setParams(next); setPeriodError(""); setNotice("");
  }
  function onAction(next: FinanceAction, element: HTMLElement) {
    const saved = savedDrafts[actionKey(next)];
    const target = mutation.hasUncertainResult && pendingAction.current ? pendingAction.current : { action: saved?.action ?? next, report: report.data ?? saved!.report };
    trigger.current = element; pendingAction.current = target; setAction(target.action); setActionReport(target.report); setNotice("");
  }
  function onExpense(id: string, element: HTMLElement) { trigger.current = element; setExpenseId(id); }
  function onAccount(id: string, element: HTMLElement) { trigger.current = element; setAccountId(id); }
  function onSource(item: FinanceMovement, element: HTMLElement) { trigger.current = element; setSource(item); }
  async function download(current: FinanceReport) {
    if (exporting) return;
    setExporting(true); setExportError(null);
    const controller = new AbortController(); exportController.current = controller;
    try {
      const csv = await exportFinanceReport(context, { from: current.from, to: current.to }, current.token, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `finanzas-${current.from}-${current.to}.csv`; anchor.click(); URL.revokeObjectURL(url);
      setNotice("Exportación del reporte consultado descargada.");
    } catch (error) { if (alive.current && !controller.signal.aborted) setExportError(error); }
    finally { if (alive.current) setExporting(false); }
  }
  const data = report.data;
  return <section className="finance-page"><header className="finance-hero"><div><span>{businessName} · Finanzas operativas · PYG</span><h1>Finanzas</h1><p>Gastos, obligaciones y dinero registrado con su origen.</p></div><WalletCards size={28} aria-hidden="true" /></header>
    <form className="finance-filters" onSubmit={(event) => { event.preventDefault(); applyPeriod(); }}><Input id="finance-from" label="Desde" type="date" required value={draft.from} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} /><Input id="finance-to" label="Hasta (sin incluir)" type="date" required value={draft.to} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} /><Button type="submit">Aplicar</Button><Button type="button" variant="secondary" onClick={() => { void report.refetch(); }} loading={report.isFetching}><RefreshCw size={16} aria-hidden="true" /> Actualizar</Button></form>
    {periodError ? <p className="finance-form-error" role="alert">{periodError}</p> : null}
    <nav className="finance-tabs" aria-label="Vistas de Finanzas">{tabs.map((item) => <Button type="button" key={item.id} variant="ghost" aria-current={tab === item.id ? "page" : undefined} onClick={() => selectTab(item.id)}>{item.label}</Button>)}</nav>
    {notice ? <p className="finance-notice" role="status">{notice}</p> : null}
    {exportError ? <p className="finance-form-error" role="alert">{financeErrorMessage(exportError)}{exportError instanceof ApiError && exportError.status === 409 ? " El archivo requiere actualizar el reporte para conservar el mismo conjunto." : ""}</p> : null}
    {mutation.hasUncertainResult && !action && pendingAction.current ? <Button type="button" onClick={(event) => onAction(pendingAction.current!.action, event.currentTarget)}>Recuperar registro pendiente</Button> : null}
    {report.isLoading ? <div className="finance-state" role="status" aria-busy="true">Cargando Finanzas de {businessName}.</div> : report.isError ? <FinanceError error={report.error} onRetry={() => { void report.refetch(); }} /> : data ? <>
      <div className="finance-report-meta"><p>{formatPureDate(data.from)} → {formatPureDate(data.to)} (fin excluido) · {data.timeZone}<br />Calculado: {formatBusinessInstant(data.asOf, data.timeZone)}</p><Button type="button" variant="secondary" loading={exporting} onClick={() => { void download(data); }}><Download size={16} aria-hidden="true" /> Exportar este reporte</Button></div>
      <div className="finance-coverage"><strong>Alcance de la lectura</strong><p>Los cobros brutos conservan su fecha original. Una anulación corrige ese registro original; una devolución se incluye por su fecha propia. El flujo neto del período puede ser negativo aunque no haya cobros nuevos. El neto retenido describe sólo los cobros de este período hasta su corte.</p><p>Las obligaciones muestran el saldo actual de gastos consumidos en el período, calculado en {formatBusinessInstant(data.asOf, data.timeZone)}. No representan deuda histórica. Los saldos de cuentas usan movimientos anteriores al fin indicado y posteriores a su apertura.</p><p>{data.coverage.unconfiguredAccountIds.length ? `${data.coverage.unconfiguredAccountIds.length} cuenta(s) sin apertura. ` : ""}{data.coverage.missingEvidenceExpenseIds.length} gasto(s) con evidencia faltante. Este reporte registra operaciones. El ingreso por servicio y la rentabilidad se consultan en Resultados.</p></div>
      {tab === "overview" ? <FinanceOverview report={data} selectTab={selectTab} /> : null}
      {tab === "overview" || tab === "expenses" ? <ExpensesPanel report={data} onAction={onAction} onExpense={onExpense} /> : null}
      {tab === "accounts" ? <AccountsPanel report={data} onAction={onAction} onExpense={onExpense} onAccount={onAccount} /> : null}
      {tab === "payments" ? <PaymentsPanel report={data} onAction={onAction} onExpense={onExpense} /> : null}
      {tab === "movements" ? <MovementsPanel report={data} onAction={onAction} onExpense={onExpense} onSource={onSource} /> : null}

      {expenseId ? <FinanceExpenseDetail id={expenseId} context={context} timeZone={data.timeZone} triggerRef={trigger} onClose={() => setExpenseId(null)} /> : null}
      {accountId && data.accounts.some((account) => account.id === accountId) ? <FinanceAccountDetail account={data.accounts.find((account) => account.id === accountId)!} context={context} report={data} triggerRef={trigger} onClose={() => setAccountId(null)} /> : null}
      {source ? <FinanceSourceDetail source={source} context={context} report={data} triggerRef={trigger} onClose={() => setSource(null)} /> : null}
    </> : null}
    <FinanceV2Bridge context={context} businessName={businessName} role="OWNER" configuration={FINANCE_V2_INTEGRATION} report={data} period={period} view={financeV2Views.find((item) => item.id === tab)?.id ?? "planning"} active={financeV2Views.some((item) => item.id === tab)} />
    {action && actionReport ? <FinanceCommandDialog key={actionKey(action)} action={action} context={context} report={actionReport} mutation={mutation} triggerRef={trigger} savedDraft={savedDrafts[actionKey(action)]?.draft} sourceRefreshed={savedDrafts[actionKey(action)]?.refreshed} onPreserve={(preserved, target, refreshed) => { pendingAction.current = { action: target, report: actionReport }; setSavedDrafts((current) => ({ ...current, [actionKey(action)]: { draft: preserved, action: target, refreshed, report: actionReport } })); }} onClose={() => { setAction(null); setActionReport(null); setNotice("Borrador conservado en este negocio mientras permanezcas en Finanzas."); }} onSaved={() => { setSavedDrafts((current) => { const next = { ...current }; delete next[actionKey(action)]; return next; }); pendingAction.current = null; setAction(null); setActionReport(null); setNotice("Registro guardado."); }} /> : null}
  </section>;
}
function FinanceOverview({ report, selectTab }: { report: FinanceReport; selectTab: (view: string) => void }) {
  const total = report.totals;
  const metrics = [
    { label: "Saldo registrado al corte", value: total.registeredBalanceMinor, view: "accounts" },
    { label: "Cobros brutos registrados del período", value: total.grossRecordedAmountMinor, view: "payments" },
    { label: "Cobros anulados del período original", value: total.voidedAmountMinor, view: "payments" },
    { label: "Devoluciones realizadas en el período", value: total.refundedAmountMinor, view: "movements" },
    { label: "Flujo neto de cobros del período", value: total.netRecordedReceiptFlowMinor, view: "movements" },
    { label: "Neto retenido de los cobros del período", value: total.paymentNetRetainedAmountMinor, view: "payments" },
    { label: "Gastos consumidos del período", value: total.expenseMinor, view: "expenses" },
    { label: "Pagos de gastos del período", value: total.settlementsMinor, view: "movements" },
    { label: "Pendiente actual de estos gastos", value: total.outstandingMinor, view: "expenses" },
    { label: "Cobros brutos sin cuenta asignada", value: total.unassignedPaymentsMinor, view: "payments" },
  ];
  return <div className="finance-metrics">{metrics.map((metric) => <button key={metric.label} onClick={() => selectTab(metric.view)}><span>{metric.label}</span><strong>{metric.value === null ? "Desconocido" : formatMoney(metric.value)}</strong><small>Ver origen</small></button>)}</div>;
}
