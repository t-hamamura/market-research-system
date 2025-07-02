# 🐛 本番環境バグ修正ワークフロー

## 📋 **現在の作業環境**
- **ブランチ**: `bugfix/production-issues`
- **目的**: 本番テスト稼働で発見されたバグの修正
- **ベース**: main ブランチ（最新デプロイ版）

## 🔍 **バグ分析フェーズ**

### **Step 1: バグ情報の整理**
以下の情報を収集してください：

```markdown
## バグレポート

### 🚨 発生した問題
- [ ] 具体的な症状：
- [ ] 発生タイミング：
- [ ] 期待していた動作：
- [ ] 実際の動作：

### 🌍 環境情報
- [ ] 発生環境：Railway本番環境
- [ ] ブラウザ：
- [ ] 使用した事業名：
- [ ] 実行した調査内容：

### 📊 ログ・エラー情報
- [ ] ブラウザConsoleエラー：
- [ ] RailwayログのURL：
- [ ] Notionページの状況：
- [ ] APIエラーメッセージ：

### 🔄 再現手順
1. 
2. 
3. 
```

### **Step 2: ローカル環境での再現確認**
```bash
# 開発サーバー起動
npm run dev

# ブラウザで http://localhost:3000 にアクセス
# 本番環境と同じ手順でバグを再現
```

### **Step 3: ログ確認コマンド**
```bash
# TypeScriptコンパイルエラーチェック
npm run build

# Railway本番ログ確認（必要に応じて）
# Railway Dashboard → Deployments → Logs
```

## 🔧 **バグ修正フェーズ**

### **修正パターン別対応**

#### **🎯 フロントエンド問題**
- `public/script.js` - JavaScript ロジック
- `public/style.css` - UI/UX 問題
- `public/index.html` - HTML構造

#### **⚙️ バックエンド問題**
- `src/services/researchService.ts` - 調査全体制御
- `src/services/geminiService.ts` - AI調査処理
- `src/services/notionService.ts` - Notion連携
- `src/services/notionBatchService.ts` - 一括処理

#### **🔗 API連携問題**
- 環境変数の確認
- API制限・レート制限の調査
- エラーハンドリングの改善

### **修正時の注意事項**
- [ ] 破壊的変更の回避
- [ ] 既存機能への影響確認
- [ ] エラーハンドリングの追加
- [ ] ログ出力の改善

## 🧪 **テストフェーズ**

### **ローカルテスト**
```bash
# TypeScriptコンパイル確認
npm run build

# 開発サーバーでの動作確認
npm run dev
```

### **修正内容の検証**
- [ ] バグが修正されていることの確認
- [ ] 既存機能が正常動作することの確認
- [ ] エラーケースの適切な処理
- [ ] ユーザビリティの向上

## 📦 **デプロイフェーズ**

### **コミット・プッシュ**
```bash
# 修正ファイルをステージング
git add .

# Conventional Commit形式でコミット
git commit -m "fix: resolve [具体的な問題] 

- 修正内容1
- 修正内容2
- テスト結果

Fixes: #issue-number
Tested: ローカル環境で動作確認済み"

# リモートにプッシュ
git push origin bugfix/production-issues
```

### **マージ・デプロイ**
```bash
# mainブランチへマージ
git checkout main
git pull origin main
git merge bugfix/production-issues
git push origin main

# Railwayで自動デプロイ実行
# デプロイ完了後、本番環境で修正確認
```

## 🚨 **緊急時対応**

### **即座に本番修正が必要な場合**
```bash
# ホットフィックス用ブランチ作成
git checkout main
git checkout -b hotfix/critical-issue

# 修正 → 即座にmainへマージ → デプロイ
```

### **ロールバックが必要な場合**
```bash
# 前のコミットに戻す
git revert HEAD
git push origin main
```

## 📊 **修正完了チェックリスト**
- [ ] バグの根本原因を特定済み
- [ ] 修正コードをローカルで検証済み
- [ ] 既存機能への影響がないことを確認済み
- [ ] 適切なエラーハンドリングを追加済み
- [ ] コミットメッセージが適切
- [ ] 本番環境で修正を確認済み
- [ ] ドキュメントの更新（必要に応じて）

## 📞 **関連リソース**
- **Railway Dashboard**: [Production App URL]
- **Notion Database**: [Database URL]
- **GitHub Repository**: https://github.com/t-hamamura/market-research-system
- **API Documentation**: Railway環境のAPIエンドポイント 