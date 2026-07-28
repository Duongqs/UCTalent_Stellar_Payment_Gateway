"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncryptionService = void 0;
const common_1 = require("@nestjs/common");
const crypto = __importStar(require("crypto"));
const env_service_1 = require("../config/env.service");
const ALGORITHM_V1 = 'aes-256-cbc';
const ALGORITHM_V2 = 'aes-256-gcm';
const MIN_SECRET_LENGTH = 32;
const CURRENT_VERSION = 'v2';
function getSecretFallback() {
    const secret = process.env.ENCRYPTION_SECRET;
    if (!secret) {
        throw new Error('FATAL: ENCRYPTION_SECRET environment variable is required');
    }
    if (secret.length < MIN_SECRET_LENGTH) {
        throw new Error(`FATAL: ENCRYPTION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
    }
    return secret;
}
let EncryptionService = class EncryptionService {
    constructor(envService) {
        this.envService = envService;
    }
    getSecret() {
        const secret = this.envService ? this.envService.get('ENCRYPTION_SECRET') : getSecretFallback();
        if (!secret) {
            throw new Error('FATAL: ENCRYPTION_SECRET environment variable is required');
        }
        if (secret.length < MIN_SECRET_LENGTH) {
            throw new Error(`FATAL: ENCRYPTION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
        }
        return secret;
    }
    deriveKey(salt) {
        return crypto.scryptSync(this.getSecret(), salt, 32);
    }
    encrypt(plaintext) {
        const salt = crypto.randomBytes(16);
        const iv = crypto.randomBytes(12);
        const key = this.deriveKey(salt);
        const cipher = crypto.createCipheriv(ALGORITHM_V2, key, iv);
        const encrypted = Buffer.concat([
            cipher.update(plaintext, 'utf8'),
            cipher.final(),
        ]);
        const authTag = cipher.getAuthTag();
        return `${CURRENT_VERSION}:${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
    }
    decrypt(token) {
        const parts = token.split(':');
        const version = parts[0];
        if (version === 'v1') {
            if (parts.length !== 4)
                throw new Error('Invalid v1 encrypted token format');
            const [, saltHex, ivHex, cipherHex] = parts;
            const salt = Buffer.from(saltHex, 'hex');
            const iv = Buffer.from(ivHex, 'hex');
            const key = this.deriveKey(salt);
            const decipher = crypto.createDecipheriv(ALGORITHM_V1, key, iv);
            return decipher.update(cipherHex, 'hex', 'utf8') + decipher.final('utf8');
        }
        if (version === 'v2') {
            if (parts.length !== 5)
                throw new Error('Invalid v2 encrypted token format');
            const [, saltHex, ivHex, authTagHex, cipherHex] = parts;
            const salt = Buffer.from(saltHex, 'hex');
            const iv = Buffer.from(ivHex, 'hex');
            const authTag = Buffer.from(authTagHex, 'hex');
            const key = this.deriveKey(salt);
            const decipher = crypto.createDecipheriv(ALGORITHM_V2, key, iv);
            decipher.setAuthTag(authTag);
            return decipher.update(cipherHex, 'hex', 'utf8') + decipher.final('utf8');
        }
        throw new Error(`Unsupported encryption version: ${version}. Key rotation may be needed.`);
    }
    createBeneficiaryRefId(stellarWallet, accountNumber) {
        const hmac = crypto.createHmac('sha256', this.getSecret());
        hmac.update(`${stellarWallet}:${accountNumber}`);
        return hmac.digest('hex');
    }
};
exports.EncryptionService = EncryptionService;
exports.EncryptionService = EncryptionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [env_service_1.EnvService])
], EncryptionService);
//# sourceMappingURL=encryption.service.js.map