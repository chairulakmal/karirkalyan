# KarirKalyan（キャリルカリャン）

[![API CI](https://github.com/chairulakmal/karirkalyan/actions/workflows/api.yml/badge.svg)](https://github.com/chairulakmal/karirkalyan/actions/workflows/api.yml)
[![Web CI](https://github.com/chairulakmal/karirkalyan/actions/workflows/web.yml/badge.svg)](https://github.com/chairulakmal/karirkalyan/actions/workflows/web.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[🇬🇧 English](README.md)

Rails 8 API + Next.js 16 で構築した、フルスタックの就職活動管理アプリです。「どの企業に応募したか」「選考がどの段階にあるか」「いつフォローアップするか」を一元管理できます。

**ライブデモ：** [kk.chairulakmal.com](https://kk.chairulakmal.com)　**APIドキュメント：** [Swagger UI `/api-docs`](https://api-production-4899.up.railway.app/api-docs)

**デモアカウント：** `demo@karirkalyan.com` / `oretachinomachida` でログインすると、東京テック系企業への架空の就職活動データ（12件）を確認できます。

---

## 技術スタック

| 領域 | 技術 |
|---|---|
| バックエンド | Rails 8 API-only、Ruby 3.4.9、PostgreSQL 16 |
| 認証 | Devise + devise-jwt（JTI失効による真のログアウト） |
| ジョブキュー | Sidekiq + Redis 8 |
| フロントエンド | Next.js 16 App Router、Tailwind CSS v4 |
| JWT管理 | `httpOnly` Cookie（クライアント側JSからは一切アクセス不可） |
| インフラ | Railway（API・フロントエンド・PostgreSQL・Redis 8） |
| テスト | RSpec（ユニット＋リクエストスペック）、Playwright（E2E） |

---

## 主要な設計ポイント

| 関心事 | アプローチ |
|---|---|
| 状態機械 | 自作PORo（gemなし）。`TRANSITIONS`配列を読めばすべての遷移が一目でわかる |
| 監査ログ | ステータス変更ごとに`TimelineEntry`をトランザクション内で書き込む |
| 並行制御 | 楽観的ロック（`lock_version`）→ 競合時は`409 Conflict` |
| バックグラウンドジョブ | Sidekiq + 冪等性キー（at-least-once配信に対応） |
| ファイル保存 | PostgreSQL `bytea`カラム、1MB上限、PDFマジックバイト検証 |
| ページネーション | カーソルベース（`?after=<base64_cursor>&limit=20`） |
| APIドキュメント | rswag（リクエストスペックとOpenAPIを共通化） |

---

## ローカル開発環境の構築

**前提：** Docker、Ruby 3.4.9（mise推奨）、Node 20以上

```bash
# インフラ起動
docker compose up -d          # postgres + redis

# バックエンド
cd api
bundle install
bin/rails db:create db:migrate
bin/rails db:seed             # デモデータ投入
bin/rails server              # :3001

# フロントエンド
cd web
npm install
npm run dev                   # :3000
```

---

## なぜ Rails API + Next.js の構成なのか

Rails はデータ整合性・バックグラウンドジョブ・APIサーバーとしての役割に特化しています。Next.js のAPI Route（サーバーサイド）を介してJWTを `httpOnly` Cookie に格納することで、XSSによるトークン漏洩を防いでいます。Viteのような純クライアントサイドバンドラーでは、安全なCookieを設定するサーバー層が別途必要になります。

また、Next.js はもう一つのポートフォリオプロジェクト [Awano](https://github.com/chairulakmal/awano)（マルチテナント対応サポートデスク）でも採用しています。採用担当者が両プロジェクトを見比べると、FSM・トランザクション監査ログ・サービス層・二層テスト戦略という同じ設計思想が、Rails と Next.js という異なるスタックで表現されていることを確認できます。

---

アーキテクチャの詳細・ステートマシンの設計・技術的な意思決定の記録については、[英語版 README](README.md) をご覧ください。
