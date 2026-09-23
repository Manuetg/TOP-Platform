export const RESOURCE_QUOTA = Symbol('RESOURCE_QUOTA');
/** Opaque transaction scope: only persistence adapters inspect it. */
export interface ResourceQuota {
  allocate<T>(businessId: string, write: (maximum: number, transaction: unknown) => Promise<T>): Promise<T>;
}
