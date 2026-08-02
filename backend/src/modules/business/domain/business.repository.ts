import { Business } from './business.entity';

export const BUSINESS_REPOSITORY = Symbol('BUSINESS_REPOSITORY');

export interface CreateBusinessData {
  name: string;
  legalName?: string;
  taxId?: string;
}

export interface BusinessRepository {
  create(data: CreateBusinessData): Promise<Business>;
  findById(id: string): Promise<Business | null>;
  list(): Promise<Business[]>;
  update(business: Business): Promise<Business>;
}
