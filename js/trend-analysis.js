        // ===== 설비 데이터 경향 분석 =====
        let trendConversationHistory = [];
        
        // 설비·측정 항목과 관리 기준은 매번 같은 값을 다시 입력하지 않도록 저장해두고 다음에 복원함.
        // (측정 데이터 자체는 매번 새로 붙여넣는 것이라 저장하지 않음)
        function applyTrendSettings() {
            const subjectEl = document.getElementById('trendSubjectInput');
            const specEl = document.getElementById('trendSpecInput');
            if (subjectEl) subjectEl.value = trendSubject;
            if (specEl) specEl.value = trendSpec;
        }
        
        function setupTrendSettingsAutosave() {
            const subjectEl = document.getElementById('trendSubjectInput');
            const specEl = document.getElementById('trendSpecInput');
            if (!subjectEl || !specEl) return;
            
            let t1 = null, t2 = null;
            
            subjectEl.addEventListener('input', () => {
                clearTimeout(t1);
                t1 = setTimeout(() => {
                    trendSubject = subjectEl.value;
                    localStorage.setItem('trendSubject', trendSubject);
                    queueSync();
                }, 500);
            });
            
            specEl.addEventListener('input', () => {
                clearTimeout(t2);
                t2 = setTimeout(() => {
                    trendSpec = specEl.value;
                    localStorage.setItem('trendSpec', trendSpec);
                    queueSync();
                }, 500);
            });
        }
        
        async function analyzeTrendData() {
            const subject = document.getElementById('trendSubjectInput').value.trim();
            const data = document.getElementById('trendDataInput').value.trim();
            const spec = document.getElementById('trendSpecInput').value.trim();
            const btn = document.getElementById('trendAnalyzeBtn');
            const loading = document.getElementById('trendLoading');
            const statusEl = document.getElementById('trendStatus');
            const resultBlock = document.getElementById('trendResultBlock');
            
            if (!data) {
                statusEl.textContent = '분석할 측정값을 붙여넣어주세요';
                statusEl.className = 'ai-status error';
                return;
            }
            
            btn.disabled = true;
            loading.style.display = 'block';
            statusEl.textContent = '';
            statusEl.className = 'ai-status';
            resultBlock.style.display = 'none';
            
            const userPrompt =
                `[설비/측정 항목]\n${subject || '(지정하지 않음)'}\n\n` +
                `[관리 기준]\n${spec || '(제공되지 않음)'}\n\n` +
                `[측정 데이터]\n${data}`;
            
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'trendAnalysis', prompt: userPrompt, userApiKey: personalAiApiKey })
                });
                
                const result = await res.json();
                
                if (result.status === 'success' && result.summary) {
                    document.getElementById('trendResultTextarea').value = result.summary;
                    document.getElementById('trendReviseInput').value = '';
                    resultBlock.style.display = 'block';
                    statusEl.textContent = '✅ 분석이 완료되었습니다';
                    statusEl.className = 'ai-status success';
                    
                    trendConversationHistory = [
                        { role: 'user', text: userPrompt },
                        { role: 'model', text: result.summary }
                    ];
                } else {
                    statusEl.textContent = '⚠️ ' + (result.message || '분석에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('경향 분석 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            } finally {
                btn.disabled = false;
                loading.style.display = 'none';
            }
        }
        
        async function reviseTrendAnalysis() {
            const input = document.getElementById('trendReviseInput');
            const instruction = input.value.trim();
            const btn = document.getElementById('trendReviseBtn');
            const loading = document.getElementById('trendLoading');
            const statusEl = document.getElementById('trendStatus');
            
            if (!instruction) {
                statusEl.textContent = '질문 내용을 입력해주세요';
                statusEl.className = 'ai-status error';
                return;
            }
            if (trendConversationHistory.length === 0) {
                statusEl.textContent = '먼저 분석을 실행해주세요';
                statusEl.className = 'ai-status error';
                return;
            }
            
            btn.disabled = true;
            loading.style.display = 'block';
            statusEl.textContent = '';
            statusEl.className = 'ai-status';
            
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'trendRevise',
                        history: trendConversationHistory,
                        instruction: instruction,
                        userApiKey: personalAiApiKey
                    })
                });
                
                const result = await res.json();
                
                if (result.status === 'success' && result.summary) {
                    document.getElementById('trendResultTextarea').value = result.summary;
                    statusEl.textContent = '✅ 답변이 반영되었습니다';
                    statusEl.className = 'ai-status success';
                    
                    trendConversationHistory.push({ role: 'user', text: instruction });
                    trendConversationHistory.push({ role: 'model', text: result.summary });
                    input.value = '';
                } else {
                    statusEl.textContent = '⚠️ ' + (result.message || '처리에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('경향 분석 추가 질문 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            } finally {
                btn.disabled = false;
                loading.style.display = 'none';
            }
        }
        
        function copyTrendResult() {
            const textarea = document.getElementById('trendResultTextarea');
            textarea.select();
            document.execCommand('copy');
            
            const statusEl = document.getElementById('trendStatus');
            statusEl.textContent = '📋 복사되었습니다!';
            statusEl.className = 'ai-status success';
        }
        
