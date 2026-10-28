# db/

WEG 的数据层。SQLite 方言，目标运行时是 **Cloudflare D1**（库名 `weg`）。

设计说明与取舍见 `.agents/docs/261028/database-design.md`（不进仓库）。

## 结构

- `migrations/` — 按序号执行的 DDL，只增不改（改结构请开新文件）

## 常用命令

```bash
# 本地建库试跑（不碰云端）
rm -f /tmp/weg.db && sqlite3 /tmp/weg.db < db/migrations/0001_init.sql

# 应用到远端 D1
cd cloudflare/weg-proxy
npx wrangler d1 execute weg --remote --file=../../db/migrations/0001_init.sql

# 查询
npx wrangler d1 execute weg --remote --command="select count(*) from entities"
```

## 迁移纪律

1. **已合并的迁移文件不改**，要改就加 `0002_*.sql`
2. 每个迁移文件必须能在空库上从头跑通（`PRAGMA foreign_keys = ON` 已在 0001 开头设置）
3. 建表顺序：被引用的表在前；`DROP` 时反过来
4. D1 与本地 SQLite 的差异：D1 不支持 `ATTACH`、部分 PRAGMA；FTS5 需单独确认

## 表一览

| 层 | 表 |
| --- | --- |
| 溯源 | `sources` |
| 事实 | `entities` + `orgs` / `people` / `models` / `papers` / `concepts` / `benchmarks` / `contents` |
| 事实（关系） | `relations`、`entity_sources`、`entity_aliases`、`claims` |
| 视图层 | `taxonomies`、`taxonomy_nodes`、`taxonomy_placements` |
| 榜单 | `bench_rankings` |
| 产出 | `articles` |

## 三条硬规则

1. **没有 source 不许入库** —— 每条数据的出处是项目的护城河
2. **矛盾不覆盖** —— 同一事实多来源时开多条 `claims`，`v_claim_conflicts` 会把分歧挑出来
3. **厂商自述不升格** —— `tier='vendor_claim'`、`confidence='single'`，再漂亮的数字也照此处理
