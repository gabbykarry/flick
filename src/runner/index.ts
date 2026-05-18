import type { RemoteOptions } from 'webdriverio'
import { remote } from 'webdriverio'
import type { AiAnalysis } from '../ai/index.js'
import { analyseRun } from '../ai/index.js'
import type { CaptureHandle } from '../capture/index.js'
import { startCapture } from '../capture/index.js'
import { MJPEG_PORT } from '../dashboard/index.js'
import type {
  CrashReport,
  FlickFile,
  FlickStep,
  RunReport,
  SessionResult,
  StepResult,
} from '../session/index.js'
import { createRun, saveRun } from '../session/index.js'
import type { AppiumHandle } from './appium.js'
import { ensureAppium, ensureFfmpeg } from './appium.js'
import {
  bootBestSimulator,
  findBuiltApp,
  getBootedSimulatorUDID,
  getConnectedAndroidDevice,
} from './device.js'
import { executeStep } from './executor.js'
import type { ScreencastHandle } from './screencaster.js'
import { startWebScreencast } from './screencaster.js'

// ── Status helpers ────────────────────────────────────────────────────────────

function status(msg: string): void {
  process.stdout.write(`\r  ${msg.padEnd(60)}`)
}
function statusOk(msg: string): void {
  process.stdout.write(`\r  ✓ ${msg.padEnd(58)}\n`)
}
function statusFail(msg: string): void {
  process.stdout.write(`\r  ✗ ${msg}\n`)
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runFlick(
  file: FlickFile
): Promise<{ report: RunReport; savedTo: string; analysis: AiAnalysis }> {
  const report = createRun(file.config)

  let appium: AppiumHandle | null = null
  let resolvedAppPath = file.config.app

  if (file.config.platform === 'android' || file.config.platform === 'ios') {
    // ── step 1: resolve app path ──────────────────────────────────────────────
    status('Locating app build...')
    try {
      resolvedAppPath = findBuiltApp(
        file.config.app ?? file.config.platform,
        file.config.platform
      )
      const shortPath = resolvedAppPath.split('/').slice(-3).join('/')
      statusOk(`App found  ${shortPath}`)
    } catch (err: unknown) {
      statusFail(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }

    // ── step 2: detect device ─────────────────────────────────────────────────
    if (file.config.platform === 'ios') {
      const udid = getBootedSimulatorUDID()
      if (udid) {
        statusOk(`Simulator  detected (${udid.slice(0, 8)}…)`)
      } else {
        status('No simulator booted — launching one...')
        const booted = bootBestSimulator()
        if (booted) {
          statusOk(`Simulator  launched (${booted.slice(0, 8)}…)`)
        } else {
          statusFail('No iOS simulator available. Open Xcode → open Simulator.')
          process.exit(1)
        }
      }
    } else {
      const serial = getConnectedAndroidDevice()
      if (serial) {
        statusOk(`Device     ${serial}`)
      } else {
        statusFail('No Android device found. Plug in a device or start an emulator.')
        process.exit(1)
      }
    }

    // ── step 3: ensure Appium ─────────────────────────────────────────────────
    appium = await ensureAppium(file.config.platform, (msg) => status(msg))
    statusOk('Appium     ready')

    // ensure ffmpeg is installed — required for MJPEG live stream
    await ensureFfmpeg()

    // explain WebDriverAgent so users don't panic
    process.stdout.write(
      '  ℹ WebDriverAgentRunner will appear in simulator — this is normal' +
      '    It is Appium\'s helper that controls your app'
    )
  }

  const browser = await launchBrowser(file, resolvedAppPath)

  // navigate to target URL for web before any steps run
  if (file.config.platform === 'web' && file.config.url) {
    await browser.url(file.config.url)
  }

  let screencast: ScreencastHandle | null = null
  if (file.config.platform === 'web') {
    screencast = startWebScreencast(browser, 800)
  }
  // mobile: no screenshot polling — user sees simulator directly

  try {
    for (const session of file.sessions) {
      const result = await runSession(
        session.name,
        session.steps,
        file.config.retries,
        file.config.platform,
        browser
      )
      report.sessions.push(result)
    }
  } finally {
    screencast?.stop()
    await browser.deleteSession()
    appium?.stop()
  }

  const savedTo = saveRun(report)
  const analysis = await analyseRun(report)
  return { report, savedTo, analysis }
}

// ── Browser / app launch ──────────────────────────────────────────────────────

async function launchBrowser(
  file: FlickFile,
  resolvedApp?: string
): Promise<WebdriverIO.Browser> {
  const { config } = file

  if (config.platform === 'web') {
    const opts: RemoteOptions = {
      automationProtocol: 'webdriver',
      logLevel: 'silent',
      capabilities: {
        browserName: 'chrome',
        'goog:chromeOptions': {
          args: [
            '--headless=new',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1280,900',
          ],
        },
      } as WebdriverIO.Capabilities,
    }
    return remote(opts)
  }

  if (config.platform === 'android') {
    const androidDevice = getConnectedAndroidDevice()
    const opts: RemoteOptions = {
      port: 4723,
      logLevel: 'silent',
      capabilities: {
        platformName: 'Android',
        'appium:app': resolvedApp ?? config.app!,
        'appium:automationName': 'UiAutomator2',
        'appium:newCommandTimeout': 60,
        'appium:mjpegServerPort': MJPEG_PORT,
        'appium:mjpegServerFramerate': 15,
        'appium:mjpegServerScreenshotQuality': 80,
        'appium:mjpegServerScalingFactor': 75,
        ...(androidDevice ? { 'appium:udid': androidDevice } : {}),
      } as WebdriverIO.Capabilities,
    }
    return remote(opts)
  }

  // ios
  const iosUdid = getBootedSimulatorUDID() ?? bootBestSimulator()
  const opts: RemoteOptions = {
    port: 4723,
    logLevel: 'silent',
    capabilities: {
      platformName: 'iOS',
      'appium:app': resolvedApp ?? config.app!,
      'appium:automationName': 'XCUITest',
      'appium:newCommandTimeout': 60,
      'appium:mjpegServerPort': MJPEG_PORT,
      'appium:mjpegServerFramerate': 15,
      'appium:mjpegServerScreenshotQuality': 80,
      ...(iosUdid ? { 'appium:udid': iosUdid, 'appium:deviceName': 'iPhone Simulator' } : {}),
    } as WebdriverIO.Capabilities,
  }
  return remote(opts)
}

// ── Session runner ────────────────────────────────────────────────────────────

async function runSession(
  name: string,
  steps: FlickStep[],
  maxRetries: number,
  platform: FlickFile['config']['platform'],
  browser: WebdriverIO.Browser
): Promise<SessionResult> {
  const startedAt = new Date().toISOString()
  const stepResults: StepResult[] = []
  const capture: CaptureHandle = startCapture(browser, platform)

  try {
    for (let i = 0; i < steps.length; i++) {
      const result = await runStepWithCrashHandling(steps[i], i, maxRetries, platform, browser)

      const silentErrors = capture.flush()
      if (silentErrors.length > 0 && result.status === 'passed') {
        result.error = { ...silentErrors[0] }
      }

      stepResults.push(result)
    }
  } finally {
    capture.stop()
  }

  const finishedAt = new Date().toISOString()

  return {
    name,
    status: deriveSessionStatus(stepResults),
    steps: stepResults,
    startedAt,
    finishedAt,
    durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
  }
}

// ── Step runner with crash handling ──────────────────────────────────────────

async function runStepWithCrashHandling(
  step: FlickStep,
  index: number,
  maxRetries: number,
  platform: FlickFile['config']['platform'],
  browser: WebdriverIO.Browser
): Promise<StepResult> {
  let attempts = 0

  while (attempts <= maxRetries) {
    const result = await executeStep(step, index, browser, platform)

    if (result.status === 'passed') return result

    const crashed = await detectCrash(browser)
    if (!crashed) return result

    attempts++
    const screenshot = await safeCrashScreenshot(browser)

    const crashReport: CrashReport = {
      lastEvent: `${step.action} on "${step.selector ?? step.value ?? 'unknown'}"`,
      screenshot,
      retryAttempts: attempts,
      skipped: attempts > maxRetries,
      timestamp: new Date().toISOString(),
    }

    if (attempts > maxRetries) {
      return { ...result, status: 'crashed', crash: crashReport }
    }

    await waitForAppReady(browser)
  }

  return executeStep(step, index, browser, platform)
}

// ── Crash detection ───────────────────────────────────────────────────────────

async function detectCrash(browser: WebdriverIO.Browser): Promise<boolean> {
  try {
    await browser.getPageSource()
    return false
  } catch {
    return true
  }
}

async function waitForAppReady(browser: WebdriverIO.Browser): Promise<void> {
  const maxWait = 5_000
  const interval = 500
  const start = Date.now()

  while (Date.now() - start < maxWait) {
    try {
      await browser.getPageSource()
      return
    } catch {
      await sleep(interval)
    }
  }
}

async function safeCrashScreenshot(browser: WebdriverIO.Browser): Promise<string | null> {
  try {
    return await browser.takeScreenshot()
  } catch {
    return null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveSessionStatus(steps: StepResult[]): SessionResult['status'] {
  if (steps.some(s => s.status === 'crashed')) return 'crashed'
  if (steps.some(s => s.status === 'failed')) return 'failed'
  return 'passed'
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}