import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, HttpStatus, Post, UnauthorizedException } from '@nestjs/common';
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { InvalidCredentialsError, InvalidLoginInputError, LoginUseCase, UserDisabledError } from '../application/login.use-case';
import { LoginRequestDto } from './dto/login.request.dto';
import { LoginResponseDto } from './dto/login.response.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly loginUseCase: LoginUseCase) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ description: 'Email o contraseña inválidos.' })
  @ApiUnauthorizedResponse({ description: 'Credenciales inválidas.' })
  @ApiForbiddenResponse({ description: 'Usuario deshabilitado.' })
  async login(@Body() request: LoginRequestDto): Promise<LoginResponseDto> {
    try {
      return LoginResponseDto.fromApplication(await this.loginUseCase.execute(request));
    } catch (error: unknown) {
      if (error instanceof InvalidLoginInputError) throw new BadRequestException(error.message);
      if (error instanceof InvalidCredentialsError) throw new UnauthorizedException(error.message);
      if (error instanceof UserDisabledError) throw new ForbiddenException(error.message);
      throw error;
    }
  }
}
