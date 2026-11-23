import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import test from "node:test";

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const verifier = fileURLToPath(new URL("../build/verify-release.mjs", import.meta.url));

test("release verification rejects incomplete or altered update assets before publication", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "oh-release-verification-"));
  const installer = `Berry-Workout-Island-Setup-${version}.exe`;
  const executable = Buffer.from("OH installer verification fixture");
  const sha512 = createHash("sha512").update(executable).digest("base64");
  const files = {
    [installer]: executable,
    [`${installer}.blockmap`]: gzipSync(JSON.stringify({ files: [{ checksums: ["fixture"], sizes: [executable.length] }] })),
    [`OH-${version}-arm64.dmg`]: Buffer.from("arm64 fixture"),
    [`OH-${version}-x64.dmg`]: Buffer.from("x64 fixture"),
    "latest.yml": Buffer.from(`version: ${version}\nfiles:\n  - url: ${installer}\n    sha512: ${sha512}\n    size: ${executable.length}\npath: ${installer}\nsha512: ${sha512}\n`),
  };
  const release = {
    tag_name: `v${version}`, draft: true,
    assets: Object.entries(files).map(([name, content]) => ({ name, state: "uploaded", size: content.length, digest: `sha256:${createHash("sha256").update(content).digest("hex")}` })),
  };
  const metadataFile = join(directory, "uploaded-release.json");
  const verify = () => spawnSync(process.execPath, [verifier, directory, metadataFile], { encoding: "utf8" });
  try {
    for (const [name, content] of Object.entries(files)) await writeFile(join(directory, name), content);
    await writeFile(metadataFile, JSON.stringify(release));
    await t.test("complete draft matches local files and GitHub hashes", () => {
      const result = verify();
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Verified uploaded draft/);
    });
    await t.test("modified installer cannot pass the updater hash", async () => {
      await writeFile(join(directory, installer), Buffer.from("XX installer verification fixture"));
      assert.notEqual(verify().status, 0);
      await writeFile(join(directory, installer), executable);
    });
    await t.test("missing remote attachment prevents publication", async () => {
      await writeFile(metadataFile, JSON.stringify({ ...release, assets: release.assets.slice(1) }));
      assert.notEqual(verify().status, 0);
    });
    await t.test("remote digest mismatch prevents publication", async () => {
      await writeFile(metadataFile, JSON.stringify({ ...release, assets: release.assets.map((asset, index) => index === 0 ? { ...asset, digest: "sha256:incorrect" } : asset) }));
      assert.notEqual(verify().status, 0);
    });
    await t.test("windows-only release needs no dmg but still checks the Windows update files", async () => {
      const windowsOnly = Object.entries(files).filter(([name]) => !name.endsWith(".dmg"));
      await writeFile(metadataFile, JSON.stringify({ ...release, assets: release.assets.filter((asset) => !asset.name.endsWith(".dmg")) }));
      const run = () => spawnSync(process.execPath, [verifier, directory, metadataFile], { encoding: "utf8", env: { ...process.env, RELEASE_WINDOWS_ONLY: "1" } });
      const ok = run();
      assert.equal(ok.status, 0, ok.stderr);
      assert.match(ok.stdout, new RegExp(`all ${windowsOnly.length} assets`));
      // 没有这个开关时，缺 dmg 仍然不能发布
      assert.notEqual(verify().status, 0);
      await writeFile(join(directory, installer), Buffer.from("XX installer verification fixture"));
      assert.notEqual(run().status, 0, "Windows 安装包被改动仍然拦下");
      await writeFile(join(directory, installer), executable);
    });
    await t.test("published releases cannot be overwritten", async () => {
      await writeFile(metadataFile, JSON.stringify({ ...release, draft: false }));
      assert.notEqual(verify().status, 0);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
