import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { clientIp, userAgent } from '../common/types/request-info';
import { PermissionsService } from '../rbac/permissions.service';
import { IssueCertificateDto, RevokeCertificateDto } from './dto/certificate.dtos';
import { CertificatesService } from './certificates.service';

@ApiTags('certificates')
@ApiBearerAuth()
@Controller('certificates')
export class CertificatesController {
  constructor(
    private readonly certificatesService: CertificatesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private ctx(req: Request, actorId: string) {
    return { actorId, ip: clientIp(req), userAgent: userAgent(req) };
  }

  @Get()
  @RequirePermissions('certificates.view')
  @ApiOperation({ summary: 'Certificate list (certificates.view; filters userId/status + pagination)' })
  async list(@Query() query: PaginationQueryDto & { userId?: string; status?: string }) {
    return this.certificatesService.list({
      page: query.page,
      pageSize: query.pageSize,
      userId: query.userId,
      status: query.status,
    });
  }

  @Post('issue')
  @RequirePermissions('certificates.manage')
  @ApiOperation({
    summary:
      'Issue a certificate (admin): deterministic V-INTERN-COMPLETE v1 eligibility (recruitment passed + completed assignment + finalized evaluation >= 70 + finalized KPI >= 70); ineligible → 409 CERTIFICATE_NOT_ELIGIBLE with structured reasons; duplicate → 409; number from the SEQUENCE (spec 42/46/49)',
  })
  async issue(@Body() dto: IssueCertificateDto, @CurrentUser('userId') userId: string, @Req() req: Request) {
    return this.certificatesService.issue(dto, userId, this.ctx(req, userId));
  }

  @Get('verify/:code')
  @Public()
  @ApiOperation({
    summary:
      'PUBLIC verification (no auth, spec 47/48): issued → { valid: true, certificateNumber, holderName, role, projectName, issuedAt }; revoked → { valid: false, status: revoked, revokedAt }; unknown code → 404. NEVER exposes email/userId/evaluation/KPI internals',
  })
  async verify(@Param('code') code: string) {
    const result = await this.certificatesService.verifyByCode(code);
    if (!result) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'CERTIFICATE_VERIFICATION_NOT_FOUND',
        message: 'No certificate matches this verification code.',
      });
    }
    return result;
  }

  @Get(':id')
  @RequirePermissions('certificates.view')
  @ApiOperation({ summary: 'One certificate (certificates.view)' })
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.certificatesService.getById(id);
  }

  @Post(':id/revoke')
  @RequirePermissions('certificates.manage')
  @ApiOperation({
    summary:
      'REVOKE (admin, spec 50): requires a reason, preserves the record with revoke metadata, notifies the intern, writes audit + activity; second revoke → 409 CERTIFICATE_ALREADY_REVOKED',
  })
  async revoke(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RevokeCertificateDto, @CurrentUser('userId') userId: string, @Req() req: Request) {
    return this.certificatesService.revoke(id, dto.reason, userId, this.ctx(req, userId));
  }

  @Get(':id/pdf')
  @RequirePermissions('certificates.view')
  @ApiOperation({
    summary:
      'REAL server-side PDF (spec 51-53): deterministic pdfkit document (Vietnamese-safe DejaVu), certificate number + verification code + verify URL; ISSUED certificates only — revoked → 409 (verify endpoint communicates revocation)',
  })
  async pdfAdmin(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('userId') userId: string, @Res() res: Response) {
    const isAdmin = await this.permissionsService.hasRole(userId, 'admin');
    const { buffer, certificate } = await this.certificatesService.renderPdf(id, { userId, isAdmin });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${certificate.certificateNumber}.pdf"`);
    res.end(buffer);
  }
}

@ApiTags('intern')
@ApiBearerAuth()
@Controller('intern/me/certificates')
export class CertificateInternController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get()
  @RequirePermissions('certificates.view.own')
  @ApiOperation({ summary: 'My certificates (identity = principal)' })
  async myCertificates(@CurrentUser('userId') userId: string) {
    return { items: await this.certificatesService.internList(userId) };
  }

  @Get(':id')
  @RequirePermissions('certificates.view.own')
  @ApiOperation({ summary: 'One of my certificates (404-safe for foreign rows)' })
  async myCertificate(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.certificatesService.internGet(userId, id);
  }

  @Get(':id/pdf')
  @RequirePermissions('certificates.view.own')
  @ApiOperation({ summary: 'Download MY certificate PDF (issued only; revoked → 409)' })
  async myCertificatePdf(@CurrentUser('userId') userId: string, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { buffer, certificate } = await this.certificatesService.renderPdf(id, {
      userId,
      isAdmin: false,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${certificate.certificateNumber}.pdf"`);
    res.end(buffer);
  }
}
