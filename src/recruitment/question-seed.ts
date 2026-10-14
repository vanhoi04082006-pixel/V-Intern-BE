import { DataSource, In } from 'typeorm';
import { InterviewQuestion } from './entities/interview-question.entity';
import { RECRUITMENT_ROLE_CODES } from './recruitment-roles';

/**
 * Phase 4 question-bank seed (spec 50/51) — PRODUCT CONFIGURATION, not
 * demo data: real role-specific prompts (never "Question 1"/lorem ipsum).
 *
 * Each role has 8 technical, 5 legacy soft, 2 introduction and 2 English
 * questions. New sessions select 2 introduction + 6 technical + 2 English;
 * legacy sessions keep their immutable eight-question snapshots.
 *
 * IDEMPOTENCE (spec 50): rows are keyed by (roleCode, sortOrder) — reruns
 * insert ONLY missing rows and never rewrite existing ones. Admin question
 * CRUD is deferred (spec 52): Phase 4 manages the bank through this seed,
 * documented in the final report (no fake admin buttons).
 *
 * SECURITY: rubric JSON below is INTERNAL ONLY — it is snapshotted into
 * interview_session_questions and NEVER returned by any API (spec 10/42).
 */

interface SeedQuestion {
  sortOrder: number;
  category: 'technical' | 'soft';
  difficulty: 'easy' | 'medium' | 'hard';
  prompt: string;
  rubric: { expected: string; keywords: string[]; scoringGuide: string; phase?: string };
}

const technical = (
  sortOrder: number,
  difficulty: SeedQuestion['difficulty'],
  prompt: string,
  expected: string,
  keywords: string[],
): SeedQuestion => ({
  sortOrder,
  category: 'technical',
  difficulty,
  prompt,
  rubric: {
    expected,
    keywords,
    scoringGuide:
      '0-40: missing/wrong or evasive; 41-70: partial, no concrete examples; 71-85: correct with concrete reasoning and trade-offs; 86-100: deep, precise, real-world grounded.',
  },
});

const soft = (
  sortOrder: number,
  difficulty: SeedQuestion['difficulty'],
  prompt: string,
  expected: string,
  keywords: string[],
): SeedQuestion => ({
  sortOrder,
  category: 'soft',
  difficulty,
  prompt,
  rubric: {
    expected,
    keywords,
    scoringGuide:
      '0-40: generic filler; 41-70: some structure but vague; 71-85: clear, concrete, self-aware; 86-100: reflective with real ownership and growth.',
  },
});

