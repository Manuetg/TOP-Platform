import { BadRequestException, Body, ConflictException, Controller, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateUserUseCase, InvalidUserInputError, UserAlreadyExistsError } from '../application/create-user.use-case';
import { InvalidUserUpdateError, UpdateUserNotFoundError, UpdateUserUseCase, UserEmailAlreadyExistsError } from '../application/update-user.use-case';
import { CreateUserRequestDto } from './dto/create-user.request.dto';
import { UserResponseDto } from './dto/user.response.dto';
import { DisableUserResponseDto } from './dto/disable-user.response.dto';
import { UpdateUserRequestDto } from './dto/update-user.request.dto';
import { DisableUserUseCase, InvalidUserIdError, UserNotFoundError } from '../application/disable-user.use-case';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly createUserUseCase: CreateUserUseCase, private readonly disableUserUseCase: DisableUserUseCase, private readonly updateUserUseCase: UpdateUserUseCase) {}
  @Post() @HttpCode(HttpStatus.CREATED)
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
  @Patch(':id') @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar el email de un usuario' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'Identificador o email inválido.' })
  @ApiNotFoundResponse({ description: 'El usuario no existe.' })
  @ApiConflictResponse({ description: 'El email ya está registrado.' })
  async update(@Param('id') id: string, @Body() request: UpdateUserRequestDto): Promise<UserResponseDto> {
    try { return UserResponseDto.fromDomain(await this.updateUserUseCase.execute({ id, email: request?.email })); }
    catch (error: unknown) {
      if (error instanceof InvalidUserUpdateError) throw new BadRequestException(error.message);
      if (error instanceof UpdateUserNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof UserEmailAlreadyExistsError) throw new ConflictException(error.message);
      throw error;
    }
  }
  @Patch(':id/disable') @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deshabilitar lógicamente un usuario' })
  @ApiOkResponse({ type: DisableUserResponseDto })
  @ApiBadRequestResponse({ description: 'El identificador del usuario no es válido.' })
  @ApiNotFoundResponse({ description: 'El usuario no existe.' })
  async disable(@Param('id') id: string): Promise<DisableUserResponseDto> {
    try { return DisableUserResponseDto.fromDomain(await this.disableUserUseCase.execute(id)); }
    catch (error: unknown) { if (error instanceof InvalidUserIdError) throw new BadRequestException(error.message); if (error instanceof UserNotFoundError) throw new NotFoundException(error.message); throw error; }
  }
}
