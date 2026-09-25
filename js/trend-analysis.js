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
                    safeSetItem('trendSubject', trendSubject);
                    queueSync();
                }, 500);
            });
            
            specEl.addEventListener('input', () => {
                clearTimeout(t2);
                t2 = setTimeout(() => {
                    trendSpec = specEl.value;
                    safeSetItem('trendSpec', trendSpec);
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
        
        // ===== 계기판 사진 판독 =====
        // 사진은 판독 요청에만 쓰고 어디에도 저장하지 않음. 판독값은 사람이 확인·수정한 뒤에만 기록됨
        const GAUGE_MAX_PHOTOS = 10;
        const GAUGE_IMAGE_MAX_SIDE = 1600;
        const GAUGE_RECORD_MARK = '📷 계기판독';
        let gaugePhotos = []; // [{ mimeType, data(base64), previewUrl }]
        let gaugeReadings = []; // [{ label, value, unit, confidence, note, photo }]
        let gaugeSavedToRecord = false;

        function resizeGaugeImage(file) {
            return new Promise((resolve, reject) => {
                const url = URL.createObjectURL(file);
                const img = new Image();
                img.onload = () => {
                    const scale = Math.min(1, GAUGE_IMAGE_MAX_SIDE / Math.max(img.width, img.height));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.round(img.width * scale);
                    canvas.height = Math.round(img.height * scale);
                    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                    URL.revokeObjectURL(url);
                    // 10장을 한 번에 보내도 요청 크기(Gemini 20MB)에 여유가 있도록 화질을 약간 낮춤
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    resolve({ mimeType: 'image/jpeg', data: dataUrl.split(',')[1], previewUrl: dataUrl });
                };
                img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽지 못했습니다')); };
                img.src = url;
            });
        }

        async function handleGaugePhotoInput(input) {
            const files = Array.from(input.files || []);
            input.value = '';
            const room = GAUGE_MAX_PHOTOS - gaugePhotos.length;
            if (room <= 0) { showAppToast(`사진은 최대 ${GAUGE_MAX_PHOTOS}장까지 한 번에 판독할 수 있습니다`); return; }
            if (files.length > room) showAppToast(`사진은 최대 ${GAUGE_MAX_PHOTOS}장까지라 앞의 ${room}장만 추가했습니다`);
            for (const file of files.slice(0, room)) {
                try {
                    gaugePhotos.push(await resizeGaugeImage(file));
                } catch (err) {
                    showAppToast(err.message);
                }
            }
            renderGaugePhotos();
        }

        function removeGaugePhoto(idx) {
            gaugePhotos.splice(idx, 1);
            renderGaugePhotos();
        }

        function renderGaugePhotos() {
            const wrap = document.getElementById('gaugePhotoThumbs');
            wrap.innerHTML = gaugePhotos.map((p, i) => `
                <div class="gauge-thumb">
                    <img src="${p.previewUrl}" alt="사진 ${i + 1}">
                    <span class="gauge-thumb-num">${i + 1}</span>
                    <button type="button" class="gauge-thumb-remove" onclick="removeGaugePhoto(${i})" title="빼기">×</button>
                </div>`).join('');
            document.getElementById('gaugeReadBtn').disabled = gaugePhotos.length === 0 || !personalAiApiKey;
        }

        async function readGaugePhotos() {
            const statusEl = document.getElementById('gaugeStatus');
            const btn = document.getElementById('gaugeReadBtn');
            const loading = document.getElementById('gaugeLoading');
            statusEl.textContent = '';
            statusEl.className = 'ai-status';
            if (gaugePhotos.length === 0) {
                statusEl.textContent = '판독할 사진을 먼저 추가해주세요';
                statusEl.className = 'ai-status error';
                return;
            }

            const equipmentInput = document.getElementById('gaugeEquipmentInput');
            btn.disabled = true;
            loading.style.display = 'block';
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'gaugeRead',
                        images: gaugePhotos.map(p => ({ mimeType: p.mimeType, data: p.data })),
                        hint: equipmentInput.value.trim(),
                        userApiKey: personalAiApiKey
                    })
                });
                const data = await res.json();
                if (data.status !== 'success') {
                    statusEl.textContent = '⚠️ ' + (data.message || '판독에 실패했습니다');
                    statusEl.className = 'ai-status error';
                    return;
                }
                gaugeReadings = data.readings || [];
                gaugeSavedToRecord = false;
                if (!equipmentInput.value.trim() && data.equipment) equipmentInput.value = data.equipment;
                if (gaugeReadings.length === 0) {
                    statusEl.textContent = '사진에서 계기를 찾지 못했습니다. 계기 숫자가 잘 보이게 다시 찍어주세요.';
                    statusEl.className = 'ai-status error';
                    document.getElementById('gaugeResultBlock').style.display = 'none';
                    return;
                }
                refreshGaugeCategoryOptions();
                gaugeHistoryCache = null;
                renderGaugeReadings();
                document.getElementById('gaugeResultBlock').style.display = 'block';
                const unsure = gaugeReadings.filter(r => r.confidence !== 'high').length;
                statusEl.textContent = unsure
                    ? `✅ ${gaugeReadings.length}개 값을 읽었습니다. 노란색/빨간색 ${unsure}개는 사진과 꼭 대조해주세요.`
                    : `✅ ${gaugeReadings.length}개 값을 읽었습니다. 사진과 맞는지 확인 후 기록하세요.`;
                statusEl.className = 'ai-status success';
            } catch (err) {
                console.error('계기판 판독 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            } finally {
                btn.disabled = gaugePhotos.length === 0 || !personalAiApiKey;
                loading.style.display = 'none';
            }
        }

        const GAUGE_CONFIDENCE_LABELS = { high: '선명', medium: '확인 필요', low: '불확실' };

        // ----- 평소 대비 이상값 알림 -----
        // AI가 아니라 활동기록에 남긴 같은 설비·같은 항목의 과거 판독값과 숫자로 비교함(근거가 명확하고 지어낼 여지가 없음)
        const GAUGE_HISTORY_MAX = 20;
        const GAUGE_MIN_HISTORY = 3;
        let gaugeHistoryCache = null; // 한 번 그릴 때 계산해 두고, 값 입력 중에는 재사용

        // equipment가 있으면 그 설비 태그가 붙은 줄만, 없으면 판독 줄 전부
        function forEachGaugeRecordLine(equipment, callback) {
            const equipmentTag = equipment ? `[${equipment}]` : '';
            for (const dateStr of Object.keys(records).sort()) {
                const rec = records[dateStr] || {};
                for (const category of getAllRecordCategories()) {
                    const content = rec[category];
                    if (typeof content !== 'string' || !content.includes(GAUGE_RECORD_MARK)) continue;
                    content.split('\n').forEach(line => {
                        if (!line.includes(GAUGE_RECORD_MARK)) return;
                        if (equipmentTag && !line.includes(equipmentTag)) return;
                        const body = line.slice(line.indexOf(GAUGE_RECORD_MARK) + GAUGE_RECORD_MARK.length).replace(equipmentTag, '').trim();
                        if (body) callback(dateStr, body);
                    });
                }
            }
        }

        // "공급압력 4.2 kg/cm², 탱크 2 레벨 55 %" → 항목/숫자/단위. 라벨 안의 숫자는 라벨로 두고 마지막 숫자를 값으로 봄
        function parseGaugeRecordBody(body) {
            const out = [];
            body.split(', ').forEach(part => {
                const m = part.trim().match(/^(.*)\s+(-?\d[\d,]*(?:\.\d+)?)(?:\s+([^\d\s].*))?$/);
                if (!m) return;
                const value = parseFloat(m[2].replace(/,/g, ''));
                if (isFinite(value)) out.push({ label: m[1].trim(), value, unit: (m[3] || '').trim() });
            });
            return out;
        }

        const normalizeGaugeKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');

        function buildGaugeHistory(equipment, beforeDate) {
            const history = new Map();
            if (!equipment) return history;
            forEachGaugeRecordLine(equipment, (dateStr, body) => {
                if (beforeDate && dateStr >= beforeDate) return;
                parseGaugeRecordBody(body).forEach(p => {
                    const key = normalizeGaugeKey(p.label);
                    if (!history.has(key)) history.set(key, []);
                    history.get(key).push({ date: dateStr, value: p.value, unit: p.unit });
                });
            });
            return history;
        }

        function formatGaugeNumber(n) {
            return Number(n.toFixed(3)).toString();
        }

        function assessGaugeReading(r, history) {
            const v = parseFloat(String(r.value).replace(/,/g, ''));
            if (!isFinite(v) || !r.label) return { level: 'none', text: '' };
            const past = (history.get(normalizeGaugeKey(r.label)) || [])
                .filter(p => !r.unit || !p.unit || normalizeGaugeKey(p.unit) === normalizeGaugeKey(r.unit))
                .slice(-GAUGE_HISTORY_MAX);
            if (past.length < GAUGE_MIN_HISTORY) {
                return { level: 'none', text: past.length ? `과거 ${past.length}건뿐이라 비교 보류` : '과거 기록 없음' };
            }

            const vals = past.map(p => p.value);
            const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
            const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            const range = `평소 ${formatGaugeNumber(min)}~${formatGaugeNumber(max)} (평균 ${formatGaugeNumber(mean)}, ${vals.length}건)`;
            // 흔들림이 거의 없는 값도 조금만 벗어나면 매번 경고하지 않도록 평균의 5%는 최소 허용폭으로 둠
            const tolerance = Math.max(2 * std, Math.abs(mean) * 0.05);

            if (v > max && v - mean > tolerance) return { level: 'high', text: `⬆️ 평소보다 높음 · ${range}`, label: r.label };
            if (v < min && mean - v > tolerance) return { level: 'low', text: `⬇️ 평소보다 낮음 · ${range}`, label: r.label };
            const last3 = vals.slice(-3);
            if (last3[0] < last3[1] && last3[1] < last3[2] && last3[2] < v) return { level: 'trend', text: `📈 4회 연속 상승 · ${range}`, label: r.label };
            if (last3[0] > last3[1] && last3[1] > last3[2] && last3[2] > v) return { level: 'trend', text: `📉 4회 연속 하락 · ${range}`, label: r.label };
            return { level: 'ok', text: `✓ 평소 범위 · ${range}` };
        }

        function getGaugeHistory() {
            if (!gaugeHistoryCache) {
                const equipment = document.getElementById('gaugeEquipmentInput').value.trim();
                const date = document.getElementById('gaugeDateInput').value || formatDate(new Date());
                gaugeHistoryCache = buildGaugeHistory(equipment, date);
            }
            return gaugeHistoryCache;
        }

        function renderGaugeAnomalySummary(assessments) {
            const el = document.getElementById('gaugeAnomalySummary');
            const equipment = document.getElementById('gaugeEquipmentInput').value.trim();
            if (!equipment) {
                el.className = 'gauge-anomaly-summary info';
                el.textContent = '💡 설비명을 적으면 이 설비의 과거 판독값과 비교해 평소와 다른 값을 알려드립니다.';
                return;
            }
            const flagged = assessments.filter(a => a.level === 'high' || a.level === 'low' || a.level === 'trend');
            const compared = assessments.filter(a => a.level !== 'none').length;
            if (flagged.length) {
                el.className = 'gauge-anomaly-summary warn';
                el.textContent = `⚠️ 평소와 다른 값 ${flagged.length}개: ` + flagged.map(a => `${a.label} (${a.text.split(' · ')[0].replace(/^\S+\s/, '')})`).join(', ');
            } else if (compared) {
                el.className = 'gauge-anomaly-summary ok';
                el.textContent = `✓ 과거 기록과 비교한 ${compared}개 값 모두 평소 범위입니다.`;
            } else {
                el.className = 'gauge-anomaly-summary info';
                el.textContent = `💡 [${equipment}]의 과거 판독값이 ${GAUGE_MIN_HISTORY}건 이상 쌓이면 평소와 다른 값을 알려드립니다.`;
            }
        }

        function refreshGaugeComparisons() {
            const history = getGaugeHistory();
            const assessments = gaugeReadings.map(r => assessGaugeReading(r, history));
            assessments.forEach((a, i) => {
                const cell = document.getElementById('gaugeCmp' + i);
                if (!cell) return;
                cell.className = `gauge-cmp cmp-${a.level}`;
                cell.textContent = a.text;
            });
            renderGaugeAnomalySummary(assessments);
        }

        // 설비명·날짜를 바꾸면 비교 대상 과거 기록이 달라짐
        function onGaugeContextChange() {
            gaugeHistoryCache = null;
            if (gaugeReadings.length) refreshGaugeComparisons();
        }

        function renderGaugeReadings() {
            const body = document.getElementById('gaugeReadingsBody');
            body.innerHTML = gaugeReadings.map((r, i) => `
                <tr class="gauge-row conf-${r.confidence}">
                    <td><input type="text" value="${escapeHtml(r.label)}" oninput="updateGaugeReading(${i}, 'label', this.value)" placeholder="항목"></td>
                    <td><input type="text" value="${escapeHtml(r.value)}" oninput="updateGaugeReading(${i}, 'value', this.value)" placeholder="값" inputmode="decimal"></td>
                    <td><input type="text" value="${escapeHtml(r.unit)}" oninput="updateGaugeReading(${i}, 'unit', this.value)" placeholder="단위"></td>
                    <td class="gauge-conf" title="${escapeHtml(r.note || '')}">${r.photo ? '사진' + r.photo + ' · ' : ''}${GAUGE_CONFIDENCE_LABELS[r.confidence] || ''}${r.note ? ' ⓘ' : ''}</td>
                    <td class="gauge-cmp" id="gaugeCmp${i}"></td>
                    <td><button type="button" class="gauge-row-remove" onclick="removeGaugeReading(${i})" title="이 줄 빼기">×</button></td>
                </tr>`).join('');
            refreshGaugeComparisons();
        }

        function updateGaugeReading(idx, field, value) {
            const r = gaugeReadings[idx];
            if (!r) return;
            r[field] = value;
            // 사람이 값을 직접 확인·수정했으면 더 이상 "불확실"로 경고하지 않음
            if (field === 'value' && r.confidence !== 'high') {
                r.confidence = 'high';
                r.note = '직접 확인함';
                renderGaugeReadings();
                const input = document.querySelectorAll('#gaugeReadingsBody tr')[idx].querySelectorAll('input')[1];
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            } else {
                refreshGaugeComparisons();
            }
            gaugeSavedToRecord = false;
        }

        function removeGaugeReading(idx) {
            gaugeReadings.splice(idx, 1);
            gaugeSavedToRecord = false;
            renderGaugeReadings();
        }

        function addGaugeReadingRow() {
            gaugeReadings.push({ label: '', value: '', unit: '', confidence: 'high', note: '직접 입력' });
            renderGaugeReadings();
            const rows = document.querySelectorAll('#gaugeReadingsBody tr');
            rows[rows.length - 1].querySelector('input').focus();
        }

        function getFilledGaugeReadings() {
            return gaugeReadings.filter(r => String(r.value).trim() !== '');
        }

        function formatGaugeReadingsText(readings) {
            return readings.map(r => `${r.label || '값'} ${String(r.value).trim()}${r.unit ? ' ' + r.unit : ''}`).join(', ');
        }

        function refreshGaugeCategoryOptions() {
            const select = document.getElementById('gaugeCategorySelect');
            if (!select) return;
            const saved = localStorage.getItem('gaugeRecordCategory') || '';
            const current = select.value || saved;
            select.innerHTML = categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
            if (categories.includes(current)) select.value = current;
            const dateInput = document.getElementById('gaugeDateInput');
            if (dateInput && !dateInput.value) dateInput.value = formatDate(new Date());
        }

        function saveGaugeToRecord() {
            if (!checkEditPermission()) return;
            const readings = getFilledGaugeReadings();
            const date = document.getElementById('gaugeDateInput').value;
            const category = document.getElementById('gaugeCategorySelect').value;
            if (readings.length === 0) { showAppToast('기록할 값이 없습니다'); return; }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { showAppToast('날짜를 선택해주세요'); return; }
            if (!category) { showAppToast('기록할 카테고리를 선택해주세요'); return; }

            const doSave = () => {
                const equipment = document.getElementById('gaugeEquipmentInput').value.trim();
                appendLineToRecord(date, category, `${GAUGE_RECORD_MARK}${equipment ? ` [${equipment}]` : ''} ${formatGaugeReadingsText(readings)}`);
                safeSetItem('gaugeRecordCategory', category);
                gaugeSavedToRecord = true;
                renderCalendar();
                if (selectedDate === date) renderRecordForm();
                showAppToast(`${date} 활동기록 [${category}]에 기록했습니다`, 'success');
            };

            const unsure = readings.filter(r => r.confidence !== 'high').length;
            if (unsure > 0) {
                confirmModal(`확인이 필요한 값이 ${unsure}개 있습니다. 사진과 대조해 맞는 값인지 확인하셨나요?`, doSave, { confirmLabel: '확인했고 기록' });
            } else {
                doSave();
            }
        }

        // 지금까지 활동기록에 남긴 같은 설비의 판독값을 날짜순으로 모아 경향 분석 입력칸에 채움
        function sendGaugeToTrend() {
            const equipment = document.getElementById('gaugeEquipmentInput').value.trim();
            const lines = [];
            forEachGaugeRecordLine(equipment, (dateStr, body) => lines.push(`${dateStr}  ${body}`));
            const readings = getFilledGaugeReadings();
            if (!gaugeSavedToRecord && readings.length) {
                lines.push(`${document.getElementById('gaugeDateInput').value || formatDate(new Date())}  ${formatGaugeReadingsText(readings)}`);
            }
            if (lines.length === 0) { showAppToast('보낼 판독값이 없습니다'); return; }

            const dataEl = document.getElementById('trendDataInput');
            const doSend = () => {
                dataEl.value = lines.join('\n');
                const subjectEl = document.getElementById('trendSubjectInput');
                if (equipment && !subjectEl.value.trim()) {
                    subjectEl.value = equipment;
                    subjectEl.dispatchEvent(new Event('input'));
                }
                dataEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                showAppToast(`판독값 ${lines.length}건을 경향 분석 입력칸에 채웠습니다`, 'success');
            };
            if (dataEl.value.trim()) {
                confirmModal('경향 분석 입력칸에 이미 붙여넣은 데이터가 있습니다. 판독값으로 바꿀까요?', doSend, { confirmLabel: '바꾸기' });
            } else {
                doSend();
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
        
