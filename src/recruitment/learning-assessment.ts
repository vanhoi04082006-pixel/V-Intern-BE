interface AssessmentRow {
  technicalScore?: unknown;
  strengthsJson?: string | null;
  weaknessesJson?: string | null;
  criteriaJson?: string | null;
}
const score = (v: unknown): number | null => {
  if (v === null || v === undefined || (typeof v !== 'number' && typeof v !== 'string') || v === '') return null;
  const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};
function array(json?: string | null): unknown[] {
  try { const v: unknown = JSON.parse(json ?? '[]'); return Array.isArray(v) ? v.slice(0, 32) : []; } catch { return []; }
}
const textList = (json?: string | null): string[] => array(json).filter((v): v is string => typeof v === 'string').map(v => v.slice(0, 512)).slice(0, 10);
export function learningAssessment(row?: AssessmentRow | null) {
  const skillAssessment = array(row?.criteriaJson).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const v = item as Record<string, unknown>, value = score(v.score);
    return typeof v.code === 'string' && typeof v.feedback === 'string' && value !== null
      ? [{ code: v.code.slice(0, 64), score: value, feedback: v.feedback.slice(0, 2000) }] : [];
  });
  return {
    technicalScore: score(row?.technicalScore),
    englishScore: skillAssessment.find(c => c.code === 'english')?.score ?? null,
    strengths: textList(row?.strengthsJson), weaknesses: textList(row?.weaknessesJson), skillAssessment,
  };
}
