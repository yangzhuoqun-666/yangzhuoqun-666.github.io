/**
 * 一个小而够用的 Markdown 渲染器。
 * 支持：标题、段落、粗斜体、行内代码、链接、图片、引用、列表（含嵌套/任务列表）、
 * 表格、分隔线、围栏代码块（带高亮）、::: 提示块。
 */
import { highlight } from "./highlight.mjs";

const LIST_RE = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/;

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-") || "section";
}

export function plainText(md) {
  return String(md)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function renderInline(text, opts = {}) {
  const codes = [];
  let out = String(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000C${codes.length - 1}\u0000`;
  });

  out = esc(out);

  // 图片
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => {
    return `<img src="${src}" alt="${alt}" loading="lazy" decoding="async">`;
  });

  // 链接
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const external = /^https?:\/\//i.test(href) && !href.startsWith(opts.siteUrl || "\u0000");
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${href}"${attrs}>${label}</a>`;
  });

  // 加粗 / 斜体 / 删除线
  out = out.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+?)__/g, "<strong>$1</strong>");
  out = out.replace(
    /(^|[\s（(、，。；：！？—])\*([^*\n]+?)\*(?=$|[\s）)、，。；：！？—])/g,
    "$1<em>$2</em>"
  );
  out = out.replace(/~~([^~]+?)~~/g, "<del>$1</del>");

  // 还原行内代码
  out = out.replace(/\u0000C(\d+)\u0000/g, (_, idx) => `<code>${esc(codes[Number(idx)])}</code>`);

  return out;
}

function joinSoft(lines) {
  let out = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!out) {
      out = line;
      continue;
    }
    if (/\s$/.test(raw) || CJK.test(out.slice(-1)) || CJK.test(line[0])) out += line;
    else out += " " + line;
  }
  return out;
}

