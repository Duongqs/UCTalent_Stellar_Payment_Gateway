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
      'email_address', 'bank_account_number', 'bank_number', 'bank_branch_number'
    ]);

    for (const key of Object.keys(payload)) {
      if (/[A-Z]/.test(key) && key !== 'id') {
        errors.push(`Field '${key}' must be snake_case. Camel case is not allowed in SEP-9.`);
      }
      if (!supportedFields.has(key)) {
        errors.push(`Unknown field '${key}' not in supported SEP-9 spec for this platform.`);
      }
    }



    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
