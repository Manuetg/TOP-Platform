import { useInfiniteQuery,useQuery } from '@tanstack/react-query';
import { useEffect,useRef,useState,type RefObject } from 'react';
import { ApiError,ApiResponseError } from '../../../shared/api/api-client';
import { Button } from '../../../shared/ui/Button';
import { OverlayPanel } from '../../../shared/ui/OverlayPanel';
import { businessDateAt } from '../../../shared/utils/business-date';
import { formatMoney } from '../../../shared/utils/money';
import { formatBusinessInstant } from '../../../shared/utils/date-format';
import { getFinanceReport,type FinanceContext } from '../api/finance-api';
import { FinanceError,financeErrorMessage } from '../components/FinanceFeedback';
import { getV2Page,getV2AllPages,getV2Policy,getV2Budget,getV2Report,getV2BankSources,previewV2History,previewV2Bank,previewV2Match,type V2Collections } from './finance-v2-api';
import type { FinanceBankStatementPreview,FinanceHistoryPreview,FinanceBankMatchPreview,FinancePreviewIssue,FinanceV2CommandType,FinanceV2Command } from './finance-v2.types';
import { FinancePreviewIssues,financePreviewIssues } from './FinancePreviewIssues';
import { useV2Command,financeV2Key,type V2CommandMutation } from './use-v2-command';
import { buildV2Command,bankMatchInput,commandCapability,commandView,initialV2Draft,v2CommandLabels,type V2FormDraft } from './v2-form';
import { V2FormFields } from './V2FormFields';
import { FinancePlanningScenario } from './FinancePlanningScenario';
import { FinanceCorrections } from './FinanceCorrections';
import { FinanceClose } from './FinanceClose';
import { FinanceRecognition } from './FinanceRecognition';
import { FinanceAgingAlerts } from './FinanceAgingAlerts';
import { FinanceResultsSummary } from './FinanceResultsSummary';
import { FinanceBookingResultPanel } from './FinanceBookingResultPanel';
import { FinanceBudgetComparisonPanel } from './FinanceBudgetComparisonPanel';
import { FinanceServerAlerts } from './FinanceServerAlerts';
import { canFinanceV2,sectionReady,financeV2Views,type FinanceV2Access,type FinanceV2Data,type FinanceV2References,type FinanceV2WorkspaceProps } from './v2-ui.types';
import './FinanceV2.css';

