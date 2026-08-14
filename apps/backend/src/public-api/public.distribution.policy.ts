import { BadRequestException } from '@nestjs/common';

export async function assertWebhookConnections(
  organizationId: string,
  integrations: Array<{ id: string }>,
  findIntegration: (
    organizationId: string,
    integrationId: string
  ) => Promise<unknown>
) {
  const ids = integrations.map((integration) => integration.id);
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestException({
      code: 'duplicate_webhook_connection',
      reason: 'Each webhook connection may be selected only once.',
    });
  }
  for (const id of ids) {
    const integration = await findIntegration(organizationId, id);
    if (!integration) {
      throw new BadRequestException({
        code: 'webhook_connection_not_found',
        reason:
          'One or more webhook connections were not found in the current workspace.',
      });
    }
  }
}
