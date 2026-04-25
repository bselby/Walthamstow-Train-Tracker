/**
 * offsets.ts — query Kafka for topic offsets and consumer group lag
 */
import { Kafka, logLevel } from 'kafkajs';

const BOOTSTRAP = 'pkc-z3p1v0.europe-west2.gcp.confluent.cloud:9092';
const TOPIC = 'prod-1015-Combined-Train-Describer-feed1_0';
const GROUP_ID = process.env.KAFKA_GROUP_ID ?? 'SC-d9034ca2-0de2-4797-9697-39d9c422171d';

const username = process.env.KAFKA_USERNAME!;
const password = process.env.KAFKA_PASSWORD!;

const kafka = new Kafka({
  clientId: 'e17trains-offsets',
  brokers: [BOOTSTRAP],
  ssl: true,
  sasl: { mechanism: 'plain', username, password },
  logLevel: logLevel.WARN,
});

const admin = kafka.admin();
await admin.connect();

const t0 = await admin.fetchTopicOffsets(TOPIC);
console.log('t=0 offsets:', t0.map(p => ({ partition: p.partition, offset: p.offset })));

await new Promise(r => setTimeout(r, 10000));

const t1 = await admin.fetchTopicOffsets(TOPIC);
console.log('t=10s offsets:', t1.map(p => ({ partition: p.partition, offset: p.offset })));

const earliest = await admin.fetchTopicOffsetsByTimestamp(TOPIC, 0);
console.log('Earliest offsets (timestamp=0):', earliest);

await admin.disconnect();
