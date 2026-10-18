import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Sealed grading-contract view (operator surfaces only).
 *
 * A sealed contract is an operator-controlled entry in GRADING_SUITES_JSON
 * that binds a template/task pair to the exact suite identity known to the
 * isolated runner (contract id + SHA-256 suite digest). Operator metadata
 * (version/reviewer/sealedAt/images) is recorded at seal time; legacy sealed
 * entries may predate it and are surfaced as incomplete, never mutated here.
 */

export interface ContractOperatorMeta {
  version?: unknown;
  reviewer?: unknown;
  sealedAt?: unknown;
  runtimeImage?: unknown;
  testerImage?: unknown;
}

export interface SealedContractView {
  key: string;
  suiteId: string | null;
  digest: string | null;
  status: 'active' | 'invalid';
  issues: Array<{ code: string; detail: string }>;
  operator: {
    version: string | null;
    reviewer: string | null;
    sealedAt: string | null;
    images: { runtime: string | null; tester: string | null };
    complete: boolean;
  };
}

const SHA256 = /^[0-9a-f]{64}$/i;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
const CLEAN_FIELD = /^[^{}\s]{1,160}$/;

function issue(list: SealedContractView['issues'], code: string, detail: string): void {
  list.push({ code, detail });
}

/** Rejects impossible calendar values (february 30th) that JS Date would silently roll over. */
function isRealUtcInstant(text: string): boolean {
  const instant = new Date(text);
  if (Number.isNaN(instant.getTime())) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/.exec(text);
  if (!m) return false;
  const [, year, month, day, hour, minute, second, fraction] = m;
  const ms = Math.round(Number(`${(fraction ?? '0').slice(0, 3).padEnd(3, '0')}`));
  return (
    instant.getUTCFullYear() === +year &&
    instant.getUTCMonth() + 1 === +month &&
    instant.getUTCDate() === +day &&
    instant.getUTCHours() === +hour &&
    instant.getUTCMinutes() === +minute &&
    instant.getUTCSeconds() === +second &&
    Math.abs(instant.getUTCMilliseconds() - ms) <= 1
  );
}

function describe(key: string, raw: unknown, duplicateIds: Set<string>): SealedContractView {
  const view: SealedContractView = {
    key,
    suiteId: null,
    digest: null,
    status: 'active',
    issues: [],
    operator: { version: null, reviewer: null, sealedAt: null, images: { runtime: null, tester: null }, complete: false },
  };
  if (!key || typeof key !== 'string') {
    issue(view.issues, 'KEY_INVALID', 'Contract key must be a non-empty string.');
    view.status = 'invalid';
    return view;
  }
  if (!key.includes(':')) {
    // Keys without the "<templateCode>:<taskId>" shape can never be resolved by the runner lookup.
    issue(view.issues, 'KEY_FORMAT', 'Expected key shape "<templateCode>:<taskId>".');
    view.status = 'invalid';
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    issue(view.issues, 'ENTRY_INVALID', 'Contract entry must be a JSON object.');
    view.status = 'invalid';
    return view;
  }
  const entry = raw as { id?: unknown; digest?: unknown; meta?: unknown };
  if (typeof entry.id !== 'string' || !entry.id.trim()) {
    issue(view.issues, 'ID_INVALID', 'suiteId must be a non-empty string.');
    view.status = 'invalid';
  } else {
    view.suiteId = entry.id;
    if (duplicateIds.has(entry.id)) {
      issue(view.issues, 'ID_DUPLICATE', `suiteId "${entry.id.slice(0, 64)}" is bound by more than one contract.`);
      view.status = 'invalid';
    }
  }
  if (typeof entry.digest !== 'string' || !SHA256.test(entry.digest)) {
    issue(view.issues, 'DIGEST_INVALID', 'digest must be a SHA-256 hex string; the runner will refuse to grade from an unbound digest.');
    view.status = 'invalid';
  } else {
    view.digest = entry.digest;
  }
  const meta = (entry.meta ?? undefined) as ContractOperatorMeta | undefined;
  if (meta !== undefined && (typeof meta !== 'object' || meta === null || Array.isArray(meta))) {
    issue(view.issues, 'META_INVALID', 'meta, when present, must be an object with version/reviewer/sealedAt.');
    view.status = 'invalid';
  } else if (meta) {
    const versionRaw = typeof meta.version === 'string' ? meta.version : null;
    const reviewerRaw = typeof meta.reviewer === 'string' ? meta.reviewer : null;
    const sealedAtRaw = typeof meta.sealedAt === 'string' ? meta.sealedAt : null;
    const runtimeRaw = typeof meta.runtimeImage === 'string' ? meta.runtimeImage : null;
    const testerRaw = typeof meta.testerImage === 'string' ? meta.testerImage : null;
    const version = versionRaw === null ? null : CLEAN_FIELD.test(versionRaw) ? versionRaw : versionRaw.slice(0, 160);
    const reviewer = reviewerRaw === null ? null : reviewerRaw.slice(0, 160);
    const sealedAt = sealedAtRaw === null ? null : sealedAtRaw.slice(0, 40);
    const runtime = runtimeRaw !== null && CLEAN_FIELD.test(runtimeRaw) ? runtimeRaw : null;
    const tester = testerRaw !== null && CLEAN_FIELD.test(testerRaw) ? testerRaw : null;
    view.operator = { version, reviewer, sealedAt, images: { runtime, tester }, complete: Boolean(version && reviewer && sealedAt && runtime && tester) };
    if (!view.operator.complete) issue(view.issues, 'OPERATOR_META_INCOMPLETE', 'Seal metadata incomplete: record version/reviewer/sealedAt and both image references when re-sealing (GRADING_CONTRACTS.md).');
    if (sealedAt && !(ISO_UTC.test(sealedAt) && isRealUtcInstant(sealedAt))) {
      issue(view.issues, 'SEALED_AT_INVALID', 'meta.sealedAt must be a real ISO-8601 UTC timestamp.');
      view.status = 'invalid';
    }
  } else {
    issue(view.issues, 'OPERATOR_META_INCOMPLETE', 'Sealed before operator metadata existed; re-seal to record version/reviewer/sealedAt/images (GRADING_CONTRACTS.md).');
  }
  return view;
}

export function parseSealedSuitesText(text: string | undefined | null): { contracts: SealedContractView[]; valid: boolean; error: string | null } {
  if (!text || !text.trim()) {
    return { contracts: [], valid: true, error: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { contracts: [], valid: false, error: `GRADING_SUITES_JSON is not valid JSON: ${(e as Error).message.slice(0, 160)}` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { contracts: [], valid: false, error: 'GRADING_SUITES_JSON must be a JSON object keyed by "<templateCode>:<taskId>".' };
  }
  const entries = parsed as Record<string, unknown>;
  const duplicateIds = new Set<string>();
  const seen = new Set<string>();
  for (const value of Object.values(entries)) {
    const id = (value as { id?: unknown } | null)?.id;
    if (typeof id === 'string' && id.trim()) {
      if (seen.has(id)) duplicateIds.add(id);
      seen.add(id);
    }
  }
  const contracts = Object.entries(entries).map(([key, value]) => describe(key, value, duplicateIds));
  return { contracts, valid: contracts.every(c => c.status === 'active'), error: null };
}

export class ContractDraftDto {
  @IsString()
  @MinLength(1)
  @MaxLength(400000)
  data!: string;
}
