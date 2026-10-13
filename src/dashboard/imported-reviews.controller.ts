import { Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { IsIn, IsInt, IsNumber, IsString, Length, Max, Min } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PermissionsService } from '../rbac/permissions.service';
import { clientIp, userAgent } from '../common/types/request-info';

class UpdateImportedReviewDto {
  @IsNumber({maxDecimalPlaces:1}) @Min(0) @Max(100) score!: number;
  @IsIn(['passed','needs_review','failed']) status!: string;
  @IsString() @Length(0,4000) feedback!: string;
  @IsInt() @Min(1) version!: number;
}
const scope = `projectId IN (SELECT p.id FROM projects p WHERE p.archivedAt IS NULL AND
  (@1=1 OR p.mentorId=@0 OR EXISTS(SELECT 1 FROM assignments a JOIN internship_sessions s ON s.id=a.sessionId
  WHERE a.projectId=p.id AND (s.leadInstructorId=@0 OR EXISTS(SELECT 1 FROM session_instructors si WHERE si.sessionId=s.id AND si.instructorId=@0)))))`;

@ApiTags('imported-reviews') @ApiBearerAuth()
@Controller('imported-reviews')
export class ImportedReviewsController {
  constructor(private readonly db:DataSource,private readonly permissions:PermissionsService){}
  @Get() @RequirePermissions('evaluations.view')
  async list(@CurrentUser('userId') actor:string){
    const admin=await this.permissions.hasRole(actor,'admin');
    return {items:await this.db.query(`SELECT r.*,u.displayName,p.name projectName FROM imported_reviews r JOIN users u ON u.id=r.studentId JOIN projects p ON p.id=r.projectId WHERE ${scope} ORDER BY r.occurredAt DESC,r.prNumber DESC`,[actor,admin?1:0])};
  }
  @Patch(':id') @RequirePermissions('evaluations.manage')
  async update(@Param('id',ParseUUIDPipe)id:string,@Body()dto:UpdateImportedReviewDto,@CurrentUser('userId')actor:string,@Req()req:Request){
    const admin=await this.permissions.hasRole(actor,'admin');
    return this.db.transaction(async em=>{
      const rows=await em.query(`SELECT * FROM imported_reviews WITH(UPDLOCK,ROWLOCK) WHERE ${scope} AND id=@2`,[actor,admin?1:0,id]);
      if(!rows.length)throw new NotFoundException('Review record not found.');
      const before=rows[0];
      if(before.version!==dto.version)throw new ConflictException('Review record changed. Reload before saving.');
      await em.query('UPDATE imported_reviews SET score=@1,status=@2,feedback=@3,version=version+1,updatedAt=SYSUTCDATETIME() WHERE id=@0',[id,dto.score,dto.status,dto.feedback]);
      await em.query(`INSERT INTO audit_logs(actorId,action,targetType,targetId,detail,ip,userAgent) VALUES(@0,N'imported_review.updated',N'imported_review',@1,@2,@3,@4)`,[actor,id,JSON.stringify({before,after:dto,source:'user_approved_image_sample'}),clientIp(req),userAgent(req)]);
      return {id,version:dto.version+1};
    });
  }
}
