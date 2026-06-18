import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { TotpService } from './totp.service';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshTokenStore } from './refresh-token.store';
import { PgRefreshTokenStore } from './refresh-token.pg-store';
import { UserStore } from './user.store';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    TotpService,
    RefreshTokenService,
    UserStore,
    { provide: RefreshTokenStore, useClass: PgRefreshTokenStore },
    // Authenticate every route by default; opt out per-route with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [TokenService, AuthService],
})
export class AuthModule {}
