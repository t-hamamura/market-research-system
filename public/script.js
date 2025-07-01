/**
 * SPIRITS AI市場調査システム - フロントエンド JavaScript
 * Gemini AIとNotionを活用した16種類の市場調査自動実行システム
 * Powered by SPIRITS
 */

// ===== グローバル変数とアプリケーション状態 =====
let appState = {
  isLoading: false,
  currentStep: 0,
  totalSteps: 20,
  researchResults: [],
  error: null,
  notionUrl: null,
  eventSource: null,
  isConnected: false,
  lastEventTime: null,
  startTime: null,
  currentPhase: 1,
  completedBatches: 0,
  estimatedTotalTime: 9 * 60, // 9分（秒単位）
  lastFormData: null, // 再開用に前回のフォームデータを保存
  failedStep: null, // 失敗したステップ番号
  stepTimes: [], // 各ステップの実行時間を記録
  averageStepTime: 25 // 初期推定値（秒）
};

// 調査プロンプト一覧（UI表示用）
let researchPrompts = [];

// ===== DOM要素の取得 =====
const elements = {
  // システム情報
  systemStatus: document.getElementById('systemStatus'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  
  // フォーム関連
  formSection: document.getElementById('formSection'),
  researchForm: document.getElementById('researchForm'),
  submitButton: document.getElementById('submitButton'),
  validationErrors: document.getElementById('validationErrors'),
  
  // 一括入力関連（新規）
  toggleBulkInput: document.getElementById('toggleBulkInput'),
  bulkInputContent: document.getElementById('bulkInputContent'),
  copyTemplateBtn: document.getElementById('copyTemplateBtn'),
  bulkParseBtn: document.getElementById('bulkParseBtn'),
  clearBulkBtn: document.getElementById('clearBulkBtn'),
  bulkInput: document.getElementById('bulkInput'),
  bulkValidation: document.getElementById('bulkValidation'),
  
  // 進行状況関連
  progressSection: document.getElementById('progressSection'),
  progressCounter: document.getElementById('progressCounter'),
  progressFill: document.getElementById('progressFill'),
  progressPercentage: document.getElementById('progressPercentage'),
  estimatedTime: document.getElementById('estimatedTime'),
  currentPhaseText: document.getElementById('currentPhaseText'),
  phaseCounter: document.getElementById('phaseCounter'),
  phaseDescription: document.getElementById('phaseDescription'),
  
  // 結果関連
  resultSection: document.getElementById('resultSection'),
  resultTitle: document.getElementById('resultTitle'),
  resultDescription: document.getElementById('resultDescription'),
  notionLink: document.getElementById('notionLink'),
  newResearchButton: document.getElementById('newResearchButton'),
  
  // エラー関連
  errorSection: document.getElementById('errorSection'),
  errorMessage: document.getElementById('errorMessage'),
  retryButton: document.getElementById('retryButton'),
  resetButton: document.getElementById('resetButton')
};

// ===== アプリケーション初期化 =====
document.addEventListener('DOMContentLoaded', function() {
  console.log('[SPIRITS] システム初期化開始');
  
  // イベントリスナーを設定
  setupEventListeners();
  
  // システム状態を確認
  checkSystemHealth();
  
  // 調査プロンプト一覧を取得
  loadResearchPrompts();
  
  console.log('[SPIRITS] システム初期化完了');
});

// ===== イベントリスナー設定 =====
function setupEventListeners() {
  // フォーム送信
  elements.researchForm.addEventListener('submit', handleFormSubmit);
  
  // 新しい調査開始ボタン
  elements.newResearchButton.addEventListener('click', resetApplication);
  
  // リトライボタン
  elements.retryButton.addEventListener('click', retryResearch);
  
  // リセットボタン
  elements.resetButton.addEventListener('click', resetApplication);
  
  // 一括入力機能（新規）
  setupBulkInputListeners();
  
  // ページ離脱時の処理
  window.addEventListener('beforeunload', function(e) {
    if (appState.isLoading && appState.eventSource) {
      e.preventDefault();
      e.returnValue = '市場調査が実行中です。ページを離れますか？';
      return e.returnValue;
    }
  });
  
  // リアルタイムバリデーション
  const formInputs = elements.researchForm.querySelectorAll('input, textarea');
  formInputs.forEach(input => {
    input.addEventListener('blur', validateField);
    input.addEventListener('input', clearFieldError);
  });
}

// ===== システム健康状態チェック（改善版） =====
async function checkSystemHealth() {
  try {
    showLoading('システム接続を確認中...');
    
    // 複数のエンドポイントを試行
    let healthData = null;
    let healthSuccess = false;
    
    // 1. /healthエンドポイントを試行
    try {
      const healthResponse = await fetch('/health');
      const healthDataResponse = await healthResponse.json();
      
      if (healthDataResponse.status === 'ok') {
        healthData = healthDataResponse;
        healthSuccess = true;
        console.log('[App] /health エンドポイント成功:', healthDataResponse);
      }
    } catch (healthError) {
      console.warn('[App] /health エンドポイント失敗:', healthError.message);
    }
    
    // 2. APIヘルスチェックも試行
    try {
      const apiResponse = await fetch('/api/research/health');
      const apiData = await apiResponse.json();
      
      if (apiData.success) {
        console.log('[App] /api/research/health エンドポイント成功:', apiData);
        healthSuccess = true;
        if (!healthData) {
          healthData = { status: 'ok', data: apiData.data };
        }
      }
    } catch (apiError) {
      console.warn('[App] /api/research/health エンドポイント失敗:', apiError.message);
    }
    
    // 結果判定
    if (healthSuccess) {
      updateSystemStatus('success', 'システム確認中...');
      console.log('[App] システム健康状態チェック成功');
    } else {
      // ヘルスチェックが失敗しても、システムは続行可能として扱う
      updateSystemStatus('warning', 'システム稼働中');
      console.warn('[App] ヘルスチェック部分的失敗 - システムは続行可能');
    }
    
  } catch (error) {
    console.error('[App] システム健康状態チェックエラー:', error);
    // 軽微なエラーとして扱い、ユーザーの利用を阻害しない
    updateSystemStatus('warning', 'システム確認中...');
  } finally {
    hideLoading();
  }
}

// ===== 調査プロンプト一覧の取得 =====
async function loadResearchPrompts() {
  try {
    const response = await fetch('/api/research/prompts');
    const data = await response.json();
    
    if (data.success) {
      researchPrompts = data.data.prompts;
      console.log('[App] 調査プロンプト一覧取得成功:', researchPrompts.length, '種類');
      initializeResearchItems();
    } else {
      console.error('[App] 調査プロンプト一覧取得失敗:', data.error);
    }
  } catch (error) {
    console.error('[App] 調査プロンプト一覧取得エラー:', error);
  }
}

// ===== 調査項目UIの初期化（新UI対応） =====
function initializeResearchItems() {
  // 新しいHTML構造では、調査項目は事前に定義されているため
  // 初期状態にリセットするのみ
  const allItems = document.querySelectorAll('.research-item');
  
  allItems.forEach(item => {
    item.classList.remove('in-progress', 'completed', 'failed');
    item.classList.add('pending');
    
    const icon = item.querySelector('.research-item-icon');
    if (icon) {
      icon.textContent = '⏳';
    }
  });
}

// ===== フォーム送信処理 =====
async function handleFormSubmit(event) {
  event.preventDefault();
  
  console.log('[App] フォーム送信開始');
  
  // バリデーション
  const formData = getFormData();
  console.log('[App] 取得したフォームデータ:', formData);
  
  const validation = validateFormData(formData);
  console.log('[App] バリデーション結果:', validation);
  
  if (!validation.isValid) {
    console.error('[App] バリデーションエラー:', validation.errors);
    showValidationErrors(validation.errors);
    return;
  }
  
  hideValidationErrors();
  
  // 調査開始
  startResearch(formData);
}

// ===== フォームデータの取得 =====
function getFormData() {
  const formData = new FormData(elements.researchForm);
  
  return {
    businessName: formData.get('businessName')?.trim() || '',
    serviceHypothesis: {
      concept: formData.get('concept')?.trim() || '',
      customerProblem: formData.get('customerProblem')?.trim() || '',
      targetIndustry: formData.get('targetIndustry')?.trim() || '',
      targetUsers: formData.get('targetUsers')?.trim() || '',
      competitors: formData.get('competitors')?.trim() || '',
      revenueModel: formData.get('revenueModel')?.trim() || '',
      pricingDirection: formData.get('pricingDirection')?.trim() || '',
      uvp: formData.get('uvp')?.trim() || '',
      initialKpi: formData.get('initialKpi')?.trim() || '',
      acquisitionChannels: formData.get('acquisitionChannels')?.trim() || '',
      regulatoryTechPrereqs: formData.get('regulatoryTechPrereqs')?.trim() || '',
      costStructure: formData.get('costStructure')?.trim() || ''
    }
  };
}

// ===== フォームデータのバリデーション =====
function validateFormData(data) {
  const errors = [];
  
  // 事業名チェック
  if (!data.businessName) {
    errors.push('事業名は必須です');
  }
  
  // サービス仮説チェック（必須項目のみ）
  const hypothesis = data.serviceHypothesis;
  const requiredFields = [
    { field: 'concept', label: 'コンセプト' },
    { field: 'customerProblem', label: '解決したい顧客課題' },
    { field: 'targetIndustry', label: '狙っている業種・業界' },
    { field: 'targetUsers', label: '想定される利用者層' },
    { field: 'competitors', label: '直接競合・間接競合' }
  ];
  
  requiredFields.forEach(({ field, label }) => {
    if (!hypothesis[field]) {
      errors.push(`${label}は必須です`);
    }
  });
  
  return { isValid: errors.length === 0, errors };
}

// ===== 個別フィールドのバリデーション =====
function validateField(event) {
  const field = event.target;
  const value = field.value.trim();
  
  // 必須フィールドチェック
  if (field.hasAttribute('required') && !value) {
    showFieldError(field, 'この項目は必須です');
  } else {
    clearFieldError(field);
  }
}

// ===== フィールドエラーの表示 =====
function showFieldError(field, message) {
  clearFieldError(field);
  
  // フィールドにエラースタイルを適用
  field.classList.add('error');
  
  const errorElement = document.createElement('div');
  errorElement.className = 'field-error';
  errorElement.textContent = message;
  
  field.parentNode.appendChild(errorElement);
  
  // エラーアニメーション
  setTimeout(() => {
    field.style.animation = 'errorShake 0.5s ease-out';
    setTimeout(() => {
      field.style.animation = '';
    }, 500);
  }, 50);
}

// ===== フィールドエラーのクリア =====
function clearFieldError(field) {
  // エラークラスを削除
  field.classList.remove('error');
  
  const errorElement = field.parentNode.querySelector('.field-error');
  if (errorElement) {
    errorElement.remove();
  }
}

// ===== バリデーションエラーの表示 =====
function showValidationErrors(errors) {
  const errorList = errors.map(error => `<li>${error}</li>`).join('');
  elements.validationErrors.innerHTML = `<ul>${errorList}</ul>`;
  elements.validationErrors.classList.remove('hidden');
  
  // エラー位置にスクロール
  elements.validationErrors.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ===== バリデーションエラーの非表示 =====
function hideValidationErrors() {
  elements.validationErrors.classList.add('hidden');
}

// ===== 市場調査開始 =====
function startResearch(formData, resumeFromStep = null) {
  console.log('[App] 市場調査開始:', formData.businessName);
  console.log('[App] resumeFromStep パラメータ:', resumeFromStep);
  console.log('[App] resumeFromStep タイプ:', typeof resumeFromStep);
  console.log('[App] resumeFromStep null判定:', resumeFromStep === null);
  
  if (resumeFromStep) {
    console.log('[App] ★再開モード★ ステップ', resumeFromStep, 'から再開');
  } else {
    console.log('[App] ★新規実行モード★ 最初から実行（resumeFromStep未指定）');
  }
  
  // フォームデータを保存（再開用）
  appState.lastFormData = JSON.parse(JSON.stringify(formData));
  
  // 開始時刻を記録
  appState.startTime = new Date();
  appState.isLoading = true;
  appState.currentPhase = resumeFromStep ? Math.ceil(resumeFromStep / 4) : 1;
  appState.completedBatches = 0;
  appState.currentStep = resumeFromStep || 0;
  
  // UI状態を更新
  updateUIForResearchStart();
  
  // 初期フェーズ状態を設定
  updatePhaseDisplay();
  
  // Server-Sent Events接続（再開ステップ付き）
  connectToResearchStream(formData, resumeFromStep);
}

// ===== 改善されたSSE接続機能 =====
function connectToResearchStream(formData, resumeFromStep = null) {
  try {
    console.log('[App] SSE接続開始');
    
    // 接続状態をリセット
    appState.connectionRetryCount = 0;
    appState.maxRetries = 3;
    appState.isReconnecting = false;
    
    // 既存の接続があれば閉じる
    if (appState.eventSource) {
      appState.eventSource.close();
    }
    
    // リクエストボディに再開ステップを含める
    const requestBody = { ...formData };
    console.log('[App] ベースリクエストボディ:', requestBody);
    
    if (resumeFromStep !== null) {
      console.log('[App] resumeFromStep を追加:', resumeFromStep);
      requestBody.resumeFromStep = resumeFromStep;
    } else {
      console.log('[App] resumeFromStep は null なので追加しません');
    }
    
    console.log('[App] 最終リクエストボディ:', requestBody);
    console.log('[App] resumeFromStep フィールド存在確認:', 'resumeFromStep' in requestBody);
    console.log('[App] resumeFromStep 値確認:', requestBody.resumeFromStep);
    
    // 接続タイムアウトを設定（30秒）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn('[App] SSE接続タイムアウト（30秒）');
      controller.abort();
    }, 30000);
    
    // EventSourceは直接POSTをサポートしないため、fetchでPOSTしてからSSEを受信
    fetch('/api/research/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    }).then(async response => {
      // タイムアウトをクリア
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // エラーレスポンスの詳細を取得
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const errorData = await response.json();
          if (errorData.error && errorData.error.message) {
            errorMessage = errorData.error.message;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (e) {
          // JSONパースエラーの場合、レスポンステキストを取得
          try {
            const errorText = await response.text();
            if (errorText && errorText.length < 500) {
              errorMessage = errorText;
            }
          } catch (e2) {
            // テキスト取得も失敗した場合は元のエラーメッセージを使用
          }
        }
        
        throw new Error(errorMessage);
      }
      
      // レスポンスストリームを読み込み
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let lastActivityTime = Date.now();
      
      // ハートビート監視（60秒間活動がないと接続切断とみなす）
      const heartbeatInterval = setInterval(() => {
        const now = Date.now();
        if (now - lastActivityTime > 60000) {
          console.warn('[App] ハートビートタイムアウト - 接続を再試行します');
          clearInterval(heartbeatInterval);
          handleConnectionLoss(formData, resumeFromStep);
        }
      }, 10000);
      
      function readStream() {
        reader.read().then(({ done, value }) => {
          lastActivityTime = Date.now(); // 活動時間を更新
          
          if (done) {
            console.log('[App] SSEストリーム終了');
            clearInterval(heartbeatInterval);
            handleResearchComplete();
            return;
          }
          
          // チャンクをデコードして処理
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          lines.forEach(line => {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                handleProgressEvent(data);
              } catch (error) {
                console.error('[App] SSEデータパースエラー:', error);
                console.error('[App] 問題のあるデータ:', line);
              }
            }
          });
          
          // 次のチャンクを読み込み
          readStream();
        }).catch(error => {
          clearInterval(heartbeatInterval);
          console.error('[App] SSEストリーム読み込みエラー:', error);
          
          // ネットワークエラーの場合は再接続を試行
          if (error.name === 'NetworkError' || error.message.includes('network') || error.message.includes('fetch')) {
            console.log('[App] ネットワークエラーを検出 - 再接続を試行します');
            handleConnectionLoss(formData, resumeFromStep);
          } else {
            handleResearchError(`接続エラー: ${error.message}`);
          }
        });
      }
      
      readStream();
      
    }).catch(error => {
      clearTimeout(timeoutId);
      console.error('[App] 調査開始エラー:', error);
      
      // AbortErrorの場合（タイムアウト）
      if (error.name === 'AbortError') {
        console.log('[App] 接続タイムアウト - 再接続を試行します');
        handleConnectionLoss(formData, resumeFromStep);
      } 
      // ネットワークエラーの場合
      else if (error.name === 'NetworkError' || error.message.includes('network') || error.message.includes('fetch')) {
        console.log('[App] ネットワークエラー - 再接続を試行します');
        handleConnectionLoss(formData, resumeFromStep);
      } 
      // その他のエラー
      else {
        handleResearchError(error.message);
      }
    });
    
  } catch (error) {
    console.error('[App] SSE接続エラー:', error);
    handleResearchError(`接続エラー: ${error.message}`);
  }
}

