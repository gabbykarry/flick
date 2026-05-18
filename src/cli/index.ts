#!/usr/bin/env node
import chalk from 'chalk'
import { exec } from 'child_process'
import { Command } from 'commander'
import fs from 'fs'
import ora from 'ora'
import path from 'path'
import { detectLmStudio, detectOllama } from '../ai/index.js'
import { startDashboard } from '../dashboard/index.js'
import { loadConfig } from '../runner/config.js'
import { runFlick } from '../runner/index.js'
import type { FlickFile, SessionResult, StepResult } from '../session/index.js'
import { loadRuns } from '../session/index.js'

const program = new Command()

program
  .name('flick')
  .description('Automated mobile & web app testing with live preview and AI analysis')
  .version('0.0.1')

// ── flick init ────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Create a starter flick.yml in the current directory')
  .option('--platform <platform>', 'android | ios | web', 'android')
  .action((opts) => {
    const dest = path.resolve(process.cwd(), 'flick.yml')
    if (fs.existsSync(dest)) {
      console.log(chalk.yellow('\n  flick.yml already exists — not overwriting\n'))
      process.exit(0)
    }
    const platform = opts.platform as string
    const mobileTemplate = (p: string, ext: string) => [
      `config:`,
      `  platform: ${p}`,
      `  app: ./build/MyApp.${ext}`,
      `  retries: 2`,
      ``,
      `auth:`,
      `  email: test@example.com`,
      `  password: \${TEST_PASSWORD}`,
      ``,
      `sessions:`,
      `  - name: "Login flow"`,
      `    steps:`,
      `      - action: wait`,
      `        duration: 1000`,
      `      - action: tap`,
      `        selector: "~login-btn"`,
      `      - action: fill`,
      `        selector: "~email-input"`,
      `        value: \${auth.email}`,
      `      - action: fill`,
      `        selector: "~password-input"`,
      `        value: \${auth.password}`,
      `      - action: tap`,
      `        selector: "~submit-btn"`,
      `      - action: wait`,
      `        duration: 1500`,
      `      - action: assert`,
      `        selector: "~home-screen"`,
      `        visible: true`,
    ].join('\n')

    const webTemplate = [
      `config:`,
      `  platform: web`,
      `  url: http://localhost:3000`,
      `  retries: 2`,
      ``,
      `auth:`,
      `  email: test@example.com`,
      `  password: \${TEST_PASSWORD}`,
      ``,
      `sessions:`,
      `  - name: "Login flow"`,
      `    steps:`,
      `      - action: wait`,
      `        duration: 1000`,
      `      - action: fill`,
      `        selector: "#email-input"`,
      `        value: \${auth.email}`,
      `      - action: fill`,
      `        selector: "#password-input"`,
      `        value: \${auth.password}`,
      `      - action: tap`,
      `        selector: "#login-btn"`,
      `      - action: wait`,
      `        duration: 1500`,
      `      - action: assert`,
      `        selector: "#dashboard"`,
      `        visible: true`,
    ].join('\n')

    const template =
      platform === 'ios' ? mobileTemplate('ios', 'app') :
      platform === 'web' ? webTemplate :
                           mobileTemplate('android', 'apk')

    fs.writeFileSync(dest, template + '\n', 'utf-8')
    console.log(chalk.green(`\n  ✓ Created flick.yml (${platform})`))
    if (platform === 'android' || platform === 'ios') {
      console.log(chalk.dim('\n  Selector guide:'))
      console.log(chalk.dim('    ~myId   → testID="myId" on your RN component'))
    } else {
      console.log(chalk.dim('\n  Selector guide:'))
      console.log(chalk.dim('    #id     → <div id="id">'))
      console.log(chalk.dim('    .class  → <div class="class">'))
    }
    console.log(chalk.dim('\n  Run: flick run\n'))
  })

// ── flick run ─────────────────────────────────────────────────────────────────

