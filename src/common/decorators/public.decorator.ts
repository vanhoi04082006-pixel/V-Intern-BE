import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'vintern:isPublic';

/** Marks an endpoint as public (no bearer token required). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
