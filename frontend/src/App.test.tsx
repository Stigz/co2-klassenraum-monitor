import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./api', async () => {
  const { seedReadings } = await import('./data')
  return {
    fetchReadings: vi.fn(async () => ({ readings: seedReadings, isPreview: true })),
    createLesson: vi.fn(),
  }
})

vi.mock('recharts', async () => {
  const React = await import('react')
  const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    ResponsiveContainer: Stub,
    LineChart: Stub,
    CartesianGrid: Stub,
    ReferenceArea: Stub,
    XAxis: Stub,
    YAxis: Stub,
    Tooltip: Stub,
    Legend: Stub,
    Line: Stub,
  }
})

afterEach(() => vi.restoreAllMocks())

describe('App', () => {
  it('shows the supplied before and after readings in preview mode', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getAllByText(/575/).length).toBeGreaterThan(0))
    expect(screen.getByText(/Lokale Vorschau/)).toBeInTheDocument()
    expect(screen.getAllByText(/23,9/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/518/).length).toBeGreaterThan(0)
  })

  it('provides a form for the next lesson', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Neue Lektion erfassen' })).toBeInTheDocument()
    expect(screen.getByLabelText('Eingabecode')).toBeRequired()
    expect(screen.getByRole('button', { name: /Lektion speichern/ })).toBeEnabled()
  })
})
