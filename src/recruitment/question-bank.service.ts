import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { PermissionsService } from '../rbac/permissions.service';
import { QuestionBankQueryDto, QuestionContentDto, UpdateQuestionDto } from './question-bank.dto';
interface QuestionRow { id: string; roleCode: string; category: string; difficulty: string; prompt: string; rubricJson: string; isActive: boolean; sortOrder: number; version: number; updatedAt: Date }
function view(row: QuestionRow) {
  const rubric = JSON.parse(row.rubricJson) as Record<string, unknown>;
  const texts = (value: unknown): string[] => Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string') : [];
  return { id: row.id.toLowerCase(), roleCode: row.roleCode, phase: row.category === 'technical' ? 'technical' : rubric.phase === 'introduction' || rubric.phase === 'english' ? rubric.phase : 'communication',
    difficulty: row.difficulty, prompt: row.prompt, language: rubric.language === 'en' ? 'en' : 'vi',
    expectedConcepts: texts(rubric.expectedConcepts ?? rubric.keywords), exampleAnswer: String(rubric.exampleAnswer ?? rubric.expected ?? ''), scoringRubric: String(rubric.scoringRubric ?? rubric.scoringGuide ?? ''),
    followUpHints: texts(rubric.followUpHints), tags: texts(rubric.tags), isActive: row.isActive, sortOrder: row.sortOrder, version: row.version, updatedAt: row.updatedAt };
}
@Injectable()
export class QuestionBankService {
  constructor(private readonly db: DataSource, private readonly permissions: PermissionsService) {}
  private async authorize(actor: string) { if (!await this.permissions.hasRole(actor, 'admin')) throw new ForbiddenException('Question bank is restricted to administrators.'); }
  async list(actor: string, q: QuestionBankQueryDto) {
    await this.authorize(actor);
    const params = [q.roleCode ?? null, q.phase ?? null, q.difficulty ?? null, q.status ? q.status === 'active' ? 1 : 0 : null, q.search?.trim() ? `%${q.search.trim()}%` : null, (q.page - 1) * q.pageSize, q.pageSize];
    const where = `WHERE (@0 IS NULL OR roleCode=@0) AND (@1 IS NULL OR CASE WHEN category='technical' THEN 'technical' WHEN JSON_VALUE(rubricJson,'$.phase') IN ('introduction','english') THEN JSON_VALUE(rubricJson,'$.phase') ELSE 'communication' END=@1)
      AND (@2 IS NULL OR difficulty=@2) AND (@3 IS NULL OR isActive=@3) AND (@4 IS NULL OR prompt LIKE @4)`;
    const [rows, count, coverage]: [QuestionRow[], Array<{ total: number }>, Array<{ roleCode: string; phase: string; count: number }>] = await Promise.all([
      this.db.query(`SELECT * FROM interview_questions ${where} ORDER BY roleCode,sortOrder,id OFFSET @5 ROWS FETCH NEXT @6 ROWS ONLY`, params),
      this.db.query(`SELECT COUNT(*) total FROM interview_questions ${where}`, params),
      this.db.query("SELECT roleCode,CASE WHEN category='technical' THEN 'technical' WHEN JSON_VALUE(rubricJson,'$.phase') IN ('introduction','english') THEN JSON_VALUE(rubricJson,'$.phase') ELSE 'communication' END phase,COUNT(*) count FROM interview_questions WHERE isActive=1 GROUP BY roleCode,CASE WHEN category='technical' THEN 'technical' WHEN JSON_VALUE(rubricJson,'$.phase') IN ('introduction','english') THEN JSON_VALUE(rubricJson,'$.phase') ELSE 'communication' END"),
    ]);
    return { items: rows.map(view), total: Number(count[0]?.total ?? 0), page: q.page, pageSize: q.pageSize, coverage };
  }
  async get(actor: string, id: string) { await this.authorize(actor); const [row]: QuestionRow[] = await this.db.query('SELECT * FROM interview_questions WHERE id=@0', [id]); if (!row) throw new NotFoundException('Question not found.'); return view(row); }
  private async audit(em: EntityManager, actor: string, id: string, action: string, version: number) {
    // No answer/rubric text in generic audit logs.
    await em.insert(AuditLog, { actorId: actor, action, targetType: 'interview_question', targetId: id, detail: JSON.stringify({ version }), ip: null, userAgent: null });
  }
  async save(actor: string, input: QuestionContentDto | UpdateQuestionDto, id?: string) {
    await this.authorize(actor);
    if ([input.prompt, input.exampleAnswer, input.scoringRubric].some(value => value.trim().length < 10) || input.followUpHints.some(hint => hint.trim().length < 5)) throw new BadRequestException('Question guidance must contain meaningful text.');
    if (input.phase === 'english' && input.language !== 'en') throw new BadRequestException('English questions must use language en.');
    const questionId = id ?? randomUUID();
    await this.db.transaction(async em => {
      // Serialize administrator edits/order allocation. Student interview snapshots are separate rows.
      await em.query("SELECT id FROM roles WITH(UPDLOCK,HOLDLOCK) WHERE code='admin'");
      const [current]: QuestionRow[] = id ? await em.query('SELECT * FROM interview_questions WITH(UPDLOCK,HOLDLOCK) WHERE id=@0', [id]) : [];
      if (id && !current) throw new NotFoundException('Question not found.');
      if (current && current.version !== (input as UpdateQuestionDto).version) throw new ConflictException({ code: 'QUESTION_VERSION_CONFLICT', message: 'Câu hỏi đã thay đổi. Hãy tải lại trước khi lưu.' });
      if (current && current.roleCode !== input.roleCode) throw new BadRequestException('Question role is immutable; create a new question for another role.');
      const rubric = { ...(current ? JSON.parse(current.rubricJson) as object : {}), phase: input.phase, language: input.language, expected: input.exampleAnswer, keywords: input.expectedConcepts, scoringGuide: input.scoringRubric, expectedConcepts: input.expectedConcepts, exampleAnswer: input.exampleAnswer, scoringRubric: input.scoringRubric, followUpHints: input.followUpHints, tags: input.tags };
      if (current) {
        await em.query('UPDATE interview_questions SET roleCode=@1,category=@2,difficulty=@3,prompt=@4,rubricJson=@5,isActive=@6,version=version+1,updatedAt=SYSUTCDATETIME() WHERE id=@0', [questionId, input.roleCode, input.phase === 'technical' ? 'technical' : 'soft', input.difficulty, input.prompt.trim(), JSON.stringify(rubric), input.isActive]);
      } else {
        const [order]: Array<{ next: number }> = await em.query('SELECT CASE WHEN COALESCE(MAX(sortOrder),0)<1000 THEN 1000 ELSE MAX(sortOrder)+1 END next FROM interview_questions WHERE roleCode=@0', [input.roleCode]);
        await em.query('INSERT INTO interview_questions(id,roleCode,category,difficulty,prompt,rubricJson,isActive,sortOrder) VALUES(@0,@1,@2,@3,@4,@5,@6,@7)', [questionId, input.roleCode, input.phase === 'technical' ? 'technical' : 'soft', input.difficulty, input.prompt.trim(), JSON.stringify(rubric), input.isActive, order.next]);
      }
      await this.audit(em, actor, questionId, current ? 'question.updated' : 'question.created', (current?.version ?? 0) + 1);
    });
    return this.get(actor, questionId);
  }
  async retire(actor: string, id: string, version: number) {
    await this.authorize(actor);
    await this.db.transaction(async em => {
      const [current]: QuestionRow[] = await em.query('SELECT * FROM interview_questions WITH(UPDLOCK,HOLDLOCK) WHERE id=@0', [id]);
      if (!current) throw new NotFoundException('Question not found.');
      if (current.version !== version) throw new ConflictException({ code: 'QUESTION_VERSION_CONFLICT', message: 'Câu hỏi đã thay đổi. Hãy tải lại.' });
      await em.query('UPDATE interview_questions SET isActive=0,version=version+1,updatedAt=SYSUTCDATETIME() WHERE id=@0', [id]);
      await this.audit(em, actor, id, 'question.retired', version + 1);
    });
    return this.get(actor, id);
  }
}
