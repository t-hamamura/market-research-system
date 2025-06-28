import { GeminiService } from './geminiService';
import { TavilyService } from './tavilyService';
import { ServiceHypothesis } from '../types';

/**
 * Deep Research統合サービス
 * TavilyのWeb検索結果とGeminiの分析を組み合わせ
 */
export class DeepResearchService {
  private geminiService: GeminiService;
  private tavilyService: TavilyService;

  constructor(geminiService: GeminiService, tavilyService: TavilyService) {
    this.geminiService = geminiService;
    this.tavilyService = tavilyService;
  }

  /**
   * 強化された市場調査実行
   * Web検索結果を含む高精度な調査
   */
  async conductEnhancedResearch(
    prompt: string,
    serviceHypothesis: ServiceHypothesis
  ): Promise<string> {
    try {
      console.log('[DeepResearchService] 強化調査開始');

      // 1. Web検索でリアルタイム情報を取得
      const webResearchResults = await this.tavilyService.conductDeepResearch(
        this.extractResearchTopic(prompt),
        serviceHypothesis
      );

      // 2. 検索結果とプロンプトを組み合わせてGeminiで分析
      const enhancedPrompt = this.buildEnhancedPrompt(prompt, webResearchResults, serviceHypothesis);

      // 3. Geminiで高度な分析実行
      const analysis = await this.geminiService.conductResearch(enhancedPrompt, serviceHypothesis);

      console.log('[DeepResearchService] 強化調査完了');
      return analysis;

    } catch (error) {
      console.error('[DeepResearchService] 強化調査エラー:', error);
      // エラー時は通常の調査にフォールバック
      console.log('[DeepResearchService] 通常調査にフォールバック');
      return await this.geminiService.conductResearch(prompt, serviceHypothesis);
    }
  }

  /**
   * プロンプトから調査トピックを抽出
   */
  private extractResearchTopic(prompt: string): string {
    if (prompt.includes('市場規模')) return '市場規模';
    if (prompt.includes('競合')) return '競合分析';
    if (prompt.includes('PESTEL')) return 'PESTEL分析';
    if (prompt.includes('顧客')) return '顧客分析';
    if (prompt.includes('価格')) return '価格戦略';
    if (prompt.includes('マーケティング')) return 'マーケティング';
    if (prompt.includes('ブランド')) return 'ブランド';
    if (prompt.includes('技術') || prompt.includes('テクノロジー')) return 'テクノロジー';
    if (prompt.includes('リスク')) return 'リスク分析';
    if (prompt.includes('パートナーシップ')) return 'パートナーシップ';
    if (prompt.includes('KPI')) return 'KPI設計';
    if (prompt.includes('法務') || prompt.includes('コンプライアンス')) return '法務分析';
    if (prompt.includes('リサーチ手法')) return 'リサーチ手法';
    if (prompt.includes('PMF')) return 'PMF分析';
    return '市場分析';
  }

  /**
   * Web検索結果を含む強化プロンプト構築
   */
  private buildEnhancedPrompt(
    originalPrompt: string,
    webResults: string,
    serviceHypothesis: ServiceHypothesis
  ): string {
    return `
${originalPrompt}

【最新のWeb調査結果】
${webResults}

【サービス仮説】
コンセプト: ${serviceHypothesis.concept}
解決したい顧客課題: ${serviceHypothesis.customerProblem}
狙っている業種・業界: ${serviceHypothesis.targetIndustry}
想定される利用者層: ${serviceHypothesis.targetUsers}
直接競合・間接競合: ${serviceHypothesis.competitors}
課金モデル: ${serviceHypothesis.revenueModel}
価格帯・価格設定の方向性: ${serviceHypothesis.pricingDirection}

上記の最新Web情報とサービス仮説を踏まえて、具体的な数値データ、出典、最新動向を含めた詳細な分析を行ってください。
特に2024年以降の最新情報を重視し、実用的な洞察とアクションプランを提示してください。
    `.trim();
  }

  /**
   * API接続テスト
   */
  async testConnection(): Promise<boolean> {
    try {
      return await this.tavilyService.testConnection();
    } catch (error) {
      console.error('[DeepResearchService] 接続テストエラー:', error);
      return false;
    }
  }
}
