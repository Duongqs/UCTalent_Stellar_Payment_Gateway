import { NameMatchingService } from '../src/services/name-matching.service';

describe('NameMatchingService (SEP-12 / 9Pay Integration)', () => {
  // ─── Basic matching ─────────────────────────────────────────────────────

  it('should match exact names', () => {
    expect(NameMatchingService.isMatch('Nguyen Van A', 'Nguyen Van A')).toBe(true);
  });

  it('should match names regardless of case', () => {
    expect(NameMatchingService.isMatch('nguyen van a', 'NGUYEN VAN A')).toBe(true);
  });

  it('should match names regardless of diacritics', () => {
    expect(NameMatchingService.isMatch('Nguyễn Văn A', 'Nguyen Van A')).toBe(true);
    expect(NameMatchingService.isMatch('Đặng Thùy Trâm', 'Dang Thuy Tram')).toBe(true);
  });

  it('should match reversed names if components are identical', () => {
    expect(NameMatchingService.isMatch('A Van Nguyen', 'Nguyen Van A')).toBe(true);
    expect(NameMatchingService.isMatch('Nguyen Van A', 'A Nguyen Van')).toBe(true);
  });

  // ─── Rejection cases ──────────────────────────────────────────────────

  it('should reject names with missing components', () => {
    expect(NameMatchingService.isMatch('Nguyen Van A', 'Nguyen A')).toBe(false);
  });

  it('should reject completely different names', () => {
    expect(NameMatchingService.isMatch('Nguyen Van A', 'Tran Thi B')).toBe(false);
  });

  // ─── Gap fixes: Whitespace & edge cases ──────────────────────────────

  it('should handle extra whitespace between name components', () => {
    expect(NameMatchingService.isMatch('Nguyen  Van  A', 'Nguyen Van A')).toBe(true);
    expect(NameMatchingService.isMatch('  Nguyen Van A  ', 'Nguyen Van A')).toBe(true);
  });

  it('should handle single-word names', () => {
    expect(NameMatchingService.isMatch('Madonna', 'Madonna')).toBe(true);
    expect(NameMatchingService.isMatch('madonna', 'MADONNA')).toBe(true);
  });

  it('should reject empty or whitespace-only names', () => {
    expect(NameMatchingService.isMatch('', 'Nguyen Van A')).toBe(false);
    expect(NameMatchingService.isMatch('Nguyen Van A', '')).toBe(false);
    expect(NameMatchingService.isMatch('', '')).toBe(false);
    expect(NameMatchingService.isMatch('   ', 'Nguyen Van A')).toBe(false);
  });

  // ─── reconcileNames() ────────────────────────────────────────────────

  describe('reconcileNames()', () => {
    it('should pass silently if names match', () => {
      expect(() => {
        NameMatchingService.reconcileNames('Nguyễn Văn A', 'Nguyen Van A', 'txn-123');
      }).not.toThrow();
    });

    it('should throw RECONCILIATION_FAILED if names do not match', () => {
      expect(() => {
        NameMatchingService.reconcileNames('Nguyen Van A', 'Tran Thi B', 'txn-123');
      }).toThrow('RECONCILIATION_FAILED: Bank account name does not match KYC identity.');
    });

    it('should log transaction ID in error output for audit trail', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      try {
        NameMatchingService.reconcileNames('Nguyen Van A', 'Tran Thi B', 'txn-456');
      } catch {
        // expected to throw
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('txn-456')
      );

      consoleSpy.mockRestore();
    });
  });
});
