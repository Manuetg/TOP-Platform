import { Inject } from '@nestjs/common';
import { BUSINESS_REPOSITORY, BusinessStatus, type BusinessRepository } from '../../business/business.contract';
import { CONTACT_LOOKUP, type ContactLookup } from '../../contact/contact.contract';
import { RESOURCE_REPOSITORY, ResourceStatus, type ResourceRepository } from '../../resource/resource.contract';
import { BookingBusinessNotFoundError, BookingBusinessUnavailableError, BookingContactNotFoundError, BookingResourceNotFoundError, BookingResourceUnavailableError } from './booking.errors';

export abstract class BookingBase {
  constructor(@Inject(BUSINESS_REPOSITORY) protected readonly businesses: BusinessRepository, @Inject(CONTACT_LOOKUP) protected readonly contacts: ContactLookup, @Inject(RESOURCE_REPOSITORY) protected readonly resources: ResourceRepository) {}
  protected async activeBusiness(businessId: string): Promise<void> {
    const business = await this.businesses.findById(businessId);
    if (!business) throw new BookingBusinessNotFoundError('El negocio no existe.');
    if (business.status !== BusinessStatus.ACTIVE) throw new BookingBusinessUnavailableError('El negocio no está activo.');
  }
  protected async validateContact(businessId: string, contactId: string | null): Promise<void> {
    if (contactId !== null && !(await this.contacts.findByIdAndBusinessId(contactId, businessId))) throw new BookingContactNotFoundError('El contacto no existe.');
  }
  protected async validateResources(businessId: string, resourceIds: string[]): Promise<void> {
    for (const resourceId of resourceIds) {
      const resource = await this.resources.findByIdAndBusinessId(resourceId, businessId);
      if (!resource) throw new BookingResourceNotFoundError('El recurso no existe.');
      if (resource.status === ResourceStatus.ARCHIVED) throw new BookingResourceUnavailableError('El recurso está archivado.');
    }
  }
  protected async validatePatchedResources(businessId: string, resourceIds: string[] | undefined): Promise<void> { if (resourceIds !== undefined) await this.validateResources(businessId, resourceIds); }
}
