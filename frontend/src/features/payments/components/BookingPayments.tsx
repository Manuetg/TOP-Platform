import { AlertCircle, CreditCard, WalletCards } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { ApiError } from "../../../shared/api/api-client";
import { useOutstandingBalance } from "../queries/use-outstanding-balance";
import { usePaymentHistory } from "../queries/use-payment-history";
import type { FinancialStatus, PaymentHistoryItem } from "../types/payment.types";
import { RegisterPaymentForm } from "./RegisterPaymentForm";
import "./BookingPayments.css";

interface Props {
  userId?: string;
  businessId: string;
  bookingId: string;
  accessToken?: string | null;
  timezone: string;
  enabled: boolean;
  bookingStatus?: string;
  canRecord?: boolean;
  sessionGeneration?: number;
}

const financialLabels: Record<FinancialStatus, string> = { UNPAID: "Sin pagos", PARTIALLY_PAID: "Pago parcial", PAID: "Pagada", OVERDUE: "Con vencimiento pendiente" };
const methodLabels: Record<PaymentHistoryItem["method"], string> = { CASH: "Efectivo", BANK_TRANSFER: "Transferencia", CARD: "Tarjeta", OTHER: "Otro" };

function formatMoney(amountMinor: number, currency: string) {
  const value = new Intl.NumberFormat("es-PY").format(amountMinor);
  return currency === "PYG" ? `₲ ${value}` : `${currency} ${value}`;
}

function formatInstant(value: string, timezone: string) {
  return new Intl.DateTimeFormat("es-PY", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
}

function formatPureDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(year, month - 1, day));
}

function safeMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Tu sesión ya no es válida. Inicia sesión nuevamente.";
    if (error.status === 403) return "No tienes permiso para ver esta información.";
    if (error.status === 404) return "La reserva ya no está disponible en este negocio.";
  }
  return fallback;
}

function isAccessError(error: unknown) {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}

