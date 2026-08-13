export const PRICING_RESOURCE_LOOKUP = Symbol('PRICING_RESOURCE_LOOKUP');
export interface PricingResource { id: string; businessId: string; status: 'ACTIVE' | 'OUT_OF_SERVICE' | 'ARCHIVED'; }
export interface PricingResourceLookup { findByIdAndBusinessId(resourceId: string, businessId: string): Promise<PricingResource | null>; }
