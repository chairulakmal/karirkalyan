# KarirKalyan（キャリルカリャン）

[![API CI](https://github.com/chairulakmal/karirkalyan/actions/workflows/api.yml/badge.svg)](https://github.com/chairulakmal/karirkalyan/actions/workflows/api.yml) [![Web CI](https://github.com/chairulakmal/karirkalyan/actions/workflows/web.yml/badge.svg)](https://github.com/chairulakmal/karirkalyan/actions/workflows/web.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[🇬🇧 English](README.md)

Rails 8 API と Next.js 16 のカンバンボードで構成した求人応募トラッカーです。ステータス変更はすべてサーバー側で強制される有限状態機械を通り、クライアントは遷移ルールを自前で持たず、どの移動が合法かを API に問い合わせます。

https://github.com/user-attachments/assets/ecabba9e-b81d-40e6-9ab7-2a5911443c45

*38秒デモ：カードを別のカラムへドラッグし、タイムラインに遷移が記録されるのを確認し、返信が途絶えた応募がゴースト予測でフラグされる様子を見る。*

<!-- SCREENSHOT: kanban board at /ja/board, Japanese locale, demo account data. Embed here once captured. -->

**ライブデモ：** [kk.chairulakmal.com](https://kk.chairulakmal.com)。デモアカウントはワンクリックです（サインインページの「Try demo account」）。全状態を網羅する12件の応募データがあらかじめ入っています。API ドキュメントは Swagger UI として [`/api-docs`](https://api-production-4899.up.railway.app/api-docs) で公開しています。

## ハイライト

- 状態機械は gem ではなく素の Ruby モジュールです。[`api/app/lib/application_fsm.rb`](api/app/lib/application_fsm.rb) は freeze された `TRANSITIONS` 配列で、一読すれば全遷移が分かります。すべての遷移は新しいステータスとタイムラインエントリを1つのデータベーストランザクションで書き込み、フロントエンドは遷移表を TypeScript に写す代わりに `GET /api/v1/transitions` から合法な移動を取得します。ルールの実体はただ1つのファイルにしかありません。
- 楽観的ロックにより、同時編集は暗黙の上書きではなく `409 Conflict` になります。すべての書き込みは `lock_version` を伴い、`409` を受けたボードはドラッグしたカードを元に戻して再読み込みを促します。
- ゴースト予測は、あなた自身の p90 返信時間より長く沈黙している応募をフラグします。p90 はウィンドウ関数でタイムライン監査ログから毎回再構築するため、新しいカラムもテーブルも増えていません。あるステージの返信記録が5件に満たない間は明示されたグローバル既定値を使い、UI はどちらを使ったかを表示します。
- フォローアップのデイリーダイジェストは JST 8:15 に送信され、週末と日本の祝日（年末年始、ゴールデンウィーク、お盆を含む）はスキップします。スキップされたリマインダーは破棄されず翌営業日に繰り延べられ、ちょうど1回だけ送信されます。冪等キーが送信日ではなくフォローアップ予定日から導出されているためです。
- プロダクトは英語と日本語のバイリンガルで、カタログの整合性は CI が強制します。日本語キーの欠落は lint も型検査もビルドも素通りするため、`npm run lint:i18n` が2つのカタログを比較し、片方の言語にしか存在しないキーがあればビルドを失敗させます。
- PostgreSQL 1インスタンスがすべてを担います：バックグラウンドジョブ（Solid Queue）、キャッシュとレート制限カウンタ（Solid Cache）、アップロードされた PDF（`bytea` カラム）。Redis もオブジェクトストレージも別ワーカーサービスもありません。
- Android にインストールすると、アプリ自体が共有ターゲットになります。任意のアプリ — LinkedIn、モバイルのタブ、リクルーターからのメール — から求人票を共有すると、AI プレフィルが読み込み中の状態で新規応募フォームに着地します。リンクを含まない共有は、代わりに貼り付けボックスへ種として入ります。インストールの注意は1つだけ：インストールは **Chrome** から一度だけ行ってください。共有シート統合は WebAPK にのみ存在し、Brave には WebAPK の発行サーバーがないため、Brave でのインストールはこの機能が静かに存在しないホーム画面ショートカットになります。Brave *から*の共有は問題なく動きます。

## 技術スタック

| レイヤー | コードが固定しているもの |
|---|---|
| API | Rails 8.1（API-only）、Ruby 3.4.9、Devise + devise-jwt |
| フロントエンド | Next.js 16.2、React 19.2、TypeScript 5、Tailwind CSS、next-intl |
| データベース | PostgreSQL 18。ローカルは Docker、本番は Railway マネージド |
| テスト | RSpec（ユニット＋リクエストの2層）、Playwright 1.60（E2E） |

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

[localhost:3000](http://localhost:3000) を開き、シード済みのデモアカウント `demo@karirkalyan.com` / `oretachinomachida` でサインインしてください。開発環境ではバックグラウンドジョブがプロセス内で実行されるため、起動すべきワーカーはありません。環境変数などの詳細は [api/README.md](api/README.md) と [web/README.md](web/README.md) にあります。

テストスイートの実行：

```bash
# API（api/ で実行）
bin/rails db:test:prepare
bundle exec rspec                          # 全スイート
bundle exec rspec spec/lib spec/services   # ユニットスペックのみ（データベース不使用）
bundle exec rspec spec/requests            # 実 PostgreSQL に対するリクエストスペック

# フロントエンド（web/ で実行）
npm run lint && npm run lint:i18n && npx tsc --noEmit
npm run test:e2e                           # Playwright。Postgres の起動とシードが前提
```

## テストと CI

API のテストは2層です。ユニットスペック（`spec/lib`、`spec/services`）はデータベースなしで走ります。リクエストスペック（`spec/requests`）は実際の PostgreSQL に対して走り、rswag を通じて OpenAPI 仕様の生成元も兼ねるため、API ドキュメントとテストが乖離できません。SimpleCov が行カバレッジ80%の下限をブランチカバレッジ有効で強制し、prosopite は N+1 クエリを起こしたリクエストスペックを失敗させます。

フロントエンドには Playwright のスモークスイート（[`web/e2e/`](web/e2e)）があり、応募の作成、ステータス遷移、履歴書の添付というクリティカルパスを両アプリ越しに検証します。

CI はパス検知型のワークフロー2本です。[`api.yml`](.github/workflows/api.yml) は RuboCop、Brakeman、bundler-audit、RSpec を実行します。[`web.yml`](.github/workflows/web.yml) は ESLint、i18n 整合性チェック、`tsc`、本番ビルド、そしてジョブ内でシードした実 Rails API に対する Playwright スイートを実行します。

## アーキテクチャ

[ARCHITECTURE.md](ARCHITECTURE.md)（英語）が各判断をファイルパス付きで解説します：状態機械と単一の遷移表、トランザクション境界と `409` の契約、監査ログから導出するゴースト予測、祝日を考慮したダイジェストのスケジューリング、バイリンガルカタログの構成、単一 Postgres 設計。各セクションは選択、理由、受け入れたトレードオフを述べます。[SPEC.md](SPEC.md) が完全な技術仕様であり、コードとの同期がポリシーとして維持されるこのプロジェクトの唯一の情報源です。
