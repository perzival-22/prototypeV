# Vinyl — Spotify Now Playing

A record player interface that mirrors whatever is currently playing on your
Spotify account: the album art becomes the vinyl label, and the disc spins
while the track plays.

## Setup

### 1. Create the Spotify app

Go to <https://developer.spotify.com/dashboard>, create an app, then open
**Settings**. Under **Redirect URIs** add both of these:

```
http://localhost:3000/api/auth/callback/spotify
https://<your-project>.vercel.app/api/auth/callback/spotify
```

Spotify matches redirect URIs character for character — no trailing slash, and
`https` for the deployed URL.

Copy the **Client ID** (32 hex characters) and **Client Secret**.

### 2. Local environment

Copy `.env.example` to `.env.local` and fill in every value:

```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32>
SPOTIFY_CLIENT_ID=<32 hex chars from the dashboard>
SPOTIFY_CLIENT_SECRET=<from the dashboard>
```

Restart `next dev` after editing — env vars are only read at server start.

### 3. Vercel

Add the same four variables under **Project → Settings → Environment
Variables**, with `NEXTAUTH_URL` set to your real deployment URL:

```
NEXTAUTH_URL=https://<your-project>.vercel.app
```

Then **redeploy** — Vercel bakes environment variables in at build time, so
existing deployments will not pick them up.

Because `NEXTAUTH_URL` and the Spotify redirect URI must both match the URL you
actually visit, sign-in only works on your stable production domain. Preview
deployments get a new URL per commit, so they will fail auth unless you add
that specific URL to the Spotify dashboard too.

## Development

```bash
npm run dev
```

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `INVALID_CLIENT: Invalid client` | `SPOTIFY_CLIENT_ID` is wrong, still a placeholder, or the dev server was not restarted |
| `INVALID_CLIENT: Invalid redirect URI` | The callback URL is not registered in the Spotify dashboard, or `NEXTAUTH_URL` does not match the URL in the browser |
| JSON error listing missing vars at `/api/auth/...` | The env guard fired — one of the four variables is unset or still a placeholder |
| "Nothing playing" | Spotify reports no active playback; start a track in any Spotify client |
