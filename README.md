# AI Market Research System

[![AI Powered](https://img.shields.io/badge/AI-Gemini%20Powered-4A90C2?style=for-the-badge)]()
[![Database](https://img.shields.io/badge/Database-Notion%20API-000000?style=for-the-badge&logo=notion)]()
[![Framework](https://img.shields.io/badge/Framework-Node.js-339933?style=for-the-badge&logo=node.js)]()

最先端のAI市場調査自動化システム。

Gemini AIとNotion APIを活用して、16種類の専門的な市場調査を並列実行し、構造化されたビジネス分析レポートをNotion上に自動生成する高度なソリューションです。

---

## 🎯 システム概要

### 核心機能
- **🤖 AI駆動型分析**: Gemini AIが、指定されたサービス仮説に基づき16種類の市場調査を自動実行。
- **⚡ 高速な並列処理**: 複数の調査をバッチで並列実行し、調査時間を大幅に短縮（従来比3倍以上）。
- **📊 構造化レポート**: AIの応答を単なるマークダウンではなく、Notionに最適化された**構造化JSON**として生成。トグルリストやコールアウトなどを活用した、視覚的で分かりやすいレポートを作成します。
- **📋 リアルタイム保存**: 各調査の完了ごとに、結果を個別のNotionページとして即座に保存。
- **🛡️ 高度なエラー耐性**: APIのレート制限やネットワークエラーに対応する自動リトライ機能、途中から調査を再開できるチェックポイント機能などを搭載。
- **🎨 シンプルなUI**: 直感的に操作できるクリーンなユーザーインターフェース。

### 対象ユーザー
- **事業企画・開発者**: 新規事業のアイデア検証や市場参入戦略の策定に。
- **経営層・マネージャー**: データに基づいた迅速な意思決定のための情報収集に。
- **コンサルタント**: クライアント向けの市場分析レポート作成の効率化に。
- **スタートアップ・起業家**: 投資家向け資料作成や、MVP開発前の市場調査に。

---

## 🔬 調査機能詳細

### Notionに最適化されたレポート出力
本システムの最大の特徴は、AIの生成結果をNotionのブロック構造に最適化された**構造化JSON**で出力させる点にあります。これにより、以下のような高品質なレポートが自動生成されます。

- **📄 統合レポートページ**: 全16種類の調査結果を統合し、要約と詳細な分析を含む包括的なレポートを1ページに生成。
- **📂 個別調査ページ（トグル形式）**: 統合レポート内では、各調査結果が**トグルリスト**に格納されます。これにより、レポートの全体像を把握しやすく、興味のある項目だけを展開して詳細を確認できます。
- **✨ リッチな表現力**: **コールアウトブロック**による重要事項のハイライト、色分けされた**見出し**、**箇条書き**などを活用し、可読性の高いドキュメントを生成します。

### 16種類の専門調査項目
ビジネス分析に必要なフレームワークを網羅した、16の調査項目を自動で実行します。

1.  **市場規模と成長性の調査**
2.  **PESTEL分析**
3.  **競合の製品特徴・戦略分析**
4.  **競合の経営戦略変遷・顧客離脱理由**
5.  **顧客セグメント・意思決定プロセス分析**
6.  **顧客感情・潜在ニーズ・情報収集行動マッピング**
7.  **プロダクト市場適合性と価格戦略**
8.  **マーケティング戦術分析**
9.  **ブランドポジショニングとコミュニケーション**
10. **テクノロジートレンド・セキュリティ分析**
11. **パートナーシップ戦略とエコシステム形成**
12. **リスク・シナリオ分析**
13. **KPI・測定方法の設計**
14. **法務・コンプライアンスリスク分析**
15. **効果的なリサーチ手法の提案**
16. **PMF前特化リサーチ設計**

---

## 🚀 クイックスタート

### 前提条件
- Node.js (v18以上推奨)
- `npm` or `yarn`
- Gemini API Key
- Notion Integration Token & Database ID

### セットアップ手順

1.  **リポジトリのクローン**
    ```bash
    git clone https://github.com/t-hamamura/market-research-system.git
    cd market-research-system
    ```

2.  **依存関係のインストール**
    ```bash
    npm install
    ```

3.  **環境変数の設定**
    `.env.example`をコピーして`.env`ファイルを作成します。
    ```bash
    cp env.example .env
    ```
    `.env`ファイルに必要な情報を入力してください。
    ```env
    # 必須設定
    GEMINI_API_KEY="your_gemini_api_key_here"
    NOTION_TOKEN="your_notion_integration_token"
    NOTION_DATABASE_ID="your_notion_database_id"
    NODE_ENV="production"
    PORT=3000

    # パフォーマンス最適化（任意）
    PARALLEL_BATCH_SIZE=4
    BATCH_INTERVAL=2000
    ```

4.  **ビルド & 起動**
    ```bash
    npm run build
    npm start
    ```

5.  **アクセス**
    ブラウザで `http://localhost:3000` を開きます。

---

## 🏗️ システム構成

### アーキテクチャ
アーキテクチャの中心は、AIの応答を構造化JSONとして受け取り、それを確定的なNotionブロックに変換するバックエンドエンジンです。

```
┌──────────┐      ┌───────────────────────────┐      ┌─────────────────┐
│          │      │     Backend (Node.js)     │      │  External APIs  │
│ Frontend │◄─────►│ ┌───────────────────────┐ │◄─────►│ - Gemini AI     │
│ (UI)     │      │ │ JSON-to-Notion Engine │ │      │ - Notion API    │
│          │      │ └───────────────────────┘ │      │                 │
└──────────┘      └───────────────────────────┘      └─────────────────┘
```

### 技術スタック
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js, TypeScript, Express.js
- **AI Engine**: Google Gemini
- **Database**: Notion API
- **推奨デプロイ環境**: Railway, Heroku, etc.

---

## 🛠️ 開発者ガイド

### 開発コマンド
- **開発モードで起動**: `npm run dev`
- **TypeScript監視モード**: `npm run watch` (現在は設定なし)
- **リンター実行**: `npm run lint` (現在は設定なし)
- **テスト実行**: `npm run test`

### ディレクトリ構成
```
/
├── src/
│   ├── server.ts                 # Expressサーバーのメインファイル
│   │   └── server.ts            # Expressサーバーのメインファイル
│   ├── services/
│   │   ├── geminiService.ts      # Gemini AIとの連携
│   │   ├── notionService.ts      # Notion APIとの連携（JSON-to-Block変換エンジン）
│   │   └── researchService.ts    # 16種類の調査を統括するコアエンジン
│   │       └── researchService.ts    # 16種類の調査を統括するコアエンジン
│   ├── routes/
│   │   └── research.ts           # APIエンドポイントの定義
│   └── types/
│       └── index.ts              # グローバルな型定義
├── public/
│   ├── index.html                # フロントエンドUI
│   ├── style.css                 # スタイルシート
│   └── script.js                 # フロントエンドのロジック
└── README.md                     # このファイル
```

---

## 🤝 コントリビューション
バグ報告、機能要望、Pull Requestはいつでも歓迎します。Issueを立てるか、直接PRを作成してください。

## 📄 ライセンス
This project is licensed under the MIT License. 