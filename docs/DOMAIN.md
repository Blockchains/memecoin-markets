# Pointing memecoin.markets at this site

memecoin.markets is hosted by Grok Build. The queued Build change (15 Oct 2026) reverse-proxies every path except `/desk` (the existing live desk) to `https://blockchains.github.io/memecoin-markets/`.

How the canonical host flips with no repo change: every build fetches `https://memecoin.markets/mm-origin.json`; when it returns `{"repo":"Blockchains/memecoin-markets"}` (i.e. the proxy is live) the build emits `https://memecoin.markets/...` in canonical, OG, JSON-LD, sitemap and llms.txt. Override with the `SITE_URL` repository variable.

Alternative (no proxy): set Pages custom domain to memecoin.markets (adds a `CNAME`), and point the apex A/AAAA records at GitHub Pages. This moves DNS away from Build, so it is not the default.

## Search Console (Ismail must verify)

1. Add a **Domain property** for `memecoin.markets` in Google Search Console and add the TXT record it gives you in the domain's DNS (Build domain settings). Bing Webmaster Tools can import it from Search Console.
2. Before the domain switch you can verify the URL-prefix property `https://blockchains.github.io/memecoin-markets/` with the HTML-tag method: put the tag's `content` value in the repo variable `GSC_VERIFICATION` (Settings → Variables → Actions); the next build adds the meta tag to every page.
3. Submit `https://memecoin.markets/sitemap.xml` (or the Pages one). Note: crawlers only read `robots.txt` at a host root, so the Pages copy only takes effect on the domain.
