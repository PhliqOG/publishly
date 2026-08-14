import {
  ConnectionHealthState,
  PlatformTruthState,
  TokenHealthState,
} from '@prisma/client';

export type FleetHealthColor = 'green' | 'yellow' | 'red';

export function deriveFleetHealthColor(input: {
  tokenHealthState: TokenHealthState;
  connectionHealthState: ConnectionHealthState;
  platformTruthState?: PlatformTruthState;
}): FleetHealthColor {
  if (
    input.platformTruthState === 'LIMITED' ||
    input.platformTruthState === 'INVALID' ||
    input.tokenHealthState === 'EXPIRED' ||
    input.tokenHealthState === 'RECONNECT_REQUIRED' ||
    input.connectionHealthState === 'DEAD' ||
    input.connectionHealthState === 'RECONNECT_REQUIRED' ||
    input.connectionHealthState === 'DISABLED'
  ) {
    return 'red';
  }
  if (
    input.platformTruthState === 'UNKNOWN' ||
    input.tokenHealthState === 'UNKNOWN' ||
    input.tokenHealthState === 'EXPIRING' ||
    input.connectionHealthState === 'AT_RISK'
  ) {
    return 'yellow';
  }
  return 'green';
}

export function fleetSuccessRate(confirmedLive: number, failed: number) {
  const terminal = confirmedLive + failed;
  if (terminal === 0) return null;
  return Math.round((confirmedLive / terminal) * 10_000) / 100;
}

export function fleetWindowDays(value: unknown): 7 | 30 | 90 {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return parsed === 7 || parsed === 90 ? parsed : 30;
}

export function normalizeAccountTagName(value: unknown) {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) return null;
  return { name, normalizedName: name.toLocaleLowerCase('en-US') };
}

export function normalizeAccountTagColor(value: unknown) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toUpperCase()
    : '#8C66FF';
}

export function normalizeAccountGroupName(value: unknown) {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name) return null;
  return { name, normalizedName: name.toLocaleLowerCase('en-US') };
}

export function normalizeAccountGroupColor(value: unknown) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toUpperCase()
    : '#3B82F6';
}
