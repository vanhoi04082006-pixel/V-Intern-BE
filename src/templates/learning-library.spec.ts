import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateTemplateDto } from "./template.dto";
import { LEARNING_LIBRARY } from "./learning-library";

describe("complete small learning blueprints", () => {
  it("provides distinct valid templates covering a complete delivery cycle", async () => {
    expect(LEARNING_LIBRARY.length).toBeGreaterThanOrEqual(6);
    expect(new Set(LEARNING_LIBRARY.map((t) => t.code)).size).toBe(
      LEARNING_LIBRARY.length,
    );
    for (const template of LEARNING_LIBRARY) {
      expect(
        await validate(plainToInstance(CreateTemplateDto, template)),
      ).toEqual([]);
      expect(template.objectives?.learning?.length).toBeGreaterThan(0);
      expect(template.expectedOutputs?.deliverables?.length).toBeGreaterThan(0);
      expect(template.acceptance?.qualityGates?.length).toBeGreaterThan(0);
      expect(template.architecture?.entities.length).toBeGreaterThan(0);
      expect(template.architecture?.frontendPages.length).toBeGreaterThan(0);
      expect(template.businessRules?.length).toBeGreaterThan(0);
      expect(template.milestones?.length).toBe(2);
      expect(template.roleDetails?.map((r) => r.code)).toEqual(template.roles);
      expect(template.sprints.reduce((n, s) => n + s.durationDays, 0)).toBe(14);
      for (const role of template.roles) {
        const tasks = template.sprints
          .flatMap((s) => s.tasks)
          .filter((t) => t.role === role);
        expect(tasks.length).toBeGreaterThanOrEqual(2);
        expect(tasks.every((t) => t.dod.length > 0)).toBe(true);
      }
    }
  });
});
