import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { clientIp, userAgent } from '../common/types/request-info';
import { AuthService } from './auth.service';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RegistrationService } from './registration.service';
import { AllowTemporaryPassword } from './temporary-password.policy';
import { ChangePasswordDto } from './dto/change-password.dto';
const configuredRegistrationLimit = Number(process.env.THROTTLE_REGISTER_PER_MIN ?? 5);
const registrationLimit = Number.isSafeInteger(configuredRegistrationLimit) && configuredRegistrationLimit > 0 ? configuredRegistrationLimit : 5;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly registration: RegistrationService,
  ) {}

  private cookieOptions(): CookieOptions {
    const isProduction = this.config.get<string>('NODE_ENV', 'development') === 'production';
    const ttlDays = Number(this.config.get<string>('REFRESH_TOKEN_TTL_DAYS', '7'));
    return {
      httpOnly: true, // JS never reads the refresh cookie
      secure: isProduction,
      sameSite: 'lax', // FE localhost:3001 → BE localhost:8080 is same-site
      path: REFRESH_COOKIE_PATH, // cookie only travels to /api/v1/auth/*
      maxAge: ttlDays * 24 * 60 * 60 * 1000,
    };
  }

  @Public()
  @Throttle({ default: { limit: registrationLimit, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Create an intern-only account; login separately to start recruitment' })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.registration.register(dto, clientIp(req), userAgent(req));
  }

  @Public()
  @Throttle({ default: { limit: Number(process.env.THROTTLE_AUTH_PER_MIN ?? 10), ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login → access token + HttpOnly refresh cookie' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, clientIp(req), userAgent(req));
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, this.cookieOptions());
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: Number(process.env.THROTTLE_AUTH_PER_MIN ?? 10), ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate refresh token (family reuse detection)' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'REFRESH_MISSING',
        message: 'No refresh cookie present.',
      });
    }
    const result = await this.authService.refresh(raw, clientIp(req), userAgent(req));
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, this.cookieOptions());
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke refresh token + clear cookie (204)' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    await this.authService.logout(
      typeof raw === 'string' ? raw : null,
      req.principal?.userId ?? null,
      clientIp(req),
      userAgent(req),
    );
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  }

  @Get('me')
  @AllowTemporaryPassword()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fresh principal from DB (roles + permissions)' })
  async me(@CurrentUser('userId') userId: string) {
    return this.authService.me(userId);
  }
  @Post('change-password')
  @AllowTemporaryPassword()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async changePassword(@CurrentUser('userId') userId: string, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.changePassword(userId, dto.currentPassword, dto.newPassword);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH }); return result;
  }
}
