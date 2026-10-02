import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking, BookingStatus } from "../../bookings/types/booking.types";
import type { MembershipRole } from "../../auth/types/auth.types";
import type { OutstandingBalance, Payment, PaymentPlan } from "../types/payment.types";
import { BookingPaymentsPage } from "./BookingPaymentsPage";

const state = vi.hoisted(() => ({
  status: "IN_PROGRESS" as BookingStatus,
  summary: undefined as Booking["financialSummary"],
  businessId: "business-1",
  businessStatus: "ACTIVE",
  role: "OWNER" as MembershipRole | null,
  balance: {} as OutstandingBalance,
  plan: null as PaymentPlan | null,
  payments: [] as Payment[],
  navigate: vi.fn(),
  register: vi.fn(),
  savePlan: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => state.navigate,
  useParams: () => ({ bookingId: "booking-1" }),
}));
vi.mock("../../auth/context/AuthContext", () => ({
  useAuth: () => ({ session: { accessToken: "synthetic-token", user: { id: "user-1" } }, status: "authenticated" }),
}));
vi.mock("../../business/context/BusinessContext", () => ({
  useBusinessContext: () => ({
    activeBusinessId: "business-1",
    activeBusiness: { id: state.businessId, status: state.businessStatus, currency: "PYG", timezone: "America/Asuncion" },
    activeRole: state.role,
    status: "ready",
  }),
}));
vi.mock("../../bookings/queries/use-booking", () => ({
  useBooking: () => ({
    data: {
      id: "booking-1",
      businessId: "business-1",
      status: state.status,
      financialSummary: state.summary,
      contactId: "contact-1",
      resourceIds: ["resource-1"],
      checkInDate: "2026-09-20",
      checkOutDate: "2026-09-22",
    },
    isLoading: false,
    error: null,
  }),
}));
vi.mock("../../contacts/queries/use-contacts", () => ({
  useContacts: () => ({ data: [{ id: "contact-1", fullName: "Adriana Duarte" }], isLoading: false }),
}));
vi.mock("../queries/use-booking-finances", () => ({
  useBookingFinances: () => ({
    balance: { data: state.balance, isLoading: false, error: null },
    plan: { data: state.plan, isLoading: false, error: null },
    history: {
      data: { pages: [{ items: state.payments }] },
      isLoading: false,
      error: null,
      hasNextPage: false,
    },
  }),
  useRegisterPayment: () => ({ mutateAsync: state.register, isPending: false }),
  useSavePaymentPlan: () => ({ mutateAsync: state.savePlan, isPending: false }),
}));

function unpaidPlan(): PaymentPlan {
  return {
    id: "plan-1",
    bookingId: "booking-1",
    currency: "PYG",
    totalAmountMinor: 400000,
    createdAt: "2026-09-01T12:00:00Z",
    updatedAt: "2026-09-01T12:00:00Z",
    installments: [
      { id: "installment-1", amountMinor: 200000, dueDate: "2026-10-02", sortOrder: 0, appliedAmountMinor: 0, outstandingAmountMinor: 200000, status: "PENDING" },
      { id: "installment-2", amountMinor: 200000, dueDate: "2026-10-03", sortOrder: 1, appliedAmountMinor: 0, outstandingAmountMinor: 200000, status: "PENDING" },
    ],
  };
}

