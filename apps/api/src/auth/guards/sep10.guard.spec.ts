import { Test, TestingModule } from '@nestjs/testing';
import { Sep10Guard } from './sep10.guard';
import { EnvService } from '@uc/core';

describe('Sep10Guard — security hardening', () => {
  it('should throw FATAL error when JWT_SECRET is undefined', async () => {
    const mockEnv = { get: jest.fn().mockReturnValue(undefined) };

    await expect(
      Test.createTestingModule({
        providers: [
          Sep10Guard,
          { provide: EnvService, useValue: mockEnv },
        ],
      }).compile()
    ).rejects.toThrow(/JWT_SECRET/i);
  });

  it('should construct successfully with valid JWT_SECRET', async () => {
    const mockEnv = { get: jest.fn().mockReturnValue('prod_random_64_char_secret_key_here_1234567890abcdef') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Sep10Guard,
        { provide: EnvService, useValue: mockEnv },
      ],
    }).compile();

    expect(() => module.get<Sep10Guard>(Sep10Guard)).not.toThrow();
  });
});