function isBlockStart(line) {
  return (
    /^\s*```/.test(line) ||
    /^\s{0,3}#{1,6}\s+/.test(line) ||
    /^\s*>/.test(line) ||
    /^\s*:::\s*\w+/.test(line) ||
    /^\s*([-*_])\s*(?:\1\s*){2,}$/.test(line) ||
    LIST_RE.test(line)
  );
}

export function renderMarkdown(markdown, opts = {}) {
  const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
  const headings = [];
  const usedIds = new Map();

  const uniqueId = (raw) => {
    const base = slugify(raw);
    const count = usedIds.get(base) || 0;
    usedIds.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };

  const inline = (t) => renderInline(t, opts);

  const parseBlocks = (blockLines, collectHeadings = true) => {
    let i = 0;
    let html = "";

    while (i < blockLines.length) {
      const line = blockLines[i];

      if (!line.trim()) {
        i += 1;
        continue;
      }

      // 围栏代码块
      const fence = line.match(/^\s*```\s*([^\s`]*)/);
      if (fence) {
        const lang = fence[1] || "text";
        const code = [];
        i += 1;
        while (i < blockLines.length && !/^\s*```\s*$/.test(blockLines[i])) {
          code.push(blockLines[i]);
          i += 1;
        }
        i += 1; // 跳过结束围栏
        const source = code.join("\n");
        html += `<div class="code-block" data-lang="${esc(lang)}">
  <div class="code-head"><span class="code-lang">${esc(lang)}</span><button class="code-copy" type="button" aria-label="复制代码">复制</button></div>
  <pre><code class="language-${esc(lang)}">${highlight(source, lang)}</code></pre>
</div>`;
        continue;
      }

      // 标题
      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (heading) {
        const level = heading[1].length;
        const text = heading[2];
        const id = uniqueId(plainText(text));
        if (collectHeadings && (level === 2 || level === 3)) {
          headings.push({ level, text: plainText(text), id });
        }
        html += `<h${level} id="${id}">${inline(text)}<a class="heading-anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a></h${level}>`;
        i += 1;
        continue;
      }

      // 分隔线
      if (/^\s*([-*_])\s*(?:\1\s*){2,}$/.test(line)) {
        html += "<hr>";
        i += 1;
        continue;
      }

      // ::: 提示块
      const callout = line.match(/^\s*:::\s*(note|tip|warn|danger)\s*(.*)$/i);
      if (callout) {
        const type = callout[1].toLowerCase();
        const title = callout[2].trim();
        const body = [];
        i += 1;
        while (i < blockLines.length && !/^\s*:::\s*$/.test(blockLines[i])) {
          body.push(blockLines[i]);
          i += 1;
        }
        i += 1;
        const labels = { note: "提示", tip: "小技巧", warn: "注意", danger: "警告" };
        html += `<aside class="callout callout-${type}">
  <p class="callout-title">${esc(title || labels[type])}</p>
  <div class="callout-body">${parseBlocks(body, false)}</div>
</aside>`;
        continue;
      }

      // 引用
      if (/^\s*>/.test(line)) {
        const quote = [];
        while (i < blockLines.length && (/^\s*>/.test(blockLines[i]) || !blockLines[i].trim())) {
          if (!blockLines[i].trim()) {
            if (i + 1 < blockLines.length && /^\s*>/.test(blockLines[i + 1])) quote.push("");
            else break;
          } else {
            quote.push(blockLines[i].replace(/^\s*>\s?/, ""));
          }
          i += 1;
        }
        html += `<blockquote>${parseBlocks(quote, false)}</blockquote>`;
        continue;
      }

      // 表格
      if (
        line.includes("|") &&
        i + 1 < blockLines.length &&
        /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(blockLines[i + 1])
      ) {
        const cells = (row) =>
          row
            .trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((c) => c.trim());
        const aligns = cells(blockLines[i + 1]).map((c) => {
          const left = c.startsWith(":");
          const right = c.endsWith(":");
          if (left && right) return "center";
          if (right) return "right";
          return "left";
        });
        const head = cells(line);
        const bodyRows = [];
        i += 2;
        while (i < blockLines.length && blockLines[i].includes("|") && blockLines[i].trim()) {
          bodyRows.push(cells(blockLines[i]));
          i += 1;
        }
        const th = head
          .map((c, idx) => `<th style="text-align:${aligns[idx] || "left"}">${inline(c)}</th>`)
          .join("");
        const trs = bodyRows
          .map(
            (row) =>
              `<tr>${row
                .map((c, idx) => `<td style="text-align:${aligns[idx] || "left"}">${inline(c)}</td>`)
                .join("")}</tr>`
          )
          .join("");
        html += `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`;
        continue;
      }

      // 列表
      if (LIST_RE.test(line)) {
        const { html: listHtml, next } = parseList(blockLines, i);
        html += listHtml;
        i = next;
        continue;
      }

      // 段落
      const para = [];
      while (i < blockLines.length && blockLines[i].trim() && !isBlockStart(blockLines[i])) {
        para.push(blockLines[i]);
        i += 1;
      }
      const text = joinSoft(para);
      const onlyImage = /^!\[[^\]]*\]\([^)]+\)$/.test(text.trim());
      html += onlyImage ? `<figure>${inline(text)}</figure>` : `<p>${inline(text)}</p>`;
    }

    return html;
  };

  const parseList = (blockLines, start) => {
    let i = start;
    const root = { indent: -1, ordered: false, children: [] };
    const stack = [root];
    let lastItem = null;

    while (i < blockLines.length) {
      const line = blockLines[i];

      if (!line.trim()) {
        const next = blockLines[i + 1];
        if (next === undefined) break;
        const nextIndent = next.match(/^\s*/)[0].length;
        if (!LIST_RE.test(next) && nextIndent === 0) break;
        i += 1;
        continue;
      }

      const m = line.match(LIST_RE);
      if (m) {
        const indent = m[1].length;
        const ordered = /^\d+\./.test(m[2]);

        while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop();

        const top = stack[stack.length - 1];

        if (indent === top.indent && ordered !== top.ordered) {
          // 同级但列表类型变化：另起一个列表
          stack.pop();
          const list = { indent, ordered, children: [], parent: top.parent || null };
          if (top.parent) top.parent.children.push(list);
          else root.children.push(list);
          stack.push(list);
        } else if (indent > top.indent) {
          const list = { indent, ordered, children: [], parent: lastItem || null };
          if (lastItem) lastItem.children.push(list);
          else root.children.push(list);
          stack.push(list);
        } else if (indent === top.indent) {
          // 同级，继续当前列表
        } else {
          break;
        }

        lastItem = { text: [m[3]], children: [] };
        stack[stack.length - 1].children.push(lastItem);
        i += 1;
        continue;
      }

      // 续行
      const indent = line.match(/^\s*/)[0].length;
      if (lastItem && indent > stack[stack.length - 1].indent) {
        lastItem.text.push(line.trim());
        i += 1;
        continue;
      }
      break;
    }

    const renderTree = (node) =>
      node.children
        .map((list) => {
          const tag = list.ordered ? "ol" : "ul";
          const items = list.children
            .map((item) => {
              let text = joinSoft(item.text);
              let checkbox = "";
              const task = text.match(/^\[([ xX])\]\s+(.*)$/);
              if (task) {
                checkbox = `<input type="checkbox" disabled${task[1].toLowerCase() === "x" ? " checked" : ""}> `;
                text = task[2];
              }
              const children = item.children.length ? renderTree(item) : "";
              return `<li>${checkbox}${inline(text)}${children}</li>`;
            })
            .join("");
          return `<${tag}>${items}</${tag}>`;
        })
        .join("");

    return { html: renderTree(root), next: i };
  };

  const html = parseBlocks(lines);
  return { html, headings };
}
