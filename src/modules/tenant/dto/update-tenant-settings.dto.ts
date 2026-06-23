import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateTenantSettingsDto {
  @IsString() @IsOptional() currency?: string;
  @IsString() @IsOptional() timezone?: string;
  @IsString() @IsOptional() language?: string;
  @IsNumber() @Min(0) @Max(100) @IsOptional() taxRate?: number;
  @IsString() @IsOptional() storeName?: string;
  @IsString() @IsOptional() storePhone?: string;
  @IsString() @IsOptional() storeAddress?: string;
  @IsString() @IsOptional() logoUrl?: string;
}

export class UpdateOnboardingDto {
  @IsEnum(['STORE_INFO', 'FIRST_PRODUCT', 'INVITE_TEAM', 'CONNECT_PAYMENT', 'DONE'])
  step: 'STORE_INFO' | 'FIRST_PRODUCT' | 'INVITE_TEAM' | 'CONNECT_PAYMENT' | 'DONE';
}

export class UpdateDomainDto {
  @IsString()
  domain: string;
}
