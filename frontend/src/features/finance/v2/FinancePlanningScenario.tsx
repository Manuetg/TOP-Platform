import { useEffect, useRef, useState } from 'react';
import { ApiError, ApiResponseError } from '../../../shared/api/api-client';
import { Button } from '../../../shared/ui/Button';
import { Input } from '../../../shared/ui/Input';
import { addCalendarDays, businessDateAt } from '../../../shared/utils/business-date';
import { formatMoney } from '../../../shared/utils/money';
import type { FinanceContext } from '../api/finance-api';
import { MoneyField, SelectField } from '../components/FinanceFields';
import { financeErrorMessage } from '../components/FinanceFeedback';
import { previewV2Planning } from './finance-v2-api';
import type { FinanceCashProjection } from './finance-v2.types';
import { v2Money, v2Percentage } from './v2-form';
import { canFinanceV2, sectionReady, type FinanceV2Access, type FinanceV2References } from './v2-ui.types';

type ScenarioSource = FinanceCashProjection['sources'][number];
interface ScenarioEvent {
  id: number;
  sourceKey: string | null;
  sourceLabel: string | null;
  direction: 'IN' | 'OUT';
  amount: string;
  expectedOn: string;
  probability: string;
  accountId: string;
  reason: string;
}
interface Props { context: FinanceContext; references: FinanceV2References; access?: FinanceV2Access; active?: boolean }

function sourceLabel(source: ScenarioSource) {
  return source.origin === 'COMMITMENT' ? `compromiso ${source.sourceKey}` : source.origin === 'PAYABLE' ? `gasto ${source.sourceKey}` : `cobro pendiente ${source.sourceKey}`;
}
function validateProjection(projection: FinanceCashProjection) {
  if (!Array.isArray(projection.sources) || projection.sources.length > 5000 || new Set(projection.sources.map((source) => source?.sourceKey)).size !== projection.sources.length || projection.sources.some((source) => !source || typeof source.sourceKey !== 'string' || !source.sourceKey || !['PAYABLE', 'RECEIVABLE', 'COMMITMENT'].includes(source.origin) || !['IN', 'OUT'].includes(source.direction) || !Number.isSafeInteger(source.amountMinor) || source.amountMinor <= 0 || typeof source.reviewRequired !== 'boolean' || !(source.accountId === null || typeof source.accountId === 'string') || !(source.expectedOn === null || typeof source.expectedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(source.expectedOn))) || typeof projection.token !== 'string' || !projection.token || typeof projection.scenarioToken !== 'string' || projection.basis !== 'REGISTERED_CASH_PLUS_SCENARIO' || !projection.coverage || !Array.isArray(projection.coverage.unknownAccountIds) || !Array.isArray(projection.coverage.undatedSourceKeys) || !Array.isArray(projection.coverage.reviewBookingIds)) throw new ApiResponseError();
  return projection;
}

