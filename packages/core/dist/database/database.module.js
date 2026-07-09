"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const env_service_1 = require("../config/env.service");
const env_module_1 = require("../config/env.module");
let DatabaseModule = class DatabaseModule {
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forRootAsync({
                imports: [env_module_1.EnvModule],
                inject: [env_service_1.EnvService],
                useFactory: (envService) => {
                    if (envService.get('NODE_ENV') === 'test') {
                        return {
                            type: 'better-sqlite3',
                            database: ':memory:',
                            autoLoadEntities: true,
                            synchronize: false,
                            dropSchema: true,
                        };
                    }
                    return {
                        type: 'postgres',
                        host: envService.get('POSTGRES_HOST'),
                        port: envService.get('POSTGRES_PORT'),
                        username: envService.get('POSTGRES_USER'),
                        password: envService.get('POSTGRES_PASSWORD'),
                        database: envService.get('POSTGRES_DB'),
                        autoLoadEntities: true,
                        synchronize: false,
                        logging: envService.get('NODE_ENV') === 'local' ? ['error', 'warn'] : false,
                    };
                },
            }),
        ],
    })
], DatabaseModule);
//# sourceMappingURL=database.module.js.map