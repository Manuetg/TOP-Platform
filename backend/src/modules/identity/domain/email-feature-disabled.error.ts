export class EmailFeatureDisabledError extends Error {
  readonly code = 'EMAIL_FEATURE_DISABLED';

  constructor() {
    super('Las funciones de correo están deshabilitadas durante este piloto. Usá una cuenta existente y verificada.');
    this.name = 'EmailFeatureDisabledError';
  }
}
