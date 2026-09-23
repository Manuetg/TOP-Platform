export const RESOURCE_USAGE_READER = Symbol('RESOURCE_USAGE_READER');
export interface ResourceUsageReader { countOperational(businessId: string): Promise<number>; }
