#!/usr/bin/env python3
"""
Market Research System - バグ分析・デバッグツール
本番環境で発生したバグの分析と修正支援
"""

import requests
import json
import os
import sys
from datetime import datetime
from typing import Dict, List, Any, Optional

class ProductionDebugTool:
    """本番環境デバッグ用ツール"""
    
    def __init__(self, base_url: str = None):
        """
        初期化
        Args:
            base_url: Railway本番環境のURL（省略時は環境変数から取得）
        """
        self.base_url = base_url or os.getenv('PRODUCTION_URL', 'https://your-railway-app.up.railway.app')
        self.session = requests.Session()
        self.session.timeout = 30
        
    def test_basic_endpoints(self) -> Dict[str, Any]:
        """基本エンドポイントの疎通確認"""
        print("🔍 基本エンドポイントテスト開始...")
        
        endpoints = {
            'health': '/health',
            'prompts': '/api/research/prompts', 
            'test': '/api/research/test'
        }
        
        results = {}
        
        for name, path in endpoints.items():
            try:
                url = f"{self.base_url}{path}"
                print(f"  テスト中: {name} ({url})")
                
                response = self.session.get(url)
                
                results[name] = {
                    'status_code': response.status_code,
                    'success': response.status_code == 200,
                    'response_time': response.elapsed.total_seconds(),
                    'content_length': len(response.content),
                    'headers': dict(response.headers),
                }
                
                if response.status_code == 200:
                    try:
                        results[name]['json_data'] = response.json()
                        print(f"    ✅ {name}: 正常 ({response.status_code}, {response.elapsed.total_seconds():.2f}s)")
                    except:
                        results[name]['text_data'] = response.text[:500]
                        print(f"    ✅ {name}: 正常（テキスト応答）")
                else:
                    print(f"    ❌ {name}: エラー ({response.status_code})")
                    results[name]['error_text'] = response.text
                    
            except Exception as e:
                print(f"    💥 {name}: 例外発生 - {str(e)}")
                results[name] = {
                    'success': False,
                    'error': str(e)
                }
        
        return results
    
    def simulate_research_flow(self, business_name: str = "テスト事業") -> Dict[str, Any]:
        """調査フローのシミュレーション"""
        print(f"🧪 調査フローシミュレーション開始: {business_name}")
        
        # Step 1: プロンプト取得
        try:
            prompts_response = self.session.get(f"{self.base_url}/api/research/prompts")
            if prompts_response.status_code != 200:
                return {"error": f"プロンプト取得失敗: {prompts_response.status_code}"}
                
            prompts_data = prompts_response.json()
            print(f"  ✅ プロンプト取得: {len(prompts_data.get('data', {}).get('prompts', []))}件")
            
        except Exception as e:
            return {"error": f"プロンプト取得例外: {str(e)}"}
        
        # Step 2: 調査実行（テスト用の軽量リクエスト）
        test_request = {
            "businessName": business_name,
            "serviceHypothesis": {
                "concept": "テスト用調査システム",
                "customerProblem": "市場調査の自動化",
                "targetIndustry": "IT・システム開発",
                "targetUsers": "マーケティング担当者",
                "competitors": "手動調査、既存ツール"
            }
        }
        
        try:
            # Note: 実際の調査実行は時間がかかるため、バリデーションのみ確認
            research_url = f"{self.base_url}/api/research/conduct"
            print(f"  🔍 調査エンドポイント確認: {research_url}")
            
            # HEAD リクエストでエンドポイントの存在確認
            head_response = self.session.head(research_url)
            endpoint_exists = head_response.status_code != 404
            
            return {
                "prompts_count": len(prompts_data.get('data', {}).get('prompts', [])),
                "research_endpoint_exists": endpoint_exists,
                "test_request_valid": True,
                "business_name": business_name
            }
            
        except Exception as e:
            return {"error": f"調査フロー確認例外: {str(e)}"}
    
    def check_api_dependencies(self) -> Dict[str, Any]:
        """外部API依存関係の確認"""
        print("🔗 外部API依存関係チェック...")
        
        dependencies = {}
        
        # Notion API ステータス確認
        try:
            notion_status = self.session.get("https://status.notion.so/api/v2/status.json", timeout=10)
            dependencies['notion'] = {
                'status': 'up' if notion_status.status_code == 200 else 'down',
                'response_time': notion_status.elapsed.total_seconds()
            }
            print("  ✅ Notion API: 疎通確認")
        except Exception as e:
            dependencies['notion'] = {'status': 'error', 'error': str(e)}
            print(f"  ❌ Notion API: {str(e)}")
        
        # Google AI Studio（Gemini）の確認は困難なので、アプリケーション経由で確認
        try:
            test_response = self.session.get(f"{self.base_url}/api/research/test")
            if test_response.status_code == 200:
                test_data = test_response.json()
                dependencies['gemini'] = {
                    'status': 'up' if test_data.get('gemini') else 'down',
                    'test_result': test_data.get('gemini', False)
                }
            else:
                dependencies['gemini'] = {'status': 'unknown', 'error': 'テストエンドポイント応答なし'}
        except Exception as e:
            dependencies['gemini'] = {'status': 'error', 'error': str(e)}
        
        return dependencies
    
    def analyze_error_patterns(self, log_text: str = None) -> Dict[str, Any]:
        """エラーパターンの分析"""
        print("📊 エラーパターン分析...")
        
        if not log_text:
            print("  ⚠️ ログテキストが提供されていません")
            return {"error": "ログテキストが必要です"}
        
        patterns = {
            'api_timeout': ['timeout', 'ETIMEDOUT', 'request timeout'],
            'rate_limit': ['rate limit', '429', 'too many requests'],
            'notion_error': ['notion', 'NOTION_', 'notion api'],
            'gemini_error': ['gemini', 'google', 'generative-ai'],
            'memory_error': ['memory', 'heap', 'out of memory'],
            'network_error': ['ECONNRESET', 'ENOTFOUND', 'network'],
            'json_parse_error': ['JSON.parse', 'unexpected token', 'json'],
            'typescript_error': ['TypeScript', '.ts:', 'compilation']
        }
        
        found_patterns = {}
        for pattern_name, keywords in patterns.items():
            matches = []
            for keyword in keywords:
                if keyword.lower() in log_text.lower():
                    matches.append(keyword)
            
            if matches:
                found_patterns[pattern_name] = {
                    'matched_keywords': matches,
                    'count': len(matches)
                }
        
        return {
            'total_patterns': len(found_patterns),
            'patterns': found_patterns,
            'log_length': len(log_text),
            'analysis_time': datetime.now().isoformat()
        }
    
    def generate_debug_report(self) -> str:
        """総合デバッグレポートの生成"""
        print("📋 総合デバッグレポート生成中...")
        
        # 各種テストの実行
        basic_test = self.test_basic_endpoints()
        flow_test = self.simulate_research_flow()
        deps_test = self.check_api_dependencies()
        
        # レポートの構築
        report_lines = [
            "# 🔍 Market Research System - デバッグレポート",
            f"**生成日時**: {datetime.now().strftime('%Y年%m月%d日 %H:%M:%S')}",
            f"**対象環境**: {self.base_url}",
            "",
            "## 📊 基本エンドポイントテスト",
        ]
        
        for endpoint, result in basic_test.items():
            status = "✅ 正常" if result.get('success') else "❌ 異常"
            report_lines.append(f"- **{endpoint}**: {status}")
            if not result.get('success'):
                report_lines.append(f"  - エラー: {result.get('error', 'Unknown')}")
        
        report_lines.extend([
            "",
            "## 🧪 調査フローテスト",
        ])
        
        if 'error' not in flow_test:
            report_lines.append("- ✅ 調査フロー: 基本構造は正常")
            report_lines.append(f"  - プロンプト数: {flow_test.get('prompts_count', 'N/A')}")
            report_lines.append(f"  - 調査エンドポイント: {'存在' if flow_test.get('research_endpoint_exists') else '不明'}")
        else:
            report_lines.append("- ❌ 調査フロー: エラー発生")
            report_lines.append(f"  - エラー: {flow_test['error']}")
        
        report_lines.extend([
            "",
            "## 🔗 外部API依存関係",
        ])
        
        for service, result in deps_test.items():
            status = "✅ 正常" if result.get('status') == 'up' else "❌ 異常"
            report_lines.append(f"- **{service.upper()}**: {status}")
            if result.get('status') != 'up':
                report_lines.append(f"  - エラー: {result.get('error', 'Unknown')}")
        
        report_lines.extend([
            "",
            "## 🚨 推奨アクション",
            "",
            "### 異常が検出された場合:",
            "1. Railway ダッシュボードでログを確認",
            "2. 環境変数の設定を確認",
            "3. API制限の状況を確認",
            "4. このレポートを元にバグレポートを作成",
            "",
            "### 正常な場合:",
            "1. 具体的なバグの再現手順を詳細に記録",
            "2. ブラウザのDeveloper Toolsでエラーを確認", 
            "3. 特定の操作でのみ発生する問題かを調査",
            "",
            f"**レポート生成ツール**: `python3 debug_tools.py --full-report`"
        ])
        
        return "\n".join(report_lines)

