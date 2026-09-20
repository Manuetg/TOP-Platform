import { ResourceStatus } from '../domain/resource-status.enum';
export interface ResourceSearchMatch { id: string; title: string; subtitle: string | null; status: ResourceStatus; }
export const RESOURCE_SEARCH_READER = Symbol('RESOURCE_SEARCH_READER');
export interface ResourceSearchReader { read(businessId: string, query: string): Promise<ResourceSearchMatch[]>; }
