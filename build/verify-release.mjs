import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const directory = path.resolve(process.argv[2] ?? "release-assets");
const installer = `Berry-Workout-Island-Setup-${version}.exe`;
const artifacts = [installer, `${installer}.blockmap`, `OH-${version}-arm64.dmg`, `OH-${version}-x64.dmg`, "latest.yml"];
for (const artifact of artifacts) assert.ok((await stat(path.join(directory, artifact))).size > 0, `Empty release asset: ${artifact}`);

const metadata = await readFile(path.join(directory, "latest.yml"), "utf8");
assert.equal(metadata.match(/^version: (.+)$/m)?.[1].trim(), version, "Update version mismatch");
assert.equal(metadata.match(/^path: (.+)$/m)?.[1].trim(), installer, "Update installer path mismatch");
assert.equal(metadata.match(/^\s+- url: (.+)$/m)?.[1].trim(), installer, "Update file URL mismatch");
assert.equal(Number(metadata.match(/^\s+size: (\d+)$/m)?.[1]), (await stat(path.join(directory, installer))).size, "Update installer size mismatch");
const hash = createHash("sha512");
for await (const chunk of createReadStream(path.join(directory, installer))) hash.update(chunk);
const digest = hash.digest("base64");
const hashes = Array.from(metadata.matchAll(/^\s*sha512: (.+)$/gm), (match) => match[1].trim());
assert.equal(hashes.length, 2, "Expected both update hashes");
for (const expected of hashes) assert.equal(digest, expected, "Update installer hash mismatch");
const blockmap = JSON.parse(gunzipSync(await readFile(path.join(directory, `${installer}.blockmap`))));
assert.ok(blockmap.files?.length > 0 && blockmap.files.every((file) => file.checksums?.length > 0 && file.checksums.length === file.sizes?.length), "Invalid differential update blockmap");
console.log(`Verified v${version}: all ${artifacts.length} assets, update paths, size, SHA-512 and differential blockmap`);
