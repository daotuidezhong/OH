// 从 VideoTogether 上游仓库重新生成本目录中的固定版本文件。
// 用法：node electron/vendor/videotogether/update.mjs <VideoTogether 仓库路径> <上游提交号>
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [upstream, commit] = process.argv.slice(2);
if (!upstream || !commit) throw new Error("用法：node update.mjs <VideoTogether 仓库路径> <上游提交号>");
const here = new URL(".", import.meta.url).pathname;

const loader = await readFile(join(upstream, "release/extension.website.user.js"), "utf8");
const start = loader.indexOf("    if (isWebsite || isUserscript) {\n        /*//*/");
const end = loader.indexOf("//*/\n    }", start);
if (start < 0 || end < 0) throw new Error("上游加载器结构已变化，需要人工检查补丁位置");

// OH 补丁：去掉上游加载器从 CDN 拉取、缓存和注入最新版 vt.js 的整段逻辑。
// vt.zh-cn.website.js 改由 Electron 主进程从本目录注入，保证运行的代码就是仓库里审阅过的版本。
const patched = `${loader.slice(0, start)}    // OH patch: vt.js 由 OH 主进程从本地固定版本注入，不再从 CDN 下载。\n${loader.slice(end + "//*/\n    }".length)}`;
if (/getCdnPath|release\/vt\./.test(patched)) throw new Error("补丁后仍包含 CDN 加载逻辑");

// OH 补丁：关掉“标签页存储”（原因见 README.md）。
const TAB_STORAGE_ON = `            data["VideoTogetherTabStorageEnabled"] = true;`;
if (!patched.includes(TAB_STORAGE_ON)) throw new Error("上游加载器结构已变化，需要人工检查标签页存储补丁");
const patchedTab = patched.replace(TAB_STORAGE_ON, `            // OH patch: 不用“标签页存储”，见 README.md。\n            data["VideoTogetherTabStorageEnabled"] = false;`);

await writeFile(join(here, "loader.website.js"), `// VideoTogether ${commit} release/extension.website.user.js（已打 OH 补丁，见 README.md）\n${patchedTab}`);
await copyFile(join(upstream, "release/vt.zh-cn.website.js"), join(here, "vt.zh-cn.website.js"));
await copyFile(join(upstream, "LICENSE"), join(here, "LICENSE"));
console.log("VideoTogether 已更新到", commit);
