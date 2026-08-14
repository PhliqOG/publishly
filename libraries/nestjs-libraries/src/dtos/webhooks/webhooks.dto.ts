import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsSafeWebhookUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';

export class WebhooksIntegrationDto {
  @IsString()
  @IsDefined()
  id: string;
}

export class WebhooksDto {
  id: string;

  @IsString()
  @IsDefined()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsString()
  @IsUrl()
  @IsDefined()
  @IsSafeWebhookUrl({
    message:
      'Webhook URL must be a public HTTPS URL and cannot point to internal network addresses',
  })
  url: string;

  @Type(() => WebhooksIntegrationDto)
  @IsDefined()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  integrations: WebhooksIntegrationDto[];
}

export class OnlyURL {
  @IsString()
  @IsUrl()
  @IsDefined()
  @IsSafeWebhookUrl({
    message:
      'URL must be a public HTTPS URL and cannot point to internal network addresses',
  })
  url: string;
}

export class UpdateDto {
  @IsString()
  @IsDefined()
  id: string;

  @IsString()
  @IsDefined()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsString()
  @IsUrl()
  @IsDefined()
  @IsSafeWebhookUrl({
    message:
      'Webhook URL must be a public HTTPS URL and cannot point to internal network addresses',
  })
  url: string;

  @Type(() => WebhooksIntegrationDto)
  @IsDefined()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  integrations: WebhooksIntegrationDto[];
}