describe("estado operativo y financiero de la cuenta de una reserva", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.register.mockReset();
    state.savePlan.mockReset();
    state.status = "IN_PROGRESS";
    state.summary = undefined;
    state.businessId = "business-1";
    state.businessStatus = "ACTIVE";
    state.role = "OWNER";
    state.plan = null;
    state.payments = [];
    state.balance = {
      bookingId: "booking-1",
      currency: "PYG",
      totalAmountMinor: 400000,
      paidAmountMinor: 100000,
      outstandingAmountMinor: 300000,
      overdueAmountMinor: 0,
      financialStatus: "PARTIALLY_PAID",
      nextDueDate: null,
      nextDueAmountMinor: null,
    };
  });

  it("permite un pago positivo mínimo de una Pendiente con precio sin habilitar plan ni confirmar en el cliente", async () => {
    state.status = "PENDING";
    state.summary = { totalAmountMinor: 400000, paidAmountMinor: 0, currency: "PYG" };
    Object.assign(state.balance, { paidAmountMinor: 0, outstandingAmountMinor: 400000, financialStatus: "UNPAID" });
    const user = userEvent.setup();
    render(<BookingPaymentsPage />);
    expect(screen.getByText("Pendiente", { selector: ".payments-reservation-meta span" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Crear plan" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Registrar pago" }));
    const dialog = screen.getByRole("dialog", { name: "Registrar pago" });
    const amount = within(dialog).getByLabelText("Monto recibido");
    await user.clear(amount); await user.type(amount, "1");
    await user.click(within(dialog).getByRole("button", { name: "Registrar pago" }));
    expect(state.register).toHaveBeenCalledOnce();
    expect(state.register).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 1 }));
    expect(state.status).toBe("PENDING");
    expect(state.savePlan).not.toHaveBeenCalled();
  });

  it("no permite registrar pagos de un Borrador o una Pendiente histórica sin precio", () => {
    state.status = "PENDING";
    state.summary = { totalAmountMinor: null, paidAmountMinor: 0, currency: null };
    const { rerender } = render(<BookingPaymentsPage />);
    expect(screen.queryByRole("button", { name: "Registrar pago" })).not.toBeInTheDocument();
    state.status = "DRAFT";
    rerender(<BookingPaymentsPage />);
    expect(screen.queryByRole("button", { name: "Registrar pago" })).not.toBeInTheDocument();
    expect(state.register).not.toHaveBeenCalled();
  });

  it.each(["archivado", "negocio incoherente"])("conserva lectura sin acciones de pago en contexto %s", (mode) => {
    if (mode === "archivado") state.businessStatus = "ARCHIVED";
    else state.businessId = "business-other";
    render(<BookingPaymentsPage />);
    expect(screen.queryByRole("button", { name: "Registrar pago" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear plan" })).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Porcentaje pagado" })).toBeInTheDocument();
    expect(state.register).not.toHaveBeenCalled();
    expect(state.savePlan).not.toHaveBeenCalled();
  });

  it("un total cero muestra porcentaje no aplicable y no admite un pago cero", () => {
    state.status = "PENDING";
    state.summary = { totalAmountMinor: 0, paidAmountMinor: 0, currency: "PYG" };
    Object.assign(state.balance, { totalAmountMinor: 0, paidAmountMinor: 0, outstandingAmountMinor: 0 });
    render(<BookingPaymentsPage />);
    expect(screen.getByText("—")).toBeVisible();
    expect(screen.getByRole("button", { name: "Registrar pago" })).toBeDisabled();
    expect(state.status).toBe("PENDING");
    expect(state.register).not.toHaveBeenCalled();
  });

  it.each([
    { status: "IN_PROGRESS", label: "En curso", account: "Pago parcial", accountClass: "partial", paid: 100000, outstanding: 300000, overdue: 0, financialStatus: "PARTIALLY_PAID", percentage: 25 },
    { status: "NO_SHOW", label: "No show", account: "Pendiente", accountClass: "pending", paid: 0, outstanding: 400000, overdue: 0, financialStatus: "UNPAID", percentage: 0 },
    { status: "COMPLETED", label: "Finalizada", account: "Pagada", accountClass: "paid", paid: 400000, outstanding: 0, overdue: 0, financialStatus: "PAID", percentage: 100 },
    { status: "CONFIRMED", label: "Confirmada", account: "Vencida", accountClass: "overdue", paid: 100000, outstanding: 300000, overdue: 100000, financialStatus: "OVERDUE", percentage: 25 },
  ] as const)("separa $label de la cuenta $account y conserva su progreso", ({ status, label, account, accountClass, paid, outstanding, overdue, financialStatus, percentage }) => {
    state.status = status;
    Object.assign(state.balance, {
      paidAmountMinor: paid,
      outstandingAmountMinor: outstanding,
      overdueAmountMinor: overdue,
      financialStatus,
    });
    render(<BookingPaymentsPage />);

    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByText(label).closest(".payments-reservation-meta")).not.toBeNull();
    expect(screen.getByText(account)).toHaveClass(`payments-account-status--${accountClass}`);
    expect(screen.getByRole("progressbar", { name: "Porcentaje pagado" })).toHaveAttribute("aria-valuenow", String(percentage));
    const register = screen.queryByRole("button", { name: "Registrar pago" });
    if (status === "NO_SHOW") expect(register).not.toBeInTheDocument();
    else if (outstanding === 0) expect(register).toBeDisabled();
    else expect(register).toBeEnabled();
    expect(state.register).not.toHaveBeenCalled();
    expect(state.savePlan).not.toHaveBeenCalled();
  });

  it("conserva las etiquetas y clases financieras de las cuotas junto al historial de una reserva finalizada", async () => {
    const user = userEvent.setup();
    state.status = "COMPLETED";
    Object.assign(state.balance, {
      paidAmountMinor: 125000,
      outstandingAmountMinor: 275000,
      overdueAmountMinor: 100000,
      financialStatus: "OVERDUE",
    });
    state.plan = {
      id: "plan-1",
      bookingId: "booking-1",
      currency: "PYG",
      totalAmountMinor: 400000,
      createdAt: "2026-09-01T12:00:00Z",
      updatedAt: "2026-09-01T12:00:00Z",
      installments: [
        { id: "installment-1", amountMinor: 100000, dueDate: "2026-09-25", sortOrder: 0, appliedAmountMinor: 0, outstandingAmountMinor: 100000, status: "PENDING" },
        { id: "installment-2", amountMinor: 100000, dueDate: "2026-09-26", sortOrder: 1, appliedAmountMinor: 25000, outstandingAmountMinor: 75000, status: "PARTIALLY_PAID" },
        { id: "installment-3", amountMinor: 100000, dueDate: "2026-09-19", sortOrder: 2, appliedAmountMinor: 100000, outstandingAmountMinor: 0, status: "PAID" },
        { id: "installment-4", amountMinor: 100000, dueDate: "2026-09-20", sortOrder: 3, appliedAmountMinor: 0, outstandingAmountMinor: 100000, status: "OVERDUE" },
      ],
    };
    state.payments = [{
      id: "payment-1",
      bookingId: "booking-1",
      amountMinor: 125000,
      currency: "PYG",
      method: "BANK_TRANSFER",
      reference: "REC-001",
      note: "Cobro historico",
      paidAt: "2026-09-19T12:00:00Z",
      createdAt: "2026-09-19T12:00:00Z",
      recordedByUserId: "user-1",
      status: "RECORDED",
    }];
    render(<BookingPaymentsPage />);

    expect(screen.getByText("Finalizada")).toBeVisible();
    const schedule = screen.getByRole("heading", { name: "Plan de cobro" }).closest("section")!;
    for (const { label, status } of [
      { label: "Pendiente", status: "pending" },
      { label: "Pago parcial", status: "partially_paid" },
      { label: "Pagada", status: "paid" },
      { label: "Vencida", status: "overdue" },
    ]) {
      expect(within(schedule).getByText(label)).toHaveClass(`payments-status--${status}`);
    }
    expect(screen.getByText("Pago registrado")).toBeVisible();
    expect(screen.getByText(/REC-001/)).toBeVisible();
    expect(screen.getByText("Cobro historico")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Porcentaje pagado" })).toHaveAttribute("aria-valuenow", "31.25");
    expect(screen.getByText("31,25%")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Volver a la reserva" }));
    expect(state.navigate).toHaveBeenCalledWith("/app/bookings/booking-1");
    expect(state.register).not.toHaveBeenCalled();
    expect(state.savePlan).not.toHaveBeenCalled();
  });

  it.each(["OWNER", "ADMIN", "RECEPTIONIST"] as const)("conserva el registro de pagos para %s", async (role) => {
    const user = userEvent.setup();
    state.role = role;
    state.register.mockResolvedValueOnce({});
    render(<BookingPaymentsPage />);

    expect(screen.getAllByRole("button", { name: "Crear plan" })).not.toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Registrar pago" }));
    const dialog = screen.getByRole("dialog", { name: "Registrar pago" });
    await user.click(within(dialog).getByRole("button", { name: "Registrar pago" }));
    expect(state.register).toHaveBeenCalledOnce();
    expect(state.register).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 300000, method: "CASH" }));
  });

  it.each(["VIEWER", null, "UNKNOWN"] as const)("conserva la lectura y oculta escrituras para el rol %s", (role) => {
    state.role = role as MembershipRole | null;
    state.plan = unpaidPlan();
    render(<BookingPaymentsPage />);

    expect(screen.getByRole("heading", { name: "Plan de cobro" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Pagos registrados" })).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Porcentaje pagado" })).toHaveAttribute("aria-valuenow", "25");
    for (const name of ["Registrar pago", "Pagar", "Crear plan", "Editar plan", "Reprogramar"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(state.register).not.toHaveBeenCalled();
    expect(state.savePlan).not.toHaveBeenCalled();
  });

  it("contiene Tab y Shift+Tab en el diálogo, cierra con Escape desde el fondo y devuelve foco", async () => {
    const user = userEvent.setup();
    const previousOverflow = document.body.style.overflow;
    const { container } = render(<BookingPaymentsPage />);
    const trigger = screen.getByRole("button", { name: "Registrar pago" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Registrar pago" });
    expect(dialog).toHaveFocus();
    expect(container).toHaveAttribute("inert");

    for (let index = 0; index < 12; index += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    within(dialog).getByRole("button", { name: "Cerrar" }).focus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "Registrar pago" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Agregar fecha, referencia o nota" }));
    for (let index = 0; index < 16; index += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(container).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe(previousOverflow);
    expect(state.register).not.toHaveBeenCalled();
  });

  it("devuelve el foco a Crear plan al cerrar su diálogo con Escape", async () => {
    const user = userEvent.setup();
    render(<BookingPaymentsPage />);
    const trigger = screen.getAllByRole("button", { name: "Crear plan" })[0];
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Crear plan de cobro" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(state.savePlan).not.toHaveBeenCalled();
  });

  it("devuelve el foco a Reprogramar al cerrar su diálogo con Escape", async () => {
    const user = userEvent.setup();
    state.plan = unpaidPlan();
    render(<BookingPaymentsPage />);
    const trigger = screen.getAllByRole("button", { name: "Reprogramar" })[0];
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Reprogramar vencimiento" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(state.savePlan).not.toHaveBeenCalled();
  });

  it("retira el diálogo y las escrituras cuando el rol cambia a VIEWER", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<BookingPaymentsPage />);
    await user.click(screen.getByRole("button", { name: "Registrar pago" }));
    expect(screen.getByRole("dialog", { name: "Registrar pago" })).toBeVisible();
    state.role = "VIEWER";
    rerender(<BookingPaymentsPage />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar pago" })).not.toBeInTheDocument();
    expect(state.register).not.toHaveBeenCalled();
    expect(state.savePlan).not.toHaveBeenCalled();
  });

  it("registra un solo pago ante dos clics síncronos y permite reintentar después del error", async () => {
    const user = userEvent.setup();
    let rejectPayment!: (error: Error) => void;
    const pending = new Promise<void>((_, reject) => { rejectPayment = reject; });
    state.register.mockImplementationOnce(() => pending);
    render(<BookingPaymentsPage />);
    await user.click(screen.getByRole("button", { name: "Registrar pago" }));
    const dialog = screen.getByRole("dialog", { name: "Registrar pago" });
    const submit = within(dialog).getByRole("button", { name: "Registrar pago" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(state.register).toHaveBeenCalledOnce();

    await act(async () => { rejectPayment(new Error("No se pudo registrar el pago.")); });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("No se pudo registrar el pago.");
    state.register.mockResolvedValueOnce({});
    await user.click(submit);
    expect(state.register).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["crear", "reprogramar"] as const)("envía una sola operación al %s un plan y permite reintentar tras el error", async (operation) => {
    const user = userEvent.setup();
    let rejectPlan!: (error: Error) => void;
    const pending = new Promise<void>((_, reject) => { rejectPlan = reject; });
    state.savePlan.mockImplementationOnce(() => pending);
    if (operation === "reprogramar") state.plan = unpaidPlan();
    render(<BookingPaymentsPage />);
    await user.click(screen.getAllByRole("button", { name: operation === "crear" ? "Crear plan" : "Reprogramar" })[0]);
    const dialog = screen.getByRole("dialog");
    if (operation === "reprogramar") {
      fireEvent.change(within(dialog).getByLabelText("Nuevo vencimiento"), { target: { value: "2026-10-04" } });
    }
    const submit = within(dialog).getByRole("button", { name: operation === "crear" ? "Crear plan" : "Guardar nueva fecha" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(state.savePlan).toHaveBeenCalledOnce();

    await act(async () => { rejectPlan(new Error("No se pudo guardar el plan.")); });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("No se pudo guardar el plan.");
    state.savePlan.mockResolvedValueOnce({});
    await user.click(submit);
    expect(state.savePlan).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
