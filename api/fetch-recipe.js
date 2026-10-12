// Minimal server-side fetch forwarder. The browser can't fetch arbitrary third-party
// recipe pages directly (CORS), and free public CORS proxies proved too unreliable in
// practice (rate-limited, down, or quietly switched to requiring a paid key). This
// replaces them: it runs under our own Vercel project, needs no API key or secret of
// any kind, and just forwards the HTML back to the app for parsing. The app still does
// all the actual recipe extraction (JSON-LD / heuristic parsing) client-side in parser.js.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const target = req.query.url;
  if (!target || typeof target !== 'string') {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch (e) {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    res.status(400).json({ error: 'URL must be http or https' });
    return;
  }

  // Basic SSRF guard — this endpoint is meant for fetching public recipe pages only.
  const host = parsed.hostname.toLowerCase();
  const isPrivate = host === 'localhost' || host === '127.0.0.1' || host === '::1' ||
    /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith('.local');
  if (isPrivate) {
    res.status(400).json({ error: 'URL not allowed' });
    return;
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        // A normal browser UA — some sites serve a stripped-down/blocked response to
        // requests that look like generic bots or have no UA at all.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000)
    });
    const text = await upstream.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    // Defensive cap — recipe pages are small; this just guards against something unexpected.
    res.status(200).send(text.slice(0, 3000000));
  } catch (e) {
    res.status(502).json({ error: 'Fetch failed', detail: String((e && e.message) || e) });
  }
};
