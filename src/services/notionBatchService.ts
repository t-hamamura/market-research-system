import { Client } from '@notionhq/client';
import { NotionConfig, ServiceHypothesis } from '../types/index.js';

/**
 * Notion一括作成専用サービス
 * 重複したnotionService.tsの問題を回避するため、必要な関数を分離
 */
export class NotionBatchService {
  private notion: Client;
  private config: NotionConfig;

  constructor(config: NotionConfig) {
    this.notion = new Client({ auth: config.token });
    this.config = config;
  }

  /**
   * 16種類の調査項目を一括事前作成（重複防止機能付き）
   * @param businessName 事業名
   * @param researchPrompts 調査プロンプト配列
   * @returns 作成されたページ情報の配列
   */
  async batchCreateResearchPages(
    businessName: string,
    researchPrompts: Array<{ id: number; title: string; prompt: string }>
  ): Promise<Array<{ pageId: string; url: string; researchId: number; title: string }>> {
    const createdPages: Array<{ pageId: string; url: string; researchId: number; title: string }> = [];
    const failedPages: Array<{ researchId: number; title: string; error: string }> = [];
    
    console.log(`[NotionBatchService] 調査項目一括事前作成開始: ${businessName}, ${researchPrompts.length}項目`);
    
    for (const prompt of researchPrompts) {
      try {
        console.log(`[NotionBatchService] 調査項目事前作成中: ${prompt.id}. ${prompt.title}`);
        
        // 既存ページの検索（重複防止）
        const existingPage = await this.findExistingResearchPage(businessName, prompt.title);
        if (existingPage) {
          console.log(`[NotionBatchService] 既存ページを発見（再利用）: ${prompt.title} - ${existingPage.url}`);
          createdPages.push({
            pageId: existingPage.pageId,
            url: existingPage.url,
            researchId: prompt.id,
            title: prompt.title
          });
          continue;
        }
        
        // 新規ページを作成
        const pageInfo = await this.createIndividualResearchPage(
          businessName,
          prompt.title,
          prompt.id
        );
        
        createdPages.push({
          pageId: pageInfo.pageId,
          url: pageInfo.url,
          researchId: prompt.id,
          title: prompt.title
        });
        
        console.log(`[NotionBatchService] 調査項目作成完了: ${prompt.id}. ${prompt.title} - ${pageInfo.url}`);
        
        // レート制限対策（作成間隔を空ける）
        await this.sleep(300);
        
      } catch (error) {
        console.error(`[NotionBatchService] 調査項目作成エラー: ${prompt.id}. ${prompt.title}`, error);
        
        // より詳細なエラー情報を出力
        if (error instanceof Error) {
          console.error(`[NotionBatchService] エラーメッセージ: ${error.message}`);
          console.error(`[NotionBatchService] スタックトレース: ${error.stack}`);
        }
        
        // Notion APIの特定エラーを詳細解析
        if (error && typeof error === 'object' && 'code' in error) {
          const errorCode = (error as any).code;
          console.error(`[NotionBatchService] Notion APIエラーコード: ${errorCode}`);
          
          switch (errorCode) {
            case 'unauthorized':
              console.error('[NotionBatchService] 認証エラー: Notion Tokenが無効または期限切れです');
              break;
            case 'forbidden':
              console.error('[NotionBatchService] 権限エラー: Integrationがデータベースにアクセスできません');
              break;
            case 'object_not_found':
              console.error('[NotionBatchService] オブジェクト未発見: Database IDが間違っているか、アクセス権限がありません');
              break;
            case 'rate_limited':
              console.error('[NotionBatchService] レート制限: API呼び出し制限に達しました');
              break;
            case 'validation_error':
              console.error('[NotionBatchService] バリデーションエラー: ページプロパティまたはコンテンツに問題があります');
              break;
            default:
              console.error(`[NotionBatchService] その他のAPIエラー: ${errorCode}`);
          }
        }
        
        failedPages.push({
          researchId: prompt.id,
          title: prompt.title,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // エラーが発生しても処理を継続
        continue;
      }
    }
    
    // 結果サマリー
    console.log(`[NotionBatchService] 調査項目一括作成完了: 成功${createdPages.length}件, 失敗${failedPages.length}件`);
    
    if (failedPages.length > 0) {
      console.warn('[NotionBatchService] 作成に失敗した調査項目:', failedPages);
    }
    
    if (createdPages.length === 0) {
      throw new Error(`すべての調査項目作成に失敗しました。失敗詳細: ${JSON.stringify(failedPages)}`);
    }
    
    return createdPages;
  }

  /**
   * 既存の調査ページを検索（重複防止用）
   * @param businessName 事業名
   * @param researchTitle 調査タイトル
   * @returns 既存ページのID、URLまたはnull
   */
  async findExistingResearchPage(
    businessName: string, 
    researchTitle: string
  ): Promise<{ pageId: string; url: string } | null> {
    try {
      console.log(`[NotionBatchService] 既存ページ検索: ${businessName} - ${researchTitle}`);
      
      // データベース構造を動的に確認
      const databaseInfo = await this.getDatabaseProperties();
      const titleProperty = this.findTitleProperty(databaseInfo);
      const researchTypeProperty = this.findResearchTypeProperty(databaseInfo);
      
      if (!titleProperty) {
        console.warn('[NotionBatchService] タイトルプロパティが見つかりません');
        return null;
      }
      
      // フィルター条件を動的に構築
      const filters: any[] = [
        {
          property: titleProperty,
          title: {
            contains: businessName
          }
        }
      ];
      
      // 調査種別プロパティがある場合のみ追加
      if (researchTypeProperty) {
        filters.push({
          property: researchTypeProperty,
          select: {
            equals: this.categorizeResearchType(researchTitle)
          }
        });
      }
      
      console.log(`[NotionBatchService] 検索フィルター:`, JSON.stringify(filters, null, 2));
      
      const response = await this.notion.databases.query({
        database_id: this.config.databaseId,
        filter: {
          and: filters
        }
      });

      if (response.results.length > 0) {
        const existingPage = response.results[0];
        const pageId = existingPage.id;
        const url = this.generatePageUrl(pageId);
        
        console.log(`[NotionBatchService] 既存ページ発見: ${researchTitle} - ${url}`);
        return { pageId, url };
      }

      console.log(`[NotionBatchService] 既存ページ未発見: ${researchTitle}`);
      return null;

    } catch (error) {
      console.error(`[NotionBatchService] 既存ページ検索エラー: ${businessName} - ${researchTitle}`, error);
      return null;
    }
  }

  /**
   * 個別調査ページを事前作成
   * @param businessName 事業名
   * @param researchTitle 調査タイトル
   * @param researchIndex 調査番号（1-16）
   * @returns ページID、URLと調査情報
   */
  async createIndividualResearchPage(
    businessName: string,
    researchTitle: string,
    researchIndex: number
  ): Promise<{ pageId: string; url: string }> {
    try {
      console.log(`[NotionBatchService] 個別調査ページ事前作成: ${researchIndex}. ${researchTitle}`);
      
      // データベース構造を確認
      const databaseInfo = await this.getDatabaseProperties();
      
      // プロパティを構築（事業名と調査種別を入れ替え）
      const properties: any = {
        // タイトルプロパティ: 調査種別をタイトルとして使用
        [this.findTitleProperty(databaseInfo)]: {
          title: [
            {
              text: {
                content: researchTitle
              }
            }
          ]
        }
      };

      // 事業名をセレクトプロパティとして追加
      const businessNameProperty = this.findBusinessNameProperty(databaseInfo);
      if (businessNameProperty) {
        properties[businessNameProperty] = {
          select: {
            name: businessName
          }
        };
      } else {
        console.warn('[NotionBatchService] 事業名プロパティが見つかりません');
      }

      // 調査種別（従来通り、調査内容の分類用）
      const researchTypeProperty = this.findResearchTypeProperty(databaseInfo);
      if (researchTypeProperty) {
        const category = this.categorizeResearchType(researchTitle);
        properties[researchTypeProperty] = {
          select: {
            name: category
          }
        };
      }

      // 作成日プロパティの追加
      const createdDateProperty = this.findCreatedDateProperty(databaseInfo);
      if (createdDateProperty) {
        properties[createdDateProperty] = {
          date: {
            start: new Date().toISOString().split('T')[0] // YYYY-MM-DD形式
          }
        };
        console.log(`[NotionBatchService] 作成日プロパティ設定: ${createdDateProperty}`);
      } else {
        // 作成日プロパティが存在しない場合の警告
        console.warn('[NotionBatchService] 作成日プロパティが見つかりません。利用可能なプロパティ:', Object.keys(databaseInfo));
      }

      // ステータスプロパティ（改良版：動的オプション検索）
      const statusProperty = this.findStatusProperty(databaseInfo);
      if (statusProperty) {
        const statusProp = databaseInfo[statusProperty];
        const statusOptions = statusProp?.type === 'select' ? statusProp.select?.options : 
                             statusProp?.type === 'status' ? statusProp.status?.options : [];
        const pendingOption = this.findPendingOption(statusOptions || []);
        
        if (pendingOption) {
          if (statusProp?.type === 'select') {
            properties[statusProperty] = {
              select: {
                name: pendingOption.name
              }
            };
          } else if (statusProp?.type === 'status') {
            properties[statusProperty] = {
              status: {
                name: pendingOption.name
              }
            };
          }
        } else {
          // デフォルトのステータス設定
          properties[statusProperty] = {
            status: {
              name: 'pending'
            }
          };
        }
      }

      // 最小限の初期コンテンツ
      const pageContent = [
        {
          object: 'block',
          type: 'heading_1',
          heading_1: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `${researchIndex}. ${researchTitle}`
                }
              }
            ]
          }
        } as any,
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `事業名: ${businessName}`
                }
              }
            ]
          }
        } as any,
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `作成日時: ${new Date().toLocaleString('ja-JP')}`
                }
              }
            ]
          }
        } as any,
        {
          object: 'block',
          type: 'divider',
          divider: {}
        } as any
      ];

      // ページを作成
      const response = await this.notion.pages.create({
        parent: {
          database_id: this.config.databaseId
        },
        properties,
        children: pageContent
      });

      const pageId = response.id;
      const url = this.generatePageUrl(pageId);
      
      console.log(`[NotionBatchService] 個別調査ページ事前作成完了: ${researchIndex}. ${researchTitle} - ${url}`);
      
      return { pageId, url };

    } catch (error) {
      console.error(`[NotionBatchService] 個別調査ページ事前作成エラー: ${researchIndex}. ${researchTitle}`, error);
      throw new Error(`個別調査ページ事前作成エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ===== プライベートヘルパー関数 =====

  /**
   * データベースプロパティを取得
   */
  private async getDatabaseProperties(): Promise<any> {
    try {
      const database = await this.notion.databases.retrieve({
        database_id: this.config.databaseId
      });
      return database.properties;
    } catch (error) {
      console.error('[NotionBatchService] データベース情報取得エラー:', error);
      throw error;
    }
  }

  /**
   * タイトルプロパティを検索
   */
  private findTitleProperty(properties: any): string | null {
    const titlePropertyNames = ['事業名', 'タイトル', 'Title', 'Name', '名前'];
    
    for (const [key, prop] of Object.entries(properties)) {
      if ((prop as any).type === 'title' || titlePropertyNames.includes(key)) {
        return key;
      }
    }
    
    return Object.keys(properties)[0] || null;
  }

  /**
   * ステータスプロパティを検索
   */
  private findStatusProperty(properties: any): string | null {
    const statusPropertyNames = ['ステータス', 'Status', '状態', '進行状況'];
    
    for (const [key, prop] of Object.entries(properties)) {
      if ((prop as any).type === 'select' || (prop as any).type === 'status') {
        if (statusPropertyNames.includes(key)) {
          return key;
        }
      }
    }
    
    return null;
  }

  /**
   * 調査種別プロパティを検索
   */
  private findResearchTypeProperty(properties: any): string | null {
    const researchTypePropertyNames = ['調査種別', 'Research Type', '種別', 'Type'];
    
    for (const [key, prop] of Object.entries(properties)) {
      if ((prop as any).type === 'select') {
        if (researchTypePropertyNames.includes(key)) {
          return key;
        }
      }
    }
    
    return null;
  }

  /**
   * 事業名プロパティを検索
   */
  private findBusinessNameProperty(properties: any): string | null {
    const businessNamePropertyNames = ['事業名', 'Business Name', '企業名', 'Company', 'Project'];
    
    for (const [key, prop] of Object.entries(properties)) {
      if ((prop as any).type === 'select') {
        if (businessNamePropertyNames.includes(key)) {
          return key;
        }
      }
    }
    
    return null;
  }

  /**
   * 作成日プロパティを検索
   */
  private findCreatedDateProperty(properties: any): string | null {
    const createdDatePropertyNames = ['作成日', 'Created Date', '作成日時', 'Created Time'];
    
    for (const [key, prop] of Object.entries(properties)) {
      if ((prop as any).type === 'date') {
        if (createdDatePropertyNames.includes(key)) {
          return key;
        }
      }
    }
    
    return null;
  }

  /**
   * 未着手オプションを検索
   */
  private findPendingOption(options: any[]): any | null {
    const pendingNames = ['未着手', 'Pending', 'Not Started', '開始前'];
    
    for (const option of options) {
      if (pendingNames.includes(option.name)) {
        return option;
      }
    }
    
    return options[0] || null;
  }

  /**
   * 調査タイトルから調査種別を分類
   * @param researchTitle 調査タイトル
   * @returns 調査種別名
   */
  private categorizeResearchType(researchTitle: string): string {
    console.log(`[NotionBatchService] 調査種別分類: "${researchTitle}"`);
    
    // 番号ベースの分類（最優先）
    const match = researchTitle.match(/^(\d+)\./);
    if (match) {
      const num = parseInt(match[1]);
      const categoryMap: { [key: number]: string } = {
        1: '1.市場規模と成長性',
        2: '2.PESTEL分析',
        3: '3.競合製品・戦略分析',
        4: '4.競合経営戦略・離脱分析',
        5: '5.顧客セグメント・意思決定分析',
        6: '6.顧客感情・潜在ニーズ分析',
        7: '7.プロダクト市場適合性・価格戦略',
        8: '8.マーケティング戦術分析',
        9: '9.ブランドポジショニング',
        10: '10.テクノロジー・セキュリティ分析',
        11: '11.パートナーシップ戦略',
        12: '12.リスク・シナリオ分析',
        13: '13.KPI・測定方法設計',
        14: '14.法務・コンプライアンス分析',
        15: '15.効果的リサーチ手法提案',
        16: '16.PMF前特化リサーチ設計'
      };
      
      if (categoryMap[num]) {
        console.log(`[NotionBatchService] 番号ベース分類成功: ${num} -> ${categoryMap[num]}`);
        return categoryMap[num];
      }
    }
    
    // キーワードベースの分類（フォールバック・強化版）
    const keywordMap: { [key: string]: string } = {
      '市場規模': '1.市場規模と成長性',
      '成長性': '1.市場規模と成長性',
      'PESTEL': '2.PESTEL分析', 
      '競合製品': '3.競合製品・戦略分析',
      '競合の製品': '3.競合製品・戦略分析',
      '競合経営': '4.競合経営戦略・離脱分析',
      '競合の経営': '4.競合経営戦略・離脱分析',
      '離脱': '4.競合経営戦略・離脱分析',
      '顧客セグメント': '5.顧客セグメント・意思決定分析',
      '意思決定': '5.顧客セグメント・意思決定分析',
      '顧客感情': '6.顧客感情・潜在ニーズ分析',
      '潜在ニーズ': '6.顧客感情・潜在ニーズ分析',
      'プロダクト市場適合性': '7.プロダクト市場適合性・価格戦略',
      '価格戦略': '7.プロダクト市場適合性・価格戦略',
      'マーケティング戦術': '8.マーケティング戦術分析',
      'ブランドポジショニング': '9.ブランドポジショニング',
      'テクノロジー': '10.テクノロジー・セキュリティ分析',
      'セキュリティ': '10.テクノロジー・セキュリティ分析',
      'パートナーシップ': '11.パートナーシップ戦略',
      'リスク': '12.リスク・シナリオ分析',
      'シナリオ': '12.リスク・シナリオ分析',
      'KPI': '13.KPI・測定方法設計',
      '測定方法': '13.KPI・測定方法設計',
      // 🔥 法務・コンプライアンス関連のキーワードを強化
      '法務': '14.法務・コンプライアンス分析',
      'コンプライアンス': '14.法務・コンプライアンス分析',
      '法的': '14.法務・コンプライアンス分析',
      '規制': '14.法務・コンプライアンス分析',
      'リーガル': '14.法務・コンプライアンス分析',
      '法律': '14.法務・コンプライアンス分析',
      'リスク分析': '14.法務・コンプライアンス分析',
      'リサーチ手法': '15.効果的リサーチ手法提案',
      'PMF': '16.PMF前特化リサーチ設計'
    };
    
    for (const [keyword, category] of Object.entries(keywordMap)) {
      if (researchTitle.includes(keyword)) {
        console.log(`[NotionBatchService] キーワードベース分類成功: "${keyword}" -> ${category}`);
        return category;
      }
    }
    
    // 統合調査レポートの判定
    if (researchTitle.includes('統合') || researchTitle.includes('総合')) {
      console.log(`[NotionBatchService] 統合レポート判定: ${researchTitle}`);
      return '統合調査レポート';
    }
    
    // どれにも該当しない場合のログ出力と適切なフォールバック
    console.warn(`[NotionBatchService] ⚠️ 調査種別の分類に失敗: "${researchTitle}"`);
    console.warn(`[NotionBatchService] 利用可能なキーワード: ${Object.keys(keywordMap).join(', ')}`);
    
    // 「個別調査項目」ではなく、より適切なフォールバックを提供
    return '統合調査レポート';
  }

  /**
   * NotionページURLを生成
   */
  private generatePageUrl(pageId: string): string {
    const cleanPageId = pageId.replace(/-/g, '');
    return `https://www.notion.so/${cleanPageId}`;
  }

  /**
   * 待機時間
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 