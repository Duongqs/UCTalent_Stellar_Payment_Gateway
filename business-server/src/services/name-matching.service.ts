export class NameMatchingService {
  /**
   * Compare two Vietnamese names to see if they match, ignoring case and some diacritics.
   * This is a simplified matching algorithm for the hackathon.
   */
  static isMatch(kycName: string, bankAccountName: string): boolean {
    // Guard: reject empty or whitespace-only names
    if (!kycName || !bankAccountName || !kycName.trim() || !bankAccountName.trim()) {
      return false;
    }

    const normalize = (str: string) => {
      return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
    };

    const n1 = normalize(kycName);
    const n2 = normalize(bankAccountName);

    // Exact match after normalization
    if (n1 === n2) return true;

    // Split into parts to check reversed order or missing middle names
    const parts1 = n1.split(' ').sort();
    const parts2 = n2.split(' ').sort();

    // If both have the same components, we accept it
    if (parts1.length === parts2.length && parts1.every((val, index) => val === parts2[index])) {
      return true;
    }

    // Strict requirement: Reject if they don't match
    return false;
  }

  /**
   * Checks if the bank account name matches the KYC name.
   * Throws an error if mismatch is detected, freezing the transaction.
   */
  static reconcileNames(kycName: string, bankAccountName: string, transactionId: string): void {
    if (!this.isMatch(kycName, bankAccountName)) {
      console.error(`[NameMatching] FATAL MISMATCH for TX ${transactionId}. KYC: "${kycName}" | Bank: "${bankAccountName}"`);
      // Throws to freeze the transaction and prevent the disbursement API from being called
      throw new Error(`RECONCILIATION_FAILED: Bank account name does not match KYC identity.`);
    }
    console.log(`[NameMatching] Success for TX ${transactionId}. Identity verified.`);
  }
}
