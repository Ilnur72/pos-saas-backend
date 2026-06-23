import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVariantDto {
  @IsString() name: string;
  @IsString() @IsOptional() sku?: string;
  @IsNumber() @IsOptional() priceModifier?: number;
  @IsOptional() attributes?: Record<string, unknown>;
}

export class CreateProductDto {
  @IsString() name: string;
  @IsString() @IsOptional() sku?: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() categoryId?: string;
  @IsEnum(['PIECE', 'KG', 'LITER', 'METER']) @IsOptional() unit?: string;
  @IsNumber() @Min(0) basePrice: number;
  @IsNumber() @Min(0) @IsOptional() salePrice?: number;
  @IsArray() @IsString({ each: true }) @IsOptional() imageUrls?: string[];
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsBoolean() @IsOptional() isFeatured?: boolean;
  @IsNumber() @Min(0) @IsOptional() minStockLevel?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateVariantDto) @IsOptional() variants?: CreateVariantDto[];
}
