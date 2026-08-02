import { Inject, Injectable } from '@nestjs/common';
import { PASSWORD_HASHER, type PasswordHasher } from '../domain/password-hasher';
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository';
import { User } from '../domain/user.entity';

export class InvalidUserInputError extends Error {}
export class UserAlreadyExistsError extends Error {}

export interface CreateUserInput { email: string; password: string; }

@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly repository: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(input: CreateUserInput): Promise<User> {
    const email = this.normalizeAndValidateEmail(input.email);
    this.validatePassword(input.password);
    if (await this.repository.findByEmail(email)) throw new UserAlreadyExistsError('El email ya está registrado.');
    const passwordHash = await this.passwordHasher.hash(input.password);
    return this.repository.create({ email, passwordHash });
  }

  private normalizeAndValidateEmail(value: string): string {
    const email = value?.trim().toLowerCase();
    if (!email) throw new InvalidUserInputError('El email es obligatorio.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InvalidUserInputError('El email no es válido.');
    return email;
  }

  private validatePassword(password: string): void {
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
      throw new InvalidUserInputError('La contraseña debe tener entre 12 y 128 caracteres.');
    }
  }
}
