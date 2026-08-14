import { Injectable } from '@nestjs/common';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { AgentToolInterface } from '../agent.tool.interface';
import { FleetHealthService } from '@gitroom/nestjs-libraries/database/prisma/fleet-health/fleet-health.service';
import { requireMcpOrganization } from '../mcp.auth.policy';
import { asMcpToolError } from '../mcp.tool.error';

@Injectable()
export class FleetHealthTool implements AgentToolInterface {
  constructor(private _fleetHealth: FleetHealthService) {}
  name = 'fleetHealth';

  run() {
    return createTool({
      id: 'get_fleet_health',
      description:
        'Get green/yellow/red connection health, token warnings, platform truth, queues, retries, and confirmed posting success for the fleet.',
      mcp: {
        annotations: {
          title: 'Get Fleet Health',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      inputSchema: z.object({
        windowDays: z.enum(['7', '30', '90']).default('30'),
        groupId: z.string().optional(),
        tagId: z.string().optional(),
        color: z.enum(['green', 'yellow', 'red']).optional(),
      }),
      outputSchema: z.any(),
      execute: async (inputData, context) => {
        try {
          const organization = requireMcpOrganization(
            inputData,
            context,
            'integrations:read'
          );
          return await this._fleetHealth.getFleetHealth(
            organization.id,
            inputData
          );
        } catch (error) {
          throw asMcpToolError(error);
        }
      },
    });
  }
}
