import { GoogleGenerativeAI } from '@google/generative-ai';
import { GeminiConfig, ServiceHypothesis } from '../types';

/**
 * Gemini API サービスクラス
 * Google Gemini 2.5 Flash APIを使用して市場調査を実行
 */
export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private config: GeminiConfig;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 1500; // API制限対策: 1.5秒間隔

  constructor(config: GeminiConfig) {
    this.config = config;
    this.genAI = new GoogleGenerativeAI(config.apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: config.model || 'gemini-2.5-flash',
      generationConfig: {
        temperature: config.temperature || 0.7,
        maxOutputTokens: config.maxTokens || 8192,
      },
    });
  }

  /**
   * 市場調査を実行（Notion視覚化強化・Markdown出力強化版）
   * @param prompt 調査プロンプト
   * @param serviceHypothesis サービス仮説
   * @returns 調査結果
   */
  async conductResearch(prompt: string, serviceHypothesis: ServiceHypothesis): Promise<string> {
    try {
      // サービス仮説情報をフォーマット
      const hypothesisContext = this.formatServiceHypothesis(serviceHypothesis);
      
      // 🎨 Notion視覚化の装飾強化指示（色制限版）
      const notionVisualPrompt = `
**🎨 Notion装飾の重要指示 - 以下の色制限を厳守してください:**

**📋 使用可能な色：**
- **テキスト色：** 通常のテキスト（デフォルト）または赤色のテキストのみ
- **背景色：** 黄色の背景のみ
- **その他の装飾：** 太字、斜体、箇条書き、表、見出しは自由に使用

**🎯 必須の視覚化要素（色制限内で実装）：**
1. **📊 表形式データを必ず含める** - 各調査で最低2つの表を作成
2. **💡 Callout（引用符>）で重要ポイントを強調** - 黄色背景を活用
3. **🔗 見出しの階層化** - H1、H2、H3で情報を整理
4. **📝 箇条書きとチェックリスト** で要点整理
5. **⚠️ 重要な警告や注意事項は赤色テキスト**を使用

**📈 必須表形式データ：**
- 市場規模データ表
- 競合他社比較表  
- KPI設定表
- リスク評価表
- アクションプラン表

**💡 Callout使用例：**
> **💡 重要なポイント：** この情報は戦略決定において重要な要素です

> **⚠️ 注意事項：** リスクを考慮した慎重な検討が必要です

**🎨 装飾ガイドライン：**
- **重要な数値や結論は太字**で強調
- **リスクや警告は赤色テキスト**で表示
- **要点は箇条書き**で整理
- **詳細データは表形式**で提示
- **背景色は黄色のみ**を使用`;

      // Notion向け視覚化を強制するための拡張プロンプト
      const enhancedPrompt = `
${prompt}

【サービス仮説情報】
${hypothesisContext}

🎯 **出力形式の指示（Notion向け視覚化強化版）**:

📊 **必須の視覚化要素を含めてください**:
- **必ずMarkdown形式で出力**
- 見出しは ## や ### を使用（例：## 📊 市場概要、### 🎯 主要プレイヤー）
- 重要なポイントは **太字** で強調
- 数値データは表形式で整理：

| 項目 | 数値 | 備考 |
|------|------|------|
| 市場規模 | XX億円 | 2024年 |
| 成長率 | XX% | 年間 |

- 比較データは必ず表形式で提示
- プロセスは番号付きリスト（1. 2. 3. ...）
- 要点は箇条書き（- または * 使用）
- 重要な警告は > ⚠️ 注意：〜 形式
- 成功要因は > 💡 ポイント：〜 形式
- 基本情報は > 📝 補足：〜 形式

🔍 **必須の構造化セクション**:
1. **## 📋 エグゼクティブサマリー**
   - 🎯 主要発見事項（3-5点、**太字**で強調）
   - 📊 重要な数値（表形式）
   - ⚡ アクションアイテム（番号付きリスト）

2. **## 📊 詳細分析**
   - ### 📈 市場データ（表やグラフ形式で整理）
   - ### 🏢 企業・競合情報（比較表形式）
   - ### 👥 顧客・ユーザー情報（セグメント表）
   - ### 💰 財務・価格情報（価格比較表）

3. **## 📈 データと根拠**
   - 具体的な数値やソース情報（表形式）
   - 引用元や参考資料（リンク付き）
   - 統計データの出典明記

4. **## ⚡ 実行可能な提案**
   - 短期アクション（3ヶ月）
   - 中期戦略（6-12ヶ月） 
   - 長期ビジョン（1-3年）

5. **## 📚 参考情報**
   - 関連するURLやリソース
   - 追加調査項目の提案

📊 **図表とデータ表現**:
- 比較データは必ず | で区切った表形式
- 数値データは具体的に（「多い」ではなく「300%増加」）
- パーセンテージ、金額、人数は具体的数値
- 年度、期間、地域を明記
- 出典・ソースを表の下部に記載

🎨 **視覚的な読みやすさ**:
- 絵文字を効果的に使用（📊📈🎯💡⚠️🏢👥💰📝など）
- 区切り線 --- で大きなセクションを分離
- 重要な発見は **太字** と > 引用形式を併用
- コードやURL例は \`\`\` で囲む
- 長いリストはToggle形式を意識した構造化

上記の形式に従って、Notionで読みやすく視覚的にインパクトのある市場調査レポートを作成してください。
データが具体的でない場合は、業界標準や類似事例を参考に推定値を含めても構いません。

${notionVisualPrompt}
      `;

      console.log(`[GeminiService] Notion視覚化強化プロンプト送信 (${enhancedPrompt.length}文字)`);
      
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      const result = await model.generateContent(enhancedPrompt);
      const response = await result.response;
      const resultText = response.text();
      
      console.log(`[GeminiService] Gemini APIレスポンス受信: ${resultText.length}文字`);
      console.log(`[GeminiService] 視覚化要素確認:`, {
        hasHeadings: /^#{1,6}\s/.test(resultText),
        hasBold: /\*\*[^*]+\*\*/gm.test(resultText),
        hasLists: /^[\-\*]\s/gm.test(resultText),
        hasTables: /\|.*\|.*\|/gm.test(resultText),
        hasCallouts: /^>\s*[📝💡⚠️]/gm.test(resultText),
        hasEmojis: /[📊📈🎯💡⚠️🏢👥💰📝]/g.test(resultText),
        hasCodeBlocks: /```/.test(resultText),
        hasDividers: /^---$/gm.test(resultText)
      });
      
      // 結果の検証
      if (!resultText || resultText.length < 50) {
        throw new Error('Gemini APIからの応答が短すぎるか、空です。');
      }
      
      // Notion視覚化要素が含まれていない場合の警告
      if (!resultText.includes('#') && !resultText.includes('**') && !resultText.includes('|')) {
        console.warn(`[GeminiService] ⚠️ Notion視覚化要素が検出されませんでした。プレーンテキストの可能性があります。`);
      }
      
      // 表形式データの品質チェック
      const tableMatches = resultText.match(/\|.*\|.*\|/gm);
      if (tableMatches) {
        console.log(`[GeminiService] ✅ 表形式データ検出: ${tableMatches.length}個の表`);
      }
      
      return resultText;

    } catch (error: any) {
      console.error('[GeminiService] 調査実行エラー:', error);
      
      if (error?.message?.includes('RATE_LIMIT_EXCEEDED')) {
        console.warn('[GeminiService] API制限エラー、1秒待機後リトライ');
        await this.sleep(1000);
        
        // 短縮版プロンプトでリトライ
        const fallbackPrompt = `${prompt}\n\n${this.formatServiceHypothesis(serviceHypothesis)}\n\n**Notion向けMarkdown形式で構造化して出力してください。見出し（##）、太字（**）、表（|）、リスト（-）、Callout（>）を活用してください。**`;
        
        try {
          const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
          const retryResult = await model.generateContent(fallbackPrompt);
          const retryResponse = await retryResult.response;
          return retryResponse.text();
        } catch (retryError) {
          console.error('[GeminiService] リトライも失敗:', retryError);
          throw new Error(`Gemini API調査エラー (リトライ後): ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
        }
      }
      
      throw new Error(`Gemini API調査エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * レート制限を強制実行
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      console.log(`[GeminiService] レート制限待機: ${waitTime}ms`);
      await this.sleep(waitTime);
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * API制限エラーかどうかを判定
   * @param error エラーオブジェクト
   * @returns API制限エラーの場合true
   */
  private isRateLimitError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('rate limit') || 
           message.includes('quota') || 
           message.includes('429') ||
           message.includes('too many requests');
  }

  /**
   * エクスポネンシャルバックオフによる待機時間計算
   * @param attempt 試行回数
   * @returns 待機時間（ミリ秒）
   */
  private calculateBackoffTime(attempt: number): number {
    const baseDelay = 5000; // 5秒
    const jitter = Math.random() * 1000; // ランダムジッター
    return Math.min(baseDelay * Math.pow(2, attempt - 1) + jitter, 30000); // 最大30秒
  }

  /**
   * 複数の調査を順次実行（レート制限対応強化）
   * @param prompts 調査プロンプト配列
   * @param serviceHypothesis サービス仮説
   * @param onProgress 進行状況コールバック
   * @returns 調査結果配列
   */
  async conductMultipleResearch(
    prompts: Array<{ id: number; title: string; prompt: string }>,
    serviceHypothesis: ServiceHypothesis,
    onProgress?: (step: number, total: number, title: string) => void
  ): Promise<Array<{ id: number; title: string; result: string }>> {
    const results: Array<{ id: number; title: string; result: string }> = [];
    const interval = Math.max(
      parseInt(process.env.RESEARCH_INTERVAL || '2000'), 
      this.minRequestInterval
    ); // 最低でもminRequestInterval以上

    for (let i = 0; i < prompts.length; i++) {
      const { id, title, prompt } = prompts[i];
      
      try {
        // 進行状況を通知
        if (onProgress) {
          onProgress(i + 1, prompts.length, title);
        }

        // 調査実行（リトライ機能付き）
        const result = await this.conductResearch(prompt, serviceHypothesis);
        results.push({ id, title, result });

        // レート制限対応（最後以外は待機）
        if (i < prompts.length - 1) {
          await this.sleep(interval);
        }

      } catch (error) {
        console.error(`[GeminiService] 調査${id}(${title})でエラー:`, error);
        
        // エラーの場合でも結果に含める（フォールバック）
        results.push({
          id,
          title,
          result: `調査でエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}\n\n代替として基本的な市場調査フレームワークを適用することをお勧めします。`
        });
        
        // エラー後も待機
        if (i < prompts.length - 1) {
          await this.sleep(interval);
        }
      }
    }

    return results;
  }

  /**
   * サービス仮説を整形された文字列に変換
   * @param hypothesis サービス仮説オブジェクト
   * @returns 整形されたテキスト
   */
  private formatServiceHypothesis(hypothesis: ServiceHypothesis): string {
    return `
コンセプト: ${hypothesis.concept}

解決したい顧客課題: ${hypothesis.customerProblem}

狙っている業種・業界: ${hypothesis.targetIndustry}

想定される利用者層: ${hypothesis.targetUsers}

直接競合・間接競合: ${hypothesis.competitors}

課金モデル: ${hypothesis.revenueModel || '未設定'}

価格帯・価格設定の方向性: ${hypothesis.pricingDirection || '未設定'}

暫定UVP: ${hypothesis.uvp || '未設定'}

初期KPI: ${hypothesis.initialKpi || '未設定'}

獲得チャネル仮説: ${hypothesis.acquisitionChannels || '未設定'}

規制・技術前提: ${hypothesis.regulatoryTechPrereqs || '未設定'}

想定コスト構造: ${hypothesis.costStructure || '未設定'}
    `.trim();
  }

  /**
   * 指定時間待機
   * @param ms 待機時間（ミリ秒）
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * API接続テスト（リトライ機能付き）
   * @returns 接続成功かどうか
   */
  async testConnection(): Promise<boolean> {
    try {
      // APIキーの形式チェック
      if (!this.config.apiKey || this.config.apiKey === 'dummy-key') {
        console.error('[GeminiService] APIキーが設定されていません:', this.config.apiKey);
        return false;
      }

      if (!this.config.apiKey.startsWith('AIza')) {
        console.error('[GeminiService] Gemini APIキーの形式が正しくありません:', this.config.apiKey.substring(0, 8) + '...');
        return false;
      }

      console.log('[GeminiService] API接続テスト開始, APIキー:', this.config.apiKey.substring(0, 8) + '...');
      
      const testPrompt = "こんにちは。これは接続テストです。「接続成功」と回答してください。";
      const result = await this.model.generateContent(testPrompt);
      const response = await result.response;
      const text = response.text();
      
      console.log('[GeminiService] 接続テスト成功, レスポンス:', text.substring(0, 100) + '...');
      return text.length > 0;
      
    } catch (error) {
      console.error('[GeminiService] 接続テストエラー詳細:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        apiKey: this.config.apiKey ? this.config.apiKey.substring(0, 8) + '...' : 'なし'
      });
      return false;
    }
  }

  /**
   * 統合レポートを生成（Notion視覚化強化版）
   * @param results 個別調査結果
   * @param serviceHypothesis サービス仮説
   * @returns 統合レポート
   */
  async generateIntegratedReport(
    results: Array<{ id: number; title: string; result: string }>,
    serviceHypothesis: ServiceHypothesis
  ): Promise<string> {
    try {
      console.log('[GeminiService] 統合レポート生成開始');
      console.log(`[GeminiService] 統合対象調査数: ${results.length}件`);
      
      // 調査結果の有効性をチェック
      const validResults = results.filter(r => r.result && r.result.trim().length > 50);
      console.log(`[GeminiService] 有効な調査結果: ${validResults.length}/${results.length}件`);
      
      if (validResults.length === 0) {
        throw new Error('有効な調査結果が見つかりません。個別調査が正常に完了していない可能性があります。');
      }
      
      // 各調査結果のサマリーを作成（統合レポート内で参照用）
      const detailedSummaries = validResults.map((r, index) => {
        const summary = r.result.length > 800 ? r.result.substring(0, 800) + '...' : r.result;
        return `### ${r.title}
**調査ID**: ${r.id}
**要約**: ${summary}

---`;
      }).join('\n\n');
      
      console.log(`[GeminiService] 統合プロンプト長: ${detailedSummaries.length}文字`);
      
      // 🎨 統合レポート用Notion装飾制限指示
      const integratedNotionVisualPrompt = `
**🎨 統合レポート装飾指示 - 色制限版：**

**📋 厳守する色制限：**
- **テキスト色：** 通常（デフォルト）または赤色のみ
- **背景色：** 黄色のみ使用可能
- **装飾：** 太字、斜体、見出し、表、箇条書きは自由

**💼 統合レポート必須要素：**
1. **📊 エグゼクティブサマリー表** - 主要KPIと結論
2. **📈 市場機会マトリックス表** - 規模×成長性×参入難易度
3. **⚔️ 競合ポジショニング表** - 全競合の強み・弱み比較
4. **📋 リスク評価表** - 高・中・低リスクの分類
5. **🎯 アクションプラン表** - 短期・中期・長期の具体的ステップ
6. **💰 投資・収益予測表** - 3年間の数値予測

**🎨 統合レポート装飾ルール：**
- **💡 戦略的示唆はCallout（>）** で黄色背景強調
- **⚠️ クリティカルなリスクは赤色テキスト**
- **📊 数値データは必ず表形式**
- **🔗 セクション見出しは階層構造**
- **📝 要点は箇条書きで整理**

> **💡 統合レポートのゴール：** 経営陣が15分で意思決定できる情報提供

> **⚠️ 重要：** 全ての推奨事項は数値根拠を明示`;

      const integratedPrompt = `以下の16種類の市場調査結果を統合し、包括的な戦略レポートを作成してください。

調査結果：
${detailedSummaries}

## 🎯 統合分析の要求事項（Notion視覚化強化版）

🎨 **出力形式指示（必須）**:
- **Notionで見映えする形式で出力**
- 見出しには絵文字を効果的に使用
- データは必ず表形式で整理
- 重要な情報はCallout形式（> 💡 ポイント：〜）
- 区切り線（---）でセクションを明確に分離

### 1. **## 🎯 エグゼクティブサマリー**
- **📋 主要発見事項**（3-5点、太字で強調）

| 発見事項 | 重要度 | 事業への影響 |
|----------|--------|-------------|
| 発見1 | 高 | 具体的影響 |
| 発見2 | 中 | 具体的影響 |

- **📊 事業機会評価**

| 評価項目 | スコア | 根拠 |
|----------|--------|------|
| 市場規模 | High/Medium/Low | 具体的数値 |
| 競合優位性 | High/Medium/Low | 差別化ポイント |
| 実行難易度 | High/Medium/Low | 課題と対策 |

- **⚡ 推奨アクション**（優先順位付き）

---

### 2. **## 📈 市場機会の総合分析**

| 項目 | 現状 | 将来予測 | 根拠・出典 |
|------|------|----------|-----------|
| 市場規模 | XX億円 | XX億円 | 調査データ |
| 成長率 | XX% | XX% | 業界レポート |
| 顧客数 | XX万人 | XX万人 | 統計データ |

> 💡 **重要な機会**: [市場機会の要約]

> ⚠️ **注意すべきリスク**: [市場リスクの要約]

---

### 3. **## 🏢 競合環境の戦略的評価**

**競合他社比較表**:

| 競合企業 | 市場シェア | 強み | 弱み | 対抗戦略 |
|----------|------------|------|------|----------|
| 企業A | XX% | 強み1,2 | 弱み1,2 | 戦略1 |
| 企業B | XX% | 強み1,2 | 弱み1,2 | 戦略2 |

**差別化戦略**:
1. **技術的差別化**: [具体的内容]
2. **価格戦略**: [具体的内容]
3. **サービス差別化**: [具体的内容]

---

### 4. **## 👥 顧客インサイトの統合**

**ターゲット顧客セグメント**:

| セグメント | 規模 | 特徴 | ニーズ | アプローチ方法 |
|------------|------|------|--------|----------------|
| セグメント1 | XX万人 | 特徴1,2 | ニーズ1,2 | 方法1 |
| セグメント2 | XX万人 | 特徴1,2 | ニーズ1,2 | 方法2 |

**購買行動分析**:
1. **認知段階**: [行動特性]
2. **検討段階**: [意思決定要因]
3. **購入段階**: [最終決定要因]

---

### 5. **## ⚠️ 事業リスクの総合評価**

| リスク分類 | リスクレベル | 具体的リスク | 対策案 | 優先度 |
|------------|--------------|--------------|--------|--------|
| 市場リスク | High/Med/Low | リスク内容 | 対策内容 | 高/中/低 |
| 競合リスク | High/Med/Low | リスク内容 | 対策内容 | 高/中/低 |
| 技術リスク | High/Med/Low | リスク内容 | 対策内容 | 高/中/低 |

> ⚠️ **最重要リスク**: [最も注意すべきリスク]

---

### 6. **## 🚀 戦略的提言（実行可能アクションプラン）**

**短期戦略（3ヶ月）**:
1. **アクション1**: [具体的内容と期待効果]
2. **アクション2**: [具体的内容と期待効果]

**中期戦略（6-12ヶ月）**:
1. **戦略1**: [具体的内容と目標数値]
2. **戦略2**: [具体的内容と目標数値]

**長期ビジョン（1-3年）**:
1. **ビジョン1**: [具体的目標と達成指標]
2. **ビジョン2**: [具体的目標と達成指標]

**必要リソースと予算概算**:

| 期間 | 人的リソース | 予算概算 | 期待ROI |
|------|--------------|----------|---------|
| 短期 | XX名 | XX万円 | XX% |
| 中期 | XX名 | XX万円 | XX% |
| 長期 | XX名 | XX万円 | XX% |

---

### 7. **## 📊 KPI設計と測定体制**

**KPIダッシュボード設計**:

| KPI分類 | 指標名 | 目標値 | 測定頻度 | 責任者 |
|---------|--------|--------|----------|--------|
| 事業成果 | 売上高 | XX億円 | 月次 | 営業部 |
| 顧客指標 | 獲得数 | XX名 | 週次 | マーケ部 |
| 効率指標 | CAC | XX円 | 月次 | 営業部 |

**測定・改善サイクル**:
1. **データ収集**: [方法と頻度]
2. **分析・評価**: [分析手法]
3. **改善実行**: [改善プロセス]

---

### 8. **## 🔗 個別調査レポートへのリンク**

**調査項目一覧**:
${validResults.map((r, index) => `${index + 1}. **${r.title}** (ID: ${r.id})`).join('\n')}

> 📝 **補足**: 各個別調査の詳細は、上記の調査項目から参照できます。

---

### 9. **## 📚 参考情報・エビデンス**

**主要な参考情報源**:
- 業界レポート・統計データ
- 競合企業の公開情報
- 顧客インタビュー結果
- 専門家ヒアリング

**追加調査推奨項目**:
1. **深掘り調査項目1**: [理由と期待効果]
2. **深掘り調査項目2**: [理由と期待効果]

---

## 💼 事業仮説情報
${this.formatServiceHypothesis(serviceHypothesis)}

## 📋 重要な注意事項

> 💡 **成功のポイント**: この統合レポートは16種類の専門調査に基づく包括的分析です。各個別調査の詳細を併せて参照することで、より深い洞察が得られます。

> ⚠️ **実行時の注意**: 市場環境は常に変化するため、定期的な見直しと更新が必要です。

**レポート生成日**: ${new Date().toLocaleDateString('ja-JP')}  
**分析対象**: ${validResults.length}種類の市場調査  
**事業名**: ${serviceHypothesis.concept || '設定なし'}

上記の要件に基づいて、Notionで視覚的にインパクトがあり、実用的で具体的な統合レポートを作成してください。各個別調査の内容を最大限活用し、戦略的な意思決定に直接役立つ内容にしてください。

${integratedNotionVisualPrompt}
      `;

      console.log('[GeminiService] Gemini APIで統合レポート生成開始...');
      const result = await this.conductResearch(integratedPrompt, serviceHypothesis);
      
      // 結果の検証
      if (!result || result.trim().length < 200) {
        console.warn(`[GeminiService] 統合レポートが短すぎます: ${result?.length || 0}文字`);
        throw new Error('統合レポートの生成結果が不十分です');
      }
      
      console.log(`[GeminiService] 統合レポート生成完了: ${result.length}文字`);
      console.log(`[GeminiService] 統合レポート内容プレビュー: ${result.substring(0, 200)}...`);
      
      return result;

    } catch (error) {
      console.error('[GeminiService] 統合レポート生成エラー:', error);
      
      // フォールバック: 基本的な統合レポートを生成
      const fallbackReport = this.generateFallbackIntegratedReport(results, serviceHypothesis);
      console.log('[GeminiService] フォールバック統合レポートを生成しました');
      
      return fallbackReport;
    }
  }

  /**
   * フォールバック統合レポートを生成
   * @param results 個別調査結果
   * @param serviceHypothesis サービス仮説
   * @returns 基本的な統合レポート
   */
  private generateFallbackIntegratedReport(
    results: Array<{ id: number; title: string; result: string }>,
    serviceHypothesis: ServiceHypothesis
  ): string {
    console.log('[GeminiService] フォールバック統合レポート生成中...');
    
    // 調査結果のカテゴリ分類
    const marketResults = results.filter(r => r.title.includes('市場') || r.title.includes('PESTEL'));
    const competitorResults = results.filter(r => r.title.includes('競合'));
    const customerResults = results.filter(r => r.title.includes('顧客') || r.title.includes('セグメント'));
    const strategyResults = results.filter(r => 
      r.title.includes('戦略') || r.title.includes('マーケティング') || r.title.includes('ブランド')
    );
    const riskResults = results.filter(r => 
      r.title.includes('リスク') || r.title.includes('法務') || r.title.includes('コンプライアンス')
    );
    const otherResults = results.filter(r => 
      !marketResults.includes(r) && !competitorResults.includes(r) && 
      !customerResults.includes(r) && !strategyResults.includes(r) && !riskResults.includes(r)
    );
    
    const fallbackReport = `# 🎯 市場調査統合レポート

## 📊 エグゼクティブサマリー

この統合レポートは、${results.length}件の個別市場調査結果を分析し、事業成功に向けた戦略的提言をまとめたものです。

### 🔍 調査対象事業
- **事業名**: ${serviceHypothesis.concept || '未設定'}
- **対象業界**: ${serviceHypothesis.targetIndustry || '未設定'}
- **ターゲット**: ${serviceHypothesis.targetUsers || '未設定'}

---

## 📈 市場環境分析
${marketResults.length > 0 ? `
### 主要発見事項
${marketResults.map(r => `- **${r.title}**: ${r.result.substring(0, 200)}...`).join('\n')}
` : '市場環境に関する詳細データは個別調査レポートをご確認ください。'}

---

## 🏢 競合環境評価
${competitorResults.length > 0 ? `
### 競合分析サマリー
${competitorResults.map(r => `- **${r.title}**: ${r.result.substring(0, 200)}...`).join('\n')}
` : '競合環境に関する詳細データは個別調査レポートをご確認ください。'}

---

## 👥 顧客インサイト
${customerResults.length > 0 ? `
### 顧客分析の要点
${customerResults.map(r => `- **${r.title}**: ${r.result.substring(0, 200)}...`).join('\n')}
` : '顧客インサイトに関する詳細データは個別調査レポートをご確認ください。'}

---

## 🚀 戦略的提言
${strategyResults.length > 0 ? `
### 戦略・マーケティング分析
${strategyResults.map(r => `- **${r.title}**: ${r.result.substring(0, 200)}...`).join('\n')}
` : '戦略・マーケティングに関する詳細データは個別調査レポートをご確認ください。'}

---

## ⚠️ リスク評価
${riskResults.length > 0 ? `
### リスク・コンプライアンス分析
${riskResults.map(r => `- **${r.title}**: ${r.result.substring(0, 200)}...`).join('\n')}
` : 'リスク評価に関する詳細データは個別調査レポートをご確認ください。'}

---

## 📊 その他の調査項目
${otherResults.length > 0 ? `
### 追加調査結果
${otherResults.map(r => `- **${r.title}**: ${r.result.substring(0, 150)}...`).join('\n')}
` : ''}

---

## 🔗 個別調査レポート一覧

以下の個別調査レポートで詳細な分析結果を確認できます：

${results.map((r, index) => `${index + 1}. **${r.title}** (調査ID: ${r.id})`).join('\n')}

---

## 📝 次のステップ

### 🎯 即座に実施すべきアクション
1. **詳細な個別調査結果の確認**: 各調査レポートの詳細内容を精査
2. **優先順位の設定**: 事業への影響度に基づく施策の優先順位決定
3. **詳細な実行計画策定**: 具体的なタイムライン・リソース計画の作成

### 📅 推奨タイムライン
- **短期 (1-3ヶ月)**: 個別調査結果の詳細分析と戦略の詳細化
- **中期 (3-6ヶ月)**: 優先施策の実行開始
- **長期 (6-12ヶ月)**: 成果測定と戦略の見直し

---

## ⚡ 注意事項

この統合レポートは基本的なサマリーです。より詳細な分析と戦略的提言については、各個別調査レポートを必ずご確認ください。

**生成日時**: ${new Date().toLocaleString('ja-JP')}
**調査対象**: ${results.length}件の個別市場調査
`;

    return fallbackReport;
  }

  /**
   * Geminiからの応答をクリーンアップ
   * @param response Geminiからの応答テキスト
   * @returns クリーンアップされたテキスト
   */
  private _cleanupResponse(response: string): string {
    // ```json と ``` を削除
    let cleaned = response.replace(/^```json\s*|```$/g, '');
    
    // エスケープされた改行や引用符を修正
    cleaned = cleaned.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    
    // JSONオブジェクトまたは配列の開始と終了を探す
    const firstBracket = cleaned.indexOf('[');
    const firstBrace = cleaned.indexOf('{');
    let start = -1;

    if (firstBracket > -1 && firstBrace > -1) {
      start = Math.min(firstBracket, firstBrace);
    } else if (firstBracket > -1) {
      start = firstBracket;
    } else {
      start = firstBrace;
    }

    const lastBracket = cleaned.lastIndexOf(']');
    const lastBrace = cleaned.lastIndexOf('}');
    let end = Math.max(lastBracket, lastBrace);

    if (start > -1 && end > -1 && end > start) {
      cleaned = cleaned.substring(start, end + 1);
    }

    return cleaned.trim();
  }
} 