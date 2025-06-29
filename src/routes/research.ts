import { Router, Request, Response } from 'express';
import { ResearchService } from '../services/researchService';
import { ResearchRequest, ProgressEvent } from '../types';

/**
 * 市場調査API ルーター
 */
export function createResearchRouter(researchService: ResearchService): Router {
  const router = Router();

  /**
   * ヘルスチェック
   * GET /api/research/health
   */
  router.get('/health', async (req: Request, res: Response) => {
    try {
      const serviceStatus = await researchService.testServices();
      
      return res.json({
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: serviceStatus
        }
      });
    } catch (error) {
      console.error('[ResearchRouter] ヘルスチェックエラー:', error);
      return res.status(500).json({
        success: false,
        error: {
          error: 'SERVICE_ERROR',
          message: 'サービスの健康状態チェックに失敗しました',
          timestamp: new Date()
        }
      });
    }
  });

  /**
   * 調査プロンプト一覧取得
   * GET /api/research/prompts
   */
  router.get('/prompts', (req: Request, res: Response) => {
    try {
      const prompts = researchService.getResearchPrompts();
      
      return res.json({
        success: true,
        data: {
          prompts: prompts,
          total: prompts.length
        }
      });
    } catch (error) {
      console.error('[ResearchRouter] プロンプト取得エラー:', error);
      return res.status(500).json({
        success: false,
        error: {
          error: 'SERVICE_ERROR',
          message: 'プロンプト一覧の取得に失敗しました',
          timestamp: new Date()
        }
      });
    }
  });

  /**
   * リクエストバリデーション
   * POST /api/research/validate
   */
  router.post('/validate', (req: Request, res: Response) => {
    try {
      const researchRequest: ResearchRequest = req.body;
      const validation = researchService.validateRequest(researchRequest);
      
      return res.json({
        success: true,
        data: validation
      });
    } catch (error) {
      console.error('[ResearchRouter] バリデーションエラー:', error);
      return res.status(500).json({
        success: false,
        error: {
          error: 'VALIDATION_ERROR',
          message: 'リクエストバリデーションに失敗しました',
          timestamp: new Date()
        }
      });
    }
  });

  /**
   * 市場調査開始（Server-Sent Events）
   * POST /api/research/start
   */
  router.post('/start', async (req: Request, res: Response): Promise<void> => {
    try {
      const researchRequest: ResearchRequest = req.body;
      
      console.log('[ResearchRouter] 調査開始リクエスト受信:', researchRequest.businessName);

      // リクエストバリデーション
      const validation = researchService.validateRequest(researchRequest);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: {
            error: 'VALIDATION_ERROR',
            message: `バリデーションエラー: ${validation.errors.join(', ')}`,
            timestamp: new Date()
          }
        });
        return;
      }

      // Server-Sent Events設定
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
        'Access-Control-Allow-Credentials': 'true'
      });

      // Keep-alive ping
      const pingInterval = setInterval(() => {
        res.write(': ping\n\n');
      }, 30000);

      // 進行状況コールバック関数
      const onProgress = (event: ProgressEvent) => {
        const eventData = JSON.stringify(event);
        res.write(`data: ${eventData}\n\n`);
        
        // 完了またはエラーの場合は接続を閉じる
        if (event.type === 'complete' || event.type === 'error') {
          clearInterval(pingInterval);
          setTimeout(() => {
            res.end();
          }, 1000);
        }
      };

      try {
        // 市場調査を実行
        const result = await researchService.conductFullResearch(researchRequest, onProgress);
        console.log('[ResearchRouter] 調査完了:', result.businessName);
        
      } catch (error) {
        console.error('[ResearchRouter] 調査実行エラー:', error);
        
        // エラーイベントを送信
        onProgress({
          type: 'error',
          step: 0,
          total: 18,
          message: `調査実行エラー: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }

      // クライアント切断時のクリーンアップ
      req.on('close', () => {
        console.log('[ResearchRouter] クライアント切断');
        clearInterval(pingInterval);
        res.end();
      });

    } catch (error) {
      console.error('[ResearchRouter] 開始エンドポイントエラー:', error);
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: {
            error: 'SERVER_ERROR',
            message: `サーバーエラー: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: new Date()
          }
        });
      }
    }
  });

  /**
   * システム情報取得
   * GET /api/research/info
   */
  router.get('/info', (req: Request, res: Response) => {
    try {
      return res.json({
        success: true,
        data: {
          system: '市場調査自動化システム',
          version: '1.0.0',
          description: 'Gemini 2.5とNotionを活用した16種類の市場調査自動実行システム',
          features: [
            '16種類の詳細市場調査',
            'リアルタイム進行状況表示',
            'Notion統合レポート生成',
            '統合分析レポート',
            'Server-Sent Events対応'
          ],
          totalResearchTypes: researchService.getResearchPrompts().length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('[ResearchRouter] システム情報取得エラー:', error);
      return res.status(500).json({
        success: false,
        error: {
          error: 'SERVICE_ERROR',
          message: 'システム情報の取得に失敗しました',
          timestamp: new Date()
        }
      });
    }
  });

  return router;
}

/**
 * エラーハンドリングミドルウェア
 */
export function errorHandler(err: any, req: Request, res: Response, next: any): void {
  console.error('[ResearchRouter] 未処理エラー:', err);
  
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: {
        error: 'INTERNAL_SERVER_ERROR',
        message: '内部サーバーエラーが発生しました',
        timestamp: new Date()
      }
    });
  }
}
