// Zaman kaynağı. Süre dolumu testlerinde (K-39: 1 saat) sahte saat enjekte edilir.
import { Global, Module } from '@nestjs/common';

export const CLOCK = Symbol('CLOCK');

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: systemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
