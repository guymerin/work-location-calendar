# Strava token worker

A tiny Cloudflare Worker that holds the shared Strava app's **client secret** and does
OAuth token exchange + refresh for the calendar app. With this deployed, users never
need their own Strava API application — they just click **Connect Strava** and log in.

## One-time setup

1. **Create the shared Strava API app** (you, once — not your users):
   - Go to https://www.strava.com/settings/api and create an application.
   - Set **Authorization Callback Domain** to `guymerin.github.io` (domain only, no path/protocol).
   - Note the **Client ID** (public) and **Client Secret** (stays in the worker).
   - Note: new Strava apps start with a capacity of **1 connected athlete**. To let other
     users connect, request more capacity via Strava's rate-limit/capacity form
     (linked from the API settings page).

2. **Deploy the worker** (free Cloudflare account):
   ```sh
   cd strava-worker
   # Put your Client ID in wrangler.toml (STRAVA_CLIENT_ID), then:
   npx wrangler login
   npx wrangler secret put STRAVA_CLIENT_SECRET   # paste the client secret
   npx wrangler deploy
   ```
   The deploy prints your worker URL, e.g. `https://strava-token.<your-subdomain>.workers.dev`.

3. **Point the app at it** — in `config.js`:
   ```js
   window.stravaConfig = {
       clientId: "123456",                                        // from step 1
       tokenEndpoint: "https://strava-token.<subdomain>.workers.dev"  // from step 2
   };
   ```

## Endpoints

| Route | Body | Returns |
|---|---|---|
| `POST /exchange` | `{ code, redirect_uri }` | `{ access_token, refresh_token, expires_at }` |
| `POST /refresh` | `{ refresh_token }` | `{ access_token, refresh_token, expires_at }` |

CORS is restricted to `ALLOWED_ORIGINS` (in `wrangler.toml`) plus localhost for development.

## Smoke test

```sh
curl -s -X POST https://<worker-url>/refresh \
  -H 'Origin: https://guymerin.github.io' -H 'Content-Type: application/json' \
  -d '{"refresh_token":"bogus"}'
# Expect a 400/401 JSON error from Strava (proves the worker + secret are wired up)
```
