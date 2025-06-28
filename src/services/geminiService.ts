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
   * 市場調査を実行
   * @param prompt 調査プロンプト
   * @param serviceHypothesis サービス仮説
   * @returns 調査結果
   */
  async conductResearch(prompt: string, serviceHypothesis: ServiceHypothesis): Promise<string> {
    try {
      // サービス仮説を文字列に変換
      const hypothesisText = this.formatServiceHypothesis(serviceHypothesis);
      
      // 完全なプロンプトを構築
      const fullPrompt = `${prompt}\n\n【サービス仮説】\n${hypothesisText}`;

      console.log(`[GeminiService] 調査実行開始: ${prompt.substring(0, 50)}...`);
      
      // Gemini APIに問い合わせ
      const result = await this.model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      if (!text || text.trim().length === 0) {
        throw new Error('Gemini APIから空のレスポンスが返されました');
      }

      console.log(`[GeminiService] 調査完了: ${text.length}文字の結果を取得`);
      return text;

    } catch (error) {
      console.error('[GeminiService] 調査実行エラー:', error);
      throw new Error(`Gemini API調査エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 複数の調査を順次実行（レート制限対応）
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
    const interval = process.env.RESEARCH_INTERVAL ? parseInt(process.env.RESEARCH_INTERVAL) : 1000;

    for (let i = 0; i < prompts.length; i++) {
      const { id, title, prompt } = prompts[i];
      
      try {
        // 進行状況を通知
        if (onProgress) {
          onProgress(i + 1, prompts.length, title);
        }

        // 調査実行
        const result = await this.conductResearch(prompt, serviceHypothesis);
        results.push({ id, title, result });

        // レート制限対応（最後以外は待機）
        if (i < prompts.length - 1) {
          await this.sleep(interval);
        }

      } catch (error) {
        console.error(`[GeminiService] 調査${id}(${title})でエラー:`, error);
        results.push({
          id,
          title,
          result: `エラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        
        // エラー後も続行し、待機
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

課金モデル: ${hypothesis.revenueModel}

価格帯・価格設定の方向性: ${hypothesis.pricingDirection}
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
   * API接続テスト
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
   * 統合レポートを生成
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