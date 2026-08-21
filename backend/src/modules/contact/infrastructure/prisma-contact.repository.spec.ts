import { ContactStatus } from '../domain/contact-status.enum';
import { PrismaContactRepository } from './prisma-contact.repository';

const row = { id: '11111111-1111-4111-8111-111111111111', businessId: '22222222-2222-4222-8222-222222222222', name: 'María', lastName: null, phone: '0981123456', whatsapp: null, email: null, documentType: null, documentNumber: null, country: null, city: null, status: ContactStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date() };
describe('PrismaContactRepository', () => {
  const create = jest.fn(); const findFirst = jest.fn(); const findMany = jest.fn(); const update = jest.fn(); const repository = new PrismaContactRepository({ contact: { create, findFirst, findMany, update } } as never);
  beforeEach(() => jest.resetAllMocks());
  it('creates and maps a contact', async () => { create.mockResolvedValueOnce(row); await expect(repository.create({ businessId: row.businessId, name: row.name, lastName: null, phone: row.phone, whatsapp: null, email: null, documentType: null, documentNumber: null, country: null, city: null })).resolves.toMatchObject({ id: row.id, status: ContactStatus.ACTIVE }); });
  it('searches approved fields in a single scoped query with deterministic order', async () => { findMany.mockResolvedValueOnce([row]); await expect(repository.searchByBusinessId(row.businessId, 'Mar')).resolves.toHaveLength(1); expect(findMany).toHaveBeenCalledWith({ where: { businessId: row.businessId, OR: [{ name: { contains: 'Mar', mode: 'insensitive' } }, { lastName: { contains: 'Mar', mode: 'insensitive' } }, { phone: { contains: 'Mar', mode: 'insensitive' } }, { whatsapp: { contains: 'Mar', mode: 'insensitive' } }, { email: { contains: 'Mar', mode: 'insensitive' } }, { documentNumber: { contains: 'Mar', mode: 'insensitive' } }] }, orderBy: [{ name: 'asc' }, { lastName: 'asc' }, { id: 'asc' }] }); });
  it('does not expose a contact outside its business', async () => { findFirst.mockResolvedValueOnce(null); await expect(repository.findByIdAndBusinessId(row.id, row.businessId)).resolves.toBeNull(); expect(findFirst).toHaveBeenCalledWith({ where: { id: row.id, businessId: row.businessId } }); });
});
