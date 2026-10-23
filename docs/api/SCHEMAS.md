# Tra cứu field của DTO

Đây là phụ lục OpenAPI ngày 21/10/2026 để tra tên, kiểu và field bắt buộc. Nó không thay thế các giới hạn nghiệp vụ trong service, ví dụ role/ownership, thứ tự trạng thái hoặc hạn theo phiên. Đọc [hướng dẫn API](README.md) trước khi dùng ví dụ và đối chiếu source khi cần sửa contract.

Cột “bắt buộc” nói về schema request. Trường không bắt buộc không có nghĩa người dùng được sửa mọi thời điểm. Giá trị default/enum là mô tả từ OpenAPI, không phải dữ liệu đã lưu trong DB.

## Mục lục schema

- [AddClassMembersDto](#addclassmembersdto)
- [AddGroupMembersDto](#addgroupmembersdto)
- [AddSessionInstructorsDto](#addsessioninstructorsdto)
- [AddSessionMembersDto](#addsessionmembersdto)
- [ChangeEvaluationCycleStatusDto](#changeevaluationcyclestatusdto)
- [ChangeRequestDto](#changerequestdto)
- [ClassAnnouncementDto](#classannouncementdto)
- [ConfirmSprintPlanDto](#confirmsprintplandto)
- [ContractDraftDto](#contractdraftdto)
- [CreateAiMentorConversationDto](#createaimentorconversationdto)
- [CreateAssignmentDto](#createassignmentdto)
- [CreateCatalogItemDto](#createcatalogitemdto)
- [CreateCatalogTypeDto](#createcatalogtypedto)
- [CreateClassDto](#createclassdto)
- [CreateClassLessonDto](#createclasslessondto)
- [CreateEvaluationCriterionDto](#createevaluationcriteriondto)
- [CreateEvaluationCycleDto](#createevaluationcycledto)
- [CreateEvaluationDto](#createevaluationdto)
- [CreateGroupDto](#creategroupdto)
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
- [LoginDto](#logindto)
- [ProjectRoleSlotDto](#projectroleslotdto)
- [QuestionContentDto](#questioncontentdto)
- [RegisterDto](#registerdto)
- [RequestAccessDto](#requestaccessdto)
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
- [UpdateCatalogItemDto](#updatecatalogitemdto)
- [UpdateClassDto](#updateclassdto)
- [UpdateClassLessonDto](#updateclasslessondto)
- [UpdateEvaluationCriterionDto](#updateevaluationcriteriondto)
- [UpdateEvaluationCycleDto](#updateevaluationcycledto)
- [UpdateEvaluationDto](#updateevaluationdto)
- [UpdateGroupDto](#updategroupdto)
- [UpdateImportedReviewDto](#updateimportedreviewdto)
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

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `userIds` | array<string (uuid)> | Có | minItems: 1; maxItems: 200 |

## AddGroupMembersDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `userIds` | array<string (uuid)> | Có | Xem DTO và validation của endpoint. |

## AddSessionInstructorsDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `instructorIds` | array<string (uuid)> | Có | minItems: 1; maxItems: 100 |

## AddSessionMembersDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `userIds` | array<string (uuid)> | Có | minItems: 1; maxItems: 200 |

## ChangeEvaluationCycleStatusDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `status` | string | Có | Một trong: draft, open, closed, archived |

## ChangeRequestDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## ClassAnnouncementDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## ConfirmSprintPlanDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `projectId` | string (uuid) | Có | Xem DTO và validation của endpoint. |
| `sessionId` | string (uuid) | Có | Xem DTO và validation của endpoint. |
| `draft` | object | Có | Instructor-reviewed draft (re-validated server-side) |
| `requestId` | string (uuid) | Có | Client-generated idempotency key |
| `planId` | string (uuid) | Không | Stored plan being confirmed (marked confirmed on success) |

## ContractDraftDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## CreateAiMentorConversationDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `title` | string | Không | Optional conversation title; maxLength: 256 |

## CreateAssignmentDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `internId` | string (uuid) | Có | Intern user id (must be active) |
| `projectId` | string (uuid) | Có | Xem DTO và validation của endpoint. |
| `sessionId` | string (uuid) | Có | Xem DTO và validation của endpoint. |
| `role` | string | Không | Project role slot to fill (e.g. frontend); enforced against slot caps when defined; minLength: 1; maxLength: 64 |

## CreateCatalogItemDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## CreateCatalogTypeDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## CreateClassDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `meetingSchedule` | string | Không | maxLength: 128 |
| `meetingLocation` | string | Không | maxLength: 128 |
| `progress` | number | Không | minimum: 0; maximum: 100 |
| `code` | string | Có | minLength: 1; maxLength: 64 |
| `name` | string | Có | minLength: 1; maxLength: 256 |
| `description` | string | Không | maxLength: 2000 |
| `leadInstructorId` | string (uuid) | Không | Xem DTO và validation của endpoint. |
| `sessionId` | string (uuid) | Không | Xem DTO và validation của endpoint. |
| `status` | string | Không | Một trong: upcoming, active, paused, completed, cancelled |
| `startDate` | string (date-time) | Không | Xem DTO và validation của endpoint. |
| `endDate` | string (date-time) | Không | Xem DTO và validation của endpoint. |

## CreateClassLessonDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## CreateEvaluationCriterionDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `code` | string | Có | maxLength: 64 |
| `name` | string | Có | maxLength: 128 |
| `description` | object | Không | maxLength: 512 |
| `weight` | number | Có | Percentage weight (2dp); active criteria must total exactly 100; minimum: 0.01; maximum: 100 |
| `maxScore` | number | Không | minimum: 0.1; maximum: 100; default: 100 |
| `sortOrder` | number | Không | default: 0 |
| `isRequired` | boolean | Không | default: True |

## CreateEvaluationCycleDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `code` | string | Có | maxLength: 64 |
| `name` | string | Có | maxLength: 256 |
| `sessionId` | object (uuid) | Không | Xem DTO và validation của endpoint. |
| `projectId` | object (uuid) | Không | Xem DTO và validation của endpoint. |
| `type` | string | Có | Một trong: sprint, midterm, final; default: sprint |
| `startDate` | string (date-time) | Có | Xem DTO và validation của endpoint. |
| `endDate` | string (date-time) | Có | Xem DTO và validation của endpoint. |
| `dueDate` | object (date-time) | Không | Xem DTO và validation của endpoint. |
| `useDefaultTemplate` | boolean | Không | Seed the documented evaluation-v1 template criteria (default true); default: True |

## CreateEvaluationDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `cycleId` | string (uuid) | Có | Xem DTO và validation của endpoint. |
| `internId` | string (uuid) | Có | Xem DTO và validation của endpoint. |
| `evaluatorId` | string (uuid) | Không | Defaults to the authenticated evaluator; instructors can only self-assign |

## CreateGroupDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `code` | string | Có | maxLength: 64 |
| `name` | string | Có | minLength: 1; maxLength: 128 |
| `description` | string | Không | maxLength: 512 |

## CreateKpiPeriodDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `code` | string | Có | maxLength: 64 |
| `name` | string | Có | maxLength: 256 |
| `startDate` | string (date-time) | Có | Inclusive start (UTC) |
| `endDate` | string (date-time) | Có | Exclusive end (UTC) |

## CreateMilestoneDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `title` | string | Có | minLength: 1; maxLength: 256 |
| `description` | string | Không | maxLength: 2000 |
| `dueDate` | string (date-time) | Không | Xem DTO và validation của endpoint. |
| `status` | string | Không | Một trong: pending, in_progress, completed |
| `sortOrder` | number | Không | minimum: 0; default: 0 |

## CreateProjectDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `code` | string | Có | minLength: 1; maxLength: 64 |
| `name` | string | Có | minLength: 1; maxLength: 256 |
| `description` | string | Có | minLength: 1; maxLength: 4000 |
| `domainCategory` | string | Không | maxLength: 128 |
| `difficulty` | string | Không | Một trong: beginner, intermediate, advanced |
| `status` | string | Không | Một trong: draft, active, completed, archived |
| `mentorId` | string (uuid) | Không | Xem DTO và validation của endpoint. |
| `capacity` | number hoặc null | Không | minimum: 1 |
| `startDate` | string (date-time) | Không | Xem DTO và validation của endpoint. |
| `endDate` | string (date-time) | Không | Xem DTO và validation của endpoint. |
| `technologies` | array<string> | Không | maxItems: 50 |

## CreateReportDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## CreateSalaryAdjustmentDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `userId` | string (uuid) | Có | Xem DTO và validation của endpoint. |
| `type` | string | Có | Một trong: bonus, penalty, adjustment, reversal |
| `amount` | number | Không | Signed magnitude: bonus > 0 (stored positive), penalty > 0 (stored NEGATIVE), adjustment signed non-zero; ignored for reversal |
| `sourceId` | string | Không | Source ledger row id — REQUIRED for reversal |
| `reason` | string | Có | Required audit reason (spec 37); maxLength: 512 |
| `requestId` | string | Không | Client-generated idempotency key (UUID). Replays with the same key return the original row instead of minting duplicates. |

## CreateSessionDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `code` | string | Có | minLength: 1; maxLength: 64 |
| `name` | string | Có | minLength: 1; maxLength: 256 |
| `description` | string | Không | maxLength: 2000 |
| `status` | string | Không | Một trong: upcoming, active, ending, completed, cancelled |
| `leadInstructorId` | string (uuid) | Không | Xem DTO và validation của endpoint. |
| `startDate` | string (date-time) | Có | Xem DTO và validation của endpoint. |
| `endDate` | string (date-time) | Có | Xem DTO và validation của endpoint. |

## CreateSprintDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `code` | string | Có | Unique sprint code (UX_sprints_code); maxLength: 64 |
| `name` | string | Có | maxLength: 256 |
| `description` | string | Không | maxLength: 4000 |
| `projectId` | string (uuid) | Có | Sprint belongs to exactly ONE project |
| `sessionId` | string (uuid) | Không | Optional internship-session link |
| `goal` | string | Không | Sprint goal (activation notifies the project interns); maxLength: 512 |
| `startDate` | string (date-time) | Có | Xem DTO và validation của endpoint. |
| `endDate` | string (date-time) | Có | Xem DTO và validation của endpoint. |

## CreateTaskCommentDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `content` | string | Có | maxLength: 2000 |

## CreateTaskDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `title` | string | Có | maxLength: 256 |
| `description` | string | Không | maxLength: 4000 |
| `projectId` | string (uuid) | Có | Xem DTO và validation của endpoint. |
| `sprintId` | string (uuid) | Không | Sprint must belong to the same project (409 SPRINT_PROJECT_MISMATCH) |
| `assigneeId` | string (uuid) | Không | Assignee must hold an ACTIVE assignment on this project (409 INVALID_ASSIGNEE) |
| `priority` | string | Không | Một trong: low, medium, high, critical; default: medium |
| `storyPoints` | number hoặc null | Không | minimum: 0; maximum: 1000 |
| `dueDate` | string (date-time) hoặc null | Không | Xem DTO và validation của endpoint. |

## CreateTemplateDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## CreateUserDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `email` | string (email) | Có | maxLength: 320 |
| `username` | string | Có | minLength: 3; maxLength: 64 |
| `displayName` | string | Có | minLength: 1; maxLength: 128 |
| `password` | string | Có | minLength: 10; maxLength: 72 |
| `roleCodes` | array<string> | Không | Xem DTO và validation của endpoint. |

## DecideAccessDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## DraftSprintPlanDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `projectId` | string (uuid) | Có | Xem DTO và validation của endpoint. |
| `sessionId` | string (uuid) | Có | Xem DTO và validation của endpoint. |
| `sprintCount` | number | Không | minimum: 1; maximum: 8 |
| `startDate` | string (date-time) | Không | Xem DTO và validation của endpoint. |

## EvaluationScoreInputDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `criterionId` | string (uuid) | Có | Xem DTO và validation của endpoint. |
| `score` | number | Có | minimum: 0; maximum: 100 |
| `comment` | object | Không | maxLength: 1024 |

## GeneratePlanDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `regenerate` | boolean | Không | Request a fresh draft; an in-flight or published plan is always reused. |
| `projectId` | string (uuid) | Có | Xem DTO và validation của endpoint. |
| `sessionId` | string (uuid) | Có | Xem DTO và validation của endpoint. |
| `sprintCount` | number | Không | minimum: 1; maximum: 8 |
| `startDate` | string (date-time) | Không | Xem DTO và validation của endpoint. |
| `requestId` | string (uuid) | Không | Client idempotency key: replays return the stored plan |

## IssueCertificateDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `userId` | string (uuid) | Có | Xem DTO và validation của endpoint. |

## LoginDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `email` | string (email) | Có | maxLength: 320 |
| `password` | string | Có | minLength: 1; maxLength: 72 |

## ProjectRoleSlotDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `roleCode` | string | Có | minLength: 1; maxLength: 64 |
| `requiredCount` | number | Có | minimum: 1; maximum: 50 |

## QuestionContentDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## RegisterDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## RequestAccessDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## ReviewSubmissionDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## ReviseEvaluationDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `scores` | array<EvaluationScoreInputDto> | Không | Xem DTO và validation của endpoint. |
| `summary` | string | Không | maxLength: 4000 |
| `reason` | string | Có | Required audit reason for the privileged correction; maxLength: 1000 |

## RevokeCertificateDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `reason` | string | Có | Required revocation reason (spec 50); maxLength: 512 |

## SaveAnswerDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `answerText` | string | Có | minLength: 1; maxLength: 5000 |

## SaveAttendanceDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## SelectRoleDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `role` | string | Có | Một trong: frontend, backend, fullstack, qa, business_analyst |

## SendAiMentorMessageDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `content` | string | Có | The intern question (plain text); minLength: 1; maxLength: 8000 |

## SetGroupRolesDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `roleCodes` | array<string> | Có | Xem DTO và validation của endpoint. |

## SetPreferenceDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `category` | string | Có | Một trong: system, task, session, evaluation, announcement, recruitment, kpi, salary, certificate |
| `enabled` | boolean | Có | Xem DTO và validation của endpoint. |

## SetProjectSlotsDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `slots` | array<ProjectRoleSlotDto> | Có | maxItems: 20 |

## SetUserStatusDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `status` | string | Có | Một trong: active, pending, locked, deleted |

## StartTemplateDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## SubmitTaskDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## TransitionKpiPeriodDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `status` | string | Có | Một trong: draft, open, calculating, finalized, closed |

## TransitionSprintDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `status` | string | Có | Target status (legal transitions enforced server-side); Một trong: planned, active, completed, cancelled |
| `allowOpenTasks` | boolean | Không | Explicit override for the open-tasks completion policy: complete even when open tasks remain (409 SPRINT_HAS_OPEN_TASKS otherwise). The override is audited.; default: False |

## UpdateCatalogItemDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## UpdateClassDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `meetingSchedule` | string | Không | maxLength: 128 |
| `meetingLocation` | string | Không | maxLength: 128 |
| `progress` | number | Không | minimum: 0; maximum: 100 |
| `name` | string | Không | minLength: 1; maxLength: 256 |
| `description` | string | Không | maxLength: 2000 |
| `leadInstructorId` | string (uuid) | Không | Xem DTO và validation của endpoint. |
| `sessionId` | string (uuid) | Không | Xem DTO và validation của endpoint. |
| `status` | string | Không | Một trong: upcoming, active, paused, completed, cancelled |
| `startDate` | string (date-time) | Không | Xem DTO và validation của endpoint. |
| `endDate` | string (date-time) | Không | Xem DTO và validation của endpoint. |

## UpdateClassLessonDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## UpdateEvaluationCriterionDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `code` | string | Không | maxLength: 64 |
| `name` | string | Không | maxLength: 128 |
| `description` | object | Không | maxLength: 512 |
| `weight` | number | Không | Percentage weight (2dp); active criteria must total exactly 100; minimum: 0.01; maximum: 100 |
| `maxScore` | number | Không | minimum: 0.1; maximum: 100; default: 100 |
| `sortOrder` | number | Không | default: 0 |
| `isRequired` | boolean | Không | default: True |

## UpdateEvaluationCycleDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `name` | string | Không | maxLength: 256 |
| `startDate` | string (date-time) | Không | Xem DTO và validation của endpoint. |
| `endDate` | string (date-time) | Không | Xem DTO và validation của endpoint. |
| `dueDate` | object (date-time) | Không | Xem DTO và validation của endpoint. |

## UpdateEvaluationDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `scores` | array<EvaluationScoreInputDto> | Có | Xem DTO và validation của endpoint. |
| `summary` | object | Không | maxLength: 4000 |

## UpdateGroupDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `name` | string | Không | maxLength: 128 |
| `description` | string | Không | maxLength: 512 |

## UpdateImportedReviewDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## UpdateKpiPeriodDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `code` | string | Không | maxLength: 64 |
| `name` | string | Không | maxLength: 256 |
| `startDate` | string (date-time) | Không | Inclusive start (UTC) |
| `endDate` | string (date-time) | Không | Exclusive end (UTC) |

## UpdateMilestoneDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `title` | string | Không | minLength: 1; maxLength: 256 |
| `description` | string | Không | maxLength: 2000 |
| `dueDate` | string (date-time) | Không | Xem DTO và validation của endpoint. |
| `status` | string | Không | Một trong: pending, in_progress, completed |
| `sortOrder` | number | Không | minimum: 0 |

## UpdateMyTaskDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `expectedVersion` | number | Không | Version observed by the client; stale edits return 409 TASK_VERSION_CONFLICT; minimum: 1 |
| `status` | string | Không | todo→doing, doing→review only (409 INVALID_TASK_TRANSITION otherwise); Một trong: todo, doing, review, done |
| `progress` | number | Không | minimum: 0; maximum: 100 |
| `reason` | string | Không | maxLength: 512 |

## UpdateProjectDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `name` | string | Không | minLength: 1; maxLength: 256 |
| `description` | string | Không | minLength: 1; maxLength: 4000 |
| `domainCategory` | string | Không | maxLength: 128 |
| `difficulty` | string | Không | Một trong: beginner, intermediate, advanced |
| `status` | string | Không | Một trong: draft, active, completed, archived |
| `mentorId` | string (uuid) | Không | Xem DTO và validation của endpoint. |
| `capacity` | number hoặc null | Không | minimum: 1 |
| `startDate` | string (date-time) | Không | Xem DTO và validation của endpoint. |
| `endDate` | string (date-time) | Không | Xem DTO và validation của endpoint. |
| `technologies` | array<string> | Không | maxItems: 50 |

## UpdateQuestionDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## UpdateSessionDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `name` | string | Không | minLength: 1; maxLength: 256 |
| `description` | string | Không | maxLength: 2000 |
| `status` | string | Không | Một trong: upcoming, active, ending, completed, cancelled |
| `leadInstructorId` | string (uuid) | Không | Xem DTO và validation của endpoint. |
| `startDate` | string (date-time) | Không | Xem DTO và validation của endpoint. |
| `endDate` | string (date-time) | Không | Xem DTO và validation của endpoint. |

## UpdateSettingDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## UpdateSprintDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `name` | string | Không | maxLength: 256 |
| `description` | string | Không | maxLength: 4000 |
| `goal` | string | Không | Sprint goal (activation notifies the project interns); maxLength: 512 |
| `startDate` | string (date-time) | Không | Xem DTO và validation của endpoint. |
| `endDate` | string (date-time) | Không | Xem DTO và validation của endpoint. |

## UpdateTaskDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `expectedVersion` | number | Không | Version observed by the client; stale edits return 409 TASK_VERSION_CONFLICT; minimum: 1 |
| `title` | string | Không | maxLength: 256 |
| `description` | string | Không | maxLength: 4000 |
| `sprintId` | string (uuid) | Không | Xem DTO và validation của endpoint. |
| `assigneeId` | object (uuid) hoặc null | Không | null = unassign |
| `priority` | string | Không | Một trong: low, medium, high, critical |
| `storyPoints` | number hoặc null | Không | minimum: 0; maximum: 1000 |
| `dueDate` | string (date-time) hoặc null | Không | Xem DTO và validation của endpoint. |
| `status` | string | Không | Presence triggers a server-enforced transition; Một trong: todo, doing, review, done |
| `reason` | string | Không | Transition reason (recorded in status history); maxLength: 512 |

## UpdateTemplateDto

OpenAPI chưa mô tả từng field. Đọc DTO/controller tương ứng; không suy diễn thêm trường.


## UpdateUserDto

| Field | Kiểu | Bắt buộc | Ý nghĩa / giới hạn |
|---|---|---|---|
| `displayName` | string | Không | maxLength: 128 |
| `username` | string | Không | minLength: 3; maxLength: 64 |
