# mBlock

[Português](README.md) · [English](README.en.md) · [简体中文](README.zh-CN.md)

适用于 Chrome、Edge 和 Firefox 的广告与跟踪器拦截扩展，使用 Manifest V3 原生规则，提供按网站控制和本地诊断。**0.3.0** 移除了 Alpha 标签。名称变更并不代表已达到或超越 uBlock Origin。

## 功能

- 通过 `declarativeNetRequest` 原生拦截网络请求。
- 弹出菜单中的**屏蔽元素**：点击元素、检查预览并保存仅针对当前主机名的 CSS 规则。Esc 或取消可恢复预览。规则在重新加载后仍然有效；要永久撤销，请在**我的过滤规则**中删除。选择器仅支持顶层文档，不支持框架和 Shadow DOM。
- 默认启用自动更新过滤列表，可选择 **1、6、12、24 或 48 小时**。启动后检查过期列表；哈希未变时复用编译结果。
- 事务式更新、恢复上一个配置；列表验证失败时保留现有规则。
- 按域名配置、全局暂停、按网站控制 CSS、带预览的 TXT/JSON 导入及规则/设置导出。
- 可选的 30 秒至 5 分钟诊断，限制内存使用、精简 URL 并支持本地导出。无遥测。
- 内置 YouTube 配置，使用遵循 GPLv3 的 uBlock scriptlet，并提供保守的视频播放恢复。无法保证拦截所有广告或不被检测。
- 基于特征和启发式分析的本地反广告拦截助手，不是生成式 AI。FC Portables 修复仅针对已知加载器特征。
- 葡萄牙语、英语和简体中文界面。可通过 PayPal 向 `jv12802@gmail.com` 自愿捐赠。

## 安装

请使用 [Release 附件](https://github.com/linuxhell/mblock/releases)。今后的发行仅包含 Chrome/Edge 安装包、**Mozilla 签名**的 Firefox XPI 和校验和，不上传源码 ZIP 附件。GitHub 会根据标签自动生成自己的源码下载链接。

| 浏览器 | 安装方法 |
| --- | --- |
| Chrome 121+ | 解压 `mblock-chrome-版本.zip`，在 `chrome://extensions` 启用开发者模式，选择加载已解压的扩展程序。 |
| Edge 121+ | 解压 `mblock-edge-版本.zip`，在 `edge://extensions` 启用开发者模式，加载解压后的扩展程序。 |
| Firefox 142+ | 安装已签名的 `mblock-firefox-版本.xpi`。将 ZIP 重命名为 XPI 不会生成有效签名。 |

更新 Chrome/Edge 时替换原安装目录中的文件并重新加载扩展，以保留 ID 和数据。Firefox 保持 ID `mblock@linuxhell.github.io`。更改过滤规则、暂停或 CSS 设置后，请重新加载已打开的页面。过滤列表与扩展代码分别更新；内置 scriptlet 和修复需要发布新的扩展版本。

## 与 uBlock Origin 的比较

目标是用可复现的证据证明 mBlock 超越 uBlock Origin。**目前尚未证明整体性能或效果更优。** uBO 已具有元素选择和自动更新；这些只是 mBlock 新增的功能。

| 项目 | mBlock | 完整版 uBlock Origin |
| --- | --- | --- |
| 网络过滤 | 原生 DNR，受 MV3 配额限制 | 自有过滤引擎 |
| 过滤语法 | ABP/uBO 的子集；面板显示不支持的规则 | 更广泛的语法、scriptlet 和过程式过滤 |
| 默认通用 CSS | 关闭，可按网站开启 | 默认开启 |
| 诊断 | 临时会话及精简 URL 导出 | 日志记录器和高级工具 |
| 改进方向 | 减少页面工作、可验证更新及简明诊断 | 拦截覆盖率和兼容性的参照 |

2026 年 11 月 12 日收集的列表中仍约有两万条不支持的规则，包括许多 scriptlet 和过程式过滤。因此不能将 mBlock 视为等效替代品。如果省略了功能，更低的 CPU 占用或更少的规则并不能证明拦截效果更好。

请参阅[审计报告](docs/AUDIT-0.3.0.md)和[验证与基准测试说明](docs/VALIDATION.md)（葡萄牙语技术文档）。基准测试拒绝测量未生效的扩展，记录 CPU、内存和时间，并验证广告请求被拦截且必要内容正常。受控对比使用同时支持 MV2/MV3 的历史 Chromium 版本，不能代表所有当前浏览器或真实网站的表现。

## 隐私与限制

列表仅作为数据使用，不运行下载的代码。自动更新会请求公开列表 URL。诊断不读取 Cookie、请求体或请求头。可选的 URL 路径可能包含个人信息；分享前请检查导出文件。HTTP/HTTPS 权限用于注入 CSS 和在选定标签页中运行工具。诊断网络监听器只在诊断会话期间启用。

不保证无法被反广告拦截检测。在 Chromium 中，精确的原生规则日志要求以解压方式安装扩展。元素规则使用 CSS 隐藏内容，本身不会阻止相关资源下载。网站变更后可能需要调整选择器。

## 开发

需要 Node.js 22+、Python 3 和 Git：

```sh
npm ci
npm test
npm run fetch:lists
npm run build
node scripts/lint-firefox.mjs
npx playwright install --with-deps chromium
npm run test:browser
npm run benchmark
npm run package
```

`npm run package` 仅在 `artifacts/` 中生成 Chrome/Edge 包及校验和。需要全部安装包时，先取得 Mozilla 返回的 XPI，再运行 `python3 scripts/package.py --require-firefox --signed-firefox /路径/已签名.xpi`。脚本检查版本、扩展 ID 和签名记录是否存在，但不执行密码学签名验证；可信签名来源是 Mozilla。

手动运行 **Signed installation release** 工作流可验证、请求 Mozilla 签名并发布三个安装包。请在仓库中配置 `AMO_JWT_ISSUER` 和 `AMO_JWT_SECRET` Secrets。未成功取得签名时不会发布。参见 [Firefox 签名说明](docs/FIREFOX_SIGNING.md)。

GPL-3.0-only。源码保留在本仓库；安装包包含许可证和署名。参阅 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
