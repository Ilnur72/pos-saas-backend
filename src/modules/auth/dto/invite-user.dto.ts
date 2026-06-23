import { IsEmail, IsEnum, IsString } from 'class-validator';
import { TenantRole } from '@prisma/client';

export class InviteUserDto {
  @IsEmail()
  email: string;

  @IsEnum(TenantRole)
  role: TenantRole;
}

export class AcceptInviteDto {
  @IsString()
  token: string;

  @IsString()
  name: string;

  @IsString()
  password: string;
}
