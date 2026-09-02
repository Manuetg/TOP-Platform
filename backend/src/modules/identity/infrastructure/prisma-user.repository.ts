import { Injectable } from '@nestjs/common';
import { Prisma, type User as PrismaUser } from '@prisma/client';
import { User } from '../domain/user.entity';
import { UserStatus } from '../domain/user-status.enum';
import type { AuthenticationRecord, AuthenticationRepository } from '../domain/authentication.repository';
import { UserEmailConflictError, type CreateUserData, type UserRepository } from '../domain/user.repository';
import type { UserByIdLookup } from '../domain/user-by-id.lookup';
import type { UserStatusRepository } from '../domain/user-status.repository';
import { PrismaIdentityService } from './prisma-identity.service';

@Injectable()
export class PrismaUserRepository implements UserRepository, AuthenticationRepository, UserByIdLookup, UserStatusRepository {
  constructor(private readonly prisma: PrismaIdentityService) {}
  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? this.toDomain(user) : null;
  }
  async findById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? this.toDomain(user) : null;
  }
  async update(user: User): Promise<User> { return this.toDomain(await this.prisma.user.update({ where: { id: user.id }, data: { status: user.status } })); }
  async updateEmail(user: User): Promise<User> {
    try {
      return this.toDomain(await this.prisma.user.update({ where: { id: user.id }, data: { email: user.email } }));
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new UserEmailConflictError('El email ya está registrado.');
      throw error;
    }
  }
  async findForLoginByEmail(email: string): Promise<AuthenticationRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { email }, include: { localCredential: true } });
    if (!user?.localCredential) return null;
    return { user: this.toDomain(user), passwordHash: user.localCredential.passwordHash };
  }
  async create(data: CreateUserData): Promise<User> {
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { email: data.email } });
      await tx.localCredential.create({ data: { userId: created.id, passwordHash: data.passwordHash } });
      return created;
    });
    return this.toDomain(user);
  }
  private toDomain(user: PrismaUser): User {
    return User.create({ id: user.id, email: user.email, status: user.status as UserStatus, createdAt: user.createdAt, updatedAt: user.updatedAt });
  }
}
