#!/usr/bin/env node
/**
 * 新建一篇文章。
 *
 *   node scripts/new-post.mjs "文章的标题" the-slug
 *
 * slug 只用小写英文、数字和连字符，会出现在网址里。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const title = process.argv[2];
const slugArg = process.argv[3];

if (!title) {
  console.error('用法：node scripts/new-post.mjs "文章的标题" the-slug');
  process.exit(1);
}

const fallback = title
  .toLowerCase()
  .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
  .replace(/^-+|-+$/g, "");

const slug = (slugArg || fallback).trim();

if (!slug) {
  console.error("请给一个英文 slug，例如：node scripts/new-post.mjs \"关于写作\" about-writing");
  process.exit(1);
}

if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error("slug 只能包含小写字母、数字和连字符。");
  process.exit(1);
}

const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const target = path.join(ROOT, "content", "posts", `${slug}.md`);

if (fs.existsSync(target)) {
  console.error(`已经存在：${target}`);
  process.exit(1);
}

const body = `---
title: ${title}
date: ${date}
summary:
tags: []
---

从这里开始写。
`;

fs.writeFileSync(target, body, "utf8");
console.log(`已创建 content/posts/${slug}.md`);
console.log("写完运行：npm run build");
