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

// 環境変数を読み込み
dotenv.config();

/**
 * サーバー設定を作成
 */
function createServerConfig(): ServerConfig {
  const requiredEnvVars = ['GEMINI_API_KEY', 'NOTION_TOKEN', 'NOTION_DATABASE_ID'];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`環境変数 ${envVar} が設定されていません`);
    }
  }

  return {
    port: parseInt(process.env.PORT || '3000'),
    nodeEnv: process.env.NODE_ENV || 'development',
    gemini: {
      apiKey: process.env.GEMINI_API_KEY!,
      model: 'gemini-2.5-flash',
      temperature: 0.7,
      maxTokens: 8192
    },
    notion: {
      token: process.env.NOTION_TOKEN!,
      databaseId: process.env.NOTION_DATABASE_ID!
    },
    researchInterval: parseInt(process.env.RESEARCH_INTERVAL || '1000')
  };
}

/**
 * サービスを初期化
 */
async function initializeServices(config: ServerConfig) {
  console.log('[Server] サービス初期化開始...');

  // 基本サービス作成
  const geminiService = new GeminiService(config.gemini);
  const notionService = new NotionService(config.notion);

  // ResearchService作成（Deep Research無し）
  const researchService = new ResearchService(
    geminiService, 
    notionService
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

  console.log('[Server] サービス初期化完了');
  return { geminiService, notionService, researchService };
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

  // 静的ファイル配信
  const publicPath = path.join(__dirname, '..', 'public');
  app.use(express.static(publicPath));
  console.log('[Server] 静的ファイル配信パス:', publicPath);

  // APIルート設定
  app.use('/api/research', createResearchRouter(researchService));

  // ルートパスはindex.htmlを配信
  app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
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

    // 設定を作成
    const config = createServerConfig();
    console.log(`📡 サーバーポート: ${config.port}`);

    // サービスを初期化
    const { researchService } = await initializeServices(config);

    // Expressアプリを作成
    const app = createApp(researchService);

    // サーバーを起動
    const server = app.listen(config.port, () => {
      console.log('');
      console.log('✅ 市場調査自動化システムが起動しました！');
      console.log('');
      console.log(`🌐 ウェブアプリ: http://localhost:${config.port}`);
      console.log(`⚡ API エンドポイント: http://localhost:${config.port}/api/research`);
      console.log('');
    });

    // グレースフルシャットダウン
    process.on('SIGTERM', () => {
      console.log('[Server] SIGTERM受信、グレースフルシャットダウン開始...');
      server.close(() => {
        console.log('[Server] サーバーが正常に終了しました');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('[Server] SIGINT受信、グレースフルシャットダウン開始...');
      server.close(() => {
        console.log('[Server] サーバーが正常に終了しました');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('❌ サーバー起動エラー:', error);
    process.exit(1);
  }
}

// アプリケーション開始
if (require.main === module) {
  startServer();
}

export { createApp, createServerConfig, initializeServices };
