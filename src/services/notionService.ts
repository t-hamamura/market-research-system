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

      // ページプロパティの設定
      const properties: any = {
        'タイトル': {
          title: [
            {
              text: {
                content: businessName
              }
            }
          ]
        }
      };

      // 作成日時とステータスは任意のプロパティとして追加（存在する場合のみ）
      try {
        properties['作成日時'] = {
          date: {
            start: new Date().toISOString()
          }
        };
      } catch (e) {
        // 作成日時プロパティが存在しない場合はスキップ
      }
      
      try {
        properties['作成日時'] = {
          date: {
            start: new Date().toISOString()
          }
        };
      } catch (e) {
        console.log('[NotionService] 作成日時プロパティをスキップ:', e);
      }

      // ステータスプロパティの設定（デバッグ情報付き）
      try {
        properties['ステータス'] = {
          select: {
            name: '完了'
          }
        };
        console.log('[NotionService] ステータスプロパティ設定完了');
      } catch (e) {
        console.log('[NotionService] ステータスプロパティをスキップ:', e);
      }

      // サービス仮説セクションのブロック
      const hypothesisBlocks = this.createServiceHypothesisBlocks(serviceHypothesis);
      
      // 統合レポートセクションのブロック
      const integratedReportBlocks = this.createIntegratedReportBlocks(integratedReport);
      
      // 個別調査結果セクションのブロック
      const researchResultsBlocks = this.createResearchResultsBlocks(researchResults);

      // 全ブロックを結合
      const children = [
        // ヘッダー
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
        },
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
        },
        {
          object: 'block',
          type: 'divider',
          divider: {}
        },
        ...hypothesisBlocks,
        {
          object: 'block',
          type: 'divider',
          divider: {}
        },
        ...integratedReportBlocks,
        {
          object: 'block',
          type: 'divider',
          divider: {}
        },
        ...researchResultsBlocks
      ];

      // デバッグ情報を出力
      console.log('[NotionService] プロパティ設定:', JSON.stringify(properties, null, 2));
      console.log('[NotionService] データベースID:', this.config.databaseId);

      // Notionページを作成
      const response = await this.notion.pages.create({
        parent: {
          database_id: this.config.databaseId
        },
        properties,
        children
      });

      const pageId = response.id;
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
   * サービス仮説セクションのブロックを作成
   * @param hypothesis サービス仮説
   * @returns Notionブロック配列
   */
  private createServiceHypothesisBlocks(hypothesis: ServiceHypothesis): any[] {
    return [
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
      },
      this.createPropertyBlock('💡 コンセプト', hypothesis.concept),
      this.createPropertyBlock('❗ 解決したい顧客課題', hypothesis.customerProblem),
      this.createPropertyBlock('🏢 狙っている業種・業界', hypothesis.targetIndustry),
      this.createPropertyBlock('👥 想定される利用者層', hypothesis.targetUsers),
      this.createPropertyBlock('⚔️ 直接競合・間接競合', hypothesis.competitors),
      this.createPropertyBlock('💰 課金モデル', hypothesis.revenueModel),
      this.createPropertyBlock('💴 価格帯・価格設定の方向性', hypothesis.pricingDirection)
    ];
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
      }
    ];

    // マークダウンテキストをNotionブロックに変換
    const reportBlocks = this.convertMarkdownToBlocks(report);
    blocks.push(...reportBlocks);

    return blocks;
  }

  /**
   * 個別調査結果セクションのブロックを作成
   * @param results 調査結果配列
   * @returns Notionブロック配列
   */
  private createResearchResultsBlocks(results: Array<{ id: number; title: string; result: string }>): any[] {
    const blocks = [
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
      }
    ];

    results.forEach((result, index) => {
      blocks.push(
        {
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `${index + 1}. ${result.title}`
                }
              }
            ]
          }
        }
      );

      // 調査結果をブロックに変換
      const resultBlocks = this.convertMarkdownToBlocks(result.result);
      blocks.push(...resultBlocks);
    });

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
    };
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
      };
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
      };
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
    };
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
    };
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
    };
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
    };
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
    };
  }

  /**
   * Notion API接続テスト
   * @returns 接続成功かどうか
   */
  async testConnection(): Promise<boolean> {
    try {
      // データベース情報を取得してテスト
      const response = await this.notion.databases.retrieve({
        database_id: this.config.databaseId
      });
      
      console.log('[NotionService] 接続テスト成功');
      return true;
      
    } catch (error) {
      console.error('[NotionService] 接続テストエラー:', error);
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
