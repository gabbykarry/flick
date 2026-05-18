import type {
  ErrorEvent,
  FlickStep,
  StepResult,
  StepStatus,
} from '../session/index.js'

// ── Executor ──────────────────────────────────────────────────────────────────

// Executes a single FlickStep against the live WebdriverIO browser/app session.
// Returns a StepResult — never throws. All errors are caught and recorded.
export async function executeStep(
  step: FlickStep,
  index: number,
  browser: WebdriverIO.Browser,
  platform: 'android' | 'ios' | 'web' = 'web'
): Promise<StepResult> {
  const startedAt = Date.now()

  try {
    await runAction(step, browser, platform)

    return buildResult({
      index,
      step,
      status: 'passed',
      durationMs: Date.now() - startedAt,
      error: null,
      crash: null,
    })
  } catch (err: unknown) {
    const screenshot = await safeScreenshot(browser)
    const logs = await safeLogs(browser, platform)

    const error: ErrorEvent = {
      type: classifyError(err),
      message: errorMessage(err),
      screenshot,
      logs,
      timestamp: new Date().toISOString(),
    }

    return buildResult({
      index,
      step,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      error,
      crash: null,
    })
  }
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function runAction(step: FlickStep, browser: WebdriverIO.Browser, platform: 'android' | 'ios' | 'web'): Promise<void> {
  switch (step.action) {
    case 'tap':    return runTap(step, browser, platform)
    case 'fill':   return runFill(step, browser, platform)
    case 'scroll': return runScroll(browser)
    case 'wait':   return runWait(step)
    case 'assert': return runAssert(step, browser, platform)
    default: {
      const _never: never = step.action
      throw new Error(`Unknown action: ${_never}`)
    }
  }
}

async function runTap(step: FlickStep, browser: WebdriverIO.Browser, platform: 'android' | 'ios' | 'web'): Promise<void> {
  const timeout = platform === 'web' ? 10_000 : 20_000
  const el = await browser.$(resolveSelector(step.selector!, platform))
  await el.waitForExist({ timeout })
  await el.click()
}

async function runFill(step: FlickStep, browser: WebdriverIO.Browser, platform: 'android' | 'ios' | 'web'): Promise<void> {
  const timeout = platform === 'web' ? 10_000 : 20_000
  const el = await browser.$(resolveSelector(step.selector!, platform))
  await el.waitForExist({ timeout })
  await el.clearValue()
  await el.setValue(step.value!)
}

async function runScroll(browser: WebdriverIO.Browser): Promise<void> {
  const { width, height } = await browser.getWindowSize()
  await browser.touchAction([
    { action: 'press',  x: width / 2, y: height * 0.8 },
    { action: 'moveTo', x: width / 2, y: height * 0.2 },
    { action: 'release' },
  ])
}

async function runWait(step: FlickStep): Promise<void> {
  await sleep(step.duration ?? 1000)
}

async function runAssert(step: FlickStep, browser: WebdriverIO.Browser, platform: 'android' | 'ios' | 'web'): Promise<void> {
  const el = await browser.$(resolveSelector(step.selector!, platform))
  // mobile simulator state updates are slower than web — give them more time
  const timeout = platform === 'web' ? 10_000 : 20_000

  if (step.visible === true) {
    await el.waitForDisplayed({ timeout })
    return
  }
  if (step.visible === false) {
    await el.waitForDisplayed({ timeout, reverse: true })
    return
  }
  await el.waitForExist({ timeout })
}

// ── Log entry shape ───────────────────────────────────────────────────────────

// WebdriverIO types getLogs() as Promise<object[]> which loses the shape.
// We cast with this interface after the call — matches the actual runtime shape
// from both logcat (Android) and syslog (iOS).
interface LogEntry {
  level: string
  message: string
  timestamp: number
}

// ── Safe capture helpers ──────────────────────────────────────────────────────

async function safeScreenshot(browser: WebdriverIO.Browser): Promise<string | null> {
  try {
    return await browser.takeScreenshot()
  } catch {
    return null
  }
}

async function safeLogs(
  browser: WebdriverIO.Browser,
  platform: 'android' | 'ios' | 'web'
): Promise<string[]> {
  // web has no device logs — skip entirely
  if (platform === 'web') return []

  // Appium 2 mobile extensions replace the deprecated getLogs() command
  const cmd = platform === 'android' ? 'mobile: getDeviceLogs' : 'mobile: getLogs'
  const args = platform === 'android' ? [{}] : [{ type: 'syslog' }]

  try {
    const result = await browser.executeScript(cmd, args) as unknown
    if (!Array.isArray(result)) return []
    return (result as LogEntry[])
      .slice(-30)
      .map(e => `[${e.level}] ${e.message}`)
  } catch {
    return []
  }
}

// ── Error classification ──────────────────────────────────────────────────────

function classifyError(err: unknown): ErrorEvent['type'] {
  const msg = errorMessage(err).toLowerCase()
  if (msg.includes('unhandled') || msg.includes('promise')) return 'unhandled-promise'
  if (msg.includes('alert') || msg.includes('modal')) return 'alert'
  if (msg.includes('silent')) return 'silent'
  return 'runtime'
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'Unknown error'
}

// ── Result builder ────────────────────────────────────────────────────────────

function buildResult(opts: {
  index: number
  step: FlickStep
  status: StepStatus
  durationMs: number
  error: ErrorEvent | null
  crash: null
}): StepResult {
  return {
    index: opts.index,
    action: opts.step.action,
    selector: opts.step.selector,
    value: opts.step.value,
    status: opts.status,
    durationMs: opts.durationMs,
    error: opts.error,
    crash: opts.crash,
  }
}

// ── Selector resolution ───────────────────────────────────────────────────────

// On web, selectors are CSS — #id, .class, tag, [attr]
// On mobile, ~ prefix means accessibility ID (Appium shorthand)
// If a selector starts with ~ on web we strip it and treat as CSS id
// This lets the same YAML work across platforms with minor conventions
function resolveSelector(selector: string, platform: 'android' | 'ios' | 'web'): string {
  if (platform === 'web') {
    // ~ is Appium accessibility shorthand — map to CSS id selector for web
    if (selector.startsWith('~')) return `#${selector.slice(1)}`
    return selector
  }
  // mobile — return as-is, WebdriverIO handles ~ natively for Appium
  return selector
}

// ── Utility ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}