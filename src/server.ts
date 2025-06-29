// src/server.ts - 簡略化版
import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { GeminiService } from './services/geminiService';
import { NotionService } from './services/notionService';
import { ResearchService } from './services/researchService';
import { createResearchRouter, errorHandler } from './routes/research';
import { ServerConfig } from './types';
import { DeepResearchService } from './services/deepResearchService';

// 環境変数を読み込み
dotenv.config();

/**
 * サーバー設定を作成
 */
function createServerConfig(): ServerConfig {
  console.log('[Server] 設定作成開始...');
  
  const requiredEnvVars = ['GEMINI_API_KEY', 'NOTION_TOKEN', 'NOTION_DATABASE_ID'];
  const missingVars: string[] = [];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missingVars.push(envVar);
      console.error(`❌ 環境変数 ${envVar} が設定されていません`);
    } else {
      console.log(`✅ 環境変数 ${envVar} 確認済み`);
    }
  }
  
  if (missingVars.length > 0) {
    console.warn(`⚠️ 警告: 必要な環境変数が設定されていません: ${missingVars.join(', ')}`);
    console.warn('⚠️ 一部機能が制限される可能性があります');
    // 一時的にエラーではなく警告として処理
  }

  const config = {
    port: parseInt(process.env.PORT || '3000'),
    nodeEnv: process.env.NODE_ENV || 'development',
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || 'dummy-key',
      model: 'gemini-2.5-flash',
      temperature: 0.7,
      maxTokens: 8192
    },
    notion: {
      token: process.env.NOTION_TOKEN || 'dummy-token',
      databaseId: process.env.NOTION_DATABASE_ID || 'dummy-id'
    },
    researchInterval: parseInt(process.env.RESEARCH_INTERVAL || '1000')
  };
  
  console.log('[Server] 設定作成完了:', {
    port: config.port,
    nodeEnv: config.nodeEnv,
    researchInterval: config.researchInterval
  });
  
  return config;
}

/**
 * サービスを初期化
 */
async function initializeServices(config: ServerConfig) {
  console.log('[Server] サービス初期化開始...');

  // 基本サービス作成
  const geminiService = new GeminiService(config.gemini);
  const notionService = new NotionService(config.notion);

  // DeepResearchService作成
  const deepResearchService = new DeepResearchService(geminiService);

  // ResearchService作成（Deep Research付き）
  const researchService = new ResearchService(
    geminiService, 
    notionService,
    deepResearchService  // Deep Research サービスを追加
  );

  // 接続テスト
  console.log('[Server] API接続テスト開始...');
  const serviceStatus = await researchService.testServices();
  
  if (!serviceStatus.gemini) {
    console.warn('[Server] ⚠️ Gemini API接続に失敗しました');
  } else {
    console.log('[Server] ✅ Gemini API接続成功');
  }

  if (!serviceStatus.notion) {
    console.warn('[Server] ⚠️ Notion API接続に失敗しました');
  } else {
    console.log('[Server] ✅ Notion API接続成功');
  }

  // Deep Research接続テスト
  try {
    const deepResearchTest = await deepResearchService.testConnection();
    if (deepResearchTest) {
      console.log('[Server] ✅ Deep Research機能接続成功');
    } else {
      console.warn('[Server] ⚠️ Deep Research機能接続に失敗しました');
    }
  } catch (error) {
    console.warn('[Server] ⚠️ Deep Research機能テストエラー:', error);
  }

  console.log('[Server] サービス初期化完了');
  return { geminiService, notionService, deepResearchService, researchService };
}

/**
 * Expressアプリを作成
 */