// ── frontend (8 technical + 5 soft) ─────────────────────────────────────────
const FRONTEND: SeedQuestion[] = [
  technical(
    1,
    'easy',
    'Walk through what happens in the browser from the moment a user enters a URL until a React page becomes interactive.',
    'DNS → TCP/TLS → HTTP request → HTML parse → CSSOM/DOM → script loading (async/defer) → hydration/event binding. "Interactive" = listeners attached and state wired.',
    ['dns', 'dom', 'hydration', 'defer', 'event'],
  ),
  technical(
    2,
    'easy',
    'Explain the difference between state and props in React, and when you would lift state up.',
    'Props flow down read-only; state is owned locally. Lift state when two siblings need the same source of truth (e.g. a filter input controlling a list).',
    ['props', 'state', 'lift', 'one-way'],
  ),
  technical(
    3,
    'medium',
    'A data table with 10,000 rows renders slowly. Name at least two concrete techniques to make it smooth.',
    'Windowing/virtualization, pagination, memoization, stable keys, avoiding inline object/array props, web workers for heavy transforms.',
    ['virtualization', 'pagination', 'memo', 'key'],
  ),
  technical(
    4,
    'medium',
    'Why validate a form on both client and server? What does each layer protect?',
    'Client validation = UX (instant feedback), never security. Server validation is the security boundary against forged requests. Example: price/role fields never trust the client.',
    ['ux', 'security', 'never trust', 'server'],
  ),
  technical(
    5,
    'medium',
    'How do you debug a component that re-renders far more often than expected?',
    'Profiler/why-did-you-render, unstable hook dependencies, context value identity, memo with correct deps, moving state down or extracting expensive subtrees.',
    ['profiler', 'dependencies', 'memo', 'context'],
  ),
  technical(
    6,
    'hard',
    'A dashboard needs near-real-time updates. Compare polling, Server-Sent Events and WebSockets for this case.',
    'Polling: simple, latency/cost trade-off. SSE: one-way, auto-reconnect, HTTP-friendly. WS: bidirectional but needs infra (reconnect, sticky sessions). Choose by direction, scale and failure handling.',
    ['polling', 'sse', 'websocket', 'reconnect'],
  ),
  technical(
    7,
    'hard',
    'Explain CSS specificity and how you resolve a conflict between a utility class and a component stylesheet without !important.',
    'Specificity order (inline > id > class > element), layered approaches (@layer, CSS modules, design tokens), restructuring selectors instead of forcing.',
    ['specificity', 'cascade', 'layer', 'selector'],
  ),
  technical(
    8,
    'hard',
    'How do you make a complex form resilient: offline edits, concurrent updates, and validation errors?',
    'Optimistic UI with conflict handling, dirty-state tracking, autosave with retry, server-side validation mirrored client-side, clear error recovery UX.',
    ['optimistic', 'conflict', 'autosave', 'recovery'],
  ),
  soft(
    9,
    'easy',
    'Why do you want to become a frontend developer? What attracts you to this work specifically?',
    'Genuine, concrete motivation (UI craft, user impact, product thinking) — not generic filler.',
    ['user', 'product', 'craft'],
  ),
  soft(
    10,
    'medium',
    'A designer insists on a layout that you believe will break on small screens. How do you handle it?',
    'Empathize first, present evidence (data/testing on devices), propose alternatives that preserve design intent, agree on criteria and follow up.',
    ['evidence', 'alternative', 'empathy', 'criteria'],
  ),
  soft(
    11,
    'medium',
    'Tell me about a time you received hard feedback about your UI work. What did you change afterwards?',
    'Non-defensive reception, concrete behavior change, learning applied to later work.',
    ['feedback', 'change', 'learned'],
  ),
  soft(
    12,
    'medium',
    'Describe a situation where you had to say no to a stakeholder request. How did you keep the relationship intact?',
    'Data-driven refusal, alternatives offered, transparent criteria, empathy for the stakeholder goal.',
    ['no', 'alternative', 'criteria'],
  ),
  soft(
    13,
    'hard',
    'You are the only frontend developer and the deadline is at risk. Walk me through how you communicate and re-plan.',
    'Early escalation, scope negotiation (must/should/could), transparent progress, asking for help instead of silent heroics.',
    ['escalate', 'scope', 'communicate'],
  ),
];

// ── backend (8 technical + 5 soft) ──────────────────────────────────────────
const BACKEND: SeedQuestion[] = [
  technical(
    1,
    'easy',
    'Explain the difference between authentication and authorization, with one concrete example of each.',
    'Authn = who you are (login/JWT); authz = what you may do (permission/role check). Example: JWT identifies the user; a permission guard blocks access to admin endpoints.',
    ['authentication', 'authorization', 'permission', 'jwt'],
  ),
  technical(
    2,
    'easy',
    'Why must a password-reset endpoint never trust a client-supplied userId? What do you use instead?',
    'Identity comes from the verified session/token, never the request body — otherwise account takeover. Server derives the principal from the JWT.',
    ['principal', 'token', 'takeover', 'server-side'],
  ),
  technical(
    3,
    'medium',
    'A REST endpoint takes 8 seconds because it calls three slow services sequentially. How do you fix it and what are the risks?',
    'Parallelize independent calls, cache, precompute, or queue. Risks: partial failure handling, timeout budgets, consistency, upstream rate limits.',
    ['parallel', 'cache', 'timeout', 'queue'],
  ),
  technical(
    4,
    'medium',
    'Two admins try to assign the same intern at the same moment. Explain transactions and isolation in this scenario.',
    'Atomic transaction, row locks (pessimistic) or optimistic versioning, unique/filtered constraints as the hard guarantee; the loser must get a clean conflict error, never corrupted state.',
    ['transaction', 'lock', 'unique', 'conflict'],
  ),
  technical(
    5,
    'medium',
    'Design the data model for a task board (projects, sprints, tasks, status history). Which indexes and constraints do you add and why?',
    'Deliberate FK delete actions (avoid multiple cascade paths), status CHECK constraints, filtered unique index for one-active-sprint, append-only history, composite indexes on (project, status).',
    ['foreign key', 'index', 'constraint', 'history'],
  ),
  technical(
    6,
    'hard',
    'What does idempotency mean for a submission endpoint, and how do you implement it?',
    'Same request twice → same outcome, no duplicates: state-machine guards, unique constraints, or idempotency keys; double-submit must converge instead of erroring dangerously.',
    ['idempotent', 'unique', 'state machine', 'converge'],
  ),
  technical(
    7,
    'hard',
    'When would you move work out of the HTTP request into a queue/worker? Give a concrete example and its failure mode.',
    'Long/expensive/unreliable work (emails, AI calls, exports). Failure modes: retries, dead-letters, duplicate delivery → consumers must be idempotent; monitoring lag.',
    ['queue', 'worker', 'retry', 'dead-letter'],
  ),
  technical(
    8,
    'hard',
    'How do you integrate an AI provider into a backend safely: timeouts, output validation, cost control? Be concrete.',
    'Bounded per-attempt timeout (AbortController), strict schema validation of model output, never trust model decisions, per-user rate limits, provenance/logging, honest failure states.',
    ['timeout', 'validate', 'rate limit', 'provenance'],
  ),
  soft(
    9,
    'easy',
    'Why backend systems? What do you enjoy about data integrity, scale and architecture?',
    'Genuine motivation with concrete interests (correctness, performance, design), not buzzwords.',
    ['integrity', 'scale', 'design'],
  ),
  soft(
    10,
    'medium',
    'Your migration fails in production staging with a constraint error. How do you respond?',
    'Stop, assess impact, communicate early, roll back or repair with a documented plan, add a regression guard, honest post-mortem without blame.',
    ['rollback', 'communicate', 'post-mortem'],
  ),
  soft(
    11,
    'medium',
    'Tell me about a technical decision you made that turned out wrong. What did you do?',
    'Ownership without excuses, early detection, correction plan, lesson applied later.',
    ['own', 'correct', 'learned'],
  ),
  soft(
    12,
    'medium',
    'A teammate reviews your code and strongly disagrees with your design. Walk me through the conversation.',
    'Listen for the underlying concern, evidence-based discussion, agree on criteria or a small experiment, commit to the decision professionally.',
    ['evidence', 'criteria', 'decision'],
  ),
  soft(
    13,
    'hard',
    'You are behind schedule and the bug is subtle and intermittent. What do you do?',
    'Time-boxing, isolation and instrumentation, honest status updates, asking for help, documenting what was tried.',
    ['time-box', 'isolate', 'communicate', 'ask'],
  ),
];

