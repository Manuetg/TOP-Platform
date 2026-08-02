import { Module } from '@nestjs/common';
import { CreateUserUseCase } from './application/create-user.use-case';
import { PASSWORD_HASHER } from './domain/password-hasher';
import { USER_REPOSITORY } from './domain/user.repository';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { PrismaIdentityService } from './infrastructure/prisma-identity.service';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { UserController } from './presentation/user.controller';

@Module({ controllers: [UserController], providers: [PrismaIdentityService, { provide: USER_REPOSITORY, useClass: PrismaUserRepository }, { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher }, CreateUserUseCase] })
export class IdentityModule {}
