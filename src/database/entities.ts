import { CareerRole } from '../career-roles/entities/career-role.entity';
import { KnowledgeEntry } from '../knowledge/entities/knowledge-entry.entity';
import { KnowledgeRevision } from '../knowledge/entities/knowledge-revision.entity';
import { CareerRoleRevision } from '../career-roles/entities/career-role-revision.entity';
import { User } from '../users/entities/user.entity';
import { Role } from '../rbac/entities/role.entity';
import { Permission } from '../rbac/entities/permission.entity';
import { UserRole } from '../rbac/entities/user-role.entity';
import { RolePermission } from '../rbac/entities/role-permission.entity';
import { UserGroup } from '../groups/entities/user-group.entity';
import { GroupMember } from '../groups/entities/group-member.entity';
import { GroupRole } from '../groups/entities/group-role.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { CatalogType } from '../catalogs/entities/catalog-type.entity';
import { CatalogItem } from '../catalogs/entities/catalog-item.entity';
import { SystemSetting } from '../settings/entities/system-setting.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { ActivityEvent } from '../audit/entities/activity-event.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationPreference } from '../notifications/entities/notification-preference.entity';
import { AcademicClass } from '../classes/entities/class.entity';
import { ClassMember } from '../classes/entities/class-member.entity';
import { InternshipSession } from '../sessions/entities/internship-session.entity';
import { SessionMember } from '../sessions/entities/session-member.entity';
import { SessionInstructor } from '../sessions/entities/session-instructor.entity';
import { SessionMilestone } from '../sessions/entities/session-milestone.entity';
import { Project } from '../projects/entities/project.entity';
import { ProjectMember } from '../projects/entities/project-member.entity';
import { ProjectTechnology } from '../projects/entities/project-technology.entity';
import { ProjectRoleSlot } from '../projects/entities/project-role-slot.entity';
import { AiGenerationBatch } from '../ai-generation/entities/ai-generation-batch.entity';
import { Assignment } from '../assignments/entities/assignment.entity';
import { Sprint } from '../sprints/entities/sprint.entity';
import { Task } from '../tasks/entities/task.entity';
import { TaskComment } from '../tasks/entities/task-comment.entity';
import { TaskStatusHistory } from '../tasks/entities/task-status-history.entity';
import { RecruitmentProfile } from '../recruitment/entities/recruitment-profile.entity';
import { InterviewQuestion } from '../recruitment/entities/interview-question.entity';
import { InterviewSession } from '../recruitment/entities/interview-session.entity';
import { InterviewSessionQuestion } from '../recruitment/entities/interview-session-question.entity';
import { InterviewAnswer } from '../recruitment/entities/interview-answer.entity';
import { RecruitmentResult } from '../recruitment/entities/recruitment-result.entity';
import { AiRun } from '../ai/entities/ai-run.entity';
import { AiMentorConversation } from '../ai/mentor/entities/ai-mentor-conversation.entity';
import { AiMentorMessage } from '../ai/mentor/entities/ai-mentor-message.entity';
import { EvaluationAiSuggestion } from '../ai/evaluation-assistance/entities/evaluation-ai-suggestion.entity';
import { AiRecommendationSnapshot } from '../ai/recommendations/entities/ai-recommendation-snapshot.entity';
import { EvaluationCycle } from '../evaluation/entities/evaluation-cycle.entity';
import { EvaluationCriterion } from '../evaluation/entities/evaluation-criterion.entity';
import { Evaluation } from '../evaluation/entities/evaluation.entity';
import { EvaluationScore } from '../evaluation/entities/evaluation-score.entity';
import { EvaluationRevision } from '../evaluation/entities/evaluation-revision.entity';
import { KpiPeriod } from '../kpi/entities/kpi-period.entity';
import { KpiResult } from '../kpi/entities/kpi-result.entity';
import { KpiMetricResult } from '../kpi/entities/kpi-metric-result.entity';
import { VirtualSalaryLedger } from '../salary/entities/virtual-salary-ledger.entity';
import { CertificatePolicy } from '../certificates/entities/certificate-policy.entity';
import { Certificate } from '../certificates/entities/certificate.entity';

/** Single source of truth for the platform + academic-core entity list. */
export const ENTITIES = [
  KnowledgeEntry,
  KnowledgeRevision,
  CareerRole,
  CareerRoleRevision,
  // Phase 1 — platform core
  User,
  Role,
  Permission,
  UserRole,
  RolePermission,
  UserGroup,
  GroupMember,
  GroupRole,
  RefreshToken,
  CatalogType,
  CatalogItem,
  SystemSetting,
  AuditLog,
  ActivityEvent,
  Notification,
  NotificationPreference,
  // Phase 2 — academic core
  AcademicClass,
  ClassMember,
  InternshipSession,
  SessionMember,
  SessionInstructor,
  SessionMilestone,
  Project,
  ProjectMember,
  ProjectTechnology,
  ProjectRoleSlot,
  AiGenerationBatch,
  Assignment,
  // Phase 3 — sprint / task core
  Sprint,
  Task,
  TaskComment,
  TaskStatusHistory,
  // Phase 4 — recruitment + AI interview core
  RecruitmentProfile,
  InterviewQuestion,
  InterviewSession,
  InterviewSessionQuestion,
  InterviewAnswer,
  RecruitmentResult,
  AiRun,
  // Phase 5 — evaluation + performance + KPI + virtual salary + certificates
  EvaluationCycle,
  EvaluationCriterion,
  Evaluation,
  EvaluationScore,
  EvaluationRevision,
  KpiPeriod,
  KpiResult,
  KpiMetricResult,
  VirtualSalaryLedger,
  CertificatePolicy,
  Certificate,
  // Phase 6 — AI mentor + AI evaluation assistance + AI recommendations
  AiMentorConversation,
  AiMentorMessage,
  EvaluationAiSuggestion,
  AiRecommendationSnapshot,
];
