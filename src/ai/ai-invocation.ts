import type {
  AiStructuredRequest,
  AiStructuredResult,
} from "./ai-provider.interface";
import type { AiRun } from "./entities/ai-run.entity";
export interface AiInvocation<T> {
  feature: string;
  userId: string | null;
  actorId?: string;
  intentId?: string;
  resourceType: string;
  resourceId: string;
  promptVersion: string;
  maxRetries?: number;
  request: AiStructuredRequest<T>;
}
export interface AiOutcome<T> {
  data: T;
  run: AiRun;
  result: AiStructuredResult<T>;
}
export type AiTransport = <T>(params: AiInvocation<T>) => Promise<AiOutcome<T>>;
