import {useQuery} from '@tanstack/react-query';
import {Button} from '../../../shared/ui/Button';
import {formatMoney} from '../../../shared/utils/money';
import type {FinanceContext} from '../api/finance-api';
import {FinanceError} from '../components/FinanceFeedback';
import {getV2Alerts} from './finance-v2-api';
import {financeV2Key} from './use-v2-command';
import {canFinanceV2,sectionReady,type FinanceV2Access,type FinanceV2References} from './v2-ui.types';
export function FinanceServerAlerts({context,access,references,active}:{context:FinanceContext;access:FinanceV2Access;references:FinanceV2References;active:boolean}) {
  const period={from:references.report.from,to:references.report.to,asOf:references.report.asOf};
  const ready=canFinanceV2(access,'finance.read')&&sectionReady(access,'alerts');
  const query=useQuery({queryKey:[...financeV2Key(context),'alerts',period],queryFn:({signal})=>getV2Alerts(context,period,signal),enabled:active&&ready,retry:false});
  if(!active)return null;
  return <section className="finance-panel"><header><h3>Fuentes que requieren una acción</h3></header><p>Las alertas proceden de hechos y evidencia actuales. Desaparecen al corregir sus fuentes y consultar de nuevo; no envían mensajes externos.</p>{!ready?<p>Las alertas de servicio y operaciones todavía no están disponibles.</p>:null}{query.isFetching?<p role="status">Consultando alertas del negocio activo.</p>:null}{query.isError?<FinanceError error={query.error} onRetry={()=>{void query.refetch();}}/>:null}{query.data?<><div className="finance-v2-list">{query.data.items.map((alert)=><article key={alert.id}><strong>{alert.title}</strong><p>{alert.description}</p>{alert.amountMinor!==null?<p>{formatMoney(alert.amountMinor)}</p>:null}<p>Origen {alert.sourceId} · versión {alert.sourceVersion}</p>{alert.target.type==='SERVICE_NIGHT'?<><p>Noche {alert.target.localNight}</p><a href={`/app/bookings/${encodeURIComponent(alert.target.bookingId)}`}>Consultar reserva y evidencia</a></>:<a href={alert.target.type==='EXPENSE'?'/app/finance?view=expenses':'/app/finance?view=movements'}>{alert.target.type==='EXPENSE'?'Consultar gasto y referencia':'Consultar arqueo y origen'}</a>}</article>)}</div>{query.data.items.length===0?<p>No hay alertas en las fuentes consultadas.</p>:null}<Button type="button" variant="secondary" loading={query.isFetching} onClick={()=>{void query.refetch();}}>Actualizar alertas de sus fuentes</Button></>:null}</section>;
}
