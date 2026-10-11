import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { CERTIFICATE_FONTS } from '../certificates/certificate-pdf.service';
import { ReportsService } from './reports.service';
export const REPORT_LABELS = {progress:'Tiến độ',performance:'Hiệu suất',evaluation:'Đánh giá',review:'Review PR',risk:'Cảnh báo'};
@Injectable()
export class ReportPdfService {
  async render(report: Awaited<ReturnType<ReportsService['get']>>): Promise<Buffer> {
    const doc=new PDFDocument({size:'A4',margin:42,info:{Title:report.title,Author:'V-Intern',CreationDate:new Date(report.createdAt)}});
    const chunks:Buffer[]=[];
    const result=new Promise<Buffer>((resolve,reject)=>{doc.on('data',(b:Buffer)=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
    const text=(value:string,bold=false,size=10)=>doc.font(bold?CERTIFICATE_FONTS.bold:CERTIFICATE_FONTS.regular).fontSize(size).fillColor('#142346').text(value);
    const header=()=>{text('V-INTERN · BÁO CÁO',true,18);doc.moveDown(0.7);};
    header();text(report.title,true,15);doc.moveDown();
    text(`${REPORT_LABELS[report.kind]} · ${report.snapshot.projectName}`);
    text(`Thời điểm chụp số liệu: ${new Date(report.createdAt).toISOString()}`);
    text(`Khoảng lọc [từ, đến): ${report.snapshot.scope.from??'Không giới hạn'} → ${report.snapshot.scope.to??'Không giới hạn'}`);
    text(`Mã báo cáo: ${report.id}`,false,8);doc.moveDown();
    for(const member of report.snapshot.members){
      if(doc.y>670){doc.addPage();header();}
      text(member.displayName??member.userId,true,11);
      text(`Task: ${member.completedTaskCount}/${member.totalTaskCount} · Hoàn thành: ${member.taskCompletionRate===null?'Chưa đo':member.taskCompletionRate+'%'} · Quá hạn: ${member.overdueOpenTaskCount}`);
      text(`Điểm đã chốt: ${member.averageEvaluationScore??'Chưa chấm'} · Bài nộp: ${member.submissionCount} · Duyệt: ${member.approvedCount} · Làm lại: ${member.reworkCount}`);
      doc.moveDown(0.7);
    }
    text('Số liệu được lưu tại thời điểm tạo báo cáo. Điểm đã chốt là kết quả chính thức; không phải điểm AI tự tạo.',false,8);
    doc.end();return result;
  }
}
