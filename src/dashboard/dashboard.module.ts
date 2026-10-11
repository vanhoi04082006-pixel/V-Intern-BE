import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ReferenceController } from './reference.controller';
import { ImportedReviewsController } from './imported-reviews.controller';

@Module({ imports: [RbacModule], controllers: [DashboardController, ReferenceController, ImportedReviewsController], providers: [DashboardService] })
export class DashboardModule {}
