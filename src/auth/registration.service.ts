import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Role } from '../rbac/entities/role.entity';
import { UserRole } from '../rbac/entities/user-role.entity';
import { RecruitmentProfile } from '../recruitment/entities/recruitment-profile.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { notifyInTransaction } from '../common/utils/notify';
import { isUniqueViolation } from '../common/utils/db-errors';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class RegistrationService {
  constructor(private readonly db: DataSource, private readonly config: ConfigService) {}
  async register(dto: RegisterDto, ip: string | null, userAgent: string | null): Promise<{ registered: true }> {
    if (this.config.get('AUTH_PUBLIC_REGISTRATION', 'true') !== 'true') throw new ForbiddenException({ code: 'REGISTRATION_CLOSED', message: 'Public registration is currently closed.' });
    if (Buffer.byteLength(dto.password, 'utf8') > 72) throw new BadRequestException({ code: 'INVALID_PASSWORD', message: 'Password exceeds the supported UTF-8 byte length.' });
    const passwordHash = await hash(dto.password, 10);
    try {
      await this.db.transaction(async em => {
        const role = await em.getRepository(Role).findOneBy({ code: 'intern' });
        if (!role) throw new ServiceUnavailableException({ code: 'REGISTRATION_UNAVAILABLE', message: 'Registration is not configured.' });
        const user = await em.getRepository(User).save({ email: dto.email.trim().toLowerCase(), username: `intern_${randomUUID()}`, displayName: dto.fullName.trim(), passwordHash, status: 'active' });
        await em.getRepository(UserRole).insert({ userId: user.id, roleId: role.id });
        await em.getRepository(RecruitmentProfile).save({ userId: user.id, selectedRole: null, status: 'not_started', attemptCount: 0 });
        await em.getRepository(AuditLog).insert({ actorId: user.id, action: 'auth.register', targetType: 'user', targetId: user.id, detail: JSON.stringify({ role: 'intern', acceptedTerms: dto.acceptedTerms }), ip, userAgent });
        await notifyInTransaction(em, [user.id], { category: 'system', type: 'system.welcome', title: 'Chào mừng đến V-Intern', body: 'Hãy chọn vai trò và hoàn thành phỏng vấn để bắt đầu chương trình.', linkUrl: '/intern' });
      });
      return { registered: true };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException({ code: 'REGISTRATION_CONFLICT', message: 'An account with this email already exists.' });
      throw error;
    }
  }
}
