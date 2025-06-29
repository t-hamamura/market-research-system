# 市場調査自動化システム

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Gemini 2.5](https://img.shields.io/badge/Gemini-2.5%20Flash-orange)
![Notion API](https://img.shields.io/badge/Notion-API%20v1-black)
![Railway](https://img.shields.io/badge/Deploy-Railway-purple)

Gemini 2.5とNotionを活用した16種類の詳細市場調査を自動実行するフルスタックWebアプリケーション

## ✨ 特徴

- 🔍 **16種類の詳細市場調査**: 市場規模、競合分析、PESTEL分析など包括的な調査
- 🤖 **Gemini 2.5 Flash**: 最新のAI技術による高度な市場分析
- 🚀 **Deep Research機能**: 基本調査→深掘り分析→統合レポートの3段階調査
- 📝 **Notion統合**: 調査結果を美しく整理されたNotionページとして自動保存
- 📊 **拡張サービス仮説**: 13項目の詳細なサービス仮説設定
- ⚡ **リアルタイム進行状況**: Server-Sent Eventsによる進行状況のリアルタイム表示
- 📱 **レスポンシブデザイン**: モバイルファーストの美しいUI/UX
- 🛡️ **安定性向上**: Notion API制限対策、エラーハンドリング強化
- 🚀 **TypeScript**: 型安全な開発環境

## 🎯 システム概要

このシステムは、**13項目の詳細なサービス仮説**を入力するだけで以下の16種類の市場調査を自動実行します：

### 📋 調査項目一覧

1. **市場規模と成長性の調査** - 市場データ、成長予測、地域別分析
2. **PESTEL分析の調査** - 政治・経済・社会・技術・環境・法的要因分析
3. **競合の製品特徴・戦略分析** - 競合製品、プライシング、マーケティング手法
4. **競合の経営戦略変遷・顧客離脱理由** - 戦略変化、顧客離脱要因分析
5. **顧客セグメント・意思決定プロセス分析** - ペルソナ設定、購買プロセス
6. **顧客感情・潜在ニーズ・情報収集行動マッピング** - 顧客インサイト分析
7. **プロダクト市場適合性と価格戦略** - MVP設計、価格感応度テスト
8. **マーケティング戦術分析** - 最適チャネル、コンテンツ戦略、ROI評価
9. **ブランドポジショニングとコミュニケーション** - ブランド戦略、メッセージング
10. **テクノロジートレンド・セキュリティ分析** - 業界トレンド、技術リスク対策
11. **パートナーシップ戦略とエコシステム形成** - 提携先特定、エコシステム設計
12. **リスク・シナリオ分析** - リスク要因、シナリオプランニング
13. **KPI・測定方法の設計** - 主要指標設定、測定体制構築
14. **法務・コンプライアンスリスク分析** - 法的リスク、対策案設計
15. **効果的なリサーチ手法の提案** - 一次・二次調査設計、A/Bテスト計画
16. **PMF前特化リサーチ設計** - MVP設計、アーリーアダプター特定、仮説検証

### 🎯 サービス仮説入力項目（13項目）

#### 必須項目（10項目）
1. **事業名** - Notionレポートのタイトル
2. **コンセプト** - サービスの核となるアイデア・価値提案
3. **解決したい顧客課題** - ターゲットとする具体的な課題
4. **狙っている業種・業界** - ターゲット市場の業界・規模
5. **想定される利用者層** - ユーザーペルソナ、属性、行動特性
6. **直接競合・間接競合** - 既存競合、代替手段
7. **課金モデル** - 収益構造、マネタイゼーション方法
8. **価格帯・価格設定の方向性** - 価格戦略、価格レンジ
9. **暫定UVP（Unique Value Proposition）** - 競合との差別化ポイント
10. **初期KPI** - 継続率、CVR、CAC、LTVなどの目標指標
11. **獲得チャネル仮説** - 顧客獲得の手法と優先順位

#### 任意項目（2項目）
12. **規制・技術前提** - GDPR、API依存性、技術制約など
13. **想定コスト構造** - 変動費、固定費、人件費の想定

## 🛠️ 技術スタック

### バックエンド
- **Node.js** + **Express**: サーバーフレームワーク
- **TypeScript**: 型安全な開発
- **Google Gemini 2.5 Flash**: AI市場調査エンジン
- **Notion API**: レポート保存（段階的送信対応）
- **Server-Sent Events**: リアルタイム通信

### フロントエンド
- **HTML5** + **CSS3** + **JavaScript**: モダンなSPA
- **Inter Font**: 美しいタイポグラフィ
- **CSS Grid/Flexbox**: レスポンシブレイアウト
- **リアルタイムUI**: 進行状況表示、エラーハンドリング

### 開発・デプロイ
- **ts-node**: TypeScript実行環境
- **Railway**: 本番デプロイメント
- **GitHub**: ソースコード管理
- **dotenv**: 環境変数管理
- **CORS**: クロスオリジン対応

### 安定性・パフォーマンス
- **Notion API制限対策**: 段階的ブロック送信、413エラー回避
- **レート制限対応**: API呼び出し間隔調整、自動リトライ
- **エラーハンドリング**: 詳細なログ、グレースフル・デグラデーション
- **メモリ最適化**: 大量データ処理の効率化

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
git clone https://github.com/your-username/market-research-system.git
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
- Gemini API・Notion APIの接続状態をチェック

### 2. サービス仮説入力（13項目）

#### 📝 必須項目の詳細入力例
```
事業名: InstagramマーケティングSaaS

コンセプト: 
"投稿1本あたりの売上を可視化し、自動改善サイクルを回す"InstagramマーケティングSaaS。
ノーコードで使える分析＋提案＋オートポスト機能がワンパッケージ。

解決したい顧客課題:
① 投稿ごとの貢献度が不明でPDCAが回らない
② デザイナー/編集担当が少人数で、手動運用が工数過多
③ 外部代理店に頼るとコストが高くナレッジが内部に蓄積しない

狙っている業種・業界:
- 主にD2C（コスメ・アパレル・ヘルスケア）
- 年商1〜20億円規模の成長中EC事業者
- マーケティング代理店の運用代行チーム

想定される利用者層:
- 25〜40歳のマーケティング担当者（チーム1〜3名）
- Instagram運用歴6か月以上 / 投稿週3本以上
- GA4／Shopifyなどの数値管理に興味が高いがSQLは書けない

直接競合・間接競合:
直接: Buffer, Hootsuite, Later
間接: Excel＋Metaインサイトの手作業運用、運用代行会社

課金モデル:
月額サブスクリプション3ティア
- Starter／Growth／Scale
- 追加ユーザー・追加アカウントは従量課金

価格帯・価格設定の方向性:
Starter: $49／月（1アカウント）
Growth: $149／月（3アカウント・A/Bテスト機能）
Scale: $399／月（10アカウント・AI自動投稿・API）

暫定UVP:
「わずか1分で"売上に直結した投稿TOP3"と"次回の改善案"を提示」
—競合は投稿エンゲージメント止まり。

初期KPI:
- 30日後継続率 ≥ 40％
- 月次平均CVR改善率：導入3か月内に＋15％
- CAC ≤ $250／社、LTV/CAC ≥ 3

獲得チャネル仮説:
① LinkedIn広告（マーケ担当の職種ターゲティング）
② "SNS伸び悩み診断"LPからのインバウンド
③ D2C向け展示会への出展＋無料トライアル配布
```

#### 🔧 任意項目の入力例
```
規制・技術前提:
- EU/EEA向けユーザーはGDPRに準拠（匿名化ID & Data Processing Agreement）
- Instagram Graph APIに依存：MetaのAPI使用ポリシー改定に備え冗長化プラン必須

想定コスト構造:
- 変動費：OpenAI／Gemini API推論＝売上比15％目安
- 固定費：GCPサーバ＋画像ストレージ ≒ $1,200／月
- カスタマーサクセス人件費：売上比10％まで
```

### 3. 調査実行
「調査開始」ボタンをクリックして16種類の調査を開始

### 4. 進行状況確認
- **プログレスバー**: 全体進捗（16調査 + 統合レポート + Notion保存）
- **現在の調査**: 実行中の調査内容をリアルタイム表示
- **調査項目リスト**: 各調査の完了状況（⏳→🔄→✅）
- **推定残り時間**: 各調査約30-60秒、全体5-8分

### 5. 結果確認
- 調査完了後、「Notionレポートを開く」ボタンでレポートにアクセス
- Notionページには以下が含まれます：
  - 📋 サービス仮説（13項目）
  - 📊 統合レポート（AI分析サマリー）
  - 🔍 個別調査結果（16種類の詳細分析）

## 📊 APIエンドポイント

### システム情報
- `GET /api/research/health` - ヘルスチェック（Gemini・Notion接続確認）
- `GET /api/research/info` - システム情報・機能一覧
- `GET /api/research/prompts` - 調査プロンプト一覧

### 調査機能
- `POST /api/research/validate` - サービス仮説バリデーション
- `POST /api/research/start` - 市場調査開始（Server-Sent Events）

### レスポンス例
```json
{
  "success": true,
  "data": {
    "businessName": "InstagramマーケティングSaaS",
    "notionUrl": "https://notion.so/...",
    "completedAt": "2024-06-29T16:30:00.000Z"
  }
}
```

## 🔧 カスタマイズ

### 調査プロンプトの変更
`src/services/researchService.ts`の`initializeResearchPrompts()`メソッドで調査内容をカスタマイズ

### Deep Research機能の調整
`src/services/deepResearchService.ts`で3段階調査プロセスをカスタマイズ

### UI/UXの変更
- `public/style.css`: CSS変数でテーマカスタマイズ
- `public/index.html`: フォーム項目の調整
- `public/script.js`: インタラクション改善

### Notion出力形式の変更
`src/services/notionService.ts`の`createServiceHypothesisBlocks()`でブロック形式を調整

### パフォーマンス調整
```env
RESEARCH_INTERVAL=1500       # 調査間隔（ミリ秒）
PARALLEL_BATCH_SIZE=4        # 並列実行バッチサイズ（1-8推奨）
BATCH_INTERVAL=2000          # バッチ間待機時間（ミリ秒）
NODE_ENV=production          # ログレベル調整
```

### 🚀 並列処理機能
- **高速化**: 16種類の調査を4つずつバッチで並列実行
- **実行時間短縮**: 約15-20分 → **5-8分**に短縮
- **API制限対策**: バッチ間の適切な間隔で安定性確保
- **カスタマイズ可能**: 環境変数でバッチサイズ・間隔を調整

## 🚨 トラブルシューティング

### よくある問題と解決策

#### 1. 「システムエラー」が表示される
**症状**: ステータスが「システムエラー」「接続エラー」
**原因**: APIキーまたはNotion設定が正しくない
**解決方法**:
```bash
# .envファイルの確認
cat .env

# ログの確認
npm run dev
# コンソールでエラーメッセージを確認
```

#### 2. 調査が途中で停止・タイムアウト
**症状**: 進行状況が途中で止まる、エラーメッセージ表示
**原因**: Gemini APIレート制限、ネットワークエラー、Notion API制限
**解決方法**:
```env
# .envでレート制限を緩和
RESEARCH_INTERVAL=2000  # 2秒間隔に変更
```

#### 3. Notion API 413エラー（Request body too large）
**症状**: 「Notionページ作成エラー」メッセージ
**原因**: 大量データの一括送信
**解決方法**: ✅ **解決済み** - 段階的送信機能で自動対応

#### 4. TypeScriptコンパイルエラー
**症状**: ビルド時のエラー、Railway デプロイ失敗
**解決方法**:
```bash
# 型チェック
npm run build

# ローカルで確認
npm run dev
```

### デバッグ手順

#### 1. ログレベル調整
```env
NODE_ENV=development  # 詳細ログ出力
```

#### 2. 個別サービステスト
```javascript
// ブラウザ開発者ツールで実行
fetch('/api/research/health')
  .then(res => res.json())
  .then(console.log);
```

#### 3. Notionページの手動確認
- Notion統合が正しくワークスペースに追加されているか
- データベースのプロパティ設定が正しいか
- APIトークンの権限が適切か

## 📈 パフォーマンス・スケーラビリティ

### 推奨環境
- **メモリ**: 最小512MB、推奨1GB
- **CPU**: 1コア以上（16調査実行時は一時的に高負荷）
- **ネットワーク**: 安定したインターネット接続

### 処理時間の目安
- **単一調査**: 30-60秒
- **16調査全体**（並列処理）: 5-8分（従来の15-20分から大幅短縮）
- **Notionページ作成**: 2-3分
- **総実行時間**: 約8-12分（従来の20-25分から大幅短縮）

### スケーラビリティ対策
- Railway.app での水平スケーリング対応
- Gemini API レート制限の自動調整
- Notion API 制限回避の段階的送信
- メモリ使用量の最適化

## 📝 開発者向け情報

### プロジェクト構造
```
market-research-system/
├── src/
│   ├── server.ts                    # Express サーバー
│   ├── types/
│   │   └── index.ts                 # TypeScript型定義
│   ├── services/
│   │   ├── geminiService.ts         # Gemini API サービス
│   │   ├── deepResearchService.ts   # Deep Research機能
│   │   ├── notionService.ts         # Notion API サービス（段階的送信対応）
│   │   └── researchService.ts       # 調査統括サービス
│   └── routes/
│       └── research.ts              # API ルート・エンドポイント
├── public/
│   ├── index.html                   # SPA メインページ
│   ├── style.css                    # レスポンシブ CSS
│   └── script.js                    # フロントエンド JavaScript
├── .npmrc                           # npm設定（legacy-peer-deps）
├── env.example                      # 環境変数テンプレート
├── package.json                     # 依存関係・スクリプト
├── tsconfig.json                    # TypeScript設定
├── Procfile                         # Railway デプロイ設定
├── railway.toml                     # Railway 設定
├── nixpacks.toml                    # Nixpacks ビルド設定
└── README.md                        # このファイル
```

### 型安全性
- **厳密な型定義**: 全API通信、状態管理に型チェック
- **ServiceHypothesis型**: 13項目の仮説データ構造
- **ProgressEvent型**: リアルタイム進行状況の型安全性
- **エラーハンドリング**: 型安全なエラー処理

### セキュリティ
- **環境変数管理**: APIキーの安全な管理
- **CORS設定**: オリジン制御
- **入力検証**: サニタイゼーション・バリデーション
- **レート制限**: API滥用防止

### CI/CD
- **GitHub**: ソースコード管理
- **Railway**: 自動デプロイ（GitHub連携）
- **Hot Deploy**: コミット時の自動再デプロイ

## 🌟 最新アップデート

### v2.0.0 (2024-06-29)
- ✅ **サービス仮説拡張**: 8項目→13項目（UVP、KPI、チャネル仮説等）
- ✅ **Notion API改善**: 413エラー対策、段階的送信機能
- ✅ **Deep Research**: 3段階調査（基本→深掘り→統合）
- ✅ **安定性向上**: TypeScript型整合性、エラーハンドリング強化
- ✅ **UI/UX改善**: 任意項目対応、バリデーション強化

### v1.0.0 (Initial Release)
- 16種類の市場調査自動実行
- Gemini 2.5 Flash統合
- Notion API連携
- Server-Sent Events
- レスポンシブ設計

## 🤝 貢献

1. リポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/AmazingFeature`)
3. 変更をコミット (`git commit -m 'Add some AmazingFeature'`)
4. ブランチにプッシュ (`git push origin feature/AmazingFeature`)
5. プルリクエストを作成

### 開発ガイドライン
- TypeScript型定義の維持
- エラーハンドリングの実装
- ユニットテストの追加
- ドキュメント更新

## 📄 ライセンス

このプロジェクトはMITライセンスの下で公開されています。詳細は`LICENSE`ファイルを参照してください。

## 🙏 謝辞

- [Google Gemini](https://ai.google.dev/) - 高度なAI分析エンジン
- [Notion API](https://developers.notion.com/) - 美しいレポート作成プラットフォーム
- [Railway](https://railway.app/) - 簡単デプロイメント環境
- [Inter Font](https://rsms.me/inter/) - モダンなタイポグラフィ

## 📞 サポート

問題が発生した場合：

1. **README確認**: トラブルシューティングセクションを参照
2. **GitHub Issues**: 既存の問題を検索
3. **新規Issue作成**: 詳細な環境情報とエラーログを含めて報告

### Issue報告時の情報
- OS・ブラウザバージョン
- Node.js バージョン
- エラーメッセージの全文
- 実行環境（ローカル・Railway）
- 再現手順

---

**🚀 Powered by Gemini 2.5 Flash & Notion API**

*最新の市場調査AIで、あなたのビジネスアイデアを詳細分析しましょう！* 