import { IsArray, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { API_KEY_SCOPES } from '@gitroom/nestjs-libraries/database/prisma/api-keys/api-keys.service';

export class CreateApiKeyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @IsArray()
  @IsIn(API_KEY_SCOPES as unknown as string[], { each: true })
  scopes: string[];
}
