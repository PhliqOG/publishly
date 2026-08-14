import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateBulkCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsObject()
  intent: Record<string, unknown>;
}

export class ReviseBulkCampaignDto {
  @IsInt()
  @Min(1)
  expectedRevision: number;

  @IsObject()
  intent: Record<string, unknown>;
}

export class ResolveBulkCampaignIssueDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  resolutionCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}

export class PinBulkCampaignJobDto {
  @IsBoolean()
  pinned: boolean;

  @IsInt()
  @Min(1)
  expectedRevision: number;
}
