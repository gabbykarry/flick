import type { ChildProcess } from 'child_process'
import { execSync, spawn } from 'child_process'
import net from 'net'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AppiumHandle {
  stop: () => void
}

const APPIUM_PORT = 4723

// ── Entry point ───────────────────────────────────────────────────────────────

// Ensures Appium + the right driver are installed, then starts the server.
// Returns a handle to stop it when the run is done.
export async function ensureAppium(
  platform: 'android' | 'ios',
  onStatus: (msg: string) => void
): Promise<AppiumHandle> {
  // 1. install Appium globally if not present
  ensureAppiumInstalled(onStatus)

  // 2. install the platform driver if not present
  ensureDriver(platform, onStatus)

  // 3. if Appium is already running on 4723 (user started it manually), use it
  const alreadyRunning = await isPortOpen(APPIUM_PORT)
  if (alreadyRunning) {
    onStatus('Appium already running — using existing server')
    return { stop: () => {} }
  }

  // 4. start Appium server programmatically
  onStatus('Starting Appium server...')
  const proc = await startAppiumServer()
  onStatus('Appium ready')

  return {
    stop: () => {
      try { proc.kill() } catch {}
    },
  }
}

// ── Install Appium ────────────────────────────────────────────────────────────

function ensureAppiumInstalled(onStatus: (msg: string) => void): void {
  try {
    execSync('appium --version', { stdio: 'ignore' })
    // already installed — nothing to do
  } catch {
    onStatus('Installing Appium (first run only)...')
    // install globally so the `appium` binary is available on PATH
    execSync('npm install -g appium', { stdio: 'inherit' })
    onStatus('Appium installed')
  }
}

// ── Install driver ────────────────────────────────────────────────────────────

// Appium 2 uses a plugin/driver model — each platform driver is installed
// separately. We only install the one we need for this run.
function ensureDriver(
  platform: 'android' | 'ios',
  onStatus: (msg: string) => void
): void {
  const driver = platform === 'android' ? 'uiautomator2' : 'xcuitest'

  try {
    // `appium driver list --installed` outputs installed drivers
    // if our driver name appears in the output it's already installed
    const output = execSync('appium driver list --installed', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    if (output.toLowerCase().includes(driver)) {
      // already installed
      return
    }
  } catch {
    // appium driver list failed — proceed to install anyway
  }

  onStatus(`Installing Appium ${driver} driver (first run only)...`)
  try {
    execSync(`appium driver install ${driver}`, {
      stdio: ['ignore', 'ignore', 'pipe'],
      encoding: 'utf-8',
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // "already installed" is not a real error — just skip it
    if (msg.includes('already installed')) return
    throw new Error(`Failed to install Appium ${driver} driver: ${msg}`)
  }
  onStatus(`${driver} driver ready`)
}

// ── Start server ──────────────────────────────────────────────────────────────

// Spawns the Appium server as a child process.
// We suppress its output — it's noisy and irrelevant to the user.
// Waits until the port is open before returning.
async function startAppiumServer(): Promise<ChildProcess> {
  const proc = spawn('appium', ['--port', String(APPIUM_PORT)], {
    stdio: 'ignore',   // suppress Appium's verbose logs
    detached: false,   // tied to the flick process — dies when flick exits
  })

  proc.on('error', (err) => {
    throw new Error(`Failed to start Appium: ${err.message}`)
  })

  // wait up to 15 seconds for Appium to be ready
  await waitForPort(APPIUM_PORT, 15_000)

  return proc
}

// ── Port helpers ──────────────────────────────────────────────────────────────

// Checks if something is already listening on a port
function isPortOpen(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = new net.Socket()
    socket.setTimeout(500)
    socket
      .once('connect', () => { socket.destroy(); resolve(true) })
      .once('error', () => { socket.destroy(); resolve(false) })
      .once('timeout', () => { socket.destroy(); resolve(false) })
      .connect(port, '127.0.0.1')
  })
}

// Polls until the port is open or timeout is reached
async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now()
  const interval = 500

  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) return
    await sleep(interval)
  }

  throw new Error(
    `Appium did not start within ${timeoutMs / 1000}s. ` +
    `Check that you have the required platform tools installed:\n` +
    `  Android → Android Studio + SDK + a running emulator or connected device\n` +
    `  iOS     → Xcode + Simulator`
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── ffmpeg ────────────────────────────────────────────────────────────────────

// Ensures ffmpeg is installed — required for Appium MJPEG live streaming.
// Auto-detects the package manager and installs silently if missing.
export async function ensureFfmpeg(): Promise<void> {
  // check if already installed
  try {
    execSync('which ffmpeg', { stdio: 'ignore' })
    return // already installed — nothing to do
  } catch {
    // not found — install it
  }

  const pm = detectPackageManager()

  if (!pm) {
    process.stdout.write(
      '\r  ⚠ ffmpeg not found and no package manager detected\n' +
      '    Install manually: https://ffmpeg.org/download.html\n' +
      '    Live preview will be unavailable until ffmpeg is installed\n'
    )
    return
  }

  process.stdout.write(`\r  Installing ffmpeg via ${pm}...`.padEnd(60))

  try {
    const installCmd: Record<string, string> = {
      brew:    'brew install ffmpeg',
      apt:     'sudo apt-get install -y ffmpeg',
      apt_get: 'sudo apt-get install -y ffmpeg',
      dnf:     'sudo dnf install -y ffmpeg',
      pacman:  'sudo pacman -S --noconfirm ffmpeg',
      choco:   'choco install ffmpeg -y',
      winget:  'winget install ffmpeg',
    }

    execSync(installCmd[pm], { stdio: 'ignore' })
    process.stdout.write('\r  ✓ ffmpeg installed'.padEnd(60) + '\n')
  } catch {
    process.stdout.write(
      '\r  ⚠ ffmpeg install failed\n' +
      `    Try manually: ${pm === 'brew' ? 'brew install ffmpeg' : 'sudo apt install ffmpeg'}\n`
    )
  }
}

function detectPackageManager(): string | null {
  const managers = [
    { name: 'brew',    check: 'which brew' },    // macOS
    { name: 'apt',     check: 'which apt' },      // Ubuntu/Debian
    { name: 'apt_get', check: 'which apt-get' },  // older Debian
    { name: 'dnf',     check: 'which dnf' },      // Fedora/RHEL
    { name: 'pacman',  check: 'which pacman' },   // Arch
    { name: 'choco',   check: 'where choco' },    // Windows Chocolatey
    { name: 'winget',  check: 'where winget' },   // Windows
  ]

  for (const { name, check } of managers) {
    try {
      execSync(check, { stdio: 'ignore' })
      return name
    } catch {
      continue
    }
  }

  return null
}