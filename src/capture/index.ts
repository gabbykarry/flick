import type { ErrorEvent, Platform } from '../session/index.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CaptureHandle {
  flush: () => SilentError[]
  stop: () => void
}

export interface SilentError {
  type: ErrorEvent['type']
  message: string
  screenshot: string | null
  logs: string[]
  timestamp: string
}

interface LogEntry {
  level?: string
  message: string
  timestamp?: number
}

// ── Silent error patterns ─────────────────────────────────────────────────────

const SILENT_ERROR_PATTERNS: Array<{ pattern: RegExp; type: ErrorEvent['type'] }> = [
  { pattern: /UnhandledPromiseRejection/i,  type: 'unhandled-promise' },
  { pattern: /Possible Unhandled Promise/i, type: 'unhandled-promise' },
  { pattern: /TypeError:/i,                 type: 'runtime' },
  { pattern: /ReferenceError:/i,            type: 'runtime' },
  { pattern: /Cannot read prop/i,           type: 'runtime' },
  { pattern: /undefined is not an object/i, type: 'runtime' },
  { pattern: /null is not an object/i,      type: 'runtime' },
  { pattern: /FATAL EXCEPTION/i,            type: 'runtime' },
]

// ── Capture session ───────────────────────────────────────────────────────────

// Starts a background polling loop that watches for silent errors and
// frozen screens. Returns a handle — call flush() after each step,
// stop() at session end.
export function startCapture(
  browser: WebdriverIO.Browser,
  platform: Platform,
  pollIntervalMs = 1500
): CaptureHandle {
  const pendingErrors: SilentError[] = []
  let lastScreenshotHash = ''
  let blankFrameCount = 0
  let running = true

  ;(async () => {
    while (running) {
      await sleep(pollIntervalMs)
      if (!running) break

      const logErrors = await checkLogs(browser, platform)
      pendingErrors.push(...logErrors)

      const blankResult = await checkBlankScreen(browser, lastScreenshotHash)
      if (blankResult) {
        lastScreenshotHash = blankResult.hash
        blankFrameCount++
        if (blankFrameCount >= 2) {
          pendingErrors.push(blankResult.error)
          blankFrameCount = 0
        }
      } else {
        blankFrameCount = 0
        lastScreenshotHash = ''
      }
    }
  })()

  return {
    flush: () => {
      const errors = [...pendingErrors]
      pendingErrors.length = 0
      return errors
    },
    stop: () => { running = false },
  }
}

// ── Log fetching — platform aware ─────────────────────────────────────────────

// Appium 2 dropped browser.getLogs() (JSONWireProtocol).
// The correct approach per platform:
//   Android → executeScript('mobile: getDeviceLogs') via UiAutomator2 extension
//   iOS     → executeScript('mobile: getLogs', [{ type: 'syslog' }]) via XCUITest
//   web     → no native device logs available, return []
async function fetchLogs(
  browser: WebdriverIO.Browser,
  platform: Platform
): Promise<LogEntry[]> {
  try {
    if (platform === 'android') {
      // UiAutomator2 mobile extension — returns logcat entries since last call
      const result = await browser.executeScript('mobile: getDeviceLogs', [{}]) as unknown
      return normaliseLogResult(result)
    }

    if (platform === 'ios') {
      // XCUITest mobile extension — returns syslog entries
      const result = await browser.executeScript('mobile: getLogs', [{ type: 'syslog' }]) as unknown
      return normaliseLogResult(result)
    }

    // web — no device logs
    return []
  } catch {
    // driver may not support the extension or feature is disabled — skip silently
    return []
  }
}

// Normalises whatever the mobile extension returns into our LogEntry shape.
// Both UiAutomator2 and XCUITest return an array of objects with a message field,
// but the exact shape varies — this handles both.
function normaliseLogResult(result: unknown): LogEntry[] {
  if (!Array.isArray(result)) return []
  return result
    .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
    .map(e => ({
      message: String(e['message'] ?? e['log'] ?? e['text'] ?? ''),
      level: typeof e['level'] === 'string' ? e['level'] : undefined,
      timestamp: typeof e['timestamp'] === 'number' ? e['timestamp'] : undefined,
    }))
    .filter(e => e.message.length > 0)
}

// ── Log checker ───────────────────────────────────────────────────────────────

async function checkLogs(
  browser: WebdriverIO.Browser,
  platform: Platform
): Promise<SilentError[]> {
  const logs = await fetchLogs(browser, platform)
  const errors: SilentError[] = []

  for (const log of logs) {
    for (const { pattern, type } of SILENT_ERROR_PATTERNS) {
      if (pattern.test(log.message)) {
        const screenshot = await safeScreenshot(browser)
        errors.push({
          type,
          message: log.message.slice(0, 500),
          screenshot,
          logs: [log.message],
          timestamp: new Date().toISOString(),
        })
        break // one error per log line
      }
    }
  }

  return errors
}

// ── Blank screen checker ──────────────────────────────────────────────────────

async function checkBlankScreen(
  browser: WebdriverIO.Browser,
  lastHash: string
): Promise<{ hash: string; error: SilentError } | null> {
  let base64: string

  try {
    base64 = await browser.takeScreenshot()
  } catch {
    return null
  }

  // cheap hash — length + first/last 100 chars
  const hash = `${base64.length}:${base64.slice(0, 100)}:${base64.slice(-100)}`

  if (hash === lastHash) {
    return {
      hash,
      error: {
        type: 'silent',
        message: 'Screen appears frozen — no change detected across multiple frames',
        screenshot: base64,
        logs: [],
        timestamp: new Date().toISOString(),
      },
    }
  }

  return null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function safeScreenshot(browser: WebdriverIO.Browser): Promise<string | null> {
  try {
    return await browser.takeScreenshot()
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}