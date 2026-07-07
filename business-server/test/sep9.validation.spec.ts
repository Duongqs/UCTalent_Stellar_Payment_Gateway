import { Sep9ValidationService } from '../src/services/sep9-validation.service';

describe('SEP-9 Field Validation', () => {
  const validBase = {
    first_name: 'Nguyen',
    last_name: 'Van A',
    email_address: 'a@test.com',
    type: 'sep31-receiver',
    id_number: '001122334455',
    id_country: 'VNM',
    id_type: 'national_id'
  };

  it('should accept valid receiver with all fields', () => {
    const result = Sep9ValidationService.validate(validBase);
    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should reject camelCase field names (must be snake_case)', () => {
    const invalid = { firstName: 'Nguyen', type: 'sep31-receiver' };
    const result = Sep9ValidationService.validate(invalid);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('snake_case'))).toBe(true);
  });

  it('should reject invalid id_country format (must be ISO 3166-1 alpha-3)', () => {
    const invalid = { ...validBase, id_country: 'VN' }; // 2-letter instead of 3
    const result = Sep9ValidationService.validate(invalid);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('ISO 3166-1 alpha-3'))).toBe(true);
  });

  it('should reject lowercase or numeric id_country values', () => {
    const lowercase = Sep9ValidationService.validate({ ...validBase, id_country: 'vnm' });
    const numeric = Sep9ValidationService.validate({ ...validBase, id_country: '12M' });

    expect(lowercase.isValid).toBe(false);
    expect(numeric.isValid).toBe(false);
    expect(lowercase.errors.some(e => e.includes('ISO 3166-1 alpha-3'))).toBe(true);
    expect(numeric.errors.some(e => e.includes('ISO 3166-1 alpha-3'))).toBe(true);
  });

  it('should reject invalid id_type (only national_id and passport allowed)', () => {
    const invalid = { ...validBase, id_type: 'driver_license' };
    const result = Sep9ValidationService.validate(invalid);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('national_id or passport'))).toBe(true);
  });

  it('should allow partial updates (missing fields) but validate format of present fields', () => {
    // Sender missing id_number, still passes format validation
    const sender = { 
      first_name: 'Corp', 
      type: 'sep31-sender' 
    };
    const result = Sep9ValidationService.validate(sender);
    expect(result.isValid).toBe(true);
  });

  it('should reject unknown fields not in SEP-9 spec', () => {
    const withUnknown = { ...validBase, my_custom_field: '123', ssn: 'secret' };
    const result = Sep9ValidationService.validate(withUnknown);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('Unknown field'))).toBe(true);
  });
});
