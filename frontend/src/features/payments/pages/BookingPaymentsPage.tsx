import { formatBusinessInstant } from "../../../shared/utils/date-format";
import { formatPureDate as formatHumanDate } from "../../../shared/utils/date-format";
import { formatMoney as money } from "../../../shared/utils/money";
import {
  ArrowLeft,
  CalendarClock,
  ChevronDown,
  CircleAlert,
  Clock3,
  LockKeyhole,
  Pencil,
  Plus,
  ReceiptText,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../../../shared/ui/Button";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { useBooking } from "../../bookings/queries/use-booking";
import { useContacts } from "../../contacts/queries/use-contacts";
import {
  useBookingFinances,
  useRegisterPayment,
  useSavePaymentPlan,
} from "../queries/use-booking-finances";
import type { PaymentMethod } from "../types/payment.types";
import "./Payments.css";

const methods: Array<{ value: PaymentMethod; label: string }> = [
  { value: "CASH", label: "Efectivo" },
  { value: "BANK_TRANSFER", label: "Transferencia" },
  { value: "CARD", label: "Tarjeta externa" },
  { value: "OTHER", label: "Otro" },
];

const installmentLabels = {
  PENDING: "Pendiente",
  PARTIALLY_PAID: "Pago parcial",
  PAID: "Pagada",
  OVERDUE: "Vencida",
} as const;

const bookingStatusLabels = {
  DRAFT: "Borrador",
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  IN_PROGRESS: "En estadía",
  COMPLETED: "Finalizada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No se presentó",
} as const;



function localDateTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function percentageOf(part: number, total: number) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  return Math.max(0, Math.round((part / total) * 100));
}

function dateFromYmd(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
}


function formatStay(checkIn?: string | null, checkOut?: string | null) {
  if (!checkIn || !checkOut) {
    return "Fechas pendientes";
  }

  return `${formatHumanDate(checkIn)} – ${formatHumanDate(checkOut)}`;
}

function daysBeforeDate(date: string, days: number) {
  const result = dateFromYmd(date);

  if (!result) return "";

  result.setUTCDate(result.getUTCDate() - days);

  return result.toISOString().slice(0, 10);
}

function daysBeforeCheckIn(checkIn: string, dueDate?: string | null) {
  if (!dueDate) return null;

  const checkInDate = dateFromYmd(checkIn);
  const due = dateFromYmd(dueDate);

  if (!checkInDate || !due) return null;

  const difference = Math.round(
    (checkInDate.getTime() - due.getTime()) / 86_400_000,
  );

  return difference >= 0 ? difference : null;
}

function dueDescription(days: number) {
  if (days === 0) return "Día del check-in";
  if (days === 1) return "1 día antes";
  return `${days} días antes`;
}

function installmentName(index: number, count: number) {
  if (count === 2) {
    return index === 0 ? "Adelanto" : "Saldo final";
  }

  return `Cuota ${index + 1}`;
}

interface DraftInstallment {
  amount: string;
  dueDate: string;
}