// ── qa (8 technical + 5 soft) ───────────────────────────────────────────────
const QA: SeedQuestion[] = [
  technical(
    1,
    'easy',
    'What is the difference between smoke, regression and acceptance testing? When do you run each?',
    'Smoke = build health after changes; regression = nothing broke across the suite; acceptance = business criteria met before release.',
    ['smoke', 'regression', 'acceptance'],
  ),
  technical(
    2,
    'easy',
    'What belongs in a good bug report? Give the structure you actually use.',
    'Title, environment, steps to reproduce, expected vs actual, evidence (screenshots/logs/IDs), severity and priority, reproducibility rate — no blame, no speculation presented as fact.',
    ['steps', 'expected', 'actual', 'severity'],
  ),
  technical(
    3,
    'medium',
    'Explain the testing pyramid. What are the risks of relying mostly on end-to-end tests?',
    'Many fast unit tests, fewer integration, few E2E. E2E-heavy suites are slow, flaky, late-failing and hard to localize; balance levels and ownership.',
    ['unit', 'integration', 'e2e', 'flaky'],
  ),
  technical(
    4,
    'medium',
    'An endpoint must reject a second active assignment for the same intern. How do you test that rule — including concurrent requests?',
    'Positive/negative API cases, direct DB constraint checks, concurrent pairs expecting exactly one success and one conflict, asserting error codes (not just status), data cleanup.',
    ['concurrency', 'constraint', 'conflict', 'error code'],
  ),
  technical(
    5,
    'medium',
    'A bug appears only once every ~50 submissions under concurrent use. How do you investigate and report it?',
    'Reproduction strategy (load, concurrency, seeded data), logs/monitoring correlation, minimal reproduction, precise report with environment and evidence, severity vs frequency.',
    ['reproduce', 'concurrency', 'logs', 'report'],
  ),
  technical(
    6,
    'hard',
    'What must a regression suite for a login flow include?',
    'Valid login, wrong password, locked/disabled account, token expiry/rotation, replayed refresh token, rate limiting, session invalidation on password change.',
    ['locked', 'expiry', 'refresh', 'rate limit'],
  ),
  technical(
    7,
    'hard',
    'How would you test an AI evaluation feature whose outputs are not deterministic?',
    'Contract testing of structured output, boundary fixtures, injection-attempt cases, timeout/failure simulation, idempotency checks, acceptable ranges instead of exact matches.',
    ['contract', 'boundary', 'timeout', 'range'],
  ),
  technical(
    8,
    'hard',
    'How do you decide test severity vs priority? Give an example where they differ.',
    'Severity = technical impact; priority = business urgency. Example: cosmetic crash on the demo path for the CEO = low severity, high priority.',
    ['severity', 'priority', 'impact'],
  ),
  soft(
    9,
    'easy',
    'Why quality assurance? What do you enjoy about this career direction?',
    'Genuine interest in quality, systematic thinking, user advocacy.',
    ['quality', 'curiosity', 'user'],
  ),
  soft(
    10,
    'medium',
    'A developer disagrees that your finding is a bug. Walk me through a real conversation you would have.',
    'Evidence-based discussion, reproducing together, understanding intent vs spec, escalating through agreed criteria, keeping the relationship professional.',
    ['evidence', 'reproduce', 'escalate'],
  ),
  soft(
    11,
    'medium',
    'Tell me about a time you missed a bug that later caused an issue. What changed in your process?',
    'Ownership, root-cause thinking, concrete process change (checklist, new test class), no defensiveness.',
    ['own', 'process', 'change'],
  ),
  soft(
    12,
    'medium',
    'How do you keep stakeholders aligned when the build is unstable and the deadline is close?',
    'Prioritization by risk, communicating instability early, smoke-first strategy, documenting blocked coverage.',
    ['prioritize', 'smoke', 'communicate'],
  ),
  soft(
    13,
    'hard',
    'You are asked to sign off a release but one critical test is still failing intermittently. What do you do?',
    'Honest sign-off with documented risk, reproducibility push, escalation with evidence, options and trade-offs — never a silent pass.',
    ['sign-off', 'risk', 'escalate'],
  ),
];

