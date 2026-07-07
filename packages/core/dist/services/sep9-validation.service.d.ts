export interface Sep9ValidationResult {
    isValid: boolean;
    errors: string[];
}
export declare class Sep9ValidationService {
    validate(payload: Record<string, any>): Sep9ValidationResult;
}
