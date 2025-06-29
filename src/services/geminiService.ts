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
        const response = await result.response;
        
        // レスポンス詳細ログ（デバッグ用）
        console.log(`[GeminiService] レスポンス取得成功 (試行${attempt})`);
        
        const text = response.text();
        
        // 空レスポンスのより詳細なチェック
        if (!text) {
          throw new Error('Gemini APIから null レスポンスが返されました');
        }
        
        const trimmedText = text.trim();
        if (trimmedText.length === 0) {
          throw new Error('Gemini APIから空文字列レスポンスが返されました');
        }
        
        if (trimmedText.length < 10) {
          console.warn(`[GeminiService] 非常に短いレスポンス (${trimmedText.length}文字): "${trimmedText}"`);
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
      const testPrompt = "こんにちは。これは接続テストです。「接続成功」と回答してください。";
      const result = await this.model.generateContent(testPrompt);
      const response = await result.response;
      const text = response.text();
      
      console.log('[GeminiService] 接続テスト結果:', text);
      return text.length > 0;
      
    } catch (error) {
      console.error('[GeminiService] 接続テストエラー:', error);
      return false;
    }
  }

  /**
   * 統合レポートを生成（リトライ機能付き）
   * @param results 個別調査結果
   * @param serviceHypothesis サービス仮説
   * @returns 統合レポート
   */
  async generateIntegratedReport(
    results: Array<{ id: number; title: string; result: string }>,
    serviceHypothesis: ServiceHypothesis
  ): Promise<string> {
    try {
      const resultsText = results.map(r => `## ${r.title}\n${r.result}`).join('\n\n');
      
      const integrationPrompt = `
以下の16種類の市場調査結果を統合し、事業成功に向けた包括的な戦略提言を作成してください。

【調査結果】
${resultsText}

【要求事項】
1. 全調査結果を横断的に分析
2. 重要な発見事項とインサイトの抽出
3. 事業リスクと機会の明確化
4. 具体的なアクションプランの提示
5. 優先順位付けと実行スケジュール案

【サービス仮説】
${this.formatServiceHypothesis(serviceHypothesis)}

上記を踏まえ、事業成功に向けた統合レポートを作成してください。
      `;

      const result = await this.conductResearch(integrationPrompt, serviceHypothesis);
      console.log('[GeminiService] 統合レポート生成完了');
      
      return result;

    } catch (error) {
      console.error('[GeminiService] 統合レポート生成エラー:', error);
      throw new Error(`統合レポート生成エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
} 