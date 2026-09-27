import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../../../shared/ui/Button";
import { formatDashboardMonth, isValidDashboardMonth, shiftDashboardMonth } from "../period";

export function DashboardMonthFilter({
  month,
  currentMonth,
  onChange,
}: {
  month: string;
  currentMonth: string;
  onChange: (month: string) => void;
}) {
  const move = (offset: number) => {
    const next = shiftDashboardMonth(month, offset);
    if (isValidDashboardMonth(next)) onChange(next);
  };

  return (
    <div className="dashboard-month-filter" aria-label="Mes del resumen">
      <span className="dashboard-period__icon"><CalendarDays size={16} aria-hidden="true" /></span>
      <Button type="button" variant="ghost" className="dashboard-month-filter__arrow" aria-label="Mes anterior" onClick={() => move(-1)}>
        <ChevronLeft size={18} aria-hidden="true" />
      </Button>
      <label className="dashboard-month-filter__label">
        <span className="dashboard-sr-only">Seleccionar mes</span>
        <span aria-hidden="true">{formatDashboardMonth(month)}</span>
        <input
          type="month"
          value={month}
          aria-label="Seleccionar mes"
          onChange={(event) => {
            if (isValidDashboardMonth(event.target.value)) onChange(event.target.value);
          }}
        />
      </label>
      <Button type="button" variant="ghost" className="dashboard-month-filter__arrow" aria-label="Mes siguiente" onClick={() => move(1)}>
        <ChevronRight size={18} aria-hidden="true" />
      </Button>
      {month !== currentMonth ? <Button type="button" variant="secondary" onClick={() => onChange(currentMonth)}>Este mes</Button> : null}
    </div>
  );
}
