import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;

  @IsString()
  tenantSlug: string;
}

export class SuperAdminLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
