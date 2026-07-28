import { EnvService } from '@uc/core';

const KNOWN_INSECURE_DEFAULTS = [
  'a_very_secure_secret_key_that_is_at_least_32_bytes_long!',
  'super_secret_jwt_key_that_is_at_least_32_bytes_long!',
  'uctalent-dev-secret',
  'sandbox_merchant',
  'sandbox_secret',
];

export function validateCriticalSecrets(envService: EnvService): void {
  const isProduction = envService.get('NODE_ENV') === 'production';

  const checks: Array<{ key: string; label: string; minLen?: number }> = [
    { key: 'JWT_SECRET', label: 'JWT signing key', minLen: 32 },
    { key: 'ENCRYPTION_SECRET', label: 'Encryption key', minLen: 32 },
    { key: 'WEBHOOK_SECRET', label: 'Webhook HMAC secret', minLen: 16 },
    { key: 'CROSS_BORDER_WEBHOOK_SECRET', label: 'Cross-border webhook secret', minLen: 16 },
    { key: 'ALLOWED_WEBHOOK_IPS', label: 'Webhook IP whitelist' },
  ];

  const errors: string[] = [];

  for (const { key, label, minLen } of checks) {
    const value = envService.get(key as any);
    if (!value) {
      errors.push(`MISSING: ${key} (${label})`);
      continue;
    }

    if (KNOWN_INSECURE_DEFAULTS.includes(value)) {
      errors.push(`INSECURE_DEFAULT: ${key} is using a known default value`);
    }

    if (minLen && value.length < minLen) {
      errors.push(`TOO_SHORT: ${key} must be at least ${minLen} chars (got ${value.length})`);
    }
  }

  const ips = envService.get('ALLOWED_WEBHOOK_IPS');
  if (isProduction && ips && ips.includes('*')) {
    errors.push(`WILDCARD_IP: ALLOWED_WEBHOOK_IPS contains wildcard '*' in production`);
  }

  if (errors.length > 0) {
    const msg = `\n╔══════════════════════════════════════════════════════╗\n║  SECURITY BOOTSTRAP CHECK FAILED                     ║\n╚══════════════════════════════════════════════════════╝\n${errors.map(e => `  ✗ ${e}`).join('\n')}\n`;

    if (isProduction) {
      console.error(msg);
      process.exit(1);
    } else {
      console.warn(`[SECURITY WARNING] ${msg}\nApp will continue in development mode, but these MUST be fixed before production.\n`);
    }
  } else {
    console.log('[Bootstrap] ✓ All critical security secrets are configured correctly.');
  }
}
