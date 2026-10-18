import { Module } from '@nestjs/common';
import { PerformanceModule } from '../performance/performance.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditModule } from '../audit/audit.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportPdfService } from './report-pdf.service';
import { ReportExcelService } from './report-excel.service';
import { ReportFactsService } from './report-facts.service';
@Module({imports:[PerformanceModule,RbacModule,AuditModule],controllers:[ReportsController],providers:[ReportsService,ReportPdfService,ReportExcelService,ReportFactsService]})
export class ReportsModule {}
