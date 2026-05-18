import fs from 'fs'
import yaml from 'js-yaml'
import path from 'path'
import type { FlickAuth, FlickConfig, FlickFile, FlickSession, FlickStep } from '../session/index.js'

// ── Loader ────────────────────────────────────────────────────────────────────

// Reads flick.yml from the given path, resolves env vars, validates shape
// Throws a descriptive error if anything is wrong — never returns partial data
export function loadConfig(filePath: string): FlickFile {
  // load .env before anything else so env vars are available for token resolution
  loadEnvFile()
  const resolved = path.resolve(process.cwd(), filePath)

  if (!fs.existsSync(resolved)) {
    throw new Error(`Config file not found: ${resolved}\nRun "flick init" to create one.`)
  }

  const raw = fs.readFileSync(resolved, 'utf-8')

  // resolve ${VAR} and ${auth.email} style tokens before parsing
  // so yaml doesn't choke on them and env values are in place
  const interpolated = resolveTokens(raw)

  // js-yaml parses into unknown — we validate shape manually
  const parsed = yaml.load(interpolated)

  return validate(parsed)
}

// ── Token resolution ──────────────────────────────────────────────────────────

// Resolves two token types in the raw YAML string:
//   ${ENV_VAR}     → process.env.ENV_VAR
//   ${auth.email}  → the literal value under config.auth.email (resolved post-parse)
//
// We do env vars in the raw string before parsing so values land in the right
// places. auth.* references are resolved in a second pass after parsing.
function resolveTokens(raw: string): string {
  return raw.replace(/\$\{([^}]+)\}/g, (match, token: string) => {
    // auth.* tokens — leave them as-is, resolved in second pass after parsing
    if (token.startsWith('auth.')) return match

    // everything else — treat as env var
    const val = process.env[token]
    if (val === undefined) {
      throw new Error(
        `Environment variable "${token}" is not set.\nAdd it to your .env file or export it before running.`
      )
    }
    return val
  })
}

// Second pass — replaces ${auth.email} / ${auth.password} in step values
// with the actual values from the parsed auth block
function resolveAuthRefs(file: FlickFile): FlickFile {
  const authMap: Record<string, string> = {
    'auth.email': file.auth.email,
    'auth.password': file.auth.password,
  }

  const resolvedSessions = file.sessions.map(session => ({
    ...session,
    steps: session.steps.map(step => ({
      ...step,
      // only value fields can reference auth — selector never should
      value: step.value ? resolveRef(step.value, authMap) : step.value,
    })),
  }))

  return { ...file, sessions: resolvedSessions }
}

function resolveRef(str: string, map: Record<string, string>): string {
  return str.replace(/\$\{([^}]+)\}/g, (match, token: string) => {
    if (map[token] !== undefined) return map[token]
    throw new Error(`Unknown reference "${match}" in flick.yml step value.`)
  })
}

// ── Validation ────────────────────────────────────────────────────────────────

// Validates the raw parsed object has the right shape
// Returns a typed FlickFile or throws with a clear message pointing at the problem
function validate(parsed: unknown): FlickFile {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('flick.yml must be a YAML object at the top level.')
  }

  const raw = parsed as Record<string, unknown>

  const config = validateConfig(raw['config'])
  const auth = validateAuth(raw['auth'])
  const sessions = validateSessions(raw['sessions'])

  const file: FlickFile = { config, auth, sessions }

  // second pass — wire auth refs into step values
  return resolveAuthRefs(file)
}

function validateConfig(raw: unknown): FlickConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('flick.yml is missing a "config" block.')
  }

  const c = raw as Record<string, unknown>

  const platform = c['platform']
  if (platform !== 'android' && platform !== 'ios' && platform !== 'web') {
    throw new Error(`config.platform must be "android", "ios", or "web". Got: "${platform}"`)
  }

  // web requires a url, mobile requires an app path
  if (platform === 'web' && typeof c['url'] !== 'string') {
    throw new Error('config.url is required when platform is "web".')
  }
  if ((platform === 'android' || platform === 'ios') && typeof c['app'] !== 'string') {
    throw new Error(`config.app is required when platform is "${platform}".`)
  }

  const retries = c['retries']
  if (typeof retries !== 'number' || retries < 0) {
    throw new Error(`config.retries must be a non-negative number. Got: "${retries}"`)
  }

  return {
    platform,
    app: typeof c['app'] === 'string' ? c['app'] : undefined,
    url: typeof c['url'] === 'string' ? c['url'] : undefined,
    retries,
    udid: typeof c['udid'] === 'string' ? c['udid'] : undefined,
  }
}

