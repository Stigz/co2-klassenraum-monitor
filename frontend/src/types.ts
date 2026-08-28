export type Phase = 'before' | 'after'

export interface Reading {
  id: string
  date: string
  lesson: string
  phase: Phase
  co2Ppm: number
  temperatureC: number
  sortOrder: number
  createdAt: string
}

export interface LessonDraft {
  date: string
  lesson: string
  before: {
    co2Ppm: number
    temperatureC: number
  }
  after: {
    co2Ppm: number
    temperatureC: number
  }
}
