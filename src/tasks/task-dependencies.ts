import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/** Published plan references are resolved to task IDs inside the publish transaction. */
export async function assertTaskDependencies(em: EntityManager, task: { id: string; projectId: string }): Promise<void> {
  const tables: Array<{ id: number | null }> = await em.query("SELECT OBJECT_ID(N'dbo.task_specs', N'U') AS id");
  if (!tables[0]?.id) return;
  const specs: Array<{ specJson: string }> = await em.query('SELECT specJson FROM task_specs WHERE taskId=@0', [task.id]);
  if (!specs.length) return;
  const spec = JSON.parse(specs[0].specJson) as { dependencies?: Array<{ taskId: string }> };
  const dependencies = spec.dependencies ?? [];
  if (!dependencies.length) return;
  if (!Array.isArray(dependencies) || dependencies.length > 20 || dependencies.some(d => !d || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.taskId))) throw new ConflictException({ code: 'TASK_DEPENDENCIES_INVALID', message: 'Phụ thuộc của nhiệm vụ cần được giảng viên kiểm tra lại.' });
  const rows: Array<{ id: string; code: string; status: string }> = await em.query(
    `SELECT id,code,status FROM tasks WHERE projectId=@0 AND deletedAt IS NULL AND id IN (${dependencies.map((_, i) => `@${i + 1}`).join(',')})`, [task.projectId, ...dependencies.map(d => d.taskId)]);
  if (rows.length !== new Set(dependencies.map(d => d.taskId.toLowerCase())).size || rows.some(r => r.status !== 'done')) throw new ConflictException({
    code: 'TASK_DEPENDENCIES_PENDING', message: 'Các nhiệm vụ phụ thuộc cần được giảng viên xác nhận hoàn thành trước.',
    details: { blockedBy: rows.filter(r => r.status !== 'done').map(r => r.code) },
  });
}
