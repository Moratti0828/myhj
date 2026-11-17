# 墨韵画境

面向非遗文化传播的国风创作 Web 应用：从手绘草图、国风生图，到可编辑故事方案、图生视频和个人画廊。

- 团队：**墨小组** · 参赛编号：**45589**
- 仓库：https://github.com/Moratti0828/myhj
- 学校：**云南大学**
- 团队成员：**金明源、邵江妍、蔡知彤**
- 指导教师：**莫启**

### 团队分工（建议稿，待成员确认）

| 成员 | 建议负责内容 |
| --- | --- |
| 金明源 | 项目统筹、前后端集成、AI 接口与数据库配置、代码发布 |
| 邵江妍 | 界面与交互优化、非遗内容整理、演示流程与素材准备 |
| 蔡知彤 | 功能测试、技术文档整理、演示视频制作与提交材料核对 |

以上为提交前拟定的分工，请团队按实际贡献确认或调整。

- 版本说明：2026-11-17 整理。已完成一轮真实 AI API 链路验收，结果与效果限制见 [实测记录](docs/AI_LIVE_TEST_2026-11-17.md)。本轮为有限样本，不代表所有参数或浏览器交互均已验收。

最新质量修复与效果对照见 [AI 质量改进报告](docs/AI_QUALITY_2026-11-17.md)：新增双图语义复核、原草图返修及视频保真优先模式。有限样本改善不代表所有结果自动合格。

## 功能与特色

| 功能 | 实现与边界 |
| --- | --- |
| 国风创作台 | 手绘／导入草图、题材与风格选择、提示词增强、SSE 进度与作品保存 |
| 构图守门 | 画意契约、候选生成、结构评分、择优与有限返修；指标是结构辅助判断，不是艺术质量评分 |
| 书法分层保真 | 本地保留墨迹、合成纸张背景，不调用收费模型 |
| 非遗 AI 书童 | 本地知识命中直接回答；开放问答使用远端模型，回退来源明确标识 |
| AI 叙事 | 三组故事提案、分镜编辑与排序、IndexedDB 草稿、Markdown／JSON 导出 |
| 动画工坊 | 万相异步任务、轮询与下载校验、原任务重试、图片与视频共同入库 |
| 用户与画廊 | 登录注册、管理员统计、作品归属校验；MySQL 存储，启动失败时使用 JSON |

## 环境与快速启动

需要 Node.js >= 20.19、npm。建议 Node.js 22 或 24；使用 MySQL 时推荐 MySQL 8.4。所有命令均在仓库根目录执行。

```bash
git clone https://github.com/Moratti0828/myhj.git
cd myhj
npm run setup
npm start
```

访问 http://localhost:3000 。`setup` 用锁文件安装前后端依赖并构建前端，**不会自动创建环境配置文件**。没有 AI Key 时可以浏览非遗、使用画布、本地问答与书法保真；在线生成不可用。MySQL 不可用时会使用 JSON，不能把页面打开视作 MySQL 已连接。

需要 AI 或数据库时，先复制 `server/.env.example` 为 `server/.env.local`，按下文填写并重启。不要覆盖已有 `.env.local`。

开发模式：`npm run dev`，前端 http://localhost:7100 ，后端 http://localhost:3000 。按 Ctrl+C 停止。单端口启动不自动设置 `NODE_ENV=production`。

## 架构与目录

```text
Vue 3 / TypeScript / Pinia / Element Plus
                  ↓ HTTP / SSE
Express → 会话与权限 → AI 编排 → 硅基流动 / 百炼万相
                  ↓
          MySQL / JSON + 本地文件
```

```text
frontend/src/       页面、组件、状态与 API 封装
server/server.js   后端入口与路由
server/agent/      构图契约、结构评审、编排与叙事
server/providers/  模型适配、远端图片安全下载
server/vision/     本地结构指标
server/pipeline/   书法分层保真
server/database/   数据表初始化、读写与 JSON 迁移
server/scripts/    免费自检及独立 live 脚本
shared/            叙事母题与共享参数
public/assets/     页面静态素材
public/image/      非遗展示素材
```

运行时生成的 `server/data/`、`public/user_images/`、`public/uploads/` 不随源码发布。依赖清单位于两端 `package.json`，版本锁定位于对应 `package-lock.json`。

## MySQL 配置

用数据库管理员在本机执行以下模板（先替换示例密码）：

```sql
CREATE DATABASE IF NOT EXISTS moyun_huajing CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'moyun_app'@'localhost' IDENTIFIED BY 'REPLACE_WITH_A_RANDOM_PASSWORD';
GRANT ALL PRIVILEGES ON moyun_huajing.* TO 'moyun_app'@'localhost';
-- 只有运行集成测试时需要此独立测试库权限：
GRANT ALL PRIVILEGES ON moyun_huajing_test.* TO 'moyun_app'@'localhost';
```

在 `server/.env.local` 设置 `MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_USER=moyun_app`、`MYSQL_PASSWORD` 和 `MYSQL_DATABASE=moyun_huajing`。启动日志必须出现 `[db] MySQL connected and tables ready.`。三张表及字段升级由应用初始化：`users`、`artworks`、`artwork_type_counts`。

