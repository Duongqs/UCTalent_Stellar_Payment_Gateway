"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sep9ValidationService = void 0;
const common_1 = require("@nestjs/common");
let Sep9ValidationService = class Sep9ValidationService {
    validate(payload) {
        const errors = [];
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
};
exports.Sep9ValidationService = Sep9ValidationService;
exports.Sep9ValidationService = Sep9ValidationService = __decorate([
    (0, common_1.Injectable)()
], Sep9ValidationService);
//# sourceMappingURL=sep9-validation.service.js.map