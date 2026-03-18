require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../db');
let Parser;
try { Parser = require('rss-parser'); } catch(e) {
  console.error('[intelligence] rss-parser not installed. Run: npm install rss-parser');
}

// ─── Source definitions ────────────────────────────────────────────────────
const RSS_SOURCES = [
  { name: 'Reuters',     url: 'https://feeds.reuters.com/reuters/businessNews' },
  { name: 'OilPrice',    url: 'https://oilprice.com/rss/main' },
  { name: 'Rigzone',     url: 'https://www.rigzone.com/news/rss/rigzone_latest.aspx' },
];

const HTML_SOURCES = [
  {
    name: 'IEA',
    url: 'https://www.iea.org/news',
    itemSelector: 'article',
    extractFn: ($, el) => {
      const headline = $(el).find('h2, h3, .title').first().text().trim();
      const link = $(el).find('a').first().attr('href');
      const summary = $(el).find('p').first().text().trim();
      if (!headline) return null;
      return {
        source: 'IEA',
        source_url: link ? (link.startsWith('http') ? link : `https://www.iea.org${link}`) : null,
        headline,
        summary: summary.substring(0, 500),
        published_at: null,
      };
    },
  },
  {
    name: 'Kpler',
    url: 'https://www.kpler.com/blog',
    itemSelector: 'article, .blog-post, .post-item',
    extractFn: ($, el) => {
      const headline = $(el).find('h2, h3, .title').first().text().trim();
      const link = $(el).find('a').first().attr('href');
      const summary = $(el).find('p').first().text().trim();
      if (!headline) return null;
      return {
        source: 'Kpler',
        source_url: link ? (link.startsWith('http') ? link : `https://www.kpler.com${link}`) : null,
        headline,
        summary: summary.substring(0, 500),
        published_at: null,
      };
    },
  },
  {
    name: 'OPEC',
    url: 'https://www.opec.org/opec_web/en/press_room/4047.htm',
    itemSelector: '.pressReleaseItem, li, .item',
    extractFn: ($, el) => {
      const headline = $(el).find('a, h3, h4').first().text().trim();
      const link = $(el).find('a').first().attr('href');
      if (!headline || headline.length < 10) return null;
      return {
        source: 'OPEC',
        source_url: link ? (link.startsWith('http') ? link : `https://www.opec.org${link}`) : null,
        headline,
        summary: null,
        published_at: null,
      };
    },
  },
];

// ─── Keyword filters ────────────────────────────────────────────────────────
const GROUP_C = [
  'hormuz', 'strait of hormuz', 'operation epic fury',
  'iea emergency', 'strategic petroleum reserve', 'spr release', 'opec emergency'
];
const GROUP_A = [
  'kpler', 'vortexa', 'vlcc', 'fujairah', 'floating roof',
  'crude exports', 'oil production', 'iraq oil', 'kuwait oil',
  'saudi aramco', 'uae oil', 'iranian oil', 'tanker cargo'
];
const GROUP_B = [
  'inventory', 'stocks', 'storage', 'exports', 'flows', 'loading',
  'fixture', 'curtailment', 'output', 'production cut', 'refinery run',
  'mb/d', 'barrels per day', 'throughput', 'shipment'
];

function isRelevant(item) {
  const text = `${item.headline} ${item.summary || ''}`.toLowerCase();
  if (GROUP_C.some(t => text.includes(t))) return true;
  return GROUP_A.some(t => text.includes(t)) && GROUP_B.some(t => text.includes(t));
}

function categorize(item) {
  const text = `${item.headline} ${item.summary || ''}`.toLowerCase();
  if (/production|output|curtailment|shut.in|flaring|wellhead/.test(text)) return 'PRODUCTION';
  if (/tanker|vlcc|fixture|cargo|loading|strait|port/.test(text)) return 'SHIPPING';
  if (/inventory|stocks|storage|floating roof|tank farm|fujairah/.test(text)) return 'STORAGE';
  if (/iea|opec|spr|emergency release|sanctions|policy/.test(text)) return 'POLICY';
  return 'MARKETS';
}

function scoreItem(item) {
  let score = 1;
  const text = `${item.headline} ${item.summary || ''}`.toLowerCase();
  if (/\d+\.?\d*\s*mb\/d/.test(text)) score += 2;                         // contains a mb/d figure
  if (['kpler', 'vortexa', 'iea', 'opec'].some(s =>                       // high-signal source
    item.source.toLowerCase().includes(s))) score += 2;
  if (item.published_at && (Date.now() - new Date(item.published_at)) < 6 * 3600000) score += 1;
  if (GROUP_C.some(t => text.includes(t))) score += 1;                    // direct Hormuz mention
  return { ...item, relevance_score: score };
}

function extractMetric(text) {
  const mbdMatch = text.match(/(\d+\.?\d*)\s*mb\/d/i);
  if (mbdMatch) return `${mbdMatch[1]} mb/d`;
  const bblMatch = text.match(/\$(\d+\.?\d*)\/bbl/i);
  if (bblMatch) return `$${bblMatch[1]}/bbl`;
  return null;
}

// ─── RSS fetch ──────────────────────────────────────────────────────────────
async function fetchRSS(source) {
  const parser = new Parser({ timeout: 10000 });
  const feed = await parser.parseURL(source.url);
  return feed.items.slice(0, 30).map(item => ({
    source: source.name,
    source_url: item.link || null,
    headline: (item.title || '').trim(),
    summary: (item.contentSnippet || item.content || '').substring(0, 500).trim(),
    published_at: item.pubDate ? new Date(item.pubDate) : null,
  })).filter(i => i.headline);
}

// ─── HTML scrape fetch ──────────────────────────────────────────────────────
async function fetchHTML(source) {
  const res = await axios.get(source.url, {
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HormuzTracker/1.0)' }
  });
  const $ = cheerio.load(res.data);
  const items = [];
  $(source.itemSelector).each((i, el) => {
    if (i >= 20) return false; // max 20 items per source
    const item = source.extractFn($, el);
    if (item) items.push(item);
  });
  return items;
}

// ─── Deduplication ──────────────────────────────────────────────────────────
async function isDuplicate(item) {
  if (item.source_url) {
    const existing = await db.query(
      'SELECT id FROM intelligence_feed WHERE source_url = $1 LIMIT 1',
      [item.source_url]
    );
    if (existing.rows.length > 0) return true;
  } else {
    // Fuzzy check by headline prefix (first 80 chars)
    const prefix = item.headline.substring(0, 80);
    const existing = await db.query(
      `SELECT id FROM intelligence_feed
       WHERE headline ILIKE $1 AND fetched_at > NOW() - INTERVAL '24 hours' LIMIT 1`,
      [`${prefix}%`]
    );
    if (existing.rows.length > 0) return true;
  }
  return false;
}

// ─── Main cron function ────────────────────────────────────────────────────
async function runIntelligence() {
  console.log('[intelligence] Starting run');
  let totalInserted = 0;

  // RSS sources
  for (const source of RSS_SOURCES) {
    try {
      const items = await fetchRSS(source);
      const relevant = items.filter(isRelevant).map(scoreItem).map(item => ({
        ...item,
        category: categorize(item),
        metric_extracted: extractMetric(`${item.headline} ${item.summary || ''}`),
      }));
      for (const item of relevant) {
        if (!(await isDuplicate(item))) {
          await db.query(`
            INSERT INTO intelligence_feed
              (source, source_url, headline, summary, metric_extracted,
               published_at, category, relevance_score)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `, [item.source, item.source_url, item.headline, item.summary,
              item.metric_extracted, item.published_at, item.category, item.relevance_score]);
          totalInserted++;
        }
      }
      console.log(`[intelligence] ${source.name}: ${relevant.length} relevant, ${items.length} total`);
    } catch (err) {
      console.error(`[intelligence] ${source.name} failed: ${err.message}`);
    }
  }

  // HTML sources
  for (const source of HTML_SOURCES) {
    try {
      const items = await fetchHTML(source);
      const relevant = items.filter(isRelevant).map(scoreItem).map(item => ({
        ...item,
        category: categorize(item),
        metric_extracted: extractMetric(`${item.headline} ${item.summary || ''}`),
      }));
      for (const item of relevant) {
        if (!(await isDuplicate(item))) {
          await db.query(`
            INSERT INTO intelligence_feed
              (source, source_url, headline, summary, metric_extracted,
               published_at, category, relevance_score)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `, [item.source, item.source_url, item.headline, item.summary,
              item.metric_extracted, item.published_at, item.category, item.relevance_score]);
          totalInserted++;
        }
      }
      console.log(`[intelligence] ${source.name}: ${relevant.length} relevant, ${items.length} scraped`);
    } catch (err) {
      console.error(`[intelligence] ${source.name} failed: ${err.message}`);
    }
  }

  console.log(`[intelligence] Run complete. Inserted ${totalInserted} new items.`);
}

module.exports.runIntelligence = runIntelligence;
if (require.main === module) runIntelligence().then(() => process.exit(0));
