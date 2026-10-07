import type { FinanceV2ReadRepository,FinanceResourceReport,FinanceV2ReportQuery } from '../domain/finance-v2.types';
import { FinanceV2UseCases } from '../application/finance-v2.use-cases';
import { FinanceV2Repository,FinanceV2RepositoryGuards,FinanceSqlTransaction } from './finance-v2.repository';
import { FinanceV2PrismaSqlHost,FinancePrismaTransactionClient } from './finance-v2-prisma-sql.adapter';
import { FinanceV2DraftCommandHandler } from './finance-v2-draft.sql-store';
import { FinanceV2BudgetCommandHandler } from './finance-v2-budget.sql-store';
import { FinanceV2TemplateCommandHandler } from './finance-v2-template.handler';
import { FinanceV2AllocationLaborCommandHandler } from './finance-v2-allocation-labor.handler';
import { FinanceImportBankCommandHandler } from './finance-v2-import-bank.handler';
import { FinanceImportBankSqlAtomicWriter } from './finance-v2-import-bank.atomic-writer';
import { FinanceImportBankSqlSnapshotReader } from './finance-v2-import-bank.snapshot-reader';
import { FinanceBankSqlSourceReader,FinancePublicPaymentMoneyReader } from './finance-v2-bank-source.sql-reader';
import { FinanceBankReadService } from './finance-v2-bank.read-service';
import { loadBankMatches,loadBankStatements } from './finance-v2-bank.lists-reader';
import { FinanceV2OperationalReadService,authorizeFinanceV2Read } from './finance-v2-operational.read-service';
import { FinanceV2EvidenceReadService } from './finance-v2-evidence.read-service';
import { FinanceV2PlanningReadService,FinancePlanningPublicReaders } from './finance-v2-planning.read-service';
import { readFinanceV2CostReport } from './finance-v2-cost.report-reader';
import { readFinanceV2CloseSources } from './finance-v2-close.reader';
import type { BookingCostReferenceReader } from './finance-v2-expense.writer';

export interface FinanceV2FactoryInput {
  prisma:FinancePrismaTransactionClient;bookings:BookingCostReferenceReader;payments:FinancePublicPaymentMoneyReader;
  guards:FinanceV2RepositoryGuards;planning:FinancePlanningPublicReaders;
  resourceResults(tx:FinanceSqlTransaction,input:FinanceV2ReportQuery&{businessId:string;timeZone:string}):Promise<FinanceResourceReport>;
}
/** All required public adapters must be real before root mounts presentation; no optional fallback. */
export function createFinanceV2Persistence(input:FinanceV2FactoryInput):{repository:FinanceV2Repository;useCases:FinanceV2UseCases;readRepository:FinanceV2ReadRepository;closeSources:typeof readFinanceV2CloseSources}{
  const host=new FinanceV2PrismaSqlHost(input.prisma);
  const bankSources=new FinanceBankSqlSourceReader(input.payments);
  const snapshots=new FinanceImportBankSqlSnapshotReader(bankSources,input.bookings);
  const bankWriter=new FinanceImportBankSqlAtomicWriter(input.bookings,bankSources);
  const repository=new FinanceV2Repository(host,[new FinanceV2DraftCommandHandler(input.bookings),new FinanceV2BudgetCommandHandler(input.bookings),new FinanceV2TemplateCommandHandler(input.bookings),new FinanceV2AllocationLaborCommandHandler(),new FinanceImportBankCommandHandler(snapshots,bankWriter)],input.guards);
  const operational=new FinanceV2OperationalReadService(host,input.bookings);
  const bank=new FinanceBankReadService(host,bankSources);
  const evidence=new FinanceV2EvidenceReadService(host,snapshots);
  const planning=new FinanceV2PlanningReadService(host,input.planning);
  const readRepository:FinanceV2ReadRepository={
    ...{budgetComparison:operational.budgetComparison.bind(operational)},
    drafts:operational.drafts.bind(operational),draft:operational.draft.bind(operational),approvalPolicy:operational.approvalPolicy.bind(operational),templates:operational.templates.bind(operational),budget:operational.budget.bind(operational),commitments:operational.commitments.bind(operational),allocationRules:operational.allocationRules.bind(operational),laborCosts:operational.laborCosts.bind(operational),
    bankMatchSources:(actor,accountId)=>bank.availableSources({...actor,accountId}),
    bankStatements:(actor,query)=>host.read(async tx=>{await authorizeFinanceV2Read(tx,actor);return loadBankStatements(tx,actor.businessId,query);}),
    bankMatches:(actor,query)=>host.read(async tx=>{await authorizeFinanceV2Read(tx,actor);return loadBankMatches(tx,actor.businessId,query,bankSources);}),
    costs:(actor,query)=>host.read(async tx=>{const business=await authorizeFinanceV2Read(tx,actor);return readFinanceV2CostReport(tx,{...query,businessId:actor.businessId,timeZone:business.timeZone});}),
    resourceResults:(actor,query)=>host.read(async tx=>{const business=await authorizeFinanceV2Read(tx,actor);return input.resourceResults(tx,{...query,businessId:actor.businessId,timeZone:business.timeZone});}),
    aging:planning.aging.bind(planning),planningPreview:planning.planningPreview.bind(planning),
    importPreview:evidence.importPreview.bind(evidence),bankStatementPreview:evidence.bankStatementPreview.bind(evidence),bankMatchPreview:evidence.bankMatchPreview.bind(evidence),
  };
  return{repository,useCases:new FinanceV2UseCases(repository),readRepository,closeSources:readFinanceV2CloseSources};
}
