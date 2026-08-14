import {
  deriveFleetHealthColor,
  fleetSuccessRate,
  fleetWindowDays,
  normalizeAccountGroupColor,
  normalizeAccountGroupName,
  normalizeAccountTagColor,
  normalizeAccountTagName,
} from './fleet.health';

describe('fleet health policy', () => {
  it.each([
    ['EXPIRED', 'HEALTHY'],
    ['RECONNECT_REQUIRED', 'HEALTHY'],
    ['HEALTHY', 'DEAD'],
    ['HEALTHY', 'RECONNECT_REQUIRED'],
    ['HEALTHY', 'DISABLED'],
    ['EXPIRING', 'DEAD'],
  ] as const)('makes %s/%s red', (tokenHealthState, connectionHealthState) => {
    expect(
      deriveFleetHealthColor({ tokenHealthState, connectionHealthState })
    ).toBe('red');
  });

  it.each([
    ['UNKNOWN', 'HEALTHY'],
    ['EXPIRING', 'HEALTHY'],
    ['HEALTHY', 'AT_RISK'],
  ] as const)(
    'makes %s/%s yellow',
    (tokenHealthState, connectionHealthState) => {
      expect(
        deriveFleetHealthColor({ tokenHealthState, connectionHealthState })
      ).toBe('yellow');
    }
  );

  it('makes only an otherwise healthy projection green', () => {
    expect(
      deriveFleetHealthColor({
        tokenHealthState: 'HEALTHY',
        connectionHealthState: 'HEALTHY',
      })
    ).toBe('green');
  });

  it.each(['LIMITED', 'INVALID'] as const)(
    'makes %s platform truth red even when token and connection are healthy',
    (platformTruthState) => {
      expect(
        deriveFleetHealthColor({
          tokenHealthState: 'HEALTHY',
          connectionHealthState: 'HEALTHY',
          platformTruthState,
        })
      ).toBe('red');
    }
  );

  it('makes unknown platform truth yellow and ready truth green', () => {
    expect(
      deriveFleetHealthColor({
        tokenHealthState: 'HEALTHY',
        connectionHealthState: 'HEALTHY',
        platformTruthState: 'UNKNOWN',
      })
    ).toBe('yellow');
    expect(
      deriveFleetHealthColor({
        tokenHealthState: 'HEALTHY',
        connectionHealthState: 'HEALTHY',
        platformTruthState: 'READY',
      })
    ).toBe('green');
  });

  it('uses only confirmed-live and final-failed outcomes in rate math', () => {
    expect(fleetSuccessRate(0, 0)).toBeNull();
    expect(fleetSuccessRate(8, 2)).toBe(80);
    expect(fleetSuccessRate(1, 2)).toBe(33.33);
    expect(fleetSuccessRate(7, 0)).toBe(100);
  });

  it('bounds dashboard windows and normalizes safe tag values', () => {
    expect(fleetWindowDays('7')).toBe(7);
    expect(fleetWindowDays(90)).toBe(90);
    expect(fleetWindowDays('365')).toBe(30);
    expect(normalizeAccountTagName('  East   Coast  ')).toEqual({
      name: 'East Coast',
      normalizedName: 'east coast',
    });
    expect(normalizeAccountTagName('   ')).toBeNull();
    expect(normalizeAccountTagColor('#aa44ff')).toBe('#AA44FF');
    expect(normalizeAccountTagColor('red')).toBe('#8C66FF');
  });

  it('normalizes safe group values independently from tags', () => {
    expect(normalizeAccountGroupName('  East   Coast  ')).toEqual({
      name: 'East Coast',
      normalizedName: 'east coast',
    });
    expect(normalizeAccountGroupName('   ')).toBeNull();
    expect(normalizeAccountGroupColor('#22aa88')).toBe('#22AA88');
    expect(normalizeAccountGroupColor('green')).toBe('#3B82F6');
  });
});
