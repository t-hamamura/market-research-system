/**
 * 市場調査自動化システムの型定義
 */

// サービス仮説の型定義
export interface ServiceHypothesis {
  concept: string;                    // コンセプト（必須）
  customerProblem: string;           // 解決したい顧客課題（必須）
  targetIndustry: string;            // 狙っている業種・業界（必須）
  targetUsers: string;               // 想定される利用者層（必須）
  competitors: string;               // 直接競合・間接競合（必須）
  revenueModel?: string;             // 課金モデル（任意）
  pricingDirection?: string;         // 価格帯・価格設定の方向性（任意）
  uvp?: string;                      // 暫定UVP（任意）
  initialKpi?: string;               // 初期KPI（任意）
  acquisitionChannels?: string;      // 獲得チャネル仮説（任意）
  regulatoryTechPrereqs?: string;    // 規制・技術前提（任意）
  costStructure?: string;            // 想定コスト構造（任意）
}

// 調査リクエストの型定義
export interface ResearchRequest {
  businessName: string;              // 事業名
  serviceHypothesis: ServiceHypothesis; // サービス仮説
}

// 進行状況イベントの型定義
export interface ProgressEvent {
  type: 'progress' | 'complete' | 'error';
  step: number;                      // 現在のステップ
  total: number;                     // 総ステップ数
  message: string;                   // メッセージ
  researchType?: string;             // 調査種別
  notionUrl?: string;                // Notion結果URL
}

// 調査結果の型定義
export interface ResearchResult {
  id: number;                        // 調査ID
  title: string;                     // 調査タイトル
  prompt: string;                    // 使用プロンプト
  result: string;                    // 調査結果
  timestamp: Date;                   // 実行時刻
  status: 'pending' | 'completed' | 'failed'; // ステータス
}

// 統合調査結果の型定義
export interface IntegratedResearchResult {
  businessName: string;              // 事業名
  serviceHypothesis: ServiceHypothesis; // サービス仮説
  researchResults: ResearchResult[]; // 個別調査結果
  summary: string;                   // 統合要約
  notionPageId: string;              // NotionページID
  notionUrl: string;                 // NotionページURL
  completedAt: Date;                 // 完了時刻
}

// 調査プロンプトの型定義
export interface ResearchPrompt {
  id: number;
  title: string;
  prompt: string;
}

// エラーレスポンスの型定義
export interface ErrorResponse {
  error: string;
  message: string;
  timestamp: Date;
}

// APIレスポンスの型定義
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ErrorResponse;
}

// Geminiサービスの設定型
export interface GeminiConfig {
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

// Notionサービスの設定型
export interface NotionConfig {
  token: string;
  databaseId: string;
}

// サーバー設定の型定義
export interface ServerConfig {
  port: number;
  nodeEnv: string;
  gemini: GeminiConfig;
  notion: NotionConfig;
  researchInterval: number;
}

// リクエストバリデーションエラーの型定義
export interface ValidationError {
  field: string;
  message: string;
}

// フロントエンド状態管理の型定義
export interface AppState {
  isLoading: boolean;
  currentStep: number;
  totalSteps: number;
  researchResults: ResearchResult[];
  error: string | null;
  notionUrl: string | null;
}

// SSE接続状態の型定義
export interface SSEConnection {
  eventSource: any | null;
  isConnected: boolean;
  lastEventTime: Date | null;
} 