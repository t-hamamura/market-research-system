import { GeminiService } from './geminiService';
import { NotionService } from './notionService';
import { NotionBatchService } from './notionBatchService';
import { DeepResearchService } from './deepResearchService';
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
  private notionBatchService: NotionBatchService;
  private deepResearchService?: DeepResearchService;
  private researchPrompts: ResearchPrompt[];

  constructor(
    geminiService: GeminiService, 
    notionService: NotionService,
    notionBatchService: NotionBatchService,
    deepResearchService?: DeepResearchService
  ) {
    this.geminiService = geminiService;
    this.notionService = notionService;
    this.notionBatchService = notionBatchService;
    this.deepResearchService = deepResearchService;
    this.researchPrompts = this.initializeResearchPrompts();
  }

  /**
   * 16種類の調査プロンプトを初期化
   * @returns 調査プロンプト配列
   */
  private initializeResearchPrompts(): ResearchPrompt[] {
    const markdownInstruction = `

## 🎨 出力形式指示（重要）

**必ずMarkdown形式で出力し、以下の装飾を活用してください：**

### 📋 必須要素
1. **見出し**: ## メインタイトル、### サブタイトル
2. **表形式データ**: | 項目 | 数値 | 備考 | で整理
3. **太字強調**: **重要な数値・結論**
4. **箇条書き**: - または * で要点整理
5. **Callout**: > 💡 重要ポイント: 内容
6. **区切り線**: --- でセクション分離

### 📊 必須コンテンツ構造
1. **## 📊 エグゼクティブサマリー**
   - **主要発見事項** (3-5点、太字で強調)
   - **重要な数値データ** (表形式)
   - **戦略的提言** (箇条書き)

2. **## 📈 詳細分析**
   - 具体的なデータと根拠
   - 表形式での比較・分析
   - 出典・参考情報の明記

3. **## 🎯 アクションプラン**
   - 短期・中期・長期の具体的ステップ
   - 優先度付きの推奨事項

 4. **## 📚 参考情報・エビデンス（必須）**
    - **参考文献**: [タイトル](URL) 形式でリンク機能付き
    - **調査データ出典**: 具体的なソース明記
    - **脚注**: [1] 形式で番号付け、本文内に対応する数値
    - **ソースURL**: 必ず末尾に全参照先のタイトルとURLを記載

 ### ⚠️ 重要な注意事項（厳守）
 - **数値は具体的に**: 「多い」ではなく「300%増加」
 - **出典を明記**: 全ての数値・情報にソースを記載
 - **エビデンス重視**: 参照した情報源を必ず記録
 - **実用性重視**: 実行可能な具体的提案
 - **脚注の徹底**: 本文に[1], [2]等を挿入し、末尾で対応するソース情報
 - **リンク機能**: URLは [タイトル](URL) 形式で機能するリンクとして記載

 **出力例**:
 ## 📊 市場規模分析結果
 
 **総市場規模**: 376億円（2024年）→680億円（2029年予測）[1]
 
 | 年度 | 市場規模 | 成長率 | 備考 |
 |------|----------|--------|------|
 | 2024年 | 376億円 | - | 基準年[1] |
 | 2029年 | 680億円 | 12.6% | 予測値[1] |
 
 **重要な発見事項**:
 1. **市場成長率**: CAGR 12.6%の高成長[1]
 2. **競合状況**: 主要3社でシェア60%を占有[2]
 3. **技術トレンド**: AI活用が急速に普及[3]
 
 **推奨アクション**:
 1. **短期（3ヶ月）**: MVP開発とテストユーザー獲得[4]
 2. **中期（6-12ヶ月）**: 本格的な市場参入[4]
 3. **長期（1-3年）**: 市場リーダー地位の確立[4]
 
 > 💡 **重要**: LINE特化型MA市場は急成長中で、投資機会が大きい[1]
 
 ---
 
 ### 📚 参考情報・エビデンス
 [1] [デジタルマーケティング市場調査2024](https://example.com/report) - 市場規模・成長予測データ
 [2] [競合分析レポート2024](https://example.com/competitors) - 競合シェア分析
 [3] [AI技術トレンド調査](https://example.com/ai-trends) - 技術動向データ
 [4] [スタートアップ戦略ガイド](https://example.com/startup-guide) - 戦略提言根拠

`;  

    const prompts: { id: number; title: string; prompt: string }[] = [
      {
        id: 1,
        title: '市場規模と成長性の調査',
        prompt:
          '下記のサービスを立ち上げようと思っている。関連する市場の規模、過去5年間の推移、および今後5年間の成長予測を具体的な数値と出典を明示しながら、詳細に分析してください。また、市場の地域別・セグメント別の特徴や成長ポテンシャルについて、具体的なデータとともに明確に示してください。',
      },
      {
        id: 2,
        title: 'PESTEL分析の調査',
        prompt:
          '下記のサービスを立ち上げようと思っている。関連する市場について、参入や拡大に影響を及ぼす可能性がある政治的、経済的、社会的、技術的、環境的、法的要因（PESTEL要因）をそれぞれ詳細に分析し、各要因が具体的に事業にどのような影響を与える可能性があるかを詳しく説明してください。特に重要と思われる要素については理由も含めて詳しく解説してください。',
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
        title: 'PMF前特化リサーチ設計',
        prompt:
          '下記のサービスを立ち上げようと思っている。MVP設計、アーリーアダプター特定方法、初期ターゲット層の深掘り、高速仮説検証の具体設計を提示してください。',
      }
    ];

    return prompts.map((p) => ({
      ...p,
      prompt: `${p.prompt}\n<サービス仮説を文末に添付>\n\n${markdownInstruction}`,
    }));
  }

  /**
   * 全市場調査を実行（事前作成→ステータス更新方式）
   * @param request 調査リクエスト
   * @param onProgress 進行状況コールバック
   * @param resumeFromStep 再開するステップ（省略時は最初から）
   * @returns 統合調査結果
   */
  async conductFullResearch(
    request: ResearchRequest,
    onProgress: (event: ProgressEvent) => void,
    resumeFromStep?: number
  ): Promise<IntegratedResearchResult> {
    const startTime = new Date();
    const actualResumeStep = resumeFromStep || 0;
    
    try {
      console.log(`[ResearchService] 市場調査開始（事前作成→ステータス更新方式）: ${request.businessName}`);
      console.log(`[ResearchService] resumeFromStep: ${resumeFromStep}, actualResumeStep: ${actualResumeStep}`);
      
      if (actualResumeStep > 0) {
        console.log(`[ResearchService] ★再開モード★ ステップ${actualResumeStep}から再開`);
      } else {
        console.log(`[ResearchService] ★新規実行モード★ 最初から実行（事前作成フェーズ含む）`);
      }
      
      // 初期化メッセージ
      onProgress({
        type: 'progress',
        step: 0,
        total: this.researchPrompts.length + 3, // 事前作成フェーズを追加
        message: '市場調査システムを初期化中...',
        researchType: '初期化'
      });

      // Phase 1: 全16調査項目 + 統合レポートを事前作成
      let createdPages: Array<{ pageId: string; url: string; researchId: number; title: string }> = [];
      let integratedReportPageId: string | null = null;
      
      console.log(`[ResearchService] 事前作成判定: actualResumeStep=${actualResumeStep}, 条件チェック: ${actualResumeStep === 0}`);
      
      if (actualResumeStep === 0) {
        console.log('[ResearchService] ===== Phase 1: 事前作成フェーズ開始 =====');
        console.log('[ResearchService] 全調査項目 + 統合レポートを事前作成中...');
        onProgress({
          type: 'progress',
          step: 1,
          total: this.researchPrompts.length + 3,
          message: '16種類の調査項目をNotionに事前作成中...',
          researchType: '事前作成'
        });

        try {
          console.log('[ResearchService] 16種類の調査項目を事前作成開始...');
          
          // 16種類の調査項目を事前作成
          createdPages = await this.notionBatchService.batchCreateResearchPages(
            request.businessName,
            this.researchPrompts
          );
          console.log(`[ResearchService] ✅ 調査項目事前作成完了: ${createdPages.length}件`);
          console.log(`[ResearchService] 作成されたページ詳細:`, createdPages.map(p => ({ id: p.researchId, title: p.title, pageId: p.pageId.substring(0, 8) })));
          
          // 統合レポートページを事前作成
          console.log('[ResearchService] 統合レポートページを事前作成開始...');
          onProgress({
            type: 'progress',
            step: 2,
            total: this.researchPrompts.length + 3,
            message: '統合レポートページを事前作成中...',
            researchType: '統合レポート事前作成'
          });
          
          const integratedReportPage = await this.notionService.createIntegratedReportPage(
            request.businessName,
            request.serviceHypothesis
          );
          integratedReportPageId = integratedReportPage.pageId;
          console.log(`[ResearchService] ✅ 統合レポート事前作成完了: ${integratedReportPage.url}`);
          console.log(`[ResearchService] 統合レポートページID: ${integratedReportPageId.substring(0, 8)}...`);
          
          onProgress({
            type: 'progress',
            step: 3,
            total: this.researchPrompts.length + 3,
            message: `全${createdPages.length}件の調査項目 + 統合レポートを事前作成完了。順次実行を開始します...`,
            researchType: '事前作成完了'
          });
          
          console.log('[ResearchService] ===== Phase 1: 事前作成フェーズ完了 =====');
        } catch (error) {
          console.error('[ResearchService] ❌ 事前作成エラー:', error);
          console.error('[ResearchService] エラー詳細:', error instanceof Error ? error.stack : 'スタックトレースなし');
          throw new Error(`調査項目事前作成エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        console.log('[ResearchService] ===== 再開モード: 既存ページID取得 =====');
        console.log('[ResearchService] 再開時は既存ページを検索して、正確なページIDを取得');
        
        try {
          // 既存の統合レポートページIDを検索・取得
          console.log('[ResearchService] 🔍 既存統合レポートページIDを検索中...');
          const existingIntegratedReport = await this.notionService.findExistingIntegratedReport(request.businessName);
          
          if (existingIntegratedReport) {
            integratedReportPageId = existingIntegratedReport.pageId;
            console.log(`[ResearchService] ✅ 既存統合レポートページID取得成功: ${integratedReportPageId.substring(0, 8)}...`);
            console.log(`[ResearchService] 📋 既存統合レポートURL: ${existingIntegratedReport.url}`);
          } else {
            console.warn('[ResearchService] ⚠️ 既存統合レポートページが見つかりません、新規作成に切り替え');
            // 統合レポートページを新規作成
            const integratedReportPage = await this.notionService.createIntegratedReportPage(
              request.businessName,
              request.serviceHypothesis
            );
            integratedReportPageId = integratedReportPage.pageId;
            console.log(`[ResearchService] ✅ 再開時統合レポート新規作成完了: ${integratedReportPage.url}`);
          }
          
          // 既存の個別調査ページIDを取得（簡易実装）
          console.log('[ResearchService] 🔍 既存の個別調査ページIDを検索中...');
          createdPages = [];
          
          for (const prompt of this.researchPrompts) {
            const existingPage = await this.notionService.findExistingResearchPage(
              request.businessName,
              prompt.title
            );
            
            if (existingPage) {
              createdPages.push({
                pageId: existingPage.pageId,
                url: existingPage.url,
                researchId: prompt.id,
                title: prompt.title
              });
              console.log(`[ResearchService] ✅ 既存ページ発見: ${prompt.title} - ${existingPage.pageId.substring(0, 8)}...`);
            } else {
              // 既存ページが見つからない場合は仮IDを設定
              createdPages.push({
                pageId: 'resumed-not-found',
                url: 'resumed-not-found',
                researchId: prompt.id,
                title: prompt.title
              });
              console.warn(`[ResearchService] ⚠️ 既存ページ未発見: ${prompt.title}`);
            }
          }
          
          const foundPages = createdPages.filter(p => p.pageId !== 'resumed-not-found').length;
          console.log(`[ResearchService] 📊 再開モード ページID取得結果: ${foundPages}/${createdPages.length} 件発見`);
          
        } catch (resumeError) {
          console.error('[ResearchService] 再開モードでページID取得エラー:', resumeError);
          // エラー時は従来の仮ID方式にフォールバック
          createdPages = this.researchPrompts.map(prompt => ({
            pageId: 'resumed-fallback',
            url: 'resumed-fallback',
            researchId: prompt.id,
            title: prompt.title
          }));
          integratedReportPageId = 'resumed-fallback';
          console.log(`[ResearchService] 🔄 フォールバック: 仮ページ情報を使用: ${createdPages.length}件`);
        }
      }
      
      // 初期化メッセージ
      onProgress({
        type: 'progress',
        step: actualResumeStep + 2,
        total: this.researchPrompts.length + 3,
        message: actualResumeStep > 0 
          ? `ステップ${actualResumeStep}から市場調査を再開します...`
          : '各調査項目の実行を開始します...',
        researchType: '調査実行開始'
      });

      // Phase 2: 各調査を順次実行（ステータス更新方式）
      const researchResults: Array<{ id: number; title: string; result: string }> = [];
      
      // 再開用: 完了済みの調査をスキップ
      const remainingPrompts = this.researchPrompts.slice(actualResumeStep);
      const remainingPages = createdPages.slice(actualResumeStep);
      
      console.log(`[ResearchService] Phase 2: 調査実行開始`);
      console.log(`[ResearchService] 実行対象: ${remainingPrompts.length}調査 (${actualResumeStep}調査スキップ)`);

      for (let i = 0; i < remainingPrompts.length; i++) {
        const prompt = remainingPrompts[i];
        const pageInfo = remainingPages[i];
        const globalIndex = actualResumeStep + i;
        
        try {
          console.log(`[ResearchService] 調査${globalIndex + 1}/16: ${prompt.title}`);
          
          // Step 1: ステータスを「進行中」に更新
          onProgress({
            type: 'progress',
            step: globalIndex + 3,
            total: this.researchPrompts.length + 3,
            message: `${prompt.title}を実行中...`,
            researchType: prompt.title
          });

          // 仮IDかどうかをチェック
          const isTemporaryPageId = !pageInfo.pageId || 
                                   pageInfo.pageId === 'resumed' || 
                                   pageInfo.pageId === 'resumed-fallback' || 
                                   pageInfo.pageId === 'resumed-not-found';
          
          if (!isTemporaryPageId) {
            console.log(`[ResearchService] ステータス更新（進行中）: ${prompt.title}`);
            await this.notionService.updatePageStatus(pageInfo.pageId, 'in-progress');
          } else {
            console.log(`[ResearchService] 🔄 仮ID検出、ステータス更新スキップ: ${prompt.title} (${pageInfo.pageId})`);
          }
          
          // Step 2: 実際の調査を実行（Deep Research機能改善版）
          console.log(`[ResearchService] 調査実行中: ${prompt.title}`);
          let result: string;
          
          if (this.deepResearchService) {
            try {
              // Deep Research機能を試行（Railway環境対応・タイムアウト延長）
              console.log(`[ResearchService] Deep Research実行（Railway対応）: ${prompt.title}`);
              result = await this.executeWithTimeout(
                () => this.deepResearchService!.conductEnhancedResearch(prompt.prompt, request.serviceHypothesis),
                240000, // 4分のタイムアウト（Railway対応）
                `Deep Research: ${prompt.title}`
              );
              console.log(`[ResearchService] Deep Research成功: ${prompt.title} (${result.length}文字)`);
            } catch (deepError) {
              console.warn(`[ResearchService] Deep Research失敗、標準調査にフォールバック: ${prompt.title}`, deepError);
              // フォールバック: 標準Gemini調査（Railway対応延長）
              result = await this.executeWithTimeout(
                () => this.geminiService.conductResearch(prompt.prompt, request.serviceHypothesis),
                180000, // 3分のタイムアウト（Railway対応延長）
                `標準調査: ${prompt.title}`
              );
              console.log(`[ResearchService] 標準調査成功: ${prompt.title} (${result.length}文字)`);
            }
          } else {
            // Deep Research機能が利用できない場合は標準調査（Railway対応延長）
            console.log(`[ResearchService] 標準調査実行（Railway対応）: ${prompt.title}`);
            result = await this.executeWithTimeout(
              () => this.geminiService.conductResearch(prompt.prompt, request.serviceHypothesis),
              180000, // 3分のタイムアウト（Railway対応延長）
              `標準調査: ${prompt.title}`
            );
          }

          console.log(`[ResearchService] 調査完了: ${prompt.title} (${result.length}文字)`);

          // Step 3: ステータスを「完了」に更新し、コンテンツを追加
          if (!isTemporaryPageId) {
            try {
              console.log(`[ResearchService] コンテンツ更新中: ${prompt.title}`);
              const contentUpdateSuccess = await this.notionService.updatePageContent(pageInfo.pageId, result);
              
              if (contentUpdateSuccess) {
                console.log(`[ResearchService] ステータス更新（完了）: ${prompt.title}`);
                const statusUpdateSuccess = await this.notionService.updatePageStatus(pageInfo.pageId, 'completed');
                
                if (!statusUpdateSuccess) {
                  console.warn(`[ResearchService] ステータス更新に失敗: ${prompt.title}`);
                }
              } else {
                console.warn(`[ResearchService] コンテンツ更新失敗（調査は継続）: ${prompt.title}`);
                
                // コンテンツ更新に失敗してもステータスは失敗に更新
                try {
                  await this.notionService.updatePageStatus(pageInfo.pageId, 'failed');
                  console.log(`[ResearchService] 失敗ステータス更新完了: ${prompt.title}`);
                } catch (statusError) {
                  console.error(`[ResearchService] 失敗ステータス更新もエラー: ${prompt.title}`, statusError);
                }
              }
            } catch (notionError) {
              console.error(`[ResearchService] Notion更新エラー (調査は継続): ${prompt.title}`, notionError);
              
              // Notionエラーでもステータスは失敗に更新を試行
              try {
                await this.notionService.updatePageStatus(pageInfo.pageId, 'failed');
                console.log(`[ResearchService] エラー後の失敗ステータス更新完了: ${prompt.title}`);
              } catch (statusError) {
                console.error(`[ResearchService] エラー後のステータス更新も失敗: ${prompt.title}`, statusError);
              }
            }
          }

          // 結果を記録（Notionエラーが発生しても調査結果は保持）
          researchResults.push({
            id: prompt.id,
            title: prompt.title,
            result: result
          });

          console.log(`[ResearchService] 調査${globalIndex + 1}完了: ${prompt.title}`);
          
          // API制限対策の待機（次の調査との間隔）
          if (i < remainingPrompts.length - 1) {
            console.log(`[ResearchService] 次の調査まで待機中... (2秒)`);
            await this.sleep(2000);
          }

        } catch (error) {
          console.error(`[ResearchService] 調査${globalIndex + 1}でエラー:`, error);
          
          // エラー発生時もステータスを「失敗」に更新を試行
          const isTemporaryPageIdForError = !pageInfo.pageId || 
                                           pageInfo.pageId === 'resumed' || 
                                           pageInfo.pageId === 'resumed-fallback' || 
                                           pageInfo.pageId === 'resumed-not-found';
          
          if (!isTemporaryPageIdForError) {
            try {
              await this.notionService.updatePageStatus(pageInfo.pageId, 'failed');
              console.log(`[ResearchService] エラー時のステータス更新（失敗）完了: ${prompt.title}`);
            } catch (statusError) {
              console.error(`[ResearchService] エラー時のステータス更新も失敗: ${prompt.title}`, statusError);
            }
          }
          
          // エラーでも続行（詳細なフォールバック情報を提供）
          const fallbackResult = this.generateFallbackResult(prompt.title, error);
          
          researchResults.push({
            id: prompt.id,
            title: prompt.title,
            result: fallbackResult
          });

          console.warn(`[ResearchService] 調査${globalIndex + 1}はフォールバック結果を使用: ${prompt.title}`);
          
          // エラーが連続する場合の待機時間を延長
          if (i < remainingPrompts.length - 1) {
            console.log(`[ResearchService] エラー後の待機時間延長... (5秒)`);
            await this.sleep(5000);
          }
        }
      }

      // Phase 3: 統合レポート生成と更新
      onProgress({
        type: 'progress',
        step: this.researchPrompts.length + 3,
        total: this.researchPrompts.length + 3,
        message: '統合レポートを生成中...',
        researchType: '統合分析'
      });

      console.log('[ResearchService] Phase 3: 統合レポート生成開始（Railway対応）');
      const integratedReport = await this.executeWithTimeout(
        () => this.geminiService.generateIntegratedReport(
          researchResults,
          request.serviceHypothesis
        ),
        300000, // 5分のタイムアウト（Railway対応延長）
        '統合レポート生成'
      );
      console.log('[ResearchService] 統合レポート生成完了');

      // 統合レポートページの内容を更新（事前作成済みページに内容追加）
      console.log('[ResearchService] 統合レポートページ更新開始');
      let notionResult;
      
      // 仮IDかどうかをチェック
      const isTemporaryId = !integratedReportPageId || 
                           integratedReportPageId === 'resumed' || 
                           integratedReportPageId === 'resumed-fallback' || 
                           integratedReportPageId === 'resumed-not-found';
      
      console.log(`[ResearchService] 📋 統合レポートページID状態: ${integratedReportPageId}, 仮ID判定: ${isTemporaryId}`);
      
      if (integratedReportPageId && !isTemporaryId) {
        try {
          // 事前作成したページの内容を更新
          console.log('[ResearchService] 統合レポートコンテンツ更新中...');
          const contentUpdateSuccess = await this.notionService.updateIntegratedReportContent(integratedReportPageId, integratedReport);
          
          if (contentUpdateSuccess) {
            console.log('[ResearchService] 統合レポートステータス更新中...');
            const statusUpdateSuccess = await this.notionService.updatePageStatus(integratedReportPageId, 'completed');
            
            if (statusUpdateSuccess) {
              console.log('[ResearchService] 統合レポート更新完全成功');
            } else {
              console.warn('[ResearchService] 統合レポートステータス更新失敗（内容は更新済み）');
            }
          } else {
            console.warn('[ResearchService] 統合レポートコンテンツ更新失敗');
            
            // コンテンツ更新失敗時はステータスを失敗に
            try {
              await this.notionService.updatePageStatus(integratedReportPageId, 'failed');
              console.log('[ResearchService] 統合レポート失敗ステータス更新完了');
            } catch (statusError) {
              console.error('[ResearchService] 統合レポート失敗ステータス更新もエラー:', statusError);
            }
          }
          
          notionResult = {
            pageId: integratedReportPageId,
            url: this.notionService.generatePageUrl(integratedReportPageId)
          };
          console.log('[ResearchService] 事前作成統合レポートページ更新完了:', notionResult.url);
          
        } catch (notionError) {
          console.error('[ResearchService] 統合レポート更新でNotionエラー:', notionError);
          
          // エラーでもページ情報は提供
          notionResult = {
            pageId: integratedReportPageId,
            url: this.notionService.generatePageUrl(integratedReportPageId)
          };
          console.log('[ResearchService] エラー後も統合レポートページ情報を提供:', notionResult.url);
          
          // ステータスを失敗に更新を試行
          try {
            await this.notionService.updatePageStatus(integratedReportPageId, 'failed');
            console.log('[ResearchService] エラー後の統合レポート失敗ステータス更新完了');
          } catch (statusError) {
            console.error('[ResearchService] エラー後の統合レポートステータス更新も失敗:', statusError);
          }
        }
      } else {
        // フォールバック: 従来方式で作成
        try {
          console.log('[ResearchService] フォールバック: 従来方式で統合レポート作成');
          notionResult = await this.notionService.createResearchPage(
            request.businessName,
            request.serviceHypothesis,
            researchResults,
            integratedReport
          );
          console.log('[ResearchService] 従来方式統合レポート作成完了:', notionResult.url);
        } catch (fallbackError) {
          console.error('[ResearchService] フォールバック方式でもエラー:', fallbackError);
          
          // 最終的にエラーでも仮のページ情報を提供
          notionResult = {
            pageId: 'error-fallback',
            url: 'https://www.notion.so/'
          };
          console.log('[ResearchService] 最終フォールバックとしてNotion基本URLを提供');
        }
      }

      // 完了通知
      const completedAt = new Date();
      const duration = Math.round((completedAt.getTime() - startTime.getTime()) / 1000);
      const efficientProcessingMessage = actualResumeStep === 0 
        ? '事前作成→ステータス更新方式により重複実行を完全防止し、効率的に処理'
        : 'ステップ再開で効率的に処理';
      
      onProgress({
        type: 'complete',
        step: this.researchPrompts.length + 3,
        total: this.researchPrompts.length + 3,
        message: actualResumeStep > 0 
          ? `市場調査が完了しました！事前作成済み調査項目${createdPages.length}件 + 統合レポートを更新 (実行時間: ${duration}秒、ステップ${actualResumeStep}から再開)`
          : `市場調査が完了しました！事前作成調査項目${createdPages.length}件 + 統合レポートを作成 (実行時間: ${duration}秒、${efficientProcessingMessage})`,
        notionUrl: notionResult.url
      });

      // 統合結果を作成（事前作成→ステータス更新方式）
      const allResults = this.researchPrompts.map((prompt, index) => {
        if (index < actualResumeStep) {
          // スキップした調査は「再開でスキップ」として記録
          return {
            id: prompt.id,
            title: prompt.title,
            prompt: prompt.prompt,
            result: '【再開処理でスキップされました】\n\nこの調査は前回の実行で完了済みとして扱われました。',
            timestamp: new Date(),
            status: 'skipped' as const
          };
        } else {
          // 実際に実行した調査
          const actualIndex = index - actualResumeStep;
          const result = researchResults[actualIndex];
          return {
            id: result.id,
            title: result.title,
            prompt: prompt.prompt,
            result: result.result,
            timestamp: new Date(),
            status: 'completed' as const
          };
        }
      });

      const result: IntegratedResearchResult = {
        businessName: request.businessName,
        serviceHypothesis: request.serviceHypothesis,
        researchResults: allResults,
        summary: integratedReport,
        notionPageId: notionResult.pageId,
        notionUrl: notionResult.url,
        completedAt: completedAt
      };

      console.log(`[ResearchService] 市場調査完了（事前作成→ステータス更新方式）: ${request.businessName}, 実行時間: ${duration}秒`);
      return result;

    } catch (error) {
      console.error('[ResearchService] 市場調査エラー:', error);
      
      onProgress({
        type: 'error',
        step: actualResumeStep,
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

    // 必須項目チェック（6項目）
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

    // 任意項目はバリデーションしない（空文字列でもOK）
    // revenueModel, pricingDirection, uvp, initialKpi, acquisitionChannels, 
    // regulatoryTechPrereqs, costStructure

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

  /**
   * タイムアウト制御付きで関数を実行
   * @param fn 実行する関数
   * @param timeoutMs タイムアウト時間（ミリ秒）
   * @param description 処理の説明
   * @returns 実行結果
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    description: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // タイムアウトタイマーを設定
      const timeoutTimer = setTimeout(() => {
        reject(new Error(`${description} がタイムアウトしました (${timeoutMs}ms)`));
      }, timeoutMs);

      // 実際の処理を実行
      fn()
        .then((result) => {
          clearTimeout(timeoutTimer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutTimer);
          reject(error);
        });
    });
  }

  /**
   * フォールバック結果を生成
   * @param title 調査タイトル
   * @param error エラー情報
   * @returns フォールバック結果
   */
  private generateFallbackResult(title: string, error: unknown): string {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // 調査タイトルに基づいた基本的なフレームワークを提供
    const fallbackFrameworks: { [key: string]: string } = {
      '市場規模と成長性の調査': `
【エラー発生により基本フレームワークを提供】

## 市場規模調査の基本アプローチ
1. **TAM（Total Addressable Market）**: 理論上の最大市場規模
2. **SAM（Serviceable Addressable Market）**: 実際にサービス提供可能な市場
3. **SOM（Serviceable Obtainable Market）**: 現実的に獲得可能な市場

## 推奨調査手法
- 業界レポート（IDC、Gartner等）の活用
- 政府統計データの分析
- 競合企業の売上・規模データ収集
- 専門調査会社データの購入検討

**エラー詳細**: ${errorMessage}
`,
      'PESTEL分析の調査': `
【エラー発生により基本フレームワークを提供】

## PESTEL分析フレームワーク
- **P (Political)**: 政治・政策動向
- **E (Economic)**: 経済環境・景気動向  
- **S (Social)**: 社会・文化的変化
- **T (Technology)**: 技術革新・デジタル化
- **E (Environmental)**: 環境・持続可能性
- **L (Legal)**: 法規制・コンプライアンス

## 推奨調査手法
- 政府白書・政策文書の確認
- 業界団体レポートの分析
- ニュース・専門メディアの情報収集

**エラー詳細**: ${errorMessage}
`,
      '競合の製品特徴・戦略分析': `
【エラー発生により基本フレームワークを提供】

## 競合分析の基本観点
1. **製品・サービス特徴**: 機能、品質、差別化要素
2. **価格戦略**: 価格帯、課金モデル、割引戦略
3. **マーケティング**: チャネル、メッセージ、ターゲット
4. **顧客基盤**: 顧客数、満足度、ロイヤルティ

## 推奨調査手法
- 競合企業の公式サイト・資料分析
- 顧客レビュー・評価の調査
- SNS・メディア露出の分析
- 業界カンファレンス・展示会での情報収集

**エラー詳細**: ${errorMessage}
`
    };

    // タイトルから適切なフレームワークを選択
    const matchedFramework = Object.keys(fallbackFrameworks).find(key => title.includes(key.split('・')[0]));
    
    if (matchedFramework) {
      return fallbackFrameworks[matchedFramework];
    }

    // デフォルトのフォールバック
    return `
【調査エラーが発生しました】

**調査項目**: ${title}
**エラー詳細**: ${errorMessage}

## 代替調査アプローチの提案

1. **一次情報収集**
   - 業界専門家へのインタビュー
   - 顧客・見込み客へのアンケート調査
   - 競合企業の公開情報収集

2. **二次情報活用**
   - 業界レポート・白書の活用
   - 学術論文・研究資料の参照
   - 政府統計・公的データの分析

3. **フィールド調査**
   - 店舗・サービス現場の観察
   - 展示会・イベントでの情報収集
   - オンライン・SNS上の口コミ分析

## 推奨次期アクション
- 調査手法の見直し
- 複数の情報源からのクロスチェック
- 専門コンサルタントへの相談検討

**注意**: このフォールバック情報は一般的なフレームワークです。具体的な業界・事業特性を考慮した詳細調査が必要です。
`;
  }
}
