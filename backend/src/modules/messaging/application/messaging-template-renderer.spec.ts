import { MessagingAutomationType } from '../domain/messaging-automation-type.enum';
import { MessagingTemplateRenderer, MessagingTemplateValidationError } from './messaging-template-renderer';

describe('MessagingTemplateRenderer', () => {
  const renderer = new MessagingTemplateRenderer();

  it('renderiza variables permitidas sin conocer ningún provider', () => {
    expect(renderer.render(MessagingAutomationType.BOOKING_CONFIRMED, 'Hola {{guestName}}: {{resourceName}}', { guestName: 'Ana', resourceName: 'Cabaña' })).toBe('Hola Ana: Cabaña');
  });

  it('rechaza variables desconocidas al validar', () => {
    expect(() => renderer.validate(MessagingAutomationType.BOOKING_CONFIRMED, 'Hola {{accessToken}}')).toThrow(new MessagingTemplateValidationError('La variable {{accessToken}} no está permitida para esta plantilla.'));
  });

  it('rechaza una variable permitida que no puede resolverse', () => {
    expect(() => renderer.render(MessagingAutomationType.BOOKING_CONFIRMED, '{{guestName}}', {})).toThrow('No se pudo resolver la variable {{guestName}}.');
  });

  it('mantiene el catálogo separado por tipo de automatización', () => {
    expect(() => renderer.validate(MessagingAutomationType.BOOKING_CANCELLED, '{{total}}')).toThrow('no está permitida');
    expect(renderer.allowedVariables(MessagingAutomationType.BOOKING_CONFIRMED)).toContain('total');
    expect(renderer.allowedVariables(MessagingAutomationType.BOOKING_CANCELLED)).not.toContain('total');
  });
});