export function FinancePlanningScenario(props: Props) {
  return <ScenarioContent key={JSON.stringify([props.context.userId, props.context.businessId])} {...props} />;
}
function ScenarioContent({ context, references, access, active = true }: Props) {
  const [horizon, setHorizon] = useState(() => addCalendarDays(businessDateAt(new Date(references.report.asOf), references.report.timeZone), 30));
  const [events, setEvents] = useState<ScenarioEvent[]>([]);
  const [excludedSourceKeys, setExcludedSourceKeys] = useState<string[]>([]);
  const [sources, setSources] = useState<FinanceCashProjection | null>(null);
  const [result, setResult] = useState<FinanceCashProjection | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [sourcesError, setSourcesError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [sourcesBusy, setSourcesBusy] = useState(false);
  const alive = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const sourcesController = useRef<AbortController | null>(null);
  const nextEventId = useRef(1);
  const baseToken = useRef('');
  const sourcesPermitted = Boolean(active && access && canFinanceV2(access, 'finance.read') && canFinanceV2(access, 'finance.planning') && sectionReady(access, 'planning-preview'));
  const previewPermitted = active && (!access || canFinanceV2(access, 'finance.planning') && sectionReady(access, 'planning-preview'));
  const inputFingerprint = JSON.stringify([horizon, events, excludedSourceKeys, references.report.asOf, references.report.accounts]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); sourcesController.current?.abort(); }; }, []);
  useEffect(() => { setResult(null); }, [inputFingerprint]);
  useEffect(() => { baseToken.current = ''; }, [references.report.asOf]);
  useEffect(() => { if (!active) { controller.current?.abort(); sourcesController.current?.abort(); } }, [active]);

  async function consultSources() {
    if (!sourcesPermitted || sourcesBusy || busy) return;
    setSourcesBusy(true); setSourcesError(null); setResult(null);
    const request = new AbortController(); sourcesController.current = request;
    try {
      const current = validateProjection(await previewV2Planning(context, { asOf: references.report.asOf, horizonTo: horizon, baseToken: '', accountIds: references.report.accounts.filter((account) => !account.archived).map((account) => account.id), events: [], excludedSourceKeys: [] }, request.signal));
      if (alive.current && !request.signal.aborted) { baseToken.current = current.token; setSources(current); }
    } catch (failure) { if (alive.current && !request.signal.aborted) setSourcesError(failure); }
    finally { if (alive.current) setSourcesBusy(false); }
  }
  function includeSource(source: ScenarioSource) {
    if (source.reviewRequired || !sourcesPermitted) return;
    setExcludedSourceKeys((current) => current.filter((key) => key !== source.sourceKey));
    setEvents((current) => current.some((event) => event.sourceKey === source.sourceKey) ? current : [...current, { id: nextEventId.current++, sourceKey: source.sourceKey, sourceLabel: sourceLabel(source), direction: source.direction, amount: String(source.amountMinor), expectedOn: source.expectedOn ?? '', probability: '100', accountId: source.accountId ?? '', reason: '' }]);
  }
  function excludeSource(source: ScenarioSource) {
    if (!sourcesPermitted) return;
    setExcludedSourceKeys((current) => current.includes(source.sourceKey) ? current : [...current, source.sourceKey]);
  }
  function updateEvent(id: number, update: Partial<ScenarioEvent>) {
    setEvents((current) => current.map((event) => event.id === id ? { ...event, ...update } : event));
  }
  async function preview(refreshBase = false) {
    if (busy || sourcesBusy || !previewPermitted) return;
    setBusy(true); setError(null);
    const request = new AbortController(); controller.current = request;
    try {
      const current = validateProjection(await previewV2Planning(context, {
        asOf: references.report.asOf, horizonTo: horizon, baseToken: refreshBase ? '' : baseToken.current,
        accountIds: references.report.accounts.filter((account) => !account.archived).map((account) => account.id),
        excludedSourceKeys: [...excludedSourceKeys],
        events: events.filter((event) => event.amount.trim() && (event.sourceKey === null || !excludedSourceKeys.includes(event.sourceKey))).map((event) => ({ sourceKey: event.sourceKey, direction: event.direction, amountMinor: v2Money(event.amount), expectedOn: event.expectedOn, probabilityBasisPoints: v2Percentage(event.probability), accountId: event.accountId || null, reason: event.reason.trim() })),
      }, request.signal));
      if (alive.current && !request.signal.aborted) { baseToken.current = current.token; setSources(current); setResult(current); }
    } catch (failure) { if (alive.current && !request.signal.aborted) setError(failure); }
    finally { if (alive.current) setBusy(false); }
  }

  return <section className="finance-panel"><header><h3>Escenario de caja</h3></header>
    <section aria-label="Fuentes del escenario" className="finance-form-body">
      <h4>Obligaciones, cobros pendientes y compromisos</h4>
      <p>Consulta las fuentes y elige cuáles incluir o excluir. Ninguna se incorpora automáticamente; los supuestos no cambian los registros originales.</p>
      <Button type="button" variant="secondary" loading={sourcesBusy} disabled={!sourcesPermitted || busy} onClick={() => { void consultSources(); }}>{sources ? 'Actualizar fuentes y conservar supuestos' : 'Consultar fuentes del escenario'}</Button>
      {!sourcesPermitted ? <p>La selección de fuentes todavía no está disponible para esta vista.</p> : null}
      {sourcesBusy ? <p role="status">Consultando las fuentes del escenario.</p> : null}
      {sourcesError ? <p role="alert" className="finance-form-error">{financeErrorMessage(sourcesError)} Conservamos los supuestos y las exclusiones elegidas.</p> : null}
      {sources ? <div className="finance-v2-list">
        {!sources.sources.length ? <p>No hay fuentes pendientes en la lectura consultada.</p> : null}
        {sources.sources.map((source) => {
          const selected = events.some((event) => event.sourceKey === source.sourceKey);
          const excluded = excludedSourceKeys.includes(source.sourceKey);
          return <article key={source.sourceKey}>
            <strong>{sourceLabel(source)}</strong><p>Pendiente informado: {formatMoney(source.amountMinor)}</p>
            <p>{source.expectedOn ? `Fecha de origen: ${source.expectedOn}` : 'Sin fecha informada; elige una fecha esperada al crear el supuesto.'}</p>
            {source.reviewRequired ? <p>Requiere revisión del plan de cobros. Esta fuente no puede incluirse en el escenario.</p> : null}
            <p>{excluded ? 'Excluida del escenario; cualquier supuesto anterior se conserva.' : selected ? 'Incluida mediante un supuesto explícito.' : 'Sin seleccionar.'}</p>
            <div className="finance-actions"><Button type="button" variant="secondary" disabled={busy || sourcesBusy || !sourcesPermitted || source.reviewRequired || selected && !excluded} onClick={() => includeSource(source)}>Agregar {sourceLabel(source)} al escenario</Button><Button type="button" variant="ghost" disabled={busy || sourcesBusy || !sourcesPermitted || excluded} onClick={() => excludeSource(source)}>Excluir {sourceLabel(source)} del escenario</Button></div>
          </article>;
        })}
      </div> : null}
      {excludedSourceKeys.length ? <div aria-label="Exclusiones conservadas"><h4>Exclusiones elegidas</h4>{excludedSourceKeys.map((key) => <p key={key}>{sources?.sources.find((source) => source.sourceKey === key) ? sourceLabel(sources.sources.find((source) => source.sourceKey === key)!) : `Origen conservado: ${key}`} <Button type="button" variant="ghost" disabled={busy || sourcesBusy || !active} onClick={() => setExcludedSourceKeys((current) => current.filter((value) => value !== key))}>Quitar exclusión {key}</Button></p>)}</div> : null}
    </section>
    <form className="finance-form-body" onSubmit={(event) => { event.preventDefault(); void preview(); }}>
      <fieldset className="finance-form-body" disabled={busy || sourcesBusy || !previewPermitted}>
        <Input id="v2-horizon" label="Horizonte hasta" type="date" required value={horizon} onChange={(event) => setHorizon(event.target.value)} />
        {events.map((event, index) => {
          const excluded = event.sourceKey !== null && excludedSourceKeys.includes(event.sourceKey);
          const source = sources?.sources.find((value) => value.sourceKey === event.sourceKey);
          return <fieldset className="finance-line" key={event.id}><legend>Evento del escenario {index + 1}</legend>
            {event.sourceLabel ? <p>Origen: {event.sourceLabel}</p> : <p>Evento manual, sin atribuirlo a una obligación registrada.</p>}
            {event.sourceKey && sources && !source ? <p role="status">El origen ya no aparece en la última lectura. Conservamos su clave y los supuestos; revisa el evento antes de consultar.</p> : null}
            {source?.reviewRequired ? <p role="alert">La fuente ahora requiere revisión. Conservamos el supuesto; exclúyelo o quítalo antes de consultar.</p> : null}
            {source ? <p>Pendiente en la última lectura: {formatMoney(source.amountMinor)}</p> : null}
            {excluded ? <p>Fuente excluida. El supuesto se conserva y no se envía entre los eventos incluidos.</p> : null}
            <fieldset disabled={excluded}>
              {event.sourceKey === null ? <SelectField id={`v2-projection-direction-${event.id}`} label="Dirección" value={event.direction} onChange={(direction) => updateEvent(event.id, { direction: direction as 'IN' | 'OUT' })}><option value="IN">Entrada prevista</option><option value="OUT">Salida prevista</option></SelectField> : <p>{event.direction === 'IN' ? 'Entrada prevista' : 'Salida prevista'}</p>}
              <MoneyField id={`v2-projection-amount-${event.id}`} label="Importe previsto" value={event.amount} onChange={(amount) => updateEvent(event.id, { amount })} />
              <Input id={`v2-projection-date-${event.id}`} label="Fecha esperada" type="date" required value={event.expectedOn} onChange={(change) => updateEvent(event.id, { expectedOn: change.target.value })} />
              <Input id={`v2-projection-probability-${event.id}`} label="Probabilidad (%)" inputMode="decimal" required value={event.probability} onChange={(change) => updateEvent(event.id, { probability: change.target.value })} />
              <SelectField id={`v2-projection-account-${event.id}`} label="Cuenta prevista (opcional)" value={event.accountId} onChange={(accountId) => updateEvent(event.id, { accountId })}><option value="">Sin asignar</option>{references.report.accounts.filter((account) => !account.archived).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</SelectField>
              <Input id={`v2-projection-reason-${event.id}`} label="Supuesto del escenario" required value={event.reason} onChange={(change) => updateEvent(event.id, { reason: change.target.value })} />
            </fieldset>
            <Button type="button" variant="ghost" onClick={() => setEvents((current) => current.filter((value) => value.id !== event.id))}>Quitar evento previsto {index + 1}</Button>
          </fieldset>;
        })}
        <Button type="button" variant="secondary" onClick={() => setEvents((current) => [...current, { id: nextEventId.current++, sourceKey: null, sourceLabel: null, direction: 'OUT', amount: '', expectedOn: '', probability: '100', accountId: '', reason: '' }])}>Agregar evento previsto</Button>
        <Button type="submit" loading={busy}>Consultar escenario</Button>
      </fieldset>
    </form>
    {!previewPermitted ? <p>La consulta de escenarios todavía no está disponible para esta vista.</p> : null}
    {error ? <p role="alert" className="finance-form-error">{financeErrorMessage(error)}</p> : null}
    {error instanceof ApiError && error.status === 409 ? <Button type="button" variant="secondary" loading={busy} disabled={!previewPermitted} onClick={() => { void preview(true); }}>Consultar base actual y conservar escenario</Button> : null}
    {result ? <div className="finance-v2-list"><p>Saldo registrado: {result.registeredBalanceMinor === null ? 'Desconocido' : formatMoney(result.registeredBalanceMinor)}</p><p>Variación prevista: {formatMoney(result.forecastDeltaMinor)} · saldo proyectado: {result.projectedBalanceMinor === null ? 'Desconocido' : formatMoney(result.projectedBalanceMinor)}</p><p>Escenario informativo. No escribe gastos, pagos ni saldos registrados.</p>{result.events.map((event) => <p key={event.sourceKey}>{event.expectedOn} · {event.origin} · {formatMoney(event.weightedAmountMinor)} · {event.reason}</p>)}{result.coverage.unknownAccountIds.length ? <p>El servidor informa cuentas sin saldo conocido.</p> : null}{result.coverage.undatedSourceKeys.length ? <p>Hay fuentes sin fecha informada; una fecha esperada pertenece al supuesto explícito.</p> : null}{result.coverage.reviewBookingIds.length ? <p>Hay reservas pendientes de revisión del plan de cobros.</p> : null}</div> : null}
  </section>;
}
