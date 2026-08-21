import { BusinessStatus } from '../../business/business.contract';
import { Contact } from '../domain/contact.entity';
import { ContactStatus } from '../domain/contact-status.enum';
import { ContactBusinessNotFoundError, ContactBusinessUnavailableError, ContactNotFoundError, InvalidContactInputError } from './contact.errors';
import { CreateContactUseCase } from './create-contact.use-case';
import { GetContactUseCase } from './get-contact.use-case';
import { SearchContactsUseCase } from './search-contacts.use-case';
import { UpdateContactUseCase } from './update-contact.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const contactId = '22222222-2222-4222-8222-222222222222';
const contact = () => Contact.create({ id: contactId, businessId, name: 'María', lastName: 'López', phone: '0981123456', whatsapp: null, email: null, documentType: null, documentNumber: null, country: 'Paraguay', city: 'Asunción', status: ContactStatus.ACTIVE, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') });
const valid = { businessId, name: ' María ', phone: '0981123456' };

describe('Contact use cases', () => {
  const findBusiness = jest.fn(); const create = jest.fn(); const findContact = jest.fn(); const search = jest.fn(); const update = jest.fn();
  const businesses = { findById: findBusiness } as never;
  const contacts = { create, findByIdAndBusinessId: findContact, searchByBusinessId: search, update } as never;
  const createUseCase = new CreateContactUseCase(businesses, contacts);
  const getUseCase = new GetContactUseCase(businesses, contacts);
  const searchUseCase = new SearchContactsUseCase(businesses, contacts);
  const updateUseCase = new UpdateContactUseCase(businesses, contacts);
  beforeEach(() => { jest.resetAllMocks(); findBusiness.mockResolvedValue({ status: BusinessStatus.ACTIVE }); });

  it('CON-001 creates a minimum scoped contact with normalized fields', async () => {
    create.mockResolvedValueOnce(contact());
    await expect(createUseCase.execute(valid)).resolves.toEqual(contact());
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ businessId, name: 'María', phone: '0981123456', email: null }));
  });
  it.each([{ businessId, name: 'M', phone: '1' }, { businessId, name: 'María' }, { businessId, name: 'María', email: 'invalid' }, { businessId: 'invalid', name: 'María', phone: '1' }])('CON-001 rejects invalid minimum data before persistence', async (input) => {
    await expect(createUseCase.execute(input)).rejects.toBeInstanceOf(InvalidContactInputError); expect(create).not.toHaveBeenCalled();
  });
  it('CON-001 handles missing or unavailable businesses', async () => {
    findBusiness.mockResolvedValueOnce(null); await expect(createUseCase.execute(valid)).rejects.toBeInstanceOf(ContactBusinessNotFoundError);
    findBusiness.mockResolvedValueOnce({ status: BusinessStatus.ARCHIVED }); await expect(createUseCase.execute(valid)).rejects.toBeInstanceOf(ContactBusinessUnavailableError);
  });
  it('CON-002 reads only by business and contact identifiers', async () => {
    findContact.mockResolvedValueOnce(contact()); await expect(getUseCase.execute(businessId, contactId)).resolves.toEqual(contact()); expect(findContact).toHaveBeenCalledWith(contactId, businessId);
  });
  it('CON-002 hides cross-tenant contacts and validates identifiers', async () => {
    findContact.mockResolvedValueOnce(null); await expect(getUseCase.execute(businessId, contactId)).rejects.toBeInstanceOf(ContactNotFoundError);
    await expect(getUseCase.execute('invalid', contactId)).rejects.toBeInstanceOf(InvalidContactInputError);
  });
  it('CON-003 searches only inside the requested business by approved query', async () => {
    search.mockResolvedValueOnce([contact()]); await expect(searchUseCase.execute(businessId, ' María ')).resolves.toEqual([contact()]); expect(search).toHaveBeenCalledWith(businessId, 'María');
  });
  it('CON-003 returns all scoped contacts without a query and rejects empty queries', async () => {
    search.mockResolvedValueOnce([]); await expect(searchUseCase.execute(businessId)).resolves.toEqual([]); expect(search).toHaveBeenCalledWith(businessId, null);
    await expect(searchUseCase.execute(businessId, ' ')).rejects.toBeInstanceOf(InvalidContactInputError);
  });
  it('CON-004 updates fields partially while preserving the business and final contact medium', async () => {
    findContact.mockResolvedValueOnce(contact()); update.mockImplementationOnce((value: Contact) => Promise.resolve(value));
    const result = await updateUseCase.execute({ businessId, contactId, name: ' Ana ', email: 'ana@example.com', phone: null });
    expect(result).toMatchObject({ businessId, name: 'Ana', email: 'ana@example.com', phone: null }); expect(update).toHaveBeenCalledWith(expect.objectContaining({ businessId }));
  });
  it.each([{}, { phone: null }, { name: ' ' }])('CON-004 rejects empty or invalid final states', async (input) => {
    if (Object.keys(input).length > 0) findContact.mockResolvedValueOnce(contact());
    await expect(updateUseCase.execute({ businessId, contactId, ...input })).rejects.toBeInstanceOf(InvalidContactInputError); expect(update).not.toHaveBeenCalled();
  });

  it.each([
    { phone: '0981123456' },
    { whatsapp: '0981123456' },
    { email: 'maria@example.com' },
  ])('CON-001 accepts each approved contact medium independently', async (medium) => {
    create.mockResolvedValueOnce(contact());

    await expect(createUseCase.execute({ businessId, name: 'María', ...medium })).resolves.toEqual(contact());
  });

  it('CON-001 accepts a two-character name and rejects a one-character name with the contract message', async () => {
    create.mockResolvedValueOnce(contact());
    await expect(createUseCase.execute({ businessId, name: 'Ab', phone: '0981123456' })).resolves.toEqual(contact());
    await expect(createUseCase.execute({ businessId, name: 'A', phone: '0981123456' })).rejects.toMatchObject({
      message: 'El nombre es obligatorio.',
    });
  });

  it.each([
    `${businessId}extra`,
    `extra${businessId}`,
  ])('rejects UUID values with extra text before looking up dependencies', async (invalidBusinessId) => {
    await expect(createUseCase.execute({ businessId: invalidBusinessId, name: 'María', phone: '0981123456' })).rejects.toBeInstanceOf(InvalidContactInputError);
    expect(findBusiness).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    'extra maria@example.com',
    'maria@example.com extra',
  ])('rejects email values with prefix or suffix garbage before persistence', async (invalidEmail) => {
    await expect(createUseCase.execute({ businessId, name: 'María', email: invalidEmail })).rejects.toBeInstanceOf(InvalidContactInputError);
    expect(create).not.toHaveBeenCalled();
  });

  it('CON-004 preserves omitted fields and clears explicitly null fields', async () => {
    findContact.mockResolvedValueOnce(contact());
    update.mockImplementationOnce((value: Contact) => Promise.resolve(value));
    const preserved = await updateUseCase.execute({ businessId, contactId, name: undefined, city: ' Encarnación ' });
    expect(preserved).toMatchObject({ name: 'María', lastName: 'López', city: 'Encarnación' });

    findContact.mockResolvedValueOnce(contact());
    update.mockImplementationOnce((value: Contact) => Promise.resolve(value));
    const cleared = await updateUseCase.execute({ businessId, contactId, lastName: null });
    expect(cleared).toMatchObject({ name: 'María', lastName: null, phone: '0981123456' });
  });

  it('short-circuits invalid identifiers for get, search and update', async () => {
    await expect(getUseCase.execute(`prefix${businessId}`, contactId)).rejects.toBeInstanceOf(InvalidContactInputError);
    await expect(getUseCase.execute(businessId, `${contactId}suffix`)).rejects.toBeInstanceOf(InvalidContactInputError);
    await expect(searchUseCase.execute(`prefix${businessId}`)).rejects.toBeInstanceOf(InvalidContactInputError);
    await expect(updateUseCase.execute({ businessId, contactId: `${contactId}suffix`, city: 'Asunción' })).rejects.toBeInstanceOf(InvalidContactInputError);
    expect(findBusiness).not.toHaveBeenCalled();
    expect(findContact).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('reports missing businesses and contacts through get, search and update', async () => {
    findBusiness.mockResolvedValueOnce(null);
    await expect(getUseCase.execute(businessId, contactId)).rejects.toBeInstanceOf(ContactBusinessNotFoundError);

    findBusiness.mockResolvedValueOnce(null);
    await expect(searchUseCase.execute(businessId)).rejects.toBeInstanceOf(ContactBusinessNotFoundError);

    findBusiness.mockResolvedValueOnce(null);
    await expect(updateUseCase.execute({ businessId, contactId, city: 'Asunción' })).rejects.toBeInstanceOf(ContactBusinessNotFoundError);

    findContact.mockResolvedValueOnce(null);
    await expect(updateUseCase.execute({ businessId, contactId, city: 'Asunción' })).rejects.toBeInstanceOf(ContactNotFoundError);
    expect(update).not.toHaveBeenCalled();
  });
});
