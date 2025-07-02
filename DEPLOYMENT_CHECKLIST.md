# 🚀 Railway本番環境デプロイ チェックリスト

## ✅ **事前完了項目**
- [x] TypeScriptコンパイル成功確認
- [x] 依存関係の整合性確認（脆弱性ゼロ）
- [x] PCスリープ重複問題修正完了
- [x] コード変更コミット完了

## 📋 **デプロイ前必須作業**

### **Step 1: ブランチマージ準備**
```bash
# 現在のbugfix/checkブランチをプッシュ
git push origin bugfix/check

# mainブランチに切り替え
git checkout main
git pull origin main

# bugfix/checkブランチをマージ
git merge bugfix/check
```

### **Step 2: Railway環境変数確認**
以下の環境変数がRailway UIで正しく設定されているか確認：

#### **必須環境変数**
- [ ] `GEMINI_API_KEY` - Google Gemini API キー
- [ ] `NOTION_TOKEN` - Notion Integration Token  
- [ ] `NOTION_DATABASE_ID` - Notion Database ID

#### **Gemini AI設定**
- [ ] `GEMINI_MODEL=gemini-2.5-flash`
- [ ] `GEMINI_TEMPERATURE=0.7`
- [ ] `GEMINI_MAX_TOKENS=8192`

#### **パフォーマンス設定**
- [ ] `PARALLEL_BATCH_SIZE=4`
- [ ] `BATCH_INTERVAL=2000` 
- [ ] `RESEARCH_INTERVAL=2000`

#### **サーバー設定**
- [ ] `PORT=3000`
- [ ] `NODE_ENV=production`

### **Step 3: Railway設定確認**
- [ ] ヘルスチェック設定: `/health` エンドポイント
- [ ] 再起動ポリシー: `ON_FAILURE` (最大3回)
- [ ] ビルダー: `NIXPACKS`
- [ ] スタートコマンド: `npm start`

### **Step 4: デプロイ後テスト計画**

#### **基本機能テスト**
1. [ ] ヘルスチェック: `GET /health`
2. [ ] 調査プロンプト取得: `GET /api/research/prompts`
3. [ ] サービステスト: `GET /api/research/test`

#### **PCスリープ重複問題テスト**
1. [ ] 調査開始
2. [ ] 途中で意図的にブラウザを閉じる / PCをスリープ
3. [ ] 再開して同じ事業名で調査実行
4. [ ] 統合レポートが重複せずに既存ページに統合されることを確認

#### **エンドツーエンドテスト**
1. [ ] TalkLabel事例での完全調査実行
2. [ ] 16種類すべての調査完了確認
3. [ ] 統合レポート生成確認
4. [ ] Notion側でのページ構造・装飾確認

### **Step 5: 監視・ログ確認**
- [ ] Railwayダッシュボードでのデプロイステータス確認
- [ ] アプリケーションログでのエラー有無確認
- [ ] Notion API制限の状況確認
- [ ] Gemini API使用量の確認

## 🚨 **緊急時ロールバック手順**
問題が発生した場合の対処法：

```bash
# 前のコミットに戻す
git log --oneline  # コミット履歴確認
git revert <commit-hash>  # 特定コミットを元に戻す
git push origin main  # ロールバックをプッシュ
```

## 📞 **サポート情報**
- **Railway Documentation**: https://docs.railway.app/
- **Notion API Status**: https://status.notion.so/
- **Google AI Studio**: https://aistudio.google.com/

## 📊 **成功指標**
- [ ] デプロイエラーゼロ
- [ ] ヘルスチェック正常
- [ ] PCスリープテスト成功
- [ ] エンドツーエンドテスト完了
- [ ] 統合レポート重複作成問題解消確認 