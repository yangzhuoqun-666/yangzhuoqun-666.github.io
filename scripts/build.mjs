#!/usr/bin/env node
/**
 * 静态站点构建：content/*.md -> dist/
 * 零依赖，只需要 Node.js 18+。
 *
 *   node scripts/build.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import site from "../site.config.mjs";
import { parseFrontmatter } from "./lib/frontmatter.mjs";
import { renderMarkdown, plainText, slugify } from "./lib/markdown.mjs";
import {
  esc,
  homePage,
  postPage,
  archivePage,
  tagsIndexPage,
  tagPage,
  aboutPage,
  notFoundPage,
  writerPage,
  feedXml,
  sitemapXml,
  readingTime,
  fmtYear,
  tagSlug,
  tagUrl,
} from "./lib/templates.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = path.join(ROOT, "content");
const DIST = path.join(ROOT, "dist");
const SRC = path.join(ROOT, "src");
const BUILD_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: site.timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const log = (...args) => console.log(...args);

async function readMarkdownDir(dir) {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => e.name);
}

function normalizeDate(input, file) {
  const m = String(input || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`[${file}] 缺少合法日期，请写成 date: 2026-10-24`);
  return `${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`;
}

function excerpt(markdown, summary) {
  if (summary) return summary;
  const text = plainText(markdown);
  return text.length > 96 ? text.slice(0, 96).trim() + "……" : text;
}

async function loadPosts() {
  const dir = path.join(CONTENT, "posts");
  const files = await readMarkdownDir(dir);
  const posts = [];

  for (const file of files) {
    const raw = await fs.readFile(path.join(dir, file), "utf8");
    const { data, body } = parseFrontmatter(raw);
    if (data.draft === true && process.env.DRAFT !== "1") continue;

    const slug = String(data.slug || file.replace(/\.md$/, "")).trim();
    const dateISO = normalizeDate(data.date, file);
    const { html, headings } = renderMarkdown(body, { siteUrl: site.url });
    const tags = Array.isArray(data.tags)
      ? data.tags
      : String(data.tags || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);

    posts.push({
      slug,
      file,
      title: String(data.title || slug),
      dateISO,
      summary: excerpt(body, data.summary),
      tags,
      minutes: readingTime(body),
      body,
      html,
      headings,
    });
  }

  posts.sort((a, b) => (a.dateISO < b.dateISO ? 1 : a.dateISO > b.dateISO ? -1 : 0));
  return posts;
}

function tocHtml(headings) {
  return headings
    .map(
      (h) =>
        `<li class="toc-level-${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`
    )
    .join("");
}

async function writeFile(rel, content) {
  const target = path.join(DIST, rel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) await copyDir(src, dest);
    else await fs.copyFile(src, dest);
  }
}

async function build() {
  const started = Date.now();
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  const posts = await loadPosts();
  if (!posts.length) throw new Error("content/posts 里没有文章。");

  const tags = new Map();
  for (const post of posts) {
    for (const tag of post.tags) tags.set(tag, (tags.get(tag) || 0) + 1);
  }
  const tagList = [...tags.entries()]
    .map(([name, count]) => ({ name, count, slug: tagSlug(site, name) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh"));

  const tagPosts = new Map();
  for (const tag of tagList) {
    tagPosts.set(tag.name, posts.filter((p) => p.tags.includes(tag.name)));
  }

  // 首页
  await writeFile(
    "index.html",
    homePage({
      site,
      posts: posts.slice(0, site.homePostLimit),
      total: posts.length,
    })
  );

  // 文章页
  for (let i = 0; i < posts.length; i += 1) {
    const post = posts[i];
    const prev = posts[i + 1] || null; // 更旧
    const next = posts[i - 1] || null; // 更新
    await writeFile(
      path.join("posts", post.slug, "index.html"),
      postPage({
        site,
        post,
        prev,
        next,
        tocHtml: tocHtml(post.headings),
        contentHtml: post.html,
      })
    );
  }

  // 归档
  const years = new Map();
  for (const post of posts) {
    const year = fmtYear(post.dateISO);
    if (!years.has(year)) years.set(year, []);
    years.get(year).push(post);
  }
  const groups = [...years.entries()]
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([year, list]) => ({ year, posts: list }));

  await writeFile(
    "archive/index.html",
    archivePage({ site, groups, total: posts.length })
  );

  // 标签
  await writeFile("tags/index.html", tagsIndexPage({ site, tags: tagList }));
  for (const tag of tagList) {
    await writeFile(
      path.join("tags", tag.slug, "index.html"),
      tagPage({ site, tag: tag.name, posts: tagPosts.get(tag.name) })
    );
  }

  // 关于
  const aboutRaw = await fs.readFile(path.join(CONTENT, "pages", "about.md"), "utf8");
  const about = parseFrontmatter(aboutRaw);
  const aboutRendered = renderMarkdown(about.body, { siteUrl: site.url });
  await writeFile(
    "about/index.html",
    aboutPage({ site, contentHtml: aboutRendered.html })
  );

  // 404
  await writeFile("404.html", notFoundPage({ site }));

  // 写作台
  await writeFile("write/index.html", writerPage({ site }));

  // 搜索索引
  const searchIndex = posts.map((post) => ({
    title: post.title,
    url: `/posts/${post.slug}/`,
    summary: post.summary,
    tags: post.tags,
    minutes: post.minutes,
    date: post.dateISO.slice(0, 10),
    text: plainText(post.body).slice(0, 4000),
  }));
  await writeFile("search-index.json", JSON.stringify(searchIndex));

  // 写作台的索引和原始 Markdown（用于编辑已有文章）
  const writerIndex = posts.map((post) => ({
    title: post.title,
    slug: post.slug,
    date: post.dateISO.slice(0, 10),
    summary: post.summary,
    tags: post.tags,
    file: `/source/posts/${post.file}`,
  }));
  await writeFile("writer-index.json", JSON.stringify(writerIndex));

  const sourceDir = path.join(DIST, "source", "posts");
  await fs.mkdir(sourceDir, { recursive: true });
  for (const post of posts) {
    await fs.copyFile(
      path.join(CONTENT, "posts", post.file),
      path.join(sourceDir, post.file)
    );
  }

  // RSS
  const contentBySlug = new Map(posts.map((p) => [p.slug, p.html]));
  await writeFile("feed.xml", feedXml({ site, posts, contentBySlug }));

  // sitemap
  const urls = [
    { loc: "/", lastmod: BUILD_DATE },
    { loc: "/archive/", lastmod: BUILD_DATE },
    { loc: "/tags/", lastmod: BUILD_DATE },
    { loc: "/about/", lastmod: BUILD_DATE },
    ...tagList.map((tag) => ({
      loc: tagUrl(site, tag.name),
      lastmod: BUILD_DATE,
    })),
    ...posts.map((post) => ({
      loc: `/posts/${post.slug}/`,
      lastmod: post.dateISO.slice(0, 10),
    })),
  ];
  await writeFile("sitemap.xml", sitemapXml({ site, urls }));

  // 静态文件
  await copyDir(path.join(SRC, "assets"), path.join(DIST, "assets"));
  await writeWriterBundle();
  if (process.env.NO_CNAME !== "1") {
    await writeFile("CNAME", `${new URL(site.url).host}\n`);
  }
  await writeFile(".nojekyll", "");
  await writeFile(
    "robots.txt",
    `User-agent: *\nAllow: /\nDisallow: /write/\nDisallow: /source/\n\nSitemap: ${site.url}/sitemap.xml\n`
  );

  const bytes = await dirSize(DIST);
  log(`\n✓ 构建完成 ${posts.length} 篇文章 / ${tagList.length} 个标签`);
  log(`  dist/  ${(bytes / 1024).toFixed(1)} KB  ${((Date.now() - started) / 1000).toFixed(2)}s`);
  log(`  首页 -> ${site.url}/`);
}

async function dirSize(dir) {
  let total = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(p);
    else total += (await fs.stat(p)).size;
  }
  return total;
}

/**
 * 把 Node 端的 Markdown 渲染器打成一个浏览器可用的 ES module，
 * 让 /write/ 的预览和文章页使用同一套渲染逻辑。
 */
async function writeWriterBundle() {
  const highlightSource = await fs.readFile(
    path.join(ROOT, "scripts", "lib", "highlight.mjs"),
    "utf8"
  );
  const markdownSource = await fs.readFile(
    path.join(ROOT, "scripts", "lib", "markdown.mjs"),
    "utf8"
  );

  const highlightCode = highlightSource.replace(/^export /gm, "");
  const markdownCode = markdownSource
    .replace(/^import[^\n]*\n/m, "")
    .replace(/^export /gm, "");

  const bundle = `/* Generated by scripts/build.mjs. Do not edit. */
${highlightCode}
${markdownCode}
export { renderMarkdown, slugify, plainText };
`;

  await fs.writeFile(path.join(DIST, "assets", "writer-md.js"), bundle, "utf8");
}

build().catch((error) => {
  console.error("\n✗ 构建失败：", error.message);
  if (process.env.DEBUG) console.error(error);
  process.exitCode = 1;
});
