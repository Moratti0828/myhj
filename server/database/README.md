# 数据库模块

主项目安装与配置请参阅 [README](../../README.md#mysql-配置)。

- `db.js`：初始化三张业务表、字段升级、连接池、事务与 JSON 兜底。
- `users.js`：scrypt 密码与历史 SHA-256 登录升级；`password_hash` 初始化后为 VARCHAR(255)。
- `gallery.js`：作品、`video_url`／`video_prompt` 与题材统计；写入与统计使用事务。
- `migrate-json-to-mysql.js`：读取本地配置，迁移 JSON 用户与作品，重建统计；连接失败时拒绝把 JSON 兜底当作迁移成功。

真实配置位于被忽略的 `server/.env.local`，不可上传。运行数据位于 `server/data/` 与 `public/user_images/`，不放在数据库源码目录。

应用启动优先 MySQL；失败则启用 JSON，两种存储不自动同步。确认启动日志显示 MySQL connected，再验证持久化。迁移前备份数据和图片，执行 `npm run migrate:mysql --prefix server`，迁移后核对用户数、作品数及统计。

测试命令：`npm run test:mysql --prefix server`。仅使用不存在的专用 `moyun_huajing_test`，已有同名库则失败退出。测试覆盖认证、历史密码升级、Unicode、视频字段、统计、事务回滚、重连持久化、归属及 HTTP 接口。

管理员初始化只创建或提升角色，不覆盖已有密码。管理页面为 `/admin`，数据必须经过后端权限校验。
