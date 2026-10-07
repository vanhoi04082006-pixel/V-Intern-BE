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
