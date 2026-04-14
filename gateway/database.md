# 数据库参考

Clawline Gateway 使用 PostgreSQL（通过 Supabase）持久化存储。所有表使用 `public` schema，以 `cl_` 为前缀。

主 schema 文件位于 `gateway/supabase/schema.sql`。

---

## 表结构

### cl_channels

Channel 定义表。每个 channel 代表一个 backend 插件连接的通信端点。

| 列 | 类型 | 可空 | 默认值 | 说明 |
|---|------|------|--------|------|
| `channel_id` | `text` | 否 | - | **主键**，唯一标识 |
| `label` | `text` | 是 | `NULL` | 显示名称 |
| `secret` | `text` | 否 | - | Backend 鉴权密钥，用于 `relay.backend.hello` 握手 |
| `token_param` | `text` | 否 | `'token'` | 客户端 token 的 query 参数名 |
| `created_at` | `timestamptz` | 否 | `now()` | 创建时间 |
| `updated_at` | `timestamptz` | 否 | `now()` | 更新时间（自动触发器） |

---

### cl_channel_users

Channel 授权用户表。配置了用户的 channel 要求客户端连接时提供匹配的 token。

| 列 | 类型 | 可空 | 默认值 | 说明 |
|---|------|------|--------|------|
| `channel_id` | `text` | 否 | - | **联合主键**，外键关联 `cl_channels`，级联删除 |
| `sender_id` | `text` | 否 | - | **联合主键**，用户标识 |
| `id` | `text` | 否 | - | 内部用户 ID |
| `chat_id` | `text` | 是 | `NULL` | 绑定的 chatId，设置后用户只能使用该 chatId 连接 |
| `token` | `text` | 否 | - | WebSocket 和 REST API 鉴权 token |
| `allow_agents` | `jsonb` | 是 | `NULL` | 允许的 Agent 列表，`NULL` 或 `["*"]` 表示全部 |
| `enabled` | `boolean` | 否 | `true` | 是否启用 |
| `created_at` | `timestamptz` | 否 | `now()` | 创建时间 |
| `updated_at` | `timestamptz` | 否 | `now()` | 更新时间（自动触发器） |

**索引：**
- `cl_channel_users_channel_token_idx` on `(channel_id, token)` -- 加速 token 鉴权查询

---

### cl_messages

消息存储表，记录所有经网关中转的入站和出站消息。用于消息同步、管理日志和统计。

| 列 | 类型 | 可空 | 默认值 | 说明 |
|---|------|------|--------|------|
| `id` | `uuid` | 否 | `gen_random_uuid()` | **主键** |
| `channel_id` | `text` | 否 | - | 所属 channel |
| `sender_id` | `text` | 是 | `NULL` | 发送者 |
| `agent_id` | `text` | 是 | `NULL` | 处理消息的 Agent |
| `message_id` | `text` | 是 | `NULL` | 应用层消息 ID |
| `content` | `text` | 是 | `NULL` | 消息文本 |
| `content_type` | `text` | 否 | `'text'` | 内容类型 |
| `direction` | `text` | 否 | - | `"inbound"` 或 `"outbound"`，CHECK 约束 |
| `media_url` | `text` | 是 | `NULL` | 附件 URL |
| `parent_id` | `text` | 是 | `NULL` | 父消息 ID（线程回复） |
| `meta` | `jsonb` | 是 | `NULL` | 元数据 |
| `timestamp` | `bigint` | 否 | - | Unix 毫秒时间戳，主排序字段 |
| `created_at` | `timestamptz` | 否 | `now()` | 记录创建时间 |

> `thread_id` 列在网关查询中使用但未在基础 schema 中定义，需手动添加：
> ```sql
> ALTER TABLE public.cl_messages ADD COLUMN IF NOT EXISTS thread_id text;
> ```

**索引：**
- `cl_messages_channel_ts_idx` on `(channel_id, timestamp DESC)` -- 按时间查询
- `cl_messages_sender_idx` on `(channel_id, sender_id, timestamp DESC)` -- 按用户查询
- `cl_messages_msgid_dir_uniq` unique on `(message_id, direction) WHERE message_id IS NOT NULL` -- 去重

**持久化行为：**
- 仅持久化 `message.receive` 和 `message.send` 事件
- 同步写入，5xx 错误最多重试 2 次
- 最终失败写入死信文件 `data/persist-failures.jsonl`
- 服务启动时自动重放死信消息
- 通过 `resolution=ignore-duplicates` 忽略重复插入

---

### cl_settings

键值对配置存储，用于 AI 设置、CORS 等网关级配置。

| 列 | 类型 | 可空 | 默认值 | 说明 |
|---|------|------|--------|------|
| `key` | `text` | 否 | - | **主键** |
| `value` | `jsonb` | 否 | `'{}'` | JSON 值 |
| `updated_at` | `timestamptz` | 否 | `now()` | 更新时间（自动触发器） |

**已知键：**

| 键 | 说明 |
|----|------|
| `ai` | LLM 配置（endpoint、API key、模型、提示词） |
| `relay` | 通用设置（CORS 等） |

**缓存：** AI 设置内存缓存 60 秒 TTL；Relay 设置进程生命周期缓存。

---

### cl_relay_nodes

多节点注册表，未在基础 schema 中定义，需手动创建。

| 列 | 类型 | 可空 | 说明 |
|---|------|------|------|
| `id` | `text` | 否 | **主键**，节点 ID |
| `name` | `text` | 否 | 节点名称 |
| `url` | `text` | 否 | 节点 URL |
| `admin_token` | `text` | 是 | 远程管理 token |
| `created_at` | `timestamptz` | 否 | 创建时间 |

```sql
CREATE TABLE IF NOT EXISTS public.cl_relay_nodes (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  url         text NOT NULL,
  admin_token text DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

API 使用 PostgREST upsert（`resolution=merge-duplicates`）。

---

## 共享基础设施

### 自动更新触发器函数

所有带 `updated_at` 列的表使用共享触发器函数：

```sql
CREATE OR REPLACE FUNCTION public.cl_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
```

作为 `BEFORE UPDATE` 触发器绑定到 `cl_channels`、`cl_channel_users` 和 `cl_settings`。

---

## Schema 部署

1. **Supabase Dashboard** -- 在 SQL Editor 中粘贴执行
2. **psql** -- `psql $DATABASE_URL -f gateway/supabase/schema.sql`
3. **脚本** -- `gateway/scripts/schema.sql` 包含 `cl_messages` 和 `cl_settings` 的独立子集
