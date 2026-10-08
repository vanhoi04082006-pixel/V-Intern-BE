import { Injectable, NotFoundException } from '@nestjs/common';
import { InternService } from './intern.service';
import { ProjectsService } from '../projects/projects.service';
import { SprintsService } from '../sprints/sprints.service';

/** Own assignment reads. No FE-supplied project/sprint/assignee identity. */
@Injectable()
export class InternReadService {
  constructor(private readonly internService: InternService, private readonly projectsService: ProjectsService, private readonly sprintsService: SprintsService) {}

  private async active(userId: string) {
    const workspace = await this.internService.workspace(userId);
    if (workspace.status !== 'active' || !workspace.assignment) throw new NotFoundException({ statusCode: 404, code: 'ASSIGNMENT_NOT_ACTIVE', message: 'No active assignment.' });
    return workspace;
  }

  async project(userId: string) {
    const workspace = await this.active(userId);
    return this.projectsService.getOneDetailed(workspace.assignment!.project.id);
  }

  async sprintBoard(userId: string, query: { page: number; pageSize: number }) {
    const workspace = await this.active(userId);
    if (!workspace.currentSprint) throw new NotFoundException({ statusCode: 404, code: 'CURRENT_SPRINT_NOT_FOUND', message: 'No current sprint.' });
    return this.sprintsService.board(workspace.currentSprint.id, query, userId);
  }
}
