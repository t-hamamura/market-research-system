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
      console.log('[NotionService] Notion Token (先頭8文字):', this.config.token.substring(0, 8) + '...');

      // 基本Notionページを作成
      console.log('[NotionService] Notion APIでページ作成開始...');
      const response = await this.notion.pages.create({
        parent: {
          database_id: this.config.databaseId
        },
        properties,
        children: initialChildren
      });

      const pageId = response.id;
      console.log('[NotionService] 基本ページ作成完了:', pageId);
      console.log('[NotionService] ページ作成レスポンス:', JSON.stringify({
        id: response.id,
        object: response.object
      }, null, 2));

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
   * マークダウンテキストをNotionブロックに変換（Notion API仕様準拠版）
   * @param text マークダウンテキスト
   * @returns Notionブロック配列
   */
  private createBlocksFromMarkdown(text: string): any[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const blocks: any[] = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // 空行はスキップ
      if (trimmedLine === '') {
        continue;
      }

      // 🎨 見出し1-3 (Notionは3レベルまで対応)
      if (trimmedLine.match(/^#{1,3}\s+/)) {
        const level = (trimmedLine.match(/^#+/) || [''])[0].length;
        const text = trimmedLine.replace(/^#+\s+/, '').trim();
        
        const headingType = level === 1 ? 'heading_1' : 
                           level === 2 ? 'heading_2' : 'heading_3';
        
        blocks.push({
          object: 'block',
          type: headingType,
          [headingType]: {
            rich_text: [
              {
                type: 'text',
                text: { content: text },
                annotations: {
                  bold: true,
                  color: level === 1 ? 'blue' : level === 2 ? 'purple' : 'green'
                }
              }
            ],
            is_toggleable: false
          }
        });
        continue;
      }

      // 🎨 Calloutブロック (> で始まり、重要な情報を強調)
      if (trimmedLine.match(/^>\s*[\*\!]?\s*/)) {
        const content = trimmedLine.replace(/^>\s*[\*\!]?\s*/, '').trim();
        const isWarning = trimmedLine.includes('!');
        const isImportant = trimmedLine.includes('*');
        
        blocks.push({
          object: 'block',
          type: 'callout',
          callout: {
            rich_text: this.parseRichText(content),
            icon: {
              type: 'emoji',
              emoji: isWarning ? '⚠️' : isImportant ? '💡' : '📝'
            },
            color: isWarning ? 'red_background' : isImportant ? 'yellow_background' : 'blue_background'
          }
        });
        continue;
      }

      // 🎨 番号付きリスト
      if (trimmedLine.match(/^\d+\.\s+/)) {
        const text = trimmedLine.replace(/^\d+\.\s+/, '').trim();
        blocks.push({
          object: 'block',
          type: 'numbered_list_item',
          numbered_list_item: {
            rich_text: this.parseRichText(text),
            color: 'default'
          }
        });
        continue;
      }

      // 🎨 箇条書きリスト
      if (trimmedLine.match(/^[\-\*\•]\s+/)) {
        const text = trimmedLine.replace(/^[\-\*\•]\s+/, '').trim();
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: this.parseRichText(text),
            color: 'default'
          }
        });
        continue;
      }

      // 🎨 コードブロック (言語検出付き)
      if (trimmedLine.startsWith('```')) {
        const languageMatch = trimmedLine.match(/^```(\w+)?/);
        const language = languageMatch?.[1] || 'plain_text';
        const codeLines = [];
        i++; // 次の行から開始
        
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        
        if (codeLines.length > 0) {
          // コードブロックを安全な長さに分割
          const codeContent = codeLines.join('\n');
          const maxCodeLength = 1500; // Notionの制限を考慮
          
          if (codeContent.length > maxCodeLength) {
            // 長いコードは複数のブロックに分割
            const codeChunks = this.splitCodeIntoChunks(codeContent, maxCodeLength);
            codeChunks.forEach((chunk, index) => {
              blocks.push({
                object: 'block',
                type: 'code',
                code: {
                  language: this.mapToNotionLanguage(language),
                  rich_text: [
                    {
                      type: 'text',
                      text: { content: chunk }
                    }
                  ]
                }
              });
              
              if (index < codeChunks.length - 1) {
                // 継続を示すコメント
                blocks.push({
                  object: 'block',
                  type: 'paragraph',
                  paragraph: {
                    rich_text: [
                      {
                        type: 'text',
                        text: { content: '（コード続き...）' },
                        annotations: { italic: true, color: 'gray' }
                      }
                    ]
                  }
                });
              }
            });
          } else {
            blocks.push({
              object: 'block',
              type: 'code',
              code: {
                language: this.mapToNotionLanguage(language),
                rich_text: [
                  {
                    type: 'text',
                    text: { content: codeContent }
                  }
                ]
              }
            });
          }
        }
        continue;
      }

      // 🎨 区切り線
      if (trimmedLine.match(/^[\-\*]{3,}$/)) {
        blocks.push({
          object: 'block',
          type: 'divider',
          divider: {}
        });
        continue;
      }

      // 🎨 表の検出と構築（Notion API準拠）
      if (trimmedLine.includes('|') && trimmedLine.split('|').length >= 3) {
        const tableData = this.parseEnhancedTableData(lines, i);
        if (tableData.rows.length > 0) {
          // Notionテーブルの正確な構造
          const tableBlock = {
            object: 'block',
            type: 'table',
            table: {
              table_width: tableData.columns,
              has_column_header: tableData.hasHeader,
              has_row_header: false,
              children: tableData.rows.map((row, rowIndex) => ({
                object: 'block',
                type: 'table_row',
                table_row: {
                  cells: row.map((cell, cellIndex) => {
                    const isHeader = rowIndex === 0 && tableData.hasHeader;
                    return [
                      {
                        type: 'text',
                        text: { content: cell.trim() },
                        annotations: {
                          bold: isHeader,
                          color: isHeader ? 'blue' : 'default'
                        }
                      }
                    ];
                  })
                }
              }))
            }
          };
          
          blocks.push(tableBlock);
          i += tableData.lineCount - 1;
          continue;
        }
      }

      // 🎨 Toggleブロック（長いコンテンツ用）
      if (trimmedLine.match(/^### .+$/)) {
        const title = trimmedLine.replace(/^### /, '').trim();
        
        // 次の見出しまでの内容を収集
        const toggleContent = [];
        let j = i + 1;
        
        while (j < lines.length && !lines[j].trim().match(/^#{1,3}\s/)) {
          if (lines[j].trim()) {
            toggleContent.push(lines[j].trim());
          }
          j++;
        }
        
        if (toggleContent.length > 0) {
          blocks.push({
            object: 'block',
            type: 'toggle',
            toggle: {
              rich_text: [
                {
                  type: 'text',
                  text: { content: title },
                  annotations: { bold: true, color: 'green' }
                }
              ],
              children: toggleContent.map(content => ({
                object: 'block',
                type: 'paragraph',
                paragraph: {
                  rich_text: this.parseRichText(content)
                }
              }))
            }
          });
          
          i = j - 1; // ループの最後でi++されるため
          continue;
        }
      }

      // 🎨 通常の段落（強化されたリッチテキスト対応）
      if (trimmedLine.length > 0) {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: this.parseRichText(trimmedLine)
          }
        });
      }
    }

    return blocks;
  }

  /**
   * コンテンツを安全なチャンクに分割
   * @param content コンテンツ
   * @param maxLength 最大長
   * @returns チャンク配列
   */
  private splitCodeIntoChunks(content: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }
        
        // 行自体が長すぎる場合は強制分割
        if (line.length > maxLength) {
          let remaining = line;
          while (remaining.length > maxLength) {
            chunks.push(remaining.substring(0, maxLength));
            remaining = remaining.substring(maxLength);
          }
          currentChunk = remaining;
        } else {
          currentChunk = line;
        }
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  /**
   * 言語名をNotion対応形式にマッピング
   * @param language 言語名
   * @returns Notion対応言語名
   */
  private mapToNotionLanguage(language: string): string {
    const languageMap: { [key: string]: string } = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'rb': 'ruby',
      'go': 'go',
      'rust': 'rust',
      'cpp': 'c++',
      'c++': 'c++',
      'java': 'java',
      'php': 'php',
      'sql': 'sql',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'xml': 'xml',
      'bash': 'bash',
      'shell': 'bash',
      'sh': 'bash',
      'powershell': 'powershell',
      'dockerfile': 'docker',
      'markdown': 'markdown',
      'md': 'markdown'
    };
    
    return languageMap[language.toLowerCase()] || 'plain_text';
  }

  /**
   * 強化されたテーブルデータ解析
   * @param lines 全行配列
   * @param startIndex 開始インデックス
   * @returns 強化されたテーブルデータ
   */
  private parseEnhancedTableData(lines: string[], startIndex: number): { 
    rows: string[][], 
    columns: number, 
    lineCount: number,
    hasHeader: boolean 
  } {
    const tableRows: string[][] = [];
    let currentIndex = startIndex;
    let maxColumns = 0;
    let hasHeader = false;
    
    while (currentIndex < lines.length) {
      const line = lines[currentIndex].trim();
      
      if (!line.includes('|')) {
        break; // 表の終了
      }
      
      // ヘッダー区切り行の検出（|---|---|のような行）
      if (line.match(/^\|[\s\-\|:]+\|$/)) {
        hasHeader = true;
        currentIndex++;
        continue;
      }
      
      // セルの解析（前後の | を除去）
      let cells = line.split('|');
      
      // 先頭と末尾の空セルを除去
      if (cells[0].trim() === '') cells.shift();
      if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
      
      // セルをクリーンアップ
      cells = cells.map(cell => cell.trim());
      
      if (cells.length > 0) {
        tableRows.push(cells);
        maxColumns = Math.max(maxColumns, cells.length);
      }
      
      currentIndex++;
    }
    
    // ヘッダー区切り行がなくても、最初の行が明らかにヘッダーっぽい場合
    if (!hasHeader && tableRows.length > 1) {
      const firstRow = tableRows[0];
      const secondRow = tableRows[1];
      
      // 最初の行が全て文字で、2行目に数字が含まれている場合はヘッダーとみなす
      const firstRowHasNumbers = firstRow.some(cell => /\d/.test(cell));
      const secondRowHasNumbers = secondRow.some(cell => /\d/.test(cell));
      
      if (!firstRowHasNumbers && secondRowHasNumbers) {
        hasHeader = true;
      }
    }
    
    return {
      rows: tableRows,
      columns: maxColumns,
      lineCount: currentIndex - startIndex,
      hasHeader: hasHeader
    };
  }

  /**
   * リッチテキスト解析（Notion API仕様準拠強化版）
   * @param text テキスト
   * @returns リッチテキスト配列
   */
  private parseRichText(text: string): any[] {
    if (!text || typeof text !== 'string') {
      return [{ type: 'text', text: { content: '' } }];
    }

    // 安全な長さに切り詰め
    const safeText = this.truncateTextSafely(text);
    const richTextElements: any[] = [];
    
    // 複雑なパターンマッチングで装飾を解析
    const patterns = [
      // **太字**
      { regex: /\*\*([^*\n]+?)\*\*/g, type: 'bold' },
      // *斜体*（**と重複しないように）
      { regex: /(?<!\*)\*([^*\n]+?)\*(?!\*)/g, type: 'italic' },
      // `インラインコード`
      { regex: /`([^`\n]+?)`/g, type: 'code' },
      // [リンクテキスト](URL)
      { regex: /\[([^\]]+?)\]\(([^)]+?)\)/g, type: 'link' },
      // ~~取り消し線~~
      { regex: /~~([^~\n]+?)~~/g, type: 'strikethrough' },
      // <u>下線</u>
      { regex: /<u>([^<]+?)<\/u>/g, type: 'underline' },
      // URL自動検出
      { regex: /(https?:\/\/[^\s<>\[\]]+)/g, type: 'auto_link' }
    ];

    let workingText = safeText;
    const annotations: Array<{
      start: number,
      end: number,
      type: string,
      content?: string,
      url?: string,
      originalLength: number
    }> = [];

    // 各パターンをマッチング
    for (const pattern of patterns) {
      let match;
      const tempRegex = new RegExp(pattern.regex.source, pattern.regex.flags);
      
      while ((match = tempRegex.exec(workingText)) !== null) {
        if (pattern.type === 'link') {
          annotations.push({
            start: match.index,
            end: match.index + match[0].length,
            type: pattern.type,
            content: match[1], // リンクテキスト
            url: match[2], // URL
            originalLength: match[0].length
          });
        } else if (pattern.type === 'auto_link') {
          annotations.push({
            start: match.index,
            end: match.index + match[0].length,
            type: pattern.type,
            content: match[1], // URL自体
            url: match[1], // URL
            originalLength: match[0].length
          });
        } else {
          annotations.push({
            start: match.index,
            end: match.index + match[0].length,
            type: pattern.type,
            content: match[1], // 装飾されたテキスト
            originalLength: match[0].length
          });
        }
      }
    }

    // アノテーションを開始位置でソート
    annotations.sort((a, b) => a.start - b.start);

    // 重複や入れ子を解決
    const resolvedAnnotations = this.resolveOverlappingAnnotations(annotations);

    if (resolvedAnnotations.length === 0) {
      // 装飾なしの通常テキスト
      return [
        {
          type: 'text',
          text: { content: safeText },
          annotations: { color: 'default' }
        }
      ];
    }

    // リッチテキスト要素を構築
    let lastIndex = 0;
    
    for (const annotation of resolvedAnnotations) {
      // 前の部分（通常テキスト）
      if (annotation.start > lastIndex) {
        const beforeText = workingText.substring(lastIndex, annotation.start);
        if (beforeText) {
          richTextElements.push({
            type: 'text',
            text: { content: beforeText },
            annotations: { color: 'default' }
          });
        }
      }

      // 装飾された部分
      const richTextElement: any = {
        type: 'text',
        text: { content: annotation.content || '' },
        annotations: this.createAnnotations(annotation.type)
      };

      // リンクの場合はURL情報を追加
      if (annotation.type === 'link' || annotation.type === 'auto_link') {
        richTextElement.text.link = { url: annotation.url };
      }

      richTextElements.push(richTextElement);
      lastIndex = annotation.end;
    }

    // 残りの部分
    if (lastIndex < workingText.length) {
      const remainingText = workingText.substring(lastIndex);
      if (remainingText) {
        richTextElements.push({
          type: 'text',
          text: { content: remainingText },
          annotations: { color: 'default' }
        });
      }
    }

    return richTextElements.length > 0 ? richTextElements : [
      {
        type: 'text',
        text: { content: safeText },
        annotations: { color: 'default' }
      }
    ];
  }

  /**
   * 重複するアノテーションを解決
   * @param annotations アノテーション配列
   * @returns 解決済みアノテーション配列
   */
  private resolveOverlappingAnnotations(annotations: Array<{
    start: number,
    end: number,
    type: string,
    content?: string,
    url?: string,
    originalLength: number
  }>): Array<{
    start: number,
    end: number,
    type: string,
    content?: string,
    url?: string,
    originalLength: number
  }> {
    if (annotations.length <= 1) return annotations;

    const resolved: typeof annotations = [];
    let current = annotations[0];

    for (let i = 1; i < annotations.length; i++) {
      const next = annotations[i];

      // 重複がない場合
      if (current.end <= next.start) {
        resolved.push(current);
        current = next;
      } else {
        // 重複がある場合は、より外側（長い）アノテーションを優先
        if (current.originalLength >= next.originalLength) {
          // currentを保持
          continue;
        } else {
          // nextを優先
          current = next;
        }
      }
    }

    resolved.push(current);
    return resolved;
  }

  /**
   * アノテーションタイプに基づいてNotionのアノテーションオブジェクトを作成
   * @param type アノテーションタイプ
   * @returns Notionアノテーション
   */
  private createAnnotations(type: string): any {
    const baseAnnotations = {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: 'default' as const
    };

    switch (type) {
      case 'bold':
        return { ...baseAnnotations, bold: true, color: 'default' };
      case 'italic':
        return { ...baseAnnotations, italic: true, color: 'default' };
      case 'code':
        return { ...baseAnnotations, code: true, color: 'red' };
      case 'strikethrough':
        return { ...baseAnnotations, strikethrough: true, color: 'gray' };
      case 'underline':
        return { ...baseAnnotations, underline: true, color: 'default' };
      case 'link':
      case 'auto_link':
        return { ...baseAnnotations, color: 'blue' };
      default:
        return baseAnnotations;
    }
  }

  /**
   * 表データの解析
   * @param lines 全行配列
   * @param startIndex 開始インデックス
   * @returns 表データと処理行数
   */
  private parseTableData(lines: string[], startIndex: number): { rows: string[][], columns: number, lineCount: number } {
    const tableRows: string[][] = [];
    let currentIndex = startIndex;
    let maxColumns = 0;
    
    while (currentIndex < lines.length) {
      const line = lines[currentIndex].trim();
      
      if (!line.includes('|')) {
        break; // 表の終了
      }
      
      // ヘッダー区切り行をスキップ（|---|---|のような行）
      if (line.match(/^\|[\s\-\|:]+\|$/)) {
        currentIndex++;
        continue;
      }
      
      const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell !== '');
      if (cells.length > 0) {
        tableRows.push(cells);
        maxColumns = Math.max(maxColumns, cells.length);
      }
      
      currentIndex++;
    }
    
    return {
      rows: tableRows,
      columns: maxColumns,
      lineCount: currentIndex - startIndex
    };
  }

  /**
   * テキストをRich Text形式に変換（装飾対応強化版）
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
   * Notion API接続テスト（強化版）
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

      if (!this.config.token.startsWith('ntn_') && !this.config.token.startsWith('secret_')) {
        console.error('[NotionService] Notion Tokenの形式が正しくありません:', this.config.token.substring(0, 8) + '...');
        return false;
      }

      console.log('[NotionService] API接続テスト開始');
      console.log('[NotionService] Token:', this.config.token.substring(0, 8) + '...');
      console.log('[NotionService] Database ID:', this.config.databaseId.substring(0, 8) + '...');
      
      // Step 1: データベース情報を取得してテスト
      console.log('[NotionService] Step 1: データベース接続テスト');
      const response = await this.notion.databases.retrieve({
        database_id: this.config.databaseId
      });
      
      console.log('[NotionService] データベース取得成功');
      // データベース名は複雑な構造のため、IDのみ表示
      console.log('[NotionService] データベースID:', this.config.databaseId);
      
      // Step 2: データベースプロパティ詳細チェック
      console.log('[NotionService] Step 2: データベースプロパティ詳細チェック');
      const properties = response.properties || {};
      console.log('[NotionService] 利用可能なプロパティ:');
      
      Object.keys(properties).forEach(key => {
        const prop = properties[key];
        console.log(`  - "${key}": ${prop.type}`);
        if (prop.type === 'select' && prop.select?.options) {
          console.log(`    選択肢: [${prop.select.options.map((o: any) => `"${o.name}"`).join(', ')}]`);
        }
        if (prop.type === 'status' && prop.status?.options) {
          console.log(`    ステータス選択肢: [${prop.status.options.map((o: any) => `"${o.name}"`).join(', ')}]`);
        }
      });
      
      // Step 3: テストページ作成権限チェック
      console.log('[NotionService] Step 3: テストページ作成権限チェック');
      
      // タイトルプロパティを特定
      const titleProperty = this.findTitleProperty(properties);
      if (!titleProperty) {
        console.error('[NotionService] タイトルプロパティが見つかりません。データベース構造を確認してください。');
        return false;
      }
      
      console.log(`[NotionService] タイトルプロパティ: "${titleProperty}"`);
      
      // 最小限のテストページを作成してみる
      try {
        const testPageProperties: any = {};
        testPageProperties[titleProperty] = {
          title: [
            {
              text: {
                content: 'Connection Test - 接続テスト'
              }
            }
          ]
        };
        
        const testPageContent = [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text' as const,
                  text: {
                    content: 'これは接続テスト用のページです。削除しても問題ありません。'
                  }
                }
              ]
            }
          } as any
        ];
        
        const testResponse = await this.notion.pages.create({
          parent: {
            database_id: this.config.databaseId
          },
          properties: testPageProperties,
          children: testPageContent
        });
        
        console.log('[NotionService] テストページ作成成功:', testResponse.id);
        console.log('[NotionService] テストページURL:', this.generatePageUrl(testResponse.id));
        
        // テストページを即座に削除
        try {
          await this.notion.blocks.delete({ block_id: testResponse.id });
          console.log('[NotionService] テストページ削除完了');
        } catch (deleteError) {
          console.warn('[NotionService] テストページ削除失敗（手動削除してください）:', deleteError);
        }
        
      } catch (createError) {
        console.error('[NotionService] テストページ作成エラー:', createError);
        
        // より詳細なエラー情報を出力
        if (createError && typeof createError === 'object') {
          if ('code' in createError) {
            console.error('[NotionService] Notion APIエラーコード:', (createError as any).code);
          }
          if ('message' in createError) {
            console.error('[NotionService] Notion APIエラーメッセージ:', (createError as any).message);
          }
        }
        
        return false;
      }
      
      console.log('[NotionService] ✅ Notion API接続テスト完全成功');
      return true;
      
    } catch (error) {
      console.error('[NotionService] 接続テストエラー詳細:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        token: this.config.token ? this.config.token.substring(0, 8) + '...' : 'なし',
        databaseId: this.config.databaseId ? this.config.databaseId.substring(0, 8) + '...' : 'なし'
      });
      
      // Notion APIの特定エラーを詳細解析
      if (error && typeof error === 'object' && 'code' in error) {
        const errorCode = (error as any).code;
        console.error('[NotionService] Notion APIエラーコード:', errorCode);
        
        switch (errorCode) {
          case 'unauthorized':
            console.error('[NotionService] 認証エラー: Notion Tokenが無効または期限切れです');
            break;
          case 'forbidden':
            console.error('[NotionService] 権限エラー: Integrationがデータベースにアクセスできません');
            break;
          case 'object_not_found':
            console.error('[NotionService] オブジェクト未発見: Database IDが間違っているか、アクセス権限がありません');
            break;
          case 'rate_limited':
            console.error('[NotionService] レート制限: API呼び出し制限に達しました');
            break;
          default:
            console.error('[NotionService] その他のAPIエラー:', errorCode);
        }
      }
      
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
      
      // データベース構造を動的に確認
      const databaseInfo = await this.getDatabaseProperties();
      const titleProperty = this.findTitleProperty(databaseInfo);
      const researchTypeProperty = this.findResearchTypeProperty(databaseInfo);
      
      if (!titleProperty) {
        console.warn('[NotionService] タイトルプロパティが見つかりません');
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
      
      console.log(`[NotionService] 検索フィルター:`, JSON.stringify(filters, null, 2));
      
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
   * ページのステータスを更新（強化版：複数のステータス形式に対応）
   * @param pageId ページID
   * @param status 新しいステータス（completed, in-progress, pending など）
   * @returns 更新成功フラグ
   */
  async updatePageStatus(pageId: string, status: string): Promise<boolean> {
    try {
      console.log(`[NotionService] ページステータス更新開始: ${pageId} -> ${status}`);
      
      // データベース構造を確認
      const databaseInfo = await this.getDatabaseProperties();
      const statusProperty = this.findStatusProperty(databaseInfo);
      
      if (!statusProperty) {
        console.warn('[NotionService] ステータスプロパティが見つかりません');
        return false;
      }
      
      console.log(`[NotionService] ステータスプロパティ発見: "${statusProperty}"`);
      
      // ステータスプロパティの詳細情報を取得
      const statusProp = databaseInfo[statusProperty];
      const propertyType = statusProp?.type;
      
      console.log(`[NotionService] ステータスプロパティタイプ: ${propertyType}`);
      
      // ステータス値のマッピング（複数言語・形式対応）
      const statusMapping: { [key: string]: string[] } = {
        'completed': ['completed', '完了', 'done', 'finished', 'Complete', '完了済み'],
        'in-progress': ['in-progress', '進行中', 'in progress', 'working', 'doing', '実行中'],
        'pending': ['pending', '未着手', 'not started', 'todo', '待機中', '開始前'],
        'failed': ['failed', 'error', 'エラー', '失敗', 'Failed']
      };
      
      // 現在の利用可能なオプションを取得
      const availableOptions = propertyType === 'select' ? statusProp.select?.options : 
                              propertyType === 'status' ? statusProp.status?.options : [];
      
      console.log(`[NotionService] 利用可能なステータスオプション:`, 
        availableOptions?.map((opt: any) => opt.name) || 'none');
      
      // 最適なステータス値を検索
      let targetStatusName: string | null = null;
      const candidateNames = statusMapping[status] || [status];
      
      for (const candidate of candidateNames) {
        const matchingOption = availableOptions?.find((opt: any) => 
          opt.name === candidate || 
          opt.name.toLowerCase() === candidate.toLowerCase()
        );
        
        if (matchingOption) {
          targetStatusName = matchingOption.name;
          console.log(`[NotionService] ステータス値マッチング成功: "${candidate}" -> "${targetStatusName}"`);
          break;
        }
      }
      
      if (!targetStatusName) {
        // フォールバック: 利用可能なオプションからそれらしいものを検索
        for (const option of availableOptions || []) {
          const optionName = option.name.toLowerCase();
          if (status === 'completed' && (optionName.includes('完了') || optionName.includes('done') || optionName.includes('complete'))) {
            targetStatusName = option.name;
            break;
          } else if (status === 'in-progress' && (optionName.includes('進行') || optionName.includes('progress') || optionName.includes('実行'))) {
            targetStatusName = option.name;
            break;
          } else if (status === 'pending' && (optionName.includes('未着手') || optionName.includes('pending') || optionName.includes('開始前'))) {
            targetStatusName = option.name;
            break;
          }
        }
        
        if (targetStatusName) {
          console.log(`[NotionService] フォールバック検索成功: "${status}" -> "${targetStatusName}"`);
        }
      }
      
      if (!targetStatusName) {
        console.error(`[NotionService] ステータス値が見つかりません: "${status}"`);
        console.error(`[NotionService] 利用可能オプション:`, availableOptions?.map((opt: any) => opt.name));
        return false;
      }
      
      // プロパティ更新を実行
      const updateData: any = {
        properties: {}
      };
      
      if (propertyType === 'select') {
        updateData.properties[statusProperty] = {
          select: {
            name: targetStatusName
          }
        };
      } else if (propertyType === 'status') {
        updateData.properties[statusProperty] = {
          status: {
            name: targetStatusName
          }
        };
      } else {
        console.error(`[NotionService] サポートされていないプロパティタイプ: ${propertyType}`);
        return false;
      }
      
      console.log(`[NotionService] ステータス更新実行:`, JSON.stringify(updateData, null, 2));
      
      // Notion APIでページを更新
      await this.notion.pages.update({
        page_id: pageId,
        ...updateData
      });
      
      console.log(`[NotionService] ✅ ページステータス更新完了: ${pageId} -> ${targetStatusName}`);
      return true;

    } catch (error: any) {
      console.error(`[NotionService] ページステータス更新エラー (${pageId}):`, error);
      
      // 詳細エラー情報
      if (error?.code) {
        console.error(`[NotionService] Notion APIエラーコード: ${error.code}`);
        console.error(`[NotionService] エラーメッセージ: ${error.message}`);
      }
      
      return false;
    }
  }

  /**
   * 統合レポートページを事前作成（重複防止強化版）
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

      // 統合レポートのタイトルを事業名入りにカスタマイズ
      const integratedReportTitle = `統合調査レポート（${businessName}）`;

      // 🔍 重複チェック: 既存の統合レポートを検索
      const existingIntegratedReport = await this.findExistingResearchPage(
        businessName, 
        integratedReportTitle
      );
      
      if (existingIntegratedReport) {
        console.log(`[NotionService] 既存の統合レポート発見、重複作成をスキップ: ${existingIntegratedReport.url}`);
        return {
          pageId: existingIntegratedReport.pageId,
          url: existingIntegratedReport.url
        };
      }

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
      
      console.log(`[NotionService] 統合レポートページ事前作成完了（重複防止済み）: ${url}`);
      
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
   * 事業名プロパティを動的に検索（強化版）
   * @param properties データベースプロパティ
   * @returns 事業名プロパティ名
   */
  private findBusinessNameProperty(properties: Record<string, any>): string | null {
    console.log('[NotionService] 🔍 事業名プロパティ検索開始');
    console.log('[NotionService] 利用可能なプロパティ:', Object.keys(properties));

    // 事業名として考えられるプロパティ名のパターン（優先順位付き）
    const businessNamePatterns = [
      // 正確なマッチ（最優先）
      'Business Name',
      'business_name', 
      'businessName',
      '事業名',
      'Company Name',
      'company_name',
      'companyName',
      '会社名',
      'Service Name',
      'service_name',
      'serviceName',
      'サービス名',
      'Product Name',
      'product_name',
      'productName',
      '商品名',
      'プロダクト名',
      'Project Name',
      'project_name',
      'projectName',
      'プロジェクト名',
      '名前',
      'Name',
      'name',
      'Title',
      'title',
      'タイトル',
      
      // 部分マッチパターン
      'business',
      'company', 
      'service',
      'product',
      'project',
      '事業',
      '会社',
      'サービス',
      '商品',
      'プロダクト',
      'プロジェクト'
    ];

    // 段階的検索: 完全一致 → 部分一致 → 類似性マッチ
    for (const pattern of businessNamePatterns) {
      // 1. 完全一致検索
      const exactMatch = Object.keys(properties).find(key => 
        key.toLowerCase() === pattern.toLowerCase()
      );
      
      if (exactMatch && properties[exactMatch].type === 'title') {
        console.log(`[NotionService] ✅ 事業名プロパティ（完全一致）: "${exactMatch}"`);
        return exactMatch;
      }
    }

    // 2. 部分一致検索（含む）
    for (const pattern of businessNamePatterns) {
      const partialMatch = Object.keys(properties).find(key => 
        key.toLowerCase().includes(pattern.toLowerCase()) && 
        properties[key].type === 'title'
      );
      
      if (partialMatch) {
        console.log(`[NotionService] ✅ 事業名プロパティ（部分一致）: "${partialMatch}"`);
        return partialMatch;
      }
    }

    // 3. 最初のtitleタイプのプロパティをフォールバック
    const titleProperty = Object.keys(properties).find(key => 
      properties[key].type === 'title'
    );
    
    if (titleProperty) {
      console.log(`[NotionService] ✅ 事業名プロパティ（titleタイプ）: "${titleProperty}"`);
      return titleProperty;
    }

    // 4. 最後の手段: リッチテキストタイプで名前系のプロパティ
    const richTextNameProperty = Object.keys(properties).find(key => 
      properties[key].type === 'rich_text' && 
      (key.toLowerCase().includes('name') || 
       key.toLowerCase().includes('title') ||
       key.includes('名前') || 
       key.includes('タイトル'))
    );
    
    if (richTextNameProperty) {
      console.log(`[NotionService] ✅ 事業名プロパティ（リッチテキスト）: "${richTextNameProperty}"`);
      return richTextNameProperty;
    }

    console.warn('[NotionService] ⚠️ 事業名プロパティが見つかりませんでした');
    console.warn('[NotionService] 📋 利用可能なプロパティ詳細:', 
      Object.entries(properties).map(([key, prop]) => ({ name: key, type: prop.type }))
    );
    
    return null;
  }

  /**
   * サービス仮説の各フィールドに対応するNotionプロパティを動的検索
   * @param properties データベースプロパティ
   * @returns フィールドマッピング
   */
  private createDynamicFieldMapping(properties: Record<string, any>): Record<string, string> {
    console.log('[NotionService] 🔍 動的フィールドマッピング作成開始');
    
    const mapping: Record<string, string> = {};
    const propertyNames = Object.keys(properties);
    
    // サービス仮説フィールドと対応する可能なプロパティ名のパターン
    const fieldPatterns = {
      concept: [
        'concept', 'Concept', 'コンセプト', 'サービスコンセプト', 'プロダクトコンセプト',
        'service_concept', 'product_concept', 'idea', 'アイデア'
      ],
      customerProblem: [
        'customer_problem', 'customerProblem', 'Customer Problem', '顧客課題', '解決したい顧客課題',
        'problem', 'issue', '課題', '問題', 'customer_issue', 'pain_point', 'ペインポイント'
      ],
      targetIndustry: [
        'target_industry', 'targetIndustry', 'Target Industry', '業界', '業種', 'industry',
        '狙っている業種・業界', '対象業界', 'target_market', 'market'
      ],
      targetUsers: [
        'target_users', 'targetUsers', 'Target Users', 'ターゲット', 'ユーザー', '利用者層',
        '想定される利用者層', 'target_customer', 'customer_segment', 'users'
      ],
      competitors: [
        'competitors', 'Competitors', '競合', '競合他社', 'competition', '直接競合・間接競合',
        'competitor_analysis', 'competitive_landscape'
      ],
      revenueModel: [
        'revenue_model', 'revenueModel', 'Revenue Model', '課金モデル', '収益モデル',
        'business_model', 'monetization', 'pricing_model'
      ],
      pricingDirection: [
        'pricing_direction', 'pricingDirection', 'Pricing Direction', '価格設定', '価格戦略',
        '価格帯・価格設定の方向性', 'pricing_strategy', 'price_range'
      ],
      uvp: [
        'uvp', 'UVP', 'Unique Value Proposition', '暫定UVP', '暫定 UVP',
        '暫定UVP（Unique Value Proposition）', '暫定 UVP（Unique Value Proposition）',
        'value_proposition', '価値提案', '独自価値提案'
      ],
      initialKpi: [
        'initial_kpi', 'initialKpi', 'Initial KPI', 'KPI', '初期KPI', '初期 KPI',
        'success_metrics', '成功指標', '目標指標', 'key_metrics'
      ],
      acquisitionChannels: [
        'acquisition_channels', 'acquisitionChannels', 'Acquisition Channels',
        '獲得チャネル仮説', '獲得チャネル', 'marketing_channels', 'channel_strategy'
      ],
      regulatoryTechPrereqs: [
        'regulatory_tech_prereqs', 'regulatoryTechPrereqs', 'Regulatory Tech Prerequisites',
        '規制・技術前提', '技術前提', '規制要件', 'compliance', 'tech_requirements'
      ],
      costStructure: [
        'cost_structure', 'costStructure', 'Cost Structure', 'コスト構造', '想定コスト構造',
        'cost_model', 'expenses', '費用構造'
      ]
    };

    // 各サービス仮説フィールドに対して最適なNotionプロパティを検索
    for (const [serviceField, patterns] of Object.entries(fieldPatterns)) {
      let foundProperty: string | null = null;

      // パターンごとに検索（優先順位順）
      for (const pattern of patterns) {
        // 完全一致検索
        const exactMatch = propertyNames.find(prop => 
          prop.toLowerCase() === pattern.toLowerCase()
        );
        
        if (exactMatch) {
          foundProperty = exactMatch;
          break;
        }

        // 部分一致検索
        const partialMatch = propertyNames.find(prop => 
          prop.toLowerCase().includes(pattern.toLowerCase()) ||
          pattern.toLowerCase().includes(prop.toLowerCase())
        );
        
        if (partialMatch && !foundProperty) {
          foundProperty = partialMatch;
        }
      }

      if (foundProperty) {
        mapping[serviceField] = foundProperty;
        console.log(`[NotionService] ✅ マッピング: ${serviceField} -> "${foundProperty}"`);
      } else {
        console.warn(`[NotionService] ⚠️ プロパティ未発見: ${serviceField}`);
      }
    }

    console.log(`[NotionService] 🎯 動的マッピング完了: ${Object.keys(mapping).length}/${Object.keys(fieldPatterns).length} フィールド対応`);
    return mapping;
  }
}