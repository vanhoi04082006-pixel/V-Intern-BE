import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import type { TemplateDefinitionDto } from './template.dto';

const text = (max: number) => z.string().trim().min(1).max(max);
const safePath = z.string().min(1).max(160).refine(path => {
  if (!/^[a-zA-Z0-9._/-]+$/.test(path) || path.startsWith('/') || path.split('/').length > 8) return false;
  return path.split('/').every(part => part && part !== '.' && part !== '..' && !part.endsWith('.')
    && !['.git', '.hg', '.svn', '.github', 'node_modules', '.env', '.npmrc'].includes(part.toLowerCase())
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}, 'Use a safe relative POSIX file path.');
const file = z.object({ path: safePath, content: z.string().max(20000) }).strict();
export const smallProjectPackageSchema = z.object({
  schemaVersion: z.literal(1), prerequisites: z.array(text(256)).min(1).max(12), setup: text(3000), run: text(3000),
  starterFiles: z.array(file).min(1).max(30), sampleData: z.array(file).max(8).optional(),
}).strict();
export const templateAssessmentSchema = z.object({
  schemaVersion: z.literal(1), solutionFiles: z.array(file).min(1).max(30), hiddenTestFiles: z.array(file).min(1).max(30),
  rubric: z.array(z.object({ criterion: text(128), description: text(1000), weight: z.number().int().min(1).max(100) }).strict()).min(1).max(20),
  taskSuites: z.array(z.object({ taskKey: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/), suiteId: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,99}$/), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1).max(60),
}).strict();
export type SmallProjectPackage = z.infer<typeof smallProjectPackageSchema>;
export type TemplateAssessment = z.infer<typeof templateAssessmentSchema>;
function invalid(message: string): never { throw new BadRequestException({ code: 'INVALID_TEMPLATE_PACKAGE', message }); }
function validateFiles(files: Array<{ path: string; content: string }>, budget: number) {
  const names = files.map(file => file.path.toLowerCase()), paths = new Set(names);
  if (paths.size !== names.length) invalid('File paths must be unique.');
  for (const name of names) {
    const parents = name.split('/'); parents.pop();
    while (parents.length) { if (paths.has(parents.join('/'))) invalid('A file cannot shadow a directory.'); parents.pop(); }
  }
  if (Buffer.byteLength(JSON.stringify(files), 'utf8') > budget) invalid('Package file content exceeds its byte budget.');
}
export function publicTemplateDefinition<T extends object>(input: T): Omit<T, 'assessment'> {
  const publicPart = { ...input } as T & { assessment?: unknown };
  delete publicPart.assessment;
  return publicPart;
}
/** This is also the import/seed boundary. File contents are data: no extraction or execution here. */
export function validateTemplateContent(definition: Omit<TemplateDefinitionDto, 'learningPackage'> & { learningPackage?: unknown }, assessment?: unknown): void {
  const tasks = definition.sprints.flatMap(sprint => sprint.tasks), keys = tasks.map(task => task.key);
  if (definition.learningPackage !== undefined) {
    const parsed = smallProjectPackageSchema.safeParse(definition.learningPackage);
    if (!parsed.success) invalid('Small project package v1 has invalid or unsupported fields.');
    const duration = definition.sprints.reduce((sum, sprint) => sum + sprint.durationDays, 0);
    if (definition.sprints.length > 2 || duration < 3 || duration > 7 || tasks.length < 3 || tasks.length > 6 || keys.some(key => !key || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(key)) || new Set(keys).size !== keys.length) invalid('A small project needs 1–2 Sprints, 3–6 tasks with canonical keys and 3–7 days.');
    validateFiles([...parsed.data.starterFiles, ...(parsed.data.sampleData ?? [])], 128000);
  }
  if (assessment !== undefined && assessment !== null) {
    const parsed = templateAssessmentSchema.safeParse(assessment);
    if (!parsed.success) invalid('Assessment v1 has invalid or unsupported fields.');
    if (parsed.data.rubric.reduce((sum, row) => sum + row.weight, 0) !== 100) invalid('Rubric weights must total 100.');
    const mapped = new Set<string>();
    for (const suite of parsed.data.taskSuites) {
      if (!keys.includes(suite.taskKey) || mapped.has(suite.taskKey)) invalid('Each suite must map to one distinct existing task key.');
      mapped.add(suite.taskKey);
    }
    validateFiles([...parsed.data.solutionFiles, ...parsed.data.hiddenTestFiles], 256000);
  }
}