// ===== 進行状況イベントの処理 =====
function handleProgressEvent(event) {
  console.log('[App] 進行状況イベント:', event);
  
  appState.lastEventTime = new Date();
  
  switch (event.type) {
    case 'progress':
      updateProgress(event);
      break;
    case 'complete':
      handleResearchSuccess(event);
      break;
    case 'error':
      handleResearchError(event.message);
      break;
    default:
      console.warn('[App] 未知の進行状況イベント:', event);
  }
}

// ===== 進行状況の更新 =====
function updateProgress(data) {
  // HTMLに存在する要素IDを使用
  const progressFill = document.getElementById('progressFill');
  const progressPercentage = document.getElementById('progressPercentage');
  const progressCounter = document.getElementById('progressCounter');
  const estimatedTime = document.getElementById('estimatedTime');
  const currentPhaseText = document.getElementById('currentPhaseText');
  const phaseDescription = document.getElementById('phaseDescription');
  
  // 基本的な進行状況を計算
  const percentage = Math.round((data.step / data.total) * 100);
  const isCompleted = data.step >= data.total;
  
  console.log(`[Progress] ステップ ${data.step}/${data.total} (${percentage}%) - ${data.message}`);
  
  // プログレスバーの更新
  if (progressFill) {
    progressFill.style.width = `${percentage}%`;
    
    // 完了時の色変更
    if (isCompleted) {
      progressFill.style.backgroundColor = '#28a745'; // 緑色
    } else {
      progressFill.style.backgroundColor = '#4A90C2'; // 青色
    }
  }
  
  // パーセント表示の更新
  if (progressPercentage) {
    progressPercentage.textContent = `${percentage}%`;
  }
  
  // カウンター表示の更新
  if (progressCounter) {
    progressCounter.textContent = `${data.step}/${data.total}`;
  }
  
  // フェーズ情報の更新
  if (currentPhaseText && phaseDescription) {
    let phaseInfo = getPhaseInfo(data.step);
    currentPhaseText.textContent = phaseInfo.title;
    
    if (data.type === 'progress' && data.researchType) {
      const researchIcon = getResearchIcon(data.researchType);
      phaseDescription.innerHTML = `${researchIcon} ${data.message}`;
    } else {
      phaseDescription.textContent = phaseInfo.description;
    }
  }
  
  // 調査項目の状態更新
  updateResearchItemsStatus(data.step, data.researchType);
  
  // 時間予測の更新
  updateTimeEstimate();
  
  // 完了状況の全体管理
  if (isCompleted && appState.isLoading) {
    appState.isLoading = false;
    console.log('[Progress] 全調査完了 - UI状態をリセット');
    
    // 完了表示
    if (estimatedTime) {
      estimatedTime.textContent = '完了！';
    }
    
    // 完了サマリー表示
    setTimeout(() => {
      showCompletionSummary(data);
    }, 1000);
  }
  
  // アプリケーション状態の更新
  appState.currentStep = data.step;
  appState.lastProgressUpdate = new Date();
}

