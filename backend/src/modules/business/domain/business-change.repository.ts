import type { Business, BusinessUpdate } from './business.entity';

export const BUSINESS_CHANGE_REPOSITORY = Symbol('BUSINESS_CHANGE_REPOSITORY');
export const BUSINESS_PROFILE_UPDATE_REASON = 'Actualización del perfil del establecimiento.';
export const BUSINESS_ARCHIVE_REASON = 'Archivo del establecimiento.';

export interface BusinessProfileChange {
  id: string;
  actorUserId: string;
  changes: BusinessUpdate;
  expectedUpdatedAt: Date;
}

export interface BusinessChangeRepository {
  changeProfile(input: BusinessProfileChange): Promise<Business>;
  archive(input: { id: string; actorUserId: string }): Promise<Business>;
}

export class BusinessChangeConflictError extends Error {}
export class BusinessChangeForbiddenError extends Error {}
export class BusinessTimezoneHistoryError extends Error {}
