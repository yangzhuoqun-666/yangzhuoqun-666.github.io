#!/usr/bin/env node
/**
 * 一次性迁移：把当前 dist-only 仓库改成「源码 + GitHub Actions」。
 * 迁移后，写作台的「发布上线」会提交 content/posts/*.md，
 * Actions 自动构建并部署到 GitHub Pages。
 *
 *   $env:GITHUB_TOKEN = "ghp_xxx"
 *   node scripts/migrate-to-actions.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import dns from "node:dns";
import { fileURLToPath } from "node:url";

dns.setDefaultResultOrder("ipv4first");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO || "yangzhuoqun-666/yangzhuoqun-666.github.io";
const [OWNER, NAME] = REPO.split("/");
const BRANCH = process.env.GITHUB_BRANCH || "main";
const API = "https://api.github.com";

if (!TOKEN) throw new Error("缺少 GITHUB_TOKEN 环境变量。");

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "User-Agent": "dsh-migrate",
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function gh(route, { method = "GET", body } = {}, attempt = 0) {
  let response;
  try {
    response = await fetch(`${API}${route}`, {
      method,
      headers: body ? { ...headers, "Content-Type": "application/json" } : headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000),
    });
  } catch (error) {
    if (attempt < 5) {
      const wait = 1500 * (attempt + 1);
      console.warn(`\n  网络失败，${wait}ms 后重试 ${method} ${route}（${error.message}）`);
      await sleep(wait);
      return gh(route, { method, body }, attempt + 1);
    }
    throw new Error(`${method} ${route} 网络失败：${error.message}`);
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 4) {
      const wait = 2000 * (attempt + 1);
      console.warn(`\n  GitHub ${response.status}，${wait}ms 后重试 ${method} ${route}`);
      await sleep(wait);
      return gh(route, { method, body }, attempt + 1);
    }
    throw new Error(`${method} ${route} -> ${response.status} ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }

  return data;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function collectFiles(dir, base = dir) {
  const out = [];
  const skipDirs = new Set(["dist", "node_modules", ".git", ".shots", ".shots2"]);
  const skipExtensions = new Set([".zip", ".log"]);

  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    if (entry.name.startsWith(".edge-")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectFiles(full, base)));
    } else if (!skipExtensions.has(path.extname(entry.name))) {
      out.push({ full, rel: path.relative(base, full).split(path.sep).join("/") });
    }
  }
  return out;
}

async function main() {
  const me = await gh("/user");
  console.log(`登录：${me.login}`);

  let parent = null;
  try {
    const ref = await gh(`/repos/${OWNER}/${NAME}/git/ref/heads/${BRANCH}`);
    parent = ref.object.sha;
  } catch (error) {
    if (!/-> (404|409) /.test(error.message)) throw error;
  }

  const files = await collectFiles(ROOT);
  console.log(`准备上传 ${files.length} 个源码文件（不含 dist）`);

  if (process.env.DRY_RUN === "1") {
    for (const file of files) console.log(file.rel);
    return;
  }

  const tree = [];
  for (const file of files) {
    const content = (await fs.readFile(file.full)).toString("base64");
    const blob = await gh(`/repos/${OWNER}/${NAME}/git/blobs`, {
      method: "POST",
      body: { content, encoding: "base64" },
    });
    tree.push({ path: file.rel, mode: "100644", type: "blob", sha: blob.sha });
    process.stdout.write(`\r  blob ${tree.length}/${files.length}`);
  }
  process.stdout.write("\n");

  const newTree = await gh(`/repos/${OWNER}/${NAME}/git/trees`, {
    method: "POST",
    body: { tree },
  }).catch((error) => {
    if (error.message.includes("git/trees -> 404")) {
      throw new Error(
        "GitHub 拒绝创建包含 .github/workflows/deploy.yml 的 tree：token 缺少 workflow 权限。请用 repo + workflow 重新生成 token。"
      );
    }
    throw error;
  });

  const commit = await gh(`/repos/${OWNER}/${NAME}/git/commits`, {
    method: "POST",
    body: {
      message: "Switch blog to source + GitHub Actions",
      tree: newTree.sha,
      parents: parent ? [parent] : [],
    },
  });

  if (parent) {
    await gh(`/repos/${OWNER}/${NAME}/git/refs/heads/${BRANCH}`, {
      method: "PATCH",
      body: { sha: commit.sha, force: true },
    });
  } else {
    await gh(`/repos/${OWNER}/${NAME}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${BRANCH}`, sha: commit.sha },
    });
  }
  console.log(`源码已推送：${commit.sha.slice(0, 7)}`);

  // 把 Pages 从「分支部署」切到「GitHub Actions」
  try {
    await gh(`/repos/${OWNER}/${NAME}/pages`, {
      method: "PUT",
      body: { build_type: "workflow" },
    });
    console.log("Pages 已切换为 GitHub Actions。");
  } catch (error) {
    console.warn("切换 Pages 模式失败，尝试重建 Pages：", error.message);
    try {
      await gh(`/repos/${OWNER}/${NAME}/pages`, { method: "DELETE" });
    } catch {
      /* 可能本来就没有 */
    }
    try {
      await gh(`/repos/${OWNER}/${NAME}/pages`, {
        method: "POST",
        body: { build_type: "workflow" },
      });
      console.log("Pages 已重建为 GitHub Actions。");
    } catch (err) {
      console.warn("Pages 重建失败，交给 workflow 里的 configure-pages：", err.message);
    }
  }

  // 等 workflow 起来
  let run = null;
  for (let i = 0; i < 40; i += 1) {
    const data = await gh(
      `/repos/${OWNER}/${NAME}/actions/runs?head_sha=${commit.sha}&per_page=5`
    );
    run = data.workflow_runs?.[0] || null;
    if (run) break;
    await sleep(3000);
  }

  if (!run) {
    console.log("没有自动触发，手动 dispatch workflow…");
    await gh(`/repos/${OWNER}/${NAME}/actions/workflows/deploy.yml/dispatches`, {
      method: "POST",
      body: { ref: BRANCH },
    });
    for (let i = 0; i < 20; i += 1) {
      const data = await gh(
        `/repos/${OWNER}/${NAME}/actions/runs?head_sha=${commit.sha}&per_page=5`
      );
      run = data.workflow_runs?.[0] || null;
      if (run) break;
      await sleep(3000);
    }
  }

  if (!run) throw new Error("workflow 没有启动。");
  console.log(`workflow：${run.html_url}`);

  for (let i = 0; i < 60; i += 1) {
    const data = await gh(`/repos/${OWNER}/${NAME}/actions/runs/${run.id}`);
    console.log(`  ${data.status}${data.conclusion ? ` / ${data.conclusion}` : ""}`);
    if (data.status === "completed") {
      if (data.conclusion !== "success") {
        throw new Error(`构建失败：${data.html_url}`);
      }
      break;
    }
    await sleep(5000);
  }

  console.log(`\n✓ 完成：https://${OWNER}.github.io/`);
}

main().catch((error) => {
  console.error("\n✗ 迁移失败：", error.message);
  process.exitCode = 1;
});
