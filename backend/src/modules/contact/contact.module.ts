import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { CreateContactUseCase } from './application/create-contact.use-case';
import { GetContactUseCase } from './application/get-contact.use-case';
import { SearchContactsUseCase } from './application/search-contacts.use-case';
import { UpdateContactUseCase } from './application/update-contact.use-case';
import { CONTACT_REPOSITORY } from './domain/contact.repository';
import { PrismaContactRepository } from './infrastructure/prisma-contact.repository';
import { ContactController } from './presentation/contact.controller';

@Module({ imports: [BusinessModule], controllers: [ContactController], providers: [PrismaContactRepository, { provide: CONTACT_REPOSITORY, useExisting: PrismaContactRepository }, CreateContactUseCase, GetContactUseCase, SearchContactsUseCase, UpdateContactUseCase], exports: [CONTACT_REPOSITORY] })
export class ContactModule {}
