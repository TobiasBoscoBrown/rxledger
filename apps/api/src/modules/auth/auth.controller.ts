import { Body, Controller, HttpCode, Ip, Post, UseGuards } from '@nestjs/common';
import {
  loginSchema,
  registerSchema,
  refreshSchema,
  mfaEnrollVerifySchema,
  type LoginInput,
  type RegisterInput,
  type RefreshInput,
} from '@rxledger/contracts';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { Public, CurrentUser } from '../../common/decorators/auth.decorators';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterInput, @Ip() ip: string) {
    return this.auth.register(body, ip);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput, @Ip() ip: string) {
    return this.auth.login(body, ip);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput) {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput) {
    await this.auth.logout(body.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/enroll')
  enrollMfa(@CurrentUser() user: AuthUser) {
    return this.auth.beginMfaEnrollment(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/confirm')
  @HttpCode(204)
  async confirmMfa(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(mfaEnrollVerifySchema)) body: { totp: string },
  ) {
    await this.auth.confirmMfaEnrollment(user.id, body.totp);
  }
}