function validateAuth(raw: unknown): FlickAuth {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('flick.yml is missing an "auth" block.')
  }

  const a = raw as Record<string, unknown>

  if (typeof a['email'] !== 'string' || a['email'].trim() === '') {
    throw new Error('auth.email must be a non-empty string.')
  }
  if (typeof a['password'] !== 'string' || a['password'].trim() === '') {
    throw new Error('auth.password must be a non-empty string.')
  }

  return {
    email: a['email'],
    password: a['password'],
  }
}

function validateSessions(raw: unknown): FlickSession[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('flick.yml must have a "sessions" array with at least one session.')
  }

  return raw.map((s: unknown, i: number) => {
    if (typeof s !== 'object' || s === null) {
      throw new Error(`sessions[${i}] must be an object.`)
    }

    const session = s as Record<string, unknown>

    if (typeof session['name'] !== 'string' || session['name'].trim() === '') {
      throw new Error(`sessions[${i}].name must be a non-empty string.`)
    }

    if (!Array.isArray(session['steps']) || session['steps'].length === 0) {
      throw new Error(`sessions[${i}] ("${session['name']}") must have at least one step.`)
    }

    return {
      name: session['name'] as string,
      steps: session['steps'].map((step: unknown, j: number) =>
        validateStep(step, i, j, session['name'] as string)
      ),
    }
  })
}

const VALID_ACTIONS = ['tap', 'fill', 'scroll', 'wait', 'assert'] as const

function validateStep(
  raw: unknown,
  sessionIndex: number,
  stepIndex: number,
  sessionName: string
): FlickStep {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`sessions["${sessionName}"].steps[${stepIndex}] must be an object.`)
  }

  const s = raw as Record<string, unknown>
  const loc = `sessions["${sessionName}"].steps[${stepIndex}]`

  // action is required and must be one of the valid actions
  if (!VALID_ACTIONS.includes(s['action'] as FlickStep['action'])) {
    throw new Error(
      `${loc}.action must be one of: ${VALID_ACTIONS.join(', ')}. Got: "${s['action']}"`
    )
  }

  const action = s['action'] as FlickStep['action']

  // tap, fill, assert all need a selector
  if (['tap', 'fill', 'assert'].includes(action) && typeof s['selector'] !== 'string') {
    throw new Error(`${loc} — action "${action}" requires a "selector".`)
  }

  // fill needs a value
  if (action === 'fill' && typeof s['value'] !== 'string') {
    throw new Error(`${loc} — action "fill" requires a "value".`)
  }

  // wait needs a duration in ms
  if (action === 'wait' && typeof s['duration'] !== 'number') {
    throw new Error(`${loc} — action "wait" requires a numeric "duration" (milliseconds).`)
  }

  return {
    action,
    selector: typeof s['selector'] === 'string' ? s['selector'] : undefined,
    value: typeof s['value'] === 'string' ? s['value'] : undefined,
    visible: typeof s['visible'] === 'boolean' ? s['visible'] : undefined,
    duration: typeof s['duration'] === 'number' ? s['duration'] : undefined,
  }
}

// ── Env loader ────────────────────────────────────────────────────────────────

// Loads .env file from cwd into process.env before config is parsed.
// We do this manually without dotenv to keep dependencies minimal.
// Called once at the top of loadConfig.
function loadEnvFile(): void {
  const envPath = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return

  const lines = fs.readFileSync(envPath, 'utf-8').split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    // skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex).trim()
    // strip surrounding quotes from value if present
    let value = trimmed.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    // don't overwrite vars already set in the environment
    // so `export TEST_PASSWORD=x flick run` still takes precedence
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}