import { QueryFailedError } from 'typeorm';

/**
 * SQL Server unique-violation detection:
 * 2601 = duplicate key in unique index, 2627 = PK/unique constraint.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (err instanceof QueryFailedError) {
    const driverError = err.driverError as { number?: number } | undefined;
    return driverError?.number === 2601 || driverError?.number === 2627;
  }
  return false;
}

/**
 * SQL Server deadlock victim (1205) — mapped to 409 ASSIGNMENT_CONFLICT by
 * the assignment transaction so a losing concurrent writer never surfaces
 * as a generic 500.
 */
export function isDeadlockViolation(err: unknown): boolean {
  if (err instanceof QueryFailedError) {
    const driverError = err.driverError as { number?: number } | undefined;
    return driverError?.number === 1205;
  }
  return false;
}
