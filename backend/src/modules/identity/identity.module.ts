import { Module } from '@nestjs/common';
import { CreateUserUseCase } from './application/create-user.use-case';
import { CreateMembershipUseCase } from './application/create-membership.use-case';
import { BUSINESS_LOOKUP, MEMBERSHIP_REPOSITORY, USER_LOOKUP } from './domain/membership.repository';
import { PASSWORD_HASHER } from './domain/password-hasher';
import { USER_REPOSITORY } from './domain/user.repository';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { PrismaIdentityService } from './infrastructure/prisma-identity.service';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { PrismaMembershipRepository } from './infrastructure/prisma-membership.repository';
import { MembershipController } from './presentation/membership.controller';
import { UserController } from './presentation/user.controller';

@Module({ controllers: [UserController, MembershipController], providers: [PrismaIdentityService, PrismaMembershipRepository, { provide: USER_REPOSITORY, useClass: PrismaUserRepository }, { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher }, { provide: MEMBERSHIP_REPOSITORY, useExisting: PrismaMembershipRepository }, { provide: USER_LOOKUP, useExisting: PrismaMembershipRepository }, { provide: BUSINESS_LOOKUP, useFactory: (repository: PrismaMembershipRepository) => ({ exists: (id: string) => repository.businessExists(id) }), inject: [PrismaMembershipRepository] }, CreateUserUseCase, CreateMembershipUseCase] })
export class IdentityModule {}
