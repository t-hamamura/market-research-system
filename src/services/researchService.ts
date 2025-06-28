import { GeminiService } from './geminiService';
import { NotionService } from './notionService';
import { 
  ResearchRequest, 
  ProgressEvent, 
  ResearchPrompt, 
  ResearchResult,
  IntegratedResearchResult,
  ServiceHypothesis
} from '../types';

/**
 * 市場調査統括サービスクラス
 * 16種類の調査を順次実行し、結果をNotionに保存
 */
export class ResearchService {
  private geminiService: GeminiService;
  private notionService: NotionService;
  private researchPrompts: ResearchPrompt[];

  constructor(
  geminiService: GeminiService, 
  notionService: NotionService,
  deepResearchService?: DeepResearchService
) {
  this.geminiService = geminiService;
  this.notionService = notionService;
  this.deepResearchService = deepResearchService;
  this.researchPrompts = this.initializeResearchPrompts();
}

// 調査実行部分も修正
// Gemini APIで調査実行
const result = this.deepResearchService 
  ? await this.deepResearchService.conductEnhancedResearch(prompt.prompt, request.serviceHypothesis)
  : await this.geminiService.conductResearch(prompt.prompt, request.serviceHypothesis);
    this.geminiService = geminiService;
    this.notionService = notionService;
    this.researchPrompts = this.initializeResearchPrompts();
  }

  /**
   * 16種類の調査プロンプトを初期化
   * @returns 調査プロンプト配列
   */
  private initializeResearchPrompts(): ResearchPrompt[] {
    return [
      {
        id: 1,
        title: "市場規模と成長性の調査",
        prompt: "下記のサービスを立ち上げようと思っている。関連する市場の規模、過去5年間の推移、および今後5年間の成長予測を具体的な数値と出典を明示しながら、詳細に分析してください。また、市場の地域別・セグメント別の特徴や成長ポテンシャルについて、具体的なデータとともに明確に示してください。<サービス仮説を文末に添付>"
      },
      {
        id: 2,
        title: "PESTEL分析の調査",
        prompt: "下記のサービスを立ち上げようと思っている。関連する市場について、参入や拡大に影響を及ぼす可能性がある政治的、経済的、社会的、技術的、環境的、法的要因（PESTEL要因）をそれぞれ詳細に分析し、各要因が具体的に事業にどのような影響を与える可能性があるかを詳しく説明してください。特に重要と思われる要素については理由も含めて詳しく解説してください。<サービス仮説を文末に添付>"
      },
      {
        id: 3,
        title: "競合の製品特徴・戦略分析",
        prompt: "下記のサービスを立ち上げようと思っている。直接競合や間接競合となりうる企業および類似サービスを対象に、製品・サービスの特徴、強み・弱み、プライシング戦略、営業・マーケティング手法、顧客レビューや満足度評価、オンライン戦略の詳細（SEO・SNS活用）、顧客サポート体制を精密に調査・比較してください。<サービス仮説を文末に添付>"
      },
      {
        id: 4,
        title: "競合の経営戦略変遷・顧客離脱理由",
        prompt: "下記のサービスを立ち上げようと思っている。直接競合や間接競合となりうる企業および類似サービスのこれまでの経営戦略の変遷とその成功要因、顧客が競合サービスから離脱した理由を具体的に特定し、その理由が事業運営上どのような示唆をもたらすのかを詳しく分析してください。<サービス仮説を文末に添付>"
      },
      {
        id: 5,
        title: "顧客セグメント・意思決定プロセス分析",
        prompt: "下記のサービスを立ち上げようと思っている。仮説ターゲット顧客層やサービスにニーズを持ちうる顧客層に関して、詳細なペルソナ設定（属性・心理・行動特性）、利用シーン、動機、抱える課題、不満の具体例、予算感や意思決定プロセスを深く分析してください。購買プロセスの各段階（情報収集〜意思決定）を詳しく調査し、意思決定に関与する人物や要素を明確にしてください。<サービス仮説を文末に添付>"
      },
      {
        id: 6,
        title: "顧客感情・潜在ニーズ・情報収集行動マッピング",
        prompt: "下記のサービスを立ち上げようと思っている。仮説ターゲット顧客層やサービスにニーズを持ちうる顧客層に関して、感情変化（安心、不安、満足、苛立ちなど）、潜在的な顧客ニーズ、情報収集行動を詳細に調査し、顧客の深いインサイトを具体的に提示してください。<サービス仮説を文末に添付>"
      },
      {
        id: 7,
        title: "プロダクト市場適合性と価格戦略",
        prompt: "下記のサービスを立ち上げようと思っている。想定するサービスのUVP（競争優位性）を明確にし、市場適合性を評価するための具体的なMVP設計方法とテスト項目を詳しく示してください。さらに価格設定戦略を検討するにあたり、顧客の価格感応度テストの方法、価格に対する心理的影響、価格変更時の具体的な顧客行動予測を詳細に分析してください。<サービス仮説を文末に添付>"
      },
      {
        id: 8,
        title: "マーケティング戦術分析",
        prompt: "下記のサービスを立ち上げようと思っている。仮説ターゲット顧客層やサービスにニーズを持ちうる顧客層に関して、最適なマーケティングチャネル（オンライン・オフライン）の具体的な活用方法を精査し、競合企業が実施している効果的なコンテンツタイプとその成功要因を調査・整理してください。また、チャネルごとの広告ターゲティング方法、推奨媒体、予算配分の具体例を挙げ、各チャネルにおけるROI評価方法を明確にしてください。<サービス仮説を文末に添付>"
      },
      {
        id: 9,
        title: "ブランドポジショニングとコミュニケーション",
        prompt: "下記のサービスを立ち上げようと思っている。直接競合や間接競合となりうる企業および類似サービスに関して、競合ブランドの認知度やブランドイメージを具体的に調査・分析し、自社ブランドの理想的ポジショニングを明確に提案してください。さらに、顧客の記憶に残る効果的なブランドコミュニケーションの成功事例（他業界含む）を深掘り分析し、自社に取り入れるべき具体的なキーメッセージとメディア戦略を示してください。<サービス仮説を文末に添付>"
      },
      {
        id: 10,
        title: "テクノロジートレンド・セキュリティ分析",
        prompt: "下記のサービスを立ち上げようと思っている。直接の業界内や類似する業界内で注目されているトレンドを、具体的な事例を交えながら詳細に調査し、サービスに取り入れることで提供価値が高まるトレンドや技術、特徴などを具体的に特定してください。また、データ管理やセキュリティ、その他の法的観点の観点から、特に注意が必要なリスクを具体的に挙げ、それらへの具体的な対応策を詳細に提案してください。<サービス仮説を文末に添付>"
      },
      {
        id: 11,
        title: "パートナーシップ戦略とエコシステム形成",
        prompt: "下記のサービスを立ち上げようと思っている。相乗効果が見込める提携先企業や業界を特定し、具体的なビジネスシナリオを設計してください。仮説ターゲット顧客層やサービスにニーズを持ちうる顧客層に関して、キーサービスとなるものの特定と、それを活用したエコシステム形成の具体策を示してください。<サービス仮説を文末に添付>"
      },
      {
        id: 12,
        title: "リスク・シナリオ分析",
        prompt: "下記のサービスを立ち上げようと思っている。市場参入時の規制・ライセンス要件や競合の対応策等、リスク要因を特定し、ベスト・ベース・ワーストケースごとのシナリオを設定してください。業務影響と具体的な対応策を詳しく提示してください。<サービス仮説を文末に添付>"
      },
      {
        id: 13,
        title: "KPI・測定方法の設計",
        prompt: "下記のサービスを立ち上げようと思っている。事業の主要KPIを定義し、測定・管理のための具体的なツールとレポート体制を設計してください。<サービス仮説を文末に添付>"
      },
      {
        id: 14,
        title: "法務・コンプライアンスリスク分析",
        prompt: "下記のサービスを立ち上げようと思っている。業界特有の法的リスクを調査し、具体的ヒアリング項目や対策案を詳細にまとめてください。<サービス仮説を文末に添付>"
      },
      {
        id: 15,
        title: "効果的なリサーチ手法の提案",
        prompt: "下記のサービスを立ち上げようと思っている。一次調査、二次調査、フィールド調査、A/Bテストの具体的手法を活用した詳細な調査計画を設計してください。<サービス仮説を文末に添付>"
      },
      {
        id: 16,
        title: "PMF前特化リサーチ設計",
        prompt: "下記のサービスを立ち上げようと思っている。MVP設計、アーリーアダプター特定方法、初期ターゲット層の深掘り、高速仮説検証の具体設計を提示してください。<サービス仮説を文末に添付>"
      }
    ];
  }

  /**
   * 全市場調査を実行
   * @param request 調査リクエスト
   * @param onProgress 進行状況コールバック
   * @returns 統合調査結果
   */
  async conductFullResearch(
    request: ResearchRequest,
    onProgress: (event: ProgressEvent) => void
  ): Promise<IntegratedResearchResult> {
    const startTime = new Date();
    
    try {
      console.log(`[ResearchService] 市場調査開始: ${request.businessName}`);
      
      // 初期化メッセージ
      onProgress({
        type: 'progress',
        step: 0,
        total: this.researchPrompts.length + 2, // 16調査 + 統合レポート + Notion保存
        message: '市場調査を開始します...',
        researchType: '初期化'
      });

      // 16種類の調査を順次実行
      const researchResults: Array<{ id: number; title: string; result: string }> = [];
      
      for (let i = 0; i < this.researchPrompts.length; i++) {
        const prompt = this.researchPrompts[i];
        
        try {
          // 進行状況通知
          onProgress({
            type: 'progress',
            step: i + 1,
            total: this.researchPrompts.length + 2,
            message: `${prompt.title}を実行中...`,
            researchType: prompt.title
          });

          console.log(`[ResearchService] 調査${i + 1}/16: ${prompt.title}`);
          
          // Gemini APIで調査実行
          const result = await this.geminiService.conductResearch(
            prompt.prompt,
            request.serviceHypothesis
          );

          researchResults.push({
            id: prompt.id,
            title: prompt.title,
            result: result
          });

          console.log(`[ResearchService] 調査${i + 1}完了: ${result.length}文字`);

          // レート制限対応（最後以外は待機）
          if (i < this.researchPrompts.length - 1) {
            await this.sleep(1000);
          }

        } catch (error) {
          console.error(`[ResearchService] 調査${i + 1}でエラー:`, error);
          
          // エラーでも続行
          researchResults.push({
            id: prompt.id,
            title: prompt.title,
            result: `調査でエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }

      // 統合レポート生成
      onProgress({
        type: 'progress',
        step: this.researchPrompts.length + 1,
        total: this.researchPrompts.length + 2,
        message: '統合レポートを生成中...',
        researchType: '統合分析'
      });

      console.log('[ResearchService] 統合レポート生成開始');
      const integratedReport = await this.geminiService.generateIntegratedReport(
        researchResults,
        request.serviceHypothesis
      );
      console.log('[ResearchService] 統合レポート生成完了');

      // Notionページ作成
      onProgress({
        type: 'progress',
        step: this.researchPrompts.length + 2,
        total: this.researchPrompts.length + 2,
        message: 'Notionページを作成中...',
        researchType: 'Notion保存'
      });

      console.log('[ResearchService] Notionページ作成開始');
      const notionResult = await this.notionService.createResearchPage(
        request.businessName,
        request.serviceHypothesis,
        researchResults,
        integratedReport
      );
      console.log('[ResearchService] Notionページ作成完了:', notionResult.url);

      // 完了通知
      const completedAt = new Date();
      const duration = Math.round((completedAt.getTime() - startTime.getTime()) / 1000);
      
      onProgress({
        type: 'complete',
        step: this.researchPrompts.length + 2,
        total: this.researchPrompts.length + 2,
        message: `市場調査が完了しました！ (実行時間: ${duration}秒)`,
        notionUrl: notionResult.url
      });

      // 統合結果を作成
      const result: IntegratedResearchResult = {
        businessName: request.businessName,
        serviceHypothesis: request.serviceHypothesis,
        researchResults: researchResults.map((r, index) => ({
          id: r.id,
          title: r.title,
          prompt: this.researchPrompts[index].prompt,
          result: r.result,
          timestamp: new Date(),
          status: 'completed'
        })),
        summary: integratedReport,
        notionPageId: notionResult.pageId,
        notionUrl: notionResult.url,
        completedAt: completedAt
      };

      console.log(`[ResearchService] 市場調査完了: ${request.businessName}`);
      return result;

    } catch (error) {
      console.error('[ResearchService] 市場調査エラー:', error);
      
      onProgress({
        type: 'error',
        step: 0,
        total: this.researchPrompts.length + 2,
        message: `市場調査でエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`
      });

      throw error;
    }
  }

  /**
   * リクエストバリデーション
   * @param request 調査リクエスト
   * @returns バリデーション結果
   */
  validateRequest(request: ResearchRequest): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 事業名チェック
    if (!request.businessName || request.businessName.trim().length === 0) {
      errors.push('事業名は必須です');
    }

    // サービス仮説チェック
    const hypothesis = request.serviceHypothesis;
    if (!hypothesis) {
      errors.push('サービス仮説は必須です');
      return { isValid: false, errors };
    }

    if (!hypothesis.concept || hypothesis.concept.trim().length === 0) {
      errors.push('コンセプトは必須です');
    }

    if (!hypothesis.customerProblem || hypothesis.customerProblem.trim().length === 0) {
      errors.push('解決したい顧客課題は必須です');
    }

    if (!hypothesis.targetIndustry || hypothesis.targetIndustry.trim().length === 0) {
      errors.push('狙っている業種・業界は必須です');
    }

    if (!hypothesis.targetUsers || hypothesis.targetUsers.trim().length === 0) {
      errors.push('想定される利用者層は必須です');
    }

    if (!hypothesis.competitors || hypothesis.competitors.trim().length === 0) {
      errors.push('直接競合・間接競合は必須です');
    }

    if (!hypothesis.revenueModel || hypothesis.revenueModel.trim().length === 0) {
      errors.push('課金モデルは必須です');
    }

    if (!hypothesis.pricingDirection || hypothesis.pricingDirection.trim().length === 0) {
      errors.push('価格帯・価格設定の方向性は必須です');
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * サービス接続テスト
   * @returns テスト結果
   */
  async testServices(): Promise<{ gemini: boolean; notion: boolean }> {
    try {
      const [geminiTest, notionTest] = await Promise.all([
        this.geminiService.testConnection(),
        this.notionService.testConnection()
      ]);

      return {
        gemini: geminiTest,
        notion: notionTest
      };
    } catch (error) {
      console.error('[ResearchService] サービステストエラー:', error);
      return {
        gemini: false,
        notion: false
      };
    }
  }

  /**
   * 調査プロンプト一覧を取得
   * @returns 調査プロンプト配列
   */
  getResearchPrompts(): ResearchPrompt[] {
    return this.researchPrompts;
  }

  /**
   * 指定時間待機
   * @param ms 待機時間（ミリ秒）
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 
