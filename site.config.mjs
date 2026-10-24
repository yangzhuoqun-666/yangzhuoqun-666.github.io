/**
 * 站点配置：改这里就能改全站文案。
 */
export default {
  title: "杨卓群",
  subtitle: "YANG ZHUOQUN",
  tagline: "写代码，也写点别的",
  description: "杨卓群的个人博客：写代码，也写点别的。记录技术、阅读与生活。",
  author: "杨卓群",
  email: "yangzhuoqun_youxi@outlook.com",
  url: "https://blog.yangzhuoqun.is-a.dev",
  githubRepo: "yangzhuoqun-666/yangzhuoqun-666.github.io",
  githubBranch: "main",
  lang: "zh-CN",
  locale: "zh_CN",
  timezone: "Asia/Shanghai",

  nav: [
    { label: "文章", href: "/" },
    { label: "归档", href: "/archive/" },
    { label: "标签", href: "/tags/" },
    { label: "关于", href: "/about/" },
  ],

  social: [
    { label: "GitHub", href: "https://github.com/yangzhuoqun-666" },
    { label: "RSS", href: "/feed.xml" },
  ],

  /** 中文标签 -> 干净的 URL 片段 */
  tagSlugs: {
    随笔: "essays",
    技术: "tech",
    前端: "frontend",
    阅读: "reading",
    生活: "life",
    设计: "design",
    站点: "site",
    写作: "writing",
    效率: "productivity",
  },

  /** 首页最多展示的文章数，更多请去归档页 */
  homePostLimit: 10,
  footerNote: "用纯静态的方式，慢慢写。",
};
