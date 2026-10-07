import { afterEach, describe, expect, it, vi } from "vitest";
import { createPaymentIdempotencyKey } from "./create-payment-idempotency-key";

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("clave idempotente de pago con fuente criptográfica", () => {
  it("prefiere randomUUID nativo y conserva el receptor Crypto", () => {
    const uuid = "00112233-4455-4677-8899-aabbccddeeff";
    const cryptography = {
      randomUUID: vi.fn(function (this: unknown) {
        expect(this).toBe(cryptography);
        return uuid;
      }),
      getRandomValues: vi.fn(),
    };
    vi.stubGlobal("crypto", cryptography);

    expect(createPaymentIdempotencyKey()).toBe(uuid);
    expect(cryptography.randomUUID).toHaveBeenCalledOnce();
    expect(cryptography.getRandomValues).not.toHaveBeenCalled();
  });

  it("usa exactamente 16 bytes de getRandomValues cuando randomUUID no existe", () => {
    const entropy = Uint8Array.from({ length: 16 }, (_, index) => index);
    const cryptography = {
      getRandomValues: vi.fn(function (this: unknown, bytes: Uint8Array) {
        expect(this).toBe(cryptography);
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(bytes.byteLength).toBe(16);
        bytes.set(entropy);
        return bytes;
      }),
    };
    vi.stubGlobal("crypto", cryptography);
    const weakRandom = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("No se permite aleatoriedad débil");
    });

    const uuid = createPaymentIdempotencyKey();
    expect(uuid).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
    expect(uuid).toMatch(uuidV4);
    expect(cryptography.getRandomValues).toHaveBeenCalledOnce();
    expect(weakRandom).not.toHaveBeenCalled();
  });

  it.each([
    [0x00, "00000000-0000-4000-8000-000000000000"],
    [0xff, "ffffffff-ffff-4fff-bfff-ffffffffffff"],
    [0x5a, "5a5a5a5a-5a5a-4a5a-9a5a-5a5a5a5a5a5a"],
  ] as const)("fija versión y variante preservando los demás bits de %s", (byte, expected) => {
    vi.stubGlobal("crypto", {
      getRandomValues: vi.fn((bytes: Uint8Array) => bytes.fill(byte)),
    });
    const uuid = createPaymentIdempotencyKey();
    expect(uuid).toBe(expected);
    expect(uuid).toMatch(uuidV4);
  });

  it("obtiene entropía nueva para cada clave", () => {
    const getRandomValues = vi.fn()
      .mockImplementationOnce((bytes: Uint8Array) => bytes.fill(0))
      .mockImplementationOnce((bytes: Uint8Array) => bytes.fill(0xff));
    vi.stubGlobal("crypto", { getRandomValues });

    const first = createPaymentIdempotencyKey();
    const second = createPaymentIdempotencyKey();
    expect(first).toMatch(uuidV4);
    expect(second).toMatch(uuidV4);
    expect(first).not.toBe(second);
    expect(getRandomValues).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, null, {}])("rechaza ausencia de CSPRNG sin acudir a Math.random: %s", (cryptography) => {
    vi.stubGlobal("crypto", cryptography);
    const weakRandom = vi.spyOn(Math, "random");

    expect(createPaymentIdempotencyKey).toThrow("No pudimos generar una clave segura para el pago.");
    expect(weakRandom).not.toHaveBeenCalled();
  });

  it("propaga un fallo del generador criptográfico sin fabricar una clave", () => {
    const error = new Error("Fuente criptográfica no disponible");
    vi.stubGlobal("crypto", {
      getRandomValues: vi.fn(() => { throw error; }),
    });
    expect(createPaymentIdempotencyKey).toThrow(error);
  });
});
