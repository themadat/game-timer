# BoardGameGeek connection

Library’s **BGG info** and the game dialogs’ **Get BGG info** replace manual copying with XML API2 search and fetch. Enter a BGG ID/page link and fetch, or search a title and choose a result. Review the current and BGG values, then apply only the checked fields. New-game forms are filled for review before saving. Applying in an existing game’s editor saves the checked fields using the editor’s normal autosave behavior. Manual paste remains inside an optional disclosure.

Imports cover the primary/alternative names, year, BGG ID/rating, player/time limits, weight, mechanisms, expansions, and player-count recommendations. The largest vote wins for each fixed player count; ties stay neutral and open-ended counts are skipped. Missing/unrated values leave existing fields intact. Explicit empty mechanism/expansion lists can clear those lists if checked. Alternative names start unchecked. Game Timer’s Main/Additional Types, owners, personal ratings, notes, colors and history are preserved.

## Hosted app

GitHub Pages serves static files and cannot protect an application token. The included Cloudflare Worker makes the BGG requests and holds the token in its secret store. No credentials belong in `config.js`, the browser connection URL, Git, backups or GitHub Sync.

1. Create a Cloudflare Worker using `services/bgg/worker.mjs` as its module source. Alternatively, from `services/bgg`, deploy with the Cloudflare Wrangler CLI and the included `wrangler.toml`.
2. Set `BGG_TOKEN` as an encrypted secret in the Worker's settings (or use `wrangler secret put BGG_TOKEN`).
3. Set `ALLOWED_ORIGIN` to the app’s exact origin, without a path or trailing slash. The included configuration uses `https://themadat.github.io`; separate additional origins with commas. An origin restriction limits browser access; it is not user authentication.
4. Deploy the Worker, then enter its HTTPS URL under **BGG connection** in the import dialog. This saves the URL only on the current device. To supply a default for everyone, set `bgg.apiUrl` in `assets/js/config.js` to that public URL.

The proxy only supports game search and single-game metadata, and cannot forward arbitrary URLs. Successful searches cache for one hour; game details cache for 24 hours. Requests are coalesced and spaced five seconds apart within each running Worker instance; this is a best-effort limit, not a global quota across instances. Keep the service for this app and monitor BGG usage if traffic grows. Failed/queued responses are never cached; the app shows retry instructions.

## Local app

Node 20 or newer can run the app and service together without installing packages. In a terminal at the repository root, read the token without putting it in shell history:

```sh
read -s "BGG_TOKEN?BGG token: "; echo
export BGG_TOKEN
node services/bgg/local.mjs
unset BGG_TOKEN
```

Open `http://127.0.0.1:8080` and set **BGG service URL** to `http://127.0.0.1:8080/api/bgg`. Stop the server with Control-C. The token stays in that terminal/server environment; it is never written to app files. `PORT` can override 8080. The local server binds only to the loopback interface and serves only the public app files and this guide.

The app continues to work offline with saved data; new BGG searches/fetches require a connection. Closing the import dialog, canceling, or changing the target/ID cancels the browser request and prevents late results from changing the preview. Fetching alone never saves metadata.

API reference: [Using the XML API](https://boardgamegeek.com/using_the_xml_api), [XML API2](https://boardgamegeek.com/wiki/page/BGG_XML_API2).
