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
   * 市場調査を実行（Markdown出力強化版）
   * @param prompt 調査プロンプト
   * @param serviceHypothesis サービス仮説
   * @returns 調査結果
   */
  async conductResearch(prompt: string, serviceHypothesis: ServiceHypothesis): Promise<string> {
    try {
      // サービス仮説情報をフォーマット
      const hypothesisContext = this.formatServiceHypothesis(serviceHypothesis);
      
      // Markdown出力を強制するための拡張プロンプト
      const enhancedPrompt = `
${prompt}

【サービス仮説情報】
${hypothesisContext}

🎯 **出力形式の指示（重要）**:
- **必ずMarkdown形式で出力してください**
- 見出しは ## や ### を使用（例：## 市場概要、### 主要プレイヤー）
- 重要なポイントは **太字** で強調
- リストは - または 1. を使用して箇条書き
- 表形式のデータは | で区切った表として作成
- 引用は > を使用
- コードやデータは \`\`\` で囲む
- URLがある場合は [タイトル](URL) 形式でリンク化
- 区切り線は --- を使用

🔍 **必須要素**:
1. **エグゼクティブサマリー**: 主要発見事項を3-5点で要約
2. **詳細分析**: 構造化された分析内容
3. **データと根拠**: 具体的な数値やソース情報
4. **アクションアイテム**: 次のステップの提案
5. **参考情報**: 関連するURLや資料（可能な場合）

📊 **視覚化の工夫**:
- 比較データは表形式で整理
- プロセスや手順は番号付きリスト
- 要点は箇条書きで明確化
- 重要な警告や注意点は > 引用形式

上記の形式に従って、読みやすく構造化されたMarkdown形式で調査結果を出力してください。
      `;

      console.log(`[GeminiService] Markdown強化プロンプト送信 (${enhancedPrompt.length}文字)`);
      
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      const result = await model.generateContent(enhancedPrompt);
      const response = await result.response;
      const resultText = response.text();
      
      console.log(`[GeminiService] Gemini APIレスポンス受信: ${resultText.length}文字`);
      console.log(`[GeminiService] Markdown要素確認:`, {
        hasHeadings: /^#{1,6}\s/.test(resultText),
        hasBold: /\*\*[^*]+\*\*/.test(resultText),
        hasLists: /^[\-\*]\s/.test(resultText),
        hasTables: /\|/.test(resultText),
        hasCodeBlocks: /```/.test(resultText)
      });
      
      // 結果の検証
      if (!resultText || resultText.length < 50) {
        throw new Error('Gemini APIからの応答が短すぎるか、空です。');
      }
      
      // Markdown形式が含まれていない場合の警告
      if (!resultText.includes('#') && !resultText.includes('**') && !resultText.includes('-')) {
        console.warn(`[GeminiService] ⚠️ Markdown要素が検出されませんでした。プレーンテキストの可能性があります。`);
      }
      
      return resultText;

    } catch (error: any) {
      console.error('[GeminiService] 調査実行エラー:', error);
      
      if (error?.message?.includes('RATE_LIMIT_EXCEEDED')) {
        console.warn('[GeminiService] API制限エラー、1秒待機後リトライ');
        await this.sleep(1000);
        
                 // 短縮版プロンプトでリトライ
         const fallbackPrompt = `${prompt}\n\n${this.formatServiceHypothesis(serviceHypothesis)}\n\n**Markdown形式で構造化して出力してください。見出し、太字、リストを活用してください。**`;
        
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
   * 統合レポートを生成（リトライ機能付き・強化版）
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
      
      const integrationPrompt = `
以下の16種類の市場調査結果を分析し、事業成功に向けた包括的な戦略提言を作成してください。

## 📊 個別調査結果の詳細
${detailedSummaries}

## 🎯 統合分析の要求事項

### 1. **🔍 エグゼクティブサマリー**
- 主要な発見事項を3-5点で要約
- 事業機会の評価（High/Medium/Low）
- 推奨される次のアクション

### 2. **📈 市場機会の総合分析**
- 市場規模と成長性の統合評価
- PESTEL分析からの環境要因まとめ
- 参入タイミングの推奨

### 3. **🏢 競合環境の戦略的評価**
- 競合他社の強み・弱み比較表
- 差別化のポイントと競争優位性
- 市場ポジショニング戦略

### 4. **👥 顧客インサイトの統合**
- ターゲット顧客の特性・ニーズまとめ
- 購買行動と意思決定プロセス
- 感情的ニーズと機能的ニーズの整理

### 5. **⚠️ 事業リスクの総合評価**
- 高・中・低リスクの分類と対策
- シナリオ分析の結果統合
- 法務・コンプライアンスの注意点

### 6. **🚀 戦略的提言（具体的アクションプラン）**
- 短期（3ヶ月）・中期（6-12ヶ月）・長期（1-3年）の戦略
- 優先順位付きアクションアイテム
- 必要なリソースと予算概算

### 7. **📊 KPI設計と測定体制**
- 成功指標の統合設計
- 測定方法と頻度
- ダッシュボード構成案

### 8. **🔗 個別調査レポートへのリンク**
- 各調査の詳細確認用リンク案内
- 補足情報の参照方法

### 9. **📚 参考情報・エビデンス**
- 調査で参考にした情報源
- 追加調査推奨項目
- 業界レポートやデータソース

## 💼 事業仮説情報
${this.formatServiceHypothesis(serviceHypothesis)}

## 📋 出力形式の指示
- **必ずMarkdown形式で構造化**
- 見出し（##, ###）で階層化
- 重要なポイントは **太字** で強調
- 箇条書き（-）や番号付きリスト（1.）を活用
- 表形式データは | で区切り
- 区切り線（---）で セクション分離
- 具体的な数値やデータを含める

上記要件に基づいて、実用的で具体的な統合レポートを作成してください。各個別調査の内容を活用し、戦略的な意思決定に直接役立つ内容にしてください。
      `;

      console.log('[GeminiService] Gemini APIで統合レポート生成開始...');
      const result = await this.conductResearch(integrationPrompt, serviceHypothesis);
      
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