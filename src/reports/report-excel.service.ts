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
    const details = report.snapshot.details;
    if (details) {
      info.addRows([['Mức cảnh báo',details.summary.risk],['Căn cứ',details.summary.reasons.join(' ')],['Sprint lọc',report.snapshot.scope.sprintId??'Tất cả'],['Sinh viên lọc',report.snapshot.scope.studentId??'Tất cả']]);
      const tasks=workbook.addWorksheet('Task và review',{views:[{state:'frozen',ySplit:1}]});
      tasks.columns=[{header:'Mã',key:'code',width:24},{header:'Task',key:'title',width:50},{header:'Người phụ trách',key:'assigneeName',width:28},{header:'Sprint',key:'sprintName',width:28},{header:'Trạng thái',key:'status',width:18},{header:'Chờ phụ thuộc',key:'blocked',width:20},{header:'Hạn',key:'dueDate',width:26},{header:'Bài nộp',key:'submissionStatus',width:22},{header:'AI status',key:'aiStatus',width:22},{header:'AI score',key:'aiScore',width:14},{header:'Giảng viên',key:'instructorScore',width:14}];
      for(const task of details.tasks) tasks.addRow({...task,assigneeName:task.assigneeName??'Chưa phân công',blocked:task.blocked?'Có':'Không',dueDate:task.dueDate?new Date(task.dueDate).toISOString():''});
      const sprintSheet=workbook.addWorksheet('Sprint');
      sprintSheet.columns=[{header:'Sprint',key:'name',width:40},{header:'Trạng thái',key:'status',width:18},{header:'Tổng task',key:'total',width:14},{header:'Hoàn thành',key:'completed',width:14},{header:'Trễ',key:'overdue',width:14},{header:'Chờ',key:'blocked',width:14}];
      details.sprints.forEach(sprint=>sprintSheet.addRow(sprint));
      const timeline=workbook.addWorksheet('Lịch sử');
      timeline.columns=[{header:'Task',key:'taskCode',width:30},{header:'Trạng thái',key:'toStatus',width:20},{header:'Thời điểm UTC',key:'createdAt',width:28}];
      details.timeline.forEach(event=>timeline.addRow({...event,createdAt:new Date(event.createdAt).toISOString()}));
      for(const page of [tasks,sprintSheet,timeline]) {page.getRow(1).font={bold:true};page.eachRow(row=>{row.alignment={vertical:'top',wrapText:true};});}
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