program
  .command('run')
  .description('Run tests from flick.yml')
  .option('-c, --config <path>', 'path to config file', 'flick.yml')
  .option('-p, --port <number>', 'dashboard port', '4040')
  .option('--no-open', 'skip auto-opening the browser')
  .action(async (opts) => {
    printHeader()

    // load config
    const configSpinner = ora({ text: 'Loading config...', indent: 2 }).start()
    let flickFile: FlickFile
    try {
      flickFile = loadConfig(opts.config)
      configSpinner.succeed(
        chalk.green('Config') +
        chalk.dim(`  ${flickFile.sessions.length} session${flickFile.sessions.length !== 1 ? 's' : ''}, platform: ${flickFile.config.platform}`)
      )
    } catch (err) {
      configSpinner.fail(chalk.red('Config error'))
      console.log(chalk.dim(`\n  ${errorMessage(err)}\n`))
      process.exit(1)
      return
    }

    // AI check
    const aiSpinner = ora({ text: 'Checking AI provider...', indent: 2 }).start()
    const ollamaModel = await detectOllama()
    const lmModel = ollamaModel ? null : await detectLmStudio()
    if (ollamaModel) {
      aiSpinner.succeed(chalk.green('AI') + chalk.dim(`  ollama · ${ollamaModel}`))
    } else if (lmModel) {
      aiSpinner.succeed(chalk.green('AI') + chalk.dim(`  lmstudio · ${lmModel}`))
    } else {
      aiSpinner.warn(chalk.yellow('AI') + chalk.dim('  not available · run "ollama serve" to enable'))
    }

    // dashboard
    const port = parseInt(opts.port, 10)
    const dashUrl = `http://localhost:${port}`
    const dashSpinner = ora({ text: 'Starting dashboard...', indent: 2 }).start()
    try {
      await startDashboard(port)
      dashSpinner.succeed(chalk.green('Dashboard') + chalk.dim(`  ${dashUrl}`))
      if (opts.open !== false) {
        const isMobile = flickFile.config.platform === 'ios' || flickFile.config.platform === 'android'
        if (isMobile) {
          // mobile — bring simulator to front, dashboard stays accessible but doesn't steal focus
          exec('open -a Simulator', () => {})
        } else {
          // web — open dashboard with live preview
          openBrowser(dashUrl)
        }
      }
    } catch {
      dashSpinner.warn(chalk.yellow('Dashboard') + chalk.dim('  failed to start — continuing without it'))
    }

    printDivider()

    const target = flickFile.config.platform === 'web'
      ? flickFile.config.url ?? 'web'
      : path.basename(flickFile.config.app ?? 'app')

    console.log(
      chalk.dim('  platform  ') + chalk.white(flickFile.config.platform) +
      chalk.dim('   target  ') + chalk.white(target)
    )
    console.log('')

    let report: Awaited<ReturnType<typeof runFlick>>['report']
    let savedTo: string
    let analysis: Awaited<ReturnType<typeof runFlick>>['analysis']

    try {
      ;({ report, savedTo, analysis } = await runFlick(flickFile))
    } catch (err) {
      console.log(chalk.red('\n  ✗ Run failed'))
      console.log(chalk.dim(`  ${errorMessage(err)}\n`))
      process.exit(1)
      return
    }

    for (const session of report.sessions) printSession(session)

    printDivider()

    const s = report.summary
    console.log(
      '  ' +
      chalk.green(`${s.passed} passed`) + '  ' +
      (s.failed  > 0 ? chalk.red(`${s.failed} failed`)   : chalk.dim(`${s.failed} failed`)) + '  ' +
      (s.crashed > 0 ? chalk.red(`${s.crashed} crashed`) : chalk.dim(`${s.crashed} crashed`)) + '  ' +
      chalk.dim(`${s.skipped} skipped`) + '  ' +
      chalk.dim(`${s.total} total`)
    )

    console.log('')
    console.log(chalk.dim(`  saved  ${savedTo}`))

    if (analysis.provider !== 'none') {
      printDivider()
      console.log(chalk.bold('  AI analysis') + chalk.dim(`  (${analysis.provider} · ${analysis.model})`))
      console.log('')
      console.log('  ' + analysis.summary)
      if (analysis.suggestions.length > 0) {
        console.log('')
        console.log(chalk.dim('  Suggestions'))
        for (const sg of analysis.suggestions) console.log(chalk.dim('  · ') + sg)
      }
      if (analysis.patterns.length > 0) {
        console.log('')
        console.log(chalk.dim('  Patterns'))
        for (const pt of analysis.patterns) console.log(chalk.dim('  · ') + pt)
      }
    }

    console.log('')
    console.log(chalk.dim(`  View full report → ${dashUrl}`))
    console.log(chalk.dim('  Dashboard staying alive — press Ctrl+C to exit\n'))

    const exitCode = s.failed > 0 || s.crashed > 0 ? 1 : 0
    process.on('SIGINT', () => {
      console.log(chalk.dim('\n  Shutting down...\n'))
      process.exit(exitCode)
    })
  })

// ── flick serve ───────────────────────────────────────────────────────────────

