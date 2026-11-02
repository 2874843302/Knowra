import { mkdir, writeFile, readFile } from "node:fs/promises";
import { syncReferenceFonts } from "./sync-reference-fonts.mjs";

const root = new URL("../public/reference/", import.meta.url);
await mkdir(root, { recursive: true });
const assets = {
  "home.svg": "https://agent.hyperknow.io/components/sidebar/home.svg?v=2",
  "courses.svg":
    "https://agent.hyperknow.io/components/sidebar/courses.svg?v=1",
  "feed.svg":
    "https://agent.hyperknow.io/components/sidebar/learning-feed.svg?v=2",
  "history.svg":
    "https://agent.hyperknow.io/components/sidebar/history.svg?v=2",
  "market.svg":
    "https://agent.hyperknow.io/pages/mainPages/home/craft-courses-tab/market-place.svg",
  "collapse.svg":
    "https://agent.hyperknow.io/components/sidebar/sidebar-collapse.svg",
  "avatar.svg": "https://agent.hyperknow.io/avatar/1.svg",
  "sociology.png":
    "https://api-hk.hyperknow.io/api/v1/marketplace/cover/091d5945-4f34-4bfc-9d3b-c34b76d62ee5/cover_wide.png?v=1787315002",
  "biology.png":
    "https://api-hk.hyperknow.io/api/v1/marketplace/cover/15f85274-21e3-4a49-880d-c00bed342c5c/cover_wide-419478fe35.png?v=1789634072",
  "machine-learning.png":
    "https://api-hk.hyperknow.io/api/v1/marketplace/cover/1d4735cf-c52e-49d8-89a1-86d91b184c98/cover_wide.png?v=1787314561",
  "ai.png":
    "https://api-hk.hyperknow.io/api/v1/marketplace/cover/e76d14d2-dc70-47e7-a976-490b0f31497a/cover_wide-75b29affed.png?v=1789526088",
  "python.png":
    "https://api-hk.hyperknow.io/api/v1/marketplace/cover/b7576abf-07e1-4c40-b682-52a4e3b446c6/cover_wide.png?v=1787312498",
  "math.png":
    "https://api-hk.hyperknow.io/api/v1/marketplace/cover/49e290b1-2376-4f32-8c28-ef8567cd3f61/cover_wide.png?v=1787312498",
  "cognitive.png":
    "https://api-hk.hyperknow.io/api/v1/marketplace/cover/2f2b0715-6318-4205-ae35-fac328658dcc/cover_wide.png?v=1787314429",
};
for (const [name, url] of Object.entries(assets)) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  await writeFile(
    new URL(name, root),
    Buffer.from(await response.arrayBuffer()),
  );
  console.log(name);
}
const fontSheets = [
  "https://static-hk.hyperknow.io/_d/font/Satoshi_Complete/Fonts/WEB/css/satoshi.css",
  "https://static-hk.hyperknow.io/_d/font/EB_Garamond/eb-garamond.css",
  "https://static-hk.hyperknow.io/_d/fonts/misans/misans.css",
  "https://static-hk.hyperknow.io/_d/font/ChillDuanHeiSong/chill-duanhei-song.css",
];
for (const url of fontSheets) {
  const css = await (await fetch(url)).text();
  await writeFile(new URL(url.split("/").at(-1), root), css);
}
for (const [name, url] of Object.entries({
  "Satoshi-Variable.woff2":
    "https://static-hk.hyperknow.io/_d/font/Satoshi_Complete/Fonts/WEB/fonts/Satoshi-Variable.woff2",
  "ChillDuanHeiSong-Light.woff2":
    "https://static-hk.hyperknow.io/_d/font/ChillDuanHeiSong/ChillDuanHeiSong-Light.woff2",
  "eb-garamond-600-latin.woff2":
    "https://static-hk.hyperknow.io/_d/font/EB_Garamond/eb-garamond-600-latin.woff2",
})) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  await writeFile(
    new URL(name, root),
    Buffer.from(await response.arrayBuffer()),
  );
}
await syncReferenceFonts(fontSheets[2]);
const target = process.argv[2];
if (target) {
  for (const [selector, name] of [
    [".horizontal-course-ticket-mask-svg", "horizontal-ticket.svg"],
    [".course-ticket-mask-svg", "vertical-ticket.svg"],
  ]) {
    const exported = await fetch(
      `http://127.0.0.1:3456/eval?target=${encodeURIComponent(target)}`,
      {
        method: "POST",
        body: `(() => { const source = document.querySelector(${JSON.stringify(selector)}); if (!source) return null; const svg = source.cloneNode(true); svg.querySelectorAll('image').forEach(image => image.remove()); return svg.outerHTML; })()`,
      },
    ).then((response) => response.json());
    if (exported.value) await writeFile(new URL(name, root), exported.value);
  }
}
await writeFile(
  new URL("sources.json", root),
  JSON.stringify(
    {
      ...JSON.parse(
        await readFile(new URL("sources.json", root), "utf8").catch(() => "{}"),
      ),
      assets,
      fontSheets,
    },
    null,
    2,
  ),
);