export function BookingPaymentsPage() {
  const navigate = useNavigate();
  const { bookingId = "" } = useParams();
  const { session } = useAuth();
  const { activeBusinessId, activeBusiness } = useBusinessContext();

  const booking = useBooking({
    businessId: activeBusinessId,
    bookingId,
    accessToken: session?.accessToken,
  });

  const contacts = useContacts({
    businessId: activeBusinessId,
    accessToken: session?.accessToken,
  });

  const { balance, plan, history } = useBookingFinances({
    businessId: activeBusinessId,
    bookingId,
    accessToken: session?.accessToken,
  });

  const register = useRegisterPayment({
    businessId: activeBusinessId,
    bookingId,
    accessToken: session?.accessToken,
  });

  const savePlan = useSavePaymentPlan({
    businessId: activeBusinessId,
    bookingId,
    accessToken: session?.accessToken,
  });

  const [showPayment, setShowPayment] = useState(false);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [showAdvancedPlan, setShowAdvancedPlan] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleIndex, setRescheduleIndex] = useState<number | null>(
    null,
  );
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [payment, setPayment] = useState({
    amount: "",
    method: "CASH" as PaymentMethod,
    paidAt: localDateTime(),
    reference: "",
    note: "",
  });

  const [installments, setInstallments] = useState<DraftInstallment[]>([
    { amount: "", dueDate: "" },
  ]);

  const [depositPercent, setDepositPercent] = useState("50");
  const [depositDaysBefore, setDepositDaysBefore] = useState("3");
  const [balanceDaysBefore, setBalanceDaysBefore] = useState("0");

  const contact = contacts.data?.find(
    (item) => item.id === booking.data?.contactId,
  );

  const payments = useMemo(
    () => history.data?.pages.flatMap((page) => page.items) ?? [],
    [history.data],
  );

  const isLoading =
    booking.isLoading ||
    contacts.isLoading ||
    balance.isLoading ||
    plan.isLoading ||
    history.isLoading;

  const fatalError =
    booking.error ?? balance.error ?? plan.error ?? history.error;

  const totalAmountMinor = balance.data?.totalAmountMinor ?? 0;
  const paidAmountMinor = balance.data?.paidAmountMinor ?? 0;
  const outstandingAmountMinor =
    balance.data?.outstandingAmountMinor ?? 0;
  const overdueAmountMinor = balance.data?.overdueAmountMinor ?? 0;

  const paidPercentage = percentageOf(
    paidAmountMinor,
    totalAmountMinor,
  );

  const planLocked = Boolean(
    plan.data?.installments.some(
      (installment) => installment.appliedAmountMinor > 0,
    ),
  );

  const canManagePlan =
    Boolean(booking.data) &&
    ["CONFIRMED", "IN_PROGRESS"].includes(booking.data!.status) &&
    !planLocked;

  const suggestedPaymentMinor =
    overdueAmountMinor > 0
      ? Math.min(overdueAmountMinor, outstandingAmountMinor)
      : balance.data?.nextDueAmountMinor &&
          balance.data.nextDueAmountMinor > 0
        ? Math.min(
            balance.data.nextDueAmountMinor,
            outstandingAmountMinor,
          )
        : outstandingAmountMinor;

  const draftPaymentAmount = Number(payment.amount);
  const draftPaymentPercentage = percentageOf(
    draftPaymentAmount,
    totalAmountMinor,
  );

  const depositPercentValue = Number(depositPercent);

  const depositPreviewAmount =
    Number.isInteger(depositPercentValue) &&
    depositPercentValue >= 1 &&
    depositPercentValue <= 99
      ? Math.round(
          (totalAmountMinor * depositPercentValue) / 100,
        )
      : 0;

  const balancePreviewAmount = Math.max(
    0,
    totalAmountMinor - depositPreviewAmount,
  );

  function buildPercentagePlan(
    percentText = depositPercent,
    depositDaysText = depositDaysBefore,
    finalDaysText = balanceDaysBefore,
  ) {
    const percent = Number(percentText);
    const depositDays = Number(depositDaysText);
    const finalDays = Number(finalDaysText);
    const total = balance.data?.totalAmountMinor ?? 0;
    const checkInDate = booking.data?.checkInDate;

    if (
      !Number.isInteger(percent) ||
      percent < 1 ||
      percent > 99 ||
      !Number.isInteger(depositDays) ||
      depositDays < 0 ||
      depositDays > 365 ||
      !Number.isInteger(finalDays) ||
      finalDays < 0 ||
      finalDays > 365 ||
      depositDays < finalDays ||
      !checkInDate ||
      total <= 1
    ) {
      return;
    }

    const depositAmount = Math.round(
      (total * percent) / 100,
    );

    const remainingAmount = total - depositAmount;

    if (depositAmount <= 0 || remainingAmount <= 0) {
      return;
    }

    setInstallments([
      {
        amount: String(depositAmount),
        dueDate: daysBeforeDate(checkInDate, depositDays),
      },
      {
        amount: String(remainingAmount),
        dueDate: daysBeforeDate(checkInDate, finalDays),
      },
    ]);

    setFormError(null);
  }

  function changeDepositPercent(value: string) {
    setDepositPercent(value);
    buildPercentagePlan(
      value,
      depositDaysBefore,
      balanceDaysBefore,
    );
  }

  function changeDepositDays(value: string) {
    setDepositDaysBefore(value);
    buildPercentagePlan(
      depositPercent,
      value,
      balanceDaysBefore,
    );
  }

  function changeBalanceDays(value: string) {
    setBalanceDaysBefore(value);
    buildPercentagePlan(
      depositPercent,
      depositDaysBefore,
      value,
    );
  }

  function openPayment(amountOverride?: number) {
    setFormError(null);
    setShowPaymentDetails(false);

    const requestedAmount =
      amountOverride && amountOverride > 0
        ? Math.min(amountOverride, outstandingAmountMinor)
        : suggestedPaymentMinor;

    setPayment({
      amount:
        requestedAmount > 0
          ? String(requestedAmount)
          : "",
      method: "CASH",
      paidAt: localDateTime(),
      reference: "",
      note: "",
    });

    setShowPayment(true);
  }

  function openPlan() {
    if (!canManagePlan) return;

    setFormError(null);

    const currentPlan = plan.data;
    const checkInDate = booking.data?.checkInDate;

    if (currentPlan) {
      setInstallments(
        currentPlan.installments.map((item) => ({
          amount: String(item.amountMinor),
          dueDate: item.dueDate ?? "",
        })),
      );

      if (
        currentPlan.installments.length === 2 &&
        currentPlan.totalAmountMinor > 0 &&
        checkInDate
      ) {
        const first = currentPlan.installments[0];
        const second = currentPlan.installments[1];

        const percent = Math.max(
          1,
          Math.min(
            99,
            Math.round(
              (first.amountMinor /
                currentPlan.totalAmountMinor) *
                100,
            ),
          ),
        );

        setDepositPercent(String(percent));

        setDepositDaysBefore(
          String(
            daysBeforeCheckIn(
              checkInDate,
              first.dueDate,
            ) ?? 3,
          ),
        );

        setBalanceDaysBefore(
          String(
            daysBeforeCheckIn(
              checkInDate,
              second.dueDate,
            ) ?? 0,
          ),
        );

        setShowAdvancedPlan(false);
      } else {
        setShowAdvancedPlan(true);
      }
    } else {
      setDepositPercent("50");
      setDepositDaysBefore("3");
      setBalanceDaysBefore("0");
      setShowAdvancedPlan(false);

      const total = balance.data?.totalAmountMinor ?? 0;

      if (total > 1 && checkInDate) {
        const depositAmount = Math.round(total * 0.5);

        setInstallments([
          {
            amount: String(depositAmount),
            dueDate: daysBeforeDate(checkInDate, 3),
          },
          {
            amount: String(total - depositAmount),
            dueDate: checkInDate,
          },
        ]);
      }
    }

    setShowPlan(true);
  }

  function openReschedule(index: number) {
    if (!plan.data || !canManagePlan) return;

    setFormError(null);
    setRescheduleIndex(index);
    setRescheduleDate(
      plan.data.installments[index]?.dueDate ?? "",
    );
    setShowReschedule(true);
  }

  async function submitReschedule() {
    if (
      !plan.data ||
      rescheduleIndex === null ||
      !rescheduleDate
    ) {
      setFormError("Seleccioná una nueva fecha.");
      return;
    }

    const nextInstallments = plan.data.installments.map(
      (installment, index) => ({
        amountMinor: installment.amountMinor,
        dueDate:
          index === rescheduleIndex
            ? rescheduleDate
            : installment.dueDate,
      }),
    );

    setFormError(null);

    try {
      await savePlan.mutateAsync({
        input: { installments: nextInstallments },
        replace: true,
      });

      setShowReschedule(false);
      setRescheduleIndex(null);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "No pudimos cambiar el vencimiento.",
      );
    }
  }

  async function submitPayment() {
    const amountMinor = Number(payment.amount);

    if (
      !Number.isSafeInteger(amountMinor) ||
      amountMinor <= 0
    ) {
      setFormError(
        "Ingresá un monto entero mayor que cero.",
      );
      return;
    }

    if (amountMinor > outstandingAmountMinor) {
      setFormError(
        `El pago no puede superar el saldo pendiente de ${money(
          outstandingAmountMinor,
          balance.data?.currency,
        )}.`,
      );
      return;
    }

    const paidAt = new Date(payment.paidAt);

    if (
      !payment.paidAt ||
      Number.isNaN(paidAt.getTime())
    ) {
      setFormError(
        "Ingresá una fecha y hora válidas.",
      );
      return;
    }

    if (paidAt.getTime() > Date.now()) {
      setFormError(
        "La fecha del pago no puede estar en el futuro.",
      );
      return;
    }

    setFormError(null);

    try {
      await register.mutateAsync({
        amountMinor,
        method: payment.method,
        paidAt: paidAt.toISOString(),
        reference:
          payment.reference.trim() || undefined,
        note: payment.note.trim() || undefined,
      });

      setShowPayment(false);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "No pudimos registrar el pago.",
      );
    }
  }

  async function submitPlan() {
    const parsed = installments.map((item) => ({
      amountMinor: Number(item.amount),
      dueDate: item.dueDate || null,
    }));

    if (
      parsed.some(
        (item) =>
          !Number.isSafeInteger(item.amountMinor) ||
          item.amountMinor <= 0,
      )
    ) {
      setFormError(
        "Cada cuota debe tener un monto entero mayor que cero.",
      );
      return;
    }

    const total = parsed.reduce(
      (sum, item) => sum + item.amountMinor,
      0,
    );

    if (total !== totalAmountMinor) {
      setFormError(
        `Las cuotas deben sumar ${money(
          totalAmountMinor,
          balance.data?.currency,
        )}.`,
      );
      return;
    }

    setFormError(null);

    try {
      await savePlan.mutateAsync({
        input: { installments: parsed },
        replace: Boolean(plan.data),
      });

      setShowPlan(false);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "No pudimos guardar el plan.",
      );
    }
  }

  if (isLoading) {
    return (
      <section className="payments-page">
        <div
          className="payments-state"
          aria-busy="true"
        >
          Preparando la cuenta de la reserva…
        </div>
      </section>
    );
  }

  if (
    fatalError ||
    !booking.data ||
    !balance.data
  ) {
    return (
      <section className="payments-page">
        <button
          className="payments-back"
          type="button"
          onClick={() =>
            navigate(`/app/bookings/${bookingId}`)
          }
        >
          <ArrowLeft size={17} />
          Volver a la reserva
        </button>

        <div
          className="payments-state payments-state--error"
          role="alert"
        >
          <CircleAlert size={22} />
          {fatalError instanceof Error
            ? fatalError.message
            : "No pudimos cargar la cuenta."}
        </div>
      </section>
    );
  }

  const currency = balance.data.currency;

  const bookingStatus =
    bookingStatusLabels[
      booking.data
        .status as keyof typeof bookingStatusLabels
    ] ?? booking.data.status;

  const accountStatus =
    outstandingAmountMinor === 0
      ? "Pagada"
      : overdueAmountMinor > 0
        ? "Vencida"
        : paidAmountMinor > 0
          ? "Pago parcial"
          : "Pendiente";

  const accountStatusClass =
    outstandingAmountMinor === 0
      ? "paid"
      : overdueAmountMinor > 0
        ? "overdue"
        : paidAmountMinor > 0
          ? "partial"
          : "pending";

  return (
    <section className="payments-page">
      <button
        className="payments-back"
        type="button"
        onClick={() =>
          navigate(`/app/bookings/${bookingId}`)
        }
      >
        <ArrowLeft size={17} />
        Volver a la reserva
      </button>

      <article className="payments-invoice">
        <header className="payments-invoice__header">
          <div>
            <span className="payments-eyebrow">
              Cuenta de la reserva
            </span>

            <h1>
              Pagos de{" "}
              {contact?.fullName ?? "la reserva"}
            </h1>

            <div className="payments-reservation-meta">
              <span>
                {formatStay(
                  booking.data.checkInDate,
                  booking.data.checkOutDate,
                )}
              </span>
              <span aria-hidden="true">•</span>
              <span>{bookingStatus}</span>
            </div>
          </div>

          <span
            className={`payments-account-status payments-account-status--${accountStatusClass}`}
          >
            {accountStatus}
          </span>
        </header>

        <div className="payments-invoice__balance">
          <div>
            <span>Saldo por cobrar</span>

            <strong>
              {money(
                outstandingAmountMinor,
                currency,
              )}
            </strong>

            {overdueAmountMinor > 0 ? (
              <small className="is-overdue">
                {money(overdueAmountMinor, currency)}{" "}
                vencidos
              </small>
            ) : outstandingAmountMinor > 0 ? (
              <small>
                {balance.data.nextDueDate
                  ? `Próximo vencimiento ${formatHumanDate(
                      balance.data.nextDueDate,
                    )}`
                  : "Pendiente de cobro"}
              </small>
            ) : (
              <small>La cuenta está al día</small>
            )}
          </div>

          <Button
            type="button"
            disabled={outstandingAmountMinor === 0}
            onClick={() => openPayment()}
          >
            <Plus size={16} />
            Registrar pago
          </Button>
        </div>

        <div className="payments-invoice__progress">
          <div>
            <span>Progreso de pago</span>
            <strong>{paidPercentage}%</strong>
          </div>

          <div
            className="payments-progress"
            role="progressbar"
            aria-label="Porcentaje pagado"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(
              paidPercentage,
              100,
            )}
          >
            <span
              style={{
                width: `${Math.min(
                  paidPercentage,
                  100,
                )}%`,
              }}
            />
          </div>
        </div>

        <div className="payments-invoice__metrics">
          <div>
            <span>Total acordado</span>
            <strong>
              {money(totalAmountMinor, currency)}
            </strong>
          </div>

          <div>
            <span>Pagado</span>
            <strong>
              {money(paidAmountMinor, currency)}
            </strong>
          </div>

          <div>
            <span>Vencido</span>
            <strong
              className={
                overdueAmountMinor > 0
                  ? "is-overdue"
                  : undefined
              }
            >
              {money(overdueAmountMinor, currency)}
            </strong>
          </div>
        </div>
      </article>

      <section className="payments-card payments-schedule">
        <header>
          <div>
            <span className="payments-eyebrow">
              Cobros programados
            </span>
            <h2>Plan de cobro</h2>
            <p>
              Fechas e importes acordados para esta
              reserva.
            </p>
          </div>

          {planLocked ? (
            <span className="payments-plan-lock">
              <LockKeyhole size={14} />
              Plan bloqueado
            </span>
          ) : canManagePlan ? (
            <Button
              type="button"
              variant="secondary"
              onClick={openPlan}
            >
              <CalendarClock size={16} />
              {plan.data
                ? "Editar plan"
                : "Crear plan"}
            </Button>
          ) : null}
        </header>

        {!plan.data ? (
          <div className="payments-empty">
            <CalendarClock size={22} />
            <strong>Sin plan de cobro</strong>
            <span>
              Definí un adelanto y cuándo debe
              cancelarse el saldo.
            </span>

            {canManagePlan && (
              <Button
                type="button"
                variant="secondary"
                onClick={openPlan}
              >
                Crear plan
              </Button>
            )}
          </div>
        ) : (
          <div className="payments-schedule-table">
            <div className="payments-schedule-head">
              <span>Concepto</span>
              <span>Vencimiento</span>
              <span>Estado</span>
              <span>Importe</span>
              <span />
            </div>

            {plan.data.installments.map(
              (item, index) => {
                const percentage = percentageOf(
                  item.amountMinor,
                  plan.data!.totalAmountMinor,
                );

                return (
                  <article
                    key={item.id}
                    className="payments-schedule-row"
                  >
                    <div className="payments-schedule-concept">
                      <span className="payments-installment-number">
                        {index + 1}
                      </span>

                      <div>
                        <strong>
                          {installmentName(
                            index,
                            plan.data!.installments
                              .length,
                          )}
                        </strong>
                        <small>
                          {percentage}% del total
                        </small>
                      </div>
                    </div>

                    <div className="payments-schedule-date">
                      <Clock3 size={15} />
                      <span>
                        {item.dueDate
                          ? formatHumanDate(
                              item.dueDate,
                            )
                          : "Sin fecha"}
                      </span>
                    </div>

                    <span
                      className={`payments-status payments-status--${item.status.toLowerCase()}`}
                    >
                      {installmentLabels[item.status]}
                    </span>

                    <div className="payments-schedule-amount">
                      <strong>
                        {money(
                          item.amountMinor,
                          plan.data!.currency,
                        )}
                      </strong>

                      {item.outstandingAmountMinor <
                        item.amountMinor && (
                        <small>
                          Saldo{" "}
                          {money(
                            item.outstandingAmountMinor,
                            plan.data!.currency,
                          )}
                        </small>
                      )}
                    </div>

                    <div className="payments-schedule-actions">
                      {item.outstandingAmountMinor > 0 && (
                        <button
                          type="button"
                          className="payments-schedule-pay"
                          onClick={() =>
                            openPayment(item.outstandingAmountMinor)
                          }
                        >
                          <Plus size={14} />
                          Pagar
                        </button>
                      )}

                      {canManagePlan &&
                        item.status !== "PAID" && (
                          <button
                            type="button"
                            onClick={() =>
                              openReschedule(index)
                            }
                          >
                            <Pencil size={14} />
                            Reprogramar
                          </button>
                        )}
                    </div>
                  </article>
                );
              },
            )}
          </div>
        )}
      </section>

      <section className="payments-card">
        <header>
          <div>
            <span className="payments-eyebrow">
              Actividad financiera
            </span>
            <h2>Pagos registrados</h2>
            <p>
              Historial de cobros confirmados para
              esta reserva.
            </p>
          </div>

          <ReceiptText size={19} />
        </header>

        {payments.length === 0 ? (
          <div className="payments-empty">
            <ReceiptText size={22} />
            <strong>
              Todavía no hay pagos registrados
            </strong>
            <span>
              Los cobros aparecerán aquí una vez que
              se registren.
            </span>
          </div>
        ) : (
          <div className="payments-activity">
            {payments.map((item) => (
              <article key={item.id}>
                <div className="payments-activity__mark">
                  <ReceiptText size={15} />
                </div>

                <div className="payments-activity__content">
                  <strong>
                    Pago registrado
                  </strong>

                  <span>
                    {
                      methods.find(
                        (method) =>
                          method.value ===
                          item.method,
                      )?.label
                    }
                    {item.reference
                      ? ` · ${item.reference}`
                      : ""}
                  </span>
                </div>

                <div className="payments-activity__date">
                  <strong>
                    {activeBusiness ? formatBusinessInstant(item.paidAt, activeBusiness.timezone) : "Sin fecha"}
                  </strong>

                  <span>
                    {item.note ?? "Sin nota"}
                  </span>
                </div>

                <strong className="payments-activity__amount">
                  {money(
                    item.amountMinor,
                    item.currency,
                  )}
                </strong>
              </article>
            ))}
          </div>
        )}

        {history.hasNextPage && (
          <div className="payments-card-footer">
            <Button
              type="button"
              variant="secondary"
              disabled={
                history.isFetchingNextPage
              }
              onClick={() =>
                void history.fetchNextPage()
              }
            >
              {history.isFetchingNextPage
                ? "Cargando…"
                : "Ver más"}
            </Button>
          </div>
        )}
      </section>

      {showPayment && (
        <FinancialModal
          title="Registrar pago"
          onClose={() => setShowPayment(false)}
        >
          <div className="payments-payment-form">
            <div className="payments-payment-amount">
              <label htmlFor="payment-amount">
                Monto recibido
              </label>

              <input
                id="payment-amount"
                autoFocus
                type="number"
                min="1"
                step="1"
                value={payment.amount}
                onChange={(event) =>
                  setPayment({
                    ...payment,
                    amount: event.target.value,
                  })
                }
              />

              {draftPaymentAmount > 0 && (
                <div className="payments-payment-preview">
                  <strong>
                    {money(
                      draftPaymentAmount,
                      currency,
                    )}
                  </strong>
                  <span>
                    {draftPaymentPercentage}% del
                    total
                  </span>
                </div>
              )}
            </div>

            <fieldset className="payments-methods">
              <legend>¿Cómo pagó?</legend>

              <div>
                {methods.map((method) => (
                  <button
                    key={method.value}
                    type="button"
                    aria-pressed={
                      payment.method ===
                      method.value
                    }
                    className={
                      payment.method ===
                      method.value
                        ? "is-active"
                        : ""
                    }
                    onClick={() =>
                      setPayment({
                        ...payment,
                        method: method.value,
                      })
                    }
                  >
                    {method.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <button
              type="button"
              className="payments-details-toggle"
              aria-expanded={showPaymentDetails}
              onClick={() =>
                setShowPaymentDetails(
                  (current) => !current,
                )
              }
            >
              <span>
                {showPaymentDetails
                  ? "Ocultar detalles"
                  : "Agregar fecha, referencia o nota"}
              </span>

              <ChevronDown
                size={16}
                className={
                  showPaymentDetails
                    ? "is-open"
                    : undefined
                }
              />
            </button>

            {showPaymentDetails && (
              <div className="payments-form-grid">
                <label>
                  Fecha y hora
                  <input
                    type="datetime-local"
                    value={payment.paidAt}
                    onChange={(event) =>
                      setPayment({
                        ...payment,
                        paidAt:
                          event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  Referencia
                  <span>Opcional</span>
                  <input
                    maxLength={120}
                    value={payment.reference}
                    onChange={(event) =>
                      setPayment({
                        ...payment,
                        reference:
                          event.target.value,
                      })
                    }
                  />
                </label>

                <label className="is-wide">
                  Nota
                  <span>Opcional</span>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={payment.note}
                    onChange={(event) =>
                      setPayment({
                        ...payment,
                        note: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            )}
          </div>

          {formError && (
            <div
              className="payments-form-error"
              role="alert"
            >
              {formError}
            </div>
          )}

          <div className="payments-modal-actions payments-modal-actions--sticky">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setShowPayment(false)
              }
            >
              Cancelar
            </Button>

            <Button
              type="button"
              disabled={
                register.isPending ||
                !Number.isSafeInteger(
                  draftPaymentAmount,
                ) ||
                draftPaymentAmount <= 0
              }
              onClick={() =>
                void submitPayment()
              }
            >
              {register.isPending
                ? "Registrando…"
                : "Registrar pago"}
            </Button>
          </div>
        </FinancialModal>
      )}

      {showReschedule &&
        rescheduleIndex !== null &&
        plan.data && (
          <FinancialModal
            title="Reprogramar vencimiento"
            onClose={() =>
              setShowReschedule(false)
            }
          >
            <div className="payments-reschedule-summary">
              <span>
                {installmentName(
                  rescheduleIndex,
                  plan.data.installments.length,
                )}
              </span>

              <strong>
                {money(
                  plan.data.installments[
                    rescheduleIndex
                  ].amountMinor,
                  plan.data.currency,
                )}
              </strong>

              <small>
                Vencimiento actual:{" "}
                {formatHumanDate(
                  plan.data.installments[
                    rescheduleIndex
                  ].dueDate,
                )}
              </small>
            </div>

            <label className="payments-date-field">
              Nuevo vencimiento
              <input
                autoFocus
                type="date"
                value={rescheduleDate}
                onChange={(event) =>
                  setRescheduleDate(
                    event.target.value,
                  )
                }
              />
            </label>

            <p className="payments-form-help">
              Se modificará únicamente la fecha de
              esta cuota. El importe del plan no
              cambia.
            </p>

            {formError && (
              <div
                className="payments-form-error"
                role="alert"
              >
                {formError}
              </div>
            )}

            <div className="payments-modal-actions payments-modal-actions--sticky">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setShowReschedule(false)
                }
              >
                Cancelar
              </Button>

              <Button
                type="button"
                disabled={
                  savePlan.isPending ||
                  !rescheduleDate
                }
                onClick={() =>
                  void submitReschedule()
                }
              >
                {savePlan.isPending
                  ? "Guardando…"
                  : "Guardar nueva fecha"}
              </Button>
            </div>
          </FinancialModal>
        )}

      {showPlan && (
        <FinancialModal
          title={
            plan.data
              ? "Editar plan de cobro"
              : "Crear plan de cobro"
          }
          onClose={() => setShowPlan(false)}
        >
          <div className="payments-plan-mode">
            <button
              type="button"
              className={
                !showAdvancedPlan
                  ? "is-active"
                  : ""
              }
              onClick={() => {
                setShowAdvancedPlan(false);
                buildPercentagePlan();
              }}
            >
              Adelanto + saldo
            </button>

            <button
              type="button"
              className={
                showAdvancedPlan
                  ? "is-active"
                  : ""
              }
              onClick={() =>
                setShowAdvancedPlan(true)
              }
            >
              Cuotas personalizadas
            </button>
          </div>

          {!showAdvancedPlan ? (
            <section className="payments-plan-builder">
              <div>
                <span className="payments-eyebrow">
                  Adelanto
                </span>
                <h3>
                  ¿Cuánto querés cobrar antes?
                </h3>
                <p>
                  TOP divide automáticamente el total
                  entre adelanto y saldo.
                </p>
              </div>

              <div className="payments-plan-presets">
                {[30, 40, 50, 60, 70].map(
                  (value) => (
                    <button
                      key={value}
                      type="button"
                      className={
                        depositPercent ===
                        String(value)
                          ? "is-active"
                          : ""
                      }
                      onClick={() =>
                        changeDepositPercent(
                          String(value),
                        )
                      }
                    >
                      {value}%
                    </button>
                  ),
                )}
              </div>

              <div className="payments-plan-fields">
                <label>
                  Porcentaje
                  <div>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={depositPercent}
                      onChange={(event) =>
                        changeDepositPercent(
                          event.target.value,
                        )
                      }
                    />
                    <span>%</span>
                  </div>
                </label>

                <label>
                  Adelanto vence
                  <div>
                    <input
                      type="number"
                      min="0"
                      max="365"
                      value={depositDaysBefore}
                      onChange={(event) =>
                        changeDepositDays(
                          event.target.value,
                        )
                      }
                    />
                    <span>
                      {dueDescription(
                        Number(
                          depositDaysBefore,
                        ) || 0,
                      )}
                    </span>
                  </div>
                </label>

                <label>
                  Saldo vence
                  <div>
                    <input
                      type="number"
                      min="0"
                      max="365"
                      value={balanceDaysBefore}
                      onChange={(event) =>
                        changeBalanceDays(
                          event.target.value,
                        )
                      }
                    />
                    <span>
                      {dueDescription(
                        Number(
                          balanceDaysBefore,
                        ) || 0,
                      )}
                    </span>
                  </div>
                </label>
              </div>

              <div className="payments-plan-preview">
                <article>
                  <span>Adelanto</span>
                  <strong>
                    {money(
                      depositPreviewAmount,
                      currency,
                    )}
                  </strong>
                  <small>
                    {depositPercentValue}% ·{" "}
                    {formatHumanDate(
                      installments[0]?.dueDate,
                    )}
                  </small>
                </article>

                <article>
                  <span>Saldo final</span>
                  <strong>
                    {money(
                      balancePreviewAmount,
                      currency,
                    )}
                  </strong>
                  <small>
                    {100 - depositPercentValue}% ·{" "}
                    {formatHumanDate(
                      installments[1]?.dueDate,
                    )}
                  </small>
                </article>
              </div>
            </section>
          ) : (
            <div className="payments-plan-editor">
              {installments.map(
                (item, index) => (
                  <div
                    key={index}
                    className="payments-plan-row"
                  >
                    <span>{index + 1}</span>

                    <label>
                      Monto
                      <input
                        type="number"
                        min="1"
                        value={item.amount}
                        onChange={(event) =>
                          setInstallments(
                            (current) =>
                              current.map(
                                (
                                  value,
                                  position,
                                ) =>
                                  position === index
                                    ? {
                                        ...value,
                                        amount:
                                          event
                                            .target
                                            .value,
                                      }
                                    : value,
                              ),
                          )
                        }
                      />
                      <small>
                        {Number(item.amount) > 0
                          ? money(
                              Number(
                                item.amount,
                              ),
                              currency,
                            )
                          : ""}
                      </small>
                    </label>

                    <label>
                      Vencimiento
                      <input
                        type="date"
                        value={item.dueDate}
                        onChange={(event) =>
                          setInstallments(
                            (current) =>
                              current.map(
                                (
                                  value,
                                  position,
                                ) =>
                                  position === index
                                    ? {
                                        ...value,
                                        dueDate:
                                          event
                                            .target
                                            .value,
                                      }
                                    : value,
                              ),
                          )
                        }
                      />
                    </label>

                    <button
                      type="button"
                      aria-label={`Eliminar cuota ${
                        index + 1
                      }`}
                      disabled={
                        installments.length === 1
                      }
                      onClick={() =>
                        setInstallments(
                          (current) =>
                            current.filter(
                              (_, position) =>
                                position !== index,
                            ),
                        )
                      }
                    >
                      <X size={16} />
                    </button>
                  </div>
                ),
              )}

              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setInstallments((current) => [
                    ...current,
                    {
                      amount: "",
                      dueDate: "",
                    },
                  ])
                }
              >
                <Plus size={16} />
                Agregar cuota
              </Button>
            </div>
          )}

          {formError && (
            <div
              className="payments-form-error"
              role="alert"
            >
              {formError}
            </div>
          )}

          <div className="payments-modal-actions payments-modal-actions--sticky">
            <span>
              Total{" "}
              <strong>
                {money(
                  installments.reduce(
                    (sum, item) =>
                      sum +
                      (Number(
                        item.amount,
                      ) || 0),
                    0,
                  ),
                  currency,
                )}
              </strong>
              <small>
                de{" "}
                {money(
                  totalAmountMinor,
                  currency,
                )}
              </small>
            </span>

            <Button
              type="button"
              disabled={savePlan.isPending}
              onClick={() =>
                void submitPlan()
              }
            >
              {savePlan.isPending
                ? "Guardando…"
                : plan.data
                  ? "Guardar cambios"
                  : "Crear plan"}
            </Button>
          </div>
        </FinancialModal>
      )}
    </section>
  );
}

function FinancialModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="payments-modal-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="payments-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
      >
        <header>
          <div>
            <span>Gestión financiera</span>
            <h2>{title}</h2>
          </div>

          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="payments-modal__body">
          {children}
        </div>
      </section>
    </div>
  );
}