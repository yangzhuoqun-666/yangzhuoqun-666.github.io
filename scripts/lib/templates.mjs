/**
 * HTML 模板。全部是纯字符串，构建后即为最终静态页面。
 */
import { plainText } from "./markdown.mjs";

export const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const MONTHS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];

export const tagSlug = (site, tag) =>
  site.tagSlugs[tag] || String(tag).trim().replace(/\s+/g, "-");

export const tagUrl = (site, tag) => `/tags/${encodeURIComponent(tagSlug(site, tag))}/`;

export function readingTime(markdown) {
  const text = plainText(markdown);
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (text.replace(/[\u4e00-\u9fff]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;
  return Math.max(1, Math.round(cjk / 400 + latin / 220));
}

export function fmtLong(iso) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()} 年 ${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日`;
}
export function fmtShort(iso) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}
export function fmtMonthDay(iso) {
  const d = new Date(iso);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}
export function fmtYear(iso) {
  return String(new Date(iso).getUTCFullYear());
}
export function fmtChineseDate(iso) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()} 年 ${MONTHS[d.getUTCMonth()]} 月 ${d.getUTCDate()} 日`;
}

const sunIcon = `<svg class="icon icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.1M12 19.1v2.1M21.2 12h-2.1M4.9 12H2.8M18.5 5.5l-1.5 1.5M7 17l-1.5 1.5M18.5 18.5 17 17M7 7 5.5 5.5"/></svg>`;
const moonIcon = `<svg class="icon icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.4 14.6A8.6 8.6 0 1 1 9.4 3.6a6.9 6.9 0 0 0 11 11Z"/></svg>`;
const searchIcon = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.4"/><path d="m16 16 4.2 4.2"/></svg>`;

const themeBootstrap = `(function(){try{var s=localStorage.getItem("theme");var d=s?s==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.setAttribute("data-theme",d?"dark":"light");}catch(e){}})();`;

export function layout({
  site,
  title,
  description = site.description,
  canonical,
  content,
  active = "/",
  bodyClass = "",
  ogType = "website",
  published,
  jsonLd,
  noindex = false,
  extraHead = "",
  extraBody = "",
}) {
  const fullTitle = title === site.title ? `${site.title} · ${site.tagline}` : `${title} · ${site.title}`;
  const nav = site.nav
    .map((item) => {
      const current = item.href === active ? ' aria-current="page"' : "";
      return `<a href="${item.href}"${current}>${esc(item.label)}</a>`;
    })
    .join("");

  const social = site.social
    .map((item) => `<a href="${item.href}"${/^https?:/.test(item.href) ? ' target="_blank" rel="noopener noreferrer"' : ""}>${esc(item.label)}</a>`)
    .join("");

  const articleMeta = published
    ? `<meta property="article:published_time" content="${published}">
<meta property="article:author" content="${esc(site.author)}">`
    : "";

  return `<!doctype html>
<html lang="${site.lang}" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="${esc(site.author)}">
<link rel="canonical" href="${canonical}">
${noindex ? '<meta name="robots" content="noindex, nofollow">' : ""}
<meta name="theme-color" content="#f6f3ec" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1113" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="${esc(site.title)}">
<meta property="og:locale" content="${site.locale}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(fullTitle)}">
<meta name="twitter:description" content="${esc(description)}">
${articleMeta}
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${esc(site.title)}" href="/feed.xml">
<link rel="stylesheet" href="/assets/style.css">
${extraHead}
<script>${themeBootstrap}</script>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#main">跳到正文</a>
<header class="site-header" id="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/" aria-label="${esc(site.title)}，返回首页">
      <span class="brand-mark" aria-hidden="true">杨</span>
      <span class="brand-text"><strong>${esc(site.title)}</strong><small>${esc(site.subtitle)}</small></span>
    </a>
    <nav class="site-nav" aria-label="主导航">${nav}</nav>
    <div class="header-actions">
      <button class="icon-btn search-btn" id="search-open" type="button" aria-label="搜索文章" aria-haspopup="dialog">
        ${searchIcon}<kbd class="kbd">⌘K</kbd>
      </button>
      <button class="icon-btn theme-btn" id="theme-toggle" type="button" aria-label="切换深浅色">
        ${sunIcon}${moonIcon}
      </button>
    </div>
  </div>
</header>
<main id="main">
${content}
</main>
<footer class="site-footer">
  <div class="wrap footer-inner">
    <p class="copyright">© ${new Date().getUTCFullYear()} ${esc(site.author)} · ${esc(site.footerNote)}</p>
    <div class="footer-links">${social}<a href="/write/">写作台</a></div>
  </div>
</footer>
<dialog class="search-dialog" id="search-dialog" aria-label="站内搜索">
  <div class="search-panel">
    <form class="search-form" role="search" onsubmit="return false">
      ${searchIcon}
      <input id="search-input" type="search" placeholder="搜索文章、标签……" autocomplete="off" spellcheck="false" aria-label="搜索关键词">
      <button class="search-close" id="search-close" type="button">Esc</button>
    </form>
    <div class="search-results" id="search-results">
      <p class="search-hint">输入关键词开始搜索，↑↓ 选择，Enter 打开。</p>
    </div>
  </div>
</dialog>
<script src="/assets/app.js" defer></script>
${extraBody}
</body>
</html>`;
}

function postTags(site, tags = []) {
  return tags
    .map((tag) => `<a class="tag" href="${tagUrl(site, tag)}">${esc(tag)}</a>`)
    .join("");
}

export function postList(site, posts, { showYear = false } = {}) {
  return `<ol class="post-list">
${posts
  .map(
    (post, index) => `<li class="post-item" style="--i:${index}">
  <time class="post-date" datetime="${post.dateISO}">${showYear ? fmtShort(post.dateISO) : fmtMonthDay(post.dateISO)}</time>
  <div class="post-item-body">
    <h3 class="post-item-title"><a class="post-item-link" href="/posts/${post.slug}/">${esc(post.title)}</a></h3>
    <p class="post-item-summary">${esc(post.summary)}</p>
    <div class="post-item-tags">${postTags(site, post.tags)}</div>
  </div>
  <span class="post-arrow" aria-hidden="true">↗</span>
</li>`
  )
  .join("\n")}
</ol>`;
}

export function homePage({ site, posts, total }) {
  const content = `<section class="hero wrap">
  <div class="hero-main">
    <p class="hero-kicker reveal">YANG ZHUOQUN <span>·</span> 写字的地方</p>
    <h1 class="hero-title reveal">杨卓群</h1>
    <p class="hero-lede reveal">写代码，也写点别的。<br>这里记录技术、阅读，和一些没想清楚的问题。</p>
    <p class="hero-status reveal"><span class="status-dot" aria-hidden="true"></span>保持好奇，保持记录</p>
  </div>
  <div class="hero-seal reveal" aria-hidden="true"><span>杨</span><small>ZHUOQUN</small></div>
</section>

<section class="section wrap">
  <div class="section-head">
    <h2 class="section-title">最近文章</h2>
    <a class="section-more" href="/archive/">全部 ${total} 篇 <span aria-hidden="true">→</span></a>
  </div>
  ${postList(site, posts, { showYear: true })}
</section>

<section class="home-note wrap">
  <div class="note-rule" aria-hidden="true"></div>
  <p>这个站点没有数据库、没有后端，所有页面在构建时生成。<br>它只是一些文本文件，和一些 CSS。</p>
</section>`;

  return layout({
    site,
    title: site.title,
    description: site.description,
    canonical: `${site.url}/`,
    content,
    active: "/",
    bodyClass: "page-home",
  });
}

export function postPage({ site, post, prev, next, tocHtml, contentHtml }) {
  const toc = tocHtml
    ? `<aside class="post-toc" aria-label="文章目录">
  <p class="toc-title">目录</p>
  <nav><ol>${tocHtml}</ol></nav>
</aside>`
    : "";

  const tocMobile = tocHtml
    ? `<details class="post-toc-mobile">
  <summary><span>目录</span><small>${post.headings.length} 节</small></summary>
  <nav><ol>${tocHtml}</ol></nav>
</details>`
    : "";

  const pager = `<nav class="post-pager" aria-label="上一篇与下一篇">
  ${
    prev
      ? `<a class="pager-item pager-prev" href="/posts/${prev.slug}/"><span>← 上一篇</span><strong>${esc(prev.title)}</strong></a>`
      : `<span class="pager-item pager-empty"></span>`
  }
  ${
    next
      ? `<a class="pager-item pager-next" href="/posts/${next.slug}/"><span>下一篇 →</span><strong>${esc(next.title)}</strong></a>`
      : `<span class="pager-item pager-empty"></span>`
  }
</nav>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.summary,
    datePublished: post.dateISO,
    dateModified: post.dateISO,
    author: { "@type": "Person", name: site.author },
    publisher: { "@type": "Person", name: site.author },
    mainEntityOfPage: `${site.url}/posts/${post.slug}/`,
    inLanguage: "zh-CN",
    keywords: post.tags.join(", "),
  };

  const content = `<div class="reading-progress" aria-hidden="true"><span id="reading-bar"></span></div>
<article class="post">
  <header class="post-header wrap-narrow">
    <p class="post-eyebrow reveal"><a href="/">← 文章列表</a></p>
    <h1 class="post-heading reveal">${esc(post.title)}</h1>
    ${post.summary ? `<p class="post-subtitle reveal">${esc(post.summary)}</p>` : ""}
    <div class="post-meta reveal">
      <time datetime="${post.dateISO}">${fmtLong(post.dateISO)}</time>
      <span class="meta-dot" aria-hidden="true">·</span>
      <span>约 ${post.minutes} 分钟</span>
      ${post.tags.length ? `<span class="meta-dot" aria-hidden="true">·</span><span class="post-meta-tags">${postTags(site, post.tags)}</span>` : ""}
    </div>
  </header>
  <div class="post-layout wrap${toc ? "" : " no-toc"}">
    ${tocMobile}
    ${toc}
    <div class="prose">${contentHtml}</div>
  </div>
  <footer class="post-footer wrap-narrow">
    <div class="post-end-mark" aria-hidden="true">⁂</div>
    ${post.tags.length ? `<div class="post-end-tags">${postTags(site, post.tags)}</div>` : ""}
    ${pager}
    <p class="post-back"><a href="/">← 回到首页</a></p>
  </footer>
</article>`;

  return layout({
    site,
    title: post.title,
    description: post.summary,
    canonical: `${site.url}/posts/${post.slug}/`,
    content,
    active: "/",
    bodyClass: "page-post",
    ogType: "article",
    published: post.dateISO,
    jsonLd,
  });
}

export function archivePage({ site, groups, total }) {
  const content = `<header class="page-header wrap-narrow">
  <p class="page-kicker reveal">ARCHIVE</p>
  <h1 class="page-title reveal">归档</h1>
  <p class="page-lede reveal">共 ${total} 篇文章，按时间倒序排列。</p>
</header>
<div class="archive wrap-narrow">
${groups
  .map(
    (group) => `<section class="archive-year">
  <h2 class="archive-year-title"><span>${group.year}</span><small>${group.posts.length} 篇</small></h2>
  <ol class="archive-list">
    ${group.posts
      .map(
        (post) => `<li><time datetime="${post.dateISO}">${fmtMonthDay(post.dateISO)}</time><a href="/posts/${post.slug}/">${esc(post.title)}</a><span class="archive-tags">${post.tags.map((t) => esc(t)).join(" / ")}</span></li>`
      )
      .join("")}
  </ol>
</section>`
  )
  .join("")}
</div>`;
  return layout({
    site,
    title: "归档",
    description: `${site.title}的全部文章归档，共 ${total} 篇。`,
    canonical: `${site.url}/archive/`,
    content,
    active: "/archive/",
    bodyClass: "page-archive",
  });
}

export function tagsIndexPage({ site, tags }) {
  const content = `<header class="page-header wrap-narrow">
  <p class="page-kicker reveal">TAGS</p>
  <h1 class="page-title reveal">标签</h1>
  <p class="page-lede reveal">按主题翻一翻，共 ${tags.length} 个标签。</p>
</header>
<div class="tag-cloud wrap-narrow">
${tags
  .map(
    (tag) => `<a class="tag-card" href="${tagUrl(site, tag.name)}">
  <span class="tag-card-name">${esc(tag.name)}</span>
  <span class="tag-card-count">${tag.count}</span>
</a>`
  )
  .join("")}
</div>`;
  return layout({
    site,
    title: "标签",
    description: `${site.title}的全部文章标签。`,
    canonical: `${site.url}/tags/`,
    content,
    active: "/tags/",
    bodyClass: "page-tags",
  });
}

export function tagPage({ site, tag, posts }) {
  const content = `<header class="page-header wrap-narrow">
  <p class="page-kicker reveal">TAG</p>
  <h1 class="page-title reveal">${esc(tag)}</h1>
  <p class="page-lede reveal">这个标签下有 ${posts.length} 篇文章。<a class="inline-link" href="/tags/">查看全部标签 →</a></p>
</header>
<section class="section wrap-narrow">
  ${postList(site, posts, { showYear: true })}
</section>`;
  return layout({
    site,
    title: `标签：${tag}`,
    description: `${site.title}中标签为「${tag}」的文章。`,
    canonical: `${site.url}${tagUrl(site, tag)}`,
    content,
    active: "/tags/",
    bodyClass: "page-tag",
  });
}

export function aboutPage({ site, contentHtml }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: `关于 ${site.author}`,
    url: `${site.url}/about/`,
    description: site.description,
  };
  const content = `<header class="page-header about-header">
  <p class="page-kicker reveal">ABOUT</p>
  <h1 class="page-title reveal">关于</h1>
  <p class="page-lede reveal">一个写代码的人，和他的一些笔记。</p>
</header>
<div class="about-grid wrap">
  <div class="prose about-prose">${contentHtml}</div>
  <aside class="about-aside">
    <div class="contact-card">
      <p class="contact-label">写信给我</p>
      <a class="contact-mail" href="mailto:${esc(site.email)}">${esc(site.email)}</a>
      <div class="contact-links">
        ${site.social
          .map(
            (item) => `<a href="${item.href}"${/^https?:/.test(item.href) ? ' target="_blank" rel="noopener noreferrer"' : ""}>${esc(item.label)} <span aria-hidden="true">↗</span></a>`
          )
          .join("")}
      </div>
    </div>
  </aside>
</div>`;
  return layout({
    site,
    title: "关于",
    description: `关于 ${site.author}。`,
    canonical: `${site.url}/about/`,
    content,
    active: "/about/",
    bodyClass: "page-about",
    jsonLd,
  });
}

export function notFoundPage({ site }) {
  const content = `<section class="notfound wrap">
  <p class="notfound-code reveal">404</p>
  <h1 class="notfound-title reveal">这页纸是空的</h1>
  <p class="notfound-text reveal">你要找的页面可能被移动、删除，或者从来没有存在过。</p>
  <p class="notfound-actions reveal"><a class="btn" href="/">回到首页</a><a class="btn btn-ghost" href="/archive/">翻翻归档</a></p>
</section>`;
  return layout({
    site,
    title: "页面不存在",
    description: "页面不存在。",
    canonical: `${site.url}/404.html`,
    content,
    active: "/404",
    bodyClass: "page-404",
  });
}

export function feedXml({ site, posts, contentBySlug }) {
  const items = posts
    .map((post) => {
      const url = `${site.url}/posts/${post.slug}/`;
      const body = contentBySlug.get(post.slug) || "";
      return `    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(post.dateISO).toUTCString()}</pubDate>
      <description><![CDATA[${post.summary}]]></description>
      <content:encoded><![CDATA[${body.replace(/]]>/g, "]]&gt;")}]]></content:encoded>
