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

      // データベース構造を事前に確認（エラー回避）
      console.log('[NotionService] データベース構造の確認中...');
      const databaseInfo = await this.getDatabaseProperties();
      console.log('[NotionService] 利用可能なプロパティ:', Object.keys(databaseInfo));

      // ページプロパティの設定（動的に構造を確認して設定）
      const properties: any = {};

      // 事業名プロパティの設定（複数パターンに対応）
      const titleProperty = this.findTitleProperty(databaseInfo);
      if (titleProperty) {
        properties[titleProperty] = {
          title: [
            {
              text: {
                content: businessName,
              },
            },
          ],
        };
        console.log(`[NotionService] タイトルプロパティ設定: ${titleProperty}`);
      } else {
        console.warn('[NotionService] タイトルプロパティが見つかりません');
      }

      // ステータスプロパティの設定（複数パターンに対応）
      const statusProperty = this.findStatusProperty(databaseInfo);
      if (statusProperty) {
        const statusOptions = databaseInfo[statusProperty]?.select?.options || [];
        const completedOption = this.findCompletedOption(statusOptions);
        
        if (completedOption) {
          properties[statusProperty] = {
            select: {
              name: completedOption.name
            }
          };
          console.log(`[NotionService] ステータスプロパティ設定: ${statusProperty} = ${completedOption.name}`);
        } else {
          console.warn('[NotionService] 完了状態の選択肢が見つかりません:', statusOptions.map(o => o.name));
        }
      } else {
        console.warn('[NotionService] ステータスプロパティが見つかりません');
      }

      // 調査種別プロパティの設定（新規追加）
      const researchTypeProperty = this.findResearchTypeProperty(databaseInfo);
      if (researchTypeProperty) {
        properties[researchTypeProperty] = {
          select: {
            name: "統合調査レポート"
          }
        };
        console.log(`[NotionService] 調査種別プロパティ設定: ${researchTypeProperty} = 統合調査レポート`);
      } else {
        // 調査種別プロパティが存在しない場合は作成を試行
        console.log('[NotionService] 調査種別プロパティが存在しないため、後で個別レポートで設定します');
      }

      // 作成日時は自動設定されるプロパティのため、手動設定不要
      console.log('[NotionService] プロパティ設定: 事業名、ステータス、調査種別');

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
                  content: this.truncateTextForRichText(`市場調査統合レポート：${businessName}`)
                },
                annotations: {
                  bold: true,
                  color: "blue"
                }
              }
            ]
          }
        } as any,
        {
          object: 'block',
          type: 'callout',
          callout: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: this.truncateTextForRichText(`作成日時: ${new Date().toLocaleString('ja-JP')}`)
                }
              }
            ],
            icon: {
              emoji: '📊'
            },
            color: 'gray_background'
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
      const integratedReportBlocks = this.createBlocksFromMarkdown(integratedReport);
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

      for (const result of researchResults) {
        const resultBlocks = this.createBlocksFromMarkdown(result.result);
        const toggleBlock = this.createToggleBlock(result.title, resultBlocks);
        await this.appendBlocks(pageId, toggleBlock);
        await this.sleep(500);
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

    // Notion APIの制限: 100ブロック/リクエスト
    const maxBlocksPerRequest = 90; // 安全マージンを設けて90に設定
    
    if (blocks.length <= maxBlocksPerRequest) {
      try {
        await this.notion.blocks.children.append({
          block_id: pageId,
          children: blocks
        });
        console.log(`[NotionService] ブロック追加成功: ${blocks.length}ブロック`);
      } catch (error) {
        console.error('[NotionService] ブロック追加エラー:', error);
        
        // エラーメッセージをチェック
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isValidationError = errorMessage.includes('body failed validation') || 
                                 errorMessage.includes('children.length should be');
        
        if (isValidationError && blocks.length > 1) {
          console.log(`[NotionService] バリデーションエラー検出、ブロック数を削減して再試行: ${blocks.length} -> ${Math.floor(blocks.length / 2)}`);
          const midpoint = Math.floor(blocks.length / 2);
          await this.appendBlocks(pageId, blocks.slice(0, midpoint));
          await this.sleep(500);
          await this.appendBlocks(pageId, blocks.slice(midpoint));
        } else {
          throw error;
        }
      }
    } else {
      // 制限を超える場合は分割して送信
      console.log(`[NotionService] ブロック数が制限を超過 (${blocks.length}), ${maxBlocksPerRequest}ブロックずつに分割`);
      
      for (let i = 0; i < blocks.length; i += maxBlocksPerRequest) {
        const chunk = blocks.slice(i, i + maxBlocksPerRequest);
        console.log(`[NotionService] ブロックチャンク ${Math.floor(i/maxBlocksPerRequest) + 1}/${Math.ceil(blocks.length/maxBlocksPerRequest)} 送信中: ${chunk.length}ブロック`);
        
        await this.appendBlocks(pageId, chunk);
        
        // チャンク間の待機（レート制限対策）
        if (i + maxBlocksPerRequest < blocks.length) {
          await this.sleep(1000);
        }
      }
    }
  }

  /**
   * テキストを指定文字数で短縮（改善版）
   * @param text 元のテキスト
   * @param maxLength 最大文字数
   * @returns 短縮されたテキスト
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    
    console.log(`[NotionService] 汎用テキスト短縮: ${text.length}文字 -> ${maxLength}文字`);
    
    // より自然な位置で切り詰める（句読点や改行を探す）
    let cutPoint = maxLength - 30; // 安全マージンを縮小（50->30）
    
    // 句読点や改行で切る（検索範囲を拡大）
    const naturalBreaks = ['。', '！', '？', '\n', '.\n', '!\n', '?\n', '、', '；', ';'];
    for (const breakChar of naturalBreaks) {
      const lastBreak = text.lastIndexOf(breakChar, cutPoint);
      if (lastBreak > cutPoint - 300) { // 検索範囲を拡大（200->300）
        cutPoint = lastBreak + breakChar.length;
        break;
      }
    }
    
    const truncatedText = text.substring(0, cutPoint) + '\n\n... (続きはNotionページで確認)';
    console.log(`[NotionService] 短縮後: ${truncatedText.length}文字`);
    
    return truncatedText;
  }

  /**
   * テキストをNotion Rich Text用に安全に短縮
   * @param text 元のテキスト
   * @returns Rich Text用に短縮されたテキスト（最大1950文字）
   */
  private truncateTextSafely(text: string): string {
    const maxLength = 1950; // Notionの2000文字制限ギリギリまで使用（50文字マージン）
    if (text.length <= maxLength) {
      return text;
    }
    
    console.log(`[NotionService] テキスト長縮: ${text.length}文字 -> ${maxLength}文字`);
    
    // 自然な位置で切り詰める（より長い範囲を保持）
    let cutPoint = maxLength - 30; // マージンを短縮
    
    // 句読点や改行で切る（検索範囲を拡大）
    const naturalBreaks = ['。', '！', '？', '\n', '.\n', '!\n', '?\n', '、', '；', ';'];
    for (const breakChar of naturalBreaks) {
      const lastBreak = text.lastIndexOf(breakChar, cutPoint);
      if (lastBreak > cutPoint - 300) { // 検索範囲を拡大（200->300）
        cutPoint = lastBreak + breakChar.length;
        break;
      }
    }
    
    const truncatedText = text.substring(0, cutPoint) + '\n\n[一部省略 - 詳細はNotionページで確認]';
    console.log(`[NotionService] 短縮後の文字数: ${truncatedText.length}文字`);
    
    return truncatedText;
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
   * マークダウンテキストをNotionブロックに変換（JSON対応版）
   * @param markdownText Geminiから受け取ったMarkdown文字列またはJSON
   * @returns Notionブロック配列
   */
  private createBlocksFromMarkdown(markdownText: string): any[] {
    try {
      if (!markdownText || markdownText.trim().length === 0) {
        return [this.createParagraphBlock('AIからの応答が空でした。')];
      }

      console.log(`[NotionService] コンテンツ変換開始: ${markdownText.length}文字`);
      
      // JSONレスポンスの検出と処理
      const trimmedText = markdownText.trim();
      
      // JSON配列形式の検出（開始が[、終了が]）
      if (trimmedText.startsWith('[') && trimmedText.endsWith(']')) {
        console.log('[NotionService] JSON配列形式を検出、Notionブロックに変換中...');
        return this.convertJsonArrayToNotionBlocks(trimmedText);
      }
      
      // JSONオブジェクト形式の検出（開始が{、終了が}）
      if (trimmedText.startsWith('{') && trimmedText.endsWith('}')) {
        console.log('[NotionService] JSONオブジェクト形式を検出、Notionブロックに変換中...');
        try {
          const jsonObject = JSON.parse(trimmedText);
          return this.convertJsonObjectToNotionBlocks(jsonObject);
        } catch (parseError) {
          console.warn('[NotionService] JSONオブジェクトパースエラー、Markdownとして処理:', parseError);
        }
      }
      
      // ```json コードブロック形式の処理
      const jsonCodeBlockMatch = trimmedText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonCodeBlockMatch) {
        console.log('[NotionService] JSONコードブロック形式を検出');
        try {
          const jsonContent = jsonCodeBlockMatch[1].trim();
          if (jsonContent.startsWith('[')) {
            return this.convertJsonArrayToNotionBlocks(jsonContent);
          }
        } catch (parseError) {
          console.warn('[NotionService] JSONコードブロックパースエラー:', parseError);
        }
      }
      
      // 通常のMarkdown処理
      console.log('[NotionService] 通常のMarkdown形式として処理');
      return this.convertMarkdownToNotionBlocks(trimmedText);
      
    } catch (error) {
      console.error('[NotionService] コンテンツ変換エラー:', error);
      return [
        this.createParagraphBlock('⚠️ コンテンツの変換中にエラーが発生しました。'),
        this.createParagraphBlock(`元のテキスト: ${markdownText.substring(0, 500)}...`)
      ];
    }
  }

  /**
   * JSON配列をNotionブロックに変換
   * @param jsonString JSON配列文字列
   * @returns Notionブロック配列
   */
  private convertJsonArrayToNotionBlocks(jsonString: string): any[] {
    try {
      console.log('[NotionService] JSON配列パース開始');
      const jsonArray = JSON.parse(jsonString);
      
      if (!Array.isArray(jsonArray)) {
        console.warn('[NotionService] JSON配列ではありません、Markdownとして処理');
        return this.convertMarkdownToNotionBlocks(jsonString);
      }
      
      const notionBlocks: any[] = [];
      
      for (const item of jsonArray) {
        if (!item || typeof item !== 'object' || !item.type || !item.content) {
          console.warn('[NotionService] 無効なJSON項目をスキップ:', item);
          continue;
        }
        
        const block = this.convertJsonItemToNotionBlock(item);
        if (block) {
          notionBlocks.push(block);
        }
      }
      
      console.log(`[NotionService] JSON配列変換完了: ${notionBlocks.length}ブロック`);
      return notionBlocks.length > 0 ? notionBlocks : [
        this.createParagraphBlock('⚠️ 有効なコンテンツが見つかりませんでした。')
      ];
      
    } catch (error) {
      console.error('[NotionService] JSON配列パースエラー:', error);
      return [
        this.createParagraphBlock('⚠️ JSON形式の解析に失敗しました。'),
        this.createParagraphBlock(`元のJSON: ${jsonString.substring(0, 300)}...`)
      ];
    }
  }

  /**
   * JSON項目をNotionブロックに変換
   * @param item JSON項目
   * @returns Notionブロック
   */
  private convertJsonItemToNotionBlock(item: any): any | null {
    try {
      const { type, content, icon, children } = item;
      
      switch (type) {
        case 'heading_1':
          return {
            object: 'block',
            type: 'heading_1',
            heading_1: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: this.truncateTextForRichText(content)
                  }
                }
              ]
            }
          };
          
        case 'heading_2':
          return {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: this.truncateTextForRichText(content)
                  }
                }
              ]
            }
          };
          
        case 'heading_3':
          return {
            object: 'block',
            type: 'heading_3',
            heading_3: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: this.truncateTextForRichText(content)
                  }
                }
              ]
            }
          };
          
        case 'paragraph':
          return {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: this.parseTextToRichText(content)
            }
          };
          
        case 'bulleted_list_item':
          return {
            object: 'block',
            type: 'bulleted_list_item',
            bulleted_list_item: {
              rich_text: this.parseTextToRichText(content)
            }
          };
          
        case 'callout':
          return {
            object: 'block',
            type: 'callout',
            callout: {
              rich_text: this.parseTextToRichText(content),
              icon: icon ? { emoji: icon } : { emoji: '💡' },
              color: 'blue_background'
            }
          };
          
        case 'toggle':
          const toggleChildren = children ? 
            children.map((child: any) => this.convertJsonItemToNotionBlock(child)).filter(Boolean) : 
            [];
          return {
            object: 'block',
            type: 'toggle',
            toggle: {
              rich_text: this.parseTextToRichText(content),
              children: toggleChildren
            }
          };
          
        case 'divider':
          return {
            object: 'block',
            type: 'divider',
            divider: {}
          };
          
        default:
          console.warn(`[NotionService] 未対応のブロックタイプ: ${type}`);
          return {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: this.parseTextToRichText(content || `未対応タイプ: ${type}`)
            }
          };
      }
    } catch (error) {
      console.error('[NotionService] JSON項目変換エラー:', error);
      return null;
    }
  }

  /**
   * JSONオブジェクトをNotionブロックに変換
   * @param jsonObject JSONオブジェクト
   * @returns Notionブロック配列
   */
  private convertJsonObjectToNotionBlocks(jsonObject: any): any[] {
    console.log('[NotionService] JSONオブジェクト変換開始');
    
    const blocks: any[] = [];
    
    // オブジェクトのキーと値をNotionブロックに変換
    Object.entries(jsonObject).forEach(([key, value]) => {
      // キーを見出しとして追加
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: this.truncateTextForRichText(key)
              }
            }
          ]
        }
      });
      
      // 値をパラグラフとして追加
      const valueText = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: this.parseTextToRichText(valueText)
        }
      });
    });
    
    return blocks;
  }

  /**
   * 通常のMarkdownをNotionブロックに変換
   * @param markdownText Markdownテキスト
   * @returns Notionブロック配列
   */
  private convertMarkdownToNotionBlocks(markdownText: string): any[] {
    // 既存のMarkdown変換ロジックを使用
    const lines = markdownText.split('\n');
    const blocks: any[] = [];
    
    let currentListItems: any[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // 空行はスキップ
      if (trimmedLine.length === 0) {
        // リストが終了した場合の処理
        if (currentListItems.length > 0) {
          blocks.push(...currentListItems);
          currentListItems = [];
        }
        continue;
      }
      
      // H1 見出し (# )
      if (trimmedLine.startsWith('# ')) {
        // リスト終了処理
        if (currentListItems.length > 0) {
          blocks.push(...currentListItems);
          currentListItems = [];
        }
        blocks.push(this.createHeading1Block(trimmedLine.substring(2).trim()));
      }
      // H2 見出し (## )
      else if (trimmedLine.startsWith('## ')) {
        // リスト終了処理
        if (currentListItems.length > 0) {
          blocks.push(...currentListItems);
          currentListItems = [];
        }
        blocks.push(this.createHeading2Block(trimmedLine.substring(3).trim()));
      }
      // H3 見出し (### )
      else if (trimmedLine.startsWith('### ')) {
        // リスト終了処理
        if (currentListItems.length > 0) {
          blocks.push(...currentListItems);
          currentListItems = [];
        }
        blocks.push(this.createHeading3Block(trimmedLine.substring(4).trim()));
      }
      // 箇条書きリスト (- または * で始まる)
      else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
        const listContent = trimmedLine.substring(2).trim();
        currentListItems.push(this.createBulletedListItemBlock(listContent));
      }
      // 区切り線
      else if (trimmedLine === '---' || trimmedLine === '***') {
        // リスト終了処理
        if (currentListItems.length > 0) {
          blocks.push(...currentListItems);
          currentListItems = [];
        }
        blocks.push({
          object: 'block',
          type: 'divider',
          divider: {}
        });
      }
      // 通常のパラグラフ
      else {
        // リスト終了処理
        if (currentListItems.length > 0) {
          blocks.push(...currentListItems);
          currentListItems = [];
        }
        blocks.push(this.createParagraphBlock(trimmedLine));
      }
    }
    
    // 最後にリストが残っている場合の処理
    if (currentListItems.length > 0) {
      blocks.push(...currentListItems);
    }
    
    return blocks;
  }

  /**
   * 再帰的にブロックを生成
   * @param blocksContent ブロック定義の配列
   * @returns Notionブロック配列
   */
  private createBlocksRecursive(blocksContent: any[]): any[] {
    const notionBlocks: any[] = [];
    for (const block of blocksContent) {
      if (!block || !block.type) continue;
      
      let createdBlock: any | any[] = null;
      const content = block.content || '';

      switch (block.type) {
        case 'heading_2':
          createdBlock = this.createHeading2Block(content);
          break;
        case 'heading_3':
          createdBlock = this.createHeading3Block(content);
          break;
        case 'paragraph':
          createdBlock = this.createParagraphBlock(content);
          break;
        case 'bulleted_list_item':
          createdBlock = this.createBulletedListItemBlock(content);
          break;
        case 'toggle':
          const children = block.children && Array.isArray(block.children)
            ? this.createBlocksRecursive(block.children)
            : [];
          createdBlock = this.createToggleBlock(content, children);
          break;
        case 'callout':
          createdBlock = this.createCalloutBlock(content, '', block.icon || 'ℹ️');
          break;
        case 'divider':
          createdBlock = { object: 'block', type: 'divider', divider: {} };
          break;
        default:
          console.warn(`[NotionService] 未知のブロックタイプ: ${block.type}`);
          createdBlock = this.createParagraphBlock(`[未知のタイプ: ${block.type}] ${content}`);
      }
      
      if (createdBlock) {
        if (Array.isArray(createdBlock)) {
          notionBlocks.push(...createdBlock);
        } else {
          notionBlocks.push(createdBlock);
        }
      }
    }
    return notionBlocks;
  }
  
  /**
   * Geminiからの応答からJSON文字列をクリーンアップ
   * @param jsonString 
   * @returns 
   */
  private cleanupJsonString(jsonString: string): string {
    // 前後の```jsonと```を削除
    let cleaned = jsonString.trim().replace(/^```json\s*/, '').replace(/```$/, '').trim();
    // 時々含まれる不正なエスケープを修正
    cleaned = cleaned.replace(/\\"/g, '"').replace(/\\n/g, '\n');
    return cleaned;
  }

  /**
   * 行がJSON形式データかどうかを判定
   * @param line 判定する行
   * @returns JSON形式データの場合true
   */
  private isJsonData(line: string): boolean {
    // JSON形式の典型的なパターンを検出
    const jsonPatterns = [
      /^\s*\{\s*"type"\s*:\s*"[^"]+"\s*,/,  // {"type": "...
      /^\s*\[\s*\{\s*"type"\s*:\s*"[^"]+"/,  // [{"type": "...
      /^\s*"type"\s*:\s*"[^"]+"\s*,/,       // "type": "...
      /^\s*\{\s*"object"\s*:\s*"block"/,    // {"object": "block"
      /^\s*\],?\s*$/,                       // 配列終了
      /^\s*\},?\s*$/                        // オブジェクト終了
    ];

    return jsonPatterns.some(pattern => pattern.test(line));
  }

  /**
   * JSON形式データから有用なコンテンツを抽出
   * @param jsonLine JSON形式の行
   * @returns 抽出されたコンテンツまたはnull
   */
  private extractContentFromJson(jsonLine: string): string | null {
    try {
      // コンテンツフィールドを抽出するパターン
      const contentMatches = [
        /"content"\s*:\s*"([^"]+)"/,          // "content": "テキスト"
        /"text"\s*:\s*"([^"]+)"/,             // "text": "テキスト"  
        /"title"\s*:\s*"([^"]+)"/             // "title": "テキスト"
      ];

      for (const pattern of contentMatches) {
        const match = jsonLine.match(pattern);
        if (match && match[1]) {
          return match[1];
        }
      }

      // ブロックタイプに基づく処理
      const typeMatch = jsonLine.match(/"type"\s*:\s*"([^"]+)"/);
      if (typeMatch) {
        const blockType = typeMatch[1];
        const content = this.extractContentFromJson(jsonLine.replace(/"type"\s*:\s*"[^"]+"\s*,?/, ''));
        
        if (content) {
          switch (blockType) {
            case 'heading_1':
              return `# ${content}`;
            case 'heading_2':
              return `## ${content}`;
            case 'heading_3':
              return `### ${content}`;
            case 'bulleted_list_item':
              return `- ${content}`;
            case 'callout':
              return `💡 ${content}`;
            default:
              return content;
          }
        }
      }

      return null;
    } catch (error) {
      console.warn('[NotionService] JSON内容抽出エラー:', error);
      return null;
    }
  }

  /**
   * 段落ブロックを作成（文章装飾対応版）
   * @param text テキスト
   * @returns Notionブロック
   */
  private createParagraphBlock(text: string): any {
    // Notion Rich Text用に安全に短縮
    const truncatedText = this.truncateTextSafely(text);
    
    // マークダウン形式の装飾を解析してRichTextに変換
    const richText = this.parseTextToRichText(truncatedText);
    
    return {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: richText
      }
    } as any;
  }

  /**
   * テキストをRichText形式に変換（装飾対応強化版）
   * @param text プレーンテキスト
   * @returns RichText配列
   */
  private parseTextToRichText(text: string): any[] {
    const richTextArray: any[] = [];
    
    // 複数の装飾パターンを順次処理
    const parts = this.parseMarkdownFormatting(text);
    
    for (const part of parts) {
      if (part.content.length > 0) {
        // 各パートを安全な長さに分割
        const safeContent = this.truncateTextSafely(part.content);
        
        richTextArray.push({
          type: 'text',
          text: {
            content: safeContent
          },
          annotations: {
            ...part.annotations,
            color: 'default'  // 明示的に黒色を指定
          }
        });
      }
    }
    
    return richTextArray.length > 0 ? richTextArray : [{
      type: 'text',
      text: {
        content: '（空のテキストブロック）'
      },
      annotations: {
        color: 'default'
      }
    }];
  }

  /**
   * マークダウン形式の装飾を解析
   * @param text テキスト
   * @returns 装飾情報付きパート配列
   */
  private parseMarkdownFormatting(text: string): Array<{content: string, annotations: any}> {
    const parts: Array<{content: string, annotations: any}> = [];
    
    // まず**bold**を処理
    const boldParts = text.split(/(\*\*[^*]+?\*\*)/g);
    
    for (const boldPart of boldParts) {
      if (boldPart.startsWith('**') && boldPart.endsWith('**')) {
        // 太字部分
        parts.push({
          content: boldPart.slice(2, -2),
          annotations: { bold: true }
        });
      } else {
        // 通常テキスト（さらに他の装飾をチェック）
        const italicParts = boldPart.split(/(\*[^*]+?\*)/g);
        
        for (const italicPart of italicParts) {
          if (italicPart.startsWith('*') && italicPart.endsWith('*') && !italicPart.startsWith('**')) {
            // 斜体部分
            parts.push({
              content: italicPart.slice(1, -1),
              annotations: { italic: true }
            });
          } else {
            // 最終的に通常テキスト
            if (italicPart.length > 0) {
              parts.push({
                content: italicPart,
                annotations: {}
              });
            }
          }
        }
      }
    }
    
    return parts.filter(part => part.content.length > 0);
  }

  /**
   * H1見出しブロックを作成（装飾対応版）
   * @param text テキスト
   * @returns Notionブロック
   */
  private createHeading1Block(text: string): any {
    const content = this.truncateTextForRichText(text);
    return {
      object: 'block',
      type: 'heading_1',
      heading_1: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: content
            },
            annotations: {
              bold: true,
              color: 'default'
            }
          }
        ]
      }
    } as any;
  }

  /**
   * H2見出しブロックを作成（装飾対応版）
   * @param text テキスト
   * @returns Notionブロック
   */
  private createHeading2Block(text: string): any {
    const content = this.truncateTextForRichText(text);
    return {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: content
            },
            annotations: {
              bold: true,
              color: 'default'
            }
          }
        ]
      }
    } as any;
  }

  /**
   * H3見出しブロックを作成（装飾対応版）
   * @param text テキスト
   * @returns Notionブロック
   */
  private createHeading3Block(text: string): any {
    const content = this.truncateTextForRichText(text);
    return {
      object: 'block',
      type: 'heading_3',
      heading_3: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: content
            },
            annotations: {
              bold: true,
              color: 'default'
            }
          }
        ]
      }
    } as any;
  }

  /**
   * 箇条書きリストアイテムブロックを作成（装飾対応版）
   * @param text テキスト
   * @returns Notionブロック
   */
  private createBulletedListItemBlock(text: string): any {
    const richText = this.parseTextToRichText(this.truncateTextSafely(text));
    return {
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: richText
      }
    } as any;
  }

  /**
   * 数字付きリストアイテムブロックを作成
   * @param text テキスト
   * @returns Notionブロック
   */
  private createNumberedListItemBlock(text: string): any {
    const richText = this.parseTextToRichText(this.truncateTextSafely(text));
    return {
      object: 'block',
      type: 'numbered_list_item',
      numbered_list_item: {
        rich_text: richText
      }
    } as any;
  }

  /**
   * トグルブロックを作成（子要素の分割対応版）
   * @param text トグル見出し
   * @param children 子ブロック
   * @returns 
   */
  private createToggleBlock(text: string, children: any[]): any[] {
    const MAX_CHILDREN = 95; // 安全マージン
    const createdBlocks: any[] = [];
    const richText = this.parseTextToRichText(this.truncateTextSafely(text));

    if (children.length === 0) {
      return [{
        object: 'block',
        type: 'toggle',
        toggle: {
          rich_text: richText,
          children: [],
        },
      }];
    }
    
    for (let i = 0; i < children.length; i += MAX_CHILDREN) {
      const chunk = children.slice(i, i + MAX_CHILDREN);
      const toggleText = i === 0 
        ? richText 
        : this.parseTextToRichText(this.truncateTextSafely(`${text} (続き ${Math.floor(i / MAX_CHILDREN) + 1})`));
      
      createdBlocks.push({
        object: 'block',
        type: 'toggle',
        toggle: {
          rich_text: toggleText,
          children: chunk,
        },
      });
    }
  
    return createdBlocks;
  }

  /**
   * テキストをRich Text形式に短縮
   * @param text 元のテキスト
   * @returns Rich Text形式に短縮されたテキスト
   */
  private truncateTextForRichText(text: string): string {
    const maxLength = 100;
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '...';
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
   * 個別調査結果をNotionページとして作成
   * @param businessName 事業名
   * @param researchTitle 調査タイトル
   * @param researchResult 調査結果
   * @param researchIndex 調査番号
   * @returns NotionページのURL
   */
  async createIndividualResearchPage(
    businessName: string,
    researchTitle: string,
    researchResult: string,
    researchIndex: number
  ): Promise<{ pageId: string; url: string }> {
    try {
      console.log(`[NotionService] 個別調査ページ作成開始: ${researchTitle}`);

      // データベース構造を確認
      const databaseInfo = await this.getDatabaseProperties();
      const properties: any = {};

      // タイトルプロパティの設定
      const titleProperty = this.findTitleProperty(databaseInfo);
      if (titleProperty) {
        properties[titleProperty] = {
          title: [
            {
              text: {
                content: businessName,
              },
            },
          ],
        };
        console.log(`[NotionService] タイトルプロパティ設定: ${titleProperty}`);
      } else {
        console.warn('[NotionService] タイトルプロパティが見つかりません');
      }

      // ステータスプロパティの設定
      const statusProperty = this.findStatusProperty(databaseInfo);
      if (statusProperty) {
        const statusOptions = databaseInfo[statusProperty]?.select?.options || [];
        const completedOption = this.findCompletedOption(statusOptions);
        
        if (completedOption) {
          properties[statusProperty] = {
            select: {
              name: completedOption.name
            }
          };
        }
      }

      // 調査種別プロパティの設定（個別調査）
      const researchTypeProperty = this.findResearchTypeProperty(databaseInfo);
      if (researchTypeProperty) {
        // 調査タイトルから種別を推定
        const researchCategory = this.categorizeResearchType(researchTitle);
        properties[researchTypeProperty] = {
          select: {
            name: researchCategory
          }
        };
        console.log(`[NotionService] 個別調査種別設定: ${researchCategory}`);
      }

      // 個別調査ページコンテンツ
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

      // 基本ページを作成
      const response = await this.notion.pages.create({
        parent: {
          database_id: this.config.databaseId
        },
        properties,
        children: pageContent
      });

      const pageId = response.id;
      console.log(`[NotionService] 個別調査基本ページ作成完了: ${pageId}`);

      // 調査結果コンテンツを追加
      const resultBlocks = this.createBlocksFromMarkdown(researchResult);
      
      // 調査結果ヘッダーを追加
      const contentWithHeader = [
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '📋 調査結果'
                }
              }
            ]
          }
        } as any,
        ...resultBlocks
      ];

      await this.appendBlocks(pageId, contentWithHeader);

      const url = this.generatePageUrl(pageId);
      console.log(`[NotionService] 個別調査ページ作成完了: ${url}`);
      
      return { pageId, url };

    } catch (error) {
      console.error(`[NotionService] 個別調査ページ作成エラー (${researchTitle}):`, error);
      throw new Error(`個別調査ページ作成エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  /**
   * データベースのプロパティ構造を取得
   * @returns プロパティ情報のオブジェクト
   */
  private async getDatabaseProperties(): Promise<Record<string, any>> {
    try {
      const response = await this.notion.databases.retrieve({
        database_id: this.config.databaseId
      });
      
      return response.properties || {};
    } catch (error) {
      console.error('[NotionService] データベースプロパティ取得エラー:', error);
      return {};
    }
  }

  /**
   * タイトルプロパティを見つける
   * @param properties プロパティ情報
   * @returns タイトルプロパティ名またはnull
   */
  private findTitleProperty(properties: Record<string, any>): string | null {
    // 複数のパターンをチェック
    const titleCandidates = ['事業名', 'Name', 'Title', '名前', 'タイトル'];
    
    for (const candidate of titleCandidates) {
      if (properties[candidate] && properties[candidate].type === 'title') {
        return candidate;
      }
    }
    
    // title型のプロパティを探す
    for (const [propName, propInfo] of Object.entries(properties)) {
      if (propInfo && (propInfo as any).type === 'title') {
        return propName;
      }
    }
    
    return null;
  }

  /**
   * ステータスプロパティを見つける
   * @param properties プロパティ情報
   * @returns ステータスプロパティ名またはnull
   */
  private findStatusProperty(properties: Record<string, any>): string | null {
    // デバッグ用：利用可能なプロパティを詳細表示
    console.log('[NotionService] データベースプロパティ検索開始');
    console.log('[NotionService] 利用可能なプロパティ:');
    Object.keys(properties).forEach(key => {
      const prop = properties[key];
      console.log(`  - プロパティ名: "${key}" | タイプ: ${prop.type}`);
      if (prop.type === 'select' && prop.select?.options) {
        console.log(`    └─ 選択肢: [${prop.select.options.map((o: any) => `"${o.name}"`).join(', ')}]`);
      }
    });
    
    // 複数のパターンをチェック（日本語と英語の拡張パターン）
    const statusCandidates = [
      'ステータス', 'Status', 'status', 'STATUS',
      '状態', 'State', 'state', 'STATE',
      '進行状況', 'Progress', 'progress', 'PROGRESS',
      '完了状況', 'Completion', 'completion', 'COMPLETION',
      '状況', 'Condition', 'condition', 'CONDITION',
      'ステイタス', 'ステータス（Status）'
    ];
    
    // 完全一致チェック（select & status対応）
    for (const candidate of statusCandidates) {
      const prop = properties[candidate];
      if (prop && (prop.type === 'select' || prop.type === 'status')) {
        console.log(`[NotionService] ✅ ステータスプロパティ発見（完全一致）: "${candidate}" (タイプ: ${prop.type})`);
        
        // selectとstatusで選択肢の取得方法が異なる
        const options = prop.type === 'select' ? prop.select?.options : prop.status?.options;
        console.log(`[NotionService] 選択肢: [${options?.map((o: any) => `"${o.name}"`).join(', ') || 'なし'}]`);
        return candidate;
      }
    }
    
    // 部分一致チェック（大文字小文字を無視、select & status対応）
    const propertyKeys = Object.keys(properties);
    for (const key of propertyKeys) {
      const prop = properties[key];
      if (prop.type === 'select' || prop.type === 'status') {
        const lowerKey = key.toLowerCase();
        
        // ステータス関連キーワードを含むかチェック
        const statusKeywords = ['ステータス', 'status', '状態', 'state', '進行', 'progress'];
        const containsStatusKeyword = statusKeywords.some(keyword => 
          lowerKey.includes(keyword.toLowerCase())
        );
        
        if (containsStatusKeyword) {
          console.log(`[NotionService] ✅ ステータスプロパティ発見（部分一致）: "${key}" (タイプ: ${prop.type})`);
          
          // selectとstatusで選択肢の取得方法が異なる
          const options = prop.type === 'select' ? prop.select?.options : prop.status?.options;
          console.log(`[NotionService] 選択肢: [${options?.map((o: any) => `"${o.name}"`).join(', ') || 'なし'}]`);
          return key;
        }
      }
    }
    
    // セレクト・ステータスプロパティで「未着手」「進行中」「完了」を含むものを検索
    for (const key of propertyKeys) {
      const prop = properties[key];
      const options = prop.type === 'select' ? prop.select?.options : 
                     prop.type === 'status' ? prop.status?.options : null;
      
      if ((prop.type === 'select' || prop.type === 'status') && options) {
        const optionNames = options.map((o: any) => o.name.toLowerCase());
        
        // 典型的なステータス値を含むかチェック
        const hasStatusValues = (
          optionNames.some(name => name.includes('未着手') || name.includes('pending') || name.includes('todo')) &&
          optionNames.some(name => name.includes('進行') || name.includes('progress') || name.includes('working')) &&
          optionNames.some(name => name.includes('完了') || name.includes('done') || name.includes('completed'))
        );
        
        if (hasStatusValues) {
          console.log(`[NotionService] ✅ ステータスプロパティ発見（値パターン一致）: "${key}" (タイプ: ${prop.type})`);
          console.log(`[NotionService] 選択肢: [${options.map((o: any) => `"${o.name}"`).join(', ')}]`);
          return key;
        }
      }
    }
    
    // どうしても見つからない場合、最初のselect/statusプロパティを使用
    for (const key of propertyKeys) {
      const prop = properties[key];
      if (prop.type === 'select' || prop.type === 'status') {
        console.log(`[NotionService] ⚠️ フォールバック: 最初の${prop.type}プロパティを使用: "${key}"`);
        
        const options = prop.type === 'select' ? prop.select?.options : prop.status?.options;
        console.log(`[NotionService] 選択肢: [${options?.map((o: any) => `"${o.name}"`).join(', ') || 'なし'}]`);
        return key;
      }
    }
    
    console.error('[NotionService] ❌ ステータスプロパティが見つかりません');
    return null;
  }

  /**
   * 完了状態の選択肢を見つける
   * @param options select プロパティの選択肢リスト
   * @returns 完了状態の選択肢またはnull
   */
  private findCompletedOption(options: Array<{ name: string; id: string; color?: string }>): { name: string; id: string } | null {
    // 複数のパターンをチェック
    const completedCandidates = ['完了', 'Done', 'Completed', '終了', 'Finished', '✅', 'Success', '成功'];
    
    console.log(`[NotionService] 完了選択肢を検索中。利用可能な選択肢: [${options.map(o => o.name).join(', ')}]`);
    
    for (const candidate of completedCandidates) {
      const option = options.find(opt => opt.name === candidate);
      if (option) {
        console.log(`[NotionService] 完了選択肢発見: ${option.name}`);
        return option;
      }
    }
    
    // パーシャルマッチも試行（部分一致）
    for (const candidate of completedCandidates) {
      const option = options.find(opt => 
        opt.name.includes(candidate) || candidate.includes(opt.name)
      );
      if (option) {
        console.log(`[NotionService] 完了選択肢（部分一致）発見: ${option.name}`);
        return option;
      }
    }
    
    // 最後の選択肢を完了として使用（通常、ステータスの最後は完了状態）
    if (options.length > 0) {
      const lastOption = options[options.length - 1];
      console.log(`[NotionService] 最後の選択肢を完了として使用: ${lastOption.name}`);
      return lastOption;
    }
    
    console.warn('[NotionService] 完了状態の選択肢が見つかりません');
    return null;
  }

  /**
   * 調査種別プロパティを見つける
   * @param properties プロパティ情報
   * @returns 調査種別プロパティ名またはnull
   */
  private findResearchTypeProperty(properties: Record<string, any>): string | null {
    // 複数のパターンをチェック
    const researchTypeCandidates = [
      '調査種別', 'Research Type', '調査種類', 'Type', 
      'Category', 'カテゴリ', 'カテゴリー', '種別',
      'Research Category', '調査分野', 'Field'
    ];
    
    for (const candidate of researchTypeCandidates) {
      if (properties[candidate] && properties[candidate].type === 'select') {
        console.log(`[NotionService] 調査種別プロパティ発見: ${candidate}`);
        return candidate;
      }
    }
    
    console.log('[NotionService] 調査種別プロパティが見つかりません。利用可能なプロパティ:', Object.keys(properties));
    return null;
  }

  /**
   * コールアウトブロックを作成
   * @param title 見出し
   * @param content 内容
   * @param icon 絵文字
   * @returns Notionブロック
   */
  private createCalloutBlock(title: string, content: string, icon: string): any {
    const combinedText = content ? `**${title}**\n${content}` : `**${title}**`;
    const richText = this.parseTextToRichText(
      this.truncateTextSafely(combinedText)
    );
    return {
      object: 'block',
      type: 'callout',
      callout: {
        rich_text: richText,
        icon: {
          emoji: icon,
        },
        color: 'gray_background',
      },
    } as any;
  }

  /**
   * 調査タイトルから調査種別を分類（スクリーンショット対応）
   * @param researchTitle 調査タイトル
   * @param researchId 調査ID（1-16）
   * @returns 調査種別（スクリーンショット準拠）
   */
  private categorizeResearchType(researchTitle: string, researchId?: number): string {
    // 調査IDから直接マッピング（スクリーンショットの調査種別に完全対応）
    if (researchId) {
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

      const category = categoryMap[researchId];
      if (category) {
        return category;
      }
    }

    // フォールバック: タイトルからキーワード推定
    const keywordMap: { [key: string]: string } = {
      '市場規模': '1.市場規模と成長性',
      'PESTEL': '2.PESTEL分析',
      '競合の製品': '3.競合製品・戦略分析',
      '競合の経営': '4.競合経営戦略・離脱分析',
      '顧客セグメント': '5.顧客セグメント・意思決定分析',
      '顧客感情': '6.顧客感情・潜在ニーズ分析',
      'プロダクト市場適合性': '7.プロダクト市場適合性・価格戦略',
      'マーケティング戦術': '8.マーケティング戦術分析',
      'ブランドポジショニング': '9.ブランドポジショニング',
      'テクノロジートレンド': '10.テクノロジー・セキュリティ分析',
      'パートナーシップ': '11.パートナーシップ戦略',
      'リスク': '12.リスク・シナリオ分析',
      'KPI': '13.KPI・測定方法設計',
      '法務': '14.法務・コンプライアンス分析',
      'リサーチ手法': '15.効果的リサーチ手法提案',
      'PMF': '16.PMF前特化リサーチ設計'
    };

    for (const [keyword, category] of Object.entries(keywordMap)) {
      if (researchTitle.includes(keyword)) {
        return category;
      }
    }

    return '統合調査レポート'; // デフォルト（統合レポート用）
  }

  /**
   * プロパティブロックを作成（サービス仮説用）
   * @param title プロパティタイトル
   * @param content プロパティの内容
   * @returns Notionブロック
   */
  private createPropertyBlock(title: string, content?: string): any {
    const displayContent = content && content.trim() ? content : '未設定';
    const combinedText = `**${title}**: ${displayContent}`;
    
    const richText = this.parseTextToRichText(
      this.truncateTextSafely(combinedText)
    );

    return {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: richText
      }
    } as any;
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
      console.log(`[NotionService] 既存ページ検索: ${businessName} - ${researchTitle}`);
      
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
        console.log(`[NotionService] 既存ページ発見: ${url}`);
        return { pageId, url };
      }

      return null;
    } catch (error) {
      console.error('[NotionService] 既存ページ検索エラー:', error);
      return null;
    }
  }

  /**
   * 全16種類の調査項目を事前作成（重複防止機能付き）
   * @param businessName 事業名
   * @param researchPrompts 調査プロンプト配列
   * @returns 作成されたページ情報
   */
  async batchCreateResearchPages(
    businessName: string,
    researchPrompts: Array<{ id: number; title: string; prompt: string }>
  ): Promise<Array<{ pageId: string; url: string; researchId: number; title: string }>> {
    try {
      console.log(`[NotionService] 全調査項目の事前作成開始（重複防止付き）: ${businessName}`);
      
      const createdPages: Array<{ pageId: string; url: string; researchId: number; title: string }> = [];
      
      // 重複チェック用の既存ページマップ作成
      const existingPagesMap = new Map<number, { pageId: string; url: string }>();
      
      console.log('[NotionService] 既存ページの検索開始...');
      for (const prompt of researchPrompts) {
        const existingPage = await this.findExistingResearchPage(businessName, prompt.title);
        if (existingPage) {
          existingPagesMap.set(prompt.id, existingPage);
          console.log(`[NotionService] 既存ページスキップ: ${prompt.title}`);
        }
      }
      
      console.log(`[NotionService] 既存ページ: ${existingPagesMap.size}件、新規作成対象: ${researchPrompts.length - existingPagesMap.size}件`);
      
      // データベース構造を確認
      const databaseInfo = await this.getDatabaseProperties();
      
      for (const prompt of researchPrompts) {
        try {
          // 既存ページがある場合はスキップ
          if (existingPagesMap.has(prompt.id)) {
            const existingPage = existingPagesMap.get(prompt.id)!;
            createdPages.push({
              pageId: existingPage.pageId,
              url: existingPage.url,
              researchId: prompt.id,
              title: prompt.title
            });
            console.log(`[NotionService] 既存ページ使用: ${prompt.title}`);
            continue;
          }
          
          console.log(`[NotionService] 新規調査項目作成中: ${prompt.title}`);
          
          const properties: any = {};

          // タイトルプロパティの設定
          const titleProperty = this.findTitleProperty(databaseInfo);
          if (titleProperty) {
            properties[titleProperty] = {
              title: [
                {
                  text: {
                    content: businessName,
                  },
                },
              ],
            };
          }

          // ステータスプロパティの設定（未着手）
          const statusProperty = this.findStatusProperty(databaseInfo);
          if (statusProperty) {
            const statusProp = databaseInfo[statusProperty];
            const statusOptions = statusProp?.type === 'select' ? statusProp.select?.options : 
                                 statusProp?.type === 'status' ? statusProp.status?.options : [];
            const pendingOption = this.findPendingOption(statusOptions || []);
            
            if (pendingOption) {
              // selectとstatusでプロパティ設定方法が異なる
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
            const researchCategory = this.categorizeResearchType(prompt.title, prompt.id);
            properties[researchTypeProperty] = {
              select: {
                name: researchCategory
              }
            };
          }

          // 基本ページコンテンツ（ステータス文字列を削除）
          const pageContent = [
            {
              object: 'block',
              type: 'heading_1',
              heading_1: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: businessName
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
              type: 'paragraph',
              paragraph: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: `調査種別: ${this.categorizeResearchType(prompt.title, prompt.id)}`
                    }
                  }
                ]
              }
            } as any,
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
                      content: `${prompt.id}. ${prompt.title}`
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
            } as any,
            {
              object: 'block',
              type: 'callout',
              callout: {
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: 'この調査項目は調査開始待機中です。進行状況はNotionのステータスプロパティで確認できます。'
                    }
                  }
                ],
                icon: {
                  emoji: '⏳'
                },
                color: 'yellow_background'
              }
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
          
          createdPages.push({
            pageId,
            url,
            researchId: prompt.id,
            title: prompt.title
          });

          console.log(`[NotionService] 新規調査項目作成完了: ${prompt.title} (${url})`);
          
          // API制限対策の待機
          await this.sleep(200);
          
        } catch (error) {
          console.error(`[NotionService] 調査項目作成エラー (${prompt.title}):`, error);
          throw error;
        }
      }

      console.log(`[NotionService] 全調査項目の事前作成完了（重複防止付き）: ${createdPages.length}件`);
      
      // 重複チェック: 同じresearchIdが複数ないか確認
      const uniqueIds = new Set(createdPages.map(p => p.researchId));
      if (uniqueIds.size !== createdPages.length) {
        console.error('[NotionService] 重複するresearchIDが検出されました:', createdPages);
        throw new Error('調査項目の重複作成が検出されました');
      }
      
      return createdPages;
      
    } catch (error) {
      console.error('[NotionService] バッチ作成エラー:', error);
      throw new Error(`調査項目バッチ作成エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 未着手状態の選択肢を見つける
   * @param options select プロパティの選択肢リスト
   * @returns 未着手状態の選択肢またはnull
   */
  private findPendingOption(options: Array<{ name: string; id: string; color?: string }>): { name: string; id: string } | null {
    // 複数のパターンをチェック
    const pendingCandidates = ['未着手', 'Pending', 'Not Started', '開始前', 'ToDo', '⏳', '待機中', 'Waiting'];
    
    console.log(`[NotionService] 未着手選択肢を検索中。利用可能な選択肢: [${options.map(o => o.name).join(', ')}]`);
    
    for (const candidate of pendingCandidates) {
      const option = options.find(opt => opt.name === candidate);
      if (option) {
        console.log(`[NotionService] 未着手選択肢発見: ${option.name}`);
        return option;
      }
    }
    
    // パーシャルマッチも試行（部分一致）
    for (const candidate of pendingCandidates) {
      const option = options.find(opt => 
        opt.name.includes(candidate) || candidate.includes(opt.name)
      );
      if (option) {
        console.log(`[NotionService] 未着手選択肢（部分一致）発見: ${option.name}`);
        return option;
      }
    }
    
    // デフォルトで最初の選択肢を使用
    if (options.length > 0) {
      console.log(`[NotionService] デフォルト選択肢を未着手として使用: ${options[0].name}`);
      return options[0];
    }
    
    console.warn('[NotionService] 未着手状態の選択肢が見つかりません');
    return null;
  }

  /**
   * 進行中状態の選択肢を見つける
   * @param options select プロパティの選択肢リスト
   * @returns 進行中状態の選択肢またはnull
   */
  private findInProgressOption(options: Array<{ name: string; id: string; color?: string }>): { name: string; id: string } | null {
    // 複数のパターンをチェック
    const inProgressCandidates = ['進行中', 'In Progress', 'Working', '実行中', 'Running', '🔄', '作業中', 'Processing'];
    
    console.log(`[NotionService] 進行中選択肢を検索中。利用可能な選択肢: [${options.map(o => o.name).join(', ')}]`);
    
    for (const candidate of inProgressCandidates) {
      const option = options.find(opt => opt.name === candidate);
      if (option) {
        console.log(`[NotionService] 進行中選択肢発見: ${option.name}`);
        return option;
      }
    }
    
    // パーシャルマッチも試行（部分一致）
    for (const candidate of inProgressCandidates) {
      const option = options.find(opt => 
        opt.name.includes(candidate) || candidate.includes(opt.name)
      );
      if (option) {
        console.log(`[NotionService] 進行中選択肢（部分一致）発見: ${option.name}`);
        return option;
      }
    }
    
    console.warn('[NotionService] 進行中状態の選択肢が見つかりません');
    return null;
  }

  /**
   * ページのステータスを更新
   * @param pageId ページID
   * @param status 新しいステータス ('pending' | 'in-progress' | 'completed' | 'failed')
   * @returns 更新成功かどうか
   */
  async updatePageStatus(pageId: string, status: 'pending' | 'in-progress' | 'completed' | 'failed'): Promise<boolean> {
    try {
      console.log(`[NotionService] ページステータス更新開始: ${pageId} -> ${status}`);
      
      // データベース構造を確認
      const databaseInfo = await this.getDatabaseProperties();
      const statusProperty = this.findStatusProperty(databaseInfo);
      
      if (!statusProperty) {
        console.warn('[NotionService] ステータスプロパティが見つかりません');
        return false;
      }

      // プロパティタイプとオプションを取得
      const statusProp = databaseInfo[statusProperty];
      const statusOptions = statusProp?.type === 'select' ? statusProp.select?.options : 
                           statusProp?.type === 'status' ? statusProp.status?.options : [];
      
      console.log(`[NotionService] ステータスプロパティタイプ: ${statusProp?.type}`);
      console.log(`[NotionService] 利用可能な選択肢: [${statusOptions?.map((o: any) => o.name).join(', ') || 'なし'}]`);
      
      let targetOption = null;

      // ステータスに応じて適切な選択肢を取得
      switch (status) {
        case 'pending':
          targetOption = this.findPendingOption(statusOptions || []);
          break;
        case 'in-progress':
          targetOption = this.findInProgressOption(statusOptions || []);
          break;
        case 'completed':
          targetOption = this.findCompletedOption(statusOptions || []);
          break;
        case 'failed':
          // 失敗状態の選択肢を探す
          const failedCandidates = ['失敗', 'Failed', 'Error', 'エラー', '❌'];
          for (const candidate of failedCandidates) {
            const option = statusOptions?.find(opt => opt.name === candidate);
            if (option) {
              targetOption = option;
              break;
            }
          }
          break;
      }

      if (!targetOption) {
        console.warn(`[NotionService] ${status}に対応するステータス選択肢が見つかりません`);
        return false;
      }

      // selectとstatusでプロパティ更新方法が異なる
      const propertyUpdate: any = {};
      if (statusProp?.type === 'select') {
        propertyUpdate[statusProperty] = {
          select: {
            name: targetOption.name
          }
        };
      } else if (statusProp?.type === 'status') {
        propertyUpdate[statusProperty] = {
          status: {
            name: targetOption.name
          }
        };
      }

      console.log(`[NotionService] プロパティ更新内容:`, JSON.stringify(propertyUpdate, null, 2));

      // ページプロパティを更新
      await this.notion.pages.update({
        page_id: pageId,
        properties: propertyUpdate
      });

      console.log(`[NotionService] ページステータス更新完了: ${pageId} -> ${targetOption.name}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページステータス更新エラー (${pageId}):`, error);
      return false;
    }
  }



  /**
   * 統合レポートページを事前作成
   * @param businessName 事業名
   * @param serviceHypothesis サービス仮説
   * @returns NotionページのID・URL
   */
  async createIntegratedReportPage(
    businessName: string,
    serviceHypothesis: ServiceHypothesis
  ): Promise<{ pageId: string; url: string }> {
    try {
      console.log(`[NotionService] 統合レポートページ事前作成開始: ${businessName}`);

      // データベース構造を確認
      const databaseInfo = await this.getDatabaseProperties();
      const properties: any = {};

      // タイトルプロパティの設定
      const titleProperty = this.findTitleProperty(databaseInfo);
      if (titleProperty) {
        properties[titleProperty] = {
          title: [
            {
              text: {
                content: businessName,
              },
            },
          ],
        };
      }

      // ステータスプロパティの設定（未着手）
      const statusProperty = this.findStatusProperty(databaseInfo);
      if (statusProperty) {
        const statusProp = databaseInfo[statusProperty];
        const statusOptions = statusProp?.type === 'select' ? statusProp.select?.options : 
                             statusProp?.type === 'status' ? statusProp.status?.options : [];
        const pendingOption = this.findPendingOption(statusOptions || []);
        
        if (pendingOption) {
          // selectとstatusでプロパティ設定方法が異なる
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

      // 調査種別プロパティの設定（統合調査レポート）
      const researchTypeProperty = this.findResearchTypeProperty(databaseInfo);
      if (researchTypeProperty) {
        properties[researchTypeProperty] = {
          select: {
            name: '統合調査レポート'
          }
        };
      }

      // 統合レポートページのコンテンツ（空の状態）
      const pageContent = [
        {
          object: 'block',
          type: 'heading_1',
          heading_1: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `📊 ${businessName} - 総合市場調査レポート`
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
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: `調査種別: 統合調査レポート`
                }
              }
            ]
          }
        } as any,
        {
          object: 'block',
          type: 'divider',
          divider: {}
        } as any,
        {
          object: 'block',
          type: 'callout',
          callout: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: '📋 このページは16種類の専門調査の統合レポートページです。全調査完了後に詳細な分析内容が更新されます。'
                }
              }
            ],
            icon: {
              emoji: '📊'
            },
            color: 'blue_background'
          }
        } as any,
        ...this.createServiceHypothesisBlocks(serviceHypothesis)
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
      
      console.log(`[NotionService] 統合レポートページ事前作成完了: ${url}`);
      
      return { pageId, url };

    } catch (error) {
      console.error(`[NotionService] 統合レポートページ事前作成エラー (${businessName}):`, error);
      throw new Error(`統合レポートページ事前作成エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 統合レポートページの内容を更新
   * @param pageId 統合レポートページID
   * @param integratedReport 統合レポート内容
   * @returns 更新成功かどうか
   */
  async updateIntegratedReportContent(pageId: string, integratedReport: string): Promise<boolean> {
    try {
      console.log(`[NotionService] 統合レポート内容更新開始: ${pageId}`);
      
      // 統合レポート結果ブロックを作成
      const reportBlocks = this.createBlocksFromMarkdown(integratedReport);
      
      // 統合レポートヘッダーを追加
      const contentWithHeader = [
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
                  content: '🎯 統合調査結果・戦略提言'
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
                  content: `統合レポート生成完了日時: ${new Date().toLocaleString('ja-JP')}`
                }
              }
            ]
          }
        } as any,
        ...reportBlocks
      ];

      await this.appendBlocks(pageId, contentWithHeader);
      
      console.log(`[NotionService] 統合レポート内容更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] 統合レポート内容更新エラー (${pageId}):`, error);
      return false;
    }
  }

  /**
   * ページコンテンツを更新（アーカイブエラー対応強化版）
   * @param pageId ページID
   * @param content マークダウンコンテンツ
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, content: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // コンテンツをNotionブロックに変換
      const blocks = this.createBlocksFromMarkdown(content);
      console.log(`[NotionService] 変換されたブロック数: ${blocks.length}`);

      // 既存のページ内容を確認
      let existingPage;
      try {
        existingPage = await this.notion.pages.retrieve({ page_id: pageId });
        console.log(`[NotionService] ページ情報取得成功: ${pageId}`);
      } catch (retrieveError) {
        console.error(`[NotionService] ページ情報取得エラー: ${pageId}`, retrieveError);
        return false;
      }

      // ページがアーカイブされていないかチェック
      if (existingPage && 'archived' in existingPage && existingPage.archived) {
        console.warn(`[NotionService] ページがアーカイブされています: ${pageId}`);
        
        // アーカイブを解除を試行
        try {
          await this.notion.pages.update({
            page_id: pageId,
            archived: false
          });
          console.log(`[NotionService] ページのアーカイブ解除完了: ${pageId}`);
        } catch (unarchiveError) {
          console.error(`[NotionService] アーカイブ解除失敗: ${pageId}`, unarchiveError);
          return false;
        }
      }

      // 既存のブロックを取得してクリア
      try {
        console.log(`[NotionService] 既存ブロック削除開始: ${pageId}`);
        
        let existingBlocks;
        try {
          const response = await this.notion.blocks.children.list({
            block_id: pageId,
            page_size: 100
          });
          existingBlocks = response.results;
        } catch (listError: any) {
          if (listError?.code === 'validation_error' && listError?.message?.includes('archived')) {
            console.warn(`[NotionService] ブロック一覧取得でアーカイブエラー: ${pageId}`);
            // アーカイブエラーの場合は新しいページとして扱う
            existingBlocks = [];
          } else {
            throw listError;
          }
        }

        // 既存ブロックを削除（アーカイブエラー対応）
        if (existingBlocks && existingBlocks.length > 0) {
          console.log(`[NotionService] 削除対象ブロック数: ${existingBlocks.length}`);
          
          for (const block of existingBlocks) {
            try {
              await this.notion.blocks.delete({ block_id: block.id });
              console.log(`[NotionService] ブロック削除成功: ${block.id}`);
            } catch (deleteError: any) {
              if (deleteError?.code === 'validation_error' && deleteError?.message?.includes('archived')) {
                console.warn(`[NotionService] アーカイブされたブロックをスキップ: ${block.id}`);
                continue;
              } else {
                console.warn(`[NotionService] ブロック削除エラー (続行): ${block.id}`, deleteError);
              }
            }
          }
        }

        console.log(`[NotionService] 既存ブロッククリア完了: ${pageId}`);
      } catch (clearError) {
        console.warn(`[NotionService] 既存ブロッククリアエラー (続行): ${pageId}`, clearError);
        // ブロッククリアに失敗しても続行
      }

      // 新しいコンテンツを追加（小分けして追加）
      console.log(`[NotionService] 新コンテンツ追加開始: ${pageId}`);
      
      // ブロックを20個ずつに分けて追加（API制限対応）
      const BATCH_SIZE = 20;
      
      for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
        const batch = blocks.slice(i, i + BATCH_SIZE);
        
        try {
          await this.notion.blocks.children.append({
            block_id: pageId,
            children: batch
          });
          console.log(`[NotionService] ブロックバッチ追加成功: ${i + 1}-${Math.min(i + BATCH_SIZE, blocks.length)}/${blocks.length}`);
          
          // API制限対策の待機
          if (i + BATCH_SIZE < blocks.length) {
            await this.sleep(500);
          }
        } catch (appendError: any) {
          console.error(`[NotionService] ブロックバッチ追加エラー:`, appendError);
          
          // アーカイブエラーの場合は再試行
          if (appendError?.code === 'validation_error' && appendError?.message?.includes('archived')) {
            console.log(`[NotionService] アーカイブエラーにより再試行: ${pageId}`);
            
            // 短時間待機してから再試行
            await this.sleep(2000);
            
            try {
              await this.notion.blocks.children.append({
                block_id: pageId,
                children: batch
              });
              console.log(`[NotionService] 再試行でブロック追加成功: ${i + 1}-${Math.min(i + BATCH_SIZE, blocks.length)}`);
            } catch (retryError) {
              console.error(`[NotionService] 再試行でもブロック追加失敗:`, retryError);
              // エラーでも処理を続行
            }
          }
        }
      }

      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;

    } catch (error: any) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
      
      // アーカイブエラーの場合は詳細ログ
      if (error?.code === 'validation_error' && error?.message?.includes('archived')) {
        console.error(`[NotionService] アーカイブエラー詳細:`, {
          pageId,
          code: error.code,
          message: error.message,
          requestId: error.request_id
        });
      }
      
      return false;
    }
  }
}


