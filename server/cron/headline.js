const db = require('../db');

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const MIN_REGENERATION_HOURS = 6;
const MIN_RELEVANCE_SCORE = 4;

const SYSTEM_PROMPT = `You are a concise crisis analyst for the Hormuz Strait closure.
Summarize the most significant developments in 1-2 sentences (max 280 characters).

Priority order when multiple stories compete:
1. Military/safety: attacks on facilities, military escalation, new closures
2. Supply impact: production outages, throughput changes, facility status
3. Market/policy: price-moving events, SPR releases, OPEC decisions

Focus on: whether ships are transiting, facility attacks/outages, production changes.
Be factual and specific. No speculation. No hedging language.`;

async function maybeGenerateHeadline() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return; // Silently skip — headline feature is optional
  }

  try {
    // Check rate limit: skip if last headline was generated less than 6 hours ago
    const lastHeadline = await db.query(
      'SELECT generated_at FROM daily_headlines ORDER BY generated_at DESC LIMIT 1'
    );
    if (lastHeadline.rows.length > 0) {
      const hoursSince = (Date.now() - new Date(lastHeadline.rows[0].generated_at).getTime()) / (1000 * 60 * 60);
      if (hoursSince < MIN_REGENERATION_HOURS) {
        console.log(`[headline] Last headline was ${hoursSince.toFixed(1)}h ago, skipping (min ${MIN_REGENERATION_HOURS}h)`);
        return;
      }
    }

    // Check if any new high-relevance articles exist since last headline
    const lastGenerated = lastHeadline.rows[0]?.generated_at || '2000-01-01';
    const newHighScore = await db.query(
      `SELECT COUNT(*) as cnt FROM intelligence_feed
       WHERE relevance_score >= $1 AND fetched_at > $2`,
      [MIN_RELEVANCE_SCORE, lastGenerated]
    );
    if (parseInt(newHighScore.rows[0].cnt) === 0) {
      console.log('[headline] No new high-relevance articles, skipping');
      return;
    }

    // Fetch top 10 articles — prefer last 24h, fall back to last 7 days
    let articles = await db.query(
      `SELECT id, headline, source, summary, relevance_score, category
       FROM intelligence_feed
       WHERE fetched_at > NOW() - INTERVAL '24 hours'
         AND is_duplicate = false
       ORDER BY relevance_score DESC, fetched_at DESC
       LIMIT 10`
    );

    if (articles.rows.length === 0) {
      console.log('[headline] No 24h articles, expanding to 7 days');
      articles = await db.query(
        `SELECT id, headline, source, summary, relevance_score, category
         FROM intelligence_feed
         WHERE fetched_at > NOW() - INTERVAL '7 days'
           AND is_duplicate = false
         ORDER BY relevance_score DESC, fetched_at DESC
         LIMIT 10`
      );
    }

    if (articles.rows.length === 0) {
      console.log('[headline] No recent articles to summarize');
      return;
    }

    // Format articles for the prompt
    const articleText = articles.rows.map(a =>
      `[${a.relevance_score}] ${a.source} — ${a.headline}${a.summary ? ': ' + a.summary.substring(0, 200) : ''}`
    ).join('\n');

    const articleIds = articles.rows.map(a => a.id);

    // Call Claude Haiku
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();

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
      console.log('[headline] Empty response from Claude, skipping');
      return;
    }

    // Store headline
    await db.query(
      `INSERT INTO daily_headlines (headline, source_article_ids, model_used)
       VALUES ($1, $2, $3)`,
      [headlineText, articleIds, HAIKU_MODEL]
    );

    console.log(`[headline] Generated: "${headlineText.substring(0, 80)}..."`);
  } catch (err) {
    console.error('[headline] Generation failed:', err.message);
    // Never throw — don't crash the intelligence cron
  }
}

module.exports = { maybeGenerateHeadline };
