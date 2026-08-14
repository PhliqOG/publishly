import { HttpException } from '@nestjs/common';
import { normalizePostFailure } from '@gitroom/nestjs-libraries/reliability/post.failure';

export class McpToolError extends Error {
  constructor(
    public readonly code: string,
    public readonly reason: string,
    public readonly failureClass:
      | 'recoverable'
      | 'user_action_needed'
      | 'data_problem' = 'data_problem'
  ) {
    super(`${code}: ${reason}`);
    this.name = 'McpToolError';
  }

  toJSON() {
    return {
      failureClass: this.failureClass,
      code: this.code,
      reason: this.reason,
    };
  }
}

function readable(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const joined = value.filter((item) => typeof item === 'string').join('; ');
    if (joined) return joined;
  }
  return undefined;
}

export function asMcpToolError(error: unknown): McpToolError {
  if (error instanceof McpToolError) return error;
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (response && typeof response === 'object') {
      const body = response as Record<string, unknown>;
      const reason =
        readable(body.reason) ||
        readable(body.message) ||
        readable(body.error) ||
        error.message ||
        'Publishly rejected the tool request.';
      const failureClass = ['recoverable', 'user_action_needed', 'data_problem'].includes(
        String(body.failureClass)
      )
        ? (body.failureClass as McpToolError['failureClass'])
        : error.getStatus() >= 500
        ? 'recoverable'
        : error.getStatus() === 401 || error.getStatus() === 403
        ? 'user_action_needed'
        : 'data_problem';
      return new McpToolError(
        readable(body.code) || `http_${error.getStatus()}`,
        reason,
        failureClass
      );
    }
    const status = error.getStatus();
    return new McpToolError(
      `http_${status}`,
      readable(response) ||
        readable(error.message) ||
        'Publishly rejected the tool request.',
      status >= 500
        ? 'recoverable'
        : status === 401 || status === 403
        ? 'user_action_needed'
        : 'data_problem'
    );
  }
  const normalized = normalizePostFailure({ error });
  return new McpToolError(
    normalized.code,
    normalized.reason,
    normalized.failureClass
  );
}
