# 🔧 API設定手順（本番運用時）

## 1. Google Gemini API設定

### 1.1 Google AI Studio でAPIキー取得
1. [Google AI Studio](https://makersuite.google.com/) にアクセス
2. 「Create API Key」をクリック
3. 新しいプロジェクトを作成またはは既存プロジェクトを選択
4. APIキーをコピーして保存

### 1.2 Gemini API利用開始
- **モデル**: gemini-1.5-pro-latest 使用
- **料金**: 1M tokens $3.50（入力）、$10.50（出力）
- **制限**: 1分間60リクエスト

## 2. Notion API設定

### 2.1 Notion統合の作成
1. [Notion Developers](https://developers.notion.com/) にアクセス
2. 「My integrations」→「New integration」
3. 統合名: `市場調査システム`
4. 「Associated workspace」を選択
5. 「Capabilities」: Read content, Update content, Insert content にチェック
6. 「Create」をクリック

### 2.2 統合トークンの取得
- 作成した統合の「Internal integration token」をコピー
- 形式: `secret_XXXXXXXX...`

### 2.3 Notionデータベース設定
1. Notionで新しいページを作成
2. `/database` でデータベースを作成
3. データベース名: `市場調査結果`
4. 必要なプロパティを設定:
   - タイトル: `調査項目名`（Title）
   - ステータス: `進行状況`（Select）
   - 日付: `作成日`（Date）
   - リッチテキスト: `調査内容`（Rich text）

### 2.4 データベース権限設定
1. データベース右上の「Share」をクリック
2. 「Invite」で先ほど作成した統合を招待
3. 権限: 「Can edit」を選択

### 2.5 データベースID取得
- データベースのURL: `https://www.notion.so/XXXXXXX?v=YYYYY`
- データベースID: `XXXXXXX` 部分をコピー

## 3. 環境変数ファイル作成

```bash
# プロジェクトルートで実行
cp env.example .env
```

### 3.1 .env ファイル編集
```env
# Google Gemini API設定
GEMINI_API_KEY=取得したGemini APIキー

# Notion API設定  
NOTION_TOKEN=取得したNotion統合トークン
NOTION_DATABASE_ID=取得したNotionデータベースID

# サーバー設定
PORT=3000
NODE_ENV=production

# パフォーマンス設定
PARALLEL_BATCH_SIZE=4
BATCH_INTERVAL=2000
```

## 4. 動作確認手順

### 4.1 サーバー起動
```bash
npm run dev
```

### 4.2 テスト実行
```bash
# ブラウザで http://localhost:3000 にアクセス
# TalkLabelテストデータで市場調査を実行
```

### 4.3 Notion確認
- 作成したデータベースに16種類の調査項目が作成されることを確認
- 各項目のステータスが「未着手」→「進行中」→「完了」に更新されることを確認

## 5. 料金目安

### 5.1 Gemini API料金（1回の調査あたり）
- **入力tokens**: 約50,000 tokens → $0.175
- **出力tokens**: 約30,000 tokens → $0.315  
- **合計**: 約$0.49（約75円）

### 5.2 Notion API料金
- **完全無料**（API制限内）
- 制限: 1秒間10リクエスト

## 6. セキュリティ注意事項

⚠️ **重要**: APIキーは絶対に公開しない
- `.env` ファイルは `.gitignore` に含まれています
- 本番環境では環境変数として設定
- 定期的なAPIキーローテーション推奨 