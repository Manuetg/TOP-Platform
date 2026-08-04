import { Resource } from './resource.entity';
export const RESOURCE_REPOSITORY = Symbol('RESOURCE_REPOSITORY');
export interface CreateResourceData { businessId: string; name: string; internalCode: string; description: string | null; capacityMinimum: number; capacityMaximum: number; capacityMaximumChildren: number; sortOrder: number; }
export interface ResourceRepository { findByBusinessAndCode(businessId: string, internalCode: string): Promise<Resource | null>; findByIdAndBusinessId(resourceId:string,businessId:string):Promise<Resource|null>; create(data: CreateResourceData): Promise<Resource>; }
