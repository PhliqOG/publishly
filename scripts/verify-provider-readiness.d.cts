export type ProviderReadinessIssue = {
  code: string;
  reason: string;
};

export const EXPECTED_PROVIDER_IDS: readonly string[];
export const manifest: Record<string, unknown>;
export function validateProviderReadiness(rootDir?: string): ProviderReadinessIssue[];
export function main(): number;