export function BookingPayments(props: Props) {
  const balance = useOutstandingBalance(props);
  const history = usePaymentHistory(props);
  const moreButton = useRef<HTMLButtonElement>(null);
  const balanceRetryButton = useRef<HTMLButtonElement>(null);
  const balanceStatus = useRef<HTMLParagraphElement>(null);
  const historyRetryButton = useRef<HTMLButtonElement>(null);
  const historyRefreshButton = useRef<HTMLButtonElement>(null);
  const historyStatus = useRef<HTMLParagraphElement>(null);
  const previousHasNext = useRef<boolean | undefined>(undefined);
  const previousHistoryError = useRef<boolean | undefined>(undefined);
  const wasMoreFocused = useRef(false);
  const wasHistoryRetryFocused = useRef(false);
  const historyAccessError = isAccessError(history.error) && (history.isError || history.isFetchNextPageError);
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (history.data?.pages.flatMap((page) => page.items) ?? []).filter((item) => !seen.has(item.id) && (seen.add(item.id), true));
  }, [history.data]);
  const hasUsableHistory = items.length > 0;
  const historyPageError = !historyAccessError && hasUsableHistory && history.isFetchNextPageError;
  const historyRefreshError = !historyAccessError && hasUsableHistory && history.isRefetchError;

  useEffect(() => {
    if (previousHasNext.current && !history.hasNextPage && wasMoreFocused.current) historyStatus.current?.focus();
    wasMoreFocused.current = false;
    previousHasNext.current = history.hasNextPage;
  }, [history.hasNextPage]);

  useEffect(() => {
    if (previousHistoryError.current && !history.isError && wasHistoryRetryFocused.current) historyStatus.current?.focus();
    wasHistoryRetryFocused.current = false;
    previousHistoryError.current = history.isError;
  }, [history.isError]);

  function retryBalance() {
    if (document.activeElement === balanceRetryButton.current) {
      balanceStatus.current?.focus();
    }
    void balance.refetch();
  }

  function retryHistoryRefresh() {
    if (document.activeElement === historyRefreshButton.current) {
      historyStatus.current?.focus();
    }
    void history.refetch();
  }

  return (
    <section className="booking-payments" aria-labelledby="booking-payments-title">
      <div className="booking-payments__heading"><WalletCards size={20} aria-hidden="true" /><div><h2 id="booking-payments-title">Pagos</h2><p>Saldo e historial de cobros registrados.</p></div></div>
      <section className="booking-payments__balance" aria-labelledby="booking-balance-title">
        <h3 id="booking-balance-title">Resumen financiero</h3>
        {balance.isLoading ? <p role="status">Cargando saldo...</p> : balance.isError ? (
          balance.error instanceof ApiError && balance.error.status === 409 ? <p className="booking-payments__unavailable" role="status">Saldo no disponible</p> : <div role="alert"><p>{safeMessage(balance.error, "No pudimos cargar el saldo.")}</p><button ref={balanceRetryButton} type="button" className="top-button top-button--secondary" onClick={retryBalance}>Reintentar saldo</button></div>
        ) : balance.data ? <><dl className="booking-payments__metrics"><div><dt>Total</dt><dd>{formatMoney(balance.data.totalAmountMinor, balance.data.currency)}</dd></div><div><dt>Pagado</dt><dd>{formatMoney(balance.data.paidAmountMinor, balance.data.currency)}</dd></div><div><dt>Pendiente</dt><dd>{formatMoney(balance.data.outstandingAmountMinor, balance.data.currency)}</dd></div><div><dt>Vencido</dt><dd>{formatMoney(balance.data.overdueAmountMinor, balance.data.currency)}</dd></div></dl><p className="booking-payments__status"><strong>{financialLabels[balance.data.financialStatus]}</strong>{balance.data.nextDueDate === null ? " · Sin próximo vencimiento" : ` · Próximo vencimiento: ${formatPureDate(balance.data.nextDueDate)}${balance.data.nextDueAmountMinor === null ? "" : ` (${formatMoney(balance.data.nextDueAmountMinor, balance.data.currency)})`}`}</p></> : null}
        <p ref={balanceStatus} tabIndex={-1} className="booking-payments__page-status" aria-label="Estado del saldo" aria-live="polite">{balance.isFetching ? "Actualizando saldo..." : ""}</p>
      </section>
      <section className="booking-payments__history" aria-labelledby="payment-history-title">
        <h3 id="payment-history-title">Historial de pagos</h3>
        {historyAccessError ? <div role="alert"><p>{safeMessage(history.error, "No pudimos cargar el historial de pagos.")}</p></div> : history.isLoading && !hasUsableHistory ? <p role="status">Cargando historial de pagos...</p> : history.isError && !hasUsableHistory ? <div role="alert"><p>{safeMessage(history.error, "No pudimos cargar el historial de pagos.")}</p><button ref={historyRetryButton} type="button" className="top-button top-button--secondary" onFocus={() => { wasHistoryRetryFocused.current = true; }} onBlur={() => { wasHistoryRetryFocused.current = false; }} onClick={() => void history.refetch()}>Reintentar historial</button></div> : !hasUsableHistory ? <p className="booking-detail-empty-value">Todavía no hay pagos registrados.</p> : <ol className="booking-payments__list">{items.map((item) => <li key={item.id}><CreditCard size={18} aria-hidden="true" /><div><strong>{formatMoney(item.amountMinor, item.currency)}</strong><span>{methodLabels[item.method]} · {item.status === "RECORDED" ? "Registrado" : item.status}</span><time dateTime={item.paidAt}>{formatInstant(item.paidAt, props.timezone)}</time>{item.reference && <span>Referencia: {item.reference}</span>}{item.note && <span>Nota: {item.note}</span>}</div></li>)}</ol>}
        {historyPageError && <div className="booking-payments__page-error" role="alert"><AlertCircle size={18} aria-hidden="true" /><span>{safeMessage(history.error, "No pudimos cargar más pagos.")}</span></div>}
        {historyRefreshError && <div className="booking-payments__page-error" role="alert"><AlertCircle size={18} aria-hidden="true" /><span>{safeMessage(history.error, "No pudimos actualizar el historial de pagos.")}</span><button ref={historyRefreshButton} type="button" className="top-button top-button--secondary" onClick={retryHistoryRefresh}>Reintentar actualización</button></div>}
        <p ref={historyStatus} tabIndex={-1} className="booking-payments__page-status" aria-label="Estado de paginación" aria-live="polite">{history.isFetchingNextPage ? "Cargando más pagos..." : !history.hasNextPage && items.length > 0 ? "No hay más pagos para mostrar." : ""}</p>
        {history.hasNextPage && !historyAccessError && <button ref={moreButton} type="button" className="top-button top-button--secondary" disabled={history.isFetchingNextPage} onFocus={() => { wasMoreFocused.current = true; }} onBlur={() => { wasMoreFocused.current = false; }} onClick={() => { if (!history.isFetchingNextPage) void history.fetchNextPage(); }}>{history.isFetchingNextPage ? "Cargando..." : historyPageError ? "Reintentar cargar más" : "Cargar más"}</button>}
      </section>
      {props.canRecord && <RegisterPaymentForm {...props} currency={balance.data?.currency} canRecord />}
    </section>
  );
}
