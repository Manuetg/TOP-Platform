import type { ReactNode } from "react";
import { Input } from "../../../shared/ui/Input";
import { formatGuaraniesInput } from "../../../shared/utils/money";
import type { FinanceAccount, FinanceCatalog } from "../types/finance.types";

export function SelectField({ id, label, value, onChange, children, required = false, describedBy }: { id: string; label: string; value: string; onChange: (value: string) => void; children: ReactNode; required?: boolean; describedBy?: string }) {
  return <label className="top-field" htmlFor={id}><span className="top-field__label">{label}</span><select id={id} className="top-input" aria-describedby={describedBy} value={value} onChange={(event) => onChange(event.target.value)} required={required}>{children}</select></label>;
}
export function MoneyField({ id, label, value, onChange, signed = false }: { id: string; label: string; value: string; onChange: (value: string) => void; signed?: boolean }) {
  return <Input id={id} label={label} aria-label={`${label}, guaraníes PYG`} prefix="₲" type="text" inputMode={signed ? "text" : "numeric"} value={value} required onChange={(event) => onChange(event.target.value)} onBlur={() => onChange(signed && value.startsWith("-") ? `-${formatGuaraniesInput(value.slice(1))}` : formatGuaraniesInput(value))} />;
}
export function AccountField({ id, label = "Cuenta", value, onChange, accounts, needsOpening = true }: { id: string; label?: string; value: string; onChange: (value: string) => void; accounts: FinanceAccount[]; needsOpening?: boolean }) {
  const visible = accounts.filter((item) => !item.archived);
  const needsHelp = needsOpening && !visible.some((item) => item.opening);
  return <><SelectField id={id} label={label} value={value} onChange={onChange} required describedBy={needsHelp ? `${id}-opening-help` : undefined}><option value="">Selecciona una cuenta</option>{visible.map((item) => <option key={item.id} value={item.id} disabled={needsOpening && !item.opening}>{item.name}{item.opening ? "" : " · sin apertura"}</option>)}</SelectField>{needsHelp ? <p id={`${id}-opening-help`} className="finance-help">Registra primero la apertura en Cuentas y catálogos para usar una cuenta en esta operación.</p> : null}</>;
}
export function CatalogOptions({ catalogs, kind }: { catalogs: FinanceCatalog[]; kind: FinanceCatalog["kind"] }) {
  return <>{catalogs.filter((item) => item.kind === kind && !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</>;
}
