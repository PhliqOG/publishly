import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ReplyCommentDto {
  @IsString()
  @MinLength(1)
  commentId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message: string;

  @IsOptional()
  @IsString()
  postId?: string;
}
