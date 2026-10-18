import { BadRequestException } from '@nestjs/common';
export interface AiRuntimePolicy { model: string; timeoutMs: number; maxRetries: number; version: number }
export function validateAiRuntimePolicy(raw: unknown): AiRuntimePolicy {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Invalid AI runtime policy.');
  const v = raw as Record<string, unknown>;
  if (Object.keys(v).some(key => !['model', 'timeoutMs', 'maxRetries', 'version'].includes(key)) || typeof v.model !== 'string' || !/^gemini[a-z0-9._-]{1,100}$/.test(v.model)
    || !Number.isSafeInteger(v.timeoutMs) || Number(v.timeoutMs) < 10000 || Number(v.timeoutMs) > 180000
    || !Number.isSafeInteger(v.maxRetries) || Number(v.maxRetries) < 0 || Number(v.maxRetries) > 3
    || !Number.isSafeInteger(v.version) || Number(v.version) < 0) throw new BadRequestException('Model must be a Gemini model ID; timeout 10000–180000ms, retries 0–3, version >=0.');
  return { model: v.model, timeoutMs: Number(v.timeoutMs), maxRetries: Number(v.maxRetries), version: Number(v.version) };
}
