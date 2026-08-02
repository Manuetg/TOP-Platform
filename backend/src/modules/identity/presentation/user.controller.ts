import { BadRequestException, Body, ConflictException, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateUserUseCase, InvalidUserInputError, UserAlreadyExistsError } from '../application/create-user.use-case';
import { CreateUserRequestDto } from './dto/create-user.request.dto';
import { UserResponseDto } from './dto/user.response.dto';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly createUserUseCase: CreateUserUseCase) {}
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
}
