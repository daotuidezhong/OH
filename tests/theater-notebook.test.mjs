import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const { openNotebook, SAME_VISIT_MS } = require("../electron/theater-notebook.cjs");

test("notebook records videos, chat and hand-holding per visit, and keeps them on disk", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oh-notebook-"));
  const file = join(directory, "theater-notebook.json");
  let clock = Date.UTC(2026, 10, 23, 12, 0, 0);
  try {
    const book = openNotebook(file, { clock: () => clock });
    assert.deepEqual(book.list(), [], "还没有记录");
    // 两人都在：一起看的时长、银幕上的视频（同一个视频连着出现只记一次，换分 P 算新的）
    book.together("4VZCMD", 250);
    book.video("4VZCMD", "https://www.bilibili.com/video/BV1aa411?spm_id_from=x", "");
    clock += 1000;
    book.video("4VZCMD", "https://www.bilibili.com/video/BV1aa411/", "熬鱼是个啥");
    book.chat("4VZCMD", "partner", "你到了吗");
    clock += 1000;
    book.chat("4VZCMD", "me", "到啦");
    book.hold("4VZCMD", "me");
    clock += 5000;
    book.hold("4VZCMD", "partner"); // 一分钟内连着牵手只记一次
    book.video("4VZCMD", "https://www.bilibili.com/video/BV1aa411?p=2", "熬鱼是个啥 第二集");
    book.chat("4VZCMD", "stranger", "不记");
    book.chat("4VZCMD", "me", "   ");
    for (let i = 0; i < 20; i += 1) { clock += 60_000; book.together("4VZCMD", 60_000); }

    let [visit] = book.list();
    assert.equal(visit.room, "4VZCMD");
    assert.deepEqual(visit.videos.map((video) => video.title), ["熬鱼是个啥", "熬鱼是个啥 第二集"], "第一次没取到标题、后来补上");
    assert.deepEqual(visit.items.map((item) => [item.kind, item.who, item.text ?? ""]), [["chat", "partner", "你到了吗"], ["chat", "me", "到啦"], ["hold", "me", ""]]);
    assert.equal(Math.round(visit.togetherMs / 60000), 20, "一起看了 20 分钟");

    // 离开后 30 分钟内回来还是同一次；更久以后翻新的一页
    clock += SAME_VISIT_MS - 1000;
    book.chat("4VZCMD", "partner", "我回来了");
    assert.equal(book.list().length, 1);
    clock += SAME_VISIT_MS + 1000;
    book.chat("4VZCMD", "partner", "明天继续看");
    const pages = book.list();
    assert.equal(pages.length, 2);
    assert.equal(pages[0].items[0].text, "明天继续看", "新的一页在前");

    // 只开了一下、没有内容的不显示
    clock += SAME_VISIT_MS + 1000;
    book.together("4VZCMD", 1000);
    assert.equal(book.list().length, 2);

    // 落盘：重新打开还在
    book.flush();
    const saved = JSON.parse(await readFile(file, "utf8"));
    assert.equal(saved.version, 1);
    [visit] = openNotebook(file).list().slice(-1);
    assert.equal(visit.videos[0].title, "熬鱼是个啥");
    assert.equal(visit.items.length, 4);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a damaged notebook file starts a fresh notebook instead of breaking the theater", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oh-notebook-"));
  const file = join(directory, "theater-notebook.json");
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(file, "{ not json");
    const book = openNotebook(file);
    assert.deepEqual(book.list(), []);
    book.chat("4VZCMD", "me", "你好");
    book.flush();
    assert.equal(openNotebook(file).list()[0].items[0].text, "你好");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
