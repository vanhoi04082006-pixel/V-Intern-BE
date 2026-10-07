import { Entity, PrimaryColumn } from 'typeorm';

/**
 * Project technologies — dedicated relational join table (spec 16 decision).
 * Technologies are NEVER comma-serialized into a text column. Each row is
 * (projectId, technology) with a composite PK; FK CASCADE to projects.
 * Catalog-based linkage (FK to catalog_items) is deferred to a later phase
 * and documented in docs/architecture/academic-core.md.
 */
@Entity({ name: 'project_technologies' })
export class ProjectTechnology {
  @PrimaryColumn('uuid', { name: 'projectId' })
  projectId!: string;

  @PrimaryColumn('nvarchar', { length: 64, name: 'technology' })
  technology!: string;
}
