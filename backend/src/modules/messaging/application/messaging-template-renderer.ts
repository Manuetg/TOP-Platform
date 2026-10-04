import { Injectable } from '@nestjs/common';
import { MessagingAutomationType } from '../domain/messaging-automation-type.enum';

export type MessagingTemplateValues = Readonly<Record<string, string | number | undefined>>;

const VARIABLES: Readonly<Record<MessagingAutomationType, readonly string[]>> = {
  [MessagingAutomationType.BOOKING_CONFIRMED]: ['businessName', 'guestName', 'resourceName', 'checkIn', 'checkOut', 'guests', 'total', 'currency'],
  [MessagingAutomationType.BOOKING_CANCELLED]: ['businessName', 'guestName', 'resourceName', 'checkIn', 'checkOut', 'guests'],
};

export class MessagingTemplateValidationError extends Error {}

@Injectable()
export class MessagingTemplateRenderer {
  validate(templateType: MessagingAutomationType, content: string): void {
    if (!content.trim()) throw new MessagingTemplateValidationError('La plantilla no puede estar vacía.');
    if (content.length > 4_000) throw new MessagingTemplateValidationError('La plantilla no puede superar 4000 caracteres.');
    const variables = VARIABLES[templateType];
    if (!variables) throw new MessagingTemplateValidationError('El tipo de plantilla no está soportado.');
    if (content.includes('{{') && !content.match(/{{\s*[a-zA-Z][a-zA-Z0-9_]*\s*}}/g)) throw new MessagingTemplateValidationError('La plantilla contiene una variable inválida.');
    for (const variable of this.extractVariables(content)) {
      if (!variables.includes(variable)) throw new MessagingTemplateValidationError(`La variable {{${variable}}} no está permitida para esta plantilla.`);
    }
  }

  render(templateType: MessagingAutomationType, content: string, values: MessagingTemplateValues): string {
    this.validate(templateType, content);
    return content.replace(/{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g, (_match, variable: string) => {
      const value = values[variable];
      if (value === undefined || value === null) throw new MessagingTemplateValidationError(`No se pudo resolver la variable {{${variable}}}.`);
      return String(value);
    });
  }

  allowedVariables(templateType: MessagingAutomationType): readonly string[] {
    return VARIABLES[templateType] ?? [];
  }

  private extractVariables(content: string): string[] {
    return [...content.matchAll(/{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g)].map((match) => match[1]);
  }
}
