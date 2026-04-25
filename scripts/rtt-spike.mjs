#!/usr/bin/env node
// One-off spike: capture /rtt/location for the Weaver-line CRS codes so we
// can see whether RTT can anchor the East Ave southbound countdown.
//
// Run: RTT_REFRESH_TOKEN=<refresh-jwt> node scripts/rtt-spike.mjs
//
// Outputs:
//   tests/fixtures/rtt-spike-WHC.json  (Walthamstow Central, Weaver)
//   tests/fixtures/rtt-spike-WST.json  (Wood Street, Weaver)
//   tests/fixtures/rtt-spike-WMW.json  (Walthamstow Queens Road, fresh capture for diff)
// Plus a console report on time resolution + actual-vs-forecast signals.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const REFRESH = process.env.RTT_REFRESH_TOKEN;
if (!REFRESH) {
  console.error('Missing RTT_REFRESH_TOKEN env var.');
  process.exit(1);
}

const STATIONS = [
  { crs: 'WHC', name: 'Walthamstow Central' },
  { crs: 'WST', name: 'Wood Street' },
  { crs: 'WMW', name: 'Walthamstow Queens Road' },
];

async function getAccessToken(refresh) {
  const r = await fetch('https://data.rtt.io/api/get_access_token', {
    headers: { Authorization: `Bearer ${refresh}` },
  });
  if (!r.ok) throw new Error(`token exchange failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.token;
}

async function fetchLocation(access, crs) {
  const url = `https://data.rtt.io/rtt/location?code=gb-nr:${crs}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  const body = await r.text();
  if (!r.ok) throw new Error(`fetch ${crs} failed: ${r.status} ${body}`);
  const headers = Object.fromEntries(r.headers);
  return { json: JSON.parse(body), rateLimitHeaders: headers };
}

function analyseTimeResolution(json) {
  // Walk every ISO timestamp inside services[*].temporalData and report whether
  // any of them have non-zero seconds — that would confirm sub-minute precision.
  const stamps = [];
  for (const svc of json.services ?? []) {
    const td = svc.temporalData ?? {};
    for (const phase of ['arrival', 'departure']) {
      const block = td[phase];
      if (!block) continue;
      for (const k of Object.keys(block)) {
        const v = block[k];
        if (typeof v === 'string' && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
          stamps.push({ phase, field: k, value: v });
        }
      }
    }
  }
  const withSeconds = stamps.filter((s) => !s.value.endsWith(':00'));
  return { total: stamps.length, withSeconds };
}

function findActualMarkers(json) {
  // Scan service rows for any field name containing "actual" or any boolean
  // suggesting a stop has already happened.
  const hits = [];
  function walk(obj, path) {
    if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        const here = path ? `${path}.${k}` : k;
        if (/actual|departed|arrived|recorded|atStation|trust/i.test(k)) {
          hits.push({ path: here, value: v });
        }
        if (typeof v === 'object') walk(v, here);
      }
    }
  }
  for (const svc of json.services ?? []) walk(svc, 'services[*]');
  return hits;
}

function summarise(crs, name, json) {
  const services = json.services ?? [];
  const res = analyseTimeResolution(json);
  const actuals = findActualMarkers(json);
  console.log(`\n── ${crs} (${name}) ─────────────────────────────`);
  console.log(`  services in window: ${services.length}`);
  console.log(`  timestamps inspected: ${res.total}`);
  console.log(`  timestamps with non-zero seconds: ${res.withSeconds.length}`);
  if (res.withSeconds.length > 0) {
    console.log(`  → sub-minute precision confirmed. Examples:`);
    for (const s of res.withSeconds.slice(0, 3)) {
      console.log(`     ${s.phase}.${s.field} = ${s.value}`);
    }
  } else {
    console.log(`  → all timestamps are minute-rounded.`);
  }
  if (actuals.length > 0) {
    const uniq = [...new Set(actuals.map((a) => a.path.replace(/\[\*\]/g, '')))];
    console.log(`  actual/departed/arrived field hits: ${uniq.slice(0, 6).join(', ')}`);
  } else {
    console.log(`  no fields matching /actual|departed|arrived/ found.`);
  }
  // Show the temporal block of any service that's already happened (its
  // realtimeForecast is in the past) — best signal for whether the field
  // becomes "actual" once an event passes.
  const now = Date.now();
  const past = services.find((s) => {
    const f = s.temporalData?.departure?.realtimeForecast;
    return f && new Date(f).getTime() < now;
  });
  if (past) {
    console.log(`  most-recent past service:`);
    console.log(JSON.stringify(past.temporalData, null, 2).split('\n').map((l) => '    ' + l).join('\n'));
  }
}

async function main() {
  const access = await getAccessToken(REFRESH);
  console.log(`access token: ${access.slice(0, 12)}…`);
  for (const { crs, name } of STATIONS) {
    const { json, rateLimitHeaders } = await fetchLocation(access, crs);
    const path = `tests/fixtures/rtt-spike-${crs}.json`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(json, null, 2));
    console.log(`wrote ${path}  (rate-remaining/hour=${rateLimitHeaders['x-ratelimit-remaining-hour']})`);
    summarise(crs, name, json);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
