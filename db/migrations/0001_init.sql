-- WEG 数据库初始化
-- 方言：SQLite / Cloudflare D1
-- 原则：底层只存客观事实（实体 + 时间 + 地域 + 出处 + 可信度）；分类法作为视图叠加。
-- 表分三层：事实层（entities + 分类型扩展）· 溯源层（sources / claims）· 视图层（taxonomies）· 产出层（articles）
--
-- 约定
--   id      := 'type:slug'，如 'org:world-labs' / 'model:v-jepa-2' / 'paper:2506.09985'
--   时间    := ISO 8601 UTC 文本（'2026-10-26T09:35:37Z'）；精度不明时用 '2026' 或 '2026-10'
--   布尔    := INTEGER 0/1
--   confidence := verified | corroborated | single | disputed
--   sources.tier := official | authoritative_media | industry_media | vendor_claim | unverified
--                   （对应调研文档的 ★ ◇ ○ △ ?）

PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────
-- 溯源层
-- ─────────────────────────────────────────────────────────────

-- 一切数据点的出处。没有 source 的实体不允许入库。
CREATE TABLE sources (
  id             TEXT PRIMARY KEY,              -- 'src:genie3-deepmind-blog'
  url            TEXT NOT NULL,
  url_canonical  TEXT,                          -- 去 utm / 短链还原，用于去重
  title          TEXT,
  publisher      TEXT,                          -- 发布方（DeepMind / 量子位 / TechCrunch）
  author         TEXT,
  lang           TEXT CHECK (lang IN ('zh','en','ja','ko','other') OR lang IS NULL),
  tier           TEXT NOT NULL CHECK (tier IN
                   ('official','authoritative_media','industry_media','vendor_claim','unverified')),
  published_on   TEXT,                          -- 原文发布时间
  retrieved_at   TEXT NOT NULL,                 -- 我们抓到它的时间（审计用）
  archive_url    TEXT,                          -- web.archive.org 快照，防原文消失
  note           TEXT                           -- 为什么这一条可信 / 有什么问题
);
CREATE UNIQUE INDEX ux_sources_canonical ON sources(url_canonical) WHERE url_canonical IS NOT NULL;
CREATE INDEX ix_sources_tier ON sources(tier);

-- ─────────────────────────────────────────────────────────────
-- 事实层：统一实体表 + 分类型扩展表
-- ─────────────────────────────────────────────────────────────

-- 所有实体的公共面。类型差异放扩展表，保证统一搜索 / 统一 URL / 统一动态。
CREATE TABLE entities (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL CHECK (type IN
                      ('org','person','model','paper','concept','benchmark','content')),
  slug              TEXT NOT NULL,
  name              TEXT NOT NULL,              -- 展示名（中文优先）
  name_en           TEXT,
  summary           TEXT,                       -- 一句话，80 字内
  status            TEXT CHECK (status IN
                      ('active','inactive','acquired','shut_down','rumored','unknown')
                      OR status IS NULL),
  region            TEXT,                       -- ISO 3166-1 alpha-2 / 'global'
  primary_source_id TEXT REFERENCES sources(id),-- 主出处
  confidence        TEXT CHECK (confidence IN
                      ('verified','corroborated','single','disputed') OR confidence IS NULL),
  first_seen_at     TEXT,                       -- 首次进库时间（WEG 内部，不是事实）
  updated_at        TEXT NOT NULL,
  UNIQUE (type, slug)
);
CREATE INDEX ix_entities_type ON entities(type, status);
CREATE INDEX ix_entities_name ON entities(name);

-- 机构：大厂 / 初创 / 实验室 / 学术 / 投资 / 联盟
CREATE TABLE orgs (
  entity_id  TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  kind       TEXT CHECK (kind IN
               ('big_tech','startup','lab','academia','investor','consortium','other')
               OR kind IS NULL),
  country    TEXT,
  hq_city    TEXT,
  founded_on TEXT,                              -- 'YYYY' 或 'YYYY-MM-DD'
  site_url   TEXT
);

CREATE TABLE people (
  entity_id TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  title     TEXT,                               -- 现任头衔（变动写 relations，不覆盖历史）
  site_url  TEXT
  -- 任职关系走 relations(predicate='affiliated_with')，此处不冗余
);

-- 模型 / 产品：同一张表，kind 区分（设计约束 4）
CREATE TABLE models (
  entity_id          TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  kind               TEXT CHECK (kind IN ('research_model','commercial_product') OR kind IS NULL),
  org_id             TEXT REFERENCES entities(id),
  family             TEXT,                      -- 'Genie' / 'Cosmos' / 'JEPA' / 'Dreamer'
  released_on        TEXT,
  retired_on         TEXT,                      -- 关停/下线（如 Sora 2）
  params             TEXT,                      -- '33B' 保留原文字符串，不硬转数字
  open_weights       INTEGER CHECK (open_weights IN (0,1) OR open_weights IS NULL),
  license            TEXT,
  paper_id           TEXT REFERENCES entities(id),
  url                TEXT,
  -- 输入 / 输出：回答「它吃什么、吐什么」，是同类对比的核心字段
  input_modalities   TEXT,                      -- 'video' / 'text,image,video,audio,action'
  output_modalities  TEXT,                      -- 'latent' / 'video' / 'text,image,video,audio,action'
  output_type        TEXT CHECK (output_type IN ('latent','pixel','explicit_3d','action','text') OR output_type IS NULL),
  action_conditioned INTEGER CHECK (action_conditioned IN (0,1) OR action_conditioned IS NULL),
  realtime           INTEGER CHECK (realtime IN (0,1) OR realtime IS NULL),
  io_note            TEXT
);

CREATE TABLE papers (
  entity_id    TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  arxiv_id     TEXT,
  venue        TEXT,                            -- 'CVPR 2026' / 'arXiv preprint'
  published_on TEXT,
  abstract     TEXT,                            -- 原文摘要（客观引用，不是我们的观点）
  pdf_url      TEXT,
  code_url     TEXT
);
CREATE UNIQUE INDEX ux_papers_arxiv ON papers(arxiv_id) WHERE arxiv_id IS NOT NULL;

-- 概念：不设 parent_id。层级与归属全部走 taxonomy_nodes / relations，
-- 保证「同一概念可同时属于多套划法」——这是分类法作为视图的前提。
CREATE TABLE concepts (
  entity_id      TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  definition     TEXT,                          -- 概念自身的定义（可多源，见 claims）
  definition_src TEXT REFERENCES sources(id)
);

CREATE TABLE benchmarks (
  entity_id        TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  maintainer_org_id TEXT REFERENCES entities(id),
  url              TEXT,
  metric           TEXT                         -- 衡量什么
);

-- 观点层：只存外链，不存正文（设计约束 5）
CREATE TABLE contents (
  entity_id    TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('article','podcast','video','report','newsletter')),
  url          TEXT NOT NULL,                   -- 唯一正文入口，外链
  publisher    TEXT,
  author_text  TEXT,
  published_on TEXT,
  lang         TEXT
);

-- ─────────────────────────────────────────────────────────────
-- 事实层：关系与细粒度声明
-- ─────────────────────────────────────────────────────────────

-- 别名：搜索与归一（LeCun / 杨立昆 / Yann LeCun；MiniMax H3 / MiniMax-H3）
CREATE TABLE entity_aliases (
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alias     TEXT NOT NULL,
  lang      TEXT,
  source_id TEXT REFERENCES sources(id),
  PRIMARY KEY (entity_id, alias)
);
CREATE INDEX ix_alias_alias ON entity_aliases(alias);

-- 实体 ↔ 出处（多对多）。关键：一个实体可以有 corroboration 和 contradiction 两类来源
CREATE TABLE entity_sources (
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id),
  role      TEXT NOT NULL CHECK (role IN ('primary','corroboration','contradiction','mention')),
  note      TEXT,
  PRIMARY KEY (entity_id, source_id, role)
);

-- 关系边。事件（融资/收购/关停/人事变动）不建表，用这里 + occurred_on + source_id 表达（约束 3）
CREATE TABLE relations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id      TEXT NOT NULL REFERENCES entities(id),
  predicate       TEXT NOT NULL,                -- 见 db/README 的谓词表
  object_id       TEXT REFERENCES entities(id), -- 指向库内实体
  object_text     TEXT,                         -- 或指向库外/自由文本（可空二选一）
  occurred_on     TEXT,                         -- 'YYYY' / 'YYYY-MM-DD' → 动态栏排序用
  ended_on        TEXT,
  -- 边属性：融资 / 收购这类事件的主要数值，显式列便于筛选
  amount_value    REAL,
  amount_currency TEXT,
  round_name      TEXT,                         -- '种子轮' / 'B 轮' / 'Pre-A'
  attrs_json      TEXT,                         -- 其余低频属性，避免为个案开列
  source_id       TEXT REFERENCES sources(id),
  confidence      TEXT CHECK (confidence IN
                    ('verified','corroborated','single','disputed') OR confidence IS NULL),
  note            TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  CHECK (object_id IS NOT NULL OR object_text IS NOT NULL)
);
CREATE INDEX ix_rel_subject ON relations(subject_id, predicate);
CREATE INDEX ix_rel_object  ON relations(object_id, predicate);
CREATE INDEX ix_rel_time    ON relations(occurred_on);
CREATE INDEX ix_rel_pred    ON relations(predicate, occurred_on);

