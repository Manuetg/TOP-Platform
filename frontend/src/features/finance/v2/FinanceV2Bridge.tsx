import {useQuery} from '@tanstack/react-query';
import {useEffect,useState} from 'react';
import {ApiResponseError} from '../../../shared/api/api-client';
import {listBookings} from '../../bookings/api/list-bookings';
import type {FinanceContext} from '../api/finance-api';
import type {FinanceReport} from '../types/finance.types';
import {FinanceError} from '../components/FinanceFeedback';
import {FinanceV2Workspace} from './FinanceV2Workspace';
import {financeV2Key} from './use-v2-command';
import {canFinanceV2,sectionReady,type FinanceV2Access,type FinanceV2View} from './v2-ui.types';
export interface FinanceV2IntegrationConfiguration {capabilities:readonly string[];availableSections:readonly string[]}
export interface FinanceV2BridgeProps {context:FinanceContext;businessName:string;role:string;configuration:FinanceV2IntegrationConfiguration;report:FinanceReport|undefined;period:{from:string;to:string};view:FinanceV2View;active:boolean}
export function FinanceV2Bridge(props:FinanceV2BridgeProps) {
  if(props.role!=='OWNER')return null;
  if(!props.configuration.capabilities.includes('finance.read'))return props.active?<p role="status">Las nuevas vistas de Finanzas todavía no están disponibles.</p>:null;
  if(props.report&&props.report.businessId!==props.context.businessId)return <FinanceError error={new ApiResponseError()}/>;
  return <BridgeContent key={JSON.stringify([props.context.userId,props.context.businessId,props.role])} {...props}/>;
}
async function bookingChoices(context:FinanceContext,signal:AbortSignal) {
  const bookings=await listBookings({businessId:context.businessId,accessToken:context.accessToken,signal});
  if(!Array.isArray(bookings)||bookings.length>5000||bookings.some((booking)=>booking.businessId!==context.businessId||typeof booking.id!=='string'||!booking.id))throw new ApiResponseError();
  return bookings.map((booking)=>({id:booking.id,label:`${booking.checkInDate??'Sin fecha'} → ${booking.checkOutDate??'Sin fecha'} · ${booking.status} · ${booking.id}`}));
}
function BridgeContent({context,businessName,role,configuration,report,period,view,active}:FinanceV2BridgeProps) {
  const [lastReport,setLastReport]=useState(report);
  useEffect(()=>{if(report)setLastReport(report);},[report]);
  const access:FinanceV2Access={role,capabilities:configuration.capabilities,availableSections:configuration.availableSections};
  const current=Boolean(report&&report.from===period.from&&report.to===period.to);
  const bookings=useQuery({queryKey:[...financeV2Key(context),'booking-choices'],queryFn:({signal})=>bookingChoices(context,signal),enabled:active&&current&&canFinanceV2(access,'booking.read')&&sectionReady(access,'booking-choices'),retry:false});
  const source=report??lastReport;
  return <div hidden={!active}>{!current&&active?<p role="status">Conservamos la última lectura y los registros pendientes. Actualiza Finanzas para iniciar una operación nueva.</p>:null}{bookings.isError&&active?<FinanceError error={bookings.error} onRetry={()=>{void bookings.refetch();}}/>:null}{source?<FinanceV2Workspace context={context} businessName={businessName} view={view} access={access} references={{report:source,bookings:bookings.data??[]}} period={period} active={active&&current}/>:null}</div>;
}
