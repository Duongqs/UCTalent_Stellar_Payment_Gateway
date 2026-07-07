import { getSafeFxRate, getCircuitBreakerState, invalidateCache, resetCircuitBreaker } from '../src/services/oracle.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// ─── Helper: build mock that routes by URL + params ─────────────────────────

type SourceOverrides = Partial<Record<'usd-coin' | 'tether' | 'er-api' | 'currency-api' | '9pay', number | 'error'>>;

function buildOracleMock(overrides: SourceOverrides = {}) {
  const defaults: Record<string, number> = {
    'usd-coin': 25400,
    'tether': 25420,
    'er-api': 25050,       // will be * 1.015 = 25425.75
    'currency-api': 25060, // will be * 1.015 = 25435.9
    '9pay': 25450,
  };

  return (url: string, config?: any) => {
    const paramsStr = JSON.stringify(config?.params || {});

    if (url.includes('coingecko.com') && paramsStr.includes('usd-coin')) {
      const v = overrides['usd-coin'] ?? defaults['usd-coin'];
      if (v === 'error') return Promise.reject(new Error('mock error'));
      return Promise.resolve({ data: { 'usd-coin': { vnd: v } } });
    }
    if (url.includes('coingecko.com') && paramsStr.includes('tether')) {
      const v = overrides['tether'] ?? defaults['tether'];
      if (v === 'error') return Promise.reject(new Error('mock error'));
      return Promise.resolve({ data: { 'tether': { vnd: v } } });
    }
    if (url.includes('open.er-api.com')) {
      const v = overrides['er-api'] ?? defaults['er-api'];
      if (v === 'error') return Promise.reject(new Error('mock error'));
      return Promise.resolve({ data: { rates: { VND: v } } });
    }
    if (url.includes('@fawazahmed0/currency-api')) {
      const v = overrides['currency-api'] ?? defaults['currency-api'];
      if (v === 'error') return Promise.reject(new Error('mock error'));
      return Promise.resolve({ data: { usd: { vnd: v } } });
    }
    if (url.includes('9pay.vn')) {
      const v = overrides['9pay'] ?? defaults['9pay'];
      if (v === 'error') return Promise.reject(new Error('mock error'));
      return Promise.resolve({ data: { data: { exchangeRate: v } } });
    }
    return Promise.reject(new Error('not mocked'));
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('OracleService (SEP-38 Exchange Rate with Circuit Breaker)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateCache();
    resetCircuitBreaker(); // Reset singleton state between tests
  });

  // ─── 1. Median calculation (5 sources, odd count) ─────────────────────

  it('should calculate median correctly when all 5 sources return similar rates', async () => {
    mockedAxios.get.mockImplementation(buildOracleMock());

    const result = await getSafeFxRate();

    expect(result.usedSources.length).toBe(5);
    expect(result.droppedSources.length).toBe(0);
    expect(result.method).toBe('median');

    // Values: 25400, 25420, 25425.75, 25435.9, 25450
    // Median (middle value) = 25425.75
    // Safety spread: floor(25425.75 * 0.99) = 25171
    expect(result.rate).toBe(25171);
  });

  // ─── 2. Out-of-bounds detection (NOT the same as statistical outlier) ─

  it('should drop sources outside hard bounds [23000, 28000]', async () => {
    mockedAxios.get.mockImplementation(buildOracleMock({ '9pay': 10000 }));

    const result = await getSafeFxRate();

    expect(result.usedSources.length).toBe(4);
    expect(result.droppedSources.length).toBe(1);
    expect(result.droppedSources[0]).toMatch(/NinePay_Merchant_Rate.*out of bounds/);
  });

  // ─── 3. True statistical outlier (within bounds but >3% from median) ──

  it('should drop true statistical outliers within bounds but >3% from median', async () => {
    mockedAxios.get.mockImplementation(buildOracleMock({
      'usd-coin': 25400,
      'tether': 25380,
      'er-api': 25000,        // * 1.015 = 25375
      'currency-api': 25010,  // * 1.015 = 25385.15
      '9pay': 26200,          // >3% from ~25390 median → dropped as outlier
    }));

    const result = await getSafeFxRate();

    expect(result.droppedSources.some(s => s.includes('OUTLIER') && s.includes('NinePay'))).toBe(true);
    expect(result.usedSources).not.toContain('NinePay_Merchant_Rate');
    expect(result.method).toBe('median');
  });

  // ─── 4. Median with even number of valid sources ──────────────────────

  it('should calculate median correctly with even number of sources (average of 2 middle)', async () => {
    // Kill 9Pay → 4 valid sources (even)
    mockedAxios.get.mockImplementation(buildOracleMock({ '9pay': 'error' }));

    const result = await getSafeFxRate();

    expect(result.usedSources.length).toBe(4);
    expect(result.method).toBe('median');

    // Values sorted: 25400, 25420, 25425.75, 25435.9
    // Median = (25420 + 25425.75) / 2 = 25422.875
    // Safety spread: floor(25422.875 * 0.99) = floor(25168.64625) = 25168
    expect(result.rate).toBe(25168);
  });

  // ─── 5. Single source → still works with 'single' method ─────────────

  it('should use single source if only one is available', async () => {
    mockedAxios.get.mockImplementation(buildOracleMock({
      'tether': 'error',
      'er-api': 'error',
      'currency-api': 'error',
      '9pay': 'error',
    }));

    const result = await getSafeFxRate();

    expect(result.usedSources.length).toBe(1);
    expect(result.usedSources[0]).toBe('CoinGecko_USDC');
    expect(result.method).toBe('single');

    // 25400 * 0.99 = 25146
    expect(result.rate).toBe(25146);
  });

  // ─── 6. Cache: second call uses cache, no extra API calls ─────────────

  it('should return cached rate within TTL without calling APIs again', async () => {
    mockedAxios.get.mockImplementation(buildOracleMock());

    const result1 = await getSafeFxRate();
    const callCountAfterFirst = mockedAxios.get.mock.calls.length;

    const result2 = await getSafeFxRate();
    const callCountAfterSecond = mockedAxios.get.mock.calls.length;

    // No additional API calls on second invocation
    expect(callCountAfterFirst).toBe(callCountAfterSecond);
    expect(result1.rate).toBe(result2.rate);
  });

  it('should fetch fresh data after cache is invalidated', async () => {
    mockedAxios.get.mockImplementation(buildOracleMock());

    await getSafeFxRate();
    const callsAfterFirst = mockedAxios.get.mock.calls.length;

    invalidateCache();

    await getSafeFxRate();
    const callsAfterSecond = mockedAxios.get.mock.calls.length;

    expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst);
  });

  // ─── 7. Circuit breaker: opens after FAILURE_THRESHOLD failures ───────

  it('should open circuit breaker after 3 consecutive total failures', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network Error'));

    // Failures 1–3: ALL_SOURCES_FAILED
    for (let i = 0; i < 3; i++) {
      invalidateCache();
      await expect(getSafeFxRate()).rejects.toThrow('ALL_SOURCES_FAILED');
    }

    // 4th call: circuit is now OPEN
    invalidateCache();
    await expect(getSafeFxRate()).rejects.toThrow('CIRCUIT_OPEN');
    expect(getCircuitBreakerState()).toBe('OPEN');
  });

  // ─── 8. Circuit breaker resets on successful request ──────────────────

  it('should reset circuit breaker to CLOSED on first successful request', async () => {
    // Cause 2 failures (below threshold)
    mockedAxios.get.mockRejectedValue(new Error('fail'));
    invalidateCache();
    await getSafeFxRate().catch(() => {});
    invalidateCache();
    await getSafeFxRate().catch(() => {});

    // Now succeed
    mockedAxios.get.mockImplementation(buildOracleMock());
    invalidateCache();
    const result = await getSafeFxRate();

    expect(getCircuitBreakerState()).toBe('CLOSED');
    expect(result.rate).toBeGreaterThan(0);
  });

  // ─── 9. All sources fail (0 valid) → halt, no hardcoded fallback ──────

  it('should throw ALL_SOURCES_FAILED when no source returns valid data (no hardcoded fallback)', async () => {
    mockedAxios.get.mockRejectedValue(new Error('every source down'));

    await expect(getSafeFxRate()).rejects.toThrow('ALL_SOURCES_FAILED');
  });

  // ─── 10. rawRates includes both successful and failed sources ─────────

  it('should include all source names in rawRates (null for failed sources)', async () => {
    mockedAxios.get.mockImplementation(buildOracleMock({
      'tether': 'error',
      '9pay': 'error',
    }));

    const result = await getSafeFxRate();

    expect(result.rawRates['CoinGecko_USDC']).toBe(25400);
    expect(result.rawRates['CoinGecko_USDT_Proxy']).toBeNull();
    expect(result.rawRates['NinePay_Merchant_Rate']).toBeNull();
  });
});
