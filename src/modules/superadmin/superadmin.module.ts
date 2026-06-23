import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SuperAdminService } from './superadmin.service';
import { SuperAdminController } from './superadmin.controller';
import { SuperAdminGuard } from './superadmin.guard';

@Module({
  imports: [JwtModule.register({})],
  providers: [SuperAdminService, SuperAdminGuard],
  controllers: [SuperAdminController],
})
export class SuperAdminModule {}