program
  .command('serve')
  .description('Open the dashboard to browse past runs')
  .option('-p, --port <number>', 'dashboard port', '4040')
  .option('--no-open', 'skip auto-opening the browser')
  .action(async (opts) => {
    printHeader()
    const port = parseInt(opts.port, 10)
    const dashUrl = `http://localhost:${port}`
    const spinner = ora({ text: 'Starting dashboard...', indent: 2 }).start()
    try {
      await startDashboard(port)
      spinner.succeed(chalk.green('Dashboard') + chalk.dim(`  ${dashUrl}`))
      const runs = loadRuns()
      if (runs.length === 0) {
        console.log(chalk.dim('\n  No past runs found. Run "flick run" first.\n'))
      } else {
        console.log(chalk.dim(`\n  ${runs.length} past run${runs.length !== 1 ? 's' : ''} available\n`))
      }
      if (opts.open !== false) openBrowser(dashUrl)
      console.log(chalk.dim('  Press Ctrl+C to stop\n'))
    } catch (err) {
      spinner.fail(chalk.red('Failed to start dashboard'))
      console.log(chalk.dim(`  ${errorMessage(err)}\n`))
      process.exit(1)
    }
  })

// ── flick ai ──────────────────────────────────────────────────────────────────

program
  .command('ai')
  .description('Check AI provider status and list available models')
  .action(async () => {
    printHeader()
    console.log(chalk.bold('  AI providers\n'))

    const ollamaSpinner = ora({ text: 'Checking Ollama...', indent: 2 }).start()
    try {
      const res = await fetch('http://localhost:11434/api/tags')
      if (res.ok) {
        const data = await res.json() as { models: Array<{ name: string }> }
        const models = data.models.map(m => m.name)
        if (models.length === 0) {
          ollamaSpinner.warn(chalk.yellow('Ollama') + chalk.dim('  running but no models installed'))
          console.log(chalk.dim('\n    Install one: ollama pull llama3.2\n'))
        } else {
          ollamaSpinner.succeed(chalk.green('Ollama') + chalk.dim('  running'))
          console.log('')
          for (const m of models) console.log(chalk.dim('    · ') + m)
          console.log('')
        }
      } else {
        ollamaSpinner.fail(chalk.dim('Ollama  not running'))
        printOllamaHelp()
      }
    } catch {
      ollamaSpinner.fail(chalk.dim('Ollama  not running'))
      printOllamaHelp()
    }

    const lmSpinner = ora({ text: 'Checking LM Studio...', indent: 2 }).start()
    try {
      const res = await fetch('http://localhost:1234/v1/models')
      if (res.ok) {
        const data = await res.json() as { data: Array<{ id: string }> }
        const models = data.data.map(m => m.id)
        lmSpinner.succeed(chalk.green('LM Studio') + chalk.dim('  running'))
        console.log('')
        for (const m of models) console.log(chalk.dim('    · ') + m)
        console.log('')
      } else {
        lmSpinner.fail(chalk.dim('LM Studio  not running'))
        printLmStudioHelp()
      }
    } catch {
      lmSpinner.fail(chalk.dim('LM Studio  not running'))
      printLmStudioHelp()
    }
  })

// ── Helpers ───────────────────────────────────────────────────────────────────

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? `open "${url}"` :
    process.platform === 'win32'  ? `start "${url}"` :
                                    `xdg-open "${url}"`
  exec(cmd, () => {})
}

function printHeader(): void {
  console.log('')
  console.log(chalk.bold('  flick'))
  console.log(chalk.dim('  ──────────────────────────────'))
  console.log('')
}

function printDivider(): void {
  console.log('')
  console.log(chalk.dim('  ──────────────────────────────'))
  console.log('')
}

function printSession(session: SessionResult): void {
  const icon = session.status === 'passed' ? chalk.green('✓') : chalk.red('✗')
  console.log(`  ${icon} ${chalk.bold(session.name)}  ${chalk.dim(session.status)}`)
  for (const step of session.steps) printStep(step)
  console.log('')
}

function printStep(step: StepResult): void {
  const icon = step.status === 'passed'
    ? chalk.green('·')
    : step.status === 'crashed' ? chalk.red('⚡') : chalk.red('·')
  const label = step.selector
    ? `${step.action}  ${chalk.dim(step.selector)}`
    : step.value
      ? `${step.action}  ${chalk.dim(`"${step.value.slice(0, 30)}"`)}`
      : step.action
  console.log(`    ${icon}  ${label}  ${chalk.dim(`${step.durationMs}ms`)}`)
  if (step.error) {
    console.log(chalk.dim(`       ${step.error.type}: ${step.error.message.slice(0, 80)}`))
  }
  if (step.crash) {
    console.log(chalk.dim(`       crashed after: ${step.crash.lastEvent}`))
    console.log(chalk.dim(`       retries: ${step.crash.retryAttempts}  skipped: ${step.crash.skipped}`))
  }
}

function printOllamaHelp(): void {
  console.log(chalk.dim('\n    To start:          ollama serve'))
  console.log(chalk.dim('    To install model:  ollama pull llama3.2\n'))
}

function printLmStudioHelp(): void {
  console.log(chalk.dim('\n    Open LM Studio, load a model, and click "Start Server"\n'))
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

program.parse(process.argv)