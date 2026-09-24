import { ArchiveContactUseCase } from './archive-contact.use-case';
import { BusinessStatus } from '../../business/business.contract';
import { ContactBusinessNotFoundError, ContactBusinessUnavailableError, ContactNotFoundError, InvalidContactInputError } from './contact.errors';

const businessId = '11111111-1111-4111-8111-111111111111';
const contactId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
describe('ArchiveContactUseCase', () => {
  const findById = jest.fn(); const archive = jest.fn();
  const useCase = new ArchiveContactUseCase({ findById } as never, { archive } as never);
  beforeEach(() => { jest.resetAllMocks(); findById.mockResolvedValue({ status: BusinessStatus.ACTIVE }); });
  it('archives only in the requested tenant and attributes the authenticated actor', async () => {
    const result = { id: contactId, status: 'ARCHIVED' }; archive.mockResolvedValue(result);
    await expect(useCase.execute(businessId, contactId, actorId)).resolves.toBe(result);
    expect(archive).toHaveBeenCalledWith(contactId, businessId, actorId);
  });
  it.each([['invalid', contactId, actorId], [businessId, 'invalid', actorId], [businessId, contactId, '']])('rejects invalid scope or absent actor', async (business, contact, actor) => {
    await expect(useCase.execute(business, contact, actor)).rejects.toBeInstanceOf(InvalidContactInputError);
    expect(findById).not.toHaveBeenCalled(); expect(archive).not.toHaveBeenCalled();
  });
  it('hides missing and cross-tenant contacts', async () => {
    archive.mockResolvedValue(null);
    await expect(useCase.execute(businessId, contactId, actorId)).rejects.toBeInstanceOf(ContactNotFoundError);
  });
  it('rejects nonexistent and inactive businesses before mutation', async () => {
    findById.mockResolvedValueOnce(null);
    await expect(useCase.execute(businessId, contactId, actorId)).rejects.toBeInstanceOf(ContactBusinessNotFoundError);
    findById.mockResolvedValueOnce({ status: BusinessStatus.ARCHIVED });
    await expect(useCase.execute(businessId, contactId, actorId)).rejects.toBeInstanceOf(ContactBusinessUnavailableError);
    expect(archive).not.toHaveBeenCalled();
  });
});
