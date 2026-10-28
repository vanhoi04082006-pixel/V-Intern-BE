import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { validateBlueprint } from './blueprint-validation';
import { LEARNING_LIBRARY } from './learning-library';
import { MINI_PROJECT_LIBRARY } from './mini-project-catalog';
import { validateTemplateContent } from './template-package';
import { CreateTemplateDto } from './template.dto';

describe('six bounded mini-project packages', () => {
  it('provides six distinct additive templates without changing the old 14-day library', async () => {
    expect(MINI_PROJECT_LIBRARY).toHaveLength(6);
    const codes = MINI_PROJECT_LIBRARY.map(template => template.code);
    expect(new Set(codes).size).toBe(6);
    expect(codes.every(code => code?.startsWith('MINI-'))).toBe(true);
    expect(LEARNING_LIBRARY.every(template => !codes.includes(template.code) && template.estimatedDurationDays === 14)).toBe(true);
    for (const template of MINI_PROJECT_LIBRARY) {
      expect(await validate(plainToInstance(CreateTemplateDto, template))).toEqual([]);
      expect(() => validateBlueprint(template)).not.toThrow();
      expect(() => validateTemplateContent(template)).not.toThrow();
      expect(template.assessment).toBeUndefined();
      expect(template.learningPackage?.starterFiles.map(file => file.path)).toEqual(expect.arrayContaining(['README.md', 'package.json', 'demo.cjs', 'src/model.cjs', 'test/acceptance.test.cjs']));
      expect(template.learningPackage?.sampleData).toHaveLength(1);
      expect(template.documentation).toContain('P03');
      expect(template.scopeOut).toEqual(expect.arrayContaining(['Đăng nhập và phân quyền', 'Thanh toán hoặc email thật']));
      for (const task of template.sprints.flatMap(sprint => sprint.tasks)) {
        expect(task.expectedOutput?.length).toBeGreaterThan(20);
        expect(task.dod.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
