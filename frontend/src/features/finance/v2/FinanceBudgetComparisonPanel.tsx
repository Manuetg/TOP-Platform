import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/api-client';
import { Input } from '../../../shared/ui/Input';
import { formatMoney } from '../../../shared/utils/money';
import type { FinanceContext } from '../api/finance-api';
import { FinanceError } from '../components/FinanceFeedback';
import { SelectField } from '../components/FinanceFields';
import { getV2BudgetComparison } from './finance-v2-api';
import type { FinanceBudgetComparison, FinanceBudgetForecastBasis } from './finance-v2.types';
import { financeV2Key } from './use-v2-command';
import { canFinanceV2, sectionReady, type FinanceV2Access, type FinanceV2References } from './v2-ui.types';

export function FinanceBudgetComparisonPanel({ context, access, references, initialMonth, active }: { context: FinanceContext; access: FinanceV2Access; references: FinanceV2References; initialMonth: string; active: boolean }) {
  const [month, setMonth] = useState(initialMonth);
  const [forecastBasis, setForecastBasis] = useState<FinanceBudgetForecastBasis | null>(null);
  const ready = canFinanceV2(access, 'finance.planning') && sectionReady(access, 'budget-comparison');
  const query = useQuery({ queryKey: [...financeV2Key(context), 'budget-comparison', month, forecastBasis], queryFn: ({ signal }) => getV2BudgetComparison(context, month, signal, forecastBasis), enabled: active && ready && /^\d{4}-\d{2}$/.test(month), retry: false });
  if (!active) return null;
  return <section className="finance-panel">
    <header><h3>Presupuesto frente al costo registrado</h3></header>
    {!ready ? <p>Esta comparación todavía no está disponible.</p> : <>
      <Input id="v2-comparison-month" label="Mes de comparación" type="month" required value={month} onChange={event => setMonth(event.target.value)} />
      <SelectField id="v2-comparison-forecast" label="Base de previsión de costos" value={forecastBasis ?? ''} onChange={value => setForecastBasis(value === 'ACTUAL_PLUS_PENDING_COMMITMENTS' ? value : null)}>
        <option value="">Sin proyección seleccionada</option>
        <option value="ACTUAL_PLUS_PENDING_COMMITMENTS">Costos reales más compromisos pendientes</option>
      </SelectField>
      {query.isFetching ? <p role="status">Consultando presupuesto y costos del mes.</p> : null}
      {query.error instanceof ApiError && query.error.status === 404 ? <p>No hay presupuesto registrado para este mes.</p> : query.isError ? <FinanceError error={query.error} onRetry={() => { void query.refetch(); }} /> : null}
      {query.data && !query.isError ? <>
        <p>Corte actual de esta comparación: {query.data.asOf}. Sin revisión aprobada, la base y las desviaciones permanecen desconocidas.</p>
        <div className="finance-v2-list">{query.data.lines.map((line, index) => <BudgetLine key={`${line.resourceId}:${line.categoryId}:${index}`} line={line} references={references} />)}</div>
        <p>Las bases y desviaciones provienen del reporte del servidor. Una meta presupuestaria no modifica el costo ni el saldo registrado.</p>
        <p>Estimaciones laborales seleccionadas: {formatMoney(query.data.estimatedSelectedMinor)}. Trabajo propio imputado: {formatMoney(query.data.ownerImputedMinor)}. Se muestran separados de esta previsión.</p>
        {query.data.forecastBasis === 'ACTUAL_PLUS_PENDING_COMMITMENTS' ? <p>La previsión suma costos reales y compromisos operativos pendientes conocidos del mes. No incluye estimaciones laborales, trabajo propio ni gastos futuros sin registrar; no garantiza el costo final.</p> : <p>No se ha seleccionado una proyección de costos.</p>}
        <p>Fuentes conocidas: {query.data.coverage.costSourceCount} de costo y {query.data.coverage.pendingCommitmentSourceCount} compromisos pendientes. Límite de consulta: {query.data.coverage.sourceLimit} fuentes.</p>
        {query.data.coverage.unknownCostSourceIds.length > 0 || query.data.coverage.missingEvidenceSourceIds.length > 0 || query.data.coverage.unsupportedReasons.length > 0 ? <p className="finance-warning">Hay fuentes desconocidas o evidencia pendiente. Estos importes sólo cubren las fuentes conocidas.</p> : null}
      </> : null}
    </>}
  </section>;
}

function nullable(value: number | null): string { return value === null ? 'Sin base confirmada' : formatMoney(value); }
function BudgetLine({ line, references }: { line: FinanceBudgetComparison['lines'][number]; references: FinanceV2References }) {
  return <article>
    <strong>{references.report.resources.find(resource => resource.id === line.resourceId)?.name ?? 'Sin Resource asignado'} · {references.report.catalogs.find(category => category.id === line.categoryId)?.name ?? 'Sin categoría asignada'}</strong>
    <dl><dt>Base aprobada</dt><dd>{nullable(line.approvedMinor)}</dd><dt>Costo real</dt><dd>{formatMoney(line.actualMinor)}</dd><dt>Compromiso pendiente</dt><dd>{formatMoney(line.committedPendingMinor)}</dd><dt>Desviación del real</dt><dd>{nullable(line.actualDeviationMinor)}</dd><dt>Previsión</dt><dd>{nullable(line.forecastMinor)}</dd><dt>Desviación prevista</dt><dd>{nullable(line.forecastDeviationMinor)}</dd></dl>
  </article>;
}
