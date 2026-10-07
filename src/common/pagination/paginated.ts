/**
 * Unified paginated response shape:
 *   { data: T[], meta: { page, pageSize, total, totalPages } }
 * Applied consistently to users, roles, permissions, groups, catalogs,
 * audit logs, activity events and notifications.
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export function toPaginated<T>(items: T[], page: number, pageSize: number, total: number): Paginated<T> {
  return {
    data: items,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}
