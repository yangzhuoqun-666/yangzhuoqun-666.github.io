import { renderMarkdown } from "/assets/writer-md.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const LS_KEY = "dsh-writer-draft-v1";

const els = {
  title: $("#writer-title"),
  slug: $("#writer-slug"),
  date: $("#writer-date"),
  tags: $("#writer-tags"),
  summary: $("#writer-summary"),
  draft: $("#writer-draft"),
  body: $("#writer-body"),
  preview: $("#writer-preview"),
  stats: $("#writer-stats"),
  status: $("#writer-status"),
  open: $("#writer-open"),
  grid: $("#writer-grid"),
  newBtn: $("#writer-new"),
  copyBtn: $("#writer-copy"),
  downloadBtn: $("#writer-download"),
  saveDirBtn: $("#writer-save-dir"),
  clearBtn: $("#writer-clear"),
  tabs: $$("[data-writer-tab]"),
};

let slugTouched = false;
let previewTimer = 0;
let saveTimer = 0;
let statusTimer = 0;

function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function setStatus(message, ms = 3000) {
  els.status.textContent = message;
  clearTimeout(statusTimer);
  if (message) statusTimer = setTimeout(() => (els.status.textContent = ""), ms);
}

function slugifyAscii(input) {
  return String(input)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseTags(value) {
  return [...new Set(
    String(value)
      .split(/[,，]/)
      .map((tag) => tag.trim().replace(/[\[\]]/g, ""))
      .filter(Boolean)
  )];
}

function currentSlug() {
  const raw = els.slug.value.trim().toLowerCase();
  if (raw) return raw;
  return slugifyAscii(els.title.value);
}

function validSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function collect() {
  return {
    title: els.title.value,
    slug: els.slug.value,
    date: els.date.value || today(),
    tags: els.tags.value,
    summary: els.summary.value,
    draft: els.draft.checked,
    body: els.body.value,
  };
}

function fill(data) {
  els.title.value = data.title || "";
  els.slug.value = data.slug || "";
  els.date.value = data.date || today();
  els.tags.value = Array.isArray(data.tags) ? data.tags.join(", ") : data.tags || "";
  els.summary.value = data.summary || "";
  els.draft.checked = Boolean(data.draft);
  els.body.value = data.body || "";
  renderPreview();
  updateStats();
}

function buildMarkdown() {
  const title = els.title.value.trim() || "未命名";
  const date = els.date.value || today();
  const summary = els.summary.value.replace(/\s*\n+\s*/g, " ").trim();
  const tags = parseTags(els.tags.value);
  const body = els.body.value.replace(/\r\n/g, "\n").trim();

  const lines = [
    "---",
    `title: ${title}`,
    `date: ${date}`,
    `summary: ${summary}`,
    `tags: [${tags.join(", ")}]`,
  ];
  if (els.draft.checked) lines.push("draft: true");
  lines.push("---", "", body, "");

  return lines.join("\n");
}

function filename() {
  const slug = currentSlug();
  if (!slug) {
    setStatus("请先填 Slug（网址用的英文短名，例如 one-thing-a-day）。");
    els.slug.focus();
    return null;
  }
  if (!validSlug(slug)) {
    setStatus("Slug 只能用小写字母、数字和连字符，例如 hello-world。");
    els.slug.focus();
    return null;
  }
  return `${slug}.md`;
}

function renderPreview() {
  const body = els.body.value.trim();
  if (!body) {
    els.preview.innerHTML = '<p class="writer-empty">左侧开始写，这里会实时渲染成文章样式。</p>';
    return;
  }
  try {
    const { html } = renderMarkdown(body, { siteUrl: location.origin });
    els.preview.innerHTML = html;
  } catch (error) {
    els.preview.innerHTML = `<p class="writer-empty">预览出错：${String(error.message || error)}</p>`;
  }
}

function updateStats() {
  const text = els.body.value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*`_~\[\]()!-]/g, " ");
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = (text.match(/[A-Za-z0-9]+/g) || []).length;
  const minutes = Math.max(1, Math.round(cjk / 400 + words / 220));
  els.stats.textContent = `${cjk + words} 字 · 约 ${minutes} 分钟`;
}

function queuePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    renderPreview();
    updateStats();
  }, 120);
}

function saveDraftNow() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(collect()));
  } catch {
    /* 隐私模式下可能写不了，忽略 */
  }
}

function queueSaveDraft() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraftNow, 400);
}

function download() {
  const md = buildMarkdown();
  const name = filename();
  if (!name) return;
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(`已下载 ${name}`);
}

async function copyMarkdown() {
  const md = buildMarkdown();
  try {
    await navigator.clipboard.writeText(md);
    setStatus("Markdown 已复制到剪贴板。");
  } catch {
    const area = document.createElement("textarea");
    area.value = md;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    setStatus("已复制。");
  }
}

async function saveToDirectory() {
  if (!window.showDirectoryPicker) {
    setStatus("这个浏览器不支持「保存到文件夹」，请用「下载 .md」。");
    return;
  }

  const md = buildMarkdown();
  const name = filename();
  if (!name) return;

  try {
    const dir = await window.showDirectoryPicker({ mode: "readwrite" });
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(md);
    await writable.close();
    setStatus(`已保存到 ${dir.name}/${name}`);
  } catch (error) {
    if (error.name !== "AbortError") {
      setStatus(`保存失败：${error.message || error}`);
    }
  }
}

function replaceSelection(before, after, placeholder = "") {
  const start = els.body.selectionStart;
  const end = els.body.selectionEnd;
  const value = els.body.value;
  const selected = value.slice(start, end) || placeholder;
  els.body.value = value.slice(0, start) + before + selected + after + value.slice(end);
  const cursorStart = start + before.length;
  const cursorEnd = cursorStart + selected.length;
  els.body.focus();
  els.body.setSelectionRange(cursorStart, cursorEnd);
  els.body.dispatchEvent(new Event("input", { bubbles: true }));
}

function prefixLines(prefix) {
  const start = els.body.selectionStart;
  const end = els.body.selectionEnd;
  const value = els.body.value;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", end);
  const stop = lineEnd === -1 ? value.length : lineEnd;
  const block = value.slice(lineStart, stop);
  const next = block
    .split("\n")
    .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : prefix + line))
    .join("\n");
  els.body.value = value.slice(0, lineStart) + next + value.slice(stop);
  els.body.focus();
  els.body.setSelectionRange(lineStart, lineStart + next.length);
  els.body.dispatchEvent(new Event("input", { bubbles: true }));
}

function togglePrefix(prefix) {
  const start = els.body.selectionStart;
  const lineStart = els.body.value.lastIndexOf("\n", start - 1) + 1;
  if (els.body.value.slice(lineStart).startsWith(prefix)) {
    els.body.value =
      els.body.value.slice(0, lineStart) + els.body.value.slice(lineStart + prefix.length);
    els.body.focus();
    els.body.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    prefixLines(prefix);
  }
}

function format(kind) {
  switch (kind) {
    case "h2":
      togglePrefix("## ");
      break;
    case "h3":
      togglePrefix("### ");
      break;
    case "bold":
      replaceSelection("**", "**", "加粗文字");
      break;
    case "italic":
      replaceSelection("*", "*", "斜体文字");
      break;
    case "link":
      replaceSelection("[", "](https://)", "链接文字");
      break;
    case "inline-code":
      replaceSelection("`", "`", "代码");
      break;
    case "code":
      replaceSelection("```\n", "\n```", "代码");
      break;
    case "quote":
      togglePrefix("> ");
      break;
    case "list":
      togglePrefix("- ");
      break;
    case "image":
      replaceSelection("![", "](https://)", "图片描述");
      break;
  }
}

function openPost(file) {
  if (!file) return;
  setStatus("正在打开……");
  fetch(file, { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    })
    .then((raw) => {
      const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
      const data = { body: match ? raw.slice(match[0].length) : raw };
      if (match) {
        for (const line of match[1].split("\n")) {
          const index = line.indexOf(":");
          if (index === -1) continue;
          const key = line.slice(0, index).trim();
          let value = line.slice(index + 1).trim();
          if (value.startsWith("[") && value.endsWith("]")) {
            value = value
              .slice(1, -1)
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean);
          } else if (value === "true") value = true;
          else if (value === "false") value = false;
          data[key] = value;
        }
      }

      data.slug = file.split("/").pop().replace(/\.md$/, "");
      data.draft = Boolean(data.draft);
      fill(data);
      slugTouched = true;
      els.body.scrollTop = 0;
      setStatus(`已打开 ${data.title || data.slug}`);
    })
    .catch((error) => setStatus(`打开失败：${error.message || error}`));
}

function loadIndex() {
  fetch("/writer-index.json", { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((posts) => {
      if (!Array.isArray(posts) || !posts.length) return;
      for (const post of posts) {
        const option = document.createElement("option");
        option.value = post.file;
        option.textContent = `${post.title} · ${post.date}`;
        els.open.appendChild(option);
      }
    })
    .catch(() => {
      /* 索引加载失败不影响写作 */
    });
}

function newPost() {
  if (els.body.value.trim() && !confirm("清空当前内容，开始一篇新的？")) return;
  els.title.value = "";
  els.slug.value = "";
  els.slug.parentElement.classList.remove("is-error");
  els.date.value = today();
  els.tags.value = "";
  els.summary.value = "";
  els.draft.checked = false;
  els.body.value = "";
  slugTouched = false;
  els.open.value = "";
  renderPreview();
  updateStats();
  saveDraftNow();
  els.title.focus();
  setStatus("新文章。填好标题和 Slug 就可以写了。");
}

function syncSlug() {
  if (slugTouched) return;
  const auto = slugifyAscii(els.title.value);
  if (auto) els.slug.value = auto;
}

function setupTabs() {
  for (const tab of els.tabs) {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.writerTab;
      els.grid.classList.toggle("show-preview", mode === "preview");
      for (const other of els.tabs) {
        const active = other === tab;
        other.classList.toggle("is-active", active);
        other.setAttribute("aria-selected", String(active));
      }
      if (window.matchMedia("(max-width: 820px)").matches) {
        setTimeout(() => els.grid.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
      }
    });
  }
}

function setupEditor() {
  const fields = [els.title, els.slug, els.date, els.tags, els.summary, els.draft];
  for (const field of fields) {
    field.addEventListener("input", () => {
      queuePreview();
      queueSaveDraft();
    });
  }

  els.title.addEventListener("input", syncSlug);
  els.slug.addEventListener("input", () => {
    slugTouched = true;
  });

  els.body.addEventListener("input", () => {
    queuePreview();
    queueSaveDraft();
  });

  els.body.addEventListener("keydown", (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "s") {
      event.preventDefault();
      download();
    } else if (mod && event.key.toLowerCase() === "b") {
      event.preventDefault();
      format("bold");
    } else if (mod && event.key.toLowerCase() === "i") {
      event.preventDefault();
      format("italic");
    } else if (mod && event.key.toLowerCase() === "k") {
      event.preventDefault();
      format("link");
    } else if (event.key === "Tab") {
      event.preventDefault();
      const start = els.body.selectionStart;
      const end = els.body.selectionEnd;
      els.body.value =
        els.body.value.slice(0, start) + "  " + els.body.value.slice(end);
      els.body.setSelectionRange(start + 2, start + 2);
      els.body.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

  for (const button of $$("[data-md]")) {
    button.addEventListener("click", () => format(button.dataset.md));
  }

  els.preview.addEventListener("click", (event) => {
    const button = event.target.closest(".code-copy");
    if (!button) return;
    const code = button.closest(".code-block")?.querySelector("code");
    if (!code) return;
    navigator.clipboard.writeText(code.innerText).then(() => {
      button.textContent = "已复制";
      setTimeout(() => (button.textContent = "复制"), 1600);
    });
  });
}

function restore() {
  els.date.value = today();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return;
    fill(data);
    slugTouched = Boolean(data.slug);
    setStatus("已恢复上次未完成的草稿。");
  } catch {
    /* 忽略损坏的草稿 */
  }
}

els.newBtn.addEventListener("click", newPost);
els.downloadBtn.addEventListener("click", download);
els.copyBtn.addEventListener("click", copyMarkdown);
els.saveDirBtn.addEventListener("click", saveToDirectory);
els.open.addEventListener("change", () => openPost(els.open.value));
els.clearBtn.addEventListener("click", () => {
  try {
    localStorage.removeItem(LS_KEY);
    setStatus("本地草稿已清除。");
  } catch {
    setStatus("当前浏览器不允许清除本地草稿。");
  }
});

setupTabs();
setupEditor();
restore();
renderPreview();
updateStats();
loadIndex();
