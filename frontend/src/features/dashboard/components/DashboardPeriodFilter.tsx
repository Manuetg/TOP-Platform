import { useState } from "react";
import { Button } from "../../../shared/ui/Button";
import { Input } from "../../../shared/ui/Input";
import type { DashboardPeriod } from "../types/dashboard.types";
import { validateDashboardPeriod } from "../period";

export function DashboardPeriodFilter({ period, onApply }: {
  period: DashboardPeriod;
  onApply: (period: DashboardPeriod) => void;
}) {
  const [draft, setDraft] = useState(period);
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="dashboard-period" aria-label="Período del resumen" noValidate onSubmit={(event) => {
      event.preventDefault();
      const nextError = validateDashboardPeriod(draft);
      setError(nextError);
      if (!nextError) onApply({ ...draft });
    }}>
      <div className="dashboard-period__controls">
        <Input id="dashboard-from" label="Desde" type="date" required value={draft.from}
          aria-invalid={Boolean(error)} aria-describedby="dashboard-period-help dashboard-period-error"
          onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
        <Input id="dashboard-to" label="Hasta" type="date" required value={draft.to}
          aria-invalid={Boolean(error)} aria-describedby="dashboard-period-help dashboard-period-error"
          onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
        <Button type="submit">Aplicar</Button>
      </div>
      <p id="dashboard-period-help">Hasta no incluido · Máximo 31 días · Fechas del negocio</p>
      <div id="dashboard-period-error" role={error ? "alert" : undefined}>{error}</div>
    </form>
  );
}
