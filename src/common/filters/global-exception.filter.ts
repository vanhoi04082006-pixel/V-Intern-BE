import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

const DEFAULT_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_ERROR',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
};

/** Express body-parser errors are not Nest HttpExceptions. Never return their body/message. */
function parserFailure(error: unknown): { status: number; code: string; message: string } | null {
  if (!(error instanceof Error)) return null;
  const value = error as Error & { type?: unknown; status?: unknown };
  if (value.type === 'entity.too.large' && value.status === 413) return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the allowed size.' };
  if (value.type === 'entity.parse.failed' && value.status === 400) return { status: 400, code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' };
  if (value.type === 'encoding.unsupported' && value.status === 415) return { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Request body encoding is not supported.' };
  return null;
}

/** Run after the JSON parser, before Nest maps SyntaxError to an unsafe message. */
export function normalizeBodyParserError(error: unknown, _request: Request, _response: Response, next: NextFunction): void {
  const parsed = parserFailure(error);
  next(parsed ? new HttpException({ code: parsed.code, message: parsed.message }, parsed.status) : error);
}

/**
 * Unified error contract — every response has the shape:
 *   { statusCode, code, message, details?, traceId? }
 * Never leaks SQL exceptions, stack traces, connection strings or secrets:
 * internals are logged server-side only; the client receives a stable shape.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const traceId = randomUUID();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error.';
    let details: unknown;
    const parsed = parserFailure(exception);

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      code = DEFAULT_CODES[statusCode] ?? 'HTTP_ERROR';
      message = exception.message;
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        if (typeof b.code === 'string') code = b.code;
        if (typeof b.message === 'string') message = b.message;
        if (Array.isArray(b.message)) {
          // class-validator constraint list from ValidationPipe
          message = 'Validation failed.';
          details = b.message;
          code = 'VALIDATION_ERROR';
        }
        if (b.details !== undefined) details = b.details;
      }
      if (statusCode >= 500) {
        this.logger.error(`${request.method} ${request.url} -> ${statusCode} [${traceId}]`, exception.stack);
      }
    } else if (parsed) {
      statusCode = parsed.status; code = parsed.code; message = parsed.message;
    } else {
      this.logger.error(
        `${request.method} ${request.url} -> 500 [${traceId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json({
      statusCode,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      traceId,
    });
  }
}
