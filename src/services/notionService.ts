import { Client } from '@notionhq/client';
import { NotionConfig, ServiceHypothesis } from '../types';

/**
 * Notion API サービスクラス
 * 調査結果をNotionデータベースに保存
 */
export class NotionService {
  private notion: Client;
  private config: NotionConfig;

  constructor(config: NotionConfig) {
    this.config = config;
    this.notion = new Client({
      auth: config.token,
    });
  }

  /**
   * 統合調査結果をNotionページとして作成
   * @param businessName 事業名
   * @param serviceHypothesis サービス仮説
   * @param researchResults 個別調査結果
   * @param integratedReport 統合レポート
   * @returns NotionページのURL
   */
  async createResearchPage(
    businessName: string,
    serviceHypothesis: ServiceHypothesis,
    researchResults: Array<{ id: number; title: string; result: string }>,
    integratedReport: string
  ): Promise<{ pageId: string; url: string }> {
    try {
      console.log('[NotionService] Notionページ作成開始:', businessName);

      // ページプロパティの設定（実際のNotionデータベース構造に合わせて修正）
      const properties: any = {
        '事業名': {
          title: [
            {
              text: {
                content: businessName
              }
            }
          ]
        },
        'ステータス': {
          select: {
            name: '完了'
          }
        }
      };

      // 作成日時は自動設定されるプロパティのため、手動設定不要
      console.log('[NotionService] プロパティ設定: 事業名、ステータス');

      // 基本ページ構造のみで作成（ヘッダーのみ）
      const initialChildren = [
        {
          object: 'block',
          type: 'heading_1',
          heading_1: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `市場調査レポート：${businessName}`
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

      // デバッグ情報を出力
      console.log('[NotionService] プロパティ設定:', JSON.stringify(properties, null, 2));
      console.log('[NotionService] データベースID:', this.config.databaseId);

      // 基本Notionページを作成
      const response = await this.notion.pages.create({
        parent: {
          database_id: this.config.databaseId
        },
        properties,
        children: initialChildren
      });

      const pageId = response.id;
      console.log('[NotionService] 基本ページ作成完了:', pageId);

      // コンテンツを段階的に追加
      await this.addContentInBatches(pageId, serviceHypothesis, researchResults, integratedReport);

      // URLを手動で生成（APIレスポンスにURLがない場合）
      const url = this.generatePageUrl(pageId);

      console.log('[NotionService] Notionページ作成完了:', url);
      
      return { pageId, url };

    } catch (error) {
      console.error('[NotionService] Notionページ作成エラー:', error);
      
      // より詳細なエラー情報を出力
      if (error instanceof Error) {
        console.error('[NotionService] エラーメッセージ:', error.message);
        console.error('[NotionService] スタックトレース:', error.stack);
      }
      
      // Notion APIのエラーコードがある場合は出力
      if (error && typeof error === 'object' && 'code' in error) {
        console.error('[NotionService] Notion APIエラーコード:', (error as any).code);
      }
      
      throw new Error(`Notionページ作成エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * コンテンツを段階的に追加（413エラー対策）
   * @param pageId ページID
   * @param serviceHypothesis サービス仮説
   * @param researchResults 調査結果
   * @param integratedReport 統合レポート
   */
  private async addContentInBatches(
    pageId: string,
    serviceHypothesis: ServiceHypothesis,
    researchResults: Array<{ id: number; title: string; result: string }>,
    integratedReport: string
  ): Promise<void> {
    try {
      // バッチ1: サービス仮説セクション
      console.log('[NotionService] サービス仮説セクション追加中...');
      const hypothesisBlocks = this.createServiceHypothesisBlocks(serviceHypothesis);
      await this.appendBlocks(pageId, hypothesisBlocks);
      await this.sleep(500); // レート制限対策

      // バッチ2: 統合レポートセクション
      console.log('[NotionService] 統合レポートセクション追加中...');
      const integratedReportBlocks = this.createIntegratedReportBlocks(integratedReport);
      await this.appendBlocks(pageId, integratedReportBlocks);
      await this.sleep(500);

      // バッチ3: 個別調査結果セクション（分割して追加）
      console.log('[NotionService] 個別調査結果セクション追加中...');
      
      // セクションヘッダーを先に追加
      const sectionHeader = [
        {
          object: 'block',
          type: 'divider',
          divider: {}
        } as any,
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '🔍 個別調査結果'
                }
              }
            ]
          }
        } as any
      ];
      await this.appendBlocks(pageId, sectionHeader);
      await this.sleep(500);

      // 個別調査結果を3つずつに分けて追加
      const batchSize = 3;
      for (let i = 0; i < researchResults.length; i += batchSize) {
        const batch = researchResults.slice(i, i + batchSize);
        console.log(`[NotionService] 調査結果バッチ ${Math.floor(i/batchSize) + 1} 追加中...`);
        
        const batchBlocks: any[] = [];
        batch.forEach((result, index) => {
          const globalIndex = i + index;
          batchBlocks.push(
            {
              object: 'block',
              type: 'heading_3',
              heading_3: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: `${globalIndex + 1}. ${result.title}`
                    }
                  }
                ]
              }
            } as any
          );

          // 調査結果を短縮してブロックに変換
          const shortResult = this.truncateText(result.result, 3000);
          const resultBlocks = this.convertMarkdownToBlocks(shortResult);
          batchBlocks.push(...resultBlocks.slice(0, 5)); // 最大5ブロックまで
        });

        await this.appendBlocks(pageId, batchBlocks);
        await this.sleep(1000); // バッチ間隔を長めに
      }

      console.log('[NotionService] コンテンツ追加完了');

    } catch (error) {
      console.error('[NotionService] コンテンツ追加エラー:', error);
      throw error;
    }
  }

  /**
   * ページにブロックを追加
   * @param pageId ページID
   * @param blocks 追加するブロック
   */
  private async appendBlocks(pageId: string, blocks: any[]): Promise<void> {
    if (blocks.length === 0) return;

    try {
      await this.notion.blocks.children.append({
        block_id: pageId,
        children: blocks
      });
    } catch (error) {
      console.error('[NotionService] ブロック追加エラー:', error);
      
      // 413エラーの場合はさらに分割
      if (error && typeof error === 'object' && 'code' in error && (error as any).code === 413) {
        console.log('[NotionService] ブロック数を半分に分割して再試行...');
        const midpoint = Math.floor(blocks.length / 2);
        await this.appendBlocks(pageId, blocks.slice(0, midpoint));
        await this.sleep(500);
        await this.appendBlocks(pageId, blocks.slice(midpoint));
      } else {
        throw error;
      }
    }
  }

  /**
   * テキストを指定文字数で短縮
   * @param text 元のテキスト
   * @param maxLength 最大文字数
   * @returns 短縮されたテキスト
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '\n\n... (内容が長いため省略されました)';
  }

  /**
   * 待機関数
   * @param ms 待機時間（ミリ秒）
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * サービス仮説セクションのブロックを作成
   * @param hypothesis サービス仮説
   * @returns Notionブロック配列
   */
  private createServiceHypothesisBlocks(hypothesis: ServiceHypothesis): any[] {
    const blocks = [
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: '📋 サービス仮説'
              }
            }
          ]
        }
      } as any,
      this.createPropertyBlock('💡 コンセプト', hypothesis.concept),
      this.createPropertyBlock('❗ 解決したい顧客課題', hypothesis.customerProblem),
      this.createPropertyBlock('🏢 狙っている業種・業界', hypothesis.targetIndustry),
      this.createPropertyBlock('👥 想定される利用者層', hypothesis.targetUsers),
      this.createPropertyBlock('⚔️ 直接競合・間接競合', hypothesis.competitors),
      this.createPropertyBlock('💰 課金モデル', hypothesis.revenueModel),
      this.createPropertyBlock('💴 価格帯・価格設定の方向性', hypothesis.pricingDirection),
      this.createPropertyBlock('🎯 暫定UVP', hypothesis.uvp),
      this.createPropertyBlock('📊 初期KPI', hypothesis.initialKpi),
      this.createPropertyBlock('📈 獲得チャネル仮説', hypothesis.acquisitionChannels)
    ];

    // 任意項目を追加（値がある場合のみ）
    if (hypothesis.regulatoryTechPrereqs && hypothesis.regulatoryTechPrereqs.trim()) {
      blocks.push(this.createPropertyBlock('⚖️ 規制・技術前提', hypothesis.regulatoryTechPrereqs));
    }

    if (hypothesis.costStructure && hypothesis.costStructure.trim()) {
      blocks.push(this.createPropertyBlock('💸 想定コスト構造', hypothesis.costStructure));
    }

    return blocks;
  }

  /**
   * 統合レポートセクションのブロックを作成
   * @param report 統合レポート
   * @returns Notionブロック配列
   */
  private createIntegratedReportBlocks(report: string): any[] {
    const blocks = [
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: '📊 統合レポート'
              }
            }
          ]
        }
      } as any
    ];

    // マークダウンテキストをNotionブロックに変換
    const reportBlocks = this.convertMarkdownToBlocks(report);
    blocks.push(...reportBlocks);

    return blocks;
  }

  /**
   * プロパティブロックを作成
   * @param label ラベル
   * @param content 内容
   * @returns Notionブロック
   */
  private createPropertyBlock(label: string, content: string): any {
    return {
      object: 'block',
      type: 'callout',
      callout: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: `${label}\n${content}`
            }
          }
        ],
        icon: {
          emoji: '📝'
        }
      }
    } as any;
  }

  /**
   * マークダウンテキストをNotionブロックに変換
   * @param markdown マークダウンテキスト
   * @returns Notionブロック配列
   */
  private convertMarkdownToBlocks(markdown: string): any[] {
    const blocks: any[] = [];
    const lines = markdown.split('\n');
    let currentParagraph = '';

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine === '') {
        // 空行の場合、現在の段落をブロックに追加
        if (currentParagraph.trim()) {
          blocks.push(this.createParagraphBlock(currentParagraph.trim()));
          currentParagraph = '';
        }
      } else if (trimmedLine.startsWith('# ')) {
        // H1見出し
        if (currentParagraph.trim()) {
          blocks.push(this.createParagraphBlock(currentParagraph.trim()));
          currentParagraph = '';
        }
        blocks.push(this.createHeading1Block(trimmedLine.substring(2)));
      } else if (trimmedLine.startsWith('## ')) {
        // H2見出し
        if (currentParagraph.trim()) {
          blocks.push(this.createParagraphBlock(currentParagraph.trim()));
          currentParagraph = '';
        }
        blocks.push(this.createHeading2Block(trimmedLine.substring(3)));
      } else if (trimmedLine.startsWith('### ')) {
        // H3見出し
        if (currentParagraph.trim()) {
          blocks.push(this.createParagraphBlock(currentParagraph.trim()));
          currentParagraph = '';
        }
        blocks.push(this.createHeading3Block(trimmedLine.substring(4)));
      } else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
        // リスト項目
        if (currentParagraph.trim()) {
          blocks.push(this.createParagraphBlock(currentParagraph.trim()));
          currentParagraph = '';
        }
        blocks.push(this.createBulletedListItemBlock(trimmedLine.substring(2)));
      } else if (/^\d+\.\s/.test(trimmedLine)) {
        // 番号付きリスト
        if (currentParagraph.trim()) {
          blocks.push(this.createParagraphBlock(currentParagraph.trim()));
          currentParagraph = '';
        }
        const content = trimmedLine.replace(/^\d+\.\s/, '');
        blocks.push(this.createNumberedListItemBlock(content));
      } else {
        // 通常のテキスト
        currentParagraph += (currentParagraph ? '\n' : '') + trimmedLine;
      }
    }

    // 最後の段落を追加
    if (currentParagraph.trim()) {
      blocks.push(this.createParagraphBlock(currentParagraph.trim()));
    }

    return blocks;
  }

  /**
   * 段落ブロックを作成
   * @param text テキスト
   * @returns Notionブロック
   */
  private createParagraphBlock(text: string): any {
    // テキストが長すぎる場合は分割
    const maxLength = 2000;
    if (text.length <= maxLength) {
      return {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: text
              }
            }
          ]
        }
      } as any;
    } else {
      // 長いテキストを分割
      return {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: text.substring(0, maxLength) + '...'
              }
            }
          ]
        }
      } as any;
    }
  }

  /**
   * H1見出しブロックを作成
   * @param text テキスト
   * @returns Notionブロック
   */
  private createHeading1Block(text: string): any {
    const content = text.substring(0, 100);
    return {
      object: 'block',
      type: 'heading_1',
      heading_1: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: content
            }
          }
        ]
      }
    } as any;
  }

  /**
   * H2見出しブロックを作成
   * @param text テキスト
   * @returns Notionブロック
   */
  private createHeading2Block(text: string): any {
    const content = text.substring(0, 100);
    return {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: content
            }
          }
        ]
      }
    } as any;
  }

  /**
   * H3見出しブロックを作成
   * @param text テキスト
   * @returns Notionブロック
   */
  private createHeading3Block(text: string): any {
    const content = text.substring(0, 100);
    return {
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: content
            }
          }
        ]
      }
    } as any;
  }

  /**
   * 箇条書きリストアイテムブロックを作成
   * @param text テキスト
   * @returns Notionブロック
   */
  private createBulletedListItemBlock(text: string): any {
    return {
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: text.substring(0, 2000)
            }
          }
        ]
      }
    } as any;
  }

  /**
   * 番号付きリストアイテムブロックを作成
   * @param text テキスト
   * @returns Notionブロック
   */
  private createNumberedListItemBlock(text: string): any {
    return {
      object: 'block',
      type: 'numbered_list_item',
      numbered_list_item: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: text.substring(0, 2000)
            }
          }
        ]
      }
    } as any;
  }

  /**
   * Notion API接続テスト
   * @returns 接続成功かどうか
   */
  async testConnection(): Promise<boolean> {
    try {
      // 設定値チェック
      if (!this.config.token || this.config.token === 'dummy-token') {
        console.error('[NotionService] Notion Tokenが設定されていません:', this.config.token);
        return false;
      }

      if (!this.config.databaseId || this.config.databaseId === 'dummy-id') {
        console.error('[NotionService] Database IDが設定されていません:', this.config.databaseId);
        return false;
      }

      if (!this.config.token.startsWith('ntn_')) {
        console.error('[NotionService] Notion Tokenの形式が正しくありません:', this.config.token.substring(0, 8) + '...');
        return false;
      }

      console.log('[NotionService] API接続テスト開始');
      console.log('[NotionService] Token:', this.config.token.substring(0, 8) + '...');
      console.log('[NotionService] Database ID:', this.config.databaseId.substring(0, 8) + '...');
      
      // データベース情報を取得してテスト
      const response = await this.notion.databases.retrieve({
        database_id: this.config.databaseId
      });
      
      console.log('[NotionService] 接続テスト成功, データベース取得OK');
      return true;
      
    } catch (error) {
      console.error('[NotionService] 接続テストエラー詳細:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        token: this.config.token ? this.config.token.substring(0, 8) + '...' : 'なし',
        databaseId: this.config.databaseId ? this.config.databaseId.substring(0, 8) + '...' : 'なし'
      });
      return false;
    }
  }

  /**
   * NotionページのURLを生成
   * @param pageId ページID
   * @returns NotionページURL
   */
  generatePageUrl(pageId: string): string {
    return `https://www.notion.so/${pageId.replace(/-/g, '')}`;
  }
}
