// One-off script: force-generates a headline from current top articles,
// bypassing the rate limit and new-article-score guards in headline.js.
require('dotenv').config({ override: true });
const db = require('../db');

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are a concise crisis analyst for the Hormuz Strait closure.
Summarize the most significant developments in 1-2 sentences (max 280 characters).

Priority order when multiple stories compete:
1. Military/safety: attacks on facilities, military escalation, new closures
2. Supply impact: production outages, throughput changes, facility status
3. Market/policy: price-moving events, SPR releases, OPEC decisions

Focus on: whether ships are transiting, facility attacks/outages, production changes.
Be factual and specific. No speculation. No hedging language.`;

(async () => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('[force-headline] ANTHROPIC_API_KEY not set');
      process.exit(1);
    }

    // Fetch top 10 articles from last 24 hours (ignore score gate)
    const articles = await db.query(
      `SELECT id, headline, source, summary, relevance_score
       FROM intelligence_feed
       WHERE fetched_at > NOW() - INTERVAL '24 hours'
         AND is_duplicate = false
       ORDER BY relevance_score DESC, fetched_at DESC
       LIMIT 10`
    );

    if (articles.rows.length === 0) {
      // Fall back to last 7 days if no 24h articles
      console.log('[force-headline] No 24h articles, expanding to 7 days');
      const fallback = await db.query(
        `SELECT id, headline, source, summary, relevance_score
         FROM intelligence_feed
         WHERE fetched_at > NOW() - INTERVAL '7 days'
           AND is_duplicate = false
         ORDER BY relevance_score DESC, fetched_at DESC
         LIMIT 10`
      );
      articles.rows = fallback.rows;
    }

    if (articles.rows.length === 0) {
      console.error('[force-headline] No articles available at all');
      process.exit(1);
    }

    console.log(`[force-headline] Using ${articles.rows.length} articles`);

    const articleText = articles.rows.map(a =>
      `[${a.relevance_score}] ${a.source} — ${a.headline}${a.summary ? ': ' + a.summary.substring(0, 200) : ''}`
    ).join('\n');

    const articleIds = articles.rows.map(a => a.id);

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

    console.log('[force-headline] Calling Claude Haiku...');
    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 150,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Articles (last 24 hours, ranked by significance):\n${articleText}`
      }],
    });

    const headlineText = response.content[0]?.text?.trim();
    if (!headlineText) {
      console.error('[force-headline] Empty response');
      process.exit(1);
    }

    await db.query(
      `INSERT INTO daily_headlines (headline, source_article_ids, model_used)
       VALUES ($1, $2, $3)`,
      [headlineText, articleIds, HAIKU_MODEL]
    );

    console.log(`[force-headline] Inserted: "${headlineText}"`);
    process.exit(0);
  } catch (err) {
    console.error('[force-headline] Failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