// ===== フェーズ表示の更新 =====
function updatePhaseDisplay() {
  const phaseData = getPhaseData(appState.currentPhase);
  
  if (elements.currentPhaseText) {
    elements.currentPhaseText.textContent = phaseData.title;
  }
  
  if (elements.phaseCounter) {
    elements.phaseCounter.textContent = `${appState.currentPhase}/3`;
  }
  
  if (elements.phaseDescription) {
    elements.phaseDescription.textContent = phaseData.description;
  }
  
  // フェーズグループの状態更新
  updatePhaseGroupStatus();
}

// ===== ステップからフェーズを更新（統合レポート事前作成対応） =====
function updatePhaseFromStep(step) {
  let newPhase = 1;
  
  if (step <= 3) {
    newPhase = 1; // Phase 1: 事前作成フェーズ（調査項目 + 統合レポート）
  } else if (step <= 19) {
    newPhase = 2; // Phase 2: 調査実行フェーズ（16種類の調査）
  } else {
    newPhase = 3; // Phase 3: 統合レポート更新フェーズ
  }
  
  if (newPhase !== appState.currentPhase) {
    appState.currentPhase = newPhase;
    updatePhaseDisplay();
  }
}

// ===== フェーズデータの取得（統合レポート事前作成対応） =====
function getPhaseData(phase) {
  const phases = {
    1: {
      title: 'Phase 1: 事前作成フェーズ',
      description: '16種類の調査項目と統合レポートページをNotionに事前作成し、進行状況の可視化を準備しています'
    },
    2: {
      title: 'Phase 2: 調査実行フェーズ',
      description: '各調査項目を順次実行し、リアルタイムでステータスを更新しています'
    },
    3: {
      title: 'Phase 3: 統合レポート更新',
      description: '事前作成した統合レポートページに全調査結果を統合し、包括的な分析内容を追加しています'
    }
  };
  
  return phases[phase] || phases[1];
}

// ===== フェーズグループの状態更新（3フェーズ構成対応） =====
function updatePhaseGroupStatus() {
  // HTMLのdata-phase属性を使用してフェーズグループを取得
  for (let i = 1; i <= 3; i++) {
    const phaseGroup = document.querySelector(`.phase-group[data-phase="${i}"]`);
    
    if (phaseGroup) {
      phaseGroup.classList.remove('active', 'completed');
      
      if (i < appState.currentPhase) {
        // 完了したフェーズ
        phaseGroup.classList.add('completed');
        console.log(`[App] フェーズ${i}を完了状態に更新`);
      } else if (i === appState.currentPhase) {
        // 現在のフェーズ
        phaseGroup.classList.add('active');
        console.log(`[App] フェーズ${i}をアクティブ状態に更新`);
      } else {
        // 未開始のフェーズ
        console.log(`[App] フェーズ${i}は未開始状態を維持`);
      }
    } else {
      console.warn(`[App] フェーズグループ${i}が見つかりません`);
    }
  }
}

// ===== 時間予測の更新（改良版） =====
function updateTimeEstimate() {
  if (!appState.startTime || !elements.estimatedTime) return;
  
  const currentTime = new Date();
  const elapsedSeconds = Math.floor((currentTime - appState.startTime) / 1000);
  const progress = appState.currentStep / appState.totalSteps;
  
  // フェーズ別の想定実行時間（秒）- 事前作成→ステータス更新方式で効率化
  const phaseEstimates = {
    1: 60,   // Phase 1: 事前作成フェーズ (1分) - 事前作成により高速化
    2: 320,  // Phase 2: 調査実行フェーズ (5分20秒) - 16調査の順次実行
    3: 100   // Phase 3: 統合レポート生成 (1分40秒) - 統合処理
  };
  
  if (progress > 0.05) {  // 最低5%進行してから予測開始
    let remainingSeconds = 0;
    
    // 複数の予測方法を組み合わせて精度向上
    const predictions = [];
    
    // 1. 線形予測（従来の方法）
    const linearEstimate = Math.floor(elapsedSeconds / progress) - elapsedSeconds;
    predictions.push(Math.max(0, linearEstimate));
    
    // 2. フェーズベース予測（3フェーズ構成対応）
    let currentPhase = 1;
    let phaseRemainingTime = 0;
    
    // 現在のフェーズと進行状況を計算
    if (appState.currentStep <= 2) {
      currentPhase = 1;
      const phaseProgress = appState.currentStep / 2;
      const currentPhaseRemaining = phaseEstimates[1] * (1 - phaseProgress);
      phaseRemainingTime = currentPhaseRemaining + phaseEstimates[2] + phaseEstimates[3];
    } else if (appState.currentStep <= 18) {
      currentPhase = 2;
      const stepsInPhase2 = appState.currentStep - 2;
      const phaseProgress = stepsInPhase2 / 16;
      const currentPhaseRemaining = phaseEstimates[2] * (1 - phaseProgress);
      phaseRemainingTime = currentPhaseRemaining + phaseEstimates[3];
    } else {
      currentPhase = 3;
      const stepsInPhase3 = appState.currentStep - 18;
      const phaseProgress = stepsInPhase3 / 1;
      const currentPhaseRemaining = phaseEstimates[3] * (1 - phaseProgress);
      phaseRemainingTime = currentPhaseRemaining;
    }
    
    phaseRemainingTime += currentPhaseRemaining;
    predictions.push(Math.max(0, phaseRemainingTime));
    
    // 3. 適応的予測（実際の進行速度に基づく）
    if (appState.currentStep >= 2) {
      const averageTimePerStep = elapsedSeconds / appState.currentStep;
      const adaptiveEstimate = averageTimePerStep * (appState.totalSteps - appState.currentStep);
      predictions.push(Math.max(0, adaptiveEstimate));
    }
    
    // 予測値の中央値を採用（外れ値の影響を軽減）
    predictions.sort((a, b) => a - b);
    const medianIndex = Math.floor(predictions.length / 2);
    remainingSeconds = Math.floor(predictions[medianIndex]);
    
    // 最小残り時間を設定（10秒未満は「まもなく完了」）
    if (remainingSeconds < 10) {
      elements.estimatedTime.textContent = 'まもなく完了';
    } else if (remainingSeconds < 60) {
      // 1分未満は秒のみ表示
      elements.estimatedTime.textContent = `約${remainingSeconds}秒`;
    } else {
      // 1分以上は分と秒で表示
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      
      if (seconds > 10) {
        elements.estimatedTime.textContent = `約${minutes}分${seconds}秒`;
      } else {
        // 秒が10秒以下の場合は分のみ表示（見やすさ向上）
        elements.estimatedTime.textContent = `約${minutes}分`;
      }
    }
    
    // デバッグ用ログ（開発環境のみ）
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      console.log(`[TimeEstimate] Progress: ${(progress * 100).toFixed(1)}%, Predictions: [${predictions.map(p => Math.floor(p)).join(', ')}]s, Selected: ${remainingSeconds}s`);
    }
    
  } else {
    // 進行率が5%未満の場合は初期予測を表示
    const totalEstimatedTime = Object.values(phaseEstimates).reduce((sum, time) => sum + time, 0);
    const minutes = Math.floor(totalEstimatedTime / 60);
    const seconds = totalEstimatedTime % 60;
    
    if (elapsedSeconds < 30) {
      // 開始30秒以内は全体予測時間を表示
      elements.estimatedTime.textContent = `約${minutes}分${seconds}秒（予測）`;
    } else {
      // 30秒以上経過したら簡易予測を開始
      const simpleEstimate = Math.max(0, totalEstimatedTime - elapsedSeconds);
      const estMinutes = Math.floor(simpleEstimate / 60);
      const estSeconds = Math.floor(simpleEstimate % 60);
      
      if (estMinutes > 0) {
        elements.estimatedTime.textContent = `約${estMinutes}分${estSeconds > 10 ? estSeconds + '秒' : ''}`;
      } else {
        elements.estimatedTime.textContent = `約${estSeconds}秒`;
      }
    }
  }
}

