# Tra cứu field của DTO

Sinh từ cùng OpenAPI lúc **2026-10-23T21:35:13.266Z**, Backend M02 bf3118693c782c145a87d4348212344396ce3526. Phản ánh field được khai báo trong Swagger; [hướng dẫn kho tri thức](../KNOWLEDGE-LIBRARY.md) và validation/service quy định điều kiện nghiệp vụ. Field optional không đồng nghĩa được sửa ở mọi trạng thái.

## Mục lục schema

- [AddClassMembersDto](#addclassmembersdto)
- [AddGroupMembersDto](#addgroupmembersdto)
- [AddSessionInstructorsDto](#addsessioninstructorsdto)
- [AddSessionMembersDto](#addsessionmembersdto)
- [CareerRoleVersionDto](#careerroleversiondto)
- [ChangeEvaluationCycleStatusDto](#changeevaluationcyclestatusdto)
- [ChangeRequestDto](#changerequestdto)
- [ClassAnnouncementDto](#classannouncementdto)
- [ConfirmSprintPlanDto](#confirmsprintplandto)
- [ContractDraftDto](#contractdraftdto)
- [CreateAiMentorConversationDto](#createaimentorconversationdto)
- [CreateAssignmentDto](#createassignmentdto)
- [CreateCareerRoleDto](#createcareerroledto)
- [CreateCatalogItemDto](#createcatalogitemdto)
- [CreateCatalogTypeDto](#createcatalogtypedto)
- [CreateClassDto](#createclassdto)
- [CreateClassLessonDto](#createclasslessondto)
- [CreateEvaluationCriterionDto](#createevaluationcriteriondto)
- [CreateEvaluationCycleDto](#createevaluationcycledto)
- [CreateEvaluationDto](#createevaluationdto)
- [CreateGroupDto](#creategroupdto)
- [CreateKnowledgeDto](#createknowledgedto)
- [CreateKpiPeriodDto](#createkpiperioddto)
- [CreateMilestoneDto](#createmilestonedto)
- [CreateProjectDto](#createprojectdto)
- [CreateReportDto](#createreportdto)
- [CreateSalaryAdjustmentDto](#createsalaryadjustmentdto)
- [CreateSessionDto](#createsessiondto)
- [CreateSprintDto](#createsprintdto)
- [CreateTaskCommentDto](#createtaskcommentdto)
- [CreateTaskDto](#createtaskdto)
- [CreateTemplateDto](#createtemplatedto)
- [CreateUserDto](#createuserdto)
- [DecideAccessDto](#decideaccessdto)
- [DraftSprintPlanDto](#draftsprintplandto)
- [EvaluationScoreInputDto](#evaluationscoreinputdto)
- [GeneratePlanDto](#generateplandto)
- [IssueCertificateDto](#issuecertificatedto)
- [KnowledgeDraftDto](#knowledgedraftdto)
- [KnowledgeImportDryRunDto](#knowledgeimportdryrundto)
- [KnowledgeSourceDto](#knowledgesourcedto)
- [KnowledgeVersionDto](#knowledgeversiondto)
- [LoginDto](#logindto)
- [Object](#object)
- [ProjectRoleSlotDto](#projectroleslotdto)
- [QuestionContentDto](#questioncontentdto)
- [RegisterDto](#registerdto)
- [RequestAccessDto](#requestaccessdto)
- [RestoreKnowledgeDto](#restoreknowledgedto)
- [ReviewSubmissionDto](#reviewsubmissiondto)
- [ReviseEvaluationDto](#reviseevaluationdto)
- [RevokeCertificateDto](#revokecertificatedto)
- [SaveAnswerDto](#saveanswerdto)
- [SaveAttendanceDto](#saveattendancedto)
- [SelectRoleDto](#selectroledto)
- [SendAiMentorMessageDto](#sendaimentormessagedto)
- [SetGroupRolesDto](#setgrouprolesdto)
- [SetPreferenceDto](#setpreferencedto)
- [SetProjectSlotsDto](#setprojectslotsdto)
- [SetUserStatusDto](#setuserstatusdto)
- [StartTemplateDto](#starttemplatedto)
- [SubmitTaskDto](#submittaskdto)
- [TransitionKpiPeriodDto](#transitionkpiperioddto)
- [TransitionSprintDto](#transitionsprintdto)
- [UpdateCareerRoleDto](#updatecareerroledto)
- [UpdateCatalogItemDto](#updatecatalogitemdto)
- [UpdateClassDto](#updateclassdto)
- [UpdateClassLessonDto](#updateclasslessondto)
- [UpdateEvaluationCriterionDto](#updateevaluationcriteriondto)
- [UpdateEvaluationCycleDto](#updateevaluationcycledto)
- [UpdateEvaluationDto](#updateevaluationdto)
- [UpdateGroupDto](#updategroupdto)
- [UpdateImportedReviewDto](#updateimportedreviewdto)
- [UpdateKnowledgeDto](#updateknowledgedto)
- [UpdateKpiPeriodDto](#updatekpiperioddto)
- [UpdateMilestoneDto](#updatemilestonedto)
- [UpdateMyTaskDto](#updatemytaskdto)
- [UpdateProjectDto](#updateprojectdto)
- [UpdateQuestionDto](#updatequestiondto)
- [UpdateSessionDto](#updatesessiondto)
- [UpdateSettingDto](#updatesettingdto)
- [UpdateSprintDto](#updatesprintdto)
- [UpdateTaskDto](#updatetaskdto)
- [UpdateTemplateDto](#updatetemplatedto)
- [UpdateUserDto](#updateuserdto)

## AddClassMembersDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| userIds | array<string (uuid)>  | Có | minItems: 1; maxItems: 200 |

## AddGroupMembersDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| userIds | array<string (uuid)>  | Có | — |

## AddSessionInstructorsDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| instructorIds | array<string (uuid)>  | Có | minItems: 1; maxItems: 100 |

## AddSessionMembersDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| userIds | array<string (uuid)>  | Có | minItems: 1; maxItems: 200 |

## CareerRoleVersionDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## ChangeEvaluationCycleStatusDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| status | string | Có | enum: "draft", "open", "closed", "archived" |

## ChangeRequestDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## ClassAnnouncementDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## ConfirmSprintPlanDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| projectId | string (uuid) | Có | — |
| sessionId | string (uuid) | Có | — |
| draft | object | Có | Instructor-reviewed draft (re-validated server-side) |
| requestId | string (uuid) | Có | Client-generated idempotency key |
| planId | string (uuid) | Không | Stored plan being confirmed (marked confirmed on success) |

## ContractDraftDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## CreateAiMentorConversationDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| title | string | Không | Optional conversation title; maxLength: 256 |

## CreateAssignmentDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| internId | string (uuid) | Có | Intern user id (must be active) |
| projectId | string (uuid) | Có | — |
| sessionId | string (uuid) | Có | — |
| role | string | Không | Project role slot to fill (e.g. frontend); enforced against slot caps when defined; minLength: 1; maxLength: 64 |

## CreateCareerRoleDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## CreateCatalogItemDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## CreateCatalogTypeDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## CreateClassDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| meetingSchedule | string | Không | maxLength: 128 |
| meetingLocation | string | Không | maxLength: 128 |
| progress | number | Không | minimum: 0; maximum: 100 |
| code | string | Có | minLength: 1; maxLength: 64 |
| name | string | Có | minLength: 1; maxLength: 256 |
| description | string | Không | maxLength: 2000 |
| leadInstructorId | string (uuid) | Không | — |
| sessionId | string (uuid) | Không | — |
| status | string | Không | enum: "upcoming", "active", "paused", "completed", "cancelled" |
| startDate | string (date-time) | Không | — |
| endDate | string (date-time) | Không | — |

## CreateClassLessonDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## CreateEvaluationCriterionDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| code | string | Có | maxLength: 64 |
| name | string | Có | maxLength: 128 |
| description | object | Không | maxLength: 512 |
| weight | number | Có | Percentage weight (2dp); active criteria must total exactly 100; minimum: 0.01; maximum: 100 |
| maxScore | number | Không | minimum: 0.1; maximum: 100; default: 100 |
| sortOrder | number | Không | default: 0 |
| isRequired | boolean | Không | default: true |

## CreateEvaluationCycleDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| code | string | Có | maxLength: 64 |
| name | string | Có | maxLength: 256 |
| sessionId | object (uuid) | Không | — |
| projectId | object (uuid) | Không | — |
| type | string | Có | default: "sprint"; enum: "sprint", "midterm", "final" |
| startDate | string (date-time) | Có | — |
| endDate | string (date-time) | Có | — |
| dueDate | object (date-time) | Không | — |
| useDefaultTemplate | boolean | Không | Seed the documented evaluation-v1 template criteria (default true); default: true |

## CreateEvaluationDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| cycleId | string (uuid) | Có | — |
| internId | string (uuid) | Có | — |
| evaluatorId | string (uuid) | Không | Defaults to the authenticated evaluator; instructors can only self-assign |

## CreateGroupDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| code | string | Có | maxLength: 64 |
| name | string | Có | minLength: 1; maxLength: 128 |
| description | string | Không | maxLength: 512 |

## CreateKnowledgeDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| code | string | Có | pattern: "^[a-z][a-z0-9_-]{1,79}$" |
| draft | [KnowledgeDraftDto](#knowledgedraftdto) | Có | — |

## CreateKpiPeriodDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| code | string | Có | maxLength: 64 |
| name | string | Có | maxLength: 256 |
| startDate | string (date-time) | Có | Inclusive start (UTC) |
| endDate | string (date-time) | Có | Exclusive end (UTC) |

## CreateMilestoneDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| title | string | Có | minLength: 1; maxLength: 256 |
| description | string | Không | maxLength: 2000 |
| dueDate | string (date-time) | Không | — |
| status | string | Không | enum: "pending", "in_progress", "completed" |
| sortOrder | number | Không | minimum: 0; default: 0 |

## CreateProjectDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| code | string | Có | minLength: 1; maxLength: 64 |
| name | string | Có | minLength: 1; maxLength: 256 |
| description | string | Có | minLength: 1; maxLength: 4000 |
| domainCategory | string | Không | maxLength: 128 |
| difficulty | string | Không | enum: "beginner", "intermediate", "advanced" |
| status | string | Không | enum: "draft", "active", "completed", "archived" |
| mentorId | string (uuid) | Không | — |
| capacity | number / null | Không | minimum: 1 |
| startDate | string (date-time) | Không | — |
| endDate | string (date-time) | Không | — |
| technologies | array<string>  | Không | maxItems: 50 |

## CreateReportDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## CreateSalaryAdjustmentDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| userId | string (uuid) | Có | — |
| type | string | Có | enum: "bonus", "penalty", "adjustment", "reversal" |
| amount | number | Không | Signed magnitude: bonus > 0 (stored positive), penalty > 0 (stored NEGATIVE), adjustment signed non-zero; ignored for reversal |
| sourceId | string | Không | Source ledger row id — REQUIRED for reversal |
| reason | string | Có | Required audit reason (spec 37); maxLength: 512 |
| requestId | string | Không | Client-generated idempotency key (UUID). Replays with the same key return the original row instead of minting duplicates. |

## CreateSessionDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| code | string | Có | minLength: 1; maxLength: 64 |
| name | string | Có | minLength: 1; maxLength: 256 |
| description | string | Không | maxLength: 2000 |
| status | string | Không | enum: "upcoming", "active", "ending", "completed", "cancelled" |
| leadInstructorId | string (uuid) | Không | — |
| startDate | string (date-time) | Có | — |
| endDate | string (date-time) | Có | — |

## CreateSprintDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| code | string | Có | Unique sprint code (UX_sprints_code); maxLength: 64 |
| name | string | Có | maxLength: 256 |
| description | string | Không | maxLength: 4000 |
| projectId | string (uuid) | Có | Sprint belongs to exactly ONE project |
| sessionId | string (uuid) | Không | Optional internship-session link |
| goal | string | Không | Sprint goal (activation notifies the project interns); maxLength: 512 |
| startDate | string (date-time) | Có | — |
| endDate | string (date-time) | Có | — |

## CreateTaskCommentDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| content | string | Có | maxLength: 2000 |

## CreateTaskDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| title | string | Có | maxLength: 256 |
| description | string | Không | maxLength: 4000 |
| projectId | string (uuid) | Có | — |
| sprintId | string (uuid) | Không | Sprint must belong to the same project (409 SPRINT_PROJECT_MISMATCH) |
| assigneeId | string (uuid) | Không | Assignee must hold an ACTIVE assignment on this project (409 INVALID_ASSIGNEE) |
| priority | string | Không | default: "medium"; enum: "low", "medium", "high", "critical" |
| storyPoints | number / null | Không | minimum: 0; maximum: 1000 |
| dueDate | string (date-time) / null | Không | — |

## CreateTemplateDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## CreateUserDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| email | string (email) | Có | maxLength: 320 |
| username | string | Có | minLength: 3; maxLength: 64 |
| displayName | string | Có | minLength: 1; maxLength: 128 |
| password | string | Có | minLength: 10; maxLength: 72 |
| roleCodes | array<string>  | Không | — |

## DecideAccessDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## DraftSprintPlanDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| projectId | string (uuid) | Có | — |
| sessionId | string (uuid) | Có | — |
| sprintCount | number | Không | minimum: 1; maximum: 8 |
| startDate | string (date-time) | Không | — |

## EvaluationScoreInputDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| criterionId | string (uuid) | Có | — |
| score | number | Có | minimum: 0; maximum: 100 |
| comment | object | Không | maxLength: 1024 |

## GeneratePlanDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| regenerate | boolean | Không | Request a fresh draft; an in-flight or published plan is always reused. |
| projectId | string (uuid) | Có | — |
| sessionId | string (uuid) | Có | — |
| sprintCount | number | Không | minimum: 1; maximum: 8 |
| startDate | string (date-time) | Không | — |
| requestId | string (uuid) | Không | Client idempotency key: replays return the stored plan |

## IssueCertificateDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| userId | string (uuid) | Có | — |

## KnowledgeDraftDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| kind | string | Có | enum: "qa", "guide", "exercise", "solution", "rubric", "plan_template", "communication" |
| title | string | Có | maxLength: 200 |
| summary | string | Có | Publish cần ít nhất 20 ký tự; maxLength: 1000 |
| language | string | Có | enum: "vi", "en" |
| difficulty | string / null | Có | enum: "easy", "medium", "hard" |
| audience | string | Có | qa/solution/rubric bắt buộc grading_only; enum: "student_safe", "staff_only", "grading_only" |
| purposes | array<string>  | Có | minItems: 1; maxItems: 9; enum: "interview", "interview_evaluation", "planning", "code_review", "mentoring", "evaluation_assistance", "recommendation", "cv_screening", "communication" |
| roleCodes | array<string>  | Có | Mã nghề từ catalog M01; rỗng nghĩa là dùng chung; maxItems: 30 |
| tags | array<string>  | Có | maxItems: 30 |
| sources | array<[KnowledgeSourceDto](#knowledgesourcedto)>  | Có | maxItems: 20 |
| body | object | Có | Draft JSON; khi publish kiểm schema theo kind. Xem docs/KNOWLEDGE-LIBRARY.md. |

## KnowledgeImportDryRunDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| entries | array<object>  | Có | Hàng {code,draft}; mỗi hàng được kiểm riêng, không mutation; minItems: 1; maxItems: 50 |

## KnowledgeSourceDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| title | string | Có | maxLength: 200 |
| url | string | Không | maxLength: 2000 |
| reference | string | Không | Tham chiếu tài liệu khi không có URL; maxLength: 1000 |

## KnowledgeVersionDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| version | number | Có | Version current mà người dùng đã đọc; minimum: 1; maximum: 2147483646 |

## LoginDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| email | string (email) | Có | maxLength: 320 |
| password | string | Có | minLength: 1; maxLength: 72 |

## Object

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## ProjectRoleSlotDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| roleCode | string | Có | minLength: 1; maxLength: 64 |
| requiredCount | number | Có | minimum: 1; maximum: 50 |

## QuestionContentDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## RegisterDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## RequestAccessDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## RestoreKnowledgeDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| version | number | Có | Version current mà người dùng đã đọc; minimum: 1; maximum: 2147483646 |
| sourceVersion | number | Có | Bản lịch sử được chép thành draft mới; minimum: 1; maximum: 2147483646 |

## ReviewSubmissionDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## ReviseEvaluationDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| scores | array<[EvaluationScoreInputDto](#evaluationscoreinputdto)>  | Không | — |
| summary | string | Không | maxLength: 4000 |
| reason | string | Có | Required audit reason for the privileged correction; maxLength: 1000 |

## RevokeCertificateDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| reason | string | Có | Required revocation reason (spec 50); maxLength: 512 |

## SaveAnswerDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| answerText | string | Có | minLength: 1; maxLength: 5000 |

## SaveAttendanceDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## SelectRoleDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| role | string | Có | Stable code from the recruiting career catalog |

## SendAiMentorMessageDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| content | string | Có | The intern question (plain text); minLength: 1; maxLength: 8000 |

## SetGroupRolesDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| roleCodes | array<string>  | Có | — |

## SetPreferenceDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| category | string | Có | enum: "system", "task", "session", "evaluation", "announcement", "recruitment", "kpi", "salary", "certificate" |
| enabled | boolean | Có | — |

## SetProjectSlotsDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| slots | array<[ProjectRoleSlotDto](#projectroleslotdto)>  | Có | maxItems: 20 |

## SetUserStatusDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| status | string | Có | enum: "active", "pending", "locked", "deleted" |

## StartTemplateDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## SubmitTaskDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## TransitionKpiPeriodDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| status | string | Có | enum: "draft", "open", "calculating", "finalized", "closed" |

## TransitionSprintDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| status | string | Có | Target status (legal transitions enforced server-side); enum: "planned", "active", "completed", "cancelled" |
| allowOpenTasks | boolean | Không | Explicit override for the open-tasks completion policy: complete even when open tasks remain (409 SPRINT_HAS_OPEN_TASKS otherwise). The override is audited.; default: false |

## UpdateCareerRoleDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## UpdateCatalogItemDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## UpdateClassDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| meetingSchedule | string | Không | maxLength: 128 |
| meetingLocation | string | Không | maxLength: 128 |
| progress | number | Không | minimum: 0; maximum: 100 |
| name | string | Không | minLength: 1; maxLength: 256 |
| description | string | Không | maxLength: 2000 |
| leadInstructorId | string (uuid) | Không | — |
| sessionId | string (uuid) | Không | — |
| status | string | Không | enum: "upcoming", "active", "paused", "completed", "cancelled" |
| startDate | string (date-time) | Không | — |
| endDate | string (date-time) | Không | — |

## UpdateClassLessonDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## UpdateEvaluationCriterionDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| code | string | Không | maxLength: 64 |
| name | string | Không | maxLength: 128 |
| description | object | Không | maxLength: 512 |
| weight | number | Không | Percentage weight (2dp); active criteria must total exactly 100; minimum: 0.01; maximum: 100 |
| maxScore | number | Không | minimum: 0.1; maximum: 100; default: 100 |
| sortOrder | number | Không | default: 0 |
| isRequired | boolean | Không | default: true |

## UpdateEvaluationCycleDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| name | string | Không | maxLength: 256 |
| startDate | string (date-time) | Không | — |
| endDate | string (date-time) | Không | — |
| dueDate | object (date-time) | Không | — |

## UpdateEvaluationDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| scores | array<[EvaluationScoreInputDto](#evaluationscoreinputdto)>  | Có | — |
| summary | object | Không | maxLength: 4000 |

## UpdateGroupDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| name | string | Không | maxLength: 128 |
| description | string | Không | maxLength: 512 |

## UpdateImportedReviewDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## UpdateKnowledgeDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| version | number | Có | Version current mà người dùng đã đọc; minimum: 1; maximum: 2147483646 |
| draft | [KnowledgeDraftDto](#knowledgedraftdto) | Có | — |

## UpdateKpiPeriodDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| code | string | Không | maxLength: 64 |
| name | string | Không | maxLength: 256 |
| startDate | string (date-time) | Không | Inclusive start (UTC) |
| endDate | string (date-time) | Không | Exclusive end (UTC) |

## UpdateMilestoneDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| title | string | Không | minLength: 1; maxLength: 256 |
| description | string | Không | maxLength: 2000 |
| dueDate | string (date-time) | Không | — |
| status | string | Không | enum: "pending", "in_progress", "completed" |
| sortOrder | number | Không | minimum: 0 |

## UpdateMyTaskDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| expectedVersion | number | Không | Version observed by the client; stale edits return 409 TASK_VERSION_CONFLICT; minimum: 1 |
| status | string | Không | todo→doing, doing→review only (409 INVALID_TASK_TRANSITION otherwise); enum: "todo", "doing", "review", "done" |
| progress | number | Không | minimum: 0; maximum: 100 |
| reason | string | Không | maxLength: 512 |

## UpdateProjectDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| name | string | Không | minLength: 1; maxLength: 256 |
| description | string | Không | minLength: 1; maxLength: 4000 |
| domainCategory | string | Không | maxLength: 128 |
| difficulty | string | Không | enum: "beginner", "intermediate", "advanced" |
| status | string | Không | enum: "draft", "active", "completed", "archived" |
| mentorId | string (uuid) | Không | — |
| capacity | number / null | Không | minimum: 1 |
| startDate | string (date-time) | Không | — |
| endDate | string (date-time) | Không | — |
| technologies | array<string>  | Không | maxItems: 50 |

## UpdateQuestionDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## UpdateSessionDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| name | string | Không | minLength: 1; maxLength: 256 |
| description | string | Không | maxLength: 2000 |
| status | string | Không | enum: "upcoming", "active", "ending", "completed", "cancelled" |
| leadInstructorId | string (uuid) | Không | — |
| startDate | string (date-time) | Không | — |
| endDate | string (date-time) | Không | — |

## UpdateSettingDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## UpdateSprintDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| name | string | Không | maxLength: 256 |
| description | string | Không | maxLength: 4000 |
| goal | string | Không | Sprint goal (activation notifies the project interns); maxLength: 512 |
| startDate | string (date-time) | Không | — |
| endDate | string (date-time) | Không | — |

## UpdateTaskDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| expectedVersion | number | Không | Version observed by the client; stale edits return 409 TASK_VERSION_CONFLICT; minimum: 1 |
| title | string | Không | maxLength: 256 |
| description | string | Không | maxLength: 4000 |
| sprintId | string (uuid) | Không | — |
| assigneeId | object (uuid) / null | Không | null = unassign |
| priority | string | Không | enum: "low", "medium", "high", "critical" |
| storyPoints | number / null | Không | minimum: 0; maximum: 1000 |
| dueDate | string (date-time) / null | Không | — |
| status | string | Không | Presence triggers a server-enforced transition; enum: "todo", "doing", "review", "done" |
| reason | string | Không | Transition reason (recorded in status history); maxLength: 512 |

## UpdateTemplateDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|

## UpdateUserDto

| Field | Kiểu | Bắt buộc | Giới hạn / ý nghĩa |
|---|---|---|---|
| displayName | string | Không | maxLength: 128 |
| username | string | Không | minLength: 3; maxLength: 64 |
