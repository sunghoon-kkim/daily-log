
        // AI 월별 피드백도 기간별 카테고리 조회와 똑같이 매번 날짜 두 칸을 손으로 고르게 돼 있었어서,
        // 같은 프리셋 버튼을 재사용해 붙여줌
        function applyAiFeedbackPreset(preset) {
            const range = computePresetDateRange(preset);
            if (!range) return;

            document.getElementById('aiStartDate').value = formatDate(range.start);
            document.getElementById('aiEndDate').value = formatDate(range.end);
            document.querySelectorAll('#aiFeedbackPresetRow .quick-preset-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.preset === preset);
            });
        }

        function clearAiFeedbackPresetSelection() {
            document.querySelectorAll('#aiFeedbackPresetRow .quick-preset-btn').forEach(btn => {
                btn.classList.remove('selected');
            });
        }
        // ===== AI 월별 피드백 요약 =====
        function applyAITemplate() {
            document.getElementById('aiTemplateTextarea').value = aiTemplateContent;
        }

        // 자유롭게 고칠 수 있는 피드백 양식을 원래 기본 양식으로 되돌림. 자유 수정은 되는데
        // 되돌릴 방법이 없어서, 이상하게 고쳐놓고 되돌리지 못하는 경우를 위한 안전장치
        function resetAITemplate() {
            if (!checkEditPermission()) return;
            confirmModal('지금 수정한 피드백 양식을 기본 양식으로 되돌리시겠습니까?', () => {
                aiTemplateContent = DEFAULT_AI_TEMPLATE;
                document.getElementById('aiTemplateTextarea').value = DEFAULT_AI_TEMPLATE;
                safeSetItem('aiTemplate', aiTemplateContent);
                queueSync();
            });
        }
        
        function setupAITemplateAutosave() {
            const textarea = document.getElementById('aiTemplateTextarea');
            let saveTimeout = null;
            
            textarea.addEventListener('input', () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => {
                    aiTemplateContent = textarea.value;
                    safeSetItem('aiTemplate', aiTemplateContent);
                    queueSync();
                }, 500);
            });
        }
        
        // 선택한 기간의 활동기록 + 예정작업을 하나의 텍스트로 정리
        function buildLogTextForRange(startStr, endStr) {
            const dates = Object.keys(records)
                .filter(d => d >= startStr && d <= endStr)
                .sort();
            
            let text = '';
            for (const dateStr of dates) {
                const rec = records[dateStr];
                const parts = [];
                for (const category of getAllRecordCategories()) { // 보관한 카테고리의 과거 기록도 요약 대상에 포함
                    if (rec[category] && rec[category].trim() !== '') {
                        parts.push(`  [${category}] ${rec[category].trim()}`);
                    }
                }
                
                const dayEvents = events.filter(ev => dateStr >= ev.start && dateStr <= ev.end);
                if (dayEvents.length > 0) {
                    parts.push(`  [예정작업] ${dayEvents.map(ev => ev.title).join(', ')}`);
                }
                
                if (parts.length > 0) {
                    text += `\n${dateStr}\n` + parts.join('\n') + '\n';
                }
            }
            return text.trim();
        }
        
        // ===== 일일 업무 요약 (퇴근 전 보고용) =====
        // 일일 업무 요약 로딩 중 보여줄 가짜 진행률 - 실제 API는 진행률을 안 주므로,
        // 남은 구간을 매번 조금씩 채워가며 90%에서 멈춰있다가 응답이 오면 100%로 채움
        let dailySummaryProgressTimer = null;
        const DAILY_SUMMARY_LOADING_MESSAGES = ['오늘 업무를 정리하는 중입니다', '항목을 다듬는 중입니다', '거의 다 됐습니다'];

        function startDailySummaryProgress() {
            const msgEl = document.getElementById('dailySummaryLoadingMsg');
            const percentEl = document.getElementById('dailySummaryLoadingPercent');
            const barEl = document.getElementById('dailySummaryLoadingBar');
            let percent = 0;
            let msgIndex = 0;
            if (msgEl) msgEl.textContent = DAILY_SUMMARY_LOADING_MESSAGES[0];
            if (percentEl) percentEl.textContent = '0%';
            if (barEl) barEl.style.width = '0%';

            dailySummaryProgressTimer = setInterval(() => {
                percent = Math.min(99, percent + 1);
                if (percentEl) percentEl.textContent = Math.round(percent) + '%';
                if (barEl) barEl.style.width = percent + '%';

                const nextMsgIndex = percent > 65 ? 2 : (percent > 25 ? 1 : 0);
                if (nextMsgIndex !== msgIndex) {
                    msgIndex = nextMsgIndex;
                    if (msgEl) msgEl.textContent = DAILY_SUMMARY_LOADING_MESSAGES[msgIndex];
                }
            }, 350);
        }

        function stopDailySummaryProgress(success) {
            clearInterval(dailySummaryProgressTimer);
            dailySummaryProgressTimer = null;
            const percentEl = document.getElementById('dailySummaryLoadingPercent');
            const barEl = document.getElementById('dailySummaryLoadingBar');
            if (success) {
                if (percentEl) percentEl.textContent = '100%';
                if (barEl) barEl.style.width = '100%';
            }
        }

        // 결과를 직접 손으로 고친 뒤 "생성"을 다시 누르면 확인 없이 사라졌었음. 마지막으로
        // AI가 채워준 값을 기억해뒀다가, 지금 textarea 값이 그것과 다르면(=사람이 손을 댔으면)
        // 재생성 전에 한 번 확인받음
        let lastGeneratedDailySummaryText = null;

        function confirmOverwriteIfEdited(textareaId, lastGeneratedText, onConfirmed) {
            const textarea = document.getElementById(textareaId);
            const hasUnsavedEdit = textarea && textarea.value && textarea.value !== lastGeneratedText;
            if (hasUnsavedEdit) {
                confirmModal('지금 결과창에 직접 수정한 내용이 있습니다. 다시 생성하면 그 내용이 사라집니다. 계속할까요?', onConfirmed);
                return;
            }
            onConfirmed();
        }

        function generateDailySummary() {
            confirmOverwriteIfEdited('dailySummaryResultTextarea', lastGeneratedDailySummaryText, doGenerateDailySummary);
        }

        async function doGenerateDailySummary() {
            const dateStr = document.getElementById('dailySummaryDate').value;
            const btn = document.getElementById('dailySummaryBtn');
            const loading = document.getElementById('dailySummaryLoading');
            const statusEl = document.getElementById('dailySummaryStatus');
            const resultBlock = document.getElementById('dailySummaryResultBlock');
            
            if (!dateStr) {
                statusEl.textContent = '날짜를 선택해주세요';
                statusEl.className = 'ai-status error';
                return;
            }
            
            const logText = buildLogTextForRange(dateStr, dateStr);
            if (!logText) {
                statusEl.textContent = '이 날짜에 작성된 활동기록이 없습니다';
                statusEl.className = 'ai-status error';
                return;
            }
            
            const dateObj = new Date(dateStr);
            const dateLabel = dateObj.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
            
            btn.disabled = true;
            loading.style.display = 'block';
            statusEl.textContent = '';
            statusEl.className = 'ai-status';
            resultBlock.style.display = 'none';
            startDailySummaryProgress();

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'dailySummary',
                        employeeId: currentEmployeeId,
                        date: dateStr,
                        dateLabel: dateLabel,
                        logText: logText,
                        itemCount: document.getElementById('dailySummaryItemCount').value,
                        userApiKey: personalAiApiKey
                    })
                });

                const data = await res.json();

                if (data.status === 'success' && data.summary) {
                    stopDailySummaryProgress(true);
                    lastGeneratedDailySummaryText = data.summary;
                    document.getElementById('dailySummaryResultTextarea').value = data.summary;
                    resultBlock.style.display = 'block';
                    statusEl.textContent = '✅ 오늘 업무 요약이 생성되었습니다';
                    statusEl.className = 'ai-status success';
                } else {
                    stopDailySummaryProgress(false);
                    statusEl.textContent = '⚠️ ' + (data.message || '요약 생성에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('일일 업무 요약 오류:', err);
                stopDailySummaryProgress(false);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다. Apps Script 설정을 확인해주세요.';
                statusEl.className = 'ai-status error';
            } finally {
                btn.disabled = false;
                loading.style.display = 'none';
            }
        }
        
        function copyDailySummaryResult() {
            const textarea = document.getElementById('dailySummaryResultTextarea');
            textarea.select();
            document.execCommand('copy');

            const statusEl = document.getElementById('dailySummaryStatus');
            statusEl.textContent = '📋 복사되었습니다!';
            statusEl.className = 'ai-status success';
        }

        // ===== 이번주 업무 요약 =====
        // 오늘이 속한 주의 월요일~일요일 범위를 구함 (일요일은 getDay()가 0이라 따로 처리)
        function getThisWeekRange() {
            const today = new Date();
            const day = today.getDay();
            const diffToMonday = day === 0 ? -6 : 1 - day;
            const monday = new Date(today);
            monday.setDate(today.getDate() + diffToMonday);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            return { start: formatDate(monday), end: formatDate(sunday) };
        }

        let weeklySummaryProgressTimer = null;
        const WEEKLY_SUMMARY_LOADING_MESSAGES = ['이번 주 업무를 정리하는 중입니다', '카테고리별로 묶는 중입니다', '거의 다 됐습니다'];

        function startWeeklySummaryProgress() {
            const msgEl = document.getElementById('weeklySummaryLoadingMsg');
            const percentEl = document.getElementById('weeklySummaryLoadingPercent');
            const barEl = document.getElementById('weeklySummaryLoadingBar');
            let percent = 0;
            let msgIndex = 0;
            if (msgEl) msgEl.textContent = WEEKLY_SUMMARY_LOADING_MESSAGES[0];
            if (percentEl) percentEl.textContent = '0%';
            if (barEl) barEl.style.width = '0%';

            weeklySummaryProgressTimer = setInterval(() => {
                percent = Math.min(99, percent + 1);
                if (percentEl) percentEl.textContent = Math.round(percent) + '%';
                if (barEl) barEl.style.width = percent + '%';

                const nextMsgIndex = percent > 65 ? 2 : (percent > 25 ? 1 : 0);
                if (nextMsgIndex !== msgIndex) {
                    msgIndex = nextMsgIndex;
                    if (msgEl) msgEl.textContent = WEEKLY_SUMMARY_LOADING_MESSAGES[msgIndex];
                }
            }, 350);
        }

        function stopWeeklySummaryProgress(success) {
            clearInterval(weeklySummaryProgressTimer);
            weeklySummaryProgressTimer = null;
            const percentEl = document.getElementById('weeklySummaryLoadingPercent');
            const barEl = document.getElementById('weeklySummaryLoadingBar');
            if (success) {
                if (percentEl) percentEl.textContent = '100%';
                if (barEl) barEl.style.width = '100%';
            }
        }

        let lastGeneratedWeeklySummaryText = null;

        function generateWeeklySummary() {
            confirmOverwriteIfEdited('weeklySummaryResultTextarea', lastGeneratedWeeklySummaryText, doGenerateWeeklySummary);
        }

        async function doGenerateWeeklySummary() {
            const btn = document.getElementById('weeklySummaryBtn');
            const loading = document.getElementById('weeklySummaryLoading');
            const statusEl = document.getElementById('weeklySummaryStatus');
            const resultBlock = document.getElementById('weeklySummaryResultBlock');

            const { start, end } = getThisWeekRange();
            const logText = buildLogTextForRange(start, end);
            if (!logText) {
                statusEl.textContent = '이번 주에 작성된 활동기록이 없습니다';
                statusEl.className = 'ai-status error';
                return;
            }

            const startLabel = new Date(start).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
            const endLabel = new Date(end).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
            const periodLabel = `${startLabel} ~ ${endLabel}`;

            btn.disabled = true;
            loading.style.display = 'block';
            statusEl.textContent = '';
            statusEl.className = 'ai-status';
            resultBlock.style.display = 'none';
            startWeeklySummaryProgress();

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'weeklySummary',
                        periodLabel: periodLabel,
                        logText: logText,
                        userApiKey: personalAiApiKey
                    })
                });

                const data = await res.json();

                if (data.status === 'success' && data.summary) {
                    stopWeeklySummaryProgress(true);
                    lastGeneratedWeeklySummaryText = data.summary;
                    document.getElementById('weeklySummaryResultTextarea').value = data.summary;
                    resultBlock.style.display = 'block';
                    statusEl.textContent = '✅ 이번주 업무 요약이 생성되었습니다';
                    statusEl.className = 'ai-status success';
                } else {
                    stopWeeklySummaryProgress(false);
                    statusEl.textContent = '⚠️ ' + (data.message || '요약 생성에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('이번주 업무 요약 오류:', err);
                stopWeeklySummaryProgress(false);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다. Apps Script 설정을 확인해주세요.';
                statusEl.className = 'ai-status error';
            } finally {
                btn.disabled = false;
                loading.style.display = 'none';
            }
        }

        function copyWeeklySummaryResult() {
            const textarea = document.getElementById('weeklySummaryResultTextarea');
            textarea.select();
            document.execCommand('copy');

            const statusEl = document.getElementById('weeklySummaryStatus');
            statusEl.textContent = '📋 복사되었습니다!';
            statusEl.className = 'ai-status success';
        }

        let aiConversationHistory = []; // [{role:'user'|'model', text:'...'}] - raw(JSON원문)을 저장해 맥락 유지

        // "생성하기"는 대화로 다듬어온 내용(aiConversationHistory)을 확인 없이 통째로 덮어썼음.
        // 최초 생성 직후엔 history가 정확히 2개(사용자 프롬프트+모델 응답)이고, 다듬기(revise)를
        // 한 번 할 때마다 2개씩 늘어나므로, 2개 초과면 다듬은 내용이 있다는 뜻 - 그럴 때만 확인받음
        async function generateAISummary() {
            if (aiConversationHistory.length > 2) {
                confirmModal('지금까지 대화로 다듬은 내용이 있습니다. 새로 생성하면 그 내용이 사라지고 처음부터 다시 만들어집니다. 계속할까요?', () => {
                    doGenerateAISummary();
                });
                return;
            }
            doGenerateAISummary();
        }

        async function doGenerateAISummary() {
            const startStr = document.getElementById('aiStartDate').value;
            const endStr = document.getElementById('aiEndDate').value;
            const template = document.getElementById('aiTemplateTextarea').value;
            const btn = document.getElementById('aiGenerateBtn');
            const reviseBtn = document.getElementById('aiReviseBtn');
            const loading = document.getElementById('aiLoading');
            const statusEl = document.getElementById('aiStatus');
            const resultBlock = document.getElementById('aiResultBlock');

            if (!startStr || !endStr) {
                statusEl.textContent = '기간을 선택해주세요';
                statusEl.className = 'ai-status error';
                return;
            }
            
            let logText = buildLogTextForRange(startStr, endStr);
            if (!logText) {
                statusEl.textContent = '해당 기간에 작성된 활동기록이 없습니다';
                statusEl.className = 'ai-status error';
                return;
            }
            
            const projectsSummary = buildSavingsProjectsSummaryText();
            if (projectsSummary) {
                logText += `\n\n[등록된 개선/절감 과제 현황]\n${projectsSummary}`;
            }

            const feedbackHistoryText = buildFeedbackHistoryContextText();

            btn.disabled = true;
            reviseBtn.disabled = true;
            loading.style.display = 'block';
            statusEl.textContent = '';
            statusEl.className = 'ai-status';
            resultBlock.style.display = 'none';

            const periodLabel = `${startStr} ~ ${endStr}`;
            
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'summarize',
                        template: template,
                        logText: logText,
                        periodLabel: periodLabel,
                        feedbackHistoryText: feedbackHistoryText,
                        userApiKey: personalAiApiKey
                    })
                });
                
                const data = await res.json();
                
                if (data.status === 'success') {
                    document.getElementById('aiGoodTextarea').value = data.good || '';
                    document.getElementById('aiImproveTextarea').value = data.improve || '';
                    document.getElementById('aiReviseInput').value = '';
                    resultBlock.style.display = 'block';
                    statusEl.textContent = '✅ 요약이 생성되었습니다';
                    statusEl.className = 'ai-status success';
                    
                    // 새로운 요약을 생성했으니 대화 히스토리도 새로 시작
                    // (서버가 자기 응답 그대로를 model 턴으로 기억해야 다음 수정 요청에서 형식을 유지함)
                    const historyBlock = feedbackHistoryText ? `\n\n[과거 피드백 이력]\n${feedbackHistoryText}` : '';
                    const userPromptText = `[기간] ${periodLabel}\n\n[양식]\n${template}\n\n[일일 기록 원본]\n${logText}${historyBlock}`;
                    aiConversationHistory = [
                        { role: 'user', text: userPromptText },
                        { role: 'model', text: data.raw || JSON.stringify({ good: data.good, improve: data.improve }) }
                    ];
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || 'AI 요약 생성에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('AI 요약 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다. Apps Script 설정을 확인해주세요.';
                statusEl.className = 'ai-status error';
            } finally {
                btn.disabled = false;
                reviseBtn.disabled = false;
                loading.style.display = 'none';
            }
        }

        async function reviseAISummary() {
            const instructionInput = document.getElementById('aiReviseInput');
            const instruction = instructionInput.value.trim();
            const reviseBtn = document.getElementById('aiReviseBtn');
            const generateBtn = document.getElementById('aiGenerateBtn');
            const loading = document.getElementById('aiLoading');
            const statusEl = document.getElementById('aiStatus');

            if (!instruction) {
                statusEl.textContent = '수정 요청 내용을 입력해주세요';
                statusEl.className = 'ai-status error';
                return;
            }

            if (aiConversationHistory.length === 0) {
                statusEl.textContent = '먼저 요약을 생성해주세요';
                statusEl.className = 'ai-status error';
                return;
            }

            reviseBtn.disabled = true;
            generateBtn.disabled = true;
            loading.style.display = 'block';
            statusEl.textContent = '';
            statusEl.className = 'ai-status';
            
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'revise',
                        history: aiConversationHistory,
                        instruction: instruction,
                        userApiKey: personalAiApiKey
                    })
                });
                
                const data = await res.json();
                
                if (data.status === 'success') {
                    document.getElementById('aiGoodTextarea').value = data.good || '';
                    document.getElementById('aiImproveTextarea').value = data.improve || '';
                    statusEl.textContent = '✅ 수정 내용이 반영되었습니다';
                    statusEl.className = 'ai-status success';
                    
                    aiConversationHistory.push({ role: 'user', text: instruction });
                    aiConversationHistory.push({ role: 'model', text: data.raw || JSON.stringify({ good: data.good, improve: data.improve }) });
                    instructionInput.value = '';
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '수정 반영에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('AI 수정 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            } finally {
                reviseBtn.disabled = false;
                generateBtn.disabled = false;
                loading.style.display = 'none';
            }
        }

        function copyGoodResult() {
            const textarea = document.getElementById('aiGoodTextarea');
            textarea.select();
            document.execCommand('copy');
            const statusEl = document.getElementById('aiStatus');
            statusEl.textContent = '📋 잘한점(한일)이 복사되었습니다!';
            statusEl.className = 'ai-status success';
        }
        
        function copyImproveResult() {
            const textarea = document.getElementById('aiImproveTextarea');
            textarea.select();
            document.execCommand('copy');
            const statusEl = document.getElementById('aiStatus');
            statusEl.textContent = '📋 개선/보완할 점(할일)이 복사되었습니다!';
            statusEl.className = 'ai-status success';
        }

        // ===== 월별 피드백 및 평가 이력 관리 =====
        // 'YYYY-MM' 문자열을 "2026년 9월" 형태로 표시용 라벨로 바꿔줌
        function formatYearMonthLabel(yyyyMM) {
            if (!yyyyMM) return '';
            const [y, m] = yyyyMM.split('-').map(Number);
            if (!y || !m) return yyyyMM;
            return `${y}년 ${m}월`;
        }

        // 'YYYY-MM' 문자열에 delta(달)만큼 더하거나 뺀 'YYYY-MM'을 돌려줌
        function shiftYearMonth(yyyyMM, delta) {
            const [y, m] = yyyyMM.split('-').map(Number);
            const d = new Date(y, (m - 1) + delta, 1);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }

        function changeFeedbackHistoryMonth(delta) {
            switchFeedbackHistoryMonth(shiftYearMonth(currentFeedbackHistoryMonth, delta));
        }

        function jumpFeedbackHistoryMonthToToday() {
            switchFeedbackHistoryMonth(formatDate(new Date()).slice(0, 7));
        }

        function onFeedbackHistoryMonthInputChange() {
            const val = document.getElementById('feedbackHistoryMonthInput').value;
            if (val) switchFeedbackHistoryMonth(val);
        }

        // 지금 폼에 입력된 값이 저장된 기록과 다르면(=저장 안 한 수정이 있으면) true
        function isFeedbackHistoryFormDirty() {
            const record = monthlyFeedbacks[currentFeedbackHistoryMonth] || {};
            return document.getElementById('feedbackHistorySelfGradeSelect').value !== (record.selfGrade || '')
                || document.getElementById('feedbackHistoryReceivedGradeSelect').value !== (record.receivedGrade || '')
                || document.getElementById('feedbackHistorySelfGood').value !== (record.selfGood || '')
                || document.getElementById('feedbackHistorySelfImprove').value !== (record.selfImprove || '')
                || document.getElementById('feedbackHistoryReceivedGood').value !== (record.receivedGood || '')
                || document.getElementById('feedbackHistoryReceivedImprove').value !== (record.receivedImprove || '');
        }

        function switchFeedbackHistoryMonth(target) {
            if (!target || target === currentFeedbackHistoryMonth) return;
            const doSwitch = () => {
                currentFeedbackHistoryMonth = target;
                renderFeedbackHistoryForm();
                const statusEl = document.getElementById('feedbackHistoryStatus');
                if (statusEl) { statusEl.textContent = ''; statusEl.className = 'ai-status'; }
            };
            if (isFeedbackHistoryFormDirty()) {
                confirmModal(
                    '저장하지 않은 변경 내용이 있습니다. 저장 후 이동하시겠습니까?',
                    () => {
                        saveMonthlyFeedbackHistory();
                        doSwitch();
                    },
                    {
                        confirmLabel: '저장 후 이동',
                        extraLabel: '저장하지 않고 이동',
                        extraCallback: doSwitch
                    }
                );
            } else {
                doSwitch();
            }
        }

        function renderFeedbackHistoryForm() {
            const monthInput = document.getElementById('feedbackHistoryMonthInput');
            const monthLabel = document.getElementById('feedbackHistoryMonthLabel');
            if (!monthInput || !monthLabel) return; // 아직 이 탭 DOM이 안 그려졌으면 조용히 건너뜀

            monthInput.value = currentFeedbackHistoryMonth;
            monthLabel.textContent = formatYearMonthLabel(currentFeedbackHistoryMonth);

            const record = monthlyFeedbacks[currentFeedbackHistoryMonth] || {};
            document.getElementById('feedbackHistorySelfGradeSelect').value = record.selfGrade || '';
            document.getElementById('feedbackHistoryReceivedGradeSelect').value = record.receivedGrade || '';
            document.getElementById('feedbackHistorySelfGood').value = record.selfGood || '';
            document.getElementById('feedbackHistorySelfImprove').value = record.selfImprove || '';
            document.getElementById('feedbackHistoryReceivedGood').value = record.receivedGood || '';
            document.getElementById('feedbackHistoryReceivedImprove').value = record.receivedImprove || '';

            const indicator = document.getElementById('feedbackHistorySavedIndicator');
            if (indicator) {
                if (record.updatedAt) {
                    indicator.style.display = '';
                    indicator.textContent = '💾 저장됨 · ' + formatTeamReportSubmittedAt(record.updatedAt);
                } else {
                    indicator.style.display = 'none';
                }
            }
        }

        function saveMonthlyFeedbackHistory() {
            if (!checkEditPermission()) return;

            monthlyFeedbacks[currentFeedbackHistoryMonth] = {
                selfGrade: document.getElementById('feedbackHistorySelfGradeSelect').value,
                receivedGrade: document.getElementById('feedbackHistoryReceivedGradeSelect').value,
                selfGood: document.getElementById('feedbackHistorySelfGood').value.trim(),
                selfImprove: document.getElementById('feedbackHistorySelfImprove').value.trim(),
                receivedGood: document.getElementById('feedbackHistoryReceivedGood').value.trim(),
                receivedImprove: document.getElementById('feedbackHistoryReceivedImprove').value.trim(),
                updatedAt: new Date().toISOString()
            };

            safeSetItem('monthlyFeedbacks', JSON.stringify(monthlyFeedbacks));
            queueSync();
            renderFeedbackHistoryForm();

            const statusEl = document.getElementById('feedbackHistoryStatus');
            statusEl.textContent = `✅ ${formatYearMonthLabel(currentFeedbackHistoryMonth)} 기록이 저장되었습니다`;
            statusEl.className = 'ai-status success';
        }

        // 지금까지 저장된 월별 피드백 이력을 AI 월별 피드백 생성 프롬프트에 참고 컨텍스트로 넣기 좋은
        // 텍스트로 합침(오래된 달 → 최근 달 순). 내용이 하나도 없는 달은 건너뜀
        function buildFeedbackHistoryContextText() {
            const months = Object.keys(monthlyFeedbacks).sort();
            const parts = [];
            for (const ym of months) {
                const r = monthlyFeedbacks[ym];
                if (!r) continue;
                const lines = [];
                if (r.selfGrade) lines.push(`본인 평가등급: ${r.selfGrade}`);
                if (r.receivedGrade) lines.push(`상사 평가등급: ${r.receivedGrade}`);
                if (r.selfGood) lines.push(`자가 피드백 - 잘한점(한일): ${r.selfGood}`);
                if (r.selfImprove) lines.push(`자가 피드백 - 개선/보완할점(할일): ${r.selfImprove}`);
                if (r.receivedGood) lines.push(`수신 피드백(팀장/상사) - 잘한점(인정받은 부분): ${r.receivedGood}`);
                if (r.receivedImprove) lines.push(`수신 피드백(팀장/상사) - 개선/보완할점(방향성): ${r.receivedImprove}`);
                if (lines.length > 0) parts.push(`[${ym}]\n${lines.join('\n')}`);
            }
            return parts.join('\n\n');
        }

        // ===== 목표수립 (KPI/핵심역량/성장계획/핵심가치/기타) - 전체 내용 한 번에 입력, 체크한 항목만 생성/개별 수정 =====
        const GOAL_AREAS = [
            { id: 'kpi', label: 'KPI', hint: '성과달성을 위한 주요 본질 업무' },
            { id: 'competency', label: '핵심역량', hint: '본질업무를 효율적·효과적으로 수행하기 위한 활동' },
            { id: 'growth', label: '인재육성/성장계획', hint: '본인 성장계획 (아래 체크 시 후배사원 육성계획도 함께)' },
            { id: 'corevalue', label: '핵심가치', hint: '대웅 인사주요제도 내재화 계획' },
            { id: 'etc', label: '기타', hint: '수명업무/TF활동 등' }
        ];

        let goalConversationHistories = {}; // { kpi: [...], competency: [...], ... }
        let goalAreaOptions = {}; // 생성 시점의 영역별 추가 옵션 (예: growth 영역의 includeTalentDev), 수정요청 때도 동일하게 재사용

        function loadGoalGrowthIncludeTalentDev() {
            return localStorage.getItem('goalGrowthIncludeTalentDev') === 'true';
        }

        function saveGoalGrowthIncludeTalentDev(checked) {
            safeSetItem('goalGrowthIncludeTalentDev', checked ? 'true' : 'false');
        }

        // 항목 체크 상태는 기본적으로 전부 선택된 상태로 시작 (한 번 바꾸면 다음에도 그대로 기억)
        function loadGoalAreaChecked(areaId) {
            const saved = localStorage.getItem(`goalAreaChecked_${areaId}`);
            return saved === null ? true : saved === 'true';
        }

        function saveGoalAreaChecked(areaId, checked) {
            safeSetItem(`goalAreaChecked_${areaId}`, checked ? 'true' : 'false');
        }

        function renderGoalAreaCheckRow() {
            const row = document.getElementById('goalAreaCheckRow');
            if (!row) return;
            row.innerHTML = GOAL_AREAS.map(area => `
                <label class="goal-area-check-item">
                    <input type="checkbox" id="goalAreaCheck-${area.id}" ${loadGoalAreaChecked(area.id) ? 'checked' : ''} onchange="saveGoalAreaChecked('${area.id}', this.checked)">
                    ${area.label}
                </label>
            `).join('') + `
                <label class="goal-growth-scope-toggle">
                    <input type="checkbox" id="goalGrowthIncludeTalentDev" ${loadGoalGrowthIncludeTalentDev() ? 'checked' : ''} onchange="saveGoalGrowthIncludeTalentDev(this.checked)">
                    (인재육성/성장계획 체크 시) 후배/파트원 육성계획도 함께 작성 - 팀장/파트장 등 육성 책임이 있는 경우 체크
                </label>
            `;
        }

        function renderGoalAreas() {
            renderGoalAreaCheckRow();
            const container = document.getElementById('goalAreasContainer');
            container.innerHTML = GOAL_AREAS.map(area => `
                <div class="goal-area-block" data-area="${area.id}">
                    <div class="goal-area-header">
                        <span class="goal-area-title">${area.label}</span>
                        <span class="goal-area-hint">${area.hint}</span>
                    </div>
                    <div class="ai-loading" id="goalLoading-${area.id}" style="display:none;">🤖 작성 중...</div>

                    <div class="goal-result-block" id="goalResultBlock-${area.id}" style="display:none;">
                        <div class="ai-block-label-row">
                            <label class="ai-block-label">✅ 생성된 초안</label>
                            <button class="ai-copy-btn" onclick="copyGoalResult('${area.id}')">📋 복사</button>
                        </div>
                        <textarea class="goal-result-textarea" id="goalResult-${area.id}"></textarea>

                        <div class="goal-revise-row">
                            <input type="text" class="goal-revise-input" id="goalReviseInput-${area.id}" placeholder="이 항목만 수정 요청 (예: 좀 더 구체적으로)">
                            <button class="goal-revise-btn" id="goalReviseBtn-${area.id}" onclick="reviseGoalDraft('${area.id}')">🔄 수정 반영</button>
                        </div>
                    </div>

                    <div class="goal-status" id="goalStatus-${area.id}"></div>
                </div>
            `).join('');
        }

        function goalRefLogText() {
            const startStr = document.getElementById('goalRefStartDate').value;
            const endStr = document.getElementById('goalRefEndDate').value;
            if (!startStr || !endStr) return '';
            return buildLogTextForRange(startStr, endStr);
        }

        // 체크한 항목들을 한 번의 AI 호출로 함께 생성 - 전체 내용을 하나로 보내면 모델이 각 항목
        // 가이드에 맞게 알맞은 항목 하나에만 배치해서, 같은 내용이 여러 항목에 겹쳐 쓰이지 않게 함
        async function generateAllGoalDrafts() {
            const checkedAreas = GOAL_AREAS.filter(area => document.getElementById(`goalAreaCheck-${area.id}`)?.checked);
            const globalStatusEl = document.getElementById('goalGlobalStatus');
            const globalLoading = document.getElementById('goalGlobalLoading');
            const globalBtn = document.getElementById('goalGenerateAllBtn');

            if (checkedAreas.length === 0) {
                globalStatusEl.textContent = '작성할 항목을 하나 이상 선택해주세요';
                globalStatusEl.className = 'goal-status error';
                return;
            }

            const note = document.getElementById('goalGlobalNote').value.trim();
            let logText = goalRefLogText();

            // KPI가 체크되어 있으면 절감 과제 트래커에 기록해둔 실제 목표/실적 수치를 근거로 함께 활용
            if (checkedAreas.some(area => area.id === 'kpi')) {
                const projectsSummary = buildSavingsProjectsSummaryText();
                if (projectsSummary) {
                    logText += `\n\n[등록된 개선/절감 과제 현황]\n${projectsSummary}`;
                }
            }

            // growth 영역은 후배/파트원 육성계획 포함 여부에 따라 안내문이 달라짐 - 생성 시점 선택을 이후 수정요청에도 동일하게 재사용
            const includeTalentDev = document.getElementById('goalGrowthIncludeTalentDev')?.checked || false;
            goalAreaOptions.growth = { includeTalentDev };

            globalBtn.disabled = true;
            globalLoading.style.display = 'block';
            globalStatusEl.textContent = '';
            globalStatusEl.className = 'goal-status';

            checkedAreas.forEach(area => {
                document.getElementById(`goalLoading-${area.id}`).style.display = 'block';
                document.getElementById(`goalResultBlock-${area.id}`).style.display = 'none';
                const statusEl = document.getElementById(`goalStatus-${area.id}`);
                statusEl.textContent = '';
                statusEl.className = 'goal-status';
            });

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'goalDraftAll',
                        areas: checkedAreas.map(area => area.id),
                        note: note,
                        logText: logText,
                        includeTalentDev: includeTalentDev,
                        userApiKey: personalAiApiKey
                    })
                });

                const data = await res.json();

                if (data.status === 'success' && data.drafts) {
                    const userPromptText =
                        `[참고 자료 - 현 수준 평가용 과거 활동 기록 (그대로 요약하지 말 것)]\n${logText || '(제공된 활동 기록 없음)'}\n\n` +
                        `[본인이 적은 전체 방향성/메모 - 이 항목에 알맞은 부분만 반영됨]\n${note || '(작성한 메모 없음)'}`;

                    let missingCount = 0;
                    checkedAreas.forEach(area => {
                        const draftText = data.drafts[area.id];
                        const statusEl = document.getElementById(`goalStatus-${area.id}`);
                        if (draftText) {
                            document.getElementById(`goalResult-${area.id}`).value = draftText;
                            document.getElementById(`goalReviseInput-${area.id}`).value = '';
                            document.getElementById(`goalResultBlock-${area.id}`).style.display = 'block';
                            statusEl.textContent = '✅ 초안이 생성되었습니다';
                            statusEl.className = 'goal-status success';
                            goalConversationHistories[area.id] = [
                                { role: 'user', text: userPromptText },
                                { role: 'model', text: draftText }
                            ];
                        } else {
                            missingCount++;
                            statusEl.textContent = '⚠️ 이 항목의 생성 결과를 받지 못했습니다. 다시 시도해주세요.';
                            statusEl.className = 'goal-status error';
                        }
                    });

                    if (missingCount === 0) {
                        globalStatusEl.textContent = `✅ ${checkedAreas.length}개 항목 초안이 생성되었습니다`;
                        globalStatusEl.className = 'goal-status success';
                    } else {
                        globalStatusEl.textContent = `⚠️ ${checkedAreas.length - missingCount}개 성공, ${missingCount}개 실패했습니다 (아래 항목별 상태 확인)`;
                        globalStatusEl.className = 'goal-status error';
                    }
                } else {
                    const message = '⚠️ ' + (data.message || '초안 생성에 실패했습니다');
                    globalStatusEl.textContent = message;
                    globalStatusEl.className = 'goal-status error';
                    checkedAreas.forEach(area => {
                        const statusEl = document.getElementById(`goalStatus-${area.id}`);
                        statusEl.textContent = message;
                        statusEl.className = 'goal-status error';
                    });
                }
            } catch (err) {
                console.error('목표수립 초안 생성 오류:', err);
                const message = '⚠️ 서버 연결에 실패했습니다.';
                globalStatusEl.textContent = message;
                globalStatusEl.className = 'goal-status error';
                checkedAreas.forEach(area => {
                    const statusEl = document.getElementById(`goalStatus-${area.id}`);
                    statusEl.textContent = message;
                    statusEl.className = 'goal-status error';
                });
            } finally {
                globalBtn.disabled = false;
                globalLoading.style.display = 'none';
                checkedAreas.forEach(area => {
                    document.getElementById(`goalLoading-${area.id}`).style.display = 'none';
                });
            }
        }
        
        async function reviseGoalDraft(areaId) {
            const instructionInput = document.getElementById(`goalReviseInput-${areaId}`);
            const instruction = instructionInput.value.trim();
            const reviseBtn = document.getElementById(`goalReviseBtn-${areaId}`);
            const loading = document.getElementById(`goalLoading-${areaId}`);
            const statusEl = document.getElementById(`goalStatus-${areaId}`);
            
            if (!instruction) {
                statusEl.textContent = '수정 요청 내용을 입력해주세요';
                statusEl.className = 'goal-status error';
                return;
            }
            
            if (!goalConversationHistories[areaId] || goalConversationHistories[areaId].length === 0) {
                statusEl.textContent = '먼저 초안을 생성해주세요';
                statusEl.className = 'goal-status error';
                return;
            }
            
            reviseBtn.disabled = true;
            loading.style.display = 'block';
            statusEl.textContent = '';
            statusEl.className = 'goal-status';
            
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'goalRevise',
                        area: areaId,
                        history: goalConversationHistories[areaId],
                        instruction: instruction,
                        includeTalentDev: goalAreaOptions[areaId]?.includeTalentDev || false,
                        userApiKey: personalAiApiKey
                    })
                });
                
                const data = await res.json();
                
                if (data.status === 'success' && data.summary) {
                    document.getElementById(`goalResult-${areaId}`).value = data.summary;
                    statusEl.textContent = '✅ 수정 내용이 반영되었습니다';
                    statusEl.className = 'goal-status success';
                    
                    goalConversationHistories[areaId].push({ role: 'user', text: instruction });
                    goalConversationHistories[areaId].push({ role: 'model', text: data.summary });
                    instructionInput.value = '';
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '수정 반영에 실패했습니다');
                    statusEl.className = 'goal-status error';
                }
            } catch (err) {
                console.error('목표수립 수정 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'goal-status error';
            } finally {
                reviseBtn.disabled = false;
                loading.style.display = 'none';
            }
        }
        
        function copyGoalResult(areaId) {
            const textarea = document.getElementById(`goalResult-${areaId}`);
            textarea.select();
            document.execCommand('copy');
            
            const statusEl = document.getElementById(`goalStatus-${areaId}`);
            statusEl.textContent = '📋 복사되었습니다!';
            statusEl.className = 'goal-status success';
        }
        
