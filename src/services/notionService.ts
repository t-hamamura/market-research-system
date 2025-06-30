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
   * マークダウンテキストをNotionブロックに変換（実Notion対応強化版）
   * @param markdownText Geminiから受け取ったMarkdown文字列またはJSON
   * @returns Notionブロック配列
   */
  private createBlocksFromMarkdown(markdownText: string): any[] {
    try {
      if (!markdownText || markdownText.trim().length === 0) {
        return [this.createParagraphBlock('AIからの応答が空でした。')];
      }

      console.log(`[NotionService] コンテンツ変換開始: ${markdownText.length}文字`);
      
      // HTMLエンティティをデコード
      const decodedText = this.decodeHtmlEntities(markdownText.trim());
      console.log('[NotionService] HTMLエンティティデコード完了');
      
      // JSONレスポンスの検出と処理（強化版）
      if (this.isJsonFormat(decodedText)) {
        console.log('[NotionService] JSON形式を検出、Notionブロックに変換中...');
        return this.convertJsonToNotionBlocks(decodedText);
      }
      
      // マークダウン形式の処理
      console.log('[NotionService] マークダウン形式として処理中...');
      return this.convertMarkdownToNotionBlocks(decodedText);
      
    } catch (error) {
      console.error('[NotionService] コンテンツ変換エラー:', error);
      return [
        this.createCalloutBlock('⚠️', 'エラーが発生しました', 'red_background'),
        this.createParagraphBlock(`変換エラー: ${error instanceof Error ? error.message : 'Unknown error'}`),
        this.createParagraphBlock('元データ:'),
        this.createCodeBlock(markdownText.substring(0, 500) + (markdownText.length > 500 ? '...' : ''))
      ];
    }
  }

  /**
   * HTMLエンティティをデコード
   * @param text エンコードされたテキスト
   * @returns デコードされたテキスト
   */
  private decodeHtmlEntities(text: string): string {
    const entityMap: { [key: string]: string } = {
      '&quot;': '"',
      '&#39;': "'",
      '&lt;': '<',
      '&gt;': '>',
      '&amp;': '&',
      '&nbsp;': ' ',
      '&#x27;': "'",
      '&#x2F;': '/',
      '&#x60;': '`',
      '&#x3D;': '='
    };
    
    let decodedText = text;
    for (const [entity, char] of Object.entries(entityMap)) {
      decodedText = decodedText.replace(new RegExp(entity, 'g'), char);
    }
    
    return decodedText;
  }

  /**
   * JSON形式かどうかを判定（厳密版）
   * @param text 判定対象のテキスト
   * @returns JSON形式かどうか
   */
  private isJsonFormat(text: string): boolean {
    const trimmed = text.trim();
    
    // JSON配列形式（[で始まり]で終わる）
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        JSON.parse(trimmed);
        return true;
      } catch {
        // パースできない場合でも、構造的にJSONっぽい場合は処理を試行
        return trimmed.includes('"type":') && trimmed.includes('"content":');
      }
    }
    
    // JSON配列が複数行にわたって記述されている場合
    if (trimmed.startsWith('[') && trimmed.includes('"type":') && trimmed.includes('"content":')) {
      return true;
    }
    
    return false;
  }

  /**
   * JSONをNotionブロックに変換（強化版）
   * @param jsonText JSON文字列
   * @returns Notionブロック配列
   */
  private convertJsonToNotionBlocks(jsonText: string): any[] {
    try {
      console.log('[NotionService] JSON変換処理開始');
      
      // まずJSONとしてパースを試行
      let jsonData;
      try {
        jsonData = JSON.parse(jsonText);
      } catch (parseError) {
        console.warn('[NotionService] JSON直接パース失敗、修復を試行:', parseError);
        
        // JSON修復を試行
        const repairedJson = this.repairJsonString(jsonText);
        try {
          jsonData = JSON.parse(repairedJson);
          console.log('[NotionService] JSON修復成功');
        } catch (repairError) {
          console.error('[NotionService] JSON修復も失敗:', repairError);
          // JSON修復に失敗した場合は、構造化テキストとして処理
          return this.parseStructuredText(jsonText);
        }
      }
      
      // JSONデータをNotionブロックに変換
      if (Array.isArray(jsonData)) {
        console.log(`[NotionService] JSON配列を変換: ${jsonData.length}項目`);
        return this.convertJsonArrayToBlocks(jsonData);
      } else if (typeof jsonData === 'object') {
        console.log('[NotionService] JSONオブジェクトを変換');
        return this.convertJsonObjectToBlocks(jsonData);
      } else {
        console.warn('[NotionService] 予期しないJSON形式');
        return [this.createParagraphBlock(String(jsonData))];
      }
      
    } catch (error) {
      console.error('[NotionService] JSON変換エラー:', error);
      // フォールバック: 構造化テキストとして処理
      return this.parseStructuredText(jsonText);
    }
  }

  /**
   * 壊れたJSON文字列を修復
   * @param jsonText 壊れたJSON文字列
   * @returns 修復されたJSON文字列
   */
  private repairJsonString(jsonText: string): string {
    let repaired = jsonText;
    
    // よくある問題を修復
    // 1. 末尾の余分なカンマを削除
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
    
    // 2. 不完全な終端を修復
    if (repaired.startsWith('[') && !repaired.endsWith(']')) {
      // 最後のオブジェクトが不完全な場合の修復
      const lastBraceIndex = repaired.lastIndexOf('}');
      if (lastBraceIndex > 0) {
        repaired = repaired.substring(0, lastBraceIndex + 1) + ']';
      }
    }
    
    // 3. エスケープ問題の修復
    repaired = repaired.replace(/\\"/g, '"');
    
    return repaired;
  }

  /**
   * JSON配列をNotionブロックに変換
   * @param jsonArray JSON配列
   * @returns Notionブロック配列
   */
  private convertJsonArrayToBlocks(jsonArray: any[]): any[] {
    const blocks: any[] = [];
    
    for (const item of jsonArray) {
      if (typeof item === 'object' && item.type && item.content) {
        const block = this.createBlockFromJsonItem(item);
        if (block) {
          blocks.push(block);
        }
      } else if (typeof item === 'string') {
        blocks.push(this.createParagraphBlock(item));
      }
    }
    
    if (blocks.length === 0) {
      blocks.push(this.createParagraphBlock('JSON配列の変換結果が空でした。'));
    }
    
    return blocks;
  }

  /**
   * JSON項目からNotionブロックを作成
   * @param item JSON項目
   * @returns Notionブロック
   */
  private createBlockFromJsonItem(item: any): any | null {
    try {
      switch (item.type) {
        case 'heading_1':
          return this.createHeadingBlock(1, item.content);
        case 'heading_2':
          return this.createHeadingBlock(2, item.content);
        case 'heading_3':
          return this.createHeadingBlock(3, item.content);
        case 'paragraph':
          return this.createParagraphBlock(item.content);
        case 'bulleted_list_item':
          return this.createBulletedListItemBlock(item.content);
        case 'numbered_list_item':
          return this.createNumberedListItemBlock(item.content);
        case 'toggle':
          return this.createToggleBlock(item.content, item.children || []);
        case 'callout':
          return this.createCalloutBlock(item.icon || '💡', item.content, 'blue_background');
        case 'divider':
          return this.createDividerBlock();
        case 'code':
          return this.createCodeBlock(item.content, item.language || 'plain text');
        default:
          console.warn(`[NotionService] 未知のブロックタイプ: ${item.type}`);
          return this.createParagraphBlock(item.content || '');
      }
    } catch (error) {
      console.error(`[NotionService] ブロック作成エラー (${item.type}):`, error);
      return this.createParagraphBlock(item.content || '');
    }
  }

  /**
   * 構造化テキストを解析（JSONパース失敗時のフォールバック）
   * @param text 構造化テキスト
   * @returns Notionブロック配列
   */
  private parseStructuredText(text: string): any[] {
    console.log('[NotionService] 構造化テキスト解析を実行');
    
    const blocks: any[] = [];
    const lines = text.split('\n');
    
    let currentObject = '';
    let bracketCount = 0;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.includes('{')) {
        bracketCount += (trimmedLine.match(/\{/g) || []).length;
      }
      if (trimmedLine.includes('}')) {
        bracketCount -= (trimmedLine.match(/\}/g) || []).length;
      }
      
      currentObject += line + '\n';
      
      // オブジェクトが完成した場合
      if (bracketCount === 0 && currentObject.includes('"type":')) {
        try {
          const cleaned = currentObject.replace(/^[,\s]+/, '').replace(/[,\s]+$/, '');
          const obj = JSON.parse(cleaned);
          const block = this.createBlockFromJsonItem(obj);
          if (block) {
            blocks.push(block);
          }
        } catch (error) {
          // パースできない場合は段落として追加
          if (currentObject.trim()) {
            blocks.push(this.createParagraphBlock(currentObject.trim()));
          }
        }
        currentObject = '';
      }
    }
    
    // 残りがある場合
    if (currentObject.trim()) {
      blocks.push(this.createParagraphBlock(currentObject.trim()));
    }
    
    if (blocks.length === 0) {
      blocks.push(this.createParagraphBlock('構造化テキストの解析に失敗しました。'));
      blocks.push(this.createCodeBlock(text.substring(0, 1000)));
    }
    
    return blocks;
  }

  /**
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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

  /**
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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

  /**
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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

  /**
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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

  /**
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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

  /**
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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

  /**
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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

  /**
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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

  /**
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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

  /**
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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

  /**
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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

  /**
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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

  /**
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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

  /**
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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

  /**
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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

  /**
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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

  /**
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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

  /**
   * ページに調査結果コンテンツを追加
   * @param pageId ページID
   * @param researchResult 調査結果
   * @returns 更新成功かどうか
   */
  async updatePageContent(pageId: string, researchResult: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページコンテンツ更新開始: ${pageId}`);
      
      // 調査結果ブロックを作成
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
      
      console.log(`[NotionService] ページコンテンツ更新完了: ${pageId}`);
      return true;
      
    } catch (error) {
      console.error(`[NotionService] ページコンテンツ更新エラー (${pageId}):`, error);
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