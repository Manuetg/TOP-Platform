import { useId } from "react";
import { Input } from "../../../shared/ui/Input";
import { formatGuaraniesInput, parseGuaranies } from "../../../shared/utils/money";

export function ManualPriceFields({ amount, reason, currency, onAmountChange, onReasonChange, disabled = false }: {
  amount: string; reason: string; onAmountChange: (value: string) => void;
  onReasonChange: (value: string) => void; currency: string; disabled?: boolean;
}) {
  const id = useId();
  return <>
    <p>Precio manual. Registra el total acordado para esta estadía y el motivo.</p>
    <Input id={`${id}-amount`} label="Precio final" prefix={currency === "PYG" ? "₲" : currency} inputMode="numeric" type="text" value={amount} disabled={disabled}
      error={amount && parseGuaranies(amount, true) === null ? "Ingresa un monto entero válido en guaraníes." : undefined}
      onChange={(event) => onAmountChange(event.target.value)} onBlur={() => onAmountChange(formatGuaraniesInput(amount))} aria-describedby={`${id}-amount-help`} />
    <small id={`${id}-amount-help`}>Total acordado para esta estadía en guaraníes ({currency}); puede ser cero.</small>
    <Input id={`${id}-reason`} label="Motivo del precio manual" value={reason} disabled={disabled} required minLength={2} maxLength={500}
      onChange={(event) => onReasonChange(event.target.value)} aria-describedby={`${id}-reason-help`} />
    <small id={`${id}-reason-help`}>Obligatorio, entre 2 y 500 caracteres.</small>
  </>;
}
