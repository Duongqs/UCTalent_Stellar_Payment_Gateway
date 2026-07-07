import { Injectable } from '@nestjs/common';

export interface Sep9ValidationResult {
  isValid: boolean;
  errors: string[];
}

@Injectable()
export class Sep9ValidationService {
  validate(payload: Record<string, any>): Sep9ValidationResult {
    const errors: string[] = [];

    const supportedFields = new Set([
      'id', 'account', 'type', 'first_name', 'last_name',
      'email_address', 'id_number', 'id_type', 'id_country',
      'bank_account_number', 'bank_number', 'bank_branch_number'
    ]);

    for (const key of Object.keys(payload)) {
      if (/[A-Z]/.test(key) && key !== 'id') {
        errors.push(`Field '${key}' must be snake_case. Camel case is not allowed in SEP-9.`);
      }
      if (!supportedFields.has(key)) {
        errors.push(`Unknown field '${key}' not in supported SEP-9 spec for this platform.`);
      }
    }

    const type = payload.type || 'sep31-receiver';

    if (type === 'sep31-receiver') {
      if (payload.id_country && !/^[A-Z]{3}$/.test(payload.id_country)) {
        errors.push('id_country must be ISO 3166-1 alpha-3 format (e.g. VNM)');
      }

      if (payload.id_type && !['national_id', 'passport'].includes(payload.id_type)) {
        errors.push('id_type must be national_id or passport');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
