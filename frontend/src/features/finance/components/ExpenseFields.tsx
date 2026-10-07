import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../../shared/ui/Button";
import { Input } from "../../../shared/ui/Input";
import { AccountField, CatalogOptions, MoneyField, SelectField } from "./FinanceFields";
import type { CommandDraft, LineDraft } from "./command-form";
import type { FinanceReport } from "../types/finance.types";

type SetDraft = (update: (current: CommandDraft) => CommandDraft) => void;
export function ExpenseFields({ draft, setDraft, report }: { draft: CommandDraft; setDraft: SetDraft; report: FinanceReport }) {
  const set = (key: keyof CommandDraft, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));
  const line = (index: number, change: Partial<LineDraft>) => setDraft((current) => ({ ...current, lines: current.lines.map((item, itemIndex) => itemIndex === index ? { ...item, ...change } : item) }));
  return <>
    <Input id="expense-description" label="Descripción del gasto" value={draft.name} required onChange={(event) => set("name", event.target.value)} />
    <div className="finance-form-grid"><Input id="consumed-on" label="Fecha de consumo" type="date" value={draft.date} required onChange={(event) => set("date", event.target.value)} />
      <Input id="due-on" label="Vencimiento (opcional)" type="date" value={draft.dueOn} onChange={(event) => set("dueOn", event.target.value)} />
      <MoneyField id="expense-total" label="Total del documento" value={draft.amount} onChange={(value) => set("amount", value)} />
      <SelectField id="counterparty" label="Contraparte (opcional)" value={draft.counterpartyId} onChange={(value) => set("counterpartyId", value)}><option value="">Sin contraparte</option><CatalogOptions catalogs={report.catalogs} kind="COUNTERPARTY" /></SelectField></div>
    <Input id="expense-reference" label="Referencia del comprobante (opcional)" value={draft.reference} onChange={(event) => set("reference", event.target.value)} />
    <p className="finance-help">Una referencia textual conserva el origen. Si falta, el gasto se guarda con evidencia faltante.</p>
    <h3>Detalle del gasto</h3><p className="finance-help">Las líneas deben reproducir exactamente el total. Separa las salidas no operativas.</p>
    {draft.lines.map((item, index) => <fieldset className="finance-line" key={index}><legend>Línea {index + 1}</legend><div className="finance-form-grid">
      <Input id={`line-label-${index}`} label="Concepto" value={item.label} required onChange={(event) => line(index, { label: event.target.value })} />
      <MoneyField id={`line-amount-${index}`} label="Importe de la línea" value={item.amount} onChange={(value) => line(index, { amount: value })} />
      <SelectField id={`line-category-${index}`} label="Categoría" value={item.categoryId} required onChange={(value) => line(index, { categoryId: value })}><option value="">Selecciona una categoría</option><CatalogOptions catalogs={report.catalogs} kind="CATEGORY" /></SelectField>
      <SelectField id={`line-resource-${index}`} label="Recurso" value={item.resourceId} onChange={(value) => line(index, { resourceId: value })}><option value="">Sin asignar</option>{report.resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}{resource.active ? "" : " · no activo"}</option>)}</SelectField></div>
      <label className="finance-check"><input type="checkbox" checked={item.operational} onChange={(event) => line(index, { operational: event.target.checked })} /> Costo operativo</label>
      {draft.lines.length > 1 ? <Button type="button" variant="ghost" onClick={() => setDraft((current) => ({ ...current, lines: current.lines.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={16} aria-hidden="true" /> Quitar línea {index + 1}</Button> : null}
    </fieldset>)}
    <Button type="button" variant="secondary" onClick={() => setDraft((current) => ({ ...current, lines: [...current.lines, { label: "", categoryId: "", resourceId: "", amount: "", operational: true }] }))}><Plus size={16} aria-hidden="true" /> Agregar línea</Button>
    <label className="finance-check"><input type="checkbox" checked={draft.paid} onChange={(event) => set("paid", event.target.checked)} /> Ya realicé un pago de este gasto</label>
    {draft.paid ? <SettlementFields draft={draft} setDraft={setDraft} report={report} /> : null}
  </>;
}
export function SettlementFields({ draft, setDraft, report }: { draft: CommandDraft; setDraft: SetDraft; report: FinanceReport }) {
  return <div className="finance-form-grid"><AccountField id="settlement-account" value={draft.accountId} onChange={(value) => setDraft((current) => ({ ...current, accountId: value }))} accounts={report.accounts} />
    <MoneyField id="settlement-amount" label="Importe pagado" value={draft.paymentAmount} onChange={(value) => setDraft((current) => ({ ...current, paymentAmount: value }))} /></div>;
}
