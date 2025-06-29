import { Router, Request, Response } from 'express';
import { ResearchService } from '../services/researchService';
import { ResearchRequest, ProgressEvent } from '../types';

/**
 * 市場調査API ルーター
 */
export function createResearchRouter(researchService: ResearchService): Router {
  const router = Router();

  /**
   * ヘルスチェック（強化版）
   * GET /api/research/health
   */
  router.get('/health', async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    try {
      console.log('[HealthCheck] ヘルスチェック開始');
      
      // 基本的なサーバー情報
      const serverInfo = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version,
        nodeEnv: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
      };
      
      // サービス状態チェック（タイムアウト付き）
      const healthCheckPromise = researchService.testServices();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('ヘルスチェックタイムアウト')), 30000);
      });
      
      const serviceStatus = await Promise.race([healthCheckPromise, timeoutPromise]) as any;
      const responseTime = Date.now() - startTime;
      
      console.log(`[HealthCheck] 完了 (${responseTime}ms)`);
      
      // 全体的な健康状態を判定
      const isHealthy = serviceStatus.gemini && serviceStatus.notion;
      const status = isHealthy ? 'healthy' : 'degraded';
      const httpStatus = isHealthy ? 200 : 503;
      
      return res.status(httpStatus).json({
        success: isHealthy,
        data: {
          status,
          server: serverInfo,
          services: serviceStatus,
          responseTime: `${responseTime}ms`,
          checks: {
            gemini: serviceStatus.gemini ? 'OK' : 'FAIL',
            notion: serviceStatus.notion ? 'OK' : 'FAIL'
          }
        }
      });
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error('[HealthCheck] エラー:', error);
      
      return res.status(503).json({
        success: false,
        data: {
          status: 'unhealthy',
          responseTime: `${responseTime}ms`,
          timestamp: new Date().toISOString()
        },
        error: {
          error: 'HEALTH_CHECK_FAILED',
          message: error instanceof Error ? error.message : 'ヘルスチェックに失敗しました',
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
   * 市場調査開始（Server-Sent Events）途中再開機能付き
   * POST /api/research/start
   */
  router.post('/start', async (req: Request, res: Response): Promise<void> => {
    try {
      const researchRequest: ResearchRequest = req.body;
      const resumeFromStep = req.body.resumeFromStep ? parseInt(req.body.resumeFromStep, 10) : undefined;
      
      console.log('[ResearchRouter] 調査開始リクエスト受信:', researchRequest.businessName);
      if (resumeFromStep !== undefined) {
        console.log('[ResearchRouter] 再開ステップ:', resumeFromStep);
      }

      // サービス状態確認をスキップ（サーバー起動時に確認済み）
      console.log('[ResearchRouter] サービス状態確認をスキップ、処理を開始します');

      // リクエストバリデーション
      const validation = researchService.validateRequest(researchRequest);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: {
            error: 'VALIDATION_ERROR',
            message: `入力データに不備があります:\n${validation.errors.map(err => `• ${err}`).join('\n')}`,
            details: validation.errors,
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
        // 市場調査を実行（再開機能付き）
        const result = await researchService.conductFullResearch(researchRequest, onProgress, resumeFromStep);
        console.log('[ResearchRouter] 調査完了:', result.businessName);
        
      } catch (error) {
        console.error('[ResearchRouter] 調査実行エラー:', error);
        
        // エラーイベントを送信
        onProgress({
          type: 'error',
          step: resumeFromStep || 0,
          total: 18,
          message: `調査実行エラー: ${error instanceof Error ? error.message : 'Unknown error'}。ステップ${resumeFromStep || 0}から再開できます。`
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
