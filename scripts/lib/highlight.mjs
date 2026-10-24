/**
 * 零依赖的语法高亮。只做保守的注释 / 字符串 / 数字 / 关键字着色，
 * 所有内容都先转义，永远不会破坏 HTML 结构。
 */

const KEYWORDS = {
  js: `await async break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while with yield true false null undefined`,
  ts: `abstract any as asserts await async break case catch class const constructor continue declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let module namespace never new null number object of override private protected public readonly return set static string super switch symbol this throw true try type typeof undefined unique unknown var void while yield`,
  python: `and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield match case`,
  bash: `if then elif else fi for while until do done case esac function in select time coproc return exit local export readonly declare unset shift source alias echo cd pwd set trap`,
  json: `true false null`,
  css: `important media supports keyframes font-face import charset layer container`,
};

const LANGS = {
  js: { line: "//", block: ["/*", "*/"], quotes: ['"', "'", "`"], keywords: "js" },
  ts: { line: "//", block: ["/*", "*/"], quotes: ['"', "'", "`"], keywords: "ts" },
  python: {
    line: "#",
    quotes: ['"', "'"],
    triple: true,
    keywords: "python",
    decorator: true,
  },
  bash: { line: "#", quotes: ['"', "'"], keywords: "bash", variables: true },
  sh: { line: "#", quotes: ['"', "'"], keywords: "bash", variables: true },
  json: { quotes: ['"'], keywords: "json", json: true },
  css: { block: ["/*", "*/"], quotes: ['"', "'"], keywords: "css", css: true },
  html: { markup: true },
  xml: { markup: true },
  plain: {},
};

const ALIASES = {
  javascript: "js",
  jsx: "js",
  mjs: "js",
  cjs: "js",
  typescript: "ts",
  tsx: "ts",
  py: "python",
  shell: "bash",
  zsh: "bash",
  sh: "bash",
  yml: "plain",
  yaml: "plain",
  md: "plain",
  markdown: "plain",
  text: "plain",
  txt: "plain",
  console: "bash",
  svg: "html",
};

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function normalizeLang(lang) {
  const key = String(lang || "").toLowerCase();
  return LANGS[key] ? key : ALIASES[key] && LANGS[ALIASES[key]] ? ALIASES[key] : "plain";
}

export function highlight(code, lang) {
  const name = normalizeLang(lang);
  const cfg = LANGS[name] || LANGS.plain;
  const kw = KEYWORDS[cfg.keywords] ? new Set(KEYWORDS[cfg.keywords].split(/\s+/)) : new Set();
  const src = String(code).replace(/\r\n/g, "\n").replace(/\s+$/, "");

  if (cfg.markup) return highlightMarkup(src);

  let out = "";
  let i = 0;

  const span = (cls, text) => `<span class="tok-${cls}">${escapeHtml(text)}</span>`;

  while (i < src.length) {
    // 块注释
    if (cfg.block && src.startsWith(cfg.block[0], i)) {
      const end = src.indexOf(cfg.block[1], i + cfg.block[0].length);
      const stop = end === -1 ? src.length : end + cfg.block[1].length;
      out += span("cmt", src.slice(i, stop));
      i = stop;
      continue;
    }

    // 行注释
    if (cfg.line && src.startsWith(cfg.line, i)) {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      out += span("cmt", src.slice(i, stop));
      i = stop;
      continue;
    }

    // Python 三引号
    if (cfg.triple && (src.startsWith('"""', i) || src.startsWith("'''", i))) {
      const q = src.slice(i, i + 3);
      const end = src.indexOf(q, i + 3);
      const stop = end === -1 ? src.length : end + 3;
      out += span("str", src.slice(i, stop));
      i = stop;
      continue;
    }

    const ch = src[i];

    // 字符串
    if (cfg.quotes && cfg.quotes.includes(ch)) {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === ch) {
          j += 1;
          break;
        }
        if (ch !== "`" && src[j] === "\n") break;
        j += 1;
      }
      const isKey = cfg.json && /^\s*:/.test(src.slice(j));
      out += span(isKey ? "prop" : "str", src.slice(i, j));
      i = j;
      continue;
    }

    // 数字（含十六进制、小数、指数）
    if (/[0-9]/.test(ch) && !/[A-Za-z0-9_$]/.test(src[i - 1] || "")) {
      const m = src.slice(i).match(/^(0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
      if (m) {
        out += span("num", m[0]);
        i += m[0].length;
        continue;
      }
    }

    // 标识符 / 关键字
    if (/[A-Za-z_$@]/.test(ch)) {
      const start = i;
      if (ch === "@") i += 1;
      if (/[A-Za-z_$]/.test(src[i] || "")) {
        i += 1;
        while (/[A-Za-z0-9_$-]/.test(src[i] || "")) i += 1;
      }
      const word = src.slice(start, i);
      const next = src.slice(i).match(/^\s*/)[0].length + i;
      const isCall = src[next] === "(";

      if (cfg.variables && ch === "$") {
        out += span("var", word);
      } else if (kw.has(word)) {
        out += span("kw", word);
      } else if (cfg.json && src[next] !== ":" && (word === "true" || word === "false" || word === "null")) {
        out += span("kw", word);
      } else if (cfg.css && src[next] === ":") {
        out += span("prop", word);
      } else if (isCall) {
        out += span("fn", word);
      } else {
        out += escapeHtml(word);
      }
      continue;
    }

    // CSS 十六进制颜色
    if (cfg.css && ch === "#" && /[0-9a-fA-F]{3,8}/.test(src.slice(i + 1))) {
      const m = src.slice(i).match(/^#[0-9a-fA-F]{3,8}/);
      out += span("num", m[0]);
      i += m[0].length;
      continue;
    }

    out += escapeHtml(ch);
    i += 1;
  }

  return out;
}

function highlightMarkup(src) {
  let out = "";
  let i = 0;
  const esc = escapeHtml;

  while (i < src.length) {
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      const stop = end === -1 ? src.length : end + 3;
      out += `<span class="tok-cmt">${esc(src.slice(i, stop))}</span>`;
      i = stop;
      continue;
    }

    if (src[i] === "<") {
      const m = src.slice(i).match(/^<\/?[A-Za-z][\w:-]*/);
      if (m) {
        out += `<span class="tok-tag">${esc(m[0])}</span>`;
        i += m[0].length;
        // 属性
        while (i < src.length && src[i] !== ">") {
          const attr = src.slice(i).match(/^[\w:-]+/);
          if (attr) {
            out += `<span class="tok-attr">${esc(attr[0])}</span>`;
            i += attr[0].length;
          } else if (src[i] === '"' || src[i] === "'") {
            const q = src[i];
            let j = i + 1;
            while (j < src.length && src[j] !== q) j += 1;
            j = Math.min(j + 1, src.length);
            out += `<span class="tok-str">${esc(src.slice(i, j))}</span>`;
            i = j;
          } else {
            out += esc(src[i]);
            i += 1;
          }
        }
        if (src[i] === ">") {
          out += '<span class="tok-tag">&gt;</span>';
          i += 1;
        }
        continue;
      }
    }

    out += esc(src[i]);
    i += 1;
  }

  return out;
}
