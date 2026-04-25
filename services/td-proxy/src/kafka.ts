import { Kafka, logLevel } from 'kafkajs';
import { matchBerth } from './berths.js';
import type { BerthEvent, RawTDMessage } from './types.js';

export type BerthEventHandler = (event: BerthEvent) => void;

const BOOTSTRAP = 'pkc-z3p1v0.europe-west2.gcp.confluent.cloud:9092';
const TOPIC = 'prod-1015-Combined-Train-Describer-feed1_0';
// Consumer group ID is assigned per-subscription by raildata.org.uk.
const GROUP_ID = process.env.KAFKA_GROUP_ID ?? 'SC-d9034ca2-0de2-4797-9697-39d9c422171d';

function requiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`${name} env var is required`);
  return val;
}

export async function startKafkaClient(onEvent: BerthEventHandler): Promise<void> {
  const username = requiredEnv('KAFKA_USERNAME');
  const password = requiredEnv('KAFKA_PASSWORD');

  const kafka = new Kafka({
    clientId: 'e17trains-td-proxy',
    brokers: [BOOTSTRAP],
    ssl: true,
    sasl: { mechanism: 'plain', username, password },
    logLevel: logLevel.WARN,
  });

  const consumer = kafka.consumer({ groupId: GROUP_ID });

  await consumer.connect();
  console.log('[kafka] connected');

  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  console.log(`[kafka] subscribed to ${TOPIC}`);

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      let messages: RawTDMessage[];
      try {
        messages = JSON.parse(message.value.toString()) as RawTDMessage[];
      } catch {
        return;
      }
      for (const msg of messages) {
        if (!msg.CA_MSG) continue;
        const event = matchBerth(msg.CA_MSG);
        if (event) onEvent(event);
      }
    },
  });
}