function createApp(researchService: ResearchService): express.Application {
  const app = express();

  // CORS設定
  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control']
  }));

  // JSONパーサー設定
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 静的ファイル配信（パス検証付き）
  const publicPath = path.join(__dirname, '..', 'public');
  
  // パスの存在確認
  try {
    const fs = require('fs');
    if (!fs.existsSync(publicPath)) {
      console.error(`❌ 静的ファイルパスが存在しません: ${publicPath}`);
      // フォールバックパスを試行
      const altPath = path.join(process.cwd(), 'public');
      if (fs.existsSync(altPath)) {
        console.log(`✅ フォールバックパス使用: ${altPath}`);
        app.use(express.static(altPath));
      } else {
        console.error(`❌ フォールバックパスも存在しません: ${altPath}`);
      }
    } else {
      console.log(`✅ 静的ファイル配信パス確認: ${publicPath}`);
      app.use(express.static(publicPath));
      
      // ファイル一覧確認
      const files = fs.readdirSync(publicPath);
      console.log('[Server] 利用可能な静的ファイル:', files.join(', '));
    }
  } catch (error) {
    console.error('[Server] 静的ファイル設定エラー:', error);
  }

  // APIルート設定
  app.use('/api/research', createResearchRouter(researchService));

  // ヘルスチェック用のシンプルなエンドポイント
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // ルートパスはindex.htmlを配信
  app.get('/', (req, res) => {
    try {
      res.sendFile(path.join(publicPath, 'index.html'));
    } catch (error) {
      console.error('[Server] ルートパス配信エラー:', error);
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head><title>市場調査システム</title></head>
        <body>
          <h1>市場調査システム</h1>
          <p>システムが起動中です...</p>
          <script>setTimeout(() => location.reload(), 3000);</script>
        </body>
        </html>
      `);
    }
  });

  // 404エラーハンドリング
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({
        success: false,
        error: {
          error: 'NOT_FOUND',
          message: `APIエンドポイント ${req.path} が見つかりません`,
          timestamp: new Date()
        }
      });
    } else {
      // SPA用：すべてのルートでindex.htmlを配信
      res.sendFile(path.join(publicPath, 'index.html'));
    }
  });

  // グローバルエラーハンドラー
  app.use(errorHandler);

  return app;
}

/**
 * サーバー起動
 */
async function startServer() {
  try {
    console.log('🚀 市場調査自動化システム起動中...');
    console.log(`📍 環境: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📍 Node.js バージョン: ${process.version}`);
    
    // 環境変数の存在確認（デバッグ用）
    const envVars = ['GEMINI_API_KEY', 'NOTION_TOKEN', 'NOTION_DATABASE_ID'];
    envVars.forEach(envVar => {
      const value = process.env[envVar];
      if (value && value !== 'dummy-key' && value !== 'dummy-token' && value !== 'dummy-id') {
        console.log(`✅ ${envVar}: 設定済み (${value.substring(0, 8)}...)`);
      } else {
        console.error(`❌ ${envVar}: 未設定または無効 (${value})`);
      }
    });
    
    // 設定を作成
    const config = createServerConfig();
    console.log(`📡 サーバーポート: ${config.port}`);
    
    // サービスを初期化（エラー耐性付き）
    console.log('[Server] サービス初期化開始...');
    let researchService;
    
    try {
      const initPromise = initializeServices(config);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('サービス初期化がタイムアウトしました')), 30000);
      });
      
      const services = await Promise.race([initPromise, timeoutPromise]) as any;
      researchService = services.researchService;
      console.log('[Server] ✅ サービス初期化完了');
      
    } catch (error) {
      console.error('[Server] ⚠️ サービス初期化エラー:', error);
      console.log('[Server] 🔄 基本モードで続行します...');
      
      // 基本的なサービスオブジェクトを作成（ダミー）
      researchService = {
        testServices: () => Promise.resolve({ gemini: false, notion: false }),
        getResearchPrompts: () => [],
        validateRequest: () => ({ isValid: false, errors: ['サービスが初期化されていません'] }),
        conductFullResearch: () => Promise.reject(new Error('サービスが利用できません'))
      };
    }
    
    // Expressアプリを作成
    const app = createApp(researchService);
    
    // サーバーを起動（タイムアウト設定）
    const server = app.listen(config.port, '0.0.0.0', () => {
      console.log('');
      console.log('✅ 市場調査自動化システムが起動しました！');
      console.log('');
      console.log(`🌐 ウェブアプリ: http://0.0.0.0:${config.port}`);
      console.log(`⚡ API エンドポイント: http://0.0.0.0:${config.port}/api/research`);
      console.log('');
    });
    
    // サーバータイムアウト設定
    server.timeout = 300000; // 5分
    server.keepAliveTimeout = 65000; // 65秒
    server.headersTimeout = 66000; // 66秒
    
    // 未処理例外のキャッチ
    process.on('uncaughtException', (error) => {
      console.error('[Server] 未処理例外:', error);
      gracefulShutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('[Server] 未処理Promise拒否:', reason, 'at:', promise);
      gracefulShutdown('unhandledRejection');
    });
    
    // グレースフルシャットダウン関数
    const gracefulShutdown = (signal: string) => {
      console.log(`[Server] ${signal}受信、グレースフルシャットダウン開始...`);
      
      // 新しい接続を受け付けない
      server.close((err) => {
        if (err) {
          console.error('[Server] サーバークローズエラー:', err);
          process.exit(1);
        }
        
        console.log('[Server] サーバーが正常に終了しました');
        process.exit(0);
      });
      
      // 強制終了のためのタイムアウト
      setTimeout(() => {
        console.error('[Server] 強制終了（タイムアウト）');
        process.exit(1);
      }, 10000);
    };
    
    // シグナルハンドラー
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // ヘルスチェック用のメッセージ
    console.log('[Server] ヘルスチェックエンドポイント: /health');
    
  } catch (error) {
    console.error('❌ サーバー起動エラー:', error);
    
    // 詳細エラー情報
    if (error instanceof Error) {
      console.error('❌ エラー詳細:', {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join('\n')
      });
    }
    
    process.exit(1);
  }
}

// アプリケーション開始
if (require.main === module) {
  startServer();
}

export { createApp, createServerConfig, initializeServices };

