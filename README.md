# harvest

Bulk download blog articles as Markdown files. Works with authenticated and paid content.

**[日本語版はこちら / Japanese version below](#harvest-日本語)**

## Quick Start

```bash
# Install from GitHub
git clone https://github.com/yourname/harvest.git
cd harvest
npm install
npm run build
npm link -w packages/cli
npx playwright install chromium

# Log in (first time only)
harvest login note

# Download all articles
harvest download https://note.com/username/m/magazine_id -o ./articles
```

## How It Works

```
┌──────────────────────────────────────────────────┐
│                   harvest CLI                    │
│                                                  │
│  URL → Adapter → Fetcher → Converter → Writer   │
│                     │                            │
│            ┌────────┴────────┐                   │
│            │                 │                   │
│     ExtensionFetcher   ProfileFetcher            │
│     (Chrome Extension) (Playwright)              │
│            │                 │                   │
│     Browser cookies    Dedicated profile         │
│     No re-login        Headless capable          │
└──────────────────────────────────────────────────┘
```

By default, tries Extension first and falls back to Profile automatically.

## Commands

### `harvest download <url>`

Download all articles from a listing page.

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output <dir>` | Output directory | `./articles` |
| `--auth <mode>` | `auto`, `extension`, `profile` | `auto` |
| `-c, --concurrency <n>` | Parallel downloads | `2` |
| `--delay <ms>` | Delay between requests | `500` |
| `--limit <n>` | Max articles to download | unlimited |

### `harvest login <site>`

Open a browser to log in and save the session. Supported sites: `note`, `zenn`, `qiita`, `hatena`, `medium`.

### `harvest setup`

Install AI agent skills for building knowledge bases from downloaded articles.

| Flag | Description | Default |
|------|-------------|---------|
| `--agent <type>` | `claude-code`, `agents`, `all` | `all` |
| `--target <dir>` | Directory for AGENTS.md | `.` |

## Supported Sites

| Site | Adapter |
|------|---------|
| note.com | `note` |

Adding new site adapters is straightforward — PRs welcome.

## Architecture

```
harvest/
  packages/
    shared/       # Fetcher interface, protocol types, config
    cli/          # npm package — download, login, setup commands
    extension/    # Chrome Extension — WebSocket relay bridge
  skills/
    claude-code/  # Skills for Claude Code (/harvest-wiki, /harvest-slides)
    agents/       # AGENTS.md for Codex, Cursor, Windsurf, etc.
```

### Dual Auth Backend

The `Fetcher` interface abstracts HTML acquisition:

```typescript
interface Fetcher {
  fetch(url: string): Promise<{ html: string; finalUrl: string; status: number }>;
  close(): Promise<void>;
}
```

- **ExtensionFetcher** — Connects to the Chrome Extension via WebSocket. Uses the browser's existing cookies. No re-login needed.
- **ProfileFetcher** — Launches Playwright with a dedicated persistent profile. Works headless. Best for AI agents and CI.
- **FallbackFetcher** — Tries Extension first, falls back to Profile.

### Site Adapters

Each site has an adapter implementing `SiteAdapter`:

```typescript
interface SiteAdapter {
  canHandle(url: URL): boolean;
  collectLinks(html: string, baseUrl: string): ArticleRef[];
  parseArticle(html: string, url: string): ParsedArticle;
}
```

## Output Format

```markdown
---
title: "Article Title"
date: 2026-01-15
source: https://note.com/user/n/n123456
author: Author Name
tags: [tag1, tag2]
---

# Article Title

Article content in Markdown...
```

## AI Agent Skills

harvest ships with skills that let AI agents build structured knowledge bases and interactive slides from downloaded articles.

### Setup

```bash
harvest setup                                # All agents
harvest setup --agent claude-code            # Claude Code only
harvest setup --agent agents --target ./dir  # Codex / Cursor / Windsurf
```

### Included Skills

| Skill | Description |
|-------|-------------|
| **harvest-wiki** | Build and maintain an LLM Wiki (init / ingest / query / lint / status) |
| **harvest-slides** | Generate interactive HTML slide decks with SVG diagrams |

### Claude Code

```
/harvest-wiki init ./my-project
/harvest-wiki ingest --batch 10
/harvest-wiki query "What is Agility?"
/harvest-slides wiki/concepts/agility
```

### Codex / Cursor / Windsurf

Place `AGENTS.md` in your project root. The agent will automatically recognize the skills:

```bash
codex "initialize the wiki and ingest the first 10 articles"
```

## Example Workflow

```bash
# 1. Download articles
harvest download https://note.com/author/m/magazine -o ./project/raw

# 2. Install skills
harvest setup --target ./project

# 3. Build knowledge base with your AI agent
#    /harvest-wiki init ./project
#    /harvest-wiki ingest --batch 10
#    /harvest-slides wiki/concepts/key-concept
```

## Development

See [Quick Start](#quick-start) for setup. After cloning:

```bash
npm install
npm run build
npm link -w packages/cli   # makes `harvest` command available globally
```

## License

MIT

---

# harvest (日本語)

ブログ記事をMarkdownファイルとして一括ダウンロード。認証が必要な有料コンテンツにも対応。

## クイックスタート

```bash
# GitHubからインストール
git clone https://github.com/yourname/harvest.git
cd harvest
npm install
npm run build
npm link -w packages/cli
npx playwright install chromium

# ログイン（初回のみ）
harvest login note

# 記事を一括ダウンロード
harvest download https://note.com/username/m/magazine_id -o ./articles
```

## 仕組み

```
┌──────────────────────────────────────────────────┐
│                   harvest CLI                    │
│                                                  │
│  URL → Adapter → Fetcher → Converter → Writer   │
│                     │                            │
│            ┌────────┴────────┐                   │
│            │                 │                   │
│     ExtensionFetcher   ProfileFetcher            │
│    （Chrome拡張機能）  （Playwright）             │
│            │                 │                   │
│     ブラウザのCookie   専用プロファイル           │
│     再ログイン不要     ヘッドレス対応            │
└──────────────────────────────────────────────────┘
```

デフォルトではExtensionを試み、接続できなければProfileに自動フォールバック。

## コマンド

### `harvest download <url>`

一覧ページから全記事をダウンロード。

| フラグ | 説明 | デフォルト |
|--------|------|-----------|
| `-o, --output <dir>` | 出力ディレクトリ | `./articles` |
| `--auth <mode>` | `auto`, `extension`, `profile` | `auto` |
| `-c, --concurrency <n>` | 並列ダウンロード数 | `2` |
| `--delay <ms>` | リクエスト間隔 | `500` |
| `--limit <n>` | 最大記事数 | 無制限 |

### `harvest login <site>`

ブラウザを開いてログイン、セッションを保存。対応: `note`, `zenn`, `qiita`, `hatena`, `medium`

### `harvest setup`

AIエージェント向けスキルをインストール。

| フラグ | 説明 | デフォルト |
|--------|------|-----------|
| `--agent <type>` | `claude-code`, `agents`, `all` | `all` |
| `--target <dir>` | AGENTS.mdの配置先 | `.` |

## 対応サイト

| サイト | アダプター |
|--------|-----------|
| note.com | `note` |

サイトアダプターの追加は簡単です。PRを歓迎します。

## アーキテクチャ

```
harvest/
  packages/
    shared/       # Fetcherインターフェース、プロトコル型、設定
    cli/          # npmパッケージ — download, login, setupコマンド
    extension/    # Chrome拡張機能 — WebSocketリレー
  skills/
    claude-code/  # Claude Code用スキル（/harvest-wiki, /harvest-slides）
    agents/       # Codex, Cursor, Windsurf等向けAGENTS.md
```

### デュアル認証バックエンド

`Fetcher` インターフェースがHTML取得を抽象化:

- **ExtensionFetcher** — Chrome拡張機能にWebSocket接続。ブラウザのCookieをそのまま使用。再ログイン不要
- **ProfileFetcher** — 専用の永続プロファイルでPlaywrightを起動。ヘッドレス動作可能。AIエージェント・CI向け
- **FallbackFetcher** — Extension→Profileの順に自動フォールバック

### サイトアダプター

各サイトは `SiteAdapter` インターフェースを実装:

```typescript
interface SiteAdapter {
  canHandle(url: URL): boolean;
  collectLinks(html: string, baseUrl: string): ArticleRef[];
  parseArticle(html: string, url: string): ParsedArticle;
}
```

## 出力形式

```markdown
---
title: "記事タイトル"
date: 2026-01-15
source: https://note.com/user/n/n123456
author: 著者名
tags: [タグ1, タグ2]
---

# 記事タイトル

Markdownに変換された記事本文...
```

## AIエージェントスキル

harvestは記事のダウンロードだけでなく、取得した記事から構造化されたナレッジベースやインタラクティブなスライドを構築するAIエージェント向けスキルを同梱しています。

### セットアップ

```bash
harvest setup                                # 全エージェント
harvest setup --agent claude-code            # Claude Codeのみ
harvest setup --agent agents --target ./dir  # Codex / Cursor / Windsurf
```

### 同梱スキル

| スキル | 機能 |
|--------|------|
| **harvest-wiki** | LLM Wiki構築・運用（init / ingest / query / lint / status） |
| **harvest-slides** | SVG図解付きインタラクティブHTMLスライド生成 |

### Claude Codeでの使い方

```
/harvest-wiki init ./my-project
/harvest-wiki ingest --batch 10
/harvest-wiki query "Agilityとは何か"
/harvest-slides wiki/concepts/agility
```

### Codex / Cursor / Windsurf での使い方

`AGENTS.md` をプロジェクトルートに配置すれば、エージェントが自動的にスキルを認識:

```bash
codex "wikiを初期化して、最初の10記事をインジェストして"
```

## ワークフロー例

```bash
# 1. 記事をダウンロード
harvest download https://note.com/author/m/magazine -o ./project/raw

# 2. スキルをセットアップ
harvest setup --target ./project

# 3. AIエージェントでWiki構築（Claude Codeの場合）
#    /harvest-wiki init ./project
#    /harvest-wiki ingest --batch 10
#    /harvest-slides wiki/concepts/key-concept
```

## 開発

[クイックスタート](#クイックスタート)を参照。クローン後:

```bash
npm install
npm run build
npm link -w packages/cli   # harvest コマンドをグローバルに利用可能にする
```

## ライセンス

MIT
