// src/services/tavilyService.ts
import { ServiceHypothesis } from '../types';

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilyResponse {
  answer?: string;
  query: string;
  results: TavilySearchResult[];
  follow_up_questions?: string[];
  images?: string[];
}

/**
 * Tavily API サービスクラス
 * Web検索とコンテンツ取得によるDeep Research機能
 */
export class TavilyService {
  private apiKey: string;
  private baseUrl: string = 'https://api.tavily.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Web検索を実行
   * @param query 検索クエリ
   * @param options 検索オプション
   * @returns 検索結果
   */
  async search(query: string, options?: {
    searchDepth?: 'basic' | 'advanced';
    maxResults?: number;
    includeImages?: boolean;
    includeAnswer?: boolean;
  }): Promise<TavilyResponse> {
    try {
      const searchOptions = {
        searchDepth: options?.searchDepth || 'advanced',
        maxResults: options?.maxResults || 5,
        includeImages: options?.includeImages || false,
        includeAnswer: options?.includeAnswer || true,
        ...options
      };

      console.log(`[TavilyService] Web検索開始: ${query}`);

      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          query: query,
          search_depth: searchOptions.searchDepth,
          max_results: searchOptions.maxResults,
          include_images: searchOptions.includeImages,
          include_answer: searchOptions.includeAnswer
        })
      });

      if (!response.ok) {
        throw new Error(`Tavily API Error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json() as TavilyResponse;
      console.log(`[TavilyService] Web検索完了: ${result.results?.length || 0}件の結果`);
      
      return result;

    } catch (error) {
      console.error('[TavilyService] Web検索エラー:', error);
      throw new Error(`Tavily検索エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 市場調査用のDeep Research実行
   * @param researchTopic 調査トピック
   * @param serviceHypothesis サービス仮説
   * @returns 詳細な調査結果
   */
  async conductDeepResearch(
    researchTopic: string, 
    serviceHypothesis: ServiceHypothesis
  ): Promise<string> {
    try {
      console.log(`[TavilyService] Deep Research開始: ${researchTopic}`);

      // 1. 基本的な市場調査
      const primaryQuery = this.generateMarketResearchQuery(researchTopic, serviceHypothesis);
      const primaryResults = await this.search(primaryQuery, {
        searchDepth: 'advanced',
        maxResults: 5,
        includeAnswer: true
      });

      // 2. 競合調査
      const competitorQuery = this.generateCompetitorQuery(serviceHypothesis);
      const competitorResults = await this.search(competitorQuery, {
        searchDepth: 'advanced',
        maxResults: 3,
        includeAnswer: true
      });

      // 3. 業界トレンド調査
      const trendQuery = this.generateTrendQuery(serviceHypothesis);
      const trendResults = await this.search(trendQuery, {
        searchDepth: 'advanced',
        maxResults: 3,
        includeAnswer: true
      });

      // 結果を統合して分析レポートを生成
      const consolidatedResults = this.consolidateSearchResults([
        { type: '市場調査', results: primaryResults },
        { type: '競合調査', results: competitorResults },
        { type: 'トレンド調査', results: trendResults }
      ]);

      console.log(`[TavilyService] Deep Research完了`);
      return consolidatedResults;

    } catch (error) {
      console.error('[TavilyService] Deep Research エラー:', error);
      throw new Error(`Deep Research エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 市場調査用の検索クエリ生成
   */
  private generateMarketResearchQuery(topic: string, hypothesis: ServiceHypothesis): string {
    const industry = hypothesis.targetIndustry;
    const keywords = [topic, industry, 'market size', 'growth', '2024', '2025'].join(' ');
    return `${keywords} market research statistics data`;
  }

  /**
   * 競合調査用の検索クエリ生成
   */
  private generateCompetitorQuery(hypothesis: ServiceHypothesis): string {
    const competitors = hypothesis.competitors.split(',').slice(0, 2).join(' OR ');
    const industry = hypothesis.targetIndustry;
    return `${competitors} ${industry} competitor analysis pricing strategy`;
  }

  /**
   * トレンド調査用の検索クエリ生成
   */
  private generateTrendQuery(hypothesis: ServiceHypothesis): string {
    const industry = hypothesis.targetIndustry;
    return `${industry} trends 2024 2025 emerging technologies market opportunities`;
  }

  /**
   * 検索結果を統合して分析レポート生成
   */
  private consolidateSearchResults(searchResults: Array<{
    type: string;
    results: TavilyResponse;
  }>): string {
    let report = '';

    searchResults.forEach(({ type, results }) => {
      report += `\n## ${type}\n\n`;
      
      if (results.answer) {
        report += `### 要約\n${results.answer}\n\n`;
      }

      if (results.results && results.results.length > 0) {
        report += `### 詳細情報\n\n`;
        results.results.forEach((result, index) => {
          report += `**${index + 1}. ${result.title}**\n`;
          report += `${result.content.substring(0, 300)}...\n`;
          report += `出典: ${result.url}\n\n`;
        });
      }
    });

    return report;
  }

  /**
   * API接続テスト
   */
  async testConnection(): Promise<boolean> {
    try {
      const testResult = await this.search('test market research', {
        maxResults: 1,
        searchDepth: 'basic'
      });
      return testResult.results && testResult.results.length > 0;
    } catch (error) {
      console.error('[TavilyService] 接続テストエラー:', error);
      return false;
    }
  }
}
