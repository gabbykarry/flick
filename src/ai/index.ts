import type { RunReport, SessionResult, StepResult } from '../session/index.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AiAnalysis {
  provider: 'ollama' | 'lmstudio' | 'none'
  model: string | null
  summary: string
  suggestions: string[]
  patterns: string[]
}

interface OllamaModel {
  name: string
}

// Model preference order — best reasoning first
// We pick the first one that's actually installed
const PREFERRED_MODELS = [
  'llama3.2',
  'llama3.1',
  'mistral',
  'phi3',
  'phi4',
  'gemma2',
  'llama2',
]

// ── Provider detection ────────────────────────────────────────────────────────

// Checks if Ollama is running and returns the best available model name.
// Returns null if Ollama is not running or has no models installed.
export async function detectOllama(): Promise<string | null> {
  try {
    const res = await fetch('http://localhost:11434/api/tags')
    if (!res.ok) return null

    const data = await res.json() as { models: OllamaModel[] }
    const installed = data.models.map(m => m.name)

    // pick highest preference model that's installed
    for (const preferred of PREFERRED_MODELS) {
      const match = installed.find(m => m.startsWith(preferred))
      if (match) return match
    }

    // nothing preferred — just use whatever is there
    return installed[0] ?? null
  } catch {
    return null
  }
}

// Checks if LM Studio is running (OpenAI-compatible API at port 1234).
// Returns the first available model name or null.
export async function detectLmStudio(): Promise<string | null> {
  try {
    const res = await fetch('http://localhost:1234/v1/models')
    if (!res.ok) return null

    const data = await res.json() as { data: Array<{ id: string }> }
    return data.data[0]?.id ?? null
  } catch {
    return null
  }
}

// ── Prompt builder ────────────────────────────────────────────────────────────

// Builds a focused analysis prompt from the RunReport.
// We don't dump the full JSON — that would overwhelm small local models.
// Instead we extract just the signal: errors, crashes, patterns.
function buildPrompt(report: RunReport): string {
  const lines: string[] = []

  lines.push(`You are a mobile app test analyser. Analyse this test run and provide:`)
  lines.push(`1. A 2-3 sentence plain English summary of what happened`)
  lines.push(`2. Up to 3 specific actionable suggestions to fix the failures`)
  lines.push(`3. Any patterns you notice across multiple failures`)
  lines.push(``)
  lines.push(`Respond ONLY as JSON in this exact shape, no markdown, no preamble:`)
  lines.push(`{"summary":"...","suggestions":["..."],"patterns":["..."]}`)
  lines.push(``)
  lines.push(`TEST RUN RESULTS:`)
  lines.push(`Platform: ${report.platform}`)
  lines.push(`Total steps: ${report.summary.total}`)
  lines.push(`Passed: ${report.summary.passed}`)
  lines.push(`Failed: ${report.summary.failed}`)
  lines.push(`Crashed: ${report.summary.crashed}`)
  lines.push(`Skipped: ${report.summary.skipped}`)
  lines.push(``)

  for (const session of report.sessions) {
    lines.push(`SESSION: "${session.name}" — ${session.status.toUpperCase()}`)
    for (const step of session.steps) {
      if (step.status === 'passed') continue // skip noise — only failures matter
      lines.push(formatFailedStep(step))
    }
    lines.push(``)
  }

  return lines.join('\n')
}

function formatFailedStep(step: StepResult): string {
  const parts: string[] = [
    `  Step ${step.index + 1}: ${step.action}${step.selector ? ` on "${step.selector}"` : ''} → ${step.status.toUpperCase()}`,
  ]

  if (step.error) {
    parts.push(`    Error type: ${step.error.type}`)
    parts.push(`    Message: ${step.error.message.slice(0, 200)}`)
  }

  if (step.crash) {
    parts.push(`    Crash after: ${step.crash.lastEvent}`)
    parts.push(`    Retry attempts: ${step.crash.retryAttempts}`)
    parts.push(`    Skipped: ${step.crash.skipped}`)
  }

  return parts.join('\n')
}

// ── Ollama completion ─────────────────────────────────────────────────────────

async function callOllama(model: string, prompt: string): Promise<string> {
  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      // keep response focused — we only need a short JSON object
      options: { temperature: 0.2, num_predict: 512 },
    }),
  })

  if (!res.ok) throw new Error(`Ollama returned ${res.status}`)

  const data = await res.json() as { response: string }
  return data.response
}

// ── LM Studio completion (OpenAI-compatible) ──────────────────────────────────

async function callLmStudio(model: string, prompt: string): Promise<string> {
  const res = await fetch('http://localhost:1234/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 512,
    }),
  })

  if (!res.ok) throw new Error(`LM Studio returned ${res.status}`)

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>
  }
  return data.choices[0]?.message.content ?? ''
}

// ── Response parser ───────────────────────────────────────────────────────────

// Parses the model's JSON response into structured fields.
// Models sometimes wrap JSON in markdown fences — we strip those first.
function parseResponse(raw: string): Pick<AiAnalysis, 'summary' | 'suggestions' | 'patterns'> {
  const fallback = {
    summary: raw.slice(0, 300),
    suggestions: [],
    patterns: [],
  }

  try {
    // strip ```json ... ``` fences if present
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    const parsed = JSON.parse(cleaned) as {
      summary?: string
      suggestions?: string[]
      patterns?: string[]
    }

    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : fallback.summary,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
    }
  } catch {
    return fallback
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

// Analyses a completed RunReport using the best available local LLM.
// If neither Ollama nor LM Studio is running, returns a no-op result.
// Never throws — AI analysis is always optional.
export async function analyseRun(report: RunReport): Promise<AiAnalysis> {
  // skip analysis if everything passed — nothing to analyse
  if (report.summary.failed === 0 && report.summary.crashed === 0) {
    return {
      provider: 'none',
      model: null,
      summary: 'All steps passed. No issues to analyse.',
      suggestions: [],
      patterns: [],
    }
  }

  const prompt = buildPrompt(report)

  // try Ollama first — it's the preferred free local provider
  const ollamaModel = await detectOllama()
  if (ollamaModel) {
    try {
      const raw = await callOllama(ollamaModel, prompt)
      const parsed = parseResponse(raw)
      return { provider: 'ollama', model: ollamaModel, ...parsed }
    } catch {
      // Ollama detected but call failed — fall through to LM Studio
    }
  }

  // try LM Studio second
  const lmStudioModel = await detectLmStudio()
  if (lmStudioModel) {
    try {
      const raw = await callLmStudio(lmStudioModel, prompt)
      const parsed = parseResponse(raw)
      return { provider: 'lmstudio', model: lmStudioModel, ...parsed }
    } catch {
      // LM Studio detected but call failed — fall through to none
    }
  }

  // no provider available — return graceful no-op
  return {
    provider: 'none',
    model: null,
    summary: 'No local AI provider found. Start Ollama or LM Studio to enable analysis.',
    suggestions: [],
    patterns: [],
  }
}