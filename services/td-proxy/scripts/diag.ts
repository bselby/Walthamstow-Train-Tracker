/**
 * diag.ts — log raw Kafka messages to verify feed delivery
 */
import { Kafka, logLevel } from 'kafkajs';

const BOOTSTRAP = 'pkc-z3p1v0.europe-west2.gcp.confluent.cloud:9092';
const TOPIC = 'prod-1015-Combined-Train-Describer-feed1_0';
const GROUP_ID = process.env.KAFKA_GROUP_ID ?? 'SC-d9034ca2-0de2-4797-9697-39d9c422171d';

const username = process.env.KAFKA_USERNAME!;
const password = process.env.KAFKA_PASSWORD!;

const kafka = new Kafka({
  clientId: 'e17trains-diag',
  brokers: [BOOTSTRAP],
  ssl: true,
  sasl: { mechanism: 'plain', username, password },
  logLevel: logLevel.WARN,
});

const consumer = kafka.consumer({ groupId: GROUP_ID });

await consumer.connect();
console.log('connected');

await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
console.log('subscribed (fromBeginning=true)');

let count = 0;

await consumer.run({
  eachMessage: async ({ message, partition }) => {
    count++;
    if (count <= 3 || count % 100 === 0) {
      const preview = message.value?.toString().slice(0, 200);
      console.log(`[#${count}] partition=${partition} ts=${message.timestamp} preview=${preview}`);
    }
  },
});
