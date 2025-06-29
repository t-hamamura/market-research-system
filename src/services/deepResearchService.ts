import { GeminiService } from './geminiService';
import { ServiceHypothesis } from '../types';

/**
 * Deep Research サービスクラス
 * Gemini 2.5を使用した高度な市場調査を実行
 */
export class DeepResearchService {
  private geminiService: GeminiService;

  constructor(geminiService: GeminiService) {
    this.geminiService = geminiService;
  }

  /**
   * 強化された市場調査を実行
   * @param prompt 調査プロンプト
   * @param serviceHypothesis サービス仮説
   * @returns 調査結果
   */
  async conductEnhancedResearch(prompt: string, serviceHypothesis: ServiceHypothesis): Promise<string> {
    try {
      console.log('[DeepResearchService] Deep Research開始');
      
      // Phase 1: 基本調査
      const basicResearch = await this.geminiService.conductResearch(prompt, serviceHypothesis);
      
      // Phase 2: 深掘り分析プロンプトを生成
      const deepDivePrompt = this.generateDeepDivePrompt(basicResearch, prompt, serviceHypothesis);
      
      // Phase 3: 深掘り調査実行
      const deepResearch = await this.geminiService.conductResearch(deepDivePrompt, serviceHypothesis);
      
      // Phase 4: 結果を統合
      const integratedResult = await this.integrateResults(basicResearch, deepResearch, prompt);
      
      console.log('[DeepResearchService] Deep Research完了');
      return integratedResult;

    } catch (error) {
      console.error('[DeepResearchService] Deep Research エラー:', error);
      // エラーの場合は基本調査結果にフォールバック
      return await this.geminiService.conductResearch(prompt, serviceHypothesis);
    }
  }

  /**
   * 深掘り分析プロンプトを生成
   * @param basicResult 基本調査結果
   * @param originalPrompt 元のプロンプト
   * @param serviceHypothesis サービス仮説
   * @returns 深掘りプロンプト
   */
  private generateDeepDivePrompt(basicResult: string, originalPrompt: string, serviceHypothesis: ServiceHypothesis): string {
    return `
以下の基本調査結果をさらに深掘りし、具体的な数値データ、実際の事例、専門的な分析を追加してください。

【基本調査結果】
${basicResult}

【深掘り要求】
1. 具体的な数値データと出典を追加
2. 実際の企業名や事例を含めた分析
3. 業界専門家の見解や予測
4. 定量的な市場データ
5. 競合他社の具体的な戦略と成果
6. 最新のトレンドと将来予測
7. リスク要因の具体的な影響度
8. 実行可能なアクションプランの提案

【元の調査目的】
${originalPrompt}

上記を踏まえ、より詳細で実用的な調査結果を作成してください。
    `;
  }

  /**
   * 基本調査と深掘り調査の結果を統合
   * @param basicResult 基本調査結果
   * @param deepResult 深掘り調査結果
   * @param originalPrompt 元のプロンプト
   * @returns 統合結果
   */
  private async integrateResults(basicResult: string, deepResult: string, originalPrompt: string): Promise<string> {
    const integrationPrompt = `
以下の2つの調査結果を統合し、包括的で実用的なレポートを作成してください。

【基本調査結果】
${basicResult}

【深掘り調査結果】
${deepResult}

【統合要求】
1. 重複する内容は整理統合
2. 矛盾する情報は検証して最適解を提示
3. 不足している観点があれば補完
4. 実用的なアクションプランを明確化
5. 優先順位付けされた推奨事項
6. 定量的指標と測定方法
7. リスク評価と対策案
8. 実装スケジュール案

最終的な統合レポートとして、事業判断に直接活用できる内容にしてください。
    `;

    try {
      // 簡単なサービス仮説オブジェクトを作成（統合処理用）
      const dummyHypothesis: ServiceHypothesis = {
        concept: "統合処理",
        customerProblem: "統合処理",
        targetIndustry: "統合処理", 
        targetUsers: "統合処理",
        competitors: "統合処理",
        revenueModel: "統合処理",
        pricingDirection: "統合処理",
        uvp: "統合処理",
        initialKpi: "統合処理",
        acquisitionChannels: "統合処理"
      };

      const integratedResult = await this.geminiService.conductResearch(integrationPrompt, dummyHypothesis);
      return integratedResult;
    } catch (error) {
      console.error('[DeepResearchService] 統合処理エラー:', error);
      // エラーの場合は深掘り結果を返す
      return deepResult;
    }
  }

  /**
   * Deep Research サービスの接続テスト
   * @returns テスト結果
   */
  async testConnection(): Promise<boolean> {
    try {
      const testHypothesis: ServiceHypothesis = {
        concept: "テスト用サービス",
        customerProblem: "テスト課題",
        targetIndustry: "テスト業界",
        targetUsers: "テストユーザー",
        competitors: "テスト競合",
        revenueModel: "テスト課金",
        pricingDirection: "テスト価格",
        uvp: "テスト用UVP",
        initialKpi: "テスト用KPI",
        acquisitionChannels: "テスト用チャネル"
      };

      const result = await this.conductEnhancedResearch(
        "これはDeep Researchサービスの接続テストです。「接続成功」と回答してください。",
        testHypothesis
      );

      return result.length > 0;
    } catch (error) {
      console.error('[DeepResearchService] 接続テストエラー:', error);
      return false;
    }
  }
}
