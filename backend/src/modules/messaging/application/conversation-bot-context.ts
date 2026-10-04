export interface AvailabilityConversationOption {
  option: number;
  resourceId: string;
  name: string;
}

export interface AvailabilityConversationContext {
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  options?: AvailabilityConversationOption[];
}

export interface ConversationBotContext {
  availability?: AvailabilityConversationContext;
}

export function readConversationBotContext(value: unknown): ConversationBotContext {
  const root = record(value);
  const availability = record(root?.availability);
  if (!availability) return {};

  const context: AvailabilityConversationContext = {};
  if (typeof availability.checkIn === 'string') context.checkIn = availability.checkIn;
  if (typeof availability.checkOut === 'string') context.checkOut = availability.checkOut;
  if (typeof availability.guests === 'number' && Number.isInteger(availability.guests) && availability.guests > 0) context.guests = availability.guests;
  if (Array.isArray(availability.options)) {
    const options = availability.options.flatMap((value) => {
      const option = record(value);
      if (!option || typeof option.option !== 'number' || !Number.isInteger(option.option) || option.option <= 0 || typeof option.resourceId !== 'string' || !option.resourceId || typeof option.name !== 'string' || !option.name) return [];
      return [{ option: option.option, resourceId: option.resourceId, name: option.name }];
    });
    if (options.length === availability.options.length) context.options = options;
  }
  return { availability: context };
}

export function withAvailabilityContext(context: AvailabilityConversationContext): ConversationBotContext {
  return { availability: { ...context } };
}

export function clearAvailabilityContext(): ConversationBotContext {
  return {};
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