// ── business_analyst (8 technical + 5 soft) ─────────────────────────────────
const BUSINESS_ANALYST: SeedQuestion[] = [
  technical(
    1,
    'easy',
    'What is the difference between a user story and a requirement? Write one example user story with acceptance criteria.',
    'Story = user value in role/goal/benefit form; requirement = specific system behavior. Example with Given/When/Then acceptance criteria.',
    ['user story', 'acceptance criteria', 'value'],
  ),
  technical(
    2,
    'easy',
    'A stakeholder says "the system is too slow". How do you turn that into an actionable requirement?',
    'Quantify: which screens, data volumes, current vs target times, percentiles, business impact; convert to measurable acceptance criteria.',
    ['quantify', 'measurable', 'stakeholder', 'target'],
  ),
  technical(
    3,
    'medium',
    'How do you prioritize a backlog when every stakeholder claims their feature is the most important?',
    'Objective criteria (value/effort/risk, RICE/WSJF), business goal alignment, transparent trade-off discussion, documented decision.',
    ['prioritize', 'criteria', 'goal', 'trade-off'],
  ),
  technical(
    4,
    'medium',
    'What does a good acceptance criterion for "the intern workspace shows the right status" look like?',
    'Enumerated states (recruitment_required/unassigned/active), Given/When/Then per state, edge cases, no ambiguous words like "fast" or "correct".',
    ['given', 'when', 'then', 'states'],
  ),
  technical(
    5,
    'medium',
    'A process has three hand-offs and constant delays. How do you analyze it and propose an improvement?',
    'Process mapping (as-is), identifying bottleneck/waste, data collection, to-be proposal with trade-offs and success metrics, rollout and validation plan.',
    ['as-is', 'to-be', 'bottleneck', 'metric'],
  ),
  technical(
    6,
    'hard',
    'How do you gather requirements for a feature nobody in the company has built before (e.g. AI screening)?',
    'Stakeholder interviews, jobs-to-be-done, competitor/benchmark analysis, prototype feedback loops, defining success metrics and risks before build.',
    ['interview', 'prototype', 'metric', 'risk'],
  ),
  technical(
    7,
    'hard',
    'The client changes a core requirement two weeks before launch. Walk through your analysis and response.',
    'Impact analysis (scope/cost/risk/timeline), options with trade-offs (defer, phase, cut), transparent escalation, documented decision.',
    ['impact', 'option', 'escalate', 'decision'],
  ),
  technical(
    8,
    'hard',
    'How do you make sure a requirement cannot be misread by BOTH the developer and the tester?',
    'Unambiguous language, explicit states and rules, examples and counter-examples, data definitions, edge cases, traceability to the business goal.',
    ['unambiguous', 'example', 'edge case', 'traceability'],
  ),
  soft(
    9,
    'easy',
    'Why business analysis? What do you enjoy about bridging business and technology?',
    'Genuine motivation, concrete interests in problem-solving and communication.',
    ['motivation', 'bridge', 'concrete'],
  ),
  soft(
    10,
    'medium',
    'Describe a situation with conflicting information from two sources. How did you decide which to trust?',
    'Verification strategy, primary sources, documenting assumptions, asking clarifying questions.',
    ['verify', 'source', 'assumption'],
  ),
  soft(
    11,
    'medium',
    'Tell me about a requirement you wrote that was misunderstood anyway. What did you change?',
    'Ownership of the communication gap, concrete improvement (examples, reviews, walkthroughs), humility.',
    ['misunderstood', 'improve', 'review'],
  ),
  soft(
    12,
    'medium',
    'How do you make sure stakeholders stay aligned during a long project?',
    'Regular demos/status, shared artifacts, decision logs, early bad-news delivery.',
    ['demo', 'artifact', 'decision log'],
  ),
  soft(
    13,
    'hard',
    'Two executives want opposite things from the same feature. How do you move forward?',
    'Objective framing of the underlying business goals, options with trade-offs, facilitated decision, documented criteria, transparent communication.',
    ['objective', 'options', 'facilitate', 'decision'],
  ),
];

