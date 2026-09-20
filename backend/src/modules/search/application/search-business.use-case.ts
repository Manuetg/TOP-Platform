import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BUSINESS_REPOSITORY, BusinessStatus, type BusinessRepository } from '../../business/business.contract';
import { GetBusinessCapabilitiesUseCase } from '../../identity/identity.contract';
import { RESOURCE_SEARCH_READER, type ResourceSearchReader } from '../../resource/resource.contract';
import { CONTACT_SEARCH_READER, type ContactSearchReader } from '../../contact/contact.contract';
import { BOOKING_SEARCH_READER, type BookingSearchReader } from '../../booking/booking.contract';
import { Capability } from '../../../shared/application/authorization-policy';

export type SearchType = 'resource' | 'contact' | 'booking';
export interface SearchItem { type: SearchType; id: string; title: string; subtitle: string | null; status: string; }
export interface SearchGroup { type: SearchType; items: SearchItem[]; hasMore: boolean; }
export interface SearchResponse { groups: SearchGroup[]; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class SearchBusinessUseCase {
  constructor(
    @Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository,
    private readonly access: GetBusinessCapabilitiesUseCase,
    @Inject(RESOURCE_SEARCH_READER) private readonly resources: ResourceSearchReader,
    @Inject(CONTACT_SEARCH_READER) private readonly contacts: ContactSearchReader,
    @Inject(BOOKING_SEARCH_READER) private readonly bookings: BookingSearchReader,
  ) {}

  async execute(userId: string, businessId: string, input: unknown): Promise<SearchResponse> {
    const query = this.validate(businessId, input);
    const permissions = await this.access.execute(userId, businessId);
    if (!permissions.includes(Capability.SEARCH_READ)) throw new ForbiddenException('No tienes acceso a la búsqueda.');
    const business = await this.businesses.findById(businessId);
    if (!business) throw new NotFoundException('El negocio no existe.');
    if (business.status !== BusinessStatus.ACTIVE) throw new ConflictException('El negocio no está activo.');
    const tasks = [
      { type: 'resource' as const, capability: Capability.RESOURCE_READ, run: () => this.resources.read(businessId, query), limit: 5 },
      { type: 'contact' as const, capability: Capability.CONTACT_READ, run: () => this.contacts.read(businessId, query), limit: 5 },
      { type: 'booking' as const, capability: Capability.BOOKING_READ, run: () => uuid.test(query) ? this.bookings.read(businessId, query.toLowerCase()) : Promise.resolve([]), limit: 1 },
    ];
    const groups = await Promise.all(tasks.filter((task) => permissions.includes(task.capability)).map(async (task) => {
      const rows = await task.run();
      return { type: task.type, hasMore: task.type !== 'booking' && rows.length > task.limit,
        items: rows.slice(0, task.limit).map((row) => ({ type: task.type, id: row.id, title: row.title, subtitle: row.subtitle, status: row.status })),
      };
    }));
    return { groups };
  }

  private validate(businessId: string, input: unknown): string {
    if (!uuid.test(businessId)) throw new BadRequestException('El identificador del negocio no es válido.');
    if (typeof input !== 'string') throw new BadRequestException('Ingresa una búsqueda de 2 a 120 caracteres.');
    const query = input.trim();
    if (query.length < 2 || query.length > 120) throw new BadRequestException('Ingresa una búsqueda de 2 a 120 caracteres.');
    return query;
  }
}
