import { Injectable } from '@nestjs/common';
import type { User as PrismaUser } from '@prisma/client';
import { User } from '../domain/user.entity';
import { UserStatus } from '../domain/user-status.enum';
import type { AuthenticationRecord, AuthenticationRepository } from '../domain/authentication.repository';
import type { CreateUserData, UserRepository } from '../domain/user.repository';
import { PrismaIdentityService } from './prisma-identity.service';

@Injectable()
export class PrismaUserRepository implements UserRepository, AuthenticationRepository {
  constructor(private readonly prisma: PrismaIdentityService) {}
  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? this.toDomain(user) : null;
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
