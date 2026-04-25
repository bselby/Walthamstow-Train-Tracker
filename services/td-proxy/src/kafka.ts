import { Kafka, logLevel } from 'kafkajs';
import { matchBerth } from './berths.js';
import type { BerthEvent, RawTDMessage } from './types.js';

export type BerthEventHandler = (event: BerthEvent) => void;

const BOOTSTRAP = 'pkc-z3p1v0.europe-west2.gcp.confluent.cloud:9092';
const TOPIC = 'prod-1015-Combined-Train-Describer-feed1_0';
// Consumer group ID is assigned per-subscription by raildata.org.uk.
const GROUP_ID = process.env.KAFKA_GROUP_ID ?? 'SC-d9034ca2-0de2-4797-9697-39d9c422171d';

/** Mutable, exported so /health can read it without us having to thread the
 *  state through callbacks. The proxy is single-process so a module-scoped
 *  object is fine. */
export const kafkaStats = {
  connected: false,
  startedAt: null as number | null,
  messagesProcessed: 0,
  caMsgsSeen: 0,
  firstMessageAt: null as number | null,
  lastMessageAt: null as number | null,
};

function requiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`${name} env var is required`);
  return val;
}

export async function startKafkaClient(onEvent: BerthEventHandler): Promise<void> {
  const username = requiredEnv('KAFKA_USERNAME');
  const password = requiredEnv('KAFKA_PASSWORD');

  kafkaStats.startedAt = Date.now();

  const kafka = new Kafka({
    clientId: 'e17trains-td-proxy',
    brokers: [BOOTSTRAP],
    ssl: true,
    sasl: { mechanism: 'plain', username, password },
    // INFO surfaces consumer-group join/rebalance lifecycle — we want to see
    // those once on startup; they're rare enough not to spam.
    logLevel: logLevel.INFO,
  });

  const consumer = kafka.consumer({ groupId: GROUP_ID });

  // Lifecycle visibility — kafkajs emits these events for transient network
  // hiccups too, not just startup, so we want them logged consistently.
  const { CONNECT, DISCONNECT, CRASH, GROUP_JOIN } = consumer.events;
  consumer.on(CONNECT, () => {
    kafkaStats.connected = true;
    console.log('[kafka] event: CONNECT');
  });
  consumer.on(DISCONNECT, () => {
    kafkaStats.connected = false;
    console.warn('[kafka] event: DISCONNECT');
  });
  consumer.on(GROUP_JOIN, ({ payload }) => {
    console.log(`[kafka] event: GROUP_JOIN memberId=${payload.memberId} partitions=${JSON.stringify(payload.memberAssignment)}`);
  });
  consumer.on(CRASH, ({ payload }) => {
    console.error(`[kafka] event: CRASH restart=${payload.restart} error=${payload.error.message}`);
    // If kafkajs reports it cannot recover, exit so Fly restarts the machine.
    if (!payload.restart) {
      console.error('[kafka] non-restartable crash — exiting so Fly redeploys');
      process.exit(1);
    }
  });

  await consumer.connect();
  kafkaStats.connected = true;
  console.log('[kafka] connected');

  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  console.log(`[kafka] subscribed to ${TOPIC}`);

  // Watchdog: surface "we connected but the topic is silent" so we can
  // distinguish an auth/connection problem from an upstream-publisher
  // problem. Also pings the live message rate periodically so the logs
  // show liveness even when no berths match our filter.
  setInterval(() => {
    const now = Date.now();
    if (!kafkaStats.connected) return;
    if (kafkaStats.lastMessageAt === null) {
      const sinceStart = kafkaStats.startedAt ? now - kafkaStats.startedAt : 0;
      console.warn(`[kafka] no messages received yet (${Math.floor(sinceStart / 1000)}s since startup)`);
    } else {
      const idle = now - kafkaStats.lastMessageAt;
      console.log(`[kafka] heartbeat — msgs=${kafkaStats.messagesProcessed} ca=${kafkaStats.caMsgsSeen} idleSec=${Math.floor(idle / 1000)}`);
    }
  }, 60_000);

  await consumer.run({
    eachMessage: async ({ message }) => {
      const now = Date.now();
      kafkaStats.messagesProcessed++;
      kafkaStats.lastMessageAt = now;
      if (kafkaStats.firstMessageAt === null) {
        kafkaStats.firstMessageAt = now;
        console.log('[kafka] first message received');
      }

      if (!message.value) return;
      let messages: RawTDMessage[];
      try {
        messages = JSON.parse(message.value.toString()) as RawTDMessage[];
      } catch {
        return;
      }
      for (const msg of messages) {
        if (!msg.CA_MSG) continue;
        kafkaStats.caMsgsSeen++;
        const event = matchBerth(msg.CA_MSG);
        if (event) onEvent(event);
      }
    },
  });
}
