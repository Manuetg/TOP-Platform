import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";

const labels = new Intl.DisplayNames(["es"], { type: "region" });
const key = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const countries = new Map(getCountries().flatMap((country) => [[key(country), country], [key(labels.of(country) ?? country), country]]));
const aliases: Record<string, CountryCode> = { "republica checa": "CZ", "turquia": "TR", "vaticano": "VA", "republica del congo": "CG", "republica democratica del congo": "CD", "timor oriental": "TL" };
export function phoneCountry(country: string): CountryCode | undefined { return countries.get(key(country)) ?? aliases[key(country)]; }
export function phonePrefix(country: string, value: string): string {
  const international = value.trim().replace(/^00/, "+");
  if (international.startsWith("+")) return parsePhoneNumberFromString(international)?.countryCallingCode ? `+${parsePhoneNumberFromString(international)!.countryCallingCode}` : "Internacional";
  const region = phoneCountry(country);
  return region ? `+${getCountryCallingCode(region)}` : "Internacional";
}
export function normalizePhone(value: string, country: string): string | null {
  const input = value.trim().replace(/^00/, "+");
  if (!/^\+?[\d\s().-]+$/.test(input)) return null;
  const phone = parsePhoneNumberFromString(input, phoneCountry(country));
  return phone && phone.isPossible() && !phone.ext ? phone.number : null;
}
export function whatsappUrl(value: string | null): string | undefined {
  if (!value || !value.startsWith("+")) return undefined;
  const number = normalizePhone(value, "");
  return number ? `https://wa.me/${number.slice(1)}` : undefined;
}
