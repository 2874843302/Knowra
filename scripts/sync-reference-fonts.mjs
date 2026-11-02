import { mkdir, readFile, writeFile } from "node:fs/promises";
import postcss from "postcss";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export async function syncReferenceFonts(
  source = "https://static-hk.hyperknow.io/_d/fonts/misans/misans.css",
) {
  const directory = new URL("../public/reference/", import.meta.url);
  const sheet = postcss.parse(
    await readFile(new URL("misans.css", directory), "utf8"),
  );
  const assets = new Map();
  sheet.walkAtRules("font-face", (rule) => {
    const declarations = Object.fromEntries(
      rule.nodes.map((node) => [node.prop, node.value]),
    );
    if (declarations["font-family"] === '"MiSans Demibold"') {
      rule.nodes.find((node) => node.prop === "font-family").value = '"MiSans"';
      rule.nodes.find((node) => node.prop === "font-weight").value = "600";
    }
    const relative = /url\("([^"]+)"\)/.exec(declarations.src)?.[1];
    if (relative) assets.set(relative, new URL(relative, source));
  });
  let downloaded = 0;
  for (let offset = 0; offset < assets.size; offset += 8) {
    for (const result of await Promise.allSettled(
      [...assets].slice(offset, offset + 8).map(async ([relative, url]) => {
        const path = new URL(relative, directory);
        try {
          const existing = await readFile(path);
          if (existing.subarray(0, 4).toString() === "wOF2") return;
        } catch {}
        const response = await fetch(url, {
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok)
          throw new Error(`${relative}: HTTP ${response.status}`);
        const data = Buffer.from(await response.arrayBuffer());
        if (data.subarray(0, 4).toString() !== "wOF2")
          throw new Error(`${relative}: invalid WOFF2 response`);
        await mkdir(new URL("./", path), { recursive: true });
        await writeFile(path, data);
        downloaded++;
      }),
    )) {
      if (result.status === "rejected") throw result.reason;
    }
    if (offset % 64 === 0)
      console.log(
        `Verified ${Math.min(offset + 8, assets.size)}/${assets.size} font subsets`,
      );
  }
  await writeFile(new URL("misans.css", directory), sheet.toString());
  console.log(
    `Verified ${assets.size} subsets; downloaded ${downloaded}. MiSans weights: 400, 600, 700.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await syncReferenceFonts();
