import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TenantProvisioningModule } from '../tenant-provisioning/tenant-provisioning.module';

@Module({
  imports: [
    JwtModule.register({}),
    TenantProvisioningModule,
  ],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
