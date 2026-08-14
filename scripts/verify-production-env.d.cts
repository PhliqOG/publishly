export type PreflightIssue = {
  code: string;
  reason: string;
};

export const REQUIRED_PROVIDER_ENV: Readonly<Record<string, readonly string[]>>;

export function parseEnv(contents: string): Record<string, string>;

export function loadEnvFile(filePath: string): {
  resolved: string;
  env: Record<string, string>;
};

export function validateProductionEnv(
  env: Record<string, string>
): PreflightIssue[];

export function main(argv?: string[]): number;
