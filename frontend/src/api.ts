import { seedReadings } from './data'
import type { LessonDraft, Reading } from './types'

const apiUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export async function fetchReadings(): Promise<{ readings: Reading[]; isPreview: boolean }> {
  if (!apiUrl) {
    return { readings: seedReadings, isPreview: true }
  }

  const response = await fetch(`${apiUrl}/readings`, {
    headers: { accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error('Die Messungen konnten nicht geladen werden.')
  }
  return { readings: (await response.json()) as Reading[], isPreview: false }
}

export async function createLesson(draft: LessonDraft, writeToken: string): Promise<Reading[]> {
  if (!apiUrl) {
    throw new Error('In der lokalen Vorschau können keine Messungen gespeichert werden.')
  }

  const response = await fetch(`${apiUrl}/lessons`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-write-token': writeToken,
    },
    body: JSON.stringify(draft),
  })
  const payload = (await response.json()) as Reading[] | { message?: string }
  if (!response.ok) {
    throw new Error(!Array.isArray(payload) && payload.message ? payload.message : 'Die Lektion konnte nicht gespeichert werden.')
  }
  return payload as Reading[]
}