// ===== 調査項目の状態更新（統合レポート事前作成対応・進行状況表示強化） =====
function updateResearchItemsStatus(step, researchType) {
  console.log(`[Frontend] 調査項目ステータス更新開始: Step ${step}, Type: ${researchType}`);
  
  // 調査項目マッピング（統合レポート事前作成対応）
  const researchItems = {
    // Phase 1: 事前作成フェーズ（ステップ1-3）
    1: 'initialization',        // 初期化
    2: 'pre_creation',         // 調査項目事前作成
    3: 'integration_creation', // 統合レポート事前作成
    
    // Phase 2: 調査実行フェーズ（ステップ4-19：16種類の調査）
    4: 'market_size_research',           // 1. 市場規模と成長性の調査
    5: 'pestel_analysis',                // 2. PESTEL分析の調査
    6: 'competitor_product_analysis',    // 3. 競合の製品特徴・戦略分析
    7: 'competitor_strategy_analysis',   // 4. 競合の経営戦略変遷・顧客離脱理由
    8: 'customer_segment_analysis',      // 5. 顧客セグメント・意思決定プロセス分析
    9: 'customer_emotion_analysis',      // 6. 顧客感情・潜在ニーズ・情報収集行動マッピング
    10: 'product_market_fit_analysis',   // 7. プロダクト市場適合性と価格戦略
    11: 'marketing_tactics_analysis',    // 8. マーケティング戦術分析
    12: 'brand_positioning_analysis',    // 9. ブランドポジショニングとコミュニケーション
    13: 'technology_security_analysis',  // 10. テクノロジートレンド・セキュリティ分析
    14: 'partnership_strategy_analysis', // 11. パートナーシップ戦略とエコシステム形成
    15: 'risk_scenario_analysis',        // 12. リスク・シナリオ分析
    16: 'kpi_measurement_design',        // 13. KPI・測定方法の設計
    17: 'legal_compliance_analysis',     // 14. 法務・コンプライアンスリスク分析
    18: 'research_method_proposal',      // 15. 効果的なリサーチ手法の提案
    19: 'pmf_research_design',           // 16. PMF前特化リサーチ設計
    
    // Phase 3: 統合レポート更新フェーズ（ステップ20）
    20: 'integration_report'             // 統合レポート更新
  };

  // 現在実行中の調査項目名を取得
  const researchTitles = {
    'market_size_research': '市場規模と成長性',
    'pestel_analysis': 'PESTEL分析',
    'competitor_product_analysis': '競合製品・戦略分析',
    'competitor_strategy_analysis': '競合経営戦略・離脱分析',
    'customer_segment_analysis': '顧客セグメント・意思決定分析',
    'customer_emotion_analysis': '顧客感情・潜在ニーズ分析',
    'product_market_fit_analysis': 'プロダクト市場適合性・価格戦略',
    'marketing_tactics_analysis': 'マーケティング戦術分析',
    'brand_positioning_analysis': 'ブランドポジショニング',
    'technology_security_analysis': 'テクノロジー・セキュリティ分析',
    'partnership_strategy_analysis': 'パートナーシップ戦略',
    'risk_scenario_analysis': 'リスク・シナリオ分析',
    'kpi_measurement_design': 'KPI・測定方法設計',
    'legal_compliance_analysis': '法務・コンプライアンス分析',
    'research_method_proposal': '効果的リサーチ手法提案',
    'pmf_research_design': 'PMF前特化リサーチ設計',
    'integration_report': '統合レポート更新'
  };

  console.log(`[UpdateResearchItems] ステップ${step}: ${researchType} の状態を更新`);

  // Phase 1: 事前作成フェーズ（ステップ1-3）
  if (step <= 3) {
    if (step === 1) {
      updateResearchItemStatus('initialization', 'in-progress');
      // 全調査項目を未着手状態に設定
      for (let i = 4; i <= 20; i++) {
        const itemId = researchItems[i];
        if (itemId) {
          updateResearchItemStatus(itemId, 'pending');
        }
      }
    } else if (step === 2) {
      updateResearchItemStatus('initialization', 'completed');
      updateResearchItemStatus('pre_creation', 'in-progress');
    } else if (step === 3) {
      updateResearchItemStatus('initialization', 'completed');
      updateResearchItemStatus('pre_creation', 'completed');
      updateResearchItemStatus('integration_creation', 'in-progress');
    }
  }
  // Phase 2: 調査実行フェーズ（ステップ4-19）
  else if (step <= 19) {
    // 事前作成完了
    updateResearchItemStatus('initialization', 'completed');
    updateResearchItemStatus('pre_creation', 'completed');
    updateResearchItemStatus('integration_creation', 'completed');
    
    // 現在実行中の調査
    const currentItemId = researchItems[step];
    if (currentItemId) {
      updateResearchItemStatus(currentItemId, 'in-progress');
    }
    
    // 完了済みの調査（現在のステップより前）
    for (let i = 4; i < step; i++) {
      const itemId = researchItems[i];
      if (itemId) {
        updateResearchItemStatus(itemId, 'completed');
      }
    }
    
    // 未着手の調査（現在のステップより後）
    for (let i = step + 1; i <= 19; i++) {
      const itemId = researchItems[i];
      if (itemId) {
        updateResearchItemStatus(itemId, 'pending');
      }
    }
    
    // 統合レポート更新は未着手
    updateResearchItemStatus('integration_report', 'pending');
  }
  // Phase 3: 統合レポート更新フェーズ（ステップ20）
  else {
    // 全調査完了
    updateResearchItemStatus('initialization', 'completed');
    updateResearchItemStatus('pre_creation', 'completed');
    updateResearchItemStatus('integration_creation', 'completed');
    for (let i = 4; i <= 19; i++) {
      const itemId = researchItems[i];
      if (itemId) {
        updateResearchItemStatus(itemId, 'completed');
      }
    }
    
    // 統合レポート更新中
    updateResearchItemStatus('integration_report', 'in-progress');
  }
  
  // 現在実行中の調査項目を表示更新
  updateCurrentResearchDisplay(step, researchItems, researchTitles);
}

