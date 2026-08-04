import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, HttpStatus, Post, UnauthorizedException } from '@nestjs/common';
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { InvalidCredentialsError, InvalidLoginInputError, LoginUseCase, UserDisabledError } from '../application/login.use-case';
import { InvalidRefreshTokenError, InvalidRefreshTokenInputError, RefreshTokenUseCase, RefreshUserDisabledError } from '../application/refresh-token.use-case';
import { LoginRequestDto } from './dto/login.request.dto';
import { LoginResponseDto } from './dto/login.response.dto';
import { RefreshTokenRequestDto } from './dto/refresh-token.request.dto';
import { RefreshTokenResponseDto } from './dto/refresh-token.response.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly loginUseCase: LoginUseCase, private readonly refreshTokenUseCase: RefreshTokenUseCase) {}

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

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar sesión con refresh token rotatorio' })
  @ApiOkResponse({ type: RefreshTokenResponseDto })
  @ApiBadRequestResponse({ description: 'Refresh token inválido.' })
  @ApiUnauthorizedResponse({ description: 'La sesión no es válida.' })
  @ApiForbiddenResponse({ description: 'Usuario deshabilitado.' })
  async refresh(@Body() request: RefreshTokenRequestDto): Promise<RefreshTokenResponseDto> {
    try {
      return await this.refreshTokenUseCase.execute(request.refreshToken);
    } catch (error: unknown) {
      if (error instanceof InvalidRefreshTokenInputError) throw new BadRequestException(error.message);
      if (error instanceof InvalidRefreshTokenError) throw new UnauthorizedException(error.message);
      if (error instanceof RefreshUserDisabledError) throw new ForbiddenException(error.message);
      throw error;
    }
  }
}
