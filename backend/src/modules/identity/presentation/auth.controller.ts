import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, HttpCode, HttpStatus, Post, UnauthorizedException } from '@nestjs/common';
import { ApiBadRequestResponse, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { EmailNotVerifiedError, InvalidCredentialsError, InvalidLoginInputError, LoginUseCase, UserDisabledError } from '../application/login.use-case';
import { InvalidRefreshTokenError, InvalidRefreshTokenInputError, RefreshTokenUseCase, RefreshUserDisabledError } from '../application/refresh-token.use-case';
import { LoginRequestDto } from './dto/login.request.dto';
import { LoginResponseDto } from './dto/login.response.dto';
import { RefreshTokenRequestDto } from './dto/refresh-token.request.dto';
import { RefreshTokenResponseDto } from './dto/refresh-token.response.dto';
import { LogoutUseCase, InvalidLogoutInputError } from '../application/logout.use-case';
import { Public } from '../../../shared/security/security.decorators';
import { ForgotPasswordUseCase, InvalidForgotPasswordInputError } from '../application/forgot-password.use-case';
import { InvalidPasswordResetTokenError, InvalidResetPasswordInputError, ResetPasswordUseCase } from '../application/reset-password.use-case';
import { ForgotPasswordRequestDto } from './dto/forgot-password.request.dto';
import { ForgotPasswordResponseDto } from './dto/forgot-password.response.dto';
import { ResetPasswordRequestDto } from './dto/reset-password.request.dto';
import { ResetPasswordResponseDto } from './dto/reset-password.response.dto';
import { VerifyResetCodeRequestDto } from './dto/verify-reset-code.request.dto';
import { VerifyResetCodeResponseDto } from './dto/verify-reset-code.response.dto';
import { InvalidResetCodeError, VerifyResetCodeUseCase } from '../application/verify-reset-code.use-case';
import { InvalidSignupInputError, SignupEmailConflictError, SignupUseCase } from '../application/signup.use-case';
import { InvalidEmailVerificationTokenError, VerifyEmailUseCase } from '../application/verify-email.use-case';
import { SignupRequestDto } from './dto/signup.request.dto';
import { SignupResponseDto } from './dto/signup.response.dto';
import { VerifyEmailRequestDto } from './dto/verify-email.request.dto';
import { VerifyEmailResponseDto } from './dto/verify-email.response.dto';
import { ResendVerificationUseCase } from '../application/resend-verification.use-case';
import { ResendVerificationRequestDto } from './dto/resend-verification.request.dto';
import { ResendVerificationResponseDto } from './dto/resend-verification.response.dto';

@ApiTags('Authentication')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly loginUseCase: LoginUseCase, private readonly refreshTokenUseCase: RefreshTokenUseCase, private readonly logoutUseCase: LogoutUseCase, private readonly forgotPasswordUseCase: ForgotPasswordUseCase, private readonly resetPasswordUseCase: ResetPasswordUseCase, private readonly verifyResetCodeUseCase: VerifyResetCodeUseCase, private readonly signupUseCase: SignupUseCase, private readonly verifyEmailUseCase: VerifyEmailUseCase, private readonly resendVerificationUseCase: ResendVerificationUseCase) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear cuenta y alojamiento inicial' })
  @ApiOkResponse({ type: SignupResponseDto })
  async signup(@Body() request: SignupRequestDto): Promise<SignupResponseDto> {
    try { return await this.signupUseCase.execute(request); }
    catch (error: unknown) { if (error instanceof InvalidSignupInputError) throw new BadRequestException(error.message); if (error instanceof SignupEmailConflictError) throw new ConflictException({ code: 'EMAIL_ALREADY_REGISTERED', message: error.message }); throw error; }
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar correo electrónico' })
  @ApiOkResponse({ type: VerifyEmailResponseDto })
  async verifyEmail(@Body() request: VerifyEmailRequestDto): Promise<VerifyEmailResponseDto> { try { return await this.verifyEmailUseCase.execute(request.token); } catch (error: unknown) { if (error instanceof InvalidEmailVerificationTokenError) throw new BadRequestException(error.message); throw error; } }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reenviar verificación de correo sin revelar elegibilidad' })
  @ApiOkResponse({ type: ResendVerificationResponseDto })
  async resendVerification(@Body() request: ResendVerificationRequestDto): Promise<ResendVerificationResponseDto> { return this.resendVerificationUseCase.execute(request.email); }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicitar recuperación de contraseña' })
  @ApiOkResponse({ type: ForgotPasswordResponseDto })
  async forgotPassword(@Body() request: ForgotPasswordRequestDto): Promise<ForgotPasswordResponseDto> {
    try { return await this.forgotPasswordUseCase.execute(request); }
    catch (error: unknown) { if (error instanceof InvalidForgotPasswordInputError) throw new BadRequestException(error.message); throw error; }
  }

  @Post('verify-reset-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar código de recuperación' })
  @ApiOkResponse({ type: VerifyResetCodeResponseDto })
  async verifyResetCode(@Body() request: VerifyResetCodeRequestDto): Promise<VerifyResetCodeResponseDto> { try { return await this.verifyResetCodeUseCase.execute(request); } catch (error: unknown) { if (error instanceof InvalidResetCodeError) throw new BadRequestException(error.message); throw error; } }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restablecer contraseña' })
  @ApiOkResponse({ type: ResetPasswordResponseDto })
  async resetPassword(@Body() request: ResetPasswordRequestDto): Promise<ResetPasswordResponseDto> {
    try { await this.resetPasswordUseCase.execute(request); return { message: 'Contraseña restablecida correctamente.' }; }
    catch (error: unknown) { if (error instanceof InvalidResetPasswordInputError) throw new BadRequestException(error.message); if (error instanceof InvalidPasswordResetTokenError) throw new BadRequestException(error.message); throw error; }
  }

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
      if (error instanceof UserDisabledError || error instanceof EmailNotVerifiedError) throw new ForbiddenException(error.message);
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

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar una sesión por refresh token' })
  @ApiBadRequestResponse({ description: 'Refresh token inválido.' })
  async logout(@Body() request: RefreshTokenRequestDto): Promise<void> {
    try {
      await this.logoutUseCase.execute(request.refreshToken);
    } catch (error: unknown) {
      if (error instanceof InvalidLogoutInputError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
