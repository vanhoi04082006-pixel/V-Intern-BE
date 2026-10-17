import { parseSealedSuitesText } from './admin-contracts';

describe('Sealed grading-contract surfaces (operator view)', () => {
  it('keeps a correctly sealed operator contract active and renders the seal metadata', () => {
    const sealed = JSON.stringify({
      'LEARN-NOTES-V1:b2d1f16a-d64e-48ba-853e-82bf28854ff4': {
        id: 'notes-foundation',
        digest: 'a'.repeat(64),
        meta: {
          version: 'v1.0.0',
          reviewer: 'operator@vintern.edu.vn',
          sealedAt: '2026-10-17T06:00:00Z',
          runtimeImage: 'sha256:vintern-notes-runtime@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          testerImage: 'node:22-bookworm-slim@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        },
      },
    });
    const { contracts, valid, error } = parseSealedSuitesText(sealed);
    expect(error).toBeNull();
    expect(valid).toBe(true);
    expect(contracts).toHaveLength(1);
    expect(contracts[0]).toMatchObject({ key: 'LEARN-NOTES-V1:b2d1f16a-d64e-48ba-853e-82bf28854ff4', suiteId: 'notes-foundation', digest: 'a'.repeat(64), status: 'active', issues: [] });
    expect(contracts[0].operator).toMatchObject({ version: 'v1.0.0', reviewer: 'operator@vintern.edu.vn', sealedAt: '2026-10-17T06:00:00Z', complete: true });
  });

  it('flags a draft-grade entry as invalid instead of silently trusting it', () => {
    const { contracts, valid } = parseSealedSuitesText(JSON.stringify({ 'T:t': { id: 'x', digest: 'ZZ'.repeat(32) } }));
    expect(valid).toBe(false);
    expect(contracts[0].status).toBe('invalid');
    expect(contracts[0].issues.map(i => i.code)).toContain('DIGEST_INVALID');
  });

  it('rejects duplicate suite identifiers and non-object payloads', () => {
    const dup = JSON.stringify({ 'T:A': { id: 'same', digest: 'a'.repeat(64) }, 'T:B': { id: 'same', digest: 'a'.repeat(64) } });
    const parsed = parseSealedSuitesText(dup);
    expect(parsed.valid).toBe(false);
    expect(parsed.contracts.every(c => c.status === 'invalid')).toBe(true);
    const wrong = parseSealedSuitesText('[]');
    expect(wrong.valid).toBe(false);
    expect(wrong.error).toContain('must be a JSON object');
  });

  it('reports pre-metadata seals as incomplete, never as re-sealed data', () => {
    const legacy = JSON.stringify({ 'T:task': { id: 'legacy-qa', digest: 'a'.repeat(64) } });
    const { contracts, valid } = parseSealedSuitesText(legacy);
    expect(valid).toBe(true); // legacy sealed pair stays gradeable
    expect(contracts[0].operator.complete).toBe(false);
    expect(contracts[0].issues.map(i => i.code)).toContain('OPERATOR_META_INCOMPLETE');
  });

  it('treats malformed seal timestamps as invalid and empty config as configured-but-none', () => {
    const bad = parseSealedSuitesText(JSON.stringify({ 'T:task': { id: 'x', digest: 'a'.repeat(64), meta: { sealedAt: 'in-quá-khứ' } } }));
    expect(bad.valid).toBe(false);
    expect(bad.contracts[0].issues.map(i => i.code)).toContain('SEALED_AT_INVALID');
    const impossible = parseSealedSuitesText(JSON.stringify({ 'T:task': { id: 'x', digest: 'a'.repeat(64), meta: { sealedAt: '2026-13-45T99:99:99Z' } } }));
    expect(impossible.valid).toBe(false);
    expect(impossible.contracts[0].issues.map(i => i.code)).toContain('SEALED_AT_INVALID');
    const none = parseSealedSuitesText('');
    expect(none).toEqual({ contracts: [], valid: true, error: null });
    const broken = parseSealedSuitesText('{"T":');
    expect(broken.valid).toBe(false);
    expect(broken.error).toContain('not valid JSON');
  });

  it('rejects keys the runner could never resolve as active contracts', () => {
    const unshaped = parseSealedSuitesText(JSON.stringify({ 'no-colon-shape': { id: 'x', digest: 'a'.repeat(64) } }));
    expect(unshaped.valid).toBe(false);
    expect(unshaped.contracts[0].issues.map(i => i.code)).toContain('KEY_FORMAT');
  });
});
