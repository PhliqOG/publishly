import { IsIn } from 'class-validator';
import {
  PAID_BILLING_TIERS,
  PaidBillingTier,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

export class BillingSubscribeDto {
  @IsIn(['MONTHLY', 'YEARLY'])
  period: 'MONTHLY' | 'YEARLY';

  @IsIn(PAID_BILLING_TIERS)
  billing: PaidBillingTier;

  utm: string;

  dub: string;

  datafast_session_id: string;
  datafast_visitor_id: string;
}
