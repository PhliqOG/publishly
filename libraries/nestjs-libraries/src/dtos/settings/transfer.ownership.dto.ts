import { IsDefined, IsString } from 'class-validator';

export class TransferOwnershipDto {
  @IsDefined()
  @IsString()
  userId: string;
}
