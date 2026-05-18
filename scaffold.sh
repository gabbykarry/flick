#!/usr/bin/env bash
set -e

echo "→ Scaffolding Flick..."

# ── Directories ───────────────────────────────────────────────────────────────
mkdir -p src/cli
mkdir -p src/runner
mkdir -p src/capture
mkdir -p src/session
mkdir -p src/dashboard
mkdir -p src/ai
mkdir -p static
mkdir -p examples/react-native
mkdir -p examples/web
mkdir -p docs

# ── package.json ──────────────────────────────────────────────────────────────
cat > package.json << 'JSON'
{
  "name": "flick",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "bin": {
    "flick": "./dist/cli/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/cli/index.js"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "ora": "^8.0.1",
    "chalk": "^5.3.0",
    "js-yaml": "^4.1.0",
    "webdriverio": "^8.36.0",
    "fastify": "^4.27.0",
    "@fastify/static": "^7.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0",
    "@types/js-yaml": "^4.0.9"
  }
}
JSON

# ── tsconfig.json ─────────────────────────────────────────────────────────────
cat > tsconfig.json << 'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
JSON

# ── .env.example ──────────────────────────────────────────────────────────────
cat > .env.example << 'ENV'
TEST_PASSWORD=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OLLAMA_HOST=http://localhost:11434
LMSTUDIO_HOST=http://localhost:1234
ENV

# ── .gitignore ────────────────────────────────────────────────────────────────
cat > .gitignore << 'GIT'
node_modules/
dist/
.env
.flick/
.DS_Store
GIT

# ── Entry point files (empty, ready to fill) ──────────────────────────────────
touch src/cli/index.ts
touch src/runner/index.ts
touch src/capture/index.ts
touch src/session/index.ts
touch src/dashboard/index.ts
touch src/ai/index.ts
touch static/index.html

# ── Example flick.yml ─────────────────────────────────────────────────────────
cat > examples/react-native/flick.yml << 'YAML'
config:
  platform: android
  app: ./build/app.apk
  retries: 2

auth:
  email: test@example.com
  password: ${TEST_PASSWORD}

sessions:
  - name: "Login flow"
    steps:
      - action: tap
        selector: "~login-button"
      - action: fill
        selector: "~email-input"
        value: ${auth.email}
      - action: fill
        selector: "~password-input"
        value: ${auth.password}
      - action: tap
        selector: "~submit"
      - action: assert
        selector: "~dashboard-header"
        visible: true
YAML

cat > examples/web/flick.yml << 'YAML'
config:
  platform: web
  url: https://app.example.com
  retries: 2

auth:
  email: test@example.com
  password: ${TEST_PASSWORD}

sessions:
  - name: "Login flow"
    steps:
      - action: tap
        selector: "#login-btn"
      - action: fill
        selector: "#email"
        value: ${auth.email}
      - action: fill
        selector: "#password"
        value: ${auth.password}
      - action: tap
        selector: "#submit"
      - action: assert
        selector: "#dashboard"
        visible: true
YAML

echo ""
echo "✓ Done. Structure:"
echo ""
find . -not -path './node_modules/*' -not -path './.git/*' -type f | sort
echo ""
echo "Next: make install"