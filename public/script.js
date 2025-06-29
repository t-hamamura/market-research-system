/**
 * SPIRITS AI市場調査システム - フロントエンド JavaScript
 * Gemini AIとNotionを活用した16種類の市場調査自動実行システム
 * Powered by SPIRITS
 */

// ===== グローバル変数とアプリケーション状態 =====
let appState = {
  isLoading: false,
  currentStep: 0,
  totalSteps: 18,
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
  failedStep: null // 失敗したステップ番号
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
  
  // 一括入力機能
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

// ===== システム健康状態チェック =====
async function checkSystemHealth() {
  try {
    showLoading('システム接続を確認中...');
    
    const response = await fetch('/health');
    const data = await response.json();
    
    // /healthエンドポイントのレスポンス形式に合わせて修正
    if (data.status === 'ok') {
      updateSystemStatus('success', 'システム正常');
      console.log('[App] システム健康状態チェック成功:', data);
    } else {
      updateSystemStatus('error', 'システムエラー');
      console.error('[App] システム健康状態チェック失敗:', data);
    }
  } catch (error) {
    console.error('[App] システム健康状態チェックエラー:', error);
    updateSystemStatus('error', '接続エラー');
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
  if (resumeFromStep) {
    console.log('[App] ステップ', resumeFromStep, 'から再開');
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

// ===== Server-Sent Events接続 =====
function connectToResearchStream(formData, resumeFromStep = null) {
  try {
    console.log('[App] SSE接続開始');
    
    // 既存の接続があれば閉じる
    if (appState.eventSource) {
      appState.eventSource.close();
    }
    
    // リクエストボディに再開ステップを含める
    const requestBody = { ...formData };
    if (resumeFromStep !== null) {
      requestBody.resumeFromStep = resumeFromStep;
    }
    
    // EventSourceは直接POSTをサポートしないため、fetchでPOSTしてからSSEを受信
    fetch('/api/research/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    }).then(async response => {
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
      
      function readStream() {
        reader.read().then(({ done, value }) => {
          if (done) {
            console.log('[App] SSEストリーム終了');
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
              }
            }
          });
          
          // 次のチャンクを読み込み
          readStream();
        }).catch(error => {
          console.error('[App] SSEストリーム読み込みエラー:', error);
          handleResearchError(error.message);
        });
      }
      
      readStream();
      
    }).catch(error => {
      console.error('[App] 調査開始エラー:', error);
      handleResearchError(error.message);
    });
    
  } catch (error) {
    console.error('[App] SSE接続エラー:', error);
    handleResearchError(error.message);
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
function updateProgress(event) {
  appState.currentStep = event.step;
  appState.totalSteps = event.total;
  
  // プログレスバーの更新
  const percentage = Math.round((event.step / event.total) * 100);
  elements.progressFill.style.width = `${percentage}%`;
  elements.progressPercentage.textContent = `${percentage}%`;
  elements.progressCounter.textContent = `${event.step}/${event.total}`;
  
  // フェーズの更新
  updatePhaseFromStep(event.step);
  
  // 時間予測の更新
  updateTimeEstimate();
  
  // 調査項目の状態更新
  updateResearchItemsStatus(event.step, event.researchType);
}

// ===== フェーズ表示の更新 =====
function updatePhaseDisplay() {
  const phaseData = getPhaseData(appState.currentPhase);
  
  if (elements.currentPhaseText) {
    elements.currentPhaseText.textContent = phaseData.title;
  }
  
  if (elements.phaseCounter) {
    elements.phaseCounter.textContent = `${appState.currentPhase}/4`;
  }
  
  if (elements.phaseDescription) {
    elements.phaseDescription.textContent = phaseData.description;
  }
  
  // フェーズグループの状態更新
  updatePhaseGroupStatus();
}

// ===== ステップからフェーズを更新 =====
function updatePhaseFromStep(step) {
  let newPhase = 1;
  
  if (step <= 4) {
    newPhase = 1; // フェーズ1: 基本情報収集
  } else if (step <= 8) {
    newPhase = 2; // フェーズ2: 市場機会分析
  } else if (step <= 12) {
    newPhase = 3; // フェーズ3: ビジネス戦略分析
  } else if (step <= 16) {
    newPhase = 4; // フェーズ4: リスク・機会評価
  } else {
    newPhase = 5; // 最終処理
  }
  
  if (newPhase !== appState.currentPhase) {
    appState.currentPhase = newPhase;
    updatePhaseDisplay();
  }
}

// ===== フェーズデータの取得 =====
function getPhaseData(phase) {
  const phases = {
    1: {
      title: 'フェーズ1: 基本情報収集',
      description: '基礎的な市場情報と競合状況を並列で調査しています'
    },
    2: {
      title: 'フェーズ2: 市場機会分析',
      description: '市場規模とビジネス機会を詳細に分析しています'
    },
    3: {
      title: 'フェーズ3: ビジネス戦略分析',
      description: '戦略的なアプローチと参入方法を検討しています'
    },
    4: {
      title: 'フェーズ4: リスク・機会評価',
      description: '包括的なリスク分析と成功要因を特定しています'
    },
    5: {
      title: '最終処理: レポート統合',
      description: '調査結果の統合とNotionレポートを生成しています'
    }
  };
  
  return phases[phase] || phases[1];
}

// ===== フェーズグループの状態更新 =====
function updatePhaseGroupStatus() {
  for (let i = 1; i <= 4; i++) {
    const phaseGroup = document.getElementById(`phase${i}`);
    const phaseIcon = phaseGroup?.querySelector('.phase-status-icon');
    
    if (phaseGroup && phaseIcon) {
      phaseGroup.classList.remove('active', 'completed');
      
      if (i < appState.currentPhase) {
        // 完了したフェーズ
        phaseGroup.classList.add('completed');
        phaseIcon.textContent = '✅';
      } else if (i === appState.currentPhase) {
        // 現在のフェーズ
        phaseGroup.classList.add('active');
        phaseIcon.textContent = '🔄';
      } else {
        // 未開始のフェーズ
        phaseIcon.textContent = '⏳';
      }
    }
  }
  
  // 最終処理フェーズ
  const finalPhase = document.getElementById('phase-final');
  const finalIcon = finalPhase?.querySelector('.phase-status-icon');
  
  if (finalPhase && finalIcon) {
    finalPhase.classList.remove('active', 'completed');
    
    if (appState.currentPhase === 5) {
      finalPhase.classList.add('active');
      finalIcon.textContent = '🔄';
    } else if (appState.currentPhase > 5) {
      finalPhase.classList.add('completed');
      finalIcon.textContent = '✅';
    } else {
      finalIcon.textContent = '⏳';
    }
  }
}

// ===== 時間予測の更新（改良版） =====
function updateTimeEstimate() {
  if (!appState.startTime || !elements.estimatedTime) return;
  
  const currentTime = new Date();
  const elapsedSeconds = Math.floor((currentTime - appState.startTime) / 1000);
  const progress = appState.currentStep / appState.totalSteps;
  
  // フェーズ別の想定実行時間（秒）
  const phaseEstimates = {
    1: 120,  // フェーズ1: 基本情報収集 (2分)
    2: 150,  // フェーズ2: 市場機会分析 (2.5分)
    3: 180,  // フェーズ3: ビジネス戦略分析 (3分)
    4: 150,  // フェーズ4: リスク・機会評価 (2.5分)
    5: 90    // 最終処理: レポート統合 (1.5分)
  };
  
  if (progress > 0.05) {  // 最低5%進行してから予測開始
    let remainingSeconds = 0;
    
    // 複数の予測方法を組み合わせて精度向上
    const predictions = [];
    
    // 1. 線形予測（従来の方法）
    const linearEstimate = Math.floor(elapsedSeconds / progress) - elapsedSeconds;
    predictions.push(Math.max(0, linearEstimate));
    
    // 2. フェーズベース予測
    const currentPhase = Math.min(5, Math.ceil(appState.currentStep / 4));
    let phaseRemainingTime = 0;
    
    // 現在のフェーズの残り時間を計算
    const currentPhaseSteps = 4; // 1フェーズあたり4ステップ
    const stepsInCurrentPhase = ((appState.currentStep - 1) % 4) + 1;
    const phaseProgress = stepsInCurrentPhase / currentPhaseSteps;
    const currentPhaseRemaining = phaseEstimates[currentPhase] * (1 - phaseProgress);
    
    // 未来のフェーズの時間を加算
    for (let phase = currentPhase + 1; phase <= 5; phase++) {
      phaseRemainingTime += phaseEstimates[phase];
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

// ===== 調査項目の状態更新（新UI対応） =====
function updateResearchItemsStatus(step, researchType) {
  // 各調査項目の状態を更新
  const researchItems = {
    1: 'basic_market_research',
    2: 'competitor_analysis', 
    3: 'target_customer_analysis',
    4: 'industry_trends',
    5: 'market_size_research',
    6: 'pricing_research',
    7: 'technology_trends',
    8: 'customer_behavior_analysis',
    9: 'go_to_market_strategy',
    10: 'regulatory_analysis',
    11: 'partnership_opportunities',
    12: 'business_model_analysis',
    13: 'risk_analysis',
    14: 'success_factors',
    15: 'market_entry_barriers',
    16: 'swot_analysis',
    17: 'integration',
    18: 'notion'
  };
  
  // フェーズ別の調査項目グループ
  const phaseGroups = {
    1: [1, 2, 3, 4],      // フェーズ1: 基本情報収集
    2: [5, 6, 7, 8],      // フェーズ2: 市場機会分析
    3: [9, 10, 11, 12],   // フェーズ3: ビジネス戦略分析
    4: [13, 14, 15, 16],  // フェーズ4: リスク・機会評価
    5: [17, 18]           // 最終処理
  };
  
  // 現在のフェーズを取得
  const currentPhase = Math.min(5, Math.ceil(step / 4));
  
  // 各フェーズの状態を更新
  for (let phase = 1; phase <= 5; phase++) {
    const phaseSteps = phaseGroups[phase];
    
    if (phase < currentPhase) {
      // 完了したフェーズ：すべての項目を完了状態に
      phaseSteps.forEach(stepNum => {
        const itemId = researchItems[stepNum];
        if (itemId) {
          updateResearchItemStatus(itemId, 'completed');
        }
      });
         } else if (phase === currentPhase) {
       // 現在のフェーズ：進行中のフェーズでは現在実行中の項目のみアクティブ
       phaseSteps.forEach(stepNum => {
         const itemId = researchItems[stepNum];
         if (itemId) {
           if (stepNum === step) {
             // 現在実行中の項目
             updateResearchItemStatus(itemId, 'in-progress');
           } else {
             // 同じフェーズ内の他の項目は保留状態のまま
             updateResearchItemStatus(itemId, 'pending');
           }
         }
       });
    } else {
      // 未来のフェーズ：すべて保留状態
      phaseSteps.forEach(stepNum => {
        const itemId = researchItems[stepNum];
        if (itemId) {
          updateResearchItemStatus(itemId, 'pending');
        }
      });
    }
  }
}



// ===== 調査項目の状態更新（新UI対応） =====
function updateResearchItemStatus(itemId, status) {
  // 新しいHTML構造での要素を検索
  const item = document.querySelector(`[data-id="${itemId}"]`);
  
  if (item) {
    // 既存のステータスクラスを削除
    item.classList.remove('pending', 'in-progress', 'completed', 'failed');
    item.classList.add(status);
    
    // アイコンを更新
    const icon = item.querySelector('.research-item-icon');
    if (icon) {
      switch (status) {
        case 'in-progress':
          icon.textContent = '🔄';
          break;
        case 'completed':
          icon.textContent = '✅';
          break;
        case 'failed':
          icon.textContent = '❌';
          break;
        default:
          icon.textContent = '⏳';
      }
    }
  }
}

// ===== 調査成功処理 =====
function handleResearchSuccess(event) {
  console.log('[App] 調査成功:', event);
  
  // 最終項目を完了状態に
  updateResearchItemStatus('notion', 'completed');
  
  // プログレスバーを100%に
  elements.progressFill.style.width = '100%';
  elements.progressPercentage.textContent = '100%';
  
  // 現在の調査表示を更新
  const icon = elements.currentResearchType.querySelector('.research-icon');
  const text = elements.currentResearchType.querySelector('.research-text');
  
  if (icon && text) {
    icon.textContent = '✅';
    text.textContent = '調査完了';
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
}

// ===== 調査エラー処理 =====
function handleResearchError(message) {
  console.error('[App] 調査エラー:', message);
  
  appState.error = message;
  appState.isLoading = false;
  appState.failedStep = appState.currentStep; // 失敗したステップを記録
  
  showErrorSection(message);
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
    totalSteps: 18,
    researchResults: [],
    error: null,
    notionUrl: null,
    eventSource: null,
    isConnected: false,
    lastEventTime: null,
    startTime: null,
    currentPhase: 1,
    completedBatches: 0,
    estimatedTotalTime: 9 * 60,
    lastFormData: null, // 再開用データもリセット
    failedStep: null // 失敗ステップもリセット
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
  elements.progressCounter.textContent = '0/18';
  
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

// ===== システム状態の更新 =====
function updateSystemStatus(status, message) {
  const statusElement = elements.systemStatus;
  const dotElement = statusElement.querySelector('.status-dot');
  
  if (dotElement) {
    // 既存のステータスクラスを削除
    dotElement.classList.remove('pending', 'success', 'error');
    dotElement.classList.add(status);
  }
  
  // メッセージを更新
  const textNode = Array.from(statusElement.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
  if (textNode) {
    textNode.textContent = message;
  } else {
    statusElement.appendChild(document.createTextNode(message));
  }
}

// ===== ローディング表示 =====
function showLoading(message) {
  if (elements.loadingOverlay) {
    const loadingText = elements.loadingOverlay.querySelector('.loading-text');
    if (loadingText) {
      loadingText.textContent = message || 'ロード中...';
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

// フィールドマッピング
const FIELD_MAPPING = {
    'コンセプト': 'concept',
    '解決したい顧客課題': 'customerProblem',
    '狙っている業種・業界': 'targetIndustry',
    '想定される利用者層': 'targetUsers',
    '直接競合・間接競合': 'competitors',
    '課金モデル': 'revenueModel',
    '価格帯・価格設定の方向性': 'pricingDirection',
    '暫定UVP（Unique Value Proposition）': 'uvp',
    '初期KPI': 'initialKpi',
    '獲得チャネル仮説': 'acquisitionChannels',
    '規制・技術前提': 'regulatoryTechPrereqs',
    '想定コスト構造': 'costStructure'
};

// ===== 一括入力機能 =====

// 一括入力機能のイベントリスナー設定
function setupBulkInputListeners() {
  const copyTemplateButton = document.getElementById('copyTemplateButton');
  const parseBulkButton = document.getElementById('parseBulkButton');
  const clearBulkButton = document.getElementById('clearBulkButton');
  
  // 一括入力関連
  if (copyTemplateButton) {
    copyTemplateButton.addEventListener('click', copyTemplate);
  }
  if (parseBulkButton) {
    parseBulkButton.addEventListener('click', parseBulkText);
  }
  if (clearBulkButton) {
    clearBulkButton.addEventListener('click', clearBulkInput);
  }
}

// テンプレートコピー機能
function copyTemplate() {
  const copyTemplateButton = document.getElementById('copyTemplateButton');
  const bulkInput = document.getElementById('bulkInput');
  
  if (!copyTemplateButton) return;
  
  navigator.clipboard.writeText(TEMPLATE_TEXT).then(() => {
    // ボタンの表示を一時的に変更
    const originalText = copyTemplateButton.innerHTML;
    copyTemplateButton.innerHTML = '<span class="btn-icon">✅</span>コピー完了';
    copyTemplateButton.style.background = '#10b981';
    
    setTimeout(() => {
      copyTemplateButton.innerHTML = originalText;
      copyTemplateButton.style.background = '#4A90C2';
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

// 一括テキストの解析機能
function parseBulkText() {
  const bulkInput = document.getElementById('bulkInput');
  
  if (!bulkInput) return;
  
  const bulkText = bulkInput.value.trim();
  
  if (!bulkText) {
    showBulkValidationError('一括入力エリアにテキストを入力してください。');
    return;
  }
  
  try {
    const parsed = parseTemplateText(bulkText);
    
    // 解析結果を個別フィールドに反映
    Object.entries(parsed).forEach(([fieldName, value]) => {
      const element = document.getElementById(fieldName);
      if (element) {
        element.value = value;
      }
    });
    
    // 成功メッセージ
    showBulkSuccessMessage('一括入力の解析が完了しました。左側のフィールドに反映されました。');
    
  } catch (error) {
    showBulkValidationError(`テキストの解析に失敗しました: ${error.message}`);
  }
}

// テンプレートテキストの解析
function parseTemplateText(text) {
  const lines = text.split('\n');
  const parsed = {};
  
  let currentField = null;
  let currentValue = '';
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // フィールド行の検出（コロンを含む行）
    if (trimmedLine.includes(':')) {
      // 前のフィールドがあれば保存
      if (currentField && FIELD_MAPPING[currentField]) {
        parsed[FIELD_MAPPING[currentField]] = currentValue.trim();
      }
      
      // 新しいフィールドを開始
      const [fieldName, ...valueParts] = trimmedLine.split(':');
      currentField = fieldName.trim();
      currentValue = valueParts.join(':').trim();
    } else if (currentField && trimmedLine) {
      // 継続行（前のフィールドの続き）
      currentValue += (currentValue ? '\n' : '') + trimmedLine;
    }
  }
  
  // 最後のフィールドを保存
  if (currentField && FIELD_MAPPING[currentField]) {
    parsed[FIELD_MAPPING[currentField]] = currentValue.trim();
  }
  
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