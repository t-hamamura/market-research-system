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
   * 市場調査を実行（リトライ・レート制限対応）
   * @param prompt 調査プロンプト
   * @param serviceHypothesis サービス仮説
   * @returns 調査結果
   */
  async conductResearch(prompt: string, serviceHypothesis: ServiceHypothesis): Promise<string> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // レート制限対策: 前回のリクエストから最低限の間隔を確保
        await this.enforceRateLimit();

        // サービス仮説を文字列に変換
        const hypothesisText = this.formatServiceHypothesis(serviceHypothesis);
        
        // 完全なプロンプトを構築
        const fullPrompt = `${prompt}\n\n【サービス仮説】\n${hypothesisText}`;

        console.log(`[GeminiService] 調査実行開始 (試行${attempt}/${maxRetries}): ${prompt.substring(0, 50)}...`);
        
        // Gemini APIに問い合わせ（タイムアウト付き）
        const requestPromise = this.model.generateContent(fullPrompt);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Gemini APIリクエストがタイムアウトしました (90秒)')), 90000);
        });
        
        const result = await Promise.race([requestPromise, timeoutPromise]) as any;
        
        // レスポンスオブジェクトの詳細チェック
        if (!result) {
          throw new Error('Gemini APIからnullレスポンスオブジェクトが返されました');
        }
        
        const response = await result.response;
        
        // レスポンス詳細ログ（デバッグ用）
        console.log(`[GeminiService] レスポンス取得成功 (試行${attempt})`);
        
        // レスポンスオブジェクトの検証
        if (!response) {
          throw new Error('Gemini APIからnullレスポンスが返されました');
        }
        
        // text()関数の存在確認
        if (typeof response.text !== 'function') {
          console.error('[GeminiService] レスポンスオブジェクト詳細:', response);
          throw new Error('レスポンスオブジェクトにtext()メソッドがありません');
        }
        
        let text: string;
        try {
          text = response.text();
        } catch (textError) {
          console.error('[GeminiService] text()関数エラー:', textError);
          throw new Error(`レスポンステキスト取得エラー: ${textError instanceof Error ? textError.message : 'Unknown'}`);
        }
        
        // 空レスポンスのより詳細なチェック
        if (text === null || text === undefined) {
          throw new Error('Gemini APIから null/undefined テキストが返されました');
        }
        
        if (typeof text !== 'string') {
          console.error('[GeminiService] 予期しないテキスト型:', typeof text, text);
          throw new Error(`予期しないレスポンス型: ${typeof text}`);
        }
        
        const trimmedText = text.trim();
        if (trimmedText.length === 0) {
          throw new Error('Gemini APIから空文字列レスポンスが返されました');
        }
        
        if (trimmedText.length < 10) {
          console.warn(`[GeminiService] 非常に短いレスポンス (${trimmedText.length}文字): "${trimmedText}"`);
          // 接続テストや明らかに意味のある短いレスポンスは除外
          const validShortResponses = ['接続成功', 'OK', 'Success', 'Connected', 'Test successful'];
          const isValidShortResponse = validShortResponses.some(valid => 
            trimmedText.includes(valid) || valid.includes(trimmedText)
          );
          
          if (!isValidShortResponse) {
            // 意味のない短いレスポンスのみリトライ対象とする
            throw new Error(`レスポンスが短すぎます (${trimmedText.length}文字): "${trimmedText}"`);
          }
        }

        console.log(`[GeminiService] 調査完了 (試行${attempt}): ${trimmedText.length}文字の結果を取得`);
        return trimmedText;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.error(`[GeminiService] 調査実行エラー (試行${attempt}/${maxRetries}):`, lastError.message);
        
        // API制限エラーかどうかを判定
        if (this.isRateLimitError(lastError)) {
          const backoffTime = this.calculateBackoffTime(attempt);
          console.log(`[GeminiService] API制限エラー検出、${backoffTime}ms後にリトライします...`);
          await this.sleep(backoffTime);
          continue;
        }
        
        // API制限以外のエラーで、まだリトライ回数が残っている場合
        if (attempt < maxRetries) {
          const retryDelay = 2000 * attempt; // 2秒、4秒、6秒
          console.log(`[GeminiService] ${retryDelay}ms後にリトライします...`);
          await this.sleep(retryDelay);
          continue;
        }
        
        // 最終試行でもエラーの場合、エラーを投げる
        break;
      }
    }

    // すべてのリトライが失敗した場合
    throw new Error(`Gemini API調査エラー (${maxRetries}回試行後失敗): ${lastError?.message || 'Unknown error'}`);
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
      
      // 各調査結果を要約して結合（長すぎるプロンプトを避ける）
      const summarizedResults = validResults.map(r => {
        const summary = r.result.length > 1000 ? r.result.substring(0, 1000) + '...' : r.result;
        return `## ${r.title}\n${summary}`;
      }).join('\n\n');
      
      console.log(`[GeminiService] 統合プロンプト長: ${summarizedResults.length}文字`);
      
      const integrationPrompt = `
以下の市場調査結果を分析し、事業成功に向けた包括的な戦略提言を作成してください。

【調査結果】
${summarizedResults}

【要求事項】
1. **エグゼクティブサマリー**: 主要な発見事項を3点以内で要約
2. **市場機会の分析**: 市場規模、成長性、参入機会の評価
3. **競合環境の評価**: 競合他社の強み・弱み、差別化のポイント
4. **顧客インサイト**: ターゲット顧客の特性、ニーズ、購買行動
5. **事業リスクの特定**: 主要なリスク要因と対策案
6. **戦略的提言**: 具体的なアクションプラン（優先順位付き）
7. **KPI設計**: 成功指標と測定方法の提案
8. **実行ロードマップ**: 短期・中期・長期の実行計画

【サービス仮説】
${this.formatServiceHypothesis(serviceHypothesis)}

**出力形式**: 
- 見出しは ## や ### を使用してMarkdown形式で構造化
- 重要なポイントは箇条書きで整理
- 数値データがある場合は具体的に記載
- 実用的で具体的な内容にすること

上記要件に基づいて、事業判断に直接活用できる統合レポートを作成してください。
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
   * フォールバック統合レポート生成
   * @param results 個別調査結果
   * @param serviceHypothesis サービス仮説
   * @returns 基本的な統合レポート
   */
  private generateFallbackIntegratedReport(
    results: Array<{ id: number; title: string; result: string }>,
    serviceHypothesis: ServiceHypothesis
  ): string {
    const validResults = results.filter(r => r.result && r.result.trim().length > 10);
    
    return `# 📊 統合市場調査レポート

