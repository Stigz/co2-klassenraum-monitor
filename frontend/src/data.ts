import type { Reading } from './types'

export const seedReadings: Reading[] = [
  {
    id: '2026-08-28-start-vor',
    date: '2026-08-28',
    lesson: 'Startmessung',
    phase: 'before',
    co2Ppm: 518,
    temperatureC: 23.8,
    sortOrder: 100,
    createdAt: '2026-08-28T08:00:00Z',
  },
  {
    id: '2026-08-28-start-nach',
    date: '2026-08-28',
    lesson: 'Startmessung',
    phase: 'after',
    co2Ppm: 575,
    temperatureC: 23.9,
    sortOrder: 101,
    createdAt: '2026-08-28T09:30:00Z',
  },
]
