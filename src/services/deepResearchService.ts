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
      
      // Phase 1: 基本調査（リトライ機能付き）
      console.log('[DeepResearchService] Phase 1: 基本調査実行中...');
      const basicResearch = await this.geminiService.conductResearch(prompt, serviceHypothesis);
      
      // API制限対策: フェーズ間で少し待機
      await this.sleep(2000);
      
      // Phase 2: 深掘り分析プロンプトを生成
      console.log('[DeepResearchService] Phase 2: 深掘り分析プロンプト生成中...');
      const deepDivePrompt = this.generateDeepDivePrompt(basicResearch, prompt, serviceHypothesis);
      
      // API制限対策: さらに待機
      await this.sleep(2000);
      
      // Phase 3: 深掘り調査実行（リトライ機能付き）
      console.log('[DeepResearchService] Phase 3: 深掘り調査実行中...');
      const deepResearch = await this.geminiService.conductResearch(deepDivePrompt, serviceHypothesis);
      
      // API制限対策: 統合前に待機
      await this.sleep(2000);
      
      // Phase 4: 結果を統合（エラー処理強化）
      console.log('[DeepResearchService] Phase 4: 結果統合中...');
      const integratedResult = await this.integrateResults(basicResearch, deepResearch, prompt);
      
      console.log('[DeepResearchService] Deep Research完了');
      return integratedResult;

    } catch (error) {
      console.error('[DeepResearchService] Deep Research エラー:', error);
      
      // エラーの場合は基本調査結果にフォールバック
      try {
        console.log('[DeepResearchService] フォールバック: 基本調査のみ実行');
        const fallbackResult = await this.geminiService.conductResearch(prompt, serviceHypothesis);
        
        // フォールバック結果であることを明記
        return `【Deep Research エラーのため基本調査結果のみ】\n\n${fallbackResult}\n\n---\n**注意**: Deep Research機能でエラーが発生したため、基本調査結果のみを表示しています。より詳細な分析が必要な場合は、手動での追加調査をお勧めします。`;
        
      } catch (fallbackError) {
        console.error('[DeepResearchService] フォールバック調査もエラー:', fallbackError);
        
        // 最終フォールバック: エラー情報と調査フレームワークを提供
        return this.generateDeepResearchFallback(prompt, error, fallbackError);
      }
    }
  }

  /**
   * 指定時間待機
   * @param ms 待機時間（ミリ秒）
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Deep Research の最終フォールバック結果を生成
   * @param prompt 元のプロンプト
   * @param primaryError 主要エラー
   * @param fallbackError フォールバックエラー
   * @returns フォールバック結果
   */
  private generateDeepResearchFallback(prompt: string, primaryError: unknown, fallbackError: unknown): string {
    const primaryErrorMsg = primaryError instanceof Error ? primaryError.message : 'Unknown error';
    const fallbackErrorMsg = fallbackError instanceof Error ? fallbackError.message : 'Unknown error';
    
    return `
【Deep Research システムエラー】

**調査プロンプト**: ${prompt.substring(0, 100)}...
**Deep Research エラー**: ${primaryErrorMsg}
**基本調査エラー**: ${fallbackErrorMsg}

## 手動調査アプローチの提案

### 1. 情報収集方法
- **オンライン調査**: Google Scholar、業界メディア、企業IR資料
- **専門データベース**: Statista、IBISWorld、Euromonitor
- **政府・公的機関**: 総務省統計、経産省データ、業界団体資料

### 2. 分析フレームワーク
- **定量分析**: 市場規模、成長率、シェア分析
- **定性分析**: トレンド、顧客ニーズ、競合戦略
- **SWOT分析**: 強み・弱み・機会・脅威の整理

### 3. 検証方法
- **一次調査**: 顧客インタビュー、アンケート調査
- **専門家意見**: 業界コンサルタント、アナリストへの相談
- **パイロット調査**: 小規模テスト、MVP検証

## 緊急対応案
1. 類似企業の公開情報から推定値を算出
2. 業界レポートから関連データを抽出
3. 専門調査会社への外注検討

**重要**: システムエラーのため自動調査が実行できませんでした。上記フレームワークを参考に手動での調査実行をお勧めします。
`;
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
        competitors: "統合処理"
        // 任意項目は未設定
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
        competitors: "テスト競合"
        // 任意項目は未設定
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
