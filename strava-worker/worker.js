// Cloudflare Worker that holds the shared Strava app's client secret and
// performs OAuth token exchange + refresh on behalf of the static app.
// The browser never sees the secret; users just click "Connect Strava".
//
//   POST /exchange  { code, redirect_uri }  -> { access_token, refresh_token, expires_at }
//   POST /refresh   { refresh_token }       -> { access_token, refresh_token, expires_at }
//
// Config: STRAVA_CLIENT_ID and ALLOWED_ORIGINS in wrangler.toml [vars];
// STRAVA_CLIENT_SECRET via `npx wrangler secret put STRAVA_CLIENT_SECRET`.

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';
        const allowed = (env.ALLOWED_ORIGINS || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        const originAllowed =
            allowed.includes(origin) ||
            /^http:\/\/localhost(:\d+)?$/.test(origin) ||
            /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
        const corsHeaders = {
            'Access-Control-Allow-Origin': originAllowed ? origin : (allowed[0] || ''),
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Vary': 'Origin'
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }
        if (request.method !== 'POST') {
            return json({ message: 'POST only' }, 405, corsHeaders);
        }
        if (!originAllowed) {
            return json({ message: `Origin not allowed: ${origin}` }, 403, corsHeaders);
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return json({ message: 'Invalid JSON body' }, 400, corsHeaders);
        }

        const path = new URL(request.url).pathname;
        let grantParams;
        if (path === '/exchange') {
            if (!body.code) return json({ message: 'Missing code' }, 400, corsHeaders);
            grantParams = {
                grant_type: 'authorization_code',
                code: body.code,
                redirect_uri: body.redirect_uri || ''
            };
        } else if (path === '/refresh') {
            if (!body.refresh_token) return json({ message: 'Missing refresh_token' }, 400, corsHeaders);
            grantParams = {
                grant_type: 'refresh_token',
                refresh_token: body.refresh_token
            };
        } else {
            return json({ message: 'Not found' }, 404, corsHeaders);
        }

        const form = new URLSearchParams({
            client_id: env.STRAVA_CLIENT_ID,
            client_secret: env.STRAVA_CLIENT_SECRET,
            ...grantParams
        });
        const stravaResp = await fetch(STRAVA_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString()
        });
        const data = await stravaResp.json().catch(() => ({}));
        if (!stravaResp.ok) {
            return json(
                { message: data.message || `Strava error ${stravaResp.status}` },
                stravaResp.status,
                corsHeaders
            );
        }

        // Return only what the app needs — never echo credentials.
        return json(
            {
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_at: data.expires_at
            },
            200,
            corsHeaders
        );
    }
};

function json(obj, status, headers) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers }
    });
}
