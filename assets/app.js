/* 站点交互：主题、搜索、目录高亮、阅读进度、复制代码。没有依赖。 */
(() => {
  "use strict";

  const root = document.documentElement;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  /* ----------------------------- theme ---------------------------------- */

  const themeBtn = $("#theme-toggle");
  const mq = window.matchMedia("(prefers-color-scheme: dark)");

  const applyTheme = (theme) => {
    root.setAttribute("data-theme", theme);
    if (themeBtn) {
      themeBtn.setAttribute("aria-label", theme === "dark" ? "切换到浅色" : "切换到深色");
    }
  };

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        localStorage.setItem("theme", next);
      } catch {
        /* 忽略隐私模式下的存储失败 */
      }
    });
  }

  mq.addEventListener?.("change", (event) => {
    let stored = null;
    try {
      stored = localStorage.getItem("theme");
    } catch {
      /* ignore */
    }
    if (!stored) applyTheme(event.matches ? "dark" : "light");
  });

  /* ---------------------------- header ---------------------------------- */

  const header = $("#site-header");
  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------------------------- search ---------------------------------- */

  const dialog = $("#search-dialog");
  const openBtn = $("#search-open");
  const closeBtn = $("#search-close");
  const input = $("#search-input");
  const resultsEl = $("#search-results");

  const state = { index: null, loading: false, results: [], active: -1 };

  const escapeHtml = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const mark = (text, query) => {
    const safe = escapeHtml(text);
    if (!query) return safe;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return safe.replace(new RegExp(`(${escaped})`, "gi"), "<mark>$1</mark>");
  };

  async function loadIndex() {
    if (state.index || state.loading) return;
    state.loading = true;
    try {
      const res = await fetch("/search-index.json", { cache: "force-cache" });
      if (!res.ok) throw new Error(String(res.status));
      state.index = await res.json();
    } catch {
      state.index = [];
      resultsEl.innerHTML = '<p class="search-empty">搜索索引加载失败，请刷新页面再试。</p>';
    } finally {
      state.loading = false;
    }
  }

  function score(item, q) {
    const title = item.title.toLowerCase();
    const summary = (item.summary || "").toLowerCase();
    const tags = (item.tags || []).join(" ").toLowerCase();
    const text = (item.text || "").toLowerCase();
    let s = 0;
    if (title === q) s += 30;
    if (title.startsWith(q)) s += 16;
    if (title.includes(q)) s += 10;
    if (tags.includes(q)) s += 6;
    if (summary.includes(q)) s += 4;
    if (text.includes(q)) s += 2;
    return s;
  }

  function renderResults(query) {
    const q = query.trim().toLowerCase();
    state.active = -1;

    if (!q) {
      state.results = [];
      resultsEl.innerHTML =
        '<p class="search-hint">输入关键词开始搜索，↑↓ 选择，Enter 打开。</p>';
      return;
    }

    const items = (state.index || [])
      .map((item) => ({ item, s: score(item, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.item);

    state.results = items;

    if (!items.length) {
      resultsEl.innerHTML = `<p class="search-empty">没有找到与「${escapeHtml(query)}」相关的文章。</p>`;
      return;
    }

    resultsEl.innerHTML = items
      .map(
        (item, i) => `<a class="search-result${i === 0 ? " is-active" : ""}" href="${item.url}" data-index="${i}">
  <span class="search-result-title">${mark(item.title, q)}</span>
  <span class="search-result-meta">${item.date.replace(/-/g, ".")} · ${(item.tags || [])
          .map((t) => escapeHtml(t))
          .join(" / ")}</span>
</a>`
      )
      .join("");

    state.active = 0;
  }

  function moveActive(delta) {
    const nodes = $$(".search-result", resultsEl);
    if (!nodes.length) return;
    state.active = (state.active + delta + nodes.length) % nodes.length;
    nodes.forEach((node, i) => node.classList.toggle("is-active", i === state.active));
    nodes[state.active].scrollIntoView({ block: "nearest" });
  }

  function openSearch() {
    if (!dialog || dialog.open) return;
    dialog.showModal();
    loadIndex();
    renderResults(input.value);
    requestAnimationFrame(() => input.focus());
  }

  function closeSearch() {
    if (dialog && dialog.open) dialog.close();
  }

  if (dialog) {
    openBtn?.addEventListener("click", openSearch);
    closeBtn?.addEventListener("click", closeSearch);

    input.addEventListener("input", () => renderResults(input.value));

    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveActive(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveActive(-1);
      } else if (event.key === "Enter") {
        const item = state.results[state.active];
        if (item) {
          event.preventDefault();
          window.location.href = item.url;
        }
      }
    });

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeSearch();
    });

    dialog.addEventListener("close", () => {
      input.value = "";
      state.active = -1;
    });

    document.addEventListener("keydown", (event) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        openSearch();
      } else if (event.key === "/" && !typing) {
        event.preventDefault();
        openSearch();
      }
    });
  }

  /* --------------------------- copy code -------------------------------- */

  $$(".code-copy").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const block = btn.closest(".code-block");
      const code = block?.querySelector("code");
      if (!code) return;
      const text = code.innerText;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      btn.textContent = "已复制";
      setTimeout(() => {
        btn.textContent = "复制";
      }, 1600);
    });
  });

  /* ----------------------- toc + reading progress ----------------------- */

  const tocLinks = $$(".post-toc a");
  const readingBar = $("#reading-bar");

  if (tocLinks.length || readingBar) {
    let headings = [];

    const measure = () => {
      headings = tocLinks
        .map((link) => {
          const id = link.getAttribute("href").slice(1);
          const el = document.getElementById(id);
          if (!el) return null;
          return { link, top: el.getBoundingClientRect().top + window.scrollY };
        })
        .filter(Boolean);
    };

    let ticking = false;

    const update = () => {
      ticking = false;

      if (readingBar) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        readingBar.style.width = `${ratio * 100}%`;
      }

      if (headings.length) {
        const line = window.scrollY + 120;
        let current = 0;
        for (let i = 0; i < headings.length; i += 1) {
          if (headings[i].top <= line) current = i;
        }
        headings.forEach((h, i) => h.link.classList.toggle("is-active", i === current));
      }
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    measure();
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", () => {
      measure();
      update();
    });
  }

  /* --------------------------- small things ----------------------------- */

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");
  $$(".kbd").forEach((el) => {
    el.textContent = isMac ? "⌘K" : "Ctrl K";
  });
})();
