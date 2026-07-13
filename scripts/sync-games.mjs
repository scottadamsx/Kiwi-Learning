/*
 * Vendors the Kiwi Games arcade into Kiwi Learning.
 *
 * Kiwi Games (~/Documents/GitHub/kiwiGames) already builds every game to a
 * self-contained HTML page. We copy those pages + their shared assets into
 * public/kiwi-games/, strip the chrome that only makes sense in the arcade
 * (the "Claim Seeds" earn buttons, the auth config, the "← All games" back
 * link), and emit a manifest the app reads to pick and label games.
 *
 * Re-run with:  npm run sync:games
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "os";

const SOURCE = process.env.KIWI_GAMES_DIR || path.join(os.homedir(), "Documents/GitHub/kiwiGames");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "kiwi-games");

if (!existsSync(path.join(SOURCE, "g"))) {
  console.error(`Kiwi Games not found at ${SOURCE}. Set KIWI_GAMES_DIR.`);
  process.exit(1);
}

// Injected into every page: remove arcade-only chrome, and let the host page
// know when a game reports a score (so Kiwi Learning can cheer).
const PATCH = `
<style id="kiwi-learning-patch">
  /* Arcade-only chrome: earn/claim buttons and the back-to-gallery link. */
  .k-earnbtn, #done, a[href*="index.html"] { display: none !important; }
  body { background: transparent !important; }
  /* Tighten padding so the game fits a compact embed. */
  .wrap { padding: 10px !important; }
</style>
<script>
  // Neutralize the arcade's earn/auth layer — Kiwi Learning games are just for fun.
  window.KiwiAuth = window.KiwiAuth || {};
  window.KIWI_AUTH_CONFIG = window.KIWI_AUTH_CONFIG || { disabled: true };
</script>
`;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "g"), { recursive: true });

// Shared assets (fonts, css) — the pages reference them as ../assets/*.
cpSync(path.join(SOURCE, "assets"), path.join(OUT, "assets"), { recursive: true });
// The pages load this; ship a no-op so the request doesn't 404.
writeFileSync(
  path.join(OUT, "assets", "kiwi-auth-config.js"),
  "window.KIWI_AUTH_CONFIG = { disabled: true };\n"
);

const pages = readdirSync(path.join(SOURCE, "g")).filter((f) => f.endsWith(".html"));
const games = [];

for (const file of pages) {
  let html = readFileSync(path.join(SOURCE, "g", file), "utf-8");

  const title =
    html.match(/<div class="k-title"[^>]*>([^<]+)</)?.[1]?.trim() ||
    html.match(/<title>([^<]+)</)?.[1]?.replace(/\s*[—·|].*$/, "").trim() ||
    file.replace(".html", "");
  // The arcade's rule line advertises Seeds/earning; strip that for the study app.
  const rule = (html.match(/<div class="k-sub"[^>]*>([^<]+)</)?.[1] ?? "")
    .replace(/\s*[·—-]\s*earn.*$/i, "")
    .replace(/\s*—?\s*the (higher|more|longer|further)[^—·]*earn[^—·]*/i, "")
    .replace(/\s*\(?\d+\+?\s*to claim\)?/i, "")
    .replace(/\s*[·—-]\s*$/, "")
    .trim();

  // Inject the patch right before </head> (falls back to prepending).
  html = html.includes("</head>")
    ? html.replace("</head>", `${PATCH}</head>`)
    : PATCH + html;

  writeFileSync(path.join(OUT, "g", file), html);
  games.push({ id: file.replace(".html", ""), title, rule });
}

games.sort((a, b) => a.title.localeCompare(b.title));
writeFileSync(
  path.join(ROOT, "lib", "games-manifest.json"),
  JSON.stringify(games, null, 2) + "\n"
);

console.log(`Vendored ${games.length} Kiwi Games → public/kiwi-games/g/`);
console.log(`Manifest → lib/games-manifest.json`);
