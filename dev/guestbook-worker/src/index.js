// Guestbook Worker. KV binding: GUESTBOOK. Secret: ADMIN_TOKEN.
//   GET    /comments      -> JSON array of the last 100 notes
//   POST   /comments      -> {from, link?, comment, website:""}
//   DELETE /comments/:id  -> needs "Authorization: Bearer <ADMIN_TOKEN>"

const KEY = 'comments';
const MAX_STORED = 200;
const MAX_LISTED = 100;
const PER_IP_PER_HOUR = 3;
const PER_DAY = 100;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function json(data, status = 200, extra = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS, ...extra }
    });
}

const clean = (s, max) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

async function readAll(env) {
    return JSON.parse((await env.GUESTBOOK.get(KEY)) || '[]');
}

// Count a hit under `key`. Returns false when the limit is reached.
async function allow(env, key, limit, ttl) {
    const n = parseInt((await env.GUESTBOOK.get(key)) || '0', 10);
    if (n >= limit) return false;
    await env.GUESTBOOK.put(key, String(n + 1), { expirationTtl: ttl });
    return true;
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

        if (url.pathname === '/comments' && request.method === 'GET') {
            const all = await readAll(env);
            return json(all.slice(-MAX_LISTED).reverse(), 200, { 'Cache-Control': 'max-age=60' });
        }

        if (url.pathname === '/comments' && request.method === 'POST') {
            let body;
            try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

            if (body.website) return json({ ok: true });          // honeypot: drop silently

            const from = clean(body.from, 80);
            const comment = clean(body.comment, 400);
            let link = clean(body.link, 200);
            if (!from || !comment) return json({ error: 'from and comment are required' }, 400);
            if (/https?:\/\/|www\./i.test(comment)) return json({ error: 'no URLs in comment; use link' }, 400);
            if (link && !/^https?:\/\/[^\s]+$/i.test(link)) link = '';

            const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
            const day = new Date().toISOString().slice(0, 10);
            if (!(await allow(env, 'rl:' + ip, PER_IP_PER_HOUR, 3600))) return json({ error: 'rate limit' }, 429);
            if (!(await allow(env, 'rl:day:' + day, PER_DAY, 86400))) return json({ error: 'daily limit' }, 429);

            const all = await readAll(env);
            const note = { id: crypto.randomUUID(), ts: new Date().toISOString(), from, comment };
            if (link) note.link = link;
            all.push(note);
            await env.GUESTBOOK.put(KEY, JSON.stringify(all.slice(-MAX_STORED)));
            return json({ ok: true, id: note.id }, 201);
        }

        const del = /^\/comments\/([\w-]+)$/.exec(url.pathname);
        if (del && request.method === 'DELETE') {
            if (!env.ADMIN_TOKEN || request.headers.get('Authorization') !== 'Bearer ' + env.ADMIN_TOKEN) {
                return json({ error: 'unauthorized' }, 401);
            }
            const all = await readAll(env);
            const rest = all.filter((c) => c.id !== del[1]);
            await env.GUESTBOOK.put(KEY, JSON.stringify(rest));
            return json({ ok: true, removed: all.length - rest.length });
        }

        return json({ error: 'not found' }, 404);
    }
};
