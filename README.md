# TorrentExplorer-Website

Static frontend for the torrent explorer - vanilla TypeScript, no framework. Bundled by [Bun](https://bun.com) into a handful of static files that can be dropped onto any static host (Cloudflare Pages, Netlify, GitHub Pages, S3, nginx).

## Build for production

```bash
bun run build
```

Output goes to `./dist`. Upload that folder to your host.

## Configuration

The API URL is read at runtime from `/config.json` so you can change backends without rebuilding:

```json
{
	"apiUrl": "https://api.example.com"
}
```

Edit `public/config.json` during development, or replace `dist/config.json` on your static host in production.

## Deployment to Cloudflare Pages

1. Build: `bun run build`
2. Connect the repo to Cloudflare Pages with these settings:
   - Build command: `bun install && bun run build`
   - Build output directory: `dist`
3. After the first deploy, edit `dist/config.json` or set the API URL in your repo's `public/config.json` before deploying.

## Customization

- **Theme colors** - edit the `:root` CSS variables in `public/styles.css`.
- **Brand** - handled automatically from the backend's `GET /api/info` endpoint, so changing `config.brand.releaseGroup` on the backend is enough.
- **MediaInfo display** - the key lists in `src/views/detail.ts` (`VIDEO_KEYS`, `AUDIO_KEYS`, `TEXT_KEYS`, `GENERAL_KEYS`) control which fields are surfaced in the summary cards.
