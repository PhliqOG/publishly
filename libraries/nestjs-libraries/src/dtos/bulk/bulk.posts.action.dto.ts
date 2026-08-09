import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class BulkPostsActionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ids: string[];

  // Shift only: signed minutes to move each post by.
  @IsOptional()
  @IsInt()
  @Min(-60 * 24 * 365)
  @Max(60 * 24 * 365)
  minutes?: number;
}
