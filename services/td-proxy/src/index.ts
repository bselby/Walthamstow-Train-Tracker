import http from 'node:http';
import { startKafkaClient, kafkaStats } from './kafka.js';
import type { BerthEvent } from './types.js';

const PORT = parseInt(process.env.PORT ?? '8080', 10);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'https://e17trains.uk';

// Process-level stats not owned by kafka.ts.
const processStartedAt = Date.now();
let eventsEmitted = 0;

// ── SSE client registry ───────────────────────────────────────────────────────

type SseClient = { res: http.ServerResponse; id: number };
let nextClientId = 1;
const clients = new Map<number, SseClient>();

function addClient(res: http.ServerResponse): SseClient {
  const id = nextClientId++;
  const client: SseClient = { res, id };
  clients.set(id, client);
  console.log(`[sse] client ${id} connected (total: ${clients.size})`);
  return client;
}

function removeClient(id: number): void {
  clients.delete(id);
  console.log(`[sse] client ${id} disconnected (total: ${clients.size})`);
}

function broadcast(event: BerthEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const [id, client] of clients) {
    try {
      client.res.write(data);
    } catch {
      removeClient(id);
    }
  }
}

// ── Heartbeat — keeps SSE connections alive through proxies / load balancers ─

setInterval(() => {
  const comment = ': heartbeat\n\n';
  for (const [id, client] of clients) {
    try {
      client.res.write(comment);
    } catch {
      removeClient(id);
    }
  }
}, 20_000);

// ── HTTP server ───────────────────────────────────────────────────────────────

function setCors(res: http.ServerResponse, origin: string | undefined): void {
  const allowed = origin === ALLOWED_ORIGIN || ALLOWED_ORIGIN === '*';
  res.setHeader('Access-Control-Allow-Origin', allowed ? (origin ?? ALLOWED_ORIGIN) : ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Vary', 'Origin');
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  setCors(res, origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptimeSec: Math.floor((Date.now() - processStartedAt) / 1000),
      clients: clients.size,
      kafka: {
        connected: kafkaStats.connected,
        startedAt: kafkaStats.startedAt,
        messagesProcessed: kafkaStats.messagesProcessed,
        caMsgsSeen: kafkaStats.caMsgsSeen,
        firstMessageAt: kafkaStats.firstMessageAt,
        lastMessageAt: kafkaStats.lastMessageAt,
        secondsSinceLastMessage: kafkaStats.lastMessageAt
          ? Math.floor((Date.now() - kafkaStats.lastMessageAt) / 1000)
          : null,
      },
      eventsEmitted,
    }));
    return;
  }

  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    // Flush headers immediately so the browser considers the SSE stream open
    res.flushHeaders();

    const client = addClient(res);

    // Send a connected confirmation so the browser knows it's live
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    req.on('close', () => removeClient(client.id));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[http] listening on port ${PORT}`);
});

// ── Start Kafka ───────────────────────────────────────────────────────────────

startKafkaClient((event) => {
  eventsEmitted++;
  console.log(`[td] ${event.station} ${event.event} train=${event.trainId}`);
  broadcast(event);
}).catch((err: Error) => {
  console.error('[kafka] fatal:', err.message);
  process.exit(1);
});
