import http from 'http'
import type { WebSocket } from 'ws'
import { wsClients } from '../dashboard/index.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScreencastHandle {
  stop: () => void
}

// ── Called by dashboard when a client connects ─────────────────────────────────
export function addWsClient(socket: WebSocket): void {
  wsClients.add(socket)
  socket.on('close', () => wsClients.delete(socket))
}

// ── Mobile — MJPEG proxy handler ──────────────────────────────────────────────
export function mjpegProxyHandler(mjpegPort: number) {
  return function (request: any, reply: any) {
    reply.raw.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=--BoundaryString',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })
    const appiumReq = http.get(`http://127.0.0.1:${mjpegPort}`, (appiumRes) => {
      appiumRes.pipe(reply.raw)
    })
    appiumReq.on('error', () => reply.raw.end())
    request.raw.on('close', () => appiumReq.destroy())
  }
}

// ── Web — screenshot polling loop ─────────────────────────────────────────────
export function startWebScreencast(
  browser: WebdriverIO.Browser,
  intervalMs = 800
): ScreencastHandle {
  let running = true

  ;(async () => {
    while (running) {
      try {
        const base64 = await browser.takeScreenshot()
        broadcastFrame(base64)
      } catch {
        // skip frame silently if screenshot fails mid-navigation
      }
      await sleep(intervalMs)
    }
  })()

  return { stop: () => { running = false } }
}

// ── Broadcast a base64 frame to all connected WS clients ──────────────────────
function broadcastFrame(base64: string): void {
  const message = JSON.stringify({ type: 'frame', data: base64 })
  for (const client of wsClients) {
    if (client.readyState === 1) {
      try { client.send(message) } catch { wsClients.delete(client) }
    } else {
      wsClients.delete(client)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}