import { Global, Module } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaService,
  PrismaTransaction,
} from './prisma.service';
import { OrganizationRepository } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { UsersRepository } from '@gitroom/nestjs-libraries/database/prisma/users/users.repository';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { SubscriptionRepository } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.repository';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationRepository } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { PostsRepository } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.repository';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { NotificationsRepository } from '@gitroom/nestjs-libraries/database/prisma/notifications/notifications.repository';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { StripeService } from '@gitroom/nestjs-libraries/services/stripe.service';
import { ExtractContentService } from '@gitroom/nestjs-libraries/openai/extract.content.service';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { AgenciesService } from '@gitroom/nestjs-libraries/database/prisma/agencies/agencies.service';
import { AgenciesRepository } from '@gitroom/nestjs-libraries/database/prisma/agencies/agencies.repository';
import { TrackService } from '@gitroom/nestjs-libraries/track/track.service';
import { ShortLinkService } from '@gitroom/nestjs-libraries/short-linking/short.link.service';
import { WebhooksRepository } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.repository';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { SignatureRepository } from '@gitroom/nestjs-libraries/database/prisma/signatures/signature.repository';
import { SignatureService } from '@gitroom/nestjs-libraries/database/prisma/signatures/signature.service';
import { AutopostRepository } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.repository';
import { AutopostService } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.service';
import { SetsService } from '@gitroom/nestjs-libraries/database/prisma/sets/sets.service';
import { SetsRepository } from '@gitroom/nestjs-libraries/database/prisma/sets/sets.repository';
import { ThirdPartyRepository } from '@gitroom/nestjs-libraries/database/prisma/third-party/third-party.repository';
import { ThirdPartyService } from '@gitroom/nestjs-libraries/database/prisma/third-party/third-party.service';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { FalService } from '@gitroom/nestjs-libraries/openai/fal.service';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { OAuthRepository } from '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.repository';
import { OAuthService } from '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service';
import { AnnouncementsRepository } from '@gitroom/nestjs-libraries/database/prisma/announcements/announcements.repository';
import { AnnouncementsService } from '@gitroom/nestjs-libraries/database/prisma/announcements/announcements.service';
import { ErrorsRepository } from '@gitroom/nestjs-libraries/database/prisma/errors/errors.repository';
import { ErrorsService } from '@gitroom/nestjs-libraries/database/prisma/errors/errors.service';
import { AdminStatsRepository } from '@gitroom/nestjs-libraries/database/prisma/admin-stats/admin-stats.repository';
import { AdminStatsService } from '@gitroom/nestjs-libraries/database/prisma/admin-stats/admin-stats.service';
import { ApiKeysRepository } from '@gitroom/nestjs-libraries/database/prisma/api-keys/api-keys.repository';
import { ApiKeysService } from '@gitroom/nestjs-libraries/database/prisma/api-keys/api-keys.service';
import { WebhookEventLedgerService } from '@gitroom/nestjs-libraries/services/webhook.event.ledger.service';
import { AuditLogRepository } from '@gitroom/nestjs-libraries/database/prisma/audit-logs/audit-log.repository';
import { AuditLogService } from '@gitroom/nestjs-libraries/database/prisma/audit-logs/audit-log.service';
import { BulkImportRepository } from '@gitroom/nestjs-libraries/database/prisma/bulk-import/bulk-import.repository';
import { BulkImportService } from '@gitroom/nestjs-libraries/database/prisma/bulk-import/bulk-import.service';
import { AnalyticsSnapshotRepository } from '@gitroom/nestjs-libraries/database/prisma/analytics/analytics-snapshot.repository';
import { OrgDataService } from '@gitroom/nestjs-libraries/database/prisma/organizations/org-data.service';
import { InboxStateRepository } from '@gitroom/nestjs-libraries/database/prisma/inbox/inbox-state.repository';
import { PublishingJobRepository } from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-job.repository';
import { PublishingFailureRepository } from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-failure.repository';
import { PublishingFailureService } from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-failure.service';
import { PublishingReceiptRepository } from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-receipt.repository';
import { PublishingReceiptService } from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-receipt.service';
import { PostConfirmationService } from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/post-confirmation.service';
import { MetaDataDeletionService } from '@gitroom/nestjs-libraries/database/prisma/meta-deletion/meta-data-deletion.service';
import { PostCreationRequestRepository } from '@gitroom/nestjs-libraries/database/prisma/posts/post-creation-request.repository';
import { PostCreationIdempotencyService } from '@gitroom/nestjs-libraries/database/prisma/posts/post-creation-idempotency.service';
import { ReliablePostCreationService } from '@gitroom/nestjs-libraries/database/prisma/posts/reliable-post-creation.service';
import { PublishingRetryService } from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-retry.service';
import { ConnectionHealthRepository } from '@gitroom/nestjs-libraries/database/prisma/connection-health/connection-health.repository';
import { ConnectionHealthService } from '@gitroom/nestjs-libraries/database/prisma/connection-health/connection-health.service';
import { FleetHealthRepository } from '@gitroom/nestjs-libraries/database/prisma/fleet-health/fleet-health.repository';
import { FleetHealthService } from '@gitroom/nestjs-libraries/database/prisma/fleet-health/fleet-health.service';
import { AccountPublishingQueueRepository } from '@gitroom/nestjs-libraries/database/prisma/account-queue/account-publishing-queue.repository';
import { AccountPublishingQueueService } from '@gitroom/nestjs-libraries/database/prisma/account-queue/account-publishing-queue.service';
import { FleetDistributionRepository } from '@gitroom/nestjs-libraries/database/prisma/fleet-distribution/fleet-distribution.repository';
import { FleetDistributionService } from '@gitroom/nestjs-libraries/database/prisma/fleet-distribution/fleet-distribution.service';
import { PlatformTruthService } from '@gitroom/nestjs-libraries/database/prisma/platform-truth/platform-truth.service';
import { PublicStatusRepository } from '@gitroom/nestjs-libraries/database/prisma/public-status/public-status.repository';
import { PublicStatusService } from '@gitroom/nestjs-libraries/database/prisma/public-status/public-status.service';
import { BulkCampaignRepository } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-campaign.repository';
import { BulkCampaignService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-campaign.service';
import { ProviderMediaRepository } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/provider-media.repository';
import { ProviderMediaService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/provider-media.service';
import { CalendarReservationRepository } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/calendar-reservation.repository';
import { CalendarReservationService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/calendar-reservation.service';
import { PostCalendarWriterService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/post-calendar-writer.service';
import { BulkCampaignExecutionRepository } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-campaign-execution.repository';
import { PublishingAttemptRepository } from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-attempt.repository';
import { PublishingAttemptService } from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-attempt.service';
import { BulkCampaignExecutionService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-campaign-execution.service';
import { BulkUploadRepository } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-upload.repository';
import { BulkUploadService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-upload.service';

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [
    PrismaService,
    PrismaRepository,
    PrismaTransaction,
    UsersService,
    UsersRepository,
    OrganizationService,
    OrganizationRepository,
    SubscriptionService,
    SubscriptionRepository,
    NotificationService,
    NotificationsRepository,
    WebhooksRepository,
    WebhooksService,
    IntegrationService,
    IntegrationRepository,
    PostsService,
    PostsRepository,
    StripeService,
    SignatureRepository,
    AutopostRepository,
    AutopostService,
    SignatureService,
    MediaService,
    MediaRepository,
    AgenciesService,
    AgenciesRepository,
    IntegrationManager,
    RefreshIntegrationService,
    ExtractContentService,
    OpenaiService,
    FalService,
    EmailService,
    TrackService,
    ShortLinkService,
    SetsService,
    SetsRepository,
    ThirdPartyRepository,
    ThirdPartyService,
    OAuthRepository,
    OAuthService,
    VideoManager,
    AnnouncementsRepository,
    AnnouncementsService,
    ErrorsRepository,
    ErrorsService,
    AdminStatsRepository,
    AdminStatsService,
    ApiKeysRepository,
    ApiKeysService,
    WebhookEventLedgerService,
    AuditLogRepository,
    AuditLogService,
    BulkImportRepository,
    BulkImportService,
    AnalyticsSnapshotRepository,
    OrgDataService,
    InboxStateRepository,
    PublishingJobRepository,
    PublishingFailureRepository,
    PublishingFailureService,
    PublishingReceiptRepository,
    PublishingReceiptService,
    PostConfirmationService,
    MetaDataDeletionService,
    PostCreationRequestRepository,
    PostCreationIdempotencyService,
    ReliablePostCreationService,
    PublishingRetryService,
    ConnectionHealthRepository,
    ConnectionHealthService,
    FleetHealthRepository,
    FleetHealthService,
    AccountPublishingQueueRepository,
    AccountPublishingQueueService,
    FleetDistributionRepository,
    FleetDistributionService,
    PlatformTruthService,
    PublicStatusRepository,
    PublicStatusService,
    BulkCampaignRepository,
    BulkCampaignService,
    ProviderMediaRepository,
    ProviderMediaService,
    CalendarReservationRepository,
    CalendarReservationService,
    PostCalendarWriterService,
    BulkCampaignExecutionRepository,
    PublishingAttemptRepository,
    PublishingAttemptService,
    BulkCampaignExecutionService,
    BulkUploadRepository,
    BulkUploadService,
  ],
  get exports() {
    return this.providers;
  },
})
export class DatabaseModule {}
