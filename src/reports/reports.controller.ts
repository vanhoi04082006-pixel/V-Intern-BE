import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { clientIp, userAgent } from '../common/types/request-info';
import { CreateReportDto, ReportQueryDto } from './report.dto';
import { ReportsService } from './reports.service';
import { ReportPdfService } from './report-pdf.service';
import { ReportExcelService } from './report-excel.service';
@Controller('reports') @ApiTags('reports') @ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reports:ReportsService,private readonly pdf:ReportPdfService,private readonly excel:ReportExcelService){}
  @Get() @RequirePermissions('performance.view')
  list(@CurrentUser('userId') userId:string,@Query() query:ReportQueryDto){return this.reports.list(userId,query);}
  @Post() @RequirePermissions('performance.view')
  create(@Body() input:CreateReportDto,@CurrentUser('userId') actorId:string,@Req() req:Request){return this.reports.create(input,{actorId,ip:clientIp(req),userAgent:userAgent(req)});}
  @Get(':id') @RequirePermissions('performance.view')
  get(@Param('id',ParseUUIDPipe) id:string,@CurrentUser('userId') userId:string){return this.reports.get(id,userId);}
  @Get(':id/pdf') @RequirePermissions('performance.view')
  async download(@Param('id',ParseUUIDPipe) id:string,@CurrentUser('userId') userId:string,@Res() res:Response){
    const report=await this.reports.get(id,userId),buffer=await this.pdf.render(report);
    res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="v-intern-report-${report.id}.pdf"`);res.end(buffer);
  }
  @Get(':id/xlsx') @RequirePermissions('performance.view')
  async downloadExcel(@Param('id',ParseUUIDPipe) id:string,@CurrentUser('userId') userId:string,@Res() res:Response){
    const report=await this.reports.get(id,userId),buffer=await this.excel.render(report);
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="v-intern-report-${report.id}.xlsx"`);res.end(buffer);
  }
}