export function FinanceV2Workspace(props:FinanceV2WorkspaceProps) {
  if(!canFinanceV2(props.access,'finance.read'))return <FinanceError error={new ApiError(403,'Acceso reservado a la persona dueña autorizada.')}/>;
  if(props.references.report.businessId!==props.context.businessId)return <FinanceError error={new ApiResponseError()}/>;
  return <V2Content key={JSON.stringify([props.context.userId,props.context.businessId,props.access.role,props.access.capabilities])} {...props}/>;
}
function useCollection<K extends keyof V2Collections>(context:FinanceContext,access:FinanceV2Access,name:K,capability='finance.read',active=true) {
  return useInfiniteQuery({queryKey:[...financeV2Key(context),name],initialPageParam:null as string|null,queryFn:({pageParam,signal})=>getV2Page(context,name,pageParam,signal),getNextPageParam:(last)=>last.nextCursor,enabled:active&&canFinanceV2(access,capability)&&sectionReady(access,name),retry:false});
}
function requirements(type:FinanceV2CommandType):string[] {
  if(['CREATE_EXPENSE_DRAFT','CREATE_EXPENSE_TEMPLATE','CREATE_REIMBURSEMENT_DRAFT','CREATE_ALLOCATION_RULE','CREATE_COMMITMENT','CONFIRM_HISTORY_IMPORT'].includes(type))return ['commands',...(type==='CONFIRM_HISTORY_IMPORT'?['history-preview']:[])];
  if(['REVISE_EXPENSE_TEMPLATE','GENERATE_RECURRING_DRAFT'].includes(type))return ['commands','templates'];
  if(['EDIT_EXPENSE_DRAFT','WITHDRAW_EXPENSE_DRAFT','CONFIRM_EXPENSE_DRAFT','REIMBURSE_EXPENSE'].includes(type))return ['commands','drafts'];
  if(['SUBMIT_EXPENSE_DRAFT','DECIDE_EXPENSE_DRAFT'].includes(type))return ['commands','drafts','approval-policy'];
  if(type==='SET_EXPENSE_APPROVAL_POLICY')return ['commands','approval-policy'];
  if(type==='CONFIRM_BANK_STATEMENT')return ['commands','bank-preview'];
  if(type==='CONFIRM_BANK_MATCH')return ['commands','bank-statements','bank-match-sources','bank-match-preview'];
  if(type==='CANCEL_BANK_MATCH')return ['commands','bank-matches'];
  if(type==='REVISE_ALLOCATION_RULE')return ['commands','allocation-rules'];
  if(type==='APPLY_COST_ALLOCATION')return ['commands','allocation-rules','costs'];
  if(type==='CREATE_LABOR_COST')return ['commands'];
  if(type==='REVISE_LABOR_COST')return ['commands','labor-costs'];
  if(['CREATE_BUDGET_REVISION','APPROVE_BUDGET_REVISION'].includes(type))return ['commands','budget'];
  if(type==='CONVERT_COMMITMENT')return ['commands','commitments','drafts'];
  return ['commands','commitments'];
}
function V2Content({context,businessName,view,access,references,period,active=true}:FinanceV2WorkspaceProps) {
  const today=businessDateAt(new Date(),references.report.timeZone);
  const [form,setForm]=useState<{type:FinanceV2CommandType;draft:V2FormDraft;data:FinanceV2Data;references:FinanceV2References}|null>(null);
  const [closed,setClosed]=useState(false);const [recoveryOpen,setRecoveryOpen]=useState(false);const recoveryCommand=useRef<FinanceV2Command|null>(null);const savedDrafts=useRef<Partial<Record<FinanceV2CommandType,V2FormDraft>>>({});const [notice,setNotice]=useState('');const trigger=useRef<HTMLElement|null>(null);
  const mutation=useV2Command(context);
  const drafts=useCollection(context,access,'drafts','finance.read',active),templates=useCollection(context,access,'templates','finance.read',active),statements=useCollection(context,access,'bank-statements','finance.read',active),matches=useCollection(context,access,'bank-matches','finance.read',active),rules=useCollection(context,access,'allocation-rules','finance.read',active),labor=useCollection(context,access,'labor-costs','finance.labor',active),commitments=useCollection(context,access,'commitments','finance.read',active);
  const policy=useQuery({queryKey:[...financeV2Key(context),'approval-policy'],queryFn:({signal})=>getV2Policy(context,signal),enabled:active&&sectionReady(access,'approval-policy'),retry:false});
  const month=form?.draft.month??period.from.slice(0,7);
  const budget=useQuery({queryKey:[...financeV2Key(context),'budget',month],queryFn:({signal})=>getV2Budget(context,month,signal),enabled:active&&sectionReady(access,'budget')&&canFinanceV2(access,'finance.planning'),retry:false});
  const readPeriod={...period,asOf:references.report.asOf};
  const costs=useQuery({queryKey:[...financeV2Key(context),'costs',readPeriod],queryFn:({signal})=>getV2Report(context,'costs',readPeriod,signal),enabled:active&&sectionReady(access,'costs')&&view==='results',retry:false});
  const resultsPeriod={...period,asOf:costs.data?.asOf??readPeriod.asOf};
  const results=useQuery({queryKey:[...financeV2Key(context),'resource-results',resultsPeriod],queryFn:({signal})=>getV2Report(context,'resource-results',resultsPeriod,signal),enabled:active&&sectionReady(access,'resource-results')&&view==='results'&&(!sectionReady(access,'costs')||costs.isSuccess),retry:false});
  const selectedAccount=form?.type==='CONFIRM_BANK_MATCH'?form.draft.accountId:'';
  const bankSources=useQuery({queryKey:[...financeV2Key(context),'bank-match-sources',selectedAccount],queryFn:({signal})=>getV2BankSources(context,selectedAccount,signal),enabled:active&&Boolean(selectedAccount)&&sectionReady(access,'bank-match-sources'),retry:false});
  const data:FinanceV2Data={drafts:drafts.data?.pages.flatMap((page)=>page.items)??[],templates:templates.data?.pages.flatMap((page)=>page.items)??[],policy:policy.data??{id:null,businessId:context.businessId,version:0,enabled:false,scope:'ALL_NEW_EXPENSE_CONFIRMATIONS',requireDifferentActor:true,recordedByUserId:null,reason:null,createdAt:null},bankStatements:statements.data?.pages.flatMap((page)=>page.items)??[],bankMatches:matches.data?.pages.flatMap((page)=>page.items)??[],bankSources:bankSources.data??[],allocationRules:rules.data?.pages.flatMap((page)=>page.items)??[],laborCosts:canFinanceV2(access,'finance.labor')?labor.data?.pages.flatMap((page)=>page.items)??[]:[],budget:budget.data??null,commitments:commitments.data?.pages.flatMap((page)=>page.items)??[],costs:costs.data??null,budgetMonth:month,budgetLoaded:budget.isSuccess};
  useEffect(()=>{if(!mutation.hasUncertainResult&&!mutation.isPending&&form?.type==='CONFIRM_BANK_MATCH'&&bankSources.data)setForm((current)=>current&&current.draft.accountId===selectedAccount?{...current,data:{...current.data,bankSources:bankSources.data}}:current);},[selectedAccount,bankSources.data,form?.type,mutation.hasUncertainResult,mutation.isPending]);
  useEffect(()=>{if(!mutation.hasUncertainResult&&!mutation.isPending&&form?.type==='CREATE_BUDGET_REVISION'&&budget.isSuccess)setForm((current)=>current&&current.draft.month===month?{...current,data:{...current.data,budget:budget.data,budgetMonth:month,budgetLoaded:true}}:current);},[month,budget.isSuccess,budget.data,form?.type,mutation.hasUncertainResult,mutation.isPending]);
  const queryStates=[drafts,templates,statements,matches,rules,labor,commitments,policy,budget,costs,results,bankSources];
  const activeErrors=queryStates.filter((query)=>query.isError);
  const loading=queryStates.some((query)=>query.isLoading&&query.fetchStatus==='fetching');
  function recover(element:HTMLElement){trigger.current=element;if(form)setClosed(false);else{recoveryCommand.current=mutation.pendingCommand;setRecoveryOpen(true);}}
  function open(type:FinanceV2CommandType,element:HTMLElement){if(mutation.hasUncertainResult){recover(element);return;}trigger.current=element;if(form)savedDrafts.current[form.type]=form.draft;setNotice('');setClosed(false);setForm({type,draft:savedDrafts.current[type]??{...initialV2Draft(today),policyEnabled:data.policy.enabled},data,references});}
  async function refresh() {
    const refreshed=await Promise.all(queryStates.filter((query)=>query.fetchStatus!=='paused'&&query.data!==undefined).map((query)=>query.refetch()));
    if(refreshed.some((query)=>query.isError))throw new Error('No pudimos consultar las versiones actuales. Conserva el borrador y vuelve a intentarlo.');
    const currentReport=await getFinanceReport(context,period);
    // Lecturas directas para fijar las versiones nuevas antes de una reconfirmación explícita.
    const required=form?requirements(form.type):[];
    const nextData={...data};
    if(required.includes('drafts'))nextData.drafts=await getV2AllPages(context,'drafts');
    if(required.includes('templates'))nextData.templates=await getV2AllPages(context,'templates');
    if(required.includes('approval-policy'))nextData.policy=await getV2Policy(context);
    if(required.includes('commitments'))nextData.commitments=await getV2AllPages(context,'commitments');
    if(required.includes('bank-matches'))nextData.bankMatches=await getV2AllPages(context,'bank-matches');
    if(required.includes('bank-statements'))nextData.bankStatements=await getV2AllPages(context,'bank-statements');
    if(required.includes('bank-match-sources'))nextData.bankSources=await getV2BankSources(context,selectedAccount);
    if(required.includes('allocation-rules'))nextData.allocationRules=await getV2AllPages(context,'allocation-rules');
    if(required.includes('labor-costs'))nextData.laborCosts=await getV2AllPages(context,'labor-costs');
    if(required.includes('costs'))nextData.costs=await getV2Report(context,'costs',readPeriod);
    if(required.includes('budget')){nextData.budget=await getV2Budget(context,month);nextData.budgetMonth=month;nextData.budgetLoaded=true;}
    setForm((current)=>current?{...current,data:nextData,references:{...current.references,report:currentReport},draft:{...current.draft,previewToken:''}}:null);
  }
  const commands=(Object.keys(v2CommandLabels) as FinanceV2CommandType[]).filter((type)=>commandView(type)===view&&canFinanceV2(access,commandCapability(type)));
  return <section className="finance-v2" aria-label={`${financeV2Views.find((item)=>item.id===view)?.label} de Finanzas`}><header><h2>{financeV2Views.find((item)=>item.id===view)?.label}</h2><p>{businessName} · PYG · {period.from} → {period.to} (fin excluido)</p></header>
    {notice?<p className="finance-notice" role="status">{notice}</p>:null}
    {mutation.hasUncertainResult&&(!form||closed)&&!recoveryOpen?<Button type="button" onClick={(event)=>recover(event.currentTarget)}>Recuperar registro pendiente</Button>:null}
    {loading?<p role="status">Cargando fuentes del negocio activo.</p>:null}
    {activeErrors.map((query,index)=><FinanceError key={index} error={query.error} onRetry={()=>{void query.refetch();}}/>)}
    <div className="finance-actions">{commands.map((type)=>{const ready=requirements(type).every((section)=>sectionReady(access,section));const dependenciesLoaded=(!(type==='SET_EXPENSE_APPROVAL_POLICY'||type==='SUBMIT_EXPENSE_DRAFT')||policy.isSuccess)&&(type!=='DECIDE_EXPENSE_DRAFT'||(drafts.isSuccess&&data.drafts.some((item)=>item.state==='SUBMITTED'&&item.approvalPolicyRevisionId)))&&(type!=='APPROVE_BUDGET_REVISION'||(budget.isSuccess&&Boolean(data.budget)));return <div key={type}><Button type="button" variant="secondary" disabled={!active||!ready||!dependenciesLoaded} onClick={(event)=>open(type,event.currentTarget)}>{v2CommandLabels[type]}</Button>{!ready?<small>Esta operación todavía no está disponible.</small>:null}</div>;})}</div>
    {view==='planning'?<><section className="finance-panel"><header><h3>Borradores y aprobación</h3></header><div className="finance-v2-list">{data.drafts.length?data.drafts.map((item)=><article key={item.id}><strong>{item.description}</strong><p>{item.state} · {formatMoney(item.amountMinor)} · consumo {item.consumedOn}</p>{item.reimbursement?<p>Reintegro pendiente al acreedor declarado. Conserva el gasto original.</p>:null}{item.decisions.map((decision)=><p key={decision.id}>{decision.decision==='APPROVE'?'Aprobado':'Rechazado'} por {decision.actorUserId} · {decision.reason}</p>)}</article>):<p>No hay borradores consultados.</p>}</div>{drafts.hasNextPage?<Button type="button" onClick={()=>{void drafts.fetchNextPage();}}>Cargar más borradores</Button>:null}</section><section className="finance-panel"><header><h3>Compromisos y metas</h3></header><div className="finance-v2-list">{data.commitments.map((item)=><article key={item.id}><strong>{item.description}</strong><p>Real convertido {formatMoney(item.consumedMinor)} · pendiente {formatMoney(item.pendingMinor)} · {item.state}</p></article>)}{data.budget?<article><strong>Presupuesto {data.budget.periodMonth}</strong><p>Versión {data.budget.version} · {data.budget.approvedRevisionId?'Revisión aprobada conservada':'Sin revisión aprobada'}</p>{data.budget.revisions.map((revision)=><p key={revision.id}>Revisión {revision.revisionNo} · {revision.approvedAt?'Aprobada':'Borrador'} · {revision.reason}</p>)}</article>:<p>Sin presupuesto consultado para este mes.</p>}</div></section>{sectionReady(access,'planning-preview')&&canFinanceV2(access,'finance.planning')?<FinancePlanningScenario key={JSON.stringify([context.userId,context.businessId,period])} context={context} references={references} access={access} active={active}/>:null}</>:null}
    {view==='reconciliation'?<section className="finance-panel"><header><h3>Extractos y correspondencias</h3></header><p className="finance-help">Son evidencia externa y revisión manual. Importar un extracto no crea caja ni ejecuta una operación bancaria.</p><div className="finance-v2-list">{data.bankStatements.map((statement)=><article key={statement.id}><strong>{statement.sourceNamespace}</strong><p>Cargado {formatBusinessInstant(statement.loadedAt,references.report.timeZone)}</p>{statement.rows.map((row)=><p key={row.id}>{row.bookedOn} · {row.reference??row.externalKey} · {formatMoney(row.amountMinor)} · residuo {formatMoney(row.residualMinor)} · {row.status}</p>)}</article>)}{data.bankMatches.map((match)=><article key={match.id}><strong>{match.state==='ACTIVE'?'Correspondencia vigente':'Correspondencia cancelada'}</strong><p>{match.reason}</p>{match.staleReasons.map((reason)=><p className="finance-warning" key={reason}>{reason}</p>)}</article>)}</div>{statements.hasNextPage?<Button type="button" onClick={()=>{void statements.fetchNextPage();}}>Cargar más extractos</Button>:null}</section>:null}
    {view==='results'?<section className="finance-panel"><header><h3>Costos por origen y reparto conservado</h3></header>{data.costs?<div className="finance-v2-list"><p>Real {formatMoney(data.costs.totals.actualCostMinor)} · estimación seleccionada {formatMoney(data.costs.totals.estimatedSelectedMinor)} · trabajo propio {formatMoney(data.costs.totals.ownerImputedMinor)}</p>{data.costs.rows.map((row)=><article key={`${row.source.kind}:${row.source.id}`}><strong>{row.kind} · {row.basis}</strong><p>{row.consumedOn} · {row.amountMinor===null?'Importe desconocido':formatMoney(row.amountMinor)} · {row.unassignedMinor===null?'Sin cobertura completa':`Sin asignar ${formatMoney(row.unassignedMinor)}`}</p><p>Fuente {row.source.kind}:{row.source.id} · versión {row.source.version} · reparto v{row.allocationVersion}</p>{row.ruleId?<p>Regla conservada {row.ruleId} · revisión {row.ruleVersion}</p>:null}{row.destinations.map((part)=><p key={part.resourceId}>{references.report.resources.find((resource)=>resource.id===part.resourceId)?.name??part.resourceId}: {formatMoney(part.amountMinor)}</p>)}{row.bookingId?<a href={`/app/bookings/${encodeURIComponent(row.bookingId)}`}>Consultar reserva asociada</a>:<p>Sin reserva asociada; no se atribuye a una estancia.</p>}</article>)}{data.costs.coverage.unsupportedReasons.map((reason)=><p key={reason}>{reason}</p>)}</div>:<p className="finance-empty">Sin costos consultados.</p>}</section>:null}
    <FinanceCorrections context={context} access={access} references={references} active={active&&view==='corrections'}/>
    <div className="finance-actions">{[{name:'plantillas',query:templates},{name:'correspondencias',query:matches},{name:'reglas de reparto',query:rules},{name:'costos de personal',query:labor},{name:'compromisos',query:commitments}].filter(({query})=>query.hasNextPage).map(({name,query})=><Button type="button" variant="secondary" key={name} loading={query.isFetchingNextPage} onClick={()=>{void query.fetchNextPage();}}>Cargar más {name}</Button>)}</div>
    <FinanceClose context={context} access={access} active={active&&view==='close'} period={period}/>
    <FinanceRecognition context={context} access={access} references={references} active={active&&view==='results'} period={period}/>
    <FinanceAgingAlerts context={context} access={access} references={references} active={active&&view==='planning'}/>
    <FinanceBudgetComparisonPanel context={context} access={access} references={references} initialMonth={period.from.slice(0,7)} active={active&&view==='planning'}/>
    <FinanceServerAlerts context={context} access={access} references={references} active={active&&view==='planning'}/>
    {view==='results'&&results.data?<FinanceResultsSummary report={results.data} references={references}/>:null}
    <FinanceBookingResultPanel key={JSON.stringify([context.userId,context.businessId])} context={context} access={access} references={references} period={period} asOf={costs.data?.asOf??references.report.asOf} active={active&&view==='results'}/>
    {form&&!closed?<V2CommandPanel type={form.type} draft={form.draft} data={form.data} references={form.references} context={context} mutation={mutation} triggerRef={trigger} setDraft={(update)=>setForm((current)=>current?{...current,draft:update(current.draft)}:null)} onClose={()=>setClosed(true)} onSaved={()=>{delete savedDrafts.current[form.type];setForm(null);setClosed(false);setNotice('Registro guardado.');}} onRefresh={refresh}/>:null}
    {recoveryOpen&&recoveryCommand.current?<V2RecoveryPanel command={recoveryCommand.current} mutation={mutation} triggerRef={trigger} permitted={canFinanceV2(access,commandCapability(recoveryCommand.current.type))&&sectionReady(access,'commands')} onClose={()=>setRecoveryOpen(false)} onSaved={()=>{recoveryCommand.current=null;setRecoveryOpen(false);setNotice('Registro guardado.');}}/>:null}
  </section>;
}
type Preview=FinanceHistoryPreview|FinanceBankStatementPreview|FinanceBankMatchPreview;
function V2RecoveryPanel({command,mutation,triggerRef,permitted,onClose,onSaved}:{command:FinanceV2Command;mutation:V2CommandMutation;triggerRef:RefObject<HTMLElement|null>;permitted:boolean;onClose:()=>void;onSaved:()=>void}) {
  const [error,setError]=useState<unknown>(null);const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  async function retry(){setError(null);try{await mutation.retry();if(alive.current)onSaved();}catch(failure){if(alive.current)setError(failure);}}
  const description='expenseDefinition' in command?command.expenseDefinition.description:'description' in command?command.description:null;
  const amount='expenseDefinition' in command?command.expenseDefinition.amountMinor:'amountMinor' in command?command.amountMinor:null;
  return <OverlayPanel open portal label="Recuperar registro pendiente" className="finance-dialog" layerClassName="finance-dialog-layer" closeLabel="Cerrar recuperación" motion="dialog" triggerRef={triggerRef} onClose={onClose} dismissible={!mutation.isPending}><header><h2>Recuperar registro pendiente</h2></header><div className="finance-form-body"><p role="status">Resultado pendiente de verificar. El reintento conserva exactamente el contenido y la clave originales.</p><dl><dt>Operación</dt><dd>{v2CommandLabels[command.type]}</dd>{description?<><dt>Descripción</dt><dd>{description}</dd></>:null}{amount!==null?<><dt>Importe registrado</dt><dd>{formatMoney(amount)}</dd></>:null}{'reason' in command?<><dt>Motivo original</dt><dd>{command.reason}</dd></>:null}</dl>{error?<p role="alert" className="finance-form-error">{financeErrorMessage(error)}</p>:null}{!permitted?<p role="alert">Necesitas autorización vigente para reintentar este registro.</p>:null}</div><footer><Button type="button" variant="secondary" disabled={mutation.isPending} onClick={onClose}>Cerrar y conservar registro</Button><Button type="button" disabled={!permitted} loading={mutation.isPending} onClick={()=>{void retry();}}>Reintentar el mismo registro</Button></footer></OverlayPanel>;
}
interface PanelProps {type:FinanceV2CommandType;draft:V2FormDraft;data:FinanceV2Data;references:FinanceV2References;context:FinanceContext;mutation:V2CommandMutation;triggerRef:RefObject<HTMLElement|null>;setDraft:(update:(current:V2FormDraft)=>V2FormDraft)=>void;onClose:()=>void;onSaved:()=>void;onRefresh:()=>Promise<void>}
function V2CommandPanel({type,draft,data,references,context,mutation,triggerRef,setDraft,onClose,onSaved,onRefresh}:PanelProps) {
  const [error,setError]=useState<unknown>(null);const [preview,setPreview]=useState<Preview|null>(null);const [previewIssues,setPreviewIssues]=useState<FinancePreviewIssue[]>([]);const [busy,setBusy]=useState(false);const [refreshed,setRefreshed]=useState(false);const alive=useRef(true);const controller=useRef<AbortController|null>(null);
  const previewInput=JSON.stringify({...draft,previewToken:''});const previewInputRef=useRef(previewInput);
  useEffect(()=>{if(previewInputRef.current!==previewInput){setPreview(null);setPreviewIssues([]);setError(null);previewInputRef.current=previewInput;}},[previewInput]);
  useEffect(()=>{alive.current=true;return ()=>{alive.current=false;controller.current?.abort();};},[]);
  const uncertain=mutation.hasUncertainResult;const conflict=error instanceof ApiError&&error.status===409;const isPreview=['CONFIRM_HISTORY_IMPORT','CONFIRM_BANK_STATEMENT','CONFIRM_BANK_MATCH'].includes(type);
  async function consultPreview() {
    if(uncertain||mutation.isPending||busy)return;
    setBusy(true);setError(null);setPreview(null);setPreviewIssues([]);setDraft((current)=>({...current,previewToken:''}));
    const request=new AbortController();controller.current=request;
    try{
      let result:Preview;
      if(type==='CONFIRM_HISTORY_IMPORT')result=await previewV2History(context,{sourceNamespace:draft.namespace.trim(),csv:draft.csv},request.signal);
      else if(type==='CONFIRM_BANK_STATEMENT'){
        const account=references.report.accounts.find((item)=>item.id===draft.accountId);
        if(!account)throw new Error('Selecciona una cuenta bancaria.');
        result=await previewV2Bank(context,{accountId:account.id,expectedAccountVersion:account.version,sourceNamespace:draft.namespace.trim(),csv:draft.csv},request.signal);
      }else result=await previewV2Match(context,bankMatchInput(draft,data,references),request.signal);
      if(alive.current&&!request.signal.aborted){setPreview(result);setDraft((current)=>({...current,previewToken:result.previewToken??''}));}
    }catch(failure){if(alive.current&&!request.signal.aborted){setError(failure);if(type==='CONFIRM_HISTORY_IMPORT'||type==='CONFIRM_BANK_STATEMENT')setPreviewIssues(financePreviewIssues(failure));}}
    finally{if(alive.current)setBusy(false);}
  }
  async function submit(retry=false){setError(null);try{await(retry?mutation.retry():mutation.execute(buildV2Command(type,draft,data,references)));if(alive.current)onSaved();}catch(failure){if(alive.current)setError(failure);}}
  async function refresh(){setBusy(true);try{await onRefresh();if(alive.current){setError(null);setRefreshed(true);setPreview(null);}}catch(failure){if(alive.current)setError(failure);}finally{if(alive.current)setBusy(false);}}
  return <OverlayPanel open portal label={v2CommandLabels[type]} className="finance-dialog" layerClassName="finance-dialog-layer" closeLabel="Cerrar formulario" motion="dialog" triggerRef={triggerRef} onClose={onClose} dismissible={!mutation.isPending&&!busy}><header><div><span>{references.report.businessId} · Finanzas · PYG</span><h2>{v2CommandLabels[type]}</h2></div><Button type="button" iconOnly variant="ghost" aria-label="Cerrar formulario" disabled={mutation.isPending||busy} onClick={onClose}>×</Button></header><form onSubmit={(event)=>{event.preventDefault();void submit();}}><fieldset className="finance-form-body" disabled={mutation.isPending||uncertain||busy}><V2FormFields type={type} draft={draft} setDraft={setDraft} data={data} references={references}/><p className="finance-help">Registras datos y operaciones realizadas fuera de TOP. El servidor valida versiones, permisos e importes.</p>{isPreview?<Button variant="secondary" type="button" onClick={()=>{void consultPreview();}}>Consultar vista previa</Button>:null}</fieldset>
    {preview&&draft.previewToken?<div className="finance-v2-preview"><h3>Vista previa del servidor</h3>{'issues' in preview?preview.issues.map((issue)=><p role="alert" key={`${issue.ordinal}:${issue.column}:${issue.code}`}>Fila {issue.ordinal}, {issue.column}: {issue.message}</p>):preview.staleReasons.map((reason)=><p role="alert" key={reason}>{reason}</p>)}{'staleReasons' in preview?<><p>Total de filas {formatMoney(preview.rowTotalMinor)} · total de componentes {formatMoney(preview.componentTotalMinor)}</p>{preview.rows.map((row)=><p key={row.id}>Fila {row.id} · residuo {formatMoney(row.residualMinor)}</p>)}{preview.sources.map((source)=><p key={`${source.source.sourceType}:${source.source.sourceId}:${source.source.sourceLeg??''}`}>Origen {source.source.sourceType} · {source.source.sourceId} · {source.source.sourceLeg??''} · residuo {formatMoney(source.residualMinor)}</p>)}</>:null}{'totals' in preview?<p>Gastos {formatMoney(preview.totals.expenseMinor)} · liquidaciones {formatMoney(preview.totals.settlementMinor)} · efectivo incluido {formatMoney(preview.totals.includedCashMinor)} · excluido {formatMoney(preview.totals.excludedCashMinor)}</p>:null}{'sources' in preview&&!('staleReasons' in preview)?preview.sources.map((source)=><p key={source.externalKey}>{source.externalKey} · {source.status} · {formatMoney(source.amountMinor)}</p>):null}{'rows' in preview&&!('staleReasons' in preview)?preview.rows.map((row)=><p key={row.ordinal}>Fila {row.ordinal} · {row.bookedOn} · {formatMoney(row.amountMinor)}</p>):null}</div>:preview&&'issues' in preview?<div className="finance-v2-preview">{preview.issues.map((issue)=><p role="alert" key={`${issue.ordinal}:${issue.column}`}>Fila {issue.ordinal}, {issue.column}: {issue.message}</p>)}</div>:null}
    <FinancePreviewIssues issues={previewIssues}/>{error?<p className="finance-form-error" role="alert">{financeErrorMessage(error)}</p>:null}{refreshed?<p className="finance-help" role="status">Versión actual consultada. Revisa el borrador y confirma una nueva intención.</p>:null}{uncertain?<div className="finance-form-error" role="status"><strong>Resultado pendiente de verificar</strong><p>El reintento conserva exactamente el contenido y la clave originales.</p></div>:null}<footer><Button type="button" variant="secondary" disabled={mutation.isPending||busy} onClick={onClose}>Cerrar y conservar borrador</Button>{uncertain?<Button type="button" loading={mutation.isPending} onClick={()=>{void submit(true);}}>Reintentar el mismo registro</Button>:conflict?<Button type="button" loading={busy} onClick={()=>{void refresh();}}>Consultar versión actual</Button>:<Button type="submit" loading={mutation.isPending} disabled={busy||(isPreview&&!draft.previewToken)}>{refreshed?'Confirmar nuevo intento':'Registrar'}</Button>}</footer></form></OverlayPanel>;
}
