import { Inject, Injectable } from '@nestjs/common';
import { USER_BY_ID_LOOKUP, type UserByIdLookup } from '../domain/user-by-id.lookup';
import { User } from '../domain/user.entity';
import { UserStatus } from '../domain/user-status.enum';
import { UserProfileForbiddenError, UserProfileInputError, UserProfileNotFoundError } from './user-profile.errors';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class GetUserProfileUseCase {
  constructor(@Inject(USER_BY_ID_LOOKUP) private readonly users: UserByIdLookup) {}

  async execute(input: { id: string; actorUserId: string }): Promise<User> {
    if (!uuid.test(input.id)) throw new UserProfileInputError('El identificador del usuario no es válido.');
    if (!uuid.test(input.actorUserId) || input.actorUserId !== input.id) {
      throw new UserProfileForbiddenError('Solo se permite consultar el propio perfil.');
    }
    const user = await this.users.findById(input.id);
    if (!user) throw new UserProfileNotFoundError('El usuario no existe.');
    if (user.status !== UserStatus.ACTIVE) throw new UserProfileForbiddenError('Un usuario deshabilitado no puede acceder a su perfil.');
    return user;
  }
}
