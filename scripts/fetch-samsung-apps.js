#!/usr/bin/env node
/**
 * Fetches the Samsung TV downloadable-app catalog across regions and categories.
 *
 * API note: `offset` is a ZERO-BASED PAGE NUMBER, not an item offset.
 *   offset=0 → items 1..size
 *   offset=1 → items (size+1)..(2×size)
 *   Total pages = Math.ceil(allCount / size)
 *
 * Usage:
 *   node scripts/fetch-samsung-apps.js
 *   node scripts/fetch-samsung-apps.js --regions=SE,NO,GB,US
 *   node scripts/fetch-samsung-apps.js --regions=SE --out=my-db.json
 *   node scripts/fetch-samsung-apps.js --size=40    (default 40, website value)
 */
'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Configuration ─────────────────────────────────────────────────────────────

const ALL_REGIONS = [
  { code: 'SE', lang: 'sv' },
  { code: 'NO', lang: 'no' },
  { code: 'DK', lang: 'da' },
  { code: 'FI', lang: 'fi' },
  { code: 'GB', lang: 'en' },
  { code: 'IE', lang: 'en' },
  { code: 'US', lang: 'en' },
  { code: 'CA', lang: 'en' },
  { code: 'AU', lang: 'en' },
  { code: 'NZ', lang: 'en' },
  { code: 'DE', lang: 'de' },
  { code: 'AT', lang: 'de' },
  { code: 'FR', lang: 'fr' },
  { code: 'IT', lang: 'it' },
  { code: 'ES', lang: 'es' },
  { code: 'NL', lang: 'nl' },
  { code: 'BE', lang: 'nl' },
  { code: 'PL', lang: 'pl' },
];

// Omit productCategoryName to fetch all apps in one pass per region.
// Individual category names (Videos, Lifestyle, Game, etc.) also work if needed.
const CATEGORIES = [null];  // null = no category filter → all apps

// API accepts up to at least 5000; size=2000 returns everything in one page for most categories.
const DEFAULT_SIZE = 2000;

// Back-off limits
const INITIAL_DELAY_MS  = 1_500;   // start conservatively
const MIN_DELAY_MS      = 500;
const MAX_DELAY_MS      = 120_000; // 2 min ceiling

// How many consecutive empty-but-expected pages before we give up on a category
const MAX_RATE_LIMIT_RETRIES = 3;

const DEFAULT_OUT = path.join(__dirname, '..', 'samsung-apps-db.json');
const API_BASE    = 'https://vdapi.samsung.com/tvs/tvpersonalize/api/tvapps/appserver/list';
const UA          = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Adaptive throttle ─────────────────────────────────────────────────────────
//
// Distinguishes three outcomes:
//   onData()   – got real apps back → success streak, reduce delay after N in a row
//   onEmpty()  – tvApp=[] but allCount>0 → rate-limited, back off hard
//   onDone()   – tvApp=[] and offset ≥ totalPages → natural end, no penalty
//   onError()  – network/HTTP failure → back off harder

class AdaptiveThrottle {
  constructor(initialMs = INITIAL_DELAY_MS) {
    this.delay  = initialMs;
    this.streak = 0;  // consecutive successful data pages
  }

  wait() {
    const jitter = this.delay * 0.15 * (Math.random() * 2 - 1);
    const ms     = Math.max(100, Math.round(this.delay + jitter));
    return new Promise(r => setTimeout(r, ms));
  }

  onData() {
    this.streak++;
    if (this.streak >= 5) {
      this.delay  = Math.max(MIN_DELAY_MS, Math.floor(this.delay * 0.85));
      this.streak = 0;
      this._note(`↓${this.delay}ms`);
    }
  }

  // Rate-limited: got empty when we expected data
  onEmpty() {
    this.streak = 0;
    this.delay  = Math.min(MAX_DELAY_MS, Math.floor(this.delay * 2.2));
    this._note(`rate-limit ↑${this.delay}ms`);
  }

  // Network/HTTP error
  onError() {
    this.streak = 0;
    this.delay  = Math.min(MAX_DELAY_MS, Math.floor(this.delay * 3.0));
    this._note(`error ↑${this.delay}ms`);
  }

  _note(msg) { process.stdout.write(` [${msg}]`); }
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json, */*' },
      timeout: 25_000,
    }, res => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let raw = '';
      res.on('data', c  => { raw += c; });
      res.on('end',  () => {
        try   { resolve(JSON.parse(raw)); }
        catch { reject(new Error('bad JSON')); }
      });
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ── Per-category fetch ────────────────────────────────────────────────────────

/**
 * Fetches all pages of one (region, category) pair.
 * Returns a Map<appId, appName>.
 */
async function fetchCategory(region, category, pageSize, throttle) {
  const apps          = new Map();
  let   pageNum       = 0;   // offset parameter (0-based page number)
  let   totalPages    = Infinity;
  let   rateLimitHits = 0;

  while (pageNum < totalPages) {
    const catParam = category ? `&productCategoryName=${encodeURIComponent(category)}` : '';
    const url =
      `${API_BASE}?country_code=${region.code}&language_code=${region.lang}` +
      `&offset=${pageNum}&size=${pageSize}&order=asc${catParam}`;

    await throttle.wait();

    let data;
    try {
      data = await fetchJson(url);
    } catch (err) {
      process.stdout.write(` [err:${err.message}]`);
      throttle.onError();
      // Single automatic retry after the now-longer back-off
      await throttle.wait();
      try { data = await fetchJson(url); } catch { break; }
    }

    const inner    = data.data || data;   // API wraps in {"data":{...}}
    const page     = inner.tvApp || [];
    const allCount = inner.allCount ?? 0;

    // Calculate totalPages once (from the first page that returns allCount)
    if (totalPages === Infinity && allCount > 0) {
      totalPages = Math.ceil(allCount / pageSize);
    } else if (allCount === 0 && pageNum === 0) {
      // Category is genuinely empty for this region
      break;
    }

    if (page.length === 0) {
      // Two possibilities:
      //   a) Rate-limited – allCount > 0 but tvApp is []
      //   b) Past the end  – pageNum >= totalPages
      if (pageNum >= totalPages) break;  // (b) natural end

      // (a) Rate limited – back off and retry this same page
      rateLimitHits++;
      throttle.onEmpty();
      if (rateLimitHits > MAX_RATE_LIMIT_RETRIES) {
        console.log(` [gave up after ${rateLimitHits} rate-limit hits at page ${pageNum}/${totalPages}]`);
        break;
      }
      continue;  // retry same pageNum after longer wait
    }

    rateLimitHits = 0;
    for (const a of page) apps.set(a.appId, a.appName);
    process.stdout.write(` p${pageNum}+${page.length}(${apps.size}/${allCount})`);
    throttle.onData();
    pageNum++;
  }

  return apps;
}

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const kv = Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith('--'))
      .map(a => { const [k, ...rest] = a.slice(2).split('='); return [k, rest.join('=') || true]; })
  );
  return {
    regions:    kv.regions    ? kv.regions.split(',').map(s => s.trim().toUpperCase()) : null,
    categories: kv.categories ? kv.categories.split(',').map(s => s.trim()) : CATEGORIES,
    out:        kv.out        ? path.resolve(kv.out) : DEFAULT_OUT,
    size:       kv.size       ? parseInt(kv.size, 10) : DEFAULT_SIZE,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { regions: regionFilter, categories, out, size } = parseArgs();

  const regions = regionFilter
    ? ALL_REGIONS.filter(r => regionFilter.includes(r.code))
    : ALL_REGIONS;

  if (regions.length === 0) {
    console.error('No matching regions. Valid codes:', ALL_REGIONS.map(r => r.code).join(', '));
    process.exit(1);
  }

  console.log(`Regions    : ${regions.map(r => r.code).join(', ')}`);
  console.log(`Categories : ${categories.join(', ')}`);
  console.log(`Page size  : ${size} (offset = 0-based page number)`);
  console.log(`Output     : ${out}\n`);

  const db       = new Map();   // appId → { name, regions: Set<string> }
  const throttle = new AdaptiveThrottle(INITIAL_DELAY_MS);

  for (const region of regions) {
    for (const cat of categories) {
      const label = cat ? `${region.code}/${cat}` : region.code;
      process.stdout.write(`${label}:`);
      const page = await fetchCategory(region, cat, size, throttle);

      for (const [id, name] of page) {
        if (!db.has(id)) db.set(id, { name, regions: new Set() });
        db.get(id).regions.add(region.code);
      }

      process.stdout.write('\n');
    }
  }

  const apps = [...db.entries()]
    .sort(([, a], [, b]) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
    .map(([id, { name, regions }]) => ({ id, name, regions: [...regions].sort() }));

  const output = {
    generated:      new Date().toISOString(),
    regionsQueried: regions.map(r => r.code),
    pageSize:       size,
    appCount:       apps.length,
    apps,
  };

  fs.writeFileSync(out, JSON.stringify(output, null, 2));
  console.log(`\n✓ ${apps.length} unique apps → ${path.relative(process.cwd(), out)}`);
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
