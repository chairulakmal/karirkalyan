# KarirKalyan（キャリルカリャン）

**応募だけでなく、キャリアを記録する。**

[![API CI](https://github.com/chairulakmal/karirkalyan/actions/workflows/api.yml/badge.svg)](https://github.com/chairulakmal/karirkalyan/actions/workflows/api.yml) [![Web CI](https://github.com/chairulakmal/karirkalyan/actions/workflows/web.yml/badge.svg)](https://github.com/chairulakmal/karirkalyan/actions/workflows/web.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[🇬🇧 English](README.md)

求人応募トラッカーです。Rails 8 の API と、Next.js 16 のカンバンボードで動きます。ステータス変更は必ずサーバー側の状態機械を通ります。クライアントは遷移ルールを持たず、どの移動が合法かを API に聞きます。以下、ライブデモ、ハイライト、アーキテクチャと技術スタック、テストと CI、ローカルでの動かし方の順に説明します。設計判断は [ARCHITECTURE.md](ARCHITECTURE.md)（英語）にあります。

https://github.com/user-attachments/assets/ecabba9e-b81d-40e6-9ab7-2a5911443c45

*38秒のデモ：カードを別のカラムへドラッグする。タイムラインに遷移が記録される。返信が止まった応募にゴースト予測のフラグが付く。*

<!-- SCREENSHOT: kanban board at /ja/board, Japanese locale, demo account data. Embed here once captured. -->

**ライブデモ：** [kk.chairulakmal.com](https://kk.chairulakmal.com)。サインインページの「Try demo account」を押すだけで、デモアカウントに入れます。ウィッシュリストから内定承諾まで、12件の応募データが最初から入っています。API ドキュメントは Swagger UI として [`/api-docs`](https://kk-api.chairulakmal.com/api-docs) で公開しています。

## ハイライト

- すべての書き込みは `lock_version` を持ちます。同時編集は上書きされず `409 Conflict` になり、ボードは差し戻されたドラッグを元に戻して再読み込みを求めます。詳細：[ARCHITECTURE.md § The state machine](ARCHITECTURE.md#the-state-machine-is-a-plain-ruby-module)（英語）、[§ The write path of a transition](ARCHITECTURE.md#the-write-path-of-a-transition)（英語）。
- ゴースト予測は、返信が止まった応募にフラグを立てます。応募後は営業日15日、一次面接後は10日が目安です。土日と日本の祝日は日数に含めません。詳細：[ARCHITECTURE.md § Ghost prediction](ARCHITECTURE.md#ghost-prediction-is-derived-not-stored)（英語）。
- フォローアップのデイリーダイジェストは JST 8:15 に届きます。週末と日本の祝日（年末年始、ゴールデンウィーク、お盆）はスキップし、スキップした日は翌営業日に1回だけ送ります。`/settings` で通知を有効にすると、同じダイジェストがプッシュ通知としても届き、失敗時は自動で再送します。詳細：[ARCHITECTURE.md § Digest scheduling](ARCHITECTURE.md#digest-scheduling-defers-never-drops)（英語）。
- アプリは英語と日本語のバイリンガルです。CI が2つの言語カタログの一致と、状態機械が1ファイルにまとまっていることを確認します（`lint:i18n`、`lint:fsm`）。日本語のテキストは単語の途中ではなく文節の区切りで改行します。対応ブラウザでは `word-break: auto-phrase` を使い、それ以外では見出しに [BudouX](https://github.com/google/budoux) を使います。詳細：[ARCHITECTURE.md § i18n parity](ARCHITECTURE.md#i18n-parity-is-a-ci-check-not-a-convention)（英語）。
- PostgreSQL 1つでバックグラウンドジョブ、キャッシュ、アップロードした PDF をすべて処理します。Redis もオブジェクトストレージも別のワーカーサービスも使いません。トレードオフ：[ARCHITECTURE.md § One PostgreSQL instance](ARCHITECTURE.md#one-postgresql-instance-no-redis)（英語）。
- サインインはパスキーにも対応します。WebAuthn を Devise に直接組み込んでおり（`webauthn` gem）、デスクトップで作ったパスキーは Proton Pass のようなパスワードマネージャーを通じてスマートフォンに同期します。パスワードフォームはフォールバックとして残り、パスキーの登録は `/settings` から行います。詳細：[ARCHITECTURE.md § The JWT never reaches the browser](ARCHITECTURE.md#the-jwt-never-reaches-the-browser)（英語）。
- Android にインストールすると、アプリは共有ターゲットになります。任意のアプリ（LinkedIn、ブラウザのタブ、リクルーターのメール）から求人票を共有すると、AI プレフィルが読み込み中の新規応募フォームが開きます。リンクがない共有は貼り付けボックスに入ります。インストールは **Chrome** から行ってください。共有メニューには WebAPK が必要で、Brave はこれを作らないため、Brave でのインストールはこの機能のないショートカットになります。Brave *から*の共有は問題なく動きます。
- インストール後は、ブラウザのフレームに入ったサイトではなく、本物のアプリのように動きます。スマートフォンではボトムタブバーが表示されます。ランチャーアイコンを長押しすると「新規応募」と「カンバン」のショートカットが出ます。`monochrome` アイコンにより、Android はロゴを暗くする代わりに色を付けられます。

## アーキテクチャ

[ARCHITECTURE.md](ARCHITECTURE.md)（英語）は、各判断をファイルパス付きで解説します。状態機械と単一の遷移表、トランザクション境界と `409` の契約、監査ログから導くゴースト予測、祝日を考えたダイジェストのスケジューリング、バイリンガルカタログの構成、単一 Postgres 設計。各セクションは、選んだ理由と受け入れたトレードオフを述べます。[SPEC.md](SPEC.md) は完全な技術仕様で、コードとの同期を保つこのプロジェクトの唯一の情報源です。

| レイヤー | コードが固定しているもの |
|---|---|
| API | Rails 8.1（API-only）、Ruby 3.4.9、Devise + devise-jwt |
| フロントエンド | Next.js 16.2、React 19.2、TypeScript 5、Tailwind CSS、next-intl |
| データベース | PostgreSQL 18。ローカルも本番も Docker |
| デプロイ | Docker Compose + Cloudflare Tunnel、セルフホスト（`SPEC.md` § Deployment） |
| テスト | RSpec（ユニット＋リクエストの2層）、Vitest（`web/` のユニット）、Playwright 1.60（E2E） |

## テストと CI

API のテストは2層です。ユニットスペック（`spec/lib`、`spec/services`）はデータベースなしで走ります。リクエストスペック（`spec/requests`）は実際の PostgreSQL に対して走ります。rswag がこれを使って OpenAPI 仕様も生成するため、ドキュメントとテストがずれることはありません。SimpleCov は行カバレッジ80%を下限とし、ブランチカバレッジも見ます。prosopite は N+1 クエリを検出したリクエストスペックを失敗させます。

フロントエンドには Playwright のスモークスイート（[`web/e2e/`](web/e2e)）があります。応募の作成、ステータス遷移、履歴書の添付という主要な流れを、API とフロントエンドの両方を通して確認します。

CI はパス検知型のワークフロー2本です。[`api.yml`](.github/workflows/api.yml) は RuboCop、Brakeman、bundler-audit、RSpec を実行します。[`web.yml`](.github/workflows/web.yml) は ESLint、i18n 整合性チェック、FSM コピー検査、`tsc`、Vitest のユニットテスト、本番ビルド、そして Playwright スイートを実行します。Playwright は、ジョブの中でシードした実際の Rails API に対して動きます。この README 冒頭のバッジが、両ワークフローの現在の状態を示します。

## ローカルで動かす

前提：Docker、Ruby 3.4.9、Node 24。

```bash
# 1. PostgreSQL 18（唯一のコンテナ）
cd api && docker compose up -d

# 2. API を :3001 で起動
bundle install
bin/rails db:create db:migrate
bin/rails db:seed        # 必須：登録は閉じているため、シードがログインを得る唯一の手段
bin/rails server

# 3. フロントエンドを :3000 で起動（別ターミナル）
cd web && npm install && npm run dev
```

[localhost:3000](http://localhost:3000) を開き、デモアカウント `demo@karirkalyan.com` / `oretachinomachida` でサインインしてください。開発環境ではバックグラウンドジョブが同じプロセス内で動くため、別のワーカーを起動する必要はありません。環境変数など詳しい設定は [api/README.md](api/README.md) と [web/README.md](web/README.md) にあります。

テストスイートの実行：

```bash
# API（api/ で実行）
bin/rails db:test:prepare
bundle exec rspec                          # 全スイート
bundle exec rspec spec/lib spec/services   # ユニットスペックのみ（データベース不使用）
bundle exec rspec spec/requests            # 実 PostgreSQL に対するリクエストスペック

# フロントエンド（web/ で実行）
npm run lint && npm run lint:i18n && npm run lint:fsm && npx tsc --noEmit && npm test
npm run test:e2e                           # Playwright。Postgres の起動とシードが前提
```
