import { Business } from './business.entity';

export interface CreateBusinessData {
  name: string;
  legalName?: string;
  taxId?: string;
}

export interface BusinessRepository {
  create(data: CreateBusinessData): Promise<Business>;
}
