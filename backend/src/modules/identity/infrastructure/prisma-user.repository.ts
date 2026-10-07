import { Injectable } from '@nestjs/common';
import { Prisma, type User as PrismaUser } from '@prisma/client';
import { User } from '../domain/user.entity';
import { UserStatus } from '../domain/user-status.enum';
import type { AuthenticationRecord, AuthenticationRepository } from '../domain/authentication.repository';
import { UserEmailConflictError, type CreateUserData, type UserRepository } from '../domain/user.repository';
import type { UserByIdLookup } from '../domain/user-by-id.lookup';
import type { UserStatusRepository } from '../domain/user-status.repository';
import { UserProfileConflictError, UserProfileForbiddenError, UserProfileNotFoundError, type UserProfileChange, type UserProfileChangeRepository } from '../domain/user-profile-change.repository';
import { PrismaIdentityService } from './prisma-identity.service';

@Injectable()
export class PrismaUserRepository implements UserRepository, AuthenticationRepository, UserByIdLookup, UserStatusRepository, UserProfileChangeRepository {
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
  async changeDisplayName(input: UserProfileChange): Promise<User> {
    if (input.actorUserId !== input.id) throw new UserProfileForbiddenError('Solo se permite actualizar el propio perfil.');
    const user = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${input.id} FOR UPDATE`);
      const current = await transaction.user.findUnique({ where: { id: input.id } });
      if (!current) throw new UserProfileNotFoundError('El usuario no existe.');
      if (current.status !== 'ACTIVE') throw new UserProfileForbiddenError('Un usuario deshabilitado no puede actualizar su perfil.');
      if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) throw new UserProfileConflictError('El perfil cambió. Consultá los datos actuales antes de guardar.');
      const { changes, beforeData, afterData } = this.profileChanges(current, input);
      if (Object.keys(changes).length === 0) return current;
      const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
      const updated = await transaction.user.update({ where: { id: input.id }, data: { ...changes, updatedAt } });
      if (changes.displayName !== undefined) await transaction.userDisplayNameAudit.create({ data: {
        userId: input.id, actorUserId: input.actorUserId, occurredAt: updatedAt,
        beforeName: current.displayName, afterName: input.displayName, reason: input.reason,
      } });
      await transaction.userProfileAudit.create({ data: {
        userId: input.id, actorUserId: input.actorUserId, occurredAt: updatedAt,
        beforeData, afterData, reason: input.reason,
      } });
      return updated;
    });
    return this.toDomain(user);
  }
  private profileChanges(current: PrismaUser, input: UserProfileChange) {
    const fields = ['displayName', 'birthYear', 'username', 'phone', 'avatarId'] as const;
    const changes: Pick<Prisma.UserUpdateInput, typeof fields[number]> = {};
    const beforeData: Record<string, string | number | null> = {};
    const afterData: Record<string, string | number | null> = {};
    for (const field of fields) {
      const value = input[field];
      if (value === undefined || (current[field] ?? null) === value) continue;
      Object.assign(changes, { [field]: value });
      beforeData[field] = current[field] ?? null;
      afterData[field] = value;
    }
    return { changes, beforeData, afterData };
  }
  async create(data: CreateUserData): Promise<User> {
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { email: data.email, emailVerifiedAt: new Date() } });
      await tx.localCredential.create({ data: { userId: created.id, passwordHash: data.passwordHash } });
      return created;
    });
    return this.toDomain(user);
  }
  private toDomain(user: PrismaUser): User {
    return User.create({ id: user.id, email: user.email, displayName: user.displayName, birthYear: user.birthYear, username: user.username, phone: user.phone, avatarId: user.avatarId, emailVerifiedAt: user.emailVerifiedAt, status: user.status as UserStatus, createdAt: user.createdAt, updatedAt: user.updatedAt });
  }
}
