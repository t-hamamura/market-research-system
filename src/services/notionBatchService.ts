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
      
      const response = await this.notion.databases.query({
        database_id: this.config.databaseId,
        filter: {
          and: [
            {
              property: '事業名',
              title: {
                contains: businessName
              }
            },
            {
              property: '調査種別',
              select: {
                equals: this.categorizeResearchType(researchTitle)
              }
            }
          ]
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
      
      // プロパティを設定
      const properties: any = {};

      // 事業名プロパティ
      const titleProperty = this.findTitleProperty(databaseInfo);
      if (titleProperty) {
        properties[titleProperty] = {
          title: [
            {
              type: 'text',
              text: {
                content: businessName
              }
            }
          ]
        };
      }

      // ステータスプロパティの設定（pending = 未着手）
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
        }
      }

      // 調査種別プロパティの設定
      const researchTypeProperty = this.findResearchTypeProperty(databaseInfo);
      if (researchTypeProperty) {
        properties[researchTypeProperty] = {
          select: {
            name: this.categorizeResearchType(researchTitle)
          }
        };
      }

      // 最小限の初期コンテンツ（問題のあるテンプレート文字列なし）
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
    // 調査IDベースの分類
    if (researchTitle.includes('市場規模')) return '1.市場規模と成長性';
    if (researchTitle.includes('顧客セグメント')) return '2.顧客セグメント・意思決定分析';
    if (researchTitle.includes('競合製品')) return '3.競合製品・戦略分析';
    if (researchTitle.includes('競合経営')) return '4.競合経営戦略・離脱分析';
    if (researchTitle.includes('技術動向')) return '5.技術動向・差別化要因';
    if (researchTitle.includes('顧客感情')) return '6.顧客感情・潜在ニーズ分析';
    if (researchTitle.includes('プロダクト市場適合性')) return '7.プロダクト市場適合性・価格戦略';
    if (researchTitle.includes('マーケティング戦術')) return '8.マーケティング戦術分析';
    if (researchTitle.includes('流通チャネル')) return '9.流通チャネル・販売戦略';
    if (researchTitle.includes('ブランドポジショニング')) return '10.ブランドポジショニング';
    if (researchTitle.includes('テクノロジー')) return '11.テクノロジー・セキュリティ分析';
    if (researchTitle.includes('パートナーシップ')) return '12.パートナーシップ戦略';
    if (researchTitle.includes('リスク')) return '13.リスク・シナリオ分析';
    if (researchTitle.includes('KPI')) return '14.KPI・測定方法設計';
    if (researchTitle.includes('法務')) return '15.法務・コンプライアンス分析';
    if (researchTitle.includes('効果的リサーチ')) return '16.効果的リサーチ手法提案';
    if (researchTitle.includes('PMF')) return '17.PMF前特化リサーチ設計';
    
    // 統合調査レポート
    if (researchTitle.includes('統合') || researchTitle.includes('総合')) return '統合調査レポート';
    
    // デフォルト（番号ベース）
    const match = researchTitle.match(/^(\d+)\./);
    if (match) {
      const num = parseInt(match[1]);
      if (num >= 1 && num <= 17) {
        return `${num}.${researchTitle.replace(/^\d+\./, '').trim()}`;
      }
    }
    
    return '個別調査項目';
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