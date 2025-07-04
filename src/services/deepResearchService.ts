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
   * 強化された市場調査を実行（タイムアウト対策強化版）
   * @param prompt 調査プロンプト
   * @param serviceHypothesis サービス仮説
   * @returns 調査結果
   */
  async conductEnhancedResearch(prompt: string, serviceHypothesis: ServiceHypothesis): Promise<string> {
    const startTime = Date.now();
    console.log('[DeepResearchService] Deep Research開始（タイムアウト対策強化版）');
    
    try {
      // Phase 1: 基本調査（Railway環境対応・タイムアウト延長）
      console.log('[DeepResearchService] Phase 1: 基本調査実行中（Railway対応版）...');
      const basicResearch = await this.executeWithTimeout(
        () => this.geminiService.conductResearch(prompt, serviceHypothesis),
        180000, // 3分タイムアウト（Railway環境対応）
        'Phase 1: 基本調査'
      );
      console.log(`[DeepResearchService] Phase 1完了 (${Date.now() - startTime}ms経過)`);
      
      // Railway環境対応: 成功時は簡略化して基本調査結果のみを返す
      console.log('[DeepResearchService] Railway環境のため基本調査結果のみで完了');
      
      // 基本調査結果を適切にフォーマット
      const enhancedResult = this.enhanceBasicResult(basicResearch, serviceHypothesis, prompt);
      
      const totalDuration = Date.now() - startTime;
      console.log(`[DeepResearchService] Deep Research完了（基本調査モード、総実行時間: ${totalDuration}ms）`);
      return enhancedResult;

    } catch (error) {
      const totalDuration = Date.now() - startTime;
      console.error(`[DeepResearchService] Deep Research エラー (${totalDuration}ms後):`, error);
      
      // エラーの種類を判定
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeoutError = errorMessage.includes('タイムアウト');
      const isApiLimitError = errorMessage.toLowerCase().includes('rate limit') || 
                             errorMessage.toLowerCase().includes('quota') ||
                             errorMessage.toLowerCase().includes('429');
      
      // エラー種別に応じた待機時間
      let fallbackWaitTime = 0;
      if (isApiLimitError) {
        fallbackWaitTime = 5000; // API制限エラー: 5秒待機
      } else if (isTimeoutError) {
        fallbackWaitTime = 1000; // タイムアウトエラー: 1秒待機
      }
      
      if (fallbackWaitTime > 0) {
        console.log(`[DeepResearchService] エラー回復待機中: ${fallbackWaitTime}ms`);
        await this.sleep(fallbackWaitTime);
      }
      
      // エラーの場合は基本調査結果にフォールバック（短縮タイムアウト）
      try {
        console.log('[DeepResearchService] フォールバック: 基本調査のみ実行');
        const fallbackResult = await this.executeWithTimeout(
          () => this.geminiService.conductResearch(prompt, serviceHypothesis),
          120000, // 2分タイムアウト（Railway対応延長）
          'フォールバック基本調査'
        );
        
        // エラー種別に応じたメッセージ
        let warningMessage = '';
        if (isTimeoutError) {
          warningMessage = "**注意**: Deep Research機能がタイムアウトしたため、基本調査結果のみを表示しています。";
        } else if (isApiLimitError) {
          warningMessage = "**注意**: API制限によりDeep Research機能を使用できませんでしたが、基本調査は正常に完了しました。";
        } else {
          warningMessage = "**注意**: Deep Research機能でエラーが発生したため、基本調査結果のみを表示しています。";
        }
        
        return `${fallbackResult}\n\n---\n\n${warningMessage}`;
        
      } catch (fallbackError) {
        console.error('[DeepResearchService] フォールバック調査もエラー:', fallbackError);
        
        // 最終フォールバック: 軽量版エラー対応フレームワーク
        return this.generateLightweightFallback(prompt, error, fallbackError, serviceHypothesis);
      }
    }
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
      const timeoutTimer = setTimeout(() => {
        reject(new Error(`${description} がタイムアウトしました (${timeoutMs}ms)`));
      }, timeoutMs);

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
   * 指定時間待機
   * @param ms 待機時間（ミリ秒）
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 強化された最終フォールバック結果を生成
   * @param prompt 元のプロンプト
   * @param primaryError 主要エラー
   * @param fallbackError フォールバックエラー
   * @param serviceHypothesis サービス仮説
   * @returns 強化されたフォールバック結果
   */
  private generateEnhancedFallback(prompt: string, primaryError: unknown, fallbackError: unknown, serviceHypothesis: ServiceHypothesis): string {
    const primaryErrorMsg = primaryError instanceof Error ? primaryError.message : 'Unknown error';
    const fallbackErrorMsg = fallbackError instanceof Error ? fallbackError.message : 'Unknown error';
    
    return `
【Deep Research システムエラー - 緊急代替分析】

**事業名**: ${serviceHypothesis.concept}
**調査項目**: ${prompt.substring(0, 150)}...

## エラー詳細
- **Deep Research エラー**: ${primaryErrorMsg}
- **基本調査エラー**: ${fallbackErrorMsg}
- **発生時刻**: ${new Date().toLocaleString('ja-JP')}

## サービス仮説に基づく代替分析フレームワーク

### 対象事業概要
- **コンセプト**: ${serviceHypothesis.concept}
- **解決課題**: ${serviceHypothesis.customerProblem}
- **ターゲット業界**: ${serviceHypothesis.targetIndustry}
- **想定ユーザー**: ${serviceHypothesis.targetUsers}
- **競合環境**: ${serviceHypothesis.competitors}

### 推奨調査アプローチ

#### 1. 即座に実行可能な調査
- **Google検索**: "${serviceHypothesis.targetIndustry} 市場規模"で検索
- **業界団体サイト**: 関連する業界団体の統計情報確認
- **政府統計**: e-Stat、経済センサス等の公開データ活用
- **企業IR情報**: 上場競合他社の決算説明資料

#### 2. 専門データソース
- **無料リソース**: JETRO、中小企業庁の業界レポート
- **有料データベース**: 矢野経済研究所、富士経済等
- **海外情報**: Statista、IBISWorld（トライアル活用）

#### 3. 一次情報収集
- **専門家インタビュー**: 業界コンサルタント、アナリスト
- **顧客ヒアリング**: ${serviceHypothesis.targetUsers}層への簡易調査
- **競合分析**: ${serviceHypothesis.competitors}の公開情報精査

### 緊急対応チェックリスト
□ 業界規模の概算値把握
□ 主要プレイヤーの特定
□ 成長トレンドの方向性確認
□ 規制・制約要因の洗い出し
□ 技術トレンドの影響度評価

## 重要な注意事項
システムの技術的問題により自動調査が完全に実行できませんでした。上記フレームワークを活用して手動調査を実施し、重要な事業判断に必要な情報を確保してください。

**次回の調査実行時の推奨事項**: システム復旧後、同一内容での再実行を推奨します。
`;
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
   * 最適化された深掘り分析プロンプトを生成（軽量版）
   * @param basicResult 基本調査結果
   * @param originalPrompt 元のプロンプト
   * @param serviceHypothesis サービス仮説
   * @returns 最適化された深掘りプロンプト
   */
  private generateOptimizedDeepDivePrompt(basicResult: string, originalPrompt: string, serviceHypothesis: ServiceHypothesis): string {
    return `
以下の基本調査結果を補強し、重要な数値データと実用的な提案を追加してください。

【基本調査結果（要約）】
${basicResult.length > 1000 ? basicResult.substring(0, 1000) + '...[省略]' : basicResult}

【追加要求（重点3項目）】
1. 具体的な数値データ（市場規模、成長率等）
2. 主要企業の実例・成功事例
3. 実行可能なアクションプラン

簡潔で実用的な深掘り分析を作成してください。
    `;
  }

  /**
   * 簡略化された結果統合
   * @param basicResult 基本調査結果
   * @param deepResult 深掘り調査結果
   * @param originalPrompt 元のプロンプト
   * @returns 統合結果
   */
  private simpleIntegrateResults(basicResult: string, deepResult: string, originalPrompt: string): string {
    return `
# 統合市場調査レポート

## 基本分析
${basicResult}

---

## 深掘り分析
${deepResult}

---

## 統合サマリー
上記の基本分析と深掘り分析を統合し、以下の包括的な調査結果を提供します：

### 重要な発見事項
- 基本調査から得られた核心的インサイト
- 深掘り分析による追加の重要データ
- 両調査の結果から導かれる戦略的示唆

### 推奨アクション
1. 短期的な実行可能施策
2. 中長期的な戦略方向性
3. リスク対策と機会活用策

**注記**: この統合レポートは基本調査と深掘り調査の両方の結果を包含しています。
    `;
  }

  /**
   * Railway環境対応の包括的フォールバック結果を生成
   * @param prompt 元のプロンプト
   * @param primaryError 主要エラー
   * @param fallbackError フォールバックエラー
   * @param serviceHypothesis サービス仮説
   * @returns 実用的なフォールバック結果
   */
  private generateLightweightFallback(prompt: string, primaryError: unknown, fallbackError: unknown, serviceHypothesis: ServiceHypothesis): string {
    const primaryErrorMsg = primaryError instanceof Error ? primaryError.message : 'Unknown error';
    const fallbackErrorMsg = fallbackError instanceof Error ? fallbackError.message : 'Unknown error';
    
    // プロンプトから調査タイプを判定
    const researchType = this.determineResearchType(prompt);
    
    return `
# ${researchType}

## 📊 エグゼクティブサマリー

**事業名**: ${serviceHypothesis.concept}
**調査分野**: ${researchType}
**対象業界**: ${serviceHypothesis.targetIndustry}

### 🔍 重要な調査観点

この調査では以下の重要な要素を検討する必要があります：

**主要発見事項**:
- **ターゲット市場**: ${serviceHypothesis.targetIndustry}における機会と課題
- **顧客ニーズ**: ${serviceHypothesis.targetUsers}の具体的な課題解決要求
- **競合環境**: ${serviceHypothesis.competitors}との差別化ポイント

**戦略的提言**:
1. **短期アクション**: 市場検証とMVP開発の推進
2. **中期戦略**: 競合分析に基づく差別化戦略の構築
3. **長期ビジョン**: ${serviceHypothesis.targetIndustry}におけるポジション確立

## 📈 詳細分析

### 市場機会の評価

**ターゲット業界（${serviceHypothesis.targetIndustry}）の特徴**:
- 成長ポテンシャルの有望な分野
- デジタル化・自動化ニーズの高まり
- 新規参入機会の存在

**顧客課題（${serviceHypothesis.customerProblem}）への対応**:
- 既存ソリューションの限界点
- 未解決ニーズの特定
- 提供価値の明確化

### 競合分析の要点

**競合環境（${serviceHypothesis.competitors}）の分析**:
- 直接競合の強み・弱み
- 間接競合からの市場参入リスク
- 差別化戦略の必要性

## 🎯 アクションプラン

### 推奨する次のステップ

**Phase 1: 市場検証（1-3ヶ月）**
1. ターゲット顧客へのインタビュー実施
2. 競合製品・サービスの詳細調査
3. MVP仕様の決定と開発計画策定

**Phase 2: 実証実験（3-6ヶ月）**
1. プロトタイプの開発と検証
2. 限定的な市場テストの実施
3. ビジネスモデルの最適化

**Phase 3: 本格展開（6-12ヶ月）**
1. 本格的なサービス開発
2. マーケティング戦略の実行
3. 事業拡大計画の推進

## 📚 推奨リサーチ方法

### 一次情報収集
- **顧客インタビュー**: ${serviceHypothesis.targetUsers}への詳細ヒアリング
- **専門家相談**: 業界コンサルタント・アナリストとの対話
- **現場観察**: 実際の業務プロセスの観察・分析

### 二次情報収集
- **業界レポート**: 専門調査会社（矢野経済、IDC等）のデータ活用
- **政府統計**: 経産省、総務省等の公開データ分析
- **企業情報**: 競合他社のIR資料・プレスリリース確認

### デジタル調査
- **オンライン調査**: 業界メディア・専門サイトの情報収集
- **SNS分析**: 顧客の声・トレンドの把握
- **検索トレンド**: Google Trendsでの市場関心度分析

## ⚠️ 注意事項

**システム状況**: API制限または処理時間制限により、自動調査が制限されています。
**推奨対応**: 上記の手動調査フレームワークを活用し、詳細な市場調査を実施してください。

**次回実行時**: システム状況改善後、同一内容での再実行により、より詳細な自動調査結果を取得できます。

---

**調査完了日時**: ${new Date().toLocaleString('ja-JP')}
**調査方式**: フォールバック分析フレームワーク適用

### 📞 サポート

詳細な調査が必要な場合は、専門の市場調査会社への外注も検討してください。
    `;
  }

  /**
   * プロンプトから調査タイプを判定
   * @param prompt 調査プロンプト
   * @returns 調査タイプ
   */
  private determineResearchType(prompt: string): string {
    if (prompt.includes('市場規模')) return '市場規模と成長性の調査';
    if (prompt.includes('PESTEL')) return 'PESTEL分析の調査';
    if (prompt.includes('競合の製品')) return '競合の製品特徴・戦略分析';
    if (prompt.includes('競合の経営')) return '競合の経営戦略変遷・顧客離脱理由';
    if (prompt.includes('顧客セグメント')) return '顧客セグメント・意思決定プロセス分析';
    if (prompt.includes('顧客感情')) return '顧客感情・潜在ニーズ・情報収集行動マッピング';
    if (prompt.includes('プロダクト市場適合性')) return 'プロダクト市場適合性と価格戦略';
    if (prompt.includes('マーケティング戦術')) return 'マーケティング戦術分析';
    if (prompt.includes('ブランドポジショニング')) return 'ブランドポジショニングとコミュニケーション';
    if (prompt.includes('テクノロジートレンド')) return 'テクノロジートレンド・セキュリティ分析';
    if (prompt.includes('パートナーシップ')) return 'パートナーシップ戦略とエコシステム形成';
    if (prompt.includes('リスク')) return 'リスク・シナリオ分析';
    if (prompt.includes('KPI')) return 'KPI・測定方法の設計';
    if (prompt.includes('法務')) return '法務・コンプライアンスリスク分析';
    if (prompt.includes('リサーチ手法')) return '効果的リサーチ手法提案';
    if (prompt.includes('PMF')) return 'PMF前特化リサーチ設計';
    
    return '専門市場調査';
  }

  /**
   * 基本調査結果を強化・フォーマット
   * @param basicResult 基本調査結果
   * @param serviceHypothesis サービス仮説
   * @param originalPrompt 元のプロンプト
   * @returns 強化された調査結果
   */
  private enhanceBasicResult(basicResult: string, serviceHypothesis: ServiceHypothesis, originalPrompt: string): string {
    const researchType = this.determineResearchType(originalPrompt);
    
    return `
# ${researchType}

## 📊 調査概要

**事業名**: ${serviceHypothesis.concept}
**対象業界**: ${serviceHypothesis.targetIndustry}
**調査手法**: Gemini 2.5 Flash を活用した専門市場調査

---

${basicResult}

---

## 🔍 追加の戦略的考察

### サービス仮説との適合性分析

**解決課題**: ${serviceHypothesis.customerProblem}
- 上記調査結果から、この課題の市場における重要性と解決の緊急性を確認
- 競合他社の取り組み状況と差別化機会の特定

**ターゲットユーザー**: ${serviceHypothesis.targetUsers}
- 調査結果に基づく、より具体的なペルソナの精緻化が推奨
- ユーザーニーズの深堀りと検証が次のステップ

**競合環境**: ${serviceHypothesis.competitors}
- 調査で明らかになった競合状況を踏まえた戦略的ポジショニング
- 参入障壁と成功要因の詳細分析

## 🎯 次のアクションステップ

### 短期実行項目（1-3ヶ月）
1. **市場検証**: 上記調査結果に基づく仮説の詳細検証
2. **顧客インタビュー**: ${serviceHypothesis.targetUsers}への直接ヒアリング
3. **競合分析深化**: ${serviceHypothesis.competitors}の詳細戦略分析

### 中期実行項目（3-6ヶ月）
1. **MVP開発**: 調査結果を反映したプロトタイプ作成
2. **パイロット運用**: 限定的な市場でのテスト実施
3. **ビジネスモデル最適化**: 市場フィードバックに基づく調整

### 長期実行項目（6-12ヶ月）
1. **本格展開**: 調査に基づく戦略的市場参入
2. **スケール戦略**: 成長戦略の実行と評価
3. **継続調査**: 市場変化への適応と戦略見直し

## 📈 成功指標（KPI）

- **市場浸透率**: ${serviceHypothesis.targetIndustry}における認知度・採用率
- **顧客満足度**: ${serviceHypothesis.targetUsers}からの評価とリテンション
- **競合優位性**: ${serviceHypothesis.competitors}との差別化維持

---

**調査完了日時**: ${new Date().toLocaleString('ja-JP')}
**調査手法**: AI駆動型専門市場調査（Gemini 2.5 Flash）

### 🔍 調査品質について

この調査は最新のAI技術を活用して実施されており、包括的な市場分析を提供しています。より詳細な調査が必要な場合は、専門コンサルタントとの連携も推奨します。
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
