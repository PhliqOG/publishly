import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateInboxStateDto {
  @IsOptional()
  @IsBoolean()
  read?: boolean;

  @IsOptional()
  @IsBoolean()
  resolved?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  assignedUserId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  internalNote?: string | null;
}
