# Flick

> YAML-driven automated testing for iOS, Android, and Web — with live preview, crash detection, and local AI analysis.

```bash
npm install -g @flick-run/cli
flick init --platform ios
flick run
```

---

## What is Flick?

Flick is an open-source testing tool that lets you write test flows in plain YAML and run them against iOS simulators, Android emulators, and web apps. It handles everything automatically — finding your app build, detecting your device, installing Appium, and running your test sessions.

---

## Features

- **YAML-driven** — write tests in plain YAML, no TypeScript or boilerplate
- **Live dashboard** at `localhost:4040` with session timeline, error screenshots, and logs
- **Crash detection** — captures last screen, retries up to N times, marks step as crashed
- **Silent error detection** — catches unhandled promises, TypeErrors, frozen screens
- **Local AI analysis** — Ollama or LM Studio explains failures in plain English after every run
- **Zero device setup** — auto-detects booted simulator/emulator, no UDID or paths needed
- **Web support** — headless Chrome with live screenshot stream in dashboard

---

## Install

```bash
npm install -g @flick-run/cli
```

Requires Node.js 20+.

---

## Quick start

```bash
# 1. create a config
flick init --platform ios    # or android / web

# 2. edit flick.yml with your selectors

# 3. run
flick run
```

---

## flick.yml reference

```yaml
config:
  platform: ios # ios | android | web
  app: FlickStore # iOS: scheme name. Android: .apk path. Web: URL
  retries: 2 # crash retry attempts per step

auth:
  email: test@example.com
  password: ${TEST_PASSWORD} # loaded from .env automatically

sessions:
  - name: "Login flow"
    steps:
      - action: tap
        selector: "~login-btn" # ~ = testID in React Native
      - action: fill
        selector: "~email-input"
        value: ${auth.email}
      - action: fill
        selector: "~password-input"
        value: ${auth.password}
      - action: tap
        selector: "~login-btn"
      - action: wait
        duration: 1500
      - action: assert
        selector: "~dashboard-screen"
        visible: true
```

### Actions

| Action   | Required              | Description                         |
| -------- | --------------------- | ----------------------------------- |
| `tap`    | `selector`            | Tap an element                      |
| `fill`   | `selector`, `value`   | Clear and type into an input        |
| `assert` | `selector`, `visible` | Assert element is visible or hidden |
| `scroll` | —                     | Scroll down one screen              |
| `wait`   | `duration`            | Wait N milliseconds                 |

### Selectors

**Mobile (iOS/Android):** Use `~testID` syntax matching the `testID` prop in React Native:

```tsx
<TouchableOpacity testID="login-btn">
```

```yaml
selector: "~login-btn"
```

**Web:** Use CSS selectors:

```yaml
selector: "#login-btn"    # by id
selector: ".submit"       # by class
selector: "button"        # by tag
```

---

## CLI

```bash
flick run                    # run tests, open dashboard
flick run -c path/to.yml     # custom config path
flick run -p 3000            # custom dashboard port
flick serve                  # browse past runs
flick init --platform ios    # generate starter config
flick ai                     # check AI provider status
```

---

## AI analysis

Flick uses local LLMs — no API key, no cloud, no cost.

**Setup Ollama (recommended):**

```bash
brew install ollama
ollama serve
ollama pull llama3.2
flick ai    # verify Flick sees it
```

**LM Studio:** Open the app, load a model, click Start Server.

---

## Platforms

### iOS

- Requires Xcode + iOS Simulator
- Build: `npx react-native run-ios`
- Set `app:` to your Xcode scheme name — Flick finds the `.app` in DerivedData

### Android

- Requires Android Studio + ADB
- Build: `cd android && ./gradlew assembleDebug`
- Set `app:` to the `.apk` path

### Web

- No setup required
- Set `url:` instead of `app:`
- Watch the live preview in the dashboard

---

## React Native setup

Add `testID` props to every interactive element:

```tsx
<TouchableOpacity testID="login-btn" onPress={handleLogin}>
<TextInput testID="email-input" />
<View testID="dashboard-screen">
```

---

## Dashboard

Open `http://localhost:4040` during or after any run:

- Session timeline with pass/fail/crash per step
- Click any failed step to see its error screenshot
- Live screenshot preview for web runs
- AI analysis summary with suggestions
- Run history — browse past sessions

Use `flick serve` to open the dashboard without running a new test.

---

## Project structure

```
flick/
├── src/
│   ├── cli/index.ts          # flick run / init / serve / ai
│   ├── runner/
│   │   ├── index.ts          # main run loop
│   │   ├── config.ts         # YAML parser + .env loader
│   │   ├── executor.ts       # step execution (tap/fill/assert/etc)
│   │   ├── screencaster.ts   # live preview WebSocket
│   │   ├── appium.ts         # Appium install + start
│   │   └── device.ts         # simulator/emulator auto-detection
│   ├── capture/index.ts      # silent error + freeze detection
│   ├── session/index.ts      # types + JSON persistence
│   ├── dashboard/index.ts    # Fastify server + WS
│   └── ai/index.ts           # Ollama + LM Studio integration
├── static/index.html         # dashboard UI
├── examples/
│   ├── react-native/         # FlickStore example app
│   └── web/                  # e-commerce demo site
├── flick.yml                 # your test config
└── .flick/sessions/          # run reports (auto-created)
```

---

## License

MIT — built by Gabriel.
