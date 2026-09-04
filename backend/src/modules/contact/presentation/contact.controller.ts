import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContactBusinessNotFoundError, ContactBusinessUnavailableError, ContactNotFoundError, InvalidContactInputError } from '../application/contact.errors';
import { CreateContactUseCase } from '../application/create-contact.use-case';
import { GetContactUseCase } from '../application/get-contact.use-case';
import { SearchContactsUseCase } from '../application/search-contacts.use-case';
import { UpdateContactUseCase } from '../application/update-contact.use-case';
import { CreateContactRequestDto } from './dto/create-contact.request.dto';
import { ContactResponseDto } from './dto/contact.response.dto';
import { UpdateContactRequestDto } from './dto/update-contact.request.dto';
import { BusinessAccess } from '../../../shared/security/security.decorators';
import { Capability } from '../../../shared/application/authorization-policy';

@ApiTags('Contacts')
@Controller('businesses/:businessId/contacts')
export class ContactController {
  constructor(private readonly create: CreateContactUseCase, private readonly getContact: GetContactUseCase, private readonly search: SearchContactsUseCase, private readonly updateContact: UpdateContactUseCase) {}
  @Post() @BusinessAccess('businessId', Capability.CONTACT_WRITE) @HttpCode(HttpStatus.CREATED) @ApiOperation({ summary: 'Creates a contact for a business.' }) @ApiCreatedResponse({ type: ContactResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
  async createContact(@Param('businessId') businessId: string, @Body() body: CreateContactRequestDto): Promise<ContactResponseDto> { try { return ContactResponseDto.fromDomain(await this.create.execute({ businessId, ...body })); } catch (error: unknown) { throw this.mapError(error); } }
  @Get() @BusinessAccess('businessId', Capability.CONTACT_READ) @ApiOperation({ summary: 'Searches contacts by name, phone, WhatsApp, email or document.' }) @ApiOkResponse({ type: ContactResponseDto, isArray: true }) @ApiBadRequestResponse() @ApiNotFoundResponse()
  async searchContacts(@Param('businessId') businessId: string, @Query('query') query?: string): Promise<ContactResponseDto[]> { try { return (await this.search.execute(businessId, query)).map((contact) => ContactResponseDto.fromDomain(contact)); } catch (error: unknown) { throw this.mapError(error); } }
  @Get(':contactId') @BusinessAccess('businessId', Capability.CONTACT_READ) @ApiOperation({ summary: 'Gets a contact scoped to its business.' }) @ApiOkResponse({ type: ContactResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse()
  async get(@Param('businessId') businessId: string, @Param('contactId') contactId: string): Promise<ContactResponseDto> { try { return ContactResponseDto.fromDomain(await this.getContact.execute(businessId, contactId)); } catch (error: unknown) { throw this.mapError(error); } }
  @Patch(':contactId') @BusinessAccess('businessId', Capability.CONTACT_WRITE) @ApiOperation({ summary: 'Updates a contact partially without changing its business.' }) @ApiOkResponse({ type: ContactResponseDto }) @ApiBadRequestResponse() @ApiNotFoundResponse() @ApiConflictResponse()
  async update(@Param('businessId') businessId: string, @Param('contactId') contactId: string, @Body() body: UpdateContactRequestDto): Promise<ContactResponseDto> { try { return ContactResponseDto.fromDomain(await this.updateContact.execute({ businessId, contactId, ...body })); } catch (error: unknown) { throw this.mapError(error); } }
  private mapError(error: unknown): Error { if (error instanceof InvalidContactInputError) return new BadRequestException(error.message); if (error instanceof ContactBusinessNotFoundError || error instanceof ContactNotFoundError) return new NotFoundException(error.message); if (error instanceof ContactBusinessUnavailableError) return new ConflictException(error.message); return error instanceof Error ? error : new Error('Error inesperado.'); }
}
