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
  lastEventTime: null
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
  progressText: document.getElementById('progressText'),
  progressCounter: document.getElementById('progressCounter'),
  progressFill: document.getElementById('progressFill'),
  progressPercentage: document.getElementById('progressPercentage'),
  currentResearchType: document.getElementById('currentResearchType'),
  researchItems: document.getElementById('researchItems'),
  
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
    
    const response = await fetch('/api/research/health');
    const data = await response.json();
    
    if (data.success) {
      updateSystemStatus('success', 'システム正常');
      console.log('[App] システム健康状態チェック成功:', data.data);
    } else {
      updateSystemStatus('error', 'システムエラー');
      console.error('[App] システム健康状態チェック失敗:', data.error);
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

// ===== 調査項目UIの初期化 =====
function initializeResearchItems() {
  if (!elements.researchItems || researchPrompts.length === 0) return;
  
  elements.researchItems.innerHTML = '';
  
  researchPrompts.forEach((prompt, index) => {
    const item = document.createElement('div');
    item.className = 'research-item pending';
    item.dataset.id = prompt.id;
    item.innerHTML = `
      <span class="research-item-icon">⏳</span>
      <span class="research-item-text">${prompt.title}</span>
    `;
    elements.researchItems.appendChild(item);
  });
  
  // 統合レポートとNotion保存の項目も追加
  const additionalItems = [
    { id: 'integration', title: '統合レポート生成' },
    { id: 'notion', title: 'Notion保存' }
  ];
  
  additionalItems.forEach(item => {
    const element = document.createElement('div');
    element.className = 'research-item pending';
    element.dataset.id = item.id;
    element.innerHTML = `
      <span class="research-item-icon">⏳</span>
      <span class="research-item-text">${item.title}</span>
    `;
    elements.researchItems.appendChild(element);
  });
}

// ===== フォーム送信処理 =====
async function handleFormSubmit(event) {
  event.preventDefault();
  
  console.log('[App] フォーム送信開始');
  
  // バリデーション
  const formData = getFormData();
  const validation = validateFormData(formData);
  
  if (!validation.isValid) {
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
  
  field.style.borderColor = 'var(--error-red)';
  
  const errorElement = document.createElement('div');
  errorElement.className = 'field-error';
  errorElement.style.color = 'var(--error-red)';
  errorElement.style.fontSize = 'var(--font-size-sm)';
  errorElement.style.marginTop = 'var(--spacing-1)';
  errorElement.textContent = message;
  
  field.parentNode.appendChild(errorElement);
}

// ===== フィールドエラーのクリア =====
function clearFieldError(field) {
  field.style.borderColor = '';
  
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
function startResearch(formData) {
  console.log('[App] 市場調査開始:', formData.businessName);
  
  // UI状態を更新
  appState.isLoading = true;
  updateUIForResearchStart();
  
  // Server-Sent Events接続
  connectToResearchStream(formData);
}

// ===== Server-Sent Events接続 =====
function connectToResearchStream(formData) {
  try {
    console.log('[App] SSE接続開始');
    
    // 既存の接続があれば閉じる
    if (appState.eventSource) {
      appState.eventSource.close();
    }
    
    // EventSourceは直接POSTをサポートしないため、fetchでPOSTしてからSSEを受信
    fetch('/api/research/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData)
    }).then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
  elements.progressText.textContent = event.message;
  elements.progressCounter.textContent = `${event.step}/${event.total}`;
  
  // 現在の調査表示の更新
  if (event.researchType) {
    updateCurrentResearch(event.researchType);
  }
  
  // 調査項目の状態更新
  if (event.step > 0 && event.step <= researchPrompts.length) {
    updateResearchItemStatus(event.step - 1, 'in-progress');
    
    // 前の項目を完了状態に
    if (event.step > 1) {
      updateResearchItemStatus(event.step - 2, 'completed');
    }
  } else if (event.step === researchPrompts.length + 1) {
    // 統合レポート生成中
    updateResearchItemStatus('integration', 'in-progress');
    if (researchPrompts.length > 0) {
      updateResearchItemStatus(researchPrompts.length - 1, 'completed');
    }
  } else if (event.step === researchPrompts.length + 2) {
    // Notion保存中
    updateResearchItemStatus('notion', 'in-progress');
    updateResearchItemStatus('integration', 'completed');
  }
}

// ===== 現在の調査表示の更新 =====
function updateCurrentResearch(researchType) {
  const icon = elements.currentResearchType.querySelector('.research-icon');
  const text = elements.currentResearchType.querySelector('.research-text');
  
  if (icon && text) {
    icon.textContent = '🔄';
    text.textContent = researchType;
  }
}

// ===== 調査項目の状態更新 =====
function updateResearchItemStatus(index, status) {
  let item;
  
  if (typeof index === 'string') {
    // 特別な項目（integration, notion）
    item = elements.researchItems.querySelector(`[data-id="${index}"]`);
  } else {
    // 通常の調査項目
    const promptId = researchPrompts[index]?.id;
    if (promptId) {
      item = elements.researchItems.querySelector(`[data-id="${promptId}"]`);
    }
  }
  
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
  elements.errorMessage.textContent = message || '予期しないエラーが発生しました。';
  
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
    lastEventTime: null
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
  elements.progressText.textContent = '調査を開始しています...';
  elements.progressCounter.textContent = '0/18';
  
  // 調査項目をリセット
  initializeResearchItems();
  
  // トップにスクロール
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== 調査のリトライ =====
function retryResearch() {
  console.log('[App] 調査リトライ');
  
  // フォームデータを再取得
  const formData = getFormData();
  
  // エラーセクションを非表示
  elements.errorSection.classList.add('hidden');
  
  // 調査を再開始
  startResearch(formData);
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
const TEMPLATE_TEXT = `コンセプト: 
解決したい顧客課題: 
狙っている業種・業界: 
想定される利用者層: 
直接競合・間接競合: 
課金モデル: 
価格帯・価格設定の方向性: 
暫定UVP（Unique Value Proposition）: 
初期KPI: 
獲得チャネル仮説: 
規制・技術前提: 
想定コスト構造: `;

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

// 現在のアクティブなタブを記録
let activeTab = 'individual';

// ===== 一括入力機能 =====

// 一括入力機能のイベントリスナー設定
function setupBulkInputListeners() {
  const individualTab = document.getElementById('individualTab');
  const bulkTab = document.getElementById('bulkTab');
  const copyTemplateButton = document.getElementById('copyTemplateButton');
  const parseBulkButton = document.getElementById('parseBulkButton');
  const clearBulkButton = document.getElementById('clearBulkButton');
  
  // 要素が存在しない場合は何もしない
  if (!individualTab || !bulkTab) return;
  
  // タブ切り替え
  individualTab.addEventListener('click', () => switchTab('individual'));
  bulkTab.addEventListener('click', () => switchTab('bulk'));
  
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

// タブ切り替え機能
function switchTab(tabName) {
  activeTab = tabName;
  
  const individualTab = document.getElementById('individualTab');
  const bulkTab = document.getElementById('bulkTab');
  const individualPanel = document.getElementById('individualPanel');
  const bulkPanel = document.getElementById('bulkPanel');
  
  if (!individualTab || !bulkTab || !individualPanel || !bulkPanel) return;
  
  // タブボタンの切り替え
  if (tabName === 'individual') {
    individualTab.classList.add('active');
    bulkTab.classList.remove('active');
    individualPanel.classList.add('active');
    bulkPanel.classList.remove('active');
  } else {
    bulkTab.classList.add('active');
    individualTab.classList.remove('active');
    bulkPanel.classList.add('active');
    individualPanel.classList.remove('active');
  }
  
  // バリデーションエラーをクリア
  hideValidationErrors();
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
      copyTemplateButton.style.background = '#3b82f6';
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
    
    // 個別入力タブに切り替え
    switchTab('individual');
    
    // 成功メッセージ
    showBulkSuccessMessage('一括入力の解析が完了しました。個別フィールドに反映されました。');
    
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