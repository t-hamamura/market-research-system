# 市場調査自動化システム

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Gemini 2.5](https://img.shields.io/badge/Gemini-2.5%20Flash-orange)
![Notion API](https://img.shields.io/badge/Notion-API%20v1-black)

Gemini 2.5とNotionを活用した16種類の詳細市場調査を自動実行するフルスタックWebアプリケーション

## ✨ 特徴

- 🔍 **16種類の詳細市場調査**: 市場規模、競合分析、PESTEL分析など包括的な調査
- 🤖 **Gemini 2.5 Flash**: 最新のAI技術による高度な市場分析
- 📝 **Notion統合**: 調査結果を美しく整理されたNotionページとして自動保存
- ⚡ **リアルタイム進行状況**: Server-Sent Eventsによる進行状況のリアルタイム表示
- 📱 **レスポンシブデザイン**: モバイルファーストの美しいUI/UX
- 🚀 **TypeScript**: 型安全な開発環境

## 🎯 システム概要

このシステムは、サービス仮説を入力するだけで以下の16種類の市場調査を自動実行します：

1. **市場規模と成長性の調査**
2. **PESTEL分析の調査**
3. **競合の製品特徴・戦略分析**
4. **競合の経営戦略変遷・顧客離脱理由**
5. **顧客セグメント・意思決定プロセス分析**
6. **顧客感情・潜在ニーズ・情報収集行動マッピング**
7. **プロダクト市場適合性と価格戦略**
8. **マーケティング戦術分析**
9. **ブランドポジショニングとコミュニケーション**
10. **テクノロジートレンド・セキュリティ分析**
11. **パートナーシップ戦略とエコシステム形成**
12. **リスク・シナリオ分析**
13. **KPI・測定方法の設計**
14. **法務・コンプライアンスリスク分析**
15. **効果的なリサーチ手法の提案**
16. **PMF前特化リサーチ設計**

## 🛠️ 技術スタック

### バックエンド
- **Node.js** + **Express**: サーバーフレームワーク
- **TypeScript**: 型安全な開発
- **Google Gemini 2.5 Flash**: AI市場調査エンジン
- **Notion API**: レポート保存

### フロントエンド
- **HTML5** + **CSS3** + **JavaScript**: モダンなSPA
- **Inter Font**: 美しいタイポグラフィ
- **CSS Grid/Flexbox**: レスポンシブレイアウト
- **Server-Sent Events**: リアルタイム通信

### 開発ツール
- **ts-node**: TypeScript実行環境
- **dotenv**: 環境変数管理
- **CORS**: クロスオリジン対応

## 📋 必要な準備

### 1. Node.js環境
- Node.js 18.0.0以上
- npm または yarn

### 2. APIキー取得

#### Google Gemini API
1. [Google AI Studio](https://makersuite.google.com/app/apikey) にアクセス
2. Googleアカウントでログイン
3. 「Create API Key」をクリック
4. APIキーをコピーして保存

#### Notion API
1. [Notion Developers](https://www.notion.so/my-integrations) にアクセス
2. 「+ New integration」をクリック
3. 統合名を入力し、ワークスペースを選択
4. 「Submit」をクリックしてAPIトークンを取得

#### Notionデータベース作成
1. Notionで新しいページを作成
2. 「Database」を選択
3. 以下のプロパティを設定：
   - `タイトル` (Title)
   - `作成日時` (Date)
   - `ステータス` (Select: 完了)
4. 作成した統合をページに招待
5. データベースURLからIDを取得 (`https://www.notion.so/DATABASE_ID?v=...`)

## ⚙️ セットアップ

### 1. リポジトリクローン
```bash
git clone <repository-url>
cd market-research-system
```

### 2. 依存関係インストール
```bash
npm install
```

### 3. 環境変数設定
```bash
# .env.exampleを.envにコピー
cp env.example .env

# .envファイルを編集
nano .env
```

`.env`ファイルの内容：
```env
# Google Gemini API設定
GEMINI_API_KEY=your_gemini_api_key_here

# Notion API設定
NOTION_TOKEN=your_notion_token_here
NOTION_DATABASE_ID=your_notion_database_id_here

# サーバー設定
PORT=3000
NODE_ENV=development

# 調査間隔設定（ミリ秒）
RESEARCH_INTERVAL=1000
```

### 4. サーバー起動

#### 開発モード
```bash
npm run dev
```

#### 本番モード
```bash
npm run build
npm start
```

### 5. アクセス
ブラウザで http://localhost:3000 にアクセス

## 🚀 使用方法

### 1. システム起動確認
- ページ上部の「ステータス」が「システム正常」になることを確認

### 2. サービス仮説入力
以下の項目を入力：
- **事業名**: Notionレポートのタイトルになります
- **コンセプト**: サービスの核となるアイデア
- **解決したい顧客課題**: 対象とする課題
- **狙っている業種・業界**: ターゲット市場
- **想定される利用者層**: ユーザーペルソナ
- **直接競合・間接競合**: 競合他社
- **課金モデル**: 収益構造
- **価格帯・価格設定の方向性**: 価格戦略

### 3. 調査実行
「調査開始」ボタンをクリックして調査を開始

### 4. 進行状況確認
- プログレスバーで全体の進捗を確認
- 「現在の調査」で実行中の調査内容を確認
- 調査項目リストで個別の完了状況を確認

### 5. 結果確認
- 調査完了後、「Notionレポートを開く」ボタンでレポートを確認

## 📊 APIエンドポイント

### システム情報
- `GET /api/research/health` - ヘルスチェック
- `GET /api/research/info` - システム情報
- `GET /api/research/prompts` - 調査プロンプト一覧

### 調査機能
- `POST /api/research/validate` - リクエストバリデーション
- `POST /api/research/start` - 市場調査開始（SSE）

## 🔧 カスタマイズ

### 調査プロンプトの変更
`src/services/researchService.ts`の`initializeResearchPrompts()`メソッドで調査内容をカスタマイズできます。

### UI/UXの変更
- `public/style.css`: スタイルの変更
- `public/index.html`: HTML構造の変更
- `public/script.js`: JavaScript機能の変更

### レート制限の調整
環境変数`RESEARCH_INTERVAL`で調査間隔を調整（ミリ秒単位）

## 🚨 トラブルシューティング

### よくある問題

#### 1. 「システムエラー」が表示される
**原因**: APIキーまたはNotion設定が正しくない
**解決方法**:
- `.env`ファイルのAPIキーを確認
- Notion統合がデータベースに招待されているか確認
- コンソールでエラーログを確認

#### 2. 調査が途中で停止する
**原因**: Gemini APIのレート制限またはネットワークエラー
**解決方法**:
- `RESEARCH_INTERVAL`を増加（例：2000ミリ秒）
- しばらく待ってからリトライ
- ネットワーク接続を確認

#### 3. Notionページが作成されない
**原因**: Notion API権限またはデータベース設定の問題
**解決方法**:
- Notion統合がワークスペースに正しく追加されているか確認
- データベースIDが正しいか確認
- データベースのプロパティ設定を確認

#### 4. レスポンシブデザインの問題
**原因**: CSSの読み込みエラー
**解決方法**:
- ブラウザのキャッシュをクリア
- 開発者ツールでCSSエラーを確認

### ログレベル調整
開発時は以下の環境変数でログレベルを調整：
```env
NODE_ENV=development  # 詳細ログ
NODE_ENV=production   # 最小ログ
```

### パフォーマンス最適化
- Node.js 18以上の使用推奨
- メモリ使用量: 最大512MB推奨
- CPU: 16個の調査実行時は一時的に高負荷

## 📝 開発者向け情報

### プロジェクト構造
```
market-research-system/
├── src/
│   ├── server.ts                 # メインサーバー
│   ├── types/
│   │   └── index.ts              # TypeScript型定義
│   ├── services/
│   │   ├── geminiService.ts      # Gemini API サービス
│   │   ├── notionService.ts      # Notion API サービス
│   │   └── researchService.ts    # 調査統括サービス
│   └── routes/
│       └── research.ts           # API ルート
├── public/
│   ├── index.html                # メインHTML
│   ├── style.css                 # スタイルシート
│   └── script.js                 # フロントエンドJS
├── env.example                   # 環境変数テンプレート
├── .gitignore                    # Git除外設定
├── package.json                  # 依存関係
├── tsconfig.json                 # TypeScript設定
└── README.md                     # ドキュメント
```

### 型安全性
- 全てのAPI通信に型定義を使用
- リクエスト・レスポンスの型チェック
- エラーハンドリングの型安全性

### セキュリティ
- API キーは環境変数で管理
- CORS設定によるオリジン制御
- 入力データのバリデーション
- サニタイゼーション実装

## 🤝 貢献

1. リポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/AmazingFeature`)
3. 変更をコミット (`git commit -m 'Add some AmazingFeature'`)
4. ブランチにプッシュ (`git push origin feature/AmazingFeature`)
5. プルリクエストを作成

## 📄 ライセンス

このプロジェクトはMITライセンスの下で公開されています。詳細は`LICENSE`ファイルを参照してください。

## 🙏 謝辞

- [Google Gemini](https://ai.google.dev/) - 高度なAI分析エンジン
- [Notion API](https://developers.notion.com/) - 美しいレポート作成
- [Inter Font](https://rsms.me/inter/) - モダンなタイポグラフィ

## 📞 サポート

問題が発生した場合：
1. この README のトラブルシューティングセクションを確認
2. GitHub Issues で既存の問題を検索
3. 新しい Issue を作成して詳細を報告

---

**Powered by Gemini 2.5 & Notion API** 🚀 