import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class RegisterTenantDto {
  @IsString()
  ownerName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(2)
  tenantName: string;

  @IsString()
  @IsOptional()
  phone?: string;
}
