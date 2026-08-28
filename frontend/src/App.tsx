import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { createLesson, fetchReadings } from './api'
import type { LessonDraft, Reading } from './types'

const today = new Date().toISOString().slice(0, 10)

const emptyDraft = (): LessonDraft => ({
  date: today,
  lesson: '',
  before: { co2Ppm: 500, temperatureC: 22 },
  after: { co2Ppm: 600, temperatureC: 22.5 },
})

const dateFormatter = new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: '2-digit' })
const numberFormatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T12:00:00`))
}

function phaseLabel(phase: Reading['phase']) {
  return phase === 'before' ? 'Vorher' : 'Nachher'
}

function co2Status(value: number) {
  if (value < 800) return { label: 'Sehr gute Luft', tone: 'good' }
  if (value < 1000) return { label: 'Gute Luft', tone: 'fair' }
  if (value < 1400) return { label: 'Lüften empfohlen', tone: 'warn' }
  return { label: 'Jetzt lüften', tone: 'alert' }
}

function App() {
  const [readings, setReadings] = useState<Reading[]>([])
  const [draft, setDraft] = useState<LessonDraft>(emptyDraft)
  const [writeToken, setWriteToken] = useState('')
  const [isPreview, setIsPreview] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  async function load() {
    try {
      const result = await fetchReadings()
      setReadings(result.readings)
      setIsPreview(result.isPreview)
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unbekannter Fehler' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const chartData = useMemo(
    () => readings.map((item) => ({
      ...item,
      label: `${formatDate(item.date)} · ${item.lesson} · ${phaseLabel(item.phase)}`,
      shortLabel: `${formatDate(item.date)} ${item.phase === 'before' ? 'V' : 'N'}`,
    })),
    [readings],
  )

  const latest = readings.at(-1)
  const previous = readings.at(-2)
  const latestStatus = latest ? co2Status(latest.co2Ppm) : null
  const co2Delta = latest && previous ? latest.co2Ppm - previous.co2Ppm : 0
  const temperatureDelta = latest && previous ? latest.temperatureC - previous.temperatureC : 0

  function updateMeasurement(phase: 'before' | 'after', field: 'co2Ppm' | 'temperatureC', value: string) {
    setDraft((current) => ({
      ...current,
      [phase]: { ...current[phase], [field]: Number(value) },
    }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      await createLesson(draft, writeToken)
      setDraft(emptyDraft())
      setWriteToken('')
      await load()
      setMessage({ type: 'success', text: 'Die neue Lektion wurde gespeichert.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unbekannter Fehler' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero__mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <p className="eyebrow">Langzeitmessung · Schulzimmer</p>
          <h1>Luft im Schulzimmer</h1>
          <p className="hero__intro">CO₂ und Temperatur vor und nach jeder Lektion vergleichen.</p>
        </div>
        <div className="live-pill"><span /> Messreihe aktiv</div>
      </header>

      <main>
        {message && <div className={`notice notice--${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</div>}
        {isPreview && <div className="notice notice--preview">Lokale Vorschau mit den beiden Startmessungen</div>}

        <section className="summary-grid" aria-label="Aktueller Stand">
          <article className="metric-card metric-card--co2">
            <div className="metric-card__top"><span>CO₂ aktuell</span><span className="metric-icon">CO₂</span></div>
            <div className="metric-value">{latest ? latest.co2Ppm : '–'} <small>ppm</small></div>
            {latestStatus && <div className={`status-chip status-chip--${latestStatus.tone}`}>{latestStatus.label}</div>}
          </article>
          <article className="metric-card metric-card--temperature">
            <div className="metric-card__top"><span>Temperatur aktuell</span><span className="thermometer" aria-hidden="true" /></div>
            <div className="metric-value">{latest ? numberFormatter.format(latest.temperatureC) : '–'} <small>°C</small></div>
            <p className="metric-note">Letzte Messung: {latest ? `${phaseLabel(latest.phase)}, ${formatDate(latest.date)}` : '–'}</p>
          </article>
          <article className="metric-card metric-card--change">
            <div className="metric-card__top"><span>Letzte Veränderung</span><span className="trend-icon" aria-hidden="true">↗</span></div>
            <div className="change-row"><strong className={co2Delta > 0 ? 'up' : 'down'}>{co2Delta > 0 ? '+' : ''}{co2Delta} ppm</strong><span>CO₂</span></div>
            <div className="change-row"><strong>{temperatureDelta > 0 ? '+' : ''}{numberFormatter.format(temperatureDelta)} °C</strong><span>Temperatur</span></div>
          </article>
        </section>

        <section className="panel chart-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Verlauf</p>
              <h2>Messungen über die Zeit</h2>
            </div>
            <p>{readings.length} Messpunkte · {new Set(readings.map((item) => `${item.date}-${item.lesson}`)).size} Lektionen</p>
          </div>

          <div className="chart-wrap" aria-label="Liniendiagramm mit CO₂ und Temperatur">
            {loading ? <div className="empty-state">Messungen werden geladen …</div> : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 18, right: 10, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="#dfe5df" strokeDasharray="3 5" vertical={false} />
                  <ReferenceArea yAxisId="co2" y1={1000} y2={1400} fill="#f5b83b" fillOpacity={0.08} />
                  <ReferenceArea yAxisId="co2" y1={1400} y2={2000} fill="#d95f4f" fillOpacity={0.08} />
                  <XAxis dataKey="shortLabel" tick={{ fill: '#5f6b63', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="co2" domain={[400, (max: number) => Math.max(800, Math.ceil(max / 100) * 100)]} tick={{ fill: '#5f6b63', fontSize: 12 }} axisLine={false} tickLine={false} width={48} unit="" />
                  <YAxis yAxisId="temperature" orientation="right" domain={['dataMin - 1', 'dataMax + 1']} tick={{ fill: '#5f6b63', fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend verticalAlign="top" align="right" height={42} iconType="circle" />
                  <Line yAxisId="co2" type="monotone" dataKey="co2Ppm" name="CO₂ (ppm)" stroke="#197a68" strokeWidth={3} dot={{ r: 5, fill: '#f7fbf8', strokeWidth: 3 }} activeDot={{ r: 7 }} />
                  <Line yAxisId="temperature" type="monotone" dataKey="temperatureC" name="Temperatur (°C)" stroke="#d0703f" strokeWidth={3} dot={{ r: 5, fill: '#fff9f4', strokeWidth: 3 }} activeDot={{ r: 7 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="thresholds" aria-label="CO₂-Richtwerte">
            <span><i className="dot dot--good" /> unter 800: sehr gut</span>
            <span><i className="dot dot--fair" /> 800–999: gut</span>
            <span><i className="dot dot--warn" /> 1000–1399: lüften</span>
            <span><i className="dot dot--alert" /> ab 1400: jetzt lüften</span>
          </div>
        </section>

        <section className="content-grid">
          <form className="panel entry-panel" onSubmit={submit}>
            <div className="section-heading">
              <div><p className="eyebrow">Erweitern</p><h2>Neue Lektion erfassen</h2></div>
            </div>
            <div className="form-grid form-grid--meta">
              <label>Datum<input type="date" required value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
              <label>Lektion<input type="text" required maxLength={80} placeholder="z. B. NT 7 · 2. Lektion" value={draft.lesson} onChange={(event) => setDraft({ ...draft, lesson: event.target.value })} /></label>
            </div>
            <div className="measurement-columns">
              <fieldset>
                <legend><span>1</span> Vor der Lektion</legend>
                <label>CO₂ <span>ppm</span><input type="number" min="300" max="10000" required value={draft.before.co2Ppm} onChange={(event) => updateMeasurement('before', 'co2Ppm', event.target.value)} /></label>
                <label>Temperatur <span>°C</span><input type="number" min="-10" max="50" step="0.1" required value={draft.before.temperatureC} onChange={(event) => updateMeasurement('before', 'temperatureC', event.target.value)} /></label>
              </fieldset>
              <fieldset>
                <legend><span>2</span> Nach der Lektion</legend>
                <label>CO₂ <span>ppm</span><input type="number" min="300" max="10000" required value={draft.after.co2Ppm} onChange={(event) => updateMeasurement('after', 'co2Ppm', event.target.value)} /></label>
                <label>Temperatur <span>°C</span><input type="number" min="-10" max="50" step="0.1" required value={draft.after.temperatureC} onChange={(event) => updateMeasurement('after', 'temperatureC', event.target.value)} /></label>
              </fieldset>
            </div>
            <label className="token-field">Eingabecode<input type="password" autoComplete="off" required value={writeToken} onChange={(event) => setWriteToken(event.target.value)} /></label>
            <button type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Lektion speichern'} <span aria-hidden="true">→</span></button>
          </form>

          <section className="panel readings-panel">
            <div className="section-heading"><div><p className="eyebrow">Messprotokoll</p><h2>Letzte Werte</h2></div></div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Datum</th><th>Lektion</th><th>Phase</th><th>CO₂</th><th>Temp.</th></tr></thead>
                <tbody>
                  {[...readings].reverse().slice(0, 8).map((item) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.date)}</td>
                      <td>{item.lesson}</td>
                      <td><span className={`phase phase--${item.phase}`}>{phaseLabel(item.phase)}</span></td>
                      <td><strong>{item.co2Ppm}</strong> ppm</td>
                      <td>{numberFormatter.format(item.temperatureC)} °C</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </main>

      <footer><span>Luft im Schulzimmer</span><span>Messwerte ohne Personendaten · AWS-Region Frankfurt</span></footer>
    </div>
  )
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Reading & { label: string } }> }) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  return (
    <div className="chart-tooltip">
      <strong>{item.label}</strong>
      <span><i className="dot dot--co2" /> {item.co2Ppm} ppm CO₂</span>
      <span><i className="dot dot--temperature" /> {numberFormatter.format(item.temperatureC)} °C</span>
    </div>
  )
}

export default App
