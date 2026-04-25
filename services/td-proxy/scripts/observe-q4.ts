/**
 * observe-q4.ts
 *
 * Logs all Q4 CA (berth step) messages from the Combined TD Kafka feed in
 * real-time, grouped by train ID, so we can see the full sequence of berths
 * each train steps through on the Chingford branch.
 *
 * Usage:
 *   KAFKA_USERNAME=xxx KAFKA_PASSWORD=yyy npx tsx scripts/observe-q4.ts
 */

import { Kafka, logLevel } from 'kafkajs';

const BOOTSTRAP = 'pkc-z3p1v0.europe-west2.gcp.confluent.cloud:9092';
const TOPIC = 'prod-1015-Combined-Train-Describer-feed1_0';
const GROUP_ID = process.env.KAFKA_GROUP_ID ?? 'SC-d9034ca2-0de2-4797-9697-39d9c422171d';

const KNOWN_BERTHS: Record<string, string> = {
  // St James Street
  '1411': 'STJAMESST arrive-north',
  '1413': 'STJAMESST depart-north / WALTHMSWC arrive-north',
  '1410': 'STJAMESST arrive-south',
  '1412': 'STJAMESST depart-south',
  // Walthamstow Central
  '1415': 'WALTHMSWC depart-north',
  '1414': 'WALTHMSWC depart-south',
  '1418': 'WALTHMSWC arrive-south',
  // Wood Street
  '1419': 'WOOD ST arrive-north (approach)',
  '1421': 'WOOD ST depart-north',
  '1422': 'WOOD ST depart-south',
  '1424': 'WOOD ST arrive-south',
  // Highams Park
  '1427': 'HIGHAMSPK arrive-north (approach)',
  '1429': 'HIGHAMSPK depart-north',
  '1432': 'HIGHAMSPK depart-south',
  '1434': 'HIGHAMSPK arrive-south',
  // Chingford
  '1433': 'CHINGFORD arrive-north',
  '1442': 'CHINGFORD depart-south',
};

const trains = new Map<string, { from: string; to: string; time: string }[]>();

function label(berth: string): string {
  const known = KNOWN_BERTHS[berth];
  return known ? `${berth} ★ ${known}` : berth;
}

function formatTime(unixMs: string): string {
  return new Date(parseInt(unixMs, 10)).toLocaleTimeString('en-GB');
}

const username = process.env.KAFKA_USERNAME;
const password = process.env.KAFKA_PASSWORD;
if (!username || !password) {
  console.error('Set KAFKA_USERNAME and KAFKA_PASSWORD env vars');
  process.exit(1);
}

console.log('Connecting to Combined TD Kafka feed — watching Q4 (Chingford branch)…\n');

const kafka = new Kafka({
  clientId: 'e17trains-observe-q4',
  brokers: [BOOTSTRAP],
  ssl: true,
  sasl: { mechanism: 'plain', username, password },
  logLevel: logLevel.WARN,
});

const consumer = kafka.consumer({ groupId: GROUP_ID });

await consumer.connect();
console.log('Connected.\n');

await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

await consumer.run({
  eachMessage: async ({ message }) => {
    if (!message.value) return;
    let messages: { CA_MSG?: { time: string; area_id: string; from: string; to: string; descr: string } }[];
    try { messages = JSON.parse(message.value.toString()); } catch { return; }

    for (const msg of messages) {
      const ca = msg.CA_MSG;
      if (!ca || ca.area_id !== 'Q4' || !ca.descr.trim()) continue;

      const { time, from, to, descr: trainId } = ca;
      const steps = trains.get(trainId) ?? [];
      steps.push({ from, to, time });
      trains.set(trainId, steps);

      const fromLabel = label(from);
      const toLabel   = label(to);
      const t         = formatTime(time);
      const isKnown   = KNOWN_BERTHS[from] || KNOWN_BERTHS[to];

      const line = `${t}  train=${trainId}  ${fromLabel.padEnd(45)} → ${toLabel}`;
      console.log(isKnown ? `\x1b[33m${line}\x1b[0m` : line);

      if (steps.length > 1) {
        const seq = steps.map(s => s.from).join(' → ') + ' → ' + steps[steps.length - 1].to;
        console.log(`  sequence: ${seq}\n`);
      }
    }
  },
});
