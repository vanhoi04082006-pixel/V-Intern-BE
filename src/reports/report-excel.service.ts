import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { ReportsService } from './reports.service';
@Injectable()
export class ReportExcelService {
  async render(report:Awaited<ReturnType<ReportsService['get']>>):Promise<Buffer>{
    const workbook=new Workbook();workbook.creator='V-Intern';workbook.created=new Date(report.createdAt);
    const info=workbook.addWorksheet('Thông tin');info.columns=[{width:28},{width:72}];
    info.addRows([['Báo cáo',report.title],['Dự án',report.snapshot.projectName],['Thời điểm',new Date(report.createdAt).toISOString()],['Từ ngày',report.snapshot.scope.from??'Không giới hạn'],['Đến (không gồm)',report.snapshot.scope.to??'Không giới hạn'],['Mã',report.id]]);
    const sheet=workbook.addWorksheet('Hiệu suất',{views:[{state:'frozen',ySplit:1}],pageSetup:{orientation:'landscape',fitToPage:true}});
    sheet.columns=[{header:'Thành viên',key:'name',width:30},{header:'Task',key:'totalTaskCount',width:12},{header:'Hoàn thành',key:'completedTaskCount',width:14},{header:'Tỷ lệ (%)',key:'taskCompletionRate',width:14},{header:'Điểm đã chốt',key:'averageEvaluationScore',width:16},{header:'Quá hạn',key:'overdueOpenTaskCount',width:12},{header:'Bài nộp',key:'submissionCount',width:12},{header:'Đã duyệt',key:'approvedCount',width:12},{header:'Làm lại',key:'reworkCount',width:12}];
    for(const m of report.snapshot.members)sheet.addRow({...m,name:m.displayName??m.userId});
    sheet.getRow(1).eachCell(cell=>{cell.font={name:'Arial',bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1468FF'}};});
    sheet.autoFilter={from:{row:1,column:1},to:{row:sheet.rowCount,column:9}};
    sheet.eachRow((row,index)=>{row.height=index===1?26:22;if(index>1)row.eachCell(cell=>{cell.font={name:'Arial',size:11};if(index%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF2F7FF'}};});});
    // Assign plain string values only; never construct formula objects from names/titles.
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
