import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReplyDirectMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  threadId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  recipientId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message: string;
}