-- 细粒度声明：同一事实的多个来源版本并存，冲突不丢。
-- 用于数值型、易错、媒体口径矛盾的字段（融资额、参数、榜单分数、发布日期）。
CREATE TABLE claims (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id  TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  field       TEXT NOT NULL,                    -- 'params' / 'funding_total' / 'score' / ...
  value_text  TEXT,
  value_num   REAL,
  unit        TEXT,                             -- 'CNY' / 'USD' / 'B' / 'percent'
  as_of       TEXT,                             -- 这个说法的时间点
  source_id   TEXT REFERENCES sources(id),
  confidence  TEXT CHECK (confidence IN
                ('verified','corroborated','single','disputed') OR confidence IS NULL),
  note        TEXT,                              -- 如「与 NYT 口径不符，疑似混淆赛道总额」
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX ix_claims_subject ON claims(subject_id, field);
CREATE INDEX ix_claims_source  ON claims(source_id);

-- ─────────────────────────────────────────────────────────────
-- 视图层：分类法（可增删、可并列、可溯源的「谁在何时怎么分」）
-- ─────────────────────────────────────────────────────────────

CREATE TABLE taxonomies (
  id          TEXT PRIMARY KEY,                 -- 'tax:baii-four-space'
  name        TEXT NOT NULL,                    -- 「智源：按预测空间四分」
  summary     TEXT,
  proposed_by TEXT REFERENCES entities(id),     -- 提出者（机构/人，可空）
  source_id   TEXT REFERENCES sources(id),
  published_on TEXT,
  note        TEXT
);

CREATE TABLE taxonomy_nodes (
  id          TEXT PRIMARY KEY,
  taxonomy_id TEXT NOT NULL REFERENCES taxonomies(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES taxonomy_nodes(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER DEFAULT 0
);
CREATE INDEX ix_taxnodes_tax ON taxonomy_nodes(taxonomy_id, parent_id);

-- 概念 / 模型 → 分类节点。多对多，天然支持「一个实体被多套划法放在不同位置」
CREATE TABLE taxonomy_placements (
  node_id    TEXT NOT NULL REFERENCES taxonomy_nodes(id) ON DELETE CASCADE,
  entity_id  TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  source_id  TEXT REFERENCES sources(id),
  confidence TEXT CHECK (confidence IN
               ('verified','corroborated','single','disputed') OR confidence IS NULL),
  note       TEXT,
  PRIMARY KEY (node_id, entity_id)
);
CREATE INDEX ix_placement_entity ON taxonomy_placements(entity_id);

-- 榜单快照：榜单会变，变化本身就是内容（含「历史与易主」）
CREATE TABLE bench_rankings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  benchmark_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  track        TEXT,                            -- 赛道/子榜（世界生成 / 具身 / 交互）
  rank         INTEGER,
  model_id     TEXT REFERENCES entities(id),
  model_text   TEXT,
  score        REAL,
  score_text   TEXT,                            -- 'SOTA' / '60+' 这类原样表述
  as_of        TEXT NOT NULL,                   -- 快照日期
  source_id    TEXT REFERENCES sources(id),
  CHECK (model_id IS NOT NULL OR model_text IS NOT NULL)
);
CREATE INDEX ix_ranking_board ON bench_rankings(benchmark_id, track, as_of);
CREATE INDEX ix_ranking_model ON bench_rankings(model_id);

-- ─────────────────────────────────────────────────────────────
-- 产出层：WEG 自己的文章（独立于收录对象）
-- ─────────────────────────────────────────────────────────────

CREATE TABLE articles (
  id             TEXT PRIMARY KEY,              -- 'post:what-is-a-world-model'
  slug           TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  subtitle       TEXT,
  body_md        TEXT NOT NULL,
  lang           TEXT NOT NULL DEFAULT 'zh',
  published_at   TEXT,
  updated_at     TEXT,
  cover_url      TEXT,
  canonical_path TEXT,                          -- '/posts/<slug>'
  first_published_url TEXT                      -- 首发平台外链（公众号等）
);
CREATE INDEX ix_articles_pub ON articles(published_at);

-- ─────────────────────────────────────────────────────────────
-- 常用视图
-- ─────────────────────────────────────────────────────────────

-- 实体卡片：公共面 + 类型特有字段拍平，给列表页 / 搜索用
CREATE VIEW v_entity_cards AS
SELECT e.id, e.type, e.slug, e.name, e.name_en, e.summary, e.status, e.region,
       e.confidence, e.updated_at,
       o.kind AS org_kind, o.country, o.founded_on,
       m.kind AS model_kind, m.family, m.released_on, m.retired_on,
       m.output_type, m.action_conditioned, m.realtime, m.open_weights,
       p.arxiv_id, p.venue, p.published_on,
       b.metric,
       c.kind AS content_kind, c.url AS content_url
FROM entities e
LEFT JOIN orgs o       ON o.entity_id = e.id
LEFT JOIN models m     ON m.entity_id = e.id
LEFT JOIN papers p     ON p.entity_id = e.id
LEFT JOIN benchmarks b ON b.entity_id = e.id
LEFT JOIN contents c   ON c.entity_id = e.id;

-- 动态栏：实体新增 + 关系事件，按日期倒序（不建事件表）
CREATE VIEW v_timeline AS
SELECT 'entity' AS kind, e.id AS subject_id, e.name AS subject_name,
       NULL AS predicate, NULL AS object_name,
       e.first_seen_at AS happened_on,
       COALESCE(e.primary_source_id, (SELECT source_id FROM entity_sources es
         WHERE es.entity_id = e.id ORDER BY CASE role WHEN 'primary' THEN 0 ELSE 1 END LIMIT 1)) AS source_id,
       e.summary AS note
FROM entities e
WHERE e.first_seen_at IS NOT NULL
UNION ALL
SELECT 'relation', r.subject_id, se.name,
       r.predicate, COALESCE(oe.name, r.object_text),
       r.occurred_on, r.source_id, r.note
FROM relations r
JOIN entities se ON se.id = r.subject_id
LEFT JOIN entities oe ON oe.id = r.object_id
WHERE r.occurred_on IS NOT NULL;

-- 冲突检测：同一实体同一字段存在互相矛盾的值（媒体口径分歧就是内容）
CREATE VIEW v_claim_conflicts AS
SELECT c.subject_id, e.name, c.field,
       COUNT(DISTINCT COALESCE(CAST(c.value_num AS TEXT), c.value_text)) AS versions,
       GROUP_CONCAT(DISTINCT COALESCE(c.value_text, CAST(c.value_num AS TEXT))) AS values_seen
FROM claims c
JOIN entities e ON e.id = c.subject_id
GROUP BY c.subject_id, c.field
HAVING versions > 1;

-- 同一实体在不同划法下的位置（「并列展示多种划法」的落点）
CREATE VIEW v_entity_taxonomies AS
SELECT tp.entity_id, e.name AS entity_name,
       t.id AS taxonomy_id, t.name AS taxonomy_name,
       n.id AS node_id, n.label AS node_label,
       tp.confidence, tp.source_id
FROM taxonomy_placements tp
JOIN entities e ON e.id = tp.entity_id
JOIN taxonomy_nodes n ON n.id = tp.node_id
JOIN taxonomies t ON t.id = n.taxonomy_id;

-- 榜单当前状态（每个榜/赛道取最新快照）
CREATE VIEW v_latest_rankings AS
SELECT r.*
FROM bench_rankings r
JOIN (SELECT benchmark_id, track, MAX(as_of) AS max_as_of
      FROM bench_rankings GROUP BY benchmark_id, track) latest
  ON latest.benchmark_id = r.benchmark_id
 AND latest.track IS r.track
 AND latest.max_as_of = r.as_of;
