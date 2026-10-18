import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegistrationService } from './registration.service';
import { RefreshToken } from './entities/refresh-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken]),
    UsersModule,
    RbacModule,
    AuditModule,
    JwtModule.registerAsync({
      global: true, // JwtAuthGuard (APP_GUARD) resolves JwtService from anywhere
      inject: [ConfigService],
      useFactory: (cs: ConfigService) => {
        type JwtExpiresIn = number | `${number}` | `${number}s` | `${number}m` | `${number}h` | `${number}d`;
        const expiresIn = (cs.get<string>('JWT_EXPIRES_IN', '15m') ?? '15m') as JwtExpiresIn;
        return { secret: cs.get<string>('JWT_SECRET'), signOptions: { expiresIn } };
      },
    }),
    ConfigModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, RegistrationService],
  exports: [AuthService],
})
export class AuthModule {}
