"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NameMatchingService = void 0;
const common_1 = require("@nestjs/common");
let NameMatchingService = class NameMatchingService {
    isMatch(kycName, bankAccountName) {
        if (!kycName || !bankAccountName || !kycName.trim() || !bankAccountName.trim()) {
            return false;
        }
        const normalize = (str) => {
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
        if (n1 === n2)
            return true;
        const parts1 = n1.split(' ').sort();
        const parts2 = n2.split(' ').sort();
        if (parts1.length === parts2.length && parts1.every((val, index) => val === parts2[index])) {
            return true;
        }
        return false;
    }
    reconcileNames(kycName, bankAccountName, transactionId) {
        if (!this.isMatch(kycName, bankAccountName)) {
            console.error(`[NameMatching] FATAL MISMATCH for TX ${transactionId}. KYC: "${kycName}" | Bank: "${bankAccountName}"`);
            throw new Error(`RECONCILIATION_FAILED: Bank account name does not match KYC identity.`);
        }
        console.log(`[NameMatching] Success for TX ${transactionId}. Identity verified.`);
    }
};
exports.NameMatchingService = NameMatchingService;
exports.NameMatchingService = NameMatchingService = __decorate([
    (0, common_1.Injectable)()
], NameMatchingService);
//# sourceMappingURL=name-matching.service.js.map