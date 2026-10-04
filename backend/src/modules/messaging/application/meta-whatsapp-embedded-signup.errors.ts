export class MetaWhatsAppEmbeddedSignupApplicationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'MetaWhatsAppEmbeddedSignupApplicationError';
  }
}

export class MetaWhatsAppEmbeddedSignupConfigurationError extends MetaWhatsAppEmbeddedSignupApplicationError {
  constructor(message = 'Embedded Signup no está disponible con la configuración actual.') { super('CONFIGURATION_UNAVAILABLE', message); }
}

export class MetaWhatsAppEmbeddedSignupAttemptNotFoundError extends MetaWhatsAppEmbeddedSignupApplicationError {
  constructor() { super('ATTEMPT_NOT_FOUND', 'El intento de Embedded Signup no existe.'); }
}

export class MetaWhatsAppEmbeddedSignupInvalidStateError extends MetaWhatsAppEmbeddedSignupApplicationError {
  constructor() { super('INVALID_STATE', 'El state de Embedded Signup no es válido.'); }
}

export class MetaWhatsAppEmbeddedSignupAttemptExpiredError extends MetaWhatsAppEmbeddedSignupApplicationError {
  constructor() { super('ATTEMPT_EXPIRED', 'El intento de Embedded Signup expiró.'); }
}

export class MetaWhatsAppEmbeddedSignupAttemptConsumedError extends MetaWhatsAppEmbeddedSignupApplicationError {
  constructor() { super('ATTEMPT_CONSUMED', 'El intento de Embedded Signup ya fue consumido.'); }
}

export class MetaWhatsAppEmbeddedSignupAttemptInProgressError extends MetaWhatsAppEmbeddedSignupApplicationError {
  constructor() { super('ATTEMPT_IN_PROGRESS', 'El intento de Embedded Signup ya está siendo procesado.'); }
}

export class MetaWhatsAppEmbeddedSignupBusinessConflictError extends MetaWhatsAppEmbeddedSignupApplicationError {
  constructor() { super('PHONE_NUMBER_ALREADY_LINKED', 'El phone number de Meta ya está vinculado a otro Business.'); }
}

export class MetaWhatsAppEmbeddedSignupCompletionError extends MetaWhatsAppEmbeddedSignupApplicationError {
  constructor() { super('COMPLETION_FAILED', 'No se pudo completar el onboarding de WhatsApp.'); }
}

export class MetaWhatsAppEmbeddedSignupProductionDisabledError extends MetaWhatsAppEmbeddedSignupConfigurationError {
  constructor() { super('Embedded Signup está deshabilitado hasta configurar un SecretStore writable y seguro para producción.'); }
}