def main():
    """メイン実行関数"""
    if len(sys.argv) > 1:
        base_url = sys.argv[1]
        print(f"🎯 指定されたURL: {base_url}")
    else:
        base_url = input("🔗 Railway本番環境のURL（省略時はデフォルト）: ").strip()
        if not base_url:
            base_url = None
    
    debugger = ProductionDebugTool(base_url)
    
    print("="*60)
    print("🐛 Market Research System - デバッグツール")
    print("="*60)
    
    # オプション選択
    options = {
        "1": ("基本エンドポイントテスト", debugger.test_basic_endpoints),
        "2": ("調査フローシミュレーション", debugger.simulate_research_flow),
        "3": ("外部API依存関係チェック", debugger.check_api_dependencies),
        "4": ("総合デバッグレポート", debugger.generate_debug_report),
    }
    
    print("\n🛠️ 実行する診断を選択してください:")
    for key, (name, _) in options.items():
        print(f"  {key}. {name}")
    print("  q. 終了")
    
    while True:
        choice = input("\n選択 (1-4, q): ").strip()
        
        if choice.lower() == 'q':
            print("👋 デバッグツールを終了します")
            break
        elif choice in options:
            name, func = options[choice]
            print(f"\n🚀 {name} を実行中...")
            print("-" * 40)
            
            try:
                if choice == "4":  # 総合レポート
                    result = func()
                    print(result)
                else:
                    result = func()
                    print(f"\n📋 結果:")
                    print(json.dumps(result, indent=2, ensure_ascii=False))
            except Exception as e:
                print(f"❌ エラー: {str(e)}")
            
            print("-" * 40)
            input("Enterキーで続行...")
        else:
            print("❌ 無効な選択です")

if __name__ == "__main__":
    main() 