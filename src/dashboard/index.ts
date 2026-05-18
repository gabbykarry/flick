import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import path from 'path'
import { fileURLToPath } from 'url'
import { WebSocketServer } from 'ws'
import { loadRuns } from '../session/index.js'

// ── WebSocket client store ────────────────────────────────────────────────────
// Exported so screencaster can push frames without importing fastify
import type { WebSocket } from 'ws'
export const wsClients = new Set<WebSocket>()

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// MJPEG port — defined here to avoid circular dep with runner/index.ts
export const MJPEG_PORT = 9100

export async function startDashboard(port = 4040): Promise<void> {
  const fastify = Fastify({ logger: false })

  // ── static files ─────────────────────────────────────────────────────────────
  await fastify.register(fastifyStatic, {
    root: path.resolve(__dirname, '../../static'),
    prefix: '/',
  })

  // ── REST API ──────────────────────────────────────────────────────────────────
  fastify.get('/api/runs', async (_req, reply) => reply.send(loadRuns()))

  fastify.get<{ Params: { id: string } }>('/api/runs/:id', async (req, reply) => {
    const run = loadRuns().find(r => r.id === req.params.id)
    if (!run) return reply.code(404).send({ error: 'Not found' })
    return reply.send(run)
  })

  // ── MJPEG proxy — mobile live preview ─────────────────────────────────────────
  fastify.get('/stream', (request, reply) => {
    import('http').then(({ default: http }) => {
      reply.raw.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=--BoundaryString',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      })
      const req = http.get(`http://127.0.0.1:${MJPEG_PORT}`, res => res.pipe(reply.raw))
      req.on('error', () => reply.raw.end())
      request.raw.on('close', () => req.destroy())
    })
  })

  // ── Start Fastify ─────────────────────────────────────────────────────────────
  await fastify.listen({ port, host: '127.0.0.1' })

  // ── WebSocket server — web platform live preview ──────────────────────────────
  // Attach a raw ws server to the same http server Fastify is using.
  // This sidesteps @fastify/websocket entirely — no plugin, no ESM issues.
  const wss = new WebSocketServer({ server: fastify.server, path: '/ws' })

  wss.on('connection', (socket) => {
    wsClients.add(socket)
    socket.on('close', () => wsClients.delete(socket))
    socket.on('error', () => wsClients.delete(socket))
  })

  console.log(`\n  Flick dashboard → http://localhost:${port}\n`)
}