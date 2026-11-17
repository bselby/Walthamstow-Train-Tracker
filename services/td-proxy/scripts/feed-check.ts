/**
 * feed-check.ts — connect to the TD topic for a fixed time and report whether
 * live messages arrive, how fresh they are, and how many are Q4 berth steps.
 *
 * Run from services/td-proxy:
 *   node --env-file=.env --import tsx scripts/feed-check.ts [seconds]
 */
import { Kafka, logLevel } from 'kafkajs';

const BOOTSTRAP = process.env.KAFKA_BOOTSTRAP ?? 'pkc-z3p1v0.europe-west2.gcp.confluent.cloud:9092';
const TOPIC = process.env.KAFKA_TOPIC ?? 'TD_ALL_SIG_AREA';
const GROUP_ID = process.env.KAFKA_GROUP_ID;
const username = process.env.KAFKA_USERNAME;
const password = process.env.KAFKA_PASSWORD;
const seconds = parseInt(process.argv[2] ?? '75', 10);

if (!GROUP_ID || !username || !password) {
  console.error('KAFKA_GROUP_ID, KAFKA_USERNAME and KAFKA_PASSWORD are required');
  process.exit(1);
}

const kafka = new Kafka({
  clientId: 'e17trains-feed-check',
  brokers: [BOOTSTRAP],
  ssl: true,
  sasl: { mechanism: 'plain', username, password },
  logLevel: logLevel.ERROR,
});

const consumer = kafka.consumer({ groupId: GROUP_ID });
let kafkaMessages = 0;
let tdMessages = 0;
let q4Steps = 0;
const lagsMs: number[] = [];
const areas = new Map<string, number>();
const q4Samples: string[] = [];

await consumer.connect();
console.log('connected');
await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
console.log(`subscribed to ${TOPIC}; listening for ${seconds}s`);

setTimeout(async () => {
  lagsMs.sort((a, b) => a - b);
  const median = lagsMs.length ? lagsMs[Math.floor(lagsMs.length / 2)] : null;
  console.log(JSON.stringify({
    kafkaMessages,
    tdMessages,
    distinctAreas: areas.size,
    q4Messages: areas.get('Q4') ?? 0,
    soMessages: areas.get('SO') ?? 0,
    q4BerthSteps: q4Steps,
    medianAgeSeconds: median === null ? null : Math.round(median / 1000),
    minAgeSeconds: lagsMs.length ? Math.round(lagsMs[0] / 1000) : null,
    maxAgeSeconds: lagsMs.length ? Math.round(lagsMs[lagsMs.length - 1] / 1000) : null,
  }, null, 2));
  for (const s of q4Samples) console.log(s);
  await consumer.disconnect().catch(() => {});
  process.exit(0);
}, seconds * 1000);

await consumer.run({
  eachMessage: async ({ message }) => {
    kafkaMessages++;
    let parsed: unknown;
    try { parsed = JSON.parse(message.value?.toString() ?? ''); } catch { return; }
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { value?: unknown }).value)
        ? (parsed as { value: unknown[] }).value
        : [parsed];
    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue;
      for (const body of Object.values(item as Record<string, unknown>)) {
        if (typeof body !== 'object' || body === null) continue;
        const m = body as Record<string, string>;
        if (!m.area_id) continue;
        tdMessages++;
        areas.set(m.area_id, (areas.get(m.area_id) ?? 0) + 1);
        if (m.time) lagsMs.push(Date.now() - parseInt(m.time, 10));
        if (m.area_id === 'Q4' && m.msg_type === 'CA') {
          q4Steps++;
          if (q4Samples.length < 12) {
            q4Samples.push(`Q4 step ${m.from}->${m.to} train ${m.descr} at ${new Date(parseInt(m.time, 10)).toISOString().slice(11, 19)}`);
          }
        }
      }
    }
  },
});
