import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ProductQueryDto {
  @IsNumber() @Min(1) @Type(() => Number) @IsOptional() page?: number = 1;
  @IsNumber() @Min(1) @Type(() => Number) @IsOptional() limit?: number = 20;
  @IsString() @IsOptional() search?: string;
  @IsString() @IsOptional() categoryId?: string;
  @Transform(({ value }) => value === 'true') @IsBoolean() @IsOptional() isActive?: boolean;
  @Transform(({ value }) => value === 'true') @IsBoolean() @IsOptional() isFeatured?: boolean;
  @IsString() @IsOptional() sortBy?: string = 'createdAt';
  @IsString() @IsOptional() sortOrder?: 'asc' | 'desc' = 'desc';
}
