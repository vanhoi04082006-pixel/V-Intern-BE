import { Module } from "@nestjs/common";
import { RbacModule } from "../rbac/rbac.module";
import { SharingController } from "./sharing.controller";
import { SharingService } from "./sharing.service";
@Module({
  imports: [RbacModule],
  controllers: [SharingController],
  providers: [SharingService],
})
export class SharingModule {}