// ===== 現在実行中の調査を表示更新 =====
function updateCurrentResearchDisplay(step, researchItems, researchTitles) {
  const currentItemId = researchItems[step];
  const currentTitle = researchTitles[currentItemId];
  
  console.log(`[Frontend] 現在の調査表示更新: ${currentTitle} (Step ${step})`);
  
  // 現在実行中の調査項目を強調表示
  if (currentItemId && currentTitle) {
    // ページタイトル更新
    if (step >= 4 && step <= 19) {
      document.title = `🔄 ${currentTitle} 実行中 - AI市場調査システム`;
    } else if (step <= 3) {
      document.title = `⚙️ 事前作成フェーズ - AI市場調査システム`;
    } else {
      document.title = `📊 統合レポート生成中 - AI市場調査システム`;
    }
    
    // プログレス表示の詳細情報更新
    const progressDetails = document.querySelector('.progress-details');
    if (progressDetails) {
      let phaseText = '';
      let statusText = '';
      
      if (step <= 3) {
        phaseText = 'Phase 1: 事前作成フェーズ';
        statusText = 'Notionページの準備中...';
      } else if (step <= 19) {
        phaseText = 'Phase 2: 調査実行フェーズ';
        statusText = `🔍 ${currentTitle} を実行中...`;
      } else {
        phaseText = 'Phase 3: 統合レポート生成';
        statusText = '📊 全調査結果を統合中...';
      }
      
      progressDetails.innerHTML = `
        <div class="current-phase">${phaseText}</div>
        <div class="current-status">${statusText}</div>
      `;
    }
    
    // すべてのアイコンを一旦グレーアウト
    const allItems = document.querySelectorAll('[data-id]');
    allItems.forEach(item => {
      if (!item.classList.contains('completed')) {
        const icon = item.querySelector('.research-item-icon');
        if (icon && icon.textContent !== '✅') {
          icon.textContent = '⏳';
          item.style.opacity = '0.6';
        }
      }
    });
    
    // 現在実行中の項目を強調
    const currentItem = document.querySelector(`[data-id="${currentItemId}"]`);
    if (currentItem) {
      currentItem.style.opacity = '1.0';
      currentItem.style.border = '2px solid #4A90C2';
      currentItem.style.boxShadow = '0 4px 12px rgba(74, 144, 194, 0.3)';
      
      // 滑らかにスクロールして表示
      currentItem.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }
}

// ===== 調査項目の状態更新（強化版UI対応） =====
function updateResearchItemStatus(itemId, status) {
  // 新しいHTML構造での要素を検索
  const item = document.querySelector(`[data-id="${itemId}"]`);
  
  if (item) {
    console.log(`[UpdateResearchItemStatus] 項目「${itemId}」を「${status}」に更新`);
    
    // 既存のステータスクラスを削除
    item.classList.remove('pending', 'in-progress', 'completed', 'failed');
    item.classList.add(status);
    
    // アイコンを更新
    const icon = item.querySelector('.research-item-icon');
    if (icon) {
      switch (status) {
        case 'in-progress':
          icon.textContent = '🔄';
          console.log(`[UpdateResearchItemStatus] 「${itemId}」のアイコンを🔄に変更`);
          break;
        case 'completed':
          icon.textContent = '✅';
          console.log(`[UpdateResearchItemStatus] 「${itemId}」のアイコンを✅に変更`);
          break;
        case 'failed':
          icon.textContent = '❌';
          console.log(`[UpdateResearchItemStatus] 「${itemId}」のアイコンを❌に変更`);
          break;
        default:
          icon.textContent = '⏳';
          console.log(`[UpdateResearchItemStatus] 「${itemId}」のアイコンを⏳に変更`);
      }
    } else {
      console.warn(`[UpdateResearchItemStatus] アイコン要素が見つかりません: ${itemId}`);
    }
    
    // プログレスバーも更新
    const progressFill = item.querySelector('.research-progress-fill');
    if (progressFill) {
      switch (status) {
        case 'in-progress':
          progressFill.style.width = '50%';
          console.log(`[UpdateResearchItemStatus] 「${itemId}」のプログレスバーを50%に設定`);
          break;
        case 'completed':
          progressFill.style.width = '100%';
          console.log(`[UpdateResearchItemStatus] 「${itemId}」のプログレスバーを100%に設定`);
          break;
        case 'failed':
          progressFill.style.width = '100%';
          progressFill.style.backgroundColor = '#ef4444';
          console.log(`[UpdateResearchItemStatus] 「${itemId}」のプログレスバーをエラー表示に設定`);
          break;
        default:
          progressFill.style.width = '0%';
          progressFill.style.backgroundColor = '';
      }
    }
  } else {
    console.warn(`[UpdateResearchItemStatus] 要素が見つかりません: data-id="${itemId}"`);
    // デバッグ用: 存在する要素を確認
    const allItems = document.querySelectorAll('[data-id]');
    console.log(`[UpdateResearchItemStatus] 利用可能な要素:`, Array.from(allItems).map(el => el.getAttribute('data-id')));
  }
}

// ===== 調査成功処理（事前作成→ステータス更新方式対応） =====
function handleResearchSuccess(event) {
  console.log('[App] 調査成功:', event);
  
  // 最終項目（統合レポート）を完了状態に
  updateResearchItemStatus('integration_report', 'completed');
  
  // プログレスバーを100%に
  elements.progressFill.style.width = '100%';
  elements.progressPercentage.textContent = '100%';
  elements.progressCounter.textContent = `20/20`;
  
  // 現在のフェーズを最終完了に
  appState.currentPhase = 3;
  updatePhaseDisplay();
  
  // 現在の調査表示を更新
  const icon = elements.currentResearchType?.querySelector('.research-icon');
  const text = elements.currentResearchType?.querySelector('.research-text');
  
  if (icon && text) {
    icon.textContent = '✅';
    text.textContent = '調査完了';
  }
  
  // 時間予測を完了表示に
  if (elements.estimatedTime) {
    elements.estimatedTime.textContent = '完了';
  }
  
  // 結果画面を表示
  if (event.notionUrl) {
    appState.notionUrl = event.notionUrl;
    showResultSection(event.notionUrl);
  } else {
    showResultSection();
  }
  
  // 状態をリセット
  appState.isLoading = false;
  
  console.log('[App] 事前作成→ステータス更新方式による調査完了');
}

// ===== 調査エラー処理（改善版） =====
function handleResearchError(message) {
  console.error('[App] 調査エラー:', message);
  
  appState.error = message;
  appState.isLoading = false;
  appState.failedStep = appState.currentStep; // 失敗したステップを記録
  
  // エラー内容を分析してより詳細なメッセージを生成
  let enhancedMessage = message || '予期しないエラーが発生しました。';
  
  // 特定のエラーパターンに対する追加情報
  if (message && message.includes('validation_error')) {
    enhancedMessage = `入力データの検証でエラーが発生しました。\n\n${message}\n\n入力内容をご確認の上、再度お試しください。`;
  } else if (message && (message.includes('network') || message.includes('fetch') || message.includes('Failed to fetch'))) {
    enhancedMessage = `ネットワーク接続エラーが発生しました。\n\n原因: ${message}\n\nインターネット接続をご確認の上、再度お試しください。`;
  } else if (message && message.includes('timeout')) {
    enhancedMessage = `処理がタイムアウトしました。\n\n原因: ${message}\n\nサーバーが一時的に混雑している可能性があります。少し時間をおいて再度お試しください。`;
  } else if (message && (message.includes('500') || message.includes('Internal Server Error'))) {
    enhancedMessage = `サーバーエラーが発生しました。\n\n原因: ${message}\n\n一時的な問題の可能性があります。再度お試しいただくか、管理者にお問い合わせください。`;
  } else if (message && message.includes('API')) {
    enhancedMessage = `API連携でエラーが発生しました。\n\n原因: ${message}\n\nGemini APIまたはNotion APIとの通信に問題が発生しています。`;
  } else if (message && message.includes('body failed validation')) {
    enhancedMessage = `Notion連携でデータ形式エラーが発生しました。\n\n原因: ${message}\n\nシステムで自動修正を試行中です。再度お試しください。`;
  }
  
  console.log(`[App] 強化されたエラーメッセージ: ${enhancedMessage}`);
  showErrorSection(enhancedMessage);
}

// ===== 調査完了処理 =====
function handleResearchComplete() {
  console.log('[App] 調査完了');
  
  if (appState.eventSource) {
    appState.eventSource.close();
    appState.eventSource = null;
  }
  
  appState.isConnected = false;
}

// ===== UI状態の更新 =====
function updateUIForResearchStart() {
  // フォームセクションを非表示
  elements.formSection.classList.add('hidden');
  
  // 進行状況セクションを表示
  elements.progressSection.classList.remove('hidden');
  
  // 結果・エラーセクションを非表示
  elements.resultSection.classList.add('hidden');
  elements.errorSection.classList.add('hidden');
  
  // 送信ボタンを無効化
  elements.submitButton.disabled = true;
}

// ===== 結果セクションの表示 =====
function showResultSection(notionUrl) {
  // セクションの切り替え
  elements.progressSection.classList.add('hidden');
  elements.errorSection.classList.add('hidden');
  elements.resultSection.classList.remove('hidden');
  
  // Notionリンクの設定
  if (notionUrl) {
    elements.notionLink.href = notionUrl;
    elements.notionLink.style.display = 'inline-flex';
  } else {
    elements.notionLink.style.display = 'none';
  }
  
  // 成功メッセージにスクロール
  elements.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===== エラーセクションの表示 =====
function showErrorSection(message) {
  // セクションの切り替え
  elements.formSection.classList.add('hidden');
  elements.progressSection.classList.add('hidden');
  elements.resultSection.classList.add('hidden');
  elements.errorSection.classList.remove('hidden');
  
  // エラーメッセージの設定
  const fullMessage = message || '予期しないエラーが発生しました。';
  
  // 再開可能かどうかの判定
  const canResume = appState.failedStep && appState.failedStep > 0 && appState.lastFormData;
  
  if (canResume) {
    elements.errorMessage.innerHTML = `
      <div>${fullMessage}</div>
      <div style="margin-top: 1rem; padding: 1rem; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #4A90C2;">
        <strong>💡 ヒント:</strong> ステップ${appState.failedStep}から再開できます。<br>
        下の「途中から再開」ボタンをクリックしてください。
      </div>
    `;
    
    // 再開ボタンを表示
    if (elements.retryButton) {
      elements.retryButton.textContent = '途中から再開';
      elements.retryButton.style.background = '#10b981';
    }
  } else {
    elements.errorMessage.textContent = fullMessage;
    
    // 通常のリトライボタンを表示
    if (elements.retryButton) {
      elements.retryButton.textContent = '最初から再実行';
      elements.retryButton.style.background = '#4A90C2';
    }
  }
  
  // エラーセクションにスクロール
  elements.errorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===== アプリケーションのリセット =====
function resetApplication() {
  console.log('[App] アプリケーションリセット');
  
  // EventSource接続を閉じる
  if (appState.eventSource) {
    appState.eventSource.close();
    appState.eventSource = null;
  }
  
  // 状態をリセット
  appState = {
    isLoading: false,
    currentStep: 0,
    totalSteps: 20, // 事前作成(3) + 16調査 + 統合レポート更新(1) = 20ステップ
    researchResults: [],
    error: null,
    notionUrl: null,
    eventSource: null,
    isConnected: false,
    lastEventTime: null,
    startTime: null,
    currentPhase: 1,
    completedBatches: 0,
    estimatedTotalTime: 8 * 60, // 事前作成→ステータス更新方式で高速化：8分予想
    lastFormData: null, // 再開用データもリセット
    failedStep: null, // 失敗ステップもリセット
    stepTimes: [], // 各ステップの実行時間を記録
    averageStepTime: 20 // 効率化により短縮：20秒/ステップ
  };
  
  // UIをリセット
  elements.formSection.classList.remove('hidden');
  elements.progressSection.classList.add('hidden');
  elements.resultSection.classList.add('hidden');
  elements.errorSection.classList.add('hidden');
  
  // フォームをリセット
  elements.researchForm.reset();
  hideValidationErrors();
  
  // フィールドエラーをクリア
  const fieldErrors = document.querySelectorAll('.field-error');
  fieldErrors.forEach(error => error.remove());
  
  // 送信ボタンを有効化
  elements.submitButton.disabled = false;
  
  // 進行状況をリセット
  elements.progressFill.style.width = '0%';
  elements.progressPercentage.textContent = '0%';
  elements.progressCounter.textContent = '0/20';
  
  // 時間予測をリセット
  if (elements.estimatedTime) {
    elements.estimatedTime.textContent = '計算中...';
  }
  
  // フェーズ表示をリセット
  appState.currentPhase = 1;
  updatePhaseDisplay();
  
  // 調査項目をリセット
  initializeResearchItems();
  
  // トップにスクロール
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== 調査のリトライ =====
function retryResearch() {
  console.log('[App] 調査リトライ');
  
  // 前回のフォームデータがあるかチェック
  const formData = appState.lastFormData || getFormData();
  
  // 再開可能かどうかの判定
  const canResume = appState.failedStep && appState.failedStep > 0 && appState.lastFormData;
  
  // エラーセクションを非表示
  elements.errorSection.classList.add('hidden');
  
  if (canResume) {
    console.log('[App] ステップ', appState.failedStep, 'から再開');
    // 失敗したステップから再開
    startResearch(formData, appState.failedStep);
  } else {
    console.log('[App] 最初から再実行');
    // 最初から再実行
    startResearch(formData);
  }
}

// ===== システム状態の更新（改善版） =====
function updateSystemStatus(status, message) {
  const statusElement = elements.systemStatus;
  const statusMessage = document.getElementById('statusMessage');
  
  if (!statusElement) {
    console.warn('[App] システムステータス要素が見つかりません');
    return;
  }
  
  // ステータス要素のクラスを更新
  statusElement.classList.remove('success', 'warning', 'error', 'loading');
  statusElement.classList.add(status);
  
  // メッセージを更新
  if (statusMessage) {
    statusMessage.textContent = message;
  } else {
    console.warn('[App] ステータスメッセージ要素が見つかりません');
  }
  
  console.log(`[App] システムステータス更新: ${status} - ${message}`);
}

// ===== ローディング表示 =====
function showLoading(message) {
  if (elements.loadingOverlay) {
    const loadingMessage = elements.loadingOverlay.querySelector('#loadingMessage');
    if (loadingMessage) {
      loadingMessage.textContent = message || 'ロード中...';
    }
    elements.loadingOverlay.classList.remove('hidden');
  }
}

// ===== ローディング非表示 =====
function hideLoading() {
  if (elements.loadingOverlay) {
    elements.loadingOverlay.classList.add('hidden');
  }
}

// ===== ユーティリティ関数 =====

// 時間フォーマット
function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}分${remainingSeconds}秒`;
  } else {
    return `${remainingSeconds}秒`;
  }
}

// 文字数制限チェック
function checkTextLength(text, maxLength) {
  return text.length <= maxLength;
}

// 安全なHTML出力
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== デバッグ用関数 =====
function logAppState() {
  console.log('[Debug] アプリケーション状態:', appState);
}

// デバッグモード（開発時のみ）
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  window.appState = appState;
  window.logAppState = logAppState;
  window.resetApplication = resetApplication;
  console.log('[Debug] デバッグモードが有効です。window.appState, window.logAppState(), window.resetApplication()が利用可能です。');
}

// ===== エラーハンドリング =====
window.addEventListener('error', function(event) {
  console.error('[App] グローバルエラー:', event.error);
  
  if (appState.isLoading) {
    handleResearchError('予期しないエラーが発生しました。再試行してください。');
  }
});

window.addEventListener('unhandledrejection', function(event) {
  console.error('[App] 未処理のPromise拒否:', event.reason);
  
  if (appState.isLoading) {
    handleResearchError('ネットワークエラーが発生しました。接続を確認して再試行してください。');
  }
});

console.log('[SPIRITS] AI市場調査システム初期化完了');

// ===== 一括入力機能の定数とテンプレート =====
const TEMPLATE_TEXT = `コンセプト：
解決したい顧客課題：
狙っている業種・業界：
想定される利用者層：
直接競合・間接競合：
課金モデル：
価格帯・価格設定の方向性：
暫定UVP（Unique Value Proposition）：
初期KPI：
獲得チャネル仮説：
規制・技術前提：
想定コスト構造：`;

// フィールドマッピング（空白対応版 - 完全対応）
const FIELD_MAPPING = {
    // 基本的なフィールド名
    'コンセプト': 'concept',
    'Concept': 'concept',
    'concept': 'concept',
    'サービスコンセプト': 'concept',
    'プロダクトコンセプト': 'concept',
    
    '解決したい顧客課題': 'customerProblem',
    '顧客課題': 'customerProblem',
    'customerProblem': 'customerProblem',
    'Customer Problem': 'customerProblem',
    '課題': 'customerProblem',
    '解決課題': 'customerProblem',
    
    '狙っている業種・業界': 'targetIndustry',
    '業種・業界': 'targetIndustry',
    '業種': 'targetIndustry',
    '業界': 'targetIndustry',
    'targetIndustry': 'targetIndustry',
    'Target Industry': 'targetIndustry',
    'ターゲット業界': 'targetIndustry',
    
    '想定される利用者層': 'targetUsers',
    '利用者層': 'targetUsers',
    'targetUsers': 'targetUsers',
    'Target Users': 'targetUsers',
    'ターゲットユーザー': 'targetUsers',
    'ユーザー層': 'targetUsers',
    
    '直接競合・間接競合': 'competitors',
    '競合': 'competitors',
    'competitors': 'competitors',
    'Competitors': 'competitors',
    '競合他社': 'competitors',
    '競合分析': 'competitors',
    
    '課金モデル': 'revenueModel',
    'revenueModel': 'revenueModel',
    'Revenue Model': 'revenueModel',
    '収益モデル': 'revenueModel',
    'ビジネスモデル': 'revenueModel',
    
    '価格帯・価格設定の方向性': 'pricingDirection',
    '価格設定': 'pricingDirection',
    '価格戦略': 'pricingDirection',
    '価格帯': 'pricingDirection',
    'pricingDirection': 'pricingDirection',
    'Pricing Direction': 'pricingDirection',
    'プライシング': 'pricingDirection',
    
    // 🔥 空白対応版 UVP関連
    '暫定UVP（Unique Value Proposition）': 'uvp',
    '暫定UVP': 'uvp',
    '暫定 UVP（Unique Value Proposition）': 'uvp',  // 空白あり
    '暫定 UVP': 'uvp',  // 空白あり
    'UVP': 'uvp',
    'uvp': 'uvp',
    '独自価値提案': 'uvp',
    'Unique Value Proposition': 'uvp',
    '価値提案': 'uvp',
    
    // 🔥 空白対応版 KPI関連
    '初期KPI': 'initialKpi',
    '初期 KPI': 'initialKpi',  // 空白あり
    'KPI': 'initialKpi',
    'initialKpi': 'initialKpi',
    'Initial KPI': 'initialKpi',
    '目標指標': 'initialKpi',
    '成功指標': 'initialKpi',
    
    '獲得チャネル仮説': 'acquisitionChannels',
    '獲得チャネル': 'acquisitionChannels',
    'acquisitionChannels': 'acquisitionChannels',
    'Acquisition Channels': 'acquisitionChannels',
    'チャネル戦略': 'acquisitionChannels',
    'マーケティングチャネル': 'acquisitionChannels',
    
    '規制・技術前提': 'regulatoryTechPrereqs',
    '技術前提': 'regulatoryTechPrereqs',
    '規制要件': 'regulatoryTechPrereqs',
    'regulatoryTechPrereqs': 'regulatoryTechPrereqs',
    'Regulatory Tech Prerequisites': 'regulatoryTechPrereqs',
    '規制': 'regulatoryTechPrereqs',
    '技術要件': 'regulatoryTechPrereqs',
    
    '想定コスト構造': 'costStructure',
    'コスト構造': 'costStructure',
    'コスト': 'costStructure',
    'costStructure': 'costStructure',
    'Cost Structure': 'costStructure',
    '費用構造': 'costStructure'
};

// フィールド名の正規化関数（空白対応強化版）
function normalizeFieldName(fieldName) {
  console.log(`[BulkInput] 🔍 正規化前: "${fieldName}"`);
  
  // 1. 基本のトリム
  let normalized = fieldName.trim();
  
  // 2. 末尾の「：」「:」を削除
  normalized = normalized.replace(/[：:]+$/, '').trim();
  
  // 3. 括弧内の説明を除去（例：「暫定UVP（独自価値提案）」→「暫定UVP」）
  normalized = normalized.replace(/[（(][^）)]*[）)]/g, '').trim();
  
  // 4. 全角・半角の統一
  normalized = normalized.replace(/：/g, ':');
  
  // 5. 連続する空白を単一の空白に
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  console.log(`[BulkInput] ✨ 正規化後: "${normalized}"`);
  
  // 6. 直接マッピングを確認
  let mappedField = FIELD_MAPPING[normalized];
  
  if (mappedField) {
    console.log(`[BulkInput] ✅ 直接マッピング発見: "${normalized}" -> "${mappedField}"`);
    return normalized;
  }
  
  // 7. 🔥 空白バリエーション対応: 空白なし版も試行
  const withoutSpaces = normalized.replace(/\s/g, '');
  mappedField = FIELD_MAPPING[withoutSpaces];
  
  if (mappedField) {
    console.log(`[BulkInput] ✅ 空白なし版マッピング発見: "${withoutSpaces}" -> "${mappedField}"`);
    return withoutSpaces;
  }
  
  // 8. 🔥 逆パターン: 空白を追加したバージョンも試行
  const spaceVariations = [
    normalized.replace(/UVP/g, ' UVP'),
    normalized.replace(/KPI/g, ' KPI'),
    normalized.replace(/暫定UVP/g, '暫定 UVP'),
    normalized.replace(/初期KPI/g, '初期 KPI')
  ];
  
  for (const variation of spaceVariations) {
    const cleanVariation = variation.replace(/\s+/g, ' ').trim();
    mappedField = FIELD_MAPPING[cleanVariation];
    
    if (mappedField) {
      console.log(`[BulkInput] ✅ 空白バリエーションマッピング発見: "${cleanVariation}" -> "${mappedField}"`);
      return cleanVariation;
    }
  }
  
  // 9. マッピング失敗時の詳細ログ
  console.log(`[BulkInput] ❌ マッピング未発見: "${normalized}"`);
  console.log(`[BulkInput] 📋 利用可能なマッピング（UVP/KPI関連）:`, 
    Object.keys(FIELD_MAPPING).filter(key => key.includes('UVP') || key.includes('KPI')));
  
  return normalized;
}

// ===== 一括入力機能 =====

// 一括入力機能のイベントリスナー設定（改良版）
function setupBulkInputListeners() {
  // トグルボタンの設定
  const toggleBtn = elements.toggleBulkInput;
  const bulkContent = elements.bulkInputContent;
  
  if (toggleBtn && bulkContent) {
    toggleBtn.addEventListener('click', function() {
      const isHidden = bulkContent.classList.contains('hidden');
      
      if (isHidden) {
        // 表示する
        bulkContent.classList.remove('hidden');
        toggleBtn.innerHTML = `
          <span class="btn-icon">📄</span>
          <span class="btn-text">一括入力を非表示にする</span>
        `;
        toggleBtn.classList.remove('btn-outline');
        toggleBtn.classList.add('btn-primary');
      } else {
        // 非表示にする
        bulkContent.classList.add('hidden');
        toggleBtn.innerHTML = `
          <span class="btn-icon">📄</span>
          <span class="btn-text">一括入力を使用する</span>
        `;
        toggleBtn.classList.remove('btn-primary');
        toggleBtn.classList.add('btn-outline');
      }
    });
  }
  
  // 既存のボタン機能
  const copyTemplateBtn = document.getElementById('copyTemplateBtn');
  const bulkParseBtn = document.getElementById('bulkParseBtn');
  const clearBulkBtn = document.getElementById('clearBulkBtn');
  
  if (copyTemplateBtn) {
    copyTemplateBtn.addEventListener('click', copyTemplate);
  }
  if (bulkParseBtn) {
    bulkParseBtn.addEventListener('click', parseBulkText);
  }
  if (clearBulkBtn) {
    clearBulkBtn.addEventListener('click', clearBulkInput);
  }
}

// テンプレートコピー機能
function copyTemplate() {
  const copyTemplateBtn = document.getElementById('copyTemplateBtn');
  const bulkInput = document.getElementById('bulkInput');
  
  if (!copyTemplateBtn) return;
  
  navigator.clipboard.writeText(TEMPLATE_TEXT).then(() => {
    // ボタンの表示を一時的に変更
    const originalText = copyTemplateBtn.innerHTML;
    copyTemplateBtn.innerHTML = '<span class="btn-icon">✅</span>コピー完了';
    copyTemplateBtn.style.background = '#10b981';
    
    setTimeout(() => {
      copyTemplateBtn.innerHTML = originalText;
      copyTemplateBtn.style.background = '';
    }, 2000);
  }).catch(err => {
    console.error('テンプレートのコピーに失敗しました:', err);
    // フォールバック: テキストエリアに直接セット
    if (bulkInput) {
      bulkInput.value = TEMPLATE_TEXT;
      bulkInput.focus();
      bulkInput.select();
    }
  });
}

// 一括テキストの解析機能（強化版）
function parseBulkText() {
  const bulkInput = document.getElementById('bulkInput');
  
  if (!bulkInput) {
    console.error('[BulkInput] ❌ bulkInput要素が見つかりません');
    showBulkValidationError('一括入力エリアが見つかりません。ページをリロードしてお試しください。');
    return;
  }
  
  const bulkText = bulkInput.value.trim();
  console.log('[BulkInput] 📝 入力テキスト長:', bulkText.length);
  console.log('[BulkInput] 📝 入力テキスト（最初の200文字）:', bulkText.substring(0, 200));
  
  if (!bulkText) {
    showBulkValidationError('一括入力エリアにテキストを入力してください。');
    return;
  }
  
  try {
    console.log('[BulkInput] 🚀 解析開始...');
    const parsed = parseTemplateText(bulkText);
    let reflectedCount = 0;
    const failedFields = [];
    
    console.log('[BulkInput] 🔄 フィールド反映開始...');
    
    // 解析結果を個別フィールドに反映
    Object.entries(parsed).forEach(([fieldName, value]) => {
      console.log(`[BulkInput] 🎯 フィールド反映試行: ${fieldName} = "${value.substring(0, 100)}${value.length > 100 ? '...' : ''}"`);
      
      // フィールド要素を検索（複数の方法で試行）
      let element = document.getElementById(fieldName);
      
      if (!element) {
        // name属性でも検索
        element = document.querySelector(`[name="${fieldName}"]`);
      }
      
      if (!element) {
        // data-field属性でも検索
        element = document.querySelector(`[data-field="${fieldName}"]`);
      }
      
      if (element) {
        const oldValue = element.value;
        element.value = value;
        reflectedCount++;
        console.log(`[BulkInput] ✅ フィールド反映成功: ${fieldName}`);
        console.log(`[BulkInput] 📝 変更前: "${oldValue.substring(0, 50)}${oldValue.length > 50 ? '...' : ''}"`);
        console.log(`[BulkInput] 📝 変更後: "${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"`);
        
        // 変更イベントを手動で発火（バリデーション等のため）
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        console.warn(`[BulkInput] ❌ フィールド要素が見つかりません: ${fieldName}`);
        failedFields.push(fieldName);
        
        // デバッグ用: 利用可能な要素ID一覧を確認
        const availableIds = Array.from(document.querySelectorAll('input[id], textarea[id]')).map(el => el.id);
        console.log(`[BulkInput] 📋 利用可能なフィールドID:`, availableIds);
      }
    });
    
    console.log(`[BulkInput] 🎉 反映完了: ${reflectedCount}件成功, ${failedFields.length}件失敗`);
    
    if (reflectedCount > 0) {
      // 成功メッセージ
      let successMessage = `一括入力の解析が完了しました。${reflectedCount}件のフィールドに反映されました。`;
      if (failedFields.length > 0) {
        successMessage += `\n\n未反映フィールド (${failedFields.length}件): ${failedFields.join(', ')}`;
      }
      showBulkSuccessMessage(successMessage);
      
      // フォーカスを最初のフィールドに移動
      const firstField = document.getElementById('businessName');
      if (firstField) {
        firstField.focus();
      }
    } else {
      showBulkValidationError('有効なフィールドが見つかりませんでした。テンプレート形式を確認してください。\n\n利用可能なフィールド名:\n' + Object.keys(FIELD_MAPPING).slice(0, 10).join('\n'));
    }
    
  } catch (error) {
    console.error('[BulkInput] ❌ 解析エラー:', error);
    showBulkValidationError(`テキストの解析に失敗しました: ${error.message}\n\nテンプレート形式を確認してください。`);
  }
}

// テンプレートテキストの解析（強化版: デバッグ改善 + フィールド認識向上）
function parseTemplateText(text) {
  const lines = text.split('\n');
  const parsed = {};
  
  let currentField = null;
  let currentValue = '';
  
  console.log('[BulkInput] 🚀 解析開始 - 総行数:', lines.length);
  console.log('[BulkInput] 📝 解析対象テキスト（最初の500文字）:', text.substring(0, 500));
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    console.log(`[BulkInput] 📄 行${i + 1}: "${line}"`);
    
    // 空行の場合
    if (!trimmedLine) {
      console.log(`[BulkInput] ⏭️ 行${i + 1}: 空行をスキップ`);
      // 空行は、現在のフィールドに既に内容がある場合のみ改行として追加
      if (currentField && currentValue.trim()) {
        currentValue += '\n';
        console.log(`[BulkInput] ➕ 行${i + 1}: 改行を追加`);
      }
      continue;
    }
    
    // フィールド行の検出（より厳密な判定）
    const hasColon = trimmedLine.includes(':') || trimmedLine.includes('：');
    
    if (hasColon) {
      const colonIndex = trimmedLine.indexOf(':') !== -1 ? trimmedLine.indexOf(':') : trimmedLine.indexOf('：');
      const fieldName = trimmedLine.substring(0, colonIndex).trim();
      const fieldValue = trimmedLine.substring(colonIndex + 1).trim();
      
      // フィールド検出の条件を強化
      const isListItem = /^[\s]*[*\-•][\s]/.test(trimmedLine);
      const fieldNameLength = fieldName.length;
      
      // フィールド名を正規化
      const normalizedFieldName = normalizeFieldName(fieldName);
      
      console.log(`[BulkInput] 🔎 行${i + 1}: フィールド候補 "${fieldName}" -> 正規化 "${normalizedFieldName}"`);
      console.log(`[BulkInput] 🔍 行${i + 1}: 箇条書き判定=${isListItem}, 文字数=${fieldNameLength}`);
      
      // FIELD_MAPPINGに存在するかチェック + 箇条書きでない場合のみフィールドとして認識
      const isValidField = FIELD_MAPPING[normalizedFieldName] && (!isListItem || fieldNameLength <= 50);
      
      if (isValidField) {
        // 前のフィールドがあれば保存
        if (currentField && FIELD_MAPPING[currentField]) {
          const finalValue = currentValue.trim();
          parsed[FIELD_MAPPING[currentField]] = finalValue;
          console.log(`[BulkInput] 💾 フィールド保存: ${currentField} -> ${FIELD_MAPPING[currentField]} = "${finalValue.substring(0, 100)}${finalValue.length > 100 ? '...' : ''}"`);
        }
        
        // 新しいフィールドを開始
        currentField = normalizedFieldName;
        currentValue = fieldValue; // コロンの後の値から開始
        
        console.log(`[BulkInput] 🆕 新フィールド開始: "${currentField}"`);
        console.log(`[BulkInput] 📝 初期値: "${fieldValue}"`);
      } else {
        console.log(`[BulkInput] ⚠️ 未知のフィールド名またはリスト項目: "${normalizedFieldName}"`);
        // 未知のフィールドの場合、継続行として処理
        if (currentField) {
          currentValue += (currentValue ? '\n' : '') + trimmedLine;
          console.log(`[BulkInput] ➕ 継続行として追加: "${trimmedLine}"`);
        }
      }
    } else if (currentField) {
      // 継続行（前のフィールドの続き）
      currentValue += (currentValue ? '\n' : '') + trimmedLine;
      console.log(`[BulkInput] 📝 行${i + 1}: 継続行として追加 "${trimmedLine}"`);
    } else {
      console.log(`[BulkInput] 🚫 行${i + 1}: フィールド未設定のため無視 "${trimmedLine}"`);
    }
  }
  
  // 最後のフィールドを保存
  if (currentField && FIELD_MAPPING[currentField]) {
    const finalValue = currentValue.trim();
    parsed[FIELD_MAPPING[currentField]] = finalValue;
    console.log(`[BulkInput] 💾 最終フィールド保存: ${currentField} -> ${FIELD_MAPPING[currentField]} = "${finalValue.substring(0, 100)}${finalValue.length > 100 ? '...' : ''}"`);
  }
  
  console.log('[BulkInput] 🎯 解析結果まとめ:');
  Object.entries(parsed).forEach(([key, value]) => {
    console.log(`[BulkInput] ✅ ${key}: "${value.substring(0, 100)}${value.length > 100 ? '...' : ''}"`);
  });
  
  console.log('[BulkInput] 📋 利用可能フィールド:', Object.keys(FIELD_MAPPING));
  
  return parsed;
}

// 一括入力エリアのクリア
function clearBulkInput() {
  const bulkInput = document.getElementById('bulkInput');
  
  if (!bulkInput) return;
  
  bulkInput.value = '';
  bulkInput.focus();
  hideValidationErrors();
}

// 一括入力用バリデーションエラーの表示
function showBulkValidationError(message) {
  const validationErrors = elements.validationErrors || document.getElementById('validationErrors');
  
  if (!validationErrors) return;
  
  validationErrors.innerHTML = `
    <div class="error-message">
      <span class="error-icon">⚠️</span>
      ${message}
    </div>
  `;
  validationErrors.classList.remove('hidden');
  validationErrors.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// 一括入力用成功メッセージの表示
function showBulkSuccessMessage(message) {
  const validationErrors = elements.validationErrors || document.getElementById('validationErrors');
  
  if (!validationErrors) return;
  
  validationErrors.innerHTML = `
    <div class="success-message">
      <span class="success-icon">✅</span>
      ${message}
    </div>
  `;
  validationErrors.classList.remove('hidden');
  setTimeout(() => {
    validationErrors.classList.add('hidden');
  }, 3000);
}

// ===== 接続切断時の処理 =====
function handleConnectionLoss(formData, resumeFromStep) {
  // 再接続回数をチェック
  if (appState.connectionRetryCount >= appState.maxRetries) {
    console.error('[App] 最大再接続回数に達しました');
    handleResearchError('ネットワーク接続エラーが継続しています。しばらく待ってから「途中から再開」ボタンをお試しください。');
    return;
  }
  
  appState.connectionRetryCount++;
  appState.isReconnecting = true;
  
  console.log(`[App] 接続再試行 ${appState.connectionRetryCount}/${appState.maxRetries}`);
  
  // 再接続までの待機時間（指数バックオフ）
  const retryDelay = Math.min(1000 * Math.pow(2, appState.connectionRetryCount - 1), 10000);
  
  // 再接続中であることをユーザーに通知
  showReconnectionStatus(retryDelay);
  
  setTimeout(() => {
    console.log(`[App] ${retryDelay}ms待機後、再接続を実行`);
    
    // 現在のステップから再開を試行
    const currentStep = appState.currentStep || resumeFromStep;
    connectToResearchStream(formData, currentStep);
  }, retryDelay);
}

// ===== 再接続状況の表示 =====
function showReconnectionStatus(retryDelay) {
  const retrySeconds = Math.ceil(retryDelay / 1000);
  const message = `ネットワーク接続が切断されました。${retrySeconds}秒後に自動再接続します...\n\n📡 調査は${appState.isReconnecting ? 'バックエンドで継続中' : '一時停止中'}です`;
  
  // プログレス表示を更新
  const progressDetails = document.querySelector('.progress-details');
  if (progressDetails) {
    progressDetails.innerHTML = `
      <div class="current-phase">🔄 再接続中...</div>
      <div class="current-status">${message}</div>
    `;
  }
  
  // カウントダウン表示
  let countdown = retrySeconds;
  const countdownInterval = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(countdownInterval);
      return;
    }
    
    if (progressDetails) {
      const currentStatusDiv = progressDetails.querySelector('.current-status');
      if (currentStatusDiv) {
        currentStatusDiv.textContent = `ネットワーク接続が切断されました。${countdown}秒後に自動再接続します...\n\n📡 調査はバックエンドで継続中です`;
      }
    }
  }, 1000);
  
  console.log(`[App] 再接続カウントダウン開始: ${retrySeconds}秒`);
}

// 調査種別に応じたアイコンを取得
function getResearchIcon(researchType) {
  if (!researchType) return '📊';
  
  const iconMap = {
    '市場規模': '📈',
    'PESTEL': '🔍',
    '競合製品': '🏢',
    '競合経営': '💼',
    '顧客セグメント': '👥',
    '顧客感情': '❤️',
    'プロダクト市場': '🎯',
    'マーケティング': '📢',
    'ブランド': '✨',
    'テクノロジー': '⚙️',
    'パートナーシップ': '🤝',
    'リスク': '⚠️',
    'KPI': '📊',
    '法務': '⚖️',
    'リサーチ': '🔬',
    'PMF': '🚀',
    '統合': '📋',
    '初期化': '🔧'
  };
  
  // 部分マッチでアイコンを検索
  for (const [key, icon] of Object.entries(iconMap)) {
    if (researchType.includes(key)) {
      return icon;
    }
  }
  
  return '📊'; // デフォルト
}

// 完了サマリー表示（強化版）
function showCompletionSummary(data) {
  const endTime = new Date();
  const duration = appState.startTime ? 
    Math.round((endTime - appState.startTime) / 1000 / 60) : null;
  
  console.log('[App] 調査完了サマリー表示');
  
  // 結果セクションに切り替え
  setTimeout(() => {
    const progressSection = document.getElementById('progressSection');
    const resultSection = document.getElementById('resultSection');
    const resultTitle = document.getElementById('resultTitle');
    const resultDescription = document.getElementById('resultDescription');
    
    if (progressSection) progressSection.classList.add('hidden');
    if (resultSection) resultSection.classList.remove('hidden');
    
    // タイトルと説明を更新
    if (resultTitle) {
      resultTitle.innerHTML = `
        <i class="fas fa-trophy me-2"></i>🎉 市場調査が正常に完了しました！
      `;
    }
    
    if (resultDescription) {
      let description = `16種類の専門調査と統合レポートが正常に生成されました。`;
      if (duration) {
        description += ` 所要時間: 約${duration}分`;
      }
      description += ` 詳細な結果をNotionページでご確認ください。`;
      resultDescription.textContent = description;
    }
    
    // Notionリンクを設定
    const notionLink = document.getElementById('notionLink');
    if (notionLink && appState.notionUrl) {
      notionLink.href = appState.notionUrl;
      notionLink.style.display = 'flex';
    }
    
    // スクロール
    if (resultSection) {
      resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
  }, 500);
}

// フェーズ情報を取得
function getPhaseInfo(step) {
  if (step <= 3) {
    return {
      title: 'Phase 1: 事前作成フェーズ',
      description: '16種類の調査項目をNotionに事前作成し、進行状況の可視化を準備しています'
    };
  } else if (step <= 19) {
    return {
      title: 'Phase 2: 調査実行フェーズ',
      description: '16種類の専門的な市場調査を順次実行中です'
    };
  } else {
    return {
      title: 'Phase 3: 統合レポート生成',
      description: '全調査結果を統合した包括的なレポートを生成中です'
    };
  }
} 