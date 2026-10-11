import 'reflect-metadata';
import 'dotenv/config';
import { CreateClassLessons1761081600000 } from './migrations/1761081600000-CreateClassLessons';
import { CreateImportedReviews1760995200000 } from './migrations/1760995200000-CreateImportedReviews';
import { AddRoleManagement1760908800000 } from './migrations/1760908800000-AddRoleManagement';
import { DataSource } from 'typeorm';
import { CreateReportSnapshots1761168000000 } from './migrations/1761168000000-CreateReportSnapshots';
import { CreateProjectRoleSlots1761254400000 } from './migrations/1761254400000-CreateProjectRoleSlots';
import { AddClassSchedule1760822400000 } from './migrations/1760822400000-AddClassSchedule';
import { ExpandAcademicStates1760736000000 } from './migrations/1760736000000-ExpandAcademicStates';
import { ENTITIES } from './entities';
import { CreateReferenceScreens1760649600000 } from './migrations/1760649600000-CreateReferenceScreens';
import { CreateProjectTemplates1760563200000 } from './migrations/1760563200000-CreateProjectTemplates';
import { CreateTaskSubmissions1760476800000 } from './migrations/1760476800000-CreateTaskSubmissions';
import { AddRecruitmentReviewProvenance1760390400000 } from './migrations/1760390400000-AddRecruitmentReviewProvenance';
import { InitPlatformCore1759872000000 } from './migrations/1759872000000-InitPlatformCore';
import { CreateAcademicCoreTables1759958400000 } from './migrations/1759958400000-CreateAcademicCoreTables';
import { CreateSprintTaskCoreTables1760044800000 } from './migrations/1760044800000-CreateSprintTaskCoreTables';
import { CreateRecruitmentAiCoreTables1760131200000 } from './migrations/1760131200000-CreateRecruitmentAiCoreTables';
import { CreateEvaluationKpiSalaryCertificateTables1760217600000 } from './migrations/1760217600000-CreateEvaluationKpiSalaryCertificateTables';
import { CreateAiMentorAssistanceRecommendationTables1760304000000 } from './migrations/1760304000000-CreateAiMentorAssistanceRecommendationTables';

/**
 * Standalone DataSource for the TypeORM CLI (migrations ONLY).
 * The Nest app builds its own pool in AppModule with identical options.
 * synchronize is ALWAYS false — schema changes go exclusively through
 * versioned migrations (production-safe, reviewable, revertible).
 */
export default new DataSource({
  type: 'mssql',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 1433),
  database: process.env.DB_NAME ?? 'VIntern',
  username: process.env.DB_USERNAME ?? 'vintern_app',
  password: process.env.DB_PASSWORD ?? '',
  options: {
    useUTC: true,
    encrypt: (process.env.DB_ENCRYPT ?? 'false') !== 'false',
    trustServerCertificate: (process.env.DB_TRUST_SERVER_CERTIFICATE ?? 'true') !== 'false',
  },
  synchronize: false,
  logging: false,
  entities: ENTITIES,
  migrations: [
    InitPlatformCore1759872000000,
    CreateAcademicCoreTables1759958400000,
    CreateSprintTaskCoreTables1760044800000,
    CreateRecruitmentAiCoreTables1760131200000,
    CreateEvaluationKpiSalaryCertificateTables1760217600000,
    CreateAiMentorAssistanceRecommendationTables1760304000000,
    AddRecruitmentReviewProvenance1760390400000,
    CreateTaskSubmissions1760476800000,
    CreateProjectTemplates1760563200000,
    CreateReferenceScreens1760649600000,
    ExpandAcademicStates1760736000000,
    AddClassSchedule1760822400000,
    AddRoleManagement1760908800000,
    CreateImportedReviews1760995200000,
    CreateClassLessons1761081600000,
    CreateReportSnapshots1761168000000,
    CreateProjectRoleSlots1761254400000,
  ],
});
