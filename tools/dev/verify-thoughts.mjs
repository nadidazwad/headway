// Fetches the source of every thought in src/thoughts/said.json and checks the Bangla stands there word for word.
// usage: verify-thoughts.mjs   Exits 1 if any line is missing. Pages are cached under the system temp folder.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const said = JSON.parse(readFileSync(new URL("../../src/thoughts/said.json", import.meta.url)));
const cache = join(tmpdir(), "metro-thought-sources");
mkdirSync(cache, { recursive: true });
const clean = (s) => s.normalize("NFC").replace(/[‌‍]/g, "").replace(/\s+/g, " ");
const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&nbsp;/g, " ");
async function page(url) {
  const file = join(cache, createHash("sha1").update(url).digest("hex"));
  if (existsSync(file)) return readFileSync(file, "utf8");
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = clean(decode(await res.text()));
  writeFileSync(file, text);
  return text;
}
let missing = 0;
for (const line of said) {
  try {
    if (!(await page(line.source)).includes(clean(line.bn))) {
      missing++;
      console.log("NOT FOUND", line.bn, line.source);
    }
  } catch (error) {
    missing++;
    console.log("UNREACHABLE", error.message);
  }
}
const sources = new Set(said.map((line) => line.source)).size;
console.log(`${said.length} lines from ${sources} sources: ${said.length - missing} verbatim, ${missing} not.`);
process.exit(missing ? 1 : 0);
