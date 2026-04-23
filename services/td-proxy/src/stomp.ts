import stompit = require('stompit');
import { matchBerth } from './berths.js';
import type { BerthEvent, RawTDMessage } from './types.js';

const TOPIC = '/topic/TD_ALL_SIG_AREA';
const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

export type BerthEventHandler = (event: BerthEvent) => void;

interface NrConnectOptions {
  host: string;
  port: number;
  connectHeaders: {
    host: string;
    login: string;
    passcode: string;
    'heart-beat': string;
  };
}

function connectOptions(): NrConnectOptions {
  const username = process.env.NR_USERNAME;
  const password = process.env.NR_PASSWORD;
  if (!username || !password) {
    throw new Error('NR_USERNAME and NR_PASSWORD env vars are required');
  }
  return {
    host: 'datafeeds.networkrail.co.uk',
    port: 61618,
    connectHeaders: {
      host: '/',
      login: username,
      passcode: password,
      'heart-beat': '10000,10000',
    },
  };
}

export function startStompClient(onEvent: BerthEventHandler): void {
  let delay = RECONNECT_DELAY_MS;

  function connect(): void {
    console.log('[stomp] connecting to Network Rail…');

    stompit.connect(connectOptions(), (connectErr, client) => {
      if (connectErr) {
        console.error(`[stomp] connection failed: ${connectErr.message} — retrying in ${delay / 1000}s`);
        setTimeout(() => {
          delay = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
          connect();
        }, delay);
        return;
      }

      delay = RECONNECT_DELAY_MS; // reset backoff on successful connection
      console.log('[stomp] connected');

      client.on('error', (err) => {
        console.error(`[stomp] client error: ${err.message} — reconnecting`);
        setTimeout(connect, delay);
      });

      client.subscribe({ destination: TOPIC, ack: 'auto' }, (subErr, message) => {
        if (subErr) {
          console.error(`[stomp] subscribe error: ${subErr.message}`);
          client.disconnect();
          setTimeout(connect, delay);
          return;
        }

        message.readString('utf-8', (readErr, body) => {
          if (readErr || !body) return;

          let messages: RawTDMessage[];
          try {
            messages = JSON.parse(body) as RawTDMessage[];
          } catch {
            return;
          }

          for (const msg of messages) {
            if (!msg.CA_MSG) continue;
            const event = matchBerth(msg.CA_MSG);
            if (event) onEvent(event);
          }
        });
      });
    });
  }

  connect();
}