已有 JSON 数据迁移：先备份数据和图片，再运行 `npm run migrate:mysql --prefix server`。迁移保留原 JSON；MySQL 与 JSON 不会自动双向同步，正式演示前应确认存储模式。

## AI 配置与验收边界

仅后端配置密钥；`.env.local` 的非空值会覆盖 `.env` 以及同名进程环境变量。

| 配置 | 用途 |
| --- | --- |
| `SILICONFLOW_API_KEY` | 识图、提示词增强、生图／编辑、在线书童、故事提案 |
| `SILICONFLOW_IMAGE_MODEL` / `SILICONFLOW_IMAGE_EDIT_MODEL` | 默认 Qwen/Qwen-Image / Qwen/Qwen-Image-Edit-2509 |
| `SILICONFLOW_CAPTION_MODEL` | 默认 Qwen/Qwen3-VL-8B-Instruct |
| `SILICONFLOW_PROMPT_MODEL` / `SILICONFLOW_CHAT_MODEL` | 提示词与对话，具体默认值见模板 |
| `DASHSCOPE_API_KEY` | 万相图生视频；端点与 Key 的地域须匹配 |
| `SILICONFLOW_REVIEW_MODEL` | 双图语义复核，默认 Qwen/Qwen3-VL-32B-Instruct，另计推理费用 |
| `DASHSCOPE_VIDEO_MODEL` | 快速预览默认 wan2.6-i2v-flash |
| `DASHSCOPE_VIDEO_QUALITY_MODEL` | 保真优先／长镜默认 wan2.6-i2v，含音轨且费用更高 |

上述是项目配置值，不保证供应商当前为每个账号开放；真实验收前须确认模型权限、余额和付费预算。供应商错误或本地回退不能记录为真实 AI 成功。

图片链路：草图识别 → 规则提示词与可选大模型增强 → 生图／编辑 → 安全下载；构图模式额外执行契约、评审与择优。用户手填草图说明需要确认后使用。

生成与精修增加双图语义复核；不通过或不确定时不替换原作品。构图模式把主体缺失等语义错误作为硬性缺陷，几何分不等于画质分；仍需人工检查。

视频链路：创建项目任务 → 查询同一远端任务 → 下载并校验 MP4 → 终态停止查询。新页面默认保真优先 1080P 档、5 秒、含音轨；快速预览成本较低。短视频 5 秒，长视频 6–10 秒；故事提案总时长与单次视频时长是不同约束。

## 验证命令

```bash
npm run build                     # 类型检查及生产构建
npm test                          # Mock、结构、编排、叙事、后端回归、前端状态
npm run test:http                 # JSON 模式 HTTP / SSE / 权限集成
npm run test:mysql --prefix server # 真 MySQL + HTTP 集成（不调用收费 AI）
```

MySQL 测试创建专用 `moyun_huajing_test`，测试后清理；若该库已存在则拒绝复用或删除。请不要把它用作业务库。

`server/scripts/*live*.js` 是独立收费测试工具，不属于 `npm test`。其中旧结构／叙事脚本尚需适配登录会话，不能直接作为当前端到端验收依据。执行真实测试前先确定预算、登录流程与素材。万相 provider 测试还要求显式设置 `RUN_WAN_LIVE_TEST=true`，它不替代浏览器完整链路验收。

## 安全与部署

密码使用带盐 scrypt，历史 SHA-256 在成功登录后升级。会话落本地文件；用户作品与视频按归属校验，AI 请求有额度与并发限制，远端图片下载限制公网 HTTPS、大小和时间。

本地后端默认绑定 127.0.0.1。公网部署需另配 HTTPS、反向代理与允许来源，并使用至少 32 字符随机 `SESSION_SECRET`。生产模式 cookie 为 secure，纯 HTTP 下不能按生产模式验证登录。当前文件会话和本地文件适合单实例，未完成公网压测或多实例验证。`AI_DAILY_LIMIT` 是内部权重额度，不是人民币账单上限。

管理员可选：配置 `ADMIN_USERNAME`、`ADMIN_PASSWORD` 后重启会创建／提升管理员；已有账号不会因修改环境变量而重置密码。普通评审可自行注册，不发布真实账号密码。

若本地代理将图片域名解析为 `198.18.*`，可在本地配置 `IMAGE_DNS_OVER_HTTPS=true` 使用固定公共 DoH 解析；仍校验公网 IP 并钉扎下载地址，不会允许内网下载。供应商的 `application/octet-stream` 图片会经过真实解码校验。默认配置关闭 DoH。

密钥、数据库导出、私人用户数据、日志和生成素材不上传仓库。页面已有文化素材不意味着团队拥有全部版权；提交前应核对可使用范围与来源，勿宣称全部原创。

## 参赛材料

技术文档和讲解视频在提交目录单独整理。讲解视频由团队准备；本轮真实 AI 的结果与素材另行整理。所有测试结果以实际执行记录为准，历史产物不能替代本次验收。
