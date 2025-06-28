// src/server.ts
import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { GeminiService } from './services/geminiService';
import { NotionService } from './services/notionService';
import { TavilyService } from './services/tavilyService';
import { DeepResearchService } from './services/deepResearchService';
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

  // Deep Research サービス作成
  let tavilyService: TavilyService | null = null;
  let deepResearchService: DeepResearchService | null = null;
  
  if (process.env.TAVILY_API_KEY && process.env.ENABLE_DEEP_RESEARCH === 'true') {
    console.log('[Server] Deep Research機能を有効化...');
    tavilyService = new TavilyService(process.env.TAVILY_API_KEY);
    deepResearchService = new DeepResearchService(geminiService, tavilyService);
  } else {
    console.log('[Server] Deep Research機能は無効（通常モード）');
  }

  // ResearchService作成
  const researchService = new ResearchService(
    geminiService, 
    notionService, 
    deepResearchService || undefined
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

  if (tavilyService) {
    const tavilyStatus = await tavilyService.testConnection();
    if (!tavilyStatus) {
      console.warn('[Server] ⚠️ Tavily API接続に失敗しました（通常モードで継続）');
    } else {
      console.log('[Server] ✅ Tavily API接続成功 - Deep Research機能有効');
    }
  }

  console.log('[Server] サービス初期化完了');
  return { geminiService, notionService, researchService, tavilyService, deepResearchService };
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

  // JSONパーサー設定（サイズ制限を増加）
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

    // Deep Research機能の状態確認
    const deepResearchEnabled = process.env.TAVILY_API_KEY && process.env.ENABLE_DEEP_RESEARCH === 'true';
    console.log(`🔍 Deep Research: ${deepResearchEnabled ? '✅ 有効' : '❌ 無効'}`);

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
      console.log('📋 利用可能なAPIエンドポイント:');
      console.log(`   GET  /api/research/health      - ヘルスチェック`);
      console.log(`   GET  /api/research/info        - システム情報`);
      console.log(`   GET  /api/research/prompts     - 調査プロンプト一覧`);
      console.log(`   POST /api/research/validate    - リクエストバリデーション`);
      console.log(`   POST /api/research/start       - 市場調査開始 (SSE)`);
      console.log('');
      console.log('🎯 システム機能:');
      console.log('   • 16種類の詳細市場調査');
      console.log('   • リアルタイム進行状況表示');
      console.log('   • Gemini 2.5による高度分析');
      console.log('   • Notion統合レポート生成');
      console.log(`   • ${deepResearchEnabled ? 'Deep Research (Tavily Web検索)' : '通常調査モード'}`);
      console.log('   • Server-Sent Events対応');
      console.log('');
      console.log('📝 使用方法:');
      console.log('   1. ブラウザでWebアプリにアクセス');
      console.log('   2. 事業名とサービス仮説を入力');
      console.log('   3. 「調査開始」ボタンをクリック');
      console.log('   4. リアルタイムで進行状況を確認');
      console.log('   5. 完了後、NotionリンクでレポートをReview');
      console.log('');
      if (deepResearchEnabled) {
        console.log('🔍 Deep Research機能:');
        console.log('   - リアルタイムWeb検索による最新情報取得');
        console.log('   - 具体的な数値データと出典付きレポート');
        console.log('   - 競合情報とトレンド分析の自動統合');
        console.log('');
      }
      console.log('💡 開発者向け:');
      console.log('   - TypeScript開発: npm run dev');
      console.log('   - 本番ビルド: npm run build && npm start');
      console.log('   - ログレベル: INFO');
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
    console.error('');
    console.error('🔧 トラブルシューティング:');
    console.error('   1. 環境変数が正しく設定されているか確認');
    console.error('   2. Gemini APIキーが有効か確認');
    console.error('   3. Notion APIトークンとデータベースIDが正しいか確認');
    console.error('   4. Tavily APIキーが有効か確認（Deep Research使用時）');
    console.error('   5. ポートが他のプロセスで使用されていないか確認');
    console.error('');
    process.exit(1);
  }
}

// アプリケーション開始
if (require.main === module) {
  startServer();
}

export { createApp, createServerConfig, initializeServices };
