/** UUID v4 con Web Crypto, también cuando HTTP de LAN no expone randomUUID. */
export function createPaymentIdempotencyKey(): string {
  const cryptography = globalThis.crypto;

  if (typeof cryptography?.randomUUID === "function") {
    return cryptography.randomUUID();
  }

  if (typeof cryptography?.getRandomValues !== "function") {
    throw new Error("No pudimos generar una clave segura para el pago. Usa un navegador actualizado e intenta nuevamente.");
  }

  const bytes = new Uint8Array(16);
  cryptography.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
