import { Inject, Injectable } from '@nestjs/common';
import { USER_BY_ID_LOOKUP, type UserByIdLookup } from '../domain/user-by-id.lookup';
import { USER_STATUS_REPOSITORY, type UserStatusRepository } from '../domain/user-status.repository';
import { UserStatus } from '../domain/user-status.enum';
import { User } from '../domain/user.entity';
export class InvalidUserIdError extends Error {}
export class UserNotFoundError extends Error {}
@Injectable()
export class DisableUserUseCase {
  constructor(@Inject(USER_BY_ID_LOOKUP) private readonly users: UserByIdLookup, @Inject(USER_STATUS_REPOSITORY) private readonly statuses: UserStatusRepository) {}
  async execute(id: string): Promise<User> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new InvalidUserIdError('El identificador del usuario no es válido.');
    const user = await this.users.findById(id);
    if (!user) throw new UserNotFoundError('El usuario no existe.');
    return user.status === UserStatus.DISABLED ? user : this.statuses.update(user.disable());
  }
}