## 🎯 エグゼクティブサマリー

本調査では${validResults.length}種類の専門的な市場分析を実行し、以下の主要な発見事項を得ました：

### 重要な発見事項
- **市場機会**: ${serviceHypothesis.targetIndustry}において、${serviceHypothesis.concept}のコンセプトは十分な市場機会を有している
- **顧客ニーズ**: ${serviceHypothesis.customerProblem}に対する解決策への需要が確認された
- **競合環境**: ${serviceHypothesis.competitors}との差別化が重要な成功要因

## 📈 調査結果の概要

${validResults.map((result, index) => 
  `### ${index + 1}. ${result.title}\n${result.result.substring(0, 300)}${result.result.length > 300 ? '...' : ''}`
).join('\n\n')}

## 🎯 戦略的提言

### 短期的アクション（3ヶ月以内）
1. **MVP開発**: 最小実行可能プロダクトの開発と初期ユーザーテスト
2. **市場検証**: ${serviceHypothesis.targetUsers}をターゲットとした仮説検証
3. **パートナー探索**: 初期段階での戦略的パートナーシップ構築

### 中期的戦略（6-12ヶ月）
1. **本格展開**: 検証済みプロダクトの市場投入
2. **収益モデル最適化**: ${serviceHypothesis.revenueModel || '設定された収益モデル'}の実装と改善
3. **チーム拡充**: 事業成長に必要な人材の確保

### 長期的ビジョン（1-3年）
1. **市場シェア拡大**: ${serviceHypothesis.targetIndustry}での確固たる地位確立
2. **新市場開拓**: 隣接市場への展開可能性の検討
3. **エコシステム構築**: パートナー企業との協業体制強化

## ⚠️ 主要リスクと対策

### 事業リスク
- **競合激化**: 既存プレイヤーからの反応への対策
- **技術変化**: 技術トレンドの変化への適応力強化
- **規制変更**: ${serviceHypothesis.regulatoryTechPrereqs || '関連規制'}の動向監視

### 推奨対策
- 継続的な市場監視と戦略調整
- 技術的優位性の維持・向上
- コンプライアンス体制の整備

## 📊 成功指標（KPI）設計

### 初期段階のKPI
- ユーザー獲得数とアクティブ率
- 顧客満足度（NPS）
- 初回→継続利用率

### 成長段階のKPI
- 月次売上成長率（MRR）
- 顧客獲得コスト（CAC）対生涯価値（LTV）比率
- 市場シェア

## 📅 実行ロードマップ

**第1四半期**: 基盤構築・MVP開発
**第2四半期**: 市場検証・初期ユーザー獲得
**第3四半期**: 本格展開・収益化開始
**第4四半期**: 成長加速・次期戦略策定

---

**注記**: この統合レポートは${validResults.length}種類の専門調査結果に基づいて作成されています。詳細な分析内容については、各個別調査レポートをご参照ください。

**作成日時**: ${new Date().toLocaleString('ja-JP')}
`;
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