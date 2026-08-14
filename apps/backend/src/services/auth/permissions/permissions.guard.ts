import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AppAbility,
  PermissionsService,
} from '@gitroom/backend/services/auth/permissions/permissions.service';
import {
  AbilityPolicy,
  CHECK_POLICIES_KEY,
} from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { Organization } from '@prisma/client';
import { Request } from 'express';
import { Sections, SubscriptionException } from './permission.exception.class';

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private _reflector: Reflector,
    private _authorizationService: PermissionsService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    if (
      request.path.indexOf('/auth') > -1 ||
      request.path.indexOf('/auth') > -1 ||
      request.path.indexOf('/integrations/social-connect') > -1 ||
      request.path.indexOf('/integrations/provider') > -1
    ) {
      return true;
    }

    const policyHandlers =
      this._reflector.getAllAndMerge<AbilityPolicy[]>(CHECK_POLICIES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || [];

    if (!policyHandlers || !policyHandlers.length) {
      return true;
    }

    const org = (
      request as Request & {
        org: Organization & {
          users: Array<{ role: 'USER' | 'ADMIN' | 'SUPERADMIN' }>;
        };
      }
    ).org;
    const workspaceRole = org?.users?.[0]?.role;
    if (!org || !workspaceRole) {
      throw new ForbiddenException('Active workspace membership is required');
    }

    const refreshChannelId =
      typeof request.query?.refresh === 'string'
        ? request.query.refresh
        : undefined;

    const ability = await this._authorizationService.check(
      org.id,
      org.createdAt,
      workspaceRole,
      policyHandlers,
      refreshChannelId
    );

    const item = policyHandlers.find(
      (handler) => !this.execPolicyHandler(handler, ability)
    );

    if (item) {
      if (item[1] === Sections.ADMIN || item[1] === Sections.OWNER) {
        throw new ForbiddenException(
          item[1] === Sections.OWNER
            ? 'Workspace owner access is required'
            : 'Workspace owner or administrator access is required'
        );
      }
      throw new SubscriptionException({
        section: item[1],
        action: item[0],
      });
    }

    return true;
  }

  private execPolicyHandler(handler: AbilityPolicy, ability: AppAbility) {
    return ability.can(handler[0], handler[1]);
  }
}
