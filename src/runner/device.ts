import { execSync, spawn } from 'child_process'
import { existsSync, statSync } from 'fs'

// ── iOS — get booted simulator UDID ──────────────────────────────────────────

export function getBootedSimulatorUDID(): string | null {
  try {
    const output = execSync('xcrun simctl list devices --json', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const json = JSON.parse(output) as {
      devices: Record<string, Array<{ udid: string; state: string; name: string }>>
    }
    for (const devices of Object.values(json.devices)) {
      const booted = devices.find(d => d.state === 'Booted')
      if (booted) return booted.udid
    }
    return null
  } catch {
    return null
  }
}

export function bootBestSimulator(): string | null {
  try {
    const output = execSync('xcrun simctl list devices available --json', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const json = JSON.parse(output) as {
      devices: Record<string, Array<{ udid: string; name: string; isAvailable: boolean }>>
    }
    const all = Object.values(json.devices).flat().filter(d => d.isAvailable)
    const preferred = [
      all.find(d => d.name.includes('iPhone') && d.name.includes('Pro')),
      all.find(d => d.name.includes('iPhone')),
      all[0],
    ].find(Boolean)

    if (!preferred) return null
    execSync(`xcrun simctl boot ${preferred.udid}`, { stdio: 'ignore' })
    return preferred.udid
  } catch {
    return null
  }
}

// ── Android — get connected device/emulator serial ────────────────────────────

export function getConnectedAndroidDevice(): string | null {
  try {
    const output = execSync('adb devices', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const lines = output.split('\n').slice(1)
    const device = lines
      .map((l: string) => l.trim())
      .find((l: string) => l.endsWith('device'))
    if (!device) return null
    return device.split(/\s+/)[0]
  } catch {
    return null
  }
}

export function bootAndroidEmulator(): string | null {
  try {
    const avds = execSync('emulator -list-avds', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().split('\n').filter(Boolean)

    if (avds.length === 0) return null

    spawn('emulator', ['-avd', avds[0], '-no-audio', '-no-window'], {
      detached: true,
      stdio: 'ignore',
    }).unref()

    const start = Date.now()
    while (Date.now() - start < 30_000) {
      const serial = getConnectedAndroidDevice()
      if (serial) return serial
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000)
    }
    return null
  } catch {
    return null
  }
}

// ── Auto-find built app ───────────────────────────────────────────────────────

export function findBuiltApp(schemeOrPath: string, platform: 'ios' | 'android'): string {
  // real path — use directly
  if (schemeOrPath.startsWith('/') || schemeOrPath.startsWith('./')) {
    if (existsSync(schemeOrPath)) return schemeOrPath
    throw new Error(
      `App not found at: ${schemeOrPath}\n` +
      `Build first: npx react-native run-ios`
    )
  }

  if (platform === 'ios') {
    const result = execSync(
      `find ~/Library/Developer/Xcode/DerivedData -name "${schemeOrPath}.app" -type d 2>/dev/null | head -5`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim()

    if (!result) {
      throw new Error(
        `No built app found for "${schemeOrPath}".\n` +
        `Build it first: npx react-native run-ios`
      )
    }

    const paths = result.split('\n').filter(Boolean)
    if (paths.length === 1) return paths[0]

    // pick most recently modified
    return paths
      .map((p: string) => ({ p, t: statSync(p).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0].p
  }

  // android
  const result = execSync(
    `find . -name "*.apk" -not -path "*/node_modules/*" 2>/dev/null | head -5`,
    { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], cwd: process.cwd() }
  ).trim()

  if (!result) {
    throw new Error(
      `No .apk found.\n` +
      `Build first: cd android && ./gradlew assembleDebug`
    )
  }

  const paths = result.split('\n').filter(Boolean)
  return paths
    .map((p: string) => ({ p, t: statSync(p).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0].p
}