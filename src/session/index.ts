import fs from 'fs'
import path from 'path'

// ── Config types (mirrors flick.yml) ─────────────────────────────────────────

export type Platform = 'android' | 'ios' | 'web'

export interface FlickAuth {
  email: string
  password: string
}

export interface FlickConfig {
  platform: Platform
  app?: string       // path to .apk / .ipa — not needed for web
  url?: string       // base url — web only
  retries: number    // how many times to retry a crashing step
  udid?: string      // simulator/device UDID — optional, Appium auto-detects if omitted
}

export interface FlickStep {
  action: 'tap' | 'fill' | 'scroll' | 'wait' | 'assert'
  selector?: string
  value?: string
  visible?: boolean  // used by assert
  duration?: number  // used by wait (ms)
}

export interface FlickSession {
  name: string
  steps: FlickStep[]
}

export interface FlickFile {
  config: FlickConfig
  auth: FlickAuth
  sessions: FlickSession[]
}

// ── Runtime result types ──────────────────────────────────────────────────────

// Status of a single step after execution
export type StepStatus = 'passed' | 'failed' | 'crashed' | 'skipped'

// A silent error detected during a step (unhandled promise, blank screen, etc.)
export interface ErrorEvent {
  type: 'runtime' | 'silent' | 'alert' | 'unhandled-promise'
  message: string
  screenshot: string | null  // base64 encoded PNG
  logs: string[]             // log lines captured around this error
  timestamp: string
}

// Full crash report attached to a step
export interface CrashReport {
  lastEvent: string          // description of the action that caused the crash
  screenshot: string | null  // last known screen state, base64
  retryAttempts: number      // how many retries were attempted (max = config.retries)
  skipped: boolean           // true if we gave up and moved on
  timestamp: string
}

// Result of running a single step
export interface StepResult {
  index: number
  action: FlickStep['action']
  selector: string | undefined
  value: string | undefined
  status: StepStatus
  durationMs: number
  error: ErrorEvent | null
  crash: CrashReport | null
}

// Result of running a full named session (one block in flick.yml)
export interface SessionResult {
  name: string
  status: 'passed' | 'failed' | 'crashed'
  steps: StepResult[]
  startedAt: string
  finishedAt: string
  durationMs: number
}

// Top-level run — one flick run = one RunReport
export interface RunReport {
  id: string              // unique run id e.g. "run_20240517_143200"
  platform: Platform
  app: string | undefined
  url: string | undefined
  startedAt: string
  finishedAt: string | null
  sessions: SessionResult[]
  summary: {
    total: number
    passed: number
    failed: number
    crashed: number
    skipped: number
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

// Creates a fresh in-memory RunReport at the start of a flick run
export function createRun(config: FlickConfig): RunReport {
  const now = new Date()

  // id format: run_YYYYMMDD_HHmmss — human readable, sortable
  const id = `run_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`

  return {
    id,
    platform: config.platform,
    app: config.app,
    url: config.url,
    startedAt: now.toISOString(),
    finishedAt: null,
    sessions: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      crashed: 0,
      skipped: 0,
    },
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────

// Saves the completed RunReport to .flick/sessions/<id>.json
// Called once at the end of a flick run
export function saveRun(report: RunReport): string {
  // mark finished time
  report.finishedAt = new Date().toISOString()

  // recompute summary from actual step results
  report.summary = computeSummary(report)

  // ensure .flick/sessions/ exists — create it if not
  const dir = path.resolve(process.cwd(), '.flick', 'sessions')
  fs.mkdirSync(dir, { recursive: true })

  const filePath = path.join(dir, `${report.id}.json`)
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8')

  return filePath
}

// Loads all past runs from .flick/sessions/ sorted newest first
export function loadRuns(): RunReport[] {
  const dir = path.resolve(process.cwd(), '.flick', 'sessions')

  if (!fs.existsSync(dir)) return []

  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf-8')
      return JSON.parse(raw) as RunReport
    })
    .sort((a, b) => {
      // newest first — compare startedAt ISO strings (lexicographic sort works for ISO)
      return b.startedAt.localeCompare(a.startedAt)
    })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function computeSummary(report: RunReport): RunReport['summary'] {
  const summary = { total: 0, passed: 0, failed: 0, crashed: 0, skipped: 0 }

  for (const session of report.sessions) {
    for (const step of session.steps) {
      summary.total++
      summary[step.status]++
    }
  }

  return summary
}