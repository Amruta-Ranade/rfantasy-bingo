// ─────────────────────────────────────────────────────────────────────────────
// DEPLOYMENT NOTE
// This file is the source of truth for the Cloudflare Worker.
// After editing: copy-paste the entire file into the Cloudflare Worker editor
// (https://dash.cloudflare.com → Workers → rfantasy-bingo-proxy → Edit code)
// and click Deploy. There is no automated deploy — keep this file in sync.
// ─────────────────────────────────────────────────────────────────────────────

// Allowed origins. Add custom domains here if you ever move off GitHub Pages.
const ALLOWED_ORIGINS = [
  'https://amruta-ranade.github.io',
];

const ALLOWED_COVER_HOSTS = ['books.google.com', 'covers.openlibrary.org'];

// A book known to have no real GB cover. We fetch its zoom=0 once to learn
// the SHA-256 of GB's "Image not available" placeholder image and use that
// hash to detect placeholders for any future cover request.
const PLACEHOLDER_ID = 'OYqn0QEACAAJ';

// Safety: if the fingerprint book ever gets a real cover, the fetched image
// will be larger than this threshold and we disable placeholder detection
// rather than silently treating a real cover's hash as the placeholder.
const PLACEHOLDER_MAX_BYTES = 15000;

let placeholderZ0 = null;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = pickAllowedOrigin(request);
    if (request.method === 'OPTIONS') return corsHeaders(null, 204, 'text/plain', 0, origin);
    if (request.method !== 'GET') return corsHeaders('Method not allowed', 405, 'text/plain', 0, origin);
    if (url.pathname === '/search') return handleSearch(url, env, origin);
    if (url.pathname === '/cover')  return handleCover(url, origin);
    return corsHeaders('Not found', 404, 'text/plain', 0, origin);
  }
};

function pickAllowedOrigin(request) {
  const origin = request.headers.get('Origin');
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

async function handleSearch(url, env, origin) {
  const q = url.searchParams.get('q');
  const n = Math.min(parseInt(url.searchParams.get('n') || '8'), 20);
  if (!q) return corsHeaders('Missing q', 400, 'text/plain', 0, origin);
  try {
    const resp = await fetch(
      `https://www.googleapis.com/books/v1/volumes?key=${env.GB_KEY}&q=${encodeURIComponent(q + ' subject:fiction')}&maxResults=${n}&printType=books`
    );
    const data = await resp.json();
    const hasResults = Array.isArray(data.items) && data.items.length > 0;
    return corsHeaders(JSON.stringify(data), 200, 'application/json', hasResults ? 3600 : 0, origin);
  } catch {
    return corsHeaders('Search failed', 502, 'text/plain', 0, origin);
  }
}

async function hashBuf(buf) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getPlaceholderZ0() {
  if (placeholderZ0 !== null) return placeholderZ0;
  const url = `https://books.google.com/books/content?id=${PLACEHOLDER_ID}&printsec=frontcover&img=1&zoom=0&source=gbs_api`;
  try {
    const r = await fetch(url);
    if (!r.ok) { placeholderZ0 = false; return false; }
    const buf = await r.arrayBuffer();
    // Safety net: if the fingerprint image is unusually large, it's probably
    // a real cover now — disable detection rather than corrupt every lookup.
    if (buf.byteLength > PLACEHOLDER_MAX_BYTES) {
      console.warn(`PLACEHOLDER_ID ${PLACEHOLDER_ID} returned ${buf.byteLength} bytes; expected a small placeholder. Disabling detection.`);
      placeholderZ0 = false;
      return false;
    }
    placeholderZ0 = { hash: await hashBuf(buf), len: buf.byteLength };
    return placeholderZ0;
  } catch { placeholderZ0 = false; return false; }
}

async function isMatch(buf, expected) {
  if (buf.byteLength !== expected.len) return false;
  return (await hashBuf(buf)) === expected.hash;
}

async function handleCover(url, origin) {
  const coverUrl = url.searchParams.get('url');
  if (!coverUrl) return corsHeaders('Missing url', 400, 'text/plain', 0, origin);
  let parsed;
  try { parsed = new URL(coverUrl); } catch { return corsHeaders('Invalid url', 400, 'text/plain', 0, origin); }
  if (!ALLOWED_COVER_HOSTS.includes(parsed.hostname)) return corsHeaders('Forbidden', 403, 'text/plain', 0, origin);

  if (parsed.hostname !== 'books.google.com') {
    try {
      const r = await fetch(coverUrl);
      if (!r.ok) return corsHeaders('Cover fetch failed', 502, 'text/plain', 0, origin);
      return new Response(r.body, { status: 200, headers: {
        'Access-Control-Allow-Origin': origin,
        'Content-Type': r.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      }});
    } catch { return corsHeaders('Cover fetch failed', 502, 'text/plain', 0, origin); }
  }

  const zoom0 = coverUrl.replace(/zoom=\d/, 'zoom=0');
  const zoom1 = coverUrl.replace(/zoom=\d/, 'zoom=1');

  try {
    const [r0, r1, ph] = await Promise.all([fetch(zoom0), fetch(zoom1), getPlaceholderZ0()]);
    const b0 = r0.ok ? await r0.arrayBuffer() : null;

    if (b0 && (!ph || !(await isMatch(b0, ph)))) {
      return imageResp(b0, r0.headers.get('Content-Type'), origin);
    }
    if (r1.ok) {
      const b1 = await r1.arrayBuffer();
      return imageResp(b1, r1.headers.get('Content-Type'), origin);
    }
    return corsHeaders('Cover fetch failed', 502, 'text/plain', 0, origin);
  } catch { return corsHeaders('Cover fetch failed', 502, 'text/plain', 0, origin); }
}

function imageResp(buf, contentType, origin) {
  return new Response(buf, { status: 200, headers: {
    'Access-Control-Allow-Origin': origin,
    'Content-Type': contentType || 'image/jpeg',
    'Cache-Control': 'public, max-age=86400',
  }});
}

function corsHeaders(body, status, contentType = 'text/plain', maxAge = 0, origin = ALLOWED_ORIGINS[0]) {
  const h = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Content-Type': contentType,
  };
  if (maxAge) h['Cache-Control'] = `public, max-age=${maxAge}`;
  return new Response(body, { status, headers: h });
}
