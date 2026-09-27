import { useId } from "react";
import { Input } from "../../../shared/ui/Input";
import { parseGuaranies } from "../../../shared/utils/money";

export function ManualPriceFields({ amount, reason, onAmountChange, onReasonChange, disabled = false }: {
  amount: string; reason: string; onAmountChange: (value: string) => void;
  onReasonChange: (value: string) => void; disabled?: boolean;
}) {
  const id = useId();
  return <>
    <p>Precio manual sin tarifario. Registrá el total acordado y el motivo de la excepción.</p>
    <Input id={`${id}-amount`} label="Precio final" inputMode="numeric" type="text" value={amount} disabled={disabled}
      error={amount && parseGuaranies(amount, true) === null ? "Ingresá un monto entero válido en guaraníes." : undefined}
      onChange={(event) => onAmountChange(event.target.value)} aria-describedby={`${id}-amount-help`} />
    <small id={`${id}-amount-help`}>Total acordado en guaraníes; puede ser cero.</small>
    <Input id={`${id}-reason`} label="Motivo del precio manual" value={reason} disabled={disabled} required minLength={2} maxLength={500}
      onChange={(event) => onReasonChange(event.target.value)} aria-describedby={`${id}-reason-help`} />
    <small id={`${id}-reason-help`}>Obligatorio, entre 2 y 500 caracteres.</small>
  </>;
}