const BANK: Record<string, SeedQuestion[]> = {
  frontend: FRONTEND,
  backend: BACKEND,
  qa: QA,
  business_analyst: BUSINESS_ANALYST,
};

// New rows have stable sort orders; existing bank edits remain untouched.
for (const [role, questions] of Object.entries(BANK)) {
  const communication: Array<[string, string, string]> = [
    ['introduction', 'Chào bạn! Bạn có thể giới thiệu ngắn về việc học và một sản phẩm hoặc bài tập mà bạn đã làm không?', 'Nêu trải nghiệm có thật, vai trò của bản thân, kết quả và điều đã học; không chấm dựa vào tên trường hoặc thông tin cá nhân nhạy cảm.'],
    ['introduction', `Vì sao bạn chọn vai trò ${role}, và bạn muốn học điều gì trong kỳ thực tập này?`, 'Mục tiêu thực tế, hiểu trách nhiệm vai trò, biết điểm cần cải thiện và có kế hoạch học tập.'],
    ['english', `Please describe, in English, how you would ask a teammate for help with a difficult ${role} task.`, 'Clear description of the problem, attempted solutions and a specific respectful request. Assess understandable English, not accent or personal background.'],
    ['english', 'Please give a short progress update in English: what you finished, what you will do next and what is blocking you.', 'Understandable concise English covering completed work, next action and an explicit blocker or no blocker.'],
  ];
  communication.forEach(([phase, prompt, expected], i) => questions.push({ sortOrder: 14 + i, category: 'soft', difficulty: 'easy', prompt, rubric: { phase, expected, keywords: [], scoringGuide: '0-40: absent or off-topic; 41-70: partly clear; 71-85: relevant and concrete; 86-100: clear, specific and reflective. Do not infer protected or personal attributes.' } }));
}

export const QUESTION_BANK_TOTAL = Object.values(BANK).reduce((n, rows) => n + rows.length, 0);

export interface EnsureQuestionsResult {
  inserted: number;
  totalPerRole: Record<string, number>;
}

/**
 * Idempotent question-bank seed (spec 50): keyed by (roleCode, sortOrder) —
 * reruns insert only missing rows, never rewrite or duplicate.
 */
export async function ensureRecruitmentQuestions(ds: DataSource): Promise<EnsureQuestionsResult> {
  const repo = ds.getRepository(InterviewQuestion);
  const existing = await repo.find({
    where: { roleCode: In(RECRUITMENT_ROLE_CODES as string[]) },
    select: ['roleCode', 'sortOrder'],
  });
  const existingKeys = new Set(existing.map((q) => `${q.roleCode}:${q.sortOrder}`));

  let inserted = 0;
  const totalPerRole: Record<string, number> = {};
  for (const [roleCode, questions] of Object.entries(BANK)) {
    let roleTotal = 0;
    for (const q of questions) {
      roleTotal += 1;
      const key = `${roleCode}:${q.sortOrder}`;
      if (existingKeys.has(key)) continue;
      await repo.insert(
        repo.create({
          roleCode,
          category: q.category,
          difficulty: q.difficulty,
          prompt: q.prompt,
          rubricJson: JSON.stringify(q.rubric),
          isActive: true,
          sortOrder: q.sortOrder,
        }),
      );
      inserted += 1;
    }
    totalPerRole[roleCode] = roleTotal;
  }
  return { inserted, totalPerRole };
}
