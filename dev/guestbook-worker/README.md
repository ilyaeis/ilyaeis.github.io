# Guestbook Worker

Optional Cloudflare Worker for the guestbook on `resume.html`. Until you deploy it, the page uses GitHub Issues (label `guestbook`). The site does not use this folder.

## API

- `GET /comments` returns the last 100 notes as JSON.
- `POST /comments` with JSON `{from, link?, comment, website: ""}`. `website` is a honeypot. Limits: 3 posts per hour per IP, 100 per day, no URLs in `comment`.
- `DELETE /comments/:id` with `Authorization: Bearer <ADMIN_TOKEN>` removes a note.

## Setup (about 15 minutes, free plan)

1. Create a Cloudflare account (free plan).
2. `npm i -g wrangler`, then `wrangler login`.
3. In this folder: `wrangler kv namespace create GUESTBOOK`. Paste the printed `id` into `wrangler.toml`.
4. `wrangler secret put ADMIN_TOKEN` and enter a long random string.
5. `wrangler deploy`. Copy the `https://guestbook.<account>.workers.dev` URL.
6. Set `WORKER_URL` in the script at the bottom of `resume.html` to that URL (no trailing slash).
7. Update the guestbook lines in `llms.txt` to point to the new API.

## Test

```bash
curl -X POST $WORKER/comments -H 'Content-Type: application/json' -d '{"from":"test","comment":"hi","website":""}'
curl $WORKER/comments
```

The 4th post within an hour from one IP returns 429.
