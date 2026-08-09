import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBulkImportDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  // Raw CSV text. Expected header: date,content,integrations[,title][,mediaurls]
  @IsString()
  @MinLength(1)
  @MaxLength(5_000_000)
  csv: string;
}
