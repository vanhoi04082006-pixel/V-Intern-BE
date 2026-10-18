import { AddInterviewFollowUps1761945600000 } from './migrations/1761945600000-AddInterviewFollowUps';
import { SnapshotCertificateCompletion1762377600000 } from './migrations/1762377600000-SnapshotCertificateCompletion';
import { AddGithubTokenRotation1762464000000 } from './migrations/1762464000000-AddGithubTokenRotation';
import { BackfillQuestionMetadata1762032000000 } from './migrations/1762032000000-BackfillQuestionMetadata';
import { AddGithubWebhooks1762118400000 } from './migrations/1762118400000-AddGithubWebhooks';
import { CreateGithubDelivery1761859200000 } from './migrations/1761859200000-CreateGithubDelivery';
import { CreateInterviewConversation1761772800000 } from './migrations/1761772800000-CreateInterviewConversation';
import { CreateSessionSharing1761686400000 } from './migrations/1761686400000-CreateSessionSharing';
import 'reflect-metadata';
import 'dotenv/config';
import { CreateClassLessons1761081600000 } from './migrations/1761081600000-CreateClassLessons';
import { CreateImportedReviews1760995200000 } from './migrations/1760995200000-CreateImportedReviews';
import { AddRoleManagement1760908800000 } from './migrations/1760908800000-AddRoleManagement';
import { DataSource } from 'typeorm';
import { AddQuestionVersions1762204800000 } from './migrations/1762204800000-AddQuestionVersions';
import { CreateLearningAlertDispatches1762291200000 } from './migrations/1762291200000-CreateLearningAlertDispatches';
import { CreateReportSnapshots1761168000000 } from './migrations/1761168000000-CreateReportSnapshots';
import { CreateProjectRoleSlots1761254400000 } from './migrations/1761254400000-CreateProjectRoleSlots';
import { CreateAiGenerationBatches1761340800000 } from './migrations/1761340800000-CreateAiGenerationBatches';
import { AddAiPlanLifecycle1761600000000 } from './migrations/1761600000000-AddAiPlanLifecycle';
import { AddTemplateLibraryColumns1761427200000 } from './migrations/1761427200000-AddTemplateLibraryColumns';
import { AddTemplateRunRequest1761513600000 } from './migrations/1761513600000-AddTemplateRunRequest';
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
    CreateAiGenerationBatches1761340800000,
    AddTemplateLibraryColumns1761427200000,
    AddTemplateRunRequest1761513600000,
    AddAiPlanLifecycle1761600000000,
    CreateSessionSharing1761686400000,
    CreateInterviewConversation1761772800000,
    CreateGithubDelivery1761859200000,
    AddInterviewFollowUps1761945600000,
    BackfillQuestionMetadata1762032000000,
    AddGithubWebhooks1762118400000,
    AddQuestionVersions1762204800000,
    CreateLearningAlertDispatches1762291200000,
    SnapshotCertificateCompletion1762377600000,
    AddGithubTokenRotation1762464000000,
  ],
});