${post.tags.map((tag) => `      <category><![CDATA[${tag}]]></category>`).join("\n")}
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${esc(site.title)}</title>
    <link>${site.url}/</link>
    <description>${esc(site.description)}</description>
    <language>${site.lang}</language>
    <lastBuildDate>${new Date(posts[0]?.dateISO || Date.now()).toUTCString()}</lastBuildDate>
    <atom:link href="${site.url}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
}

export function sitemapXml({ site, urls }) {
  const body = urls
    .map(
      (u) => `  <url>
    <loc>${site.url}${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

export function writerPage({ site }) {
  const content = `<section class="writer wrap" data-repo="${esc(site.githubRepo)}" data-branch="${esc(site.githubBranch)}">
  <header class="writer-head">
    <div class="writer-intro">
      <p class="page-kicker">WRITER</p>
      <h1 class="writer-title">写作台</h1>
      <p class="writer-lede">在浏览器里写 Markdown，导出成静态文章。没有后端，草稿只保存在这台设备。</p>
    </div>
    <div class="writer-actions">
      <button class="btn btn-ghost" id="writer-new" type="button">新建</button>
      <select id="writer-open" class="writer-select" aria-label="打开已有文章">
        <option value="">打开已有文章…</option>
      </select>
      <button class="btn btn-ghost" id="writer-copy" type="button">复制</button>
      <button class="btn" id="writer-download" type="button">下载 .md</button>
      <button class="btn btn-accent" id="writer-publish" type="button">发布上线</button>
      <button class="btn btn-ghost" id="writer-save-dir" type="button">保存到文件夹</button>
    </div>
  </header>

  <div class="writer-meta">
    <label class="writer-field writer-field-title"><span>标题</span><input id="writer-title" type="text" placeholder="文章的标题" autocomplete="off"></label>
    <label class="writer-field"><span>Slug</span><input id="writer-slug" type="text" placeholder="hello-world" autocomplete="off" spellcheck="false"></label>
    <label class="writer-field"><span>日期</span><input id="writer-date" type="date"></label>
    <label class="writer-field"><span>标签</span><input id="writer-tags" type="text" placeholder="随笔, 技术" autocomplete="off"></label>
    <label class="writer-field writer-field-summary"><span>摘要</span><textarea id="writer-summary" rows="2" placeholder="列表里显示的一句话，留空会自动截取正文。"></textarea></label>
    <label class="writer-check"><input id="writer-draft" type="checkbox"> 草稿</label>
  </div>

  <div class="writer-tabs" role="tablist" aria-label="编辑与预览">
    <button type="button" data-writer-tab="edit" class="is-active" role="tab" aria-selected="true">编辑</button>
    <button type="button" data-writer-tab="preview" role="tab" aria-selected="false">预览</button>
  </div>

  <div class="writer-grid" id="writer-grid">
    <section class="writer-pane writer-editor" aria-label="Markdown 编辑器">
      <div class="writer-toolbar">
        <button type="button" data-md="h2" title="二级标题">H2</button>
        <button type="button" data-md="h3" title="三级标题">H3</button>
        <button type="button" data-md="bold" title="加粗"><strong>B</strong></button>
        <button type="button" data-md="italic" title="斜体"><em>I</em></button>
        <button type="button" data-md="link" title="链接">链接</button>
        <button type="button" data-md="inline-code" title="行内代码">&lt;/&gt;</button>
        <button type="button" data-md="code" title="代码块">{ }</button>
        <button type="button" data-md="quote" title="引用">”</button>
        <button type="button" data-md="list" title="列表">•</button>
        <button type="button" data-md="image" title="图片">图</button>
      </div>
      <textarea id="writer-body" spellcheck="false" placeholder="从这里开始写。支持 Markdown：## 标题、**加粗**、&#96;代码&#96;、- 列表、&gt; 引用、&#96;&#96;&#96;代码块&#96;&#96;&#96;。"></textarea>
    </section>
    <section class="writer-pane writer-preview" aria-label="预览">
      <div class="writer-pane-head"><span>预览</span><span class="writer-pane-hint">与文章页同一套样式</span></div>
      <div id="writer-preview" class="prose"></div>
    </section>
  </div>

  <div class="writer-foot">
    <span id="writer-stats">0 字</span>
    <span id="writer-status" role="status" aria-live="polite"></span>
    <a class="writer-run-link" id="writer-run-link" href="#" target="_blank" rel="noopener noreferrer" hidden>查看构建 →</a>
    <button class="writer-clear" id="writer-clear" type="button">清除本地草稿</button>
    <a href="/">← 返回博客</a>
  </div>

  <details class="writer-token" id="writer-token-box">
    <summary>GitHub 发布设置</summary>
    <div class="writer-token-body">
      <p>发布按钮会把文章提交到 <code>${esc(site.githubRepo)}</code>，GitHub Actions 构建后自动上线。token 只保存在这台设备的浏览器里，不会提交到仓库。</p>
      <p>建议创建一个 <strong>fine-grained token</strong>：只选这个仓库，权限给 <strong>Contents: Read and write</strong>，有效期 90 天。不要用账号密码。</p>
      <div class="writer-token-row">
        <input id="writer-token" type="password" placeholder="github_pat_..." autocomplete="off" spellcheck="false">
        <button class="btn" id="writer-token-save" type="button">保存 token</button>
        <button class="btn btn-ghost" id="writer-token-clear" type="button">清除</button>
      </div>
      <p class="writer-token-status" id="writer-token-status">尚未设置 token。</p>
      <p><a class="writer-token-link" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">去 GitHub 创建 fine-grained token →</a></p>
    </div>
  </details>

  <details class="writer-help">
    <summary>写完之后怎么发布？</summary>
    <ol>
      <li>点「发布上线」：第一次先保存一次 GitHub token，之后每次点一下就会提交 Markdown，GitHub Actions 自动构建并部署；</li>
      <li>也可以点「下载 .md」/「保存到文件夹」，手动放进 <code>content/posts/</code>；</li>
      <li>手动方式需要运行 <code>npm run build</code>，再把新的 <code>dist/</code> 部署上去。</li>
    </ol>
    <p>这个页面本身不写服务器，也不上传任何内容；所有操作都在你的浏览器里完成。</p>
  </details>
</section>`;

  return layout({
    site,
    title: "写作台",
    description: "在浏览器里写 Markdown，导出静态文章。",
    canonical: `${site.url}/write/`,
    content,
    active: "/write/",
    bodyClass: "page-write",
    noindex: true,
    extraHead: '<link rel="stylesheet" href="/assets/writer.css">',
    extraBody: '<script type="module" src="/assets/writer.js"></script>',
  });
}
