import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateUserUseCase, InvalidUserInputError, UserAlreadyExistsError } from '../application/create-user.use-case';
import { InvalidUserUpdateError, UpdateUserForbiddenError, UpdateUserNotFoundError, UpdateUserUseCase, UserEmailChangeUnavailableError } from '../application/update-user.use-case';
import { CreateUserRequestDto } from './dto/create-user.request.dto';
import { UserResponseDto } from './dto/user.response.dto';
import { DisableUserResponseDto } from './dto/disable-user.response.dto';
import { UpdateUserRequestDto } from './dto/update-user.request.dto';
import { DisableUserUseCase, InvalidUserIdError, UserNotFoundError } from '../application/disable-user.use-case';
import { Authenticated, PlatformAuthorityRequired } from '../../../shared/security/security.decorators';
import { AuthenticatedUser } from '../../../shared/security/authenticated-user.decorator';
import type { AuthenticatedPrincipal } from '../../../shared/security/authenticated-principal';
import { GetUserProfileUseCase } from '../application/get-user-profile.use-case';
import { UpdateUserProfileUseCase } from '../application/update-user-profile.use-case';
import { UserProfileConflictError, UserProfileForbiddenError, UserProfileInputError, UserProfileNotFoundError } from '../application/user-profile.errors';
import { UpdateUserProfileRequestDto } from './dto/update-user-profile.request.dto';
import { UserProfileResponseDto } from './dto/user-profile.response.dto';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly disableUserUseCase: DisableUserUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly getUserProfileUseCase: GetUserProfileUseCase,
    private readonly updateUserProfileUseCase: UpdateUserProfileUseCase,
  ) {}
  @Get(':id/profile') @Authenticated()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Consultar el propio perfil personal' })
  @ApiOkResponse({ type: UserProfileResponseDto })
  @ApiBadRequestResponse({ description: 'Identificador inválido.' })
  @ApiForbiddenResponse({ description: 'Solo se permite consultar el propio perfil ACTIVE.' })
  @ApiNotFoundResponse({ description: 'El usuario no existe.' })
  async getProfile(@Param('id') id: string, @AuthenticatedUser() principal: AuthenticatedPrincipal): Promise<UserProfileResponseDto> {
    try { return UserProfileResponseDto.fromDomain(await this.getUserProfileUseCase.execute({ id, actorUserId: principal.userId })); }
    catch (error: unknown) { return this.profileError(error); }
  }
  @Patch(':id/profile') @Authenticated() @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Actualizar el propio perfil personal con auditoría automática' })
  @ApiOkResponse({ type: UserProfileResponseDto })
  @ApiBadRequestResponse({ description: 'Campo de perfil o versión inválidos.' })
  @ApiForbiddenResponse({ description: 'Solo se permite actualizar el propio perfil ACTIVE.' })
  @ApiNotFoundResponse({ description: 'El usuario no existe.' })
  @ApiConflictResponse({ description: 'La versión del perfil consultado quedó desactualizada.' })
  async updateProfile(@Param('id') id: string, @Body() request: UpdateUserProfileRequestDto, @AuthenticatedUser() principal: AuthenticatedPrincipal): Promise<UserProfileResponseDto> {
    try { return UserProfileResponseDto.fromDomain(await this.updateUserProfileUseCase.execute({
      id, actorUserId: principal.userId, displayName: request.displayName,
      birthYear: request.birthYear, username: request.username, phone: request.phone, avatarId: request.avatarId,
      expectedUpdatedAt: request.expectedUpdatedAt,
    })); }
    catch (error: unknown) { return this.profileError(error); }
  }
  private profileError(error: unknown): never {
    if (error instanceof UserProfileInputError) throw new BadRequestException(error.message);
    if (error instanceof UserProfileForbiddenError) throw new ForbiddenException(error.message);
    if (error instanceof UserProfileNotFoundError) throw new NotFoundException(error.message);
    if (error instanceof UserProfileConflictError) throw new ConflictException(error.message);
    throw error;
  }
  @Post() @PlatformAuthorityRequired() @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un usuario administrativo provisional' })
  @ApiCreatedResponse({ type: UserResponseDto, description: 'No expone contraseña, hash ni tokens.' })
  @ApiBadRequestResponse({ description: 'Email o contraseña inválidos.' })
  @ApiConflictResponse({ description: 'El email ya está registrado.' })
  async create(@Body() request: CreateUserRequestDto): Promise<UserResponseDto> {
    try { return UserResponseDto.fromDomain(await this.createUserUseCase.execute(request)); }
    catch (error: unknown) {
      if (error instanceof InvalidUserInputError) throw new BadRequestException(error.message);
      if (error instanceof UserAlreadyExistsError) throw new ConflictException(error.message);
      throw error;
    }
  }
  @Patch(':id') @Authenticated() @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambio de correo suspendido; admite únicamente no-op sobre el correo propio vigente' })
  @ApiOkResponse({ type: UserResponseDto, description: 'El correo normalizado coincide con el vigente; no modifica datos ni sesiones.' })
  @ApiBadRequestResponse({ description: 'Identificador o email inválido.' })
  @ApiForbiddenResponse({ description: 'El User autenticado solo puede actualizar su propia identidad ACTIVE.' })
  @ApiNotFoundResponse({ description: 'El usuario no existe.' })
  @ApiConflictResponse({ description: 'EMAIL_CHANGE_UNAVAILABLE: todo cambio efectivo está suspendido hasta contar con un flujo seguro de entrega y verificación.' })
  async update(@Param('id') id: string, @Body() request: UpdateUserRequestDto, @AuthenticatedUser() principal: AuthenticatedPrincipal): Promise<UserResponseDto> {
    try { return UserResponseDto.fromDomain(await this.updateUserUseCase.execute({ id, actorUserId: principal.userId, email: request.email })); }
    catch (error: unknown) {
      if (error instanceof InvalidUserUpdateError) throw new BadRequestException(error.message);
      if (error instanceof UpdateUserForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof UpdateUserNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof UserEmailChangeUnavailableError) throw new ConflictException({ code: 'EMAIL_CHANGE_UNAVAILABLE', message: error.message });
      throw error;
    }
  }
  @Patch(':id/disable') @PlatformAuthorityRequired() @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deshabilitar lógicamente un usuario' })
  @ApiOkResponse({ type: DisableUserResponseDto })
  @ApiBadRequestResponse({ description: 'El identificador del usuario no es válido.' })
  @ApiNotFoundResponse({ description: 'El usuario no existe.' })
  async disable(@Param('id') id: string): Promise<DisableUserResponseDto> {
    try { return DisableUserResponseDto.fromDomain(await this.disableUserUseCase.execute(id)); }
    catch (error: unknown) { if (error instanceof InvalidUserIdError) throw new BadRequestException(error.message); if (error instanceof UserNotFoundError) throw new NotFoundException(error.message); throw error; }
  }
}
