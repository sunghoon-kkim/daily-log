        function updateDateRange() {
            queryRecords();
        }

        // 기간별 카테고리 조회: 매번 시작일/종료일을 손으로 고르지 않아도 되도록 자주 쓰는
        // 기간을 버튼 하나로 바로 채워줌
        // "오늘/이번주/이번달/지난달/올해" 프리셋 공통 계산 로직. 기간별 카테고리 조회, AI 월별
        // 피드백처럼 시작일/종료일 두 칸을 직접 고르는 곳이면 어디서든 재사용함

        function applyPeriodQueryPreset(preset) {
            const range = computePresetDateRange(preset);
            if (!range) return;

            document.getElementById('startDate').value = formatDate(range.start);
            document.getElementById('endDate').value = formatDate(range.end);
            document.querySelectorAll('#periodQueryPresetRow .quick-preset-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.preset === preset);
            });
            queryRecords();
        }

        // 시작일/종료일을 직접 손으로 바꾸면 더 이상 프리셋과 일치하지 않으므로 선택 표시를 지움
        function clearPeriodQueryPresetSelection() {
            document.querySelectorAll('#periodQueryPresetRow .quick-preset-btn').forEach(btn => {
                btn.classList.remove('selected');
            });
        }

        // ===== 키워드 통합 검색 (활동기록 × 예정작업 × 할일/메모 × 정비계획 × 개선과제) =====
        let lastSearchResults = []; // 인라인 수정/이동/내보내기에서 인덱스로 참조하기 위해 마지막 검색 결과를 보관

        // 검색어 문법: 띄어쓰기로 나눈 단어는 모두 포함(AND), "A|B"는 둘 중 하나(OR),
        // "-단어"는 제외, "따옴표로 묶은 구절"은 띄어쓰기 포함 그대로 검색
        function parseSearchQuery(raw) {
            const include = []; // [[대안1, 대안2], ...] - 바깥은 AND, 안쪽은 OR
            const exclude = [];
            const re = /(-?)"([^"]+)"|(\S+)/g;
            let m;
            while ((m = re.exec(raw || ''))) {
                if (m[2] !== undefined) {
                    const phrase = m[2].trim().toLowerCase();
                    if (!phrase) continue;
                    if (m[1] === '-') exclude.push(phrase); else include.push([phrase]);
                    continue;
                }
                let token = m[3];
                if (token.length > 1 && token[0] === '-') {
                    exclude.push(token.slice(1).toLowerCase());
                    continue;
                }
                const alternatives = token.split('|').map(t => t.trim().toLowerCase()).filter(Boolean);
                if (alternatives.length) include.push(alternatives);
            }
            return { include, exclude, terms: include.flat() };
        }

        function matchesSearchQuery(text, query) {
            if (!text || query.include.length === 0) return false;
            const lower = String(text).toLowerCase();
            if (query.exclude.some(ex => lower.includes(ex))) return false;
            return query.include.every(group => group.some(alt => lower.includes(alt)));
        }

        // 메모장 내용은 HTML(서식/이미지 포함)이라 검색·표시용으로 순수 텍스트만 뽑아냄
        function htmlToPlainText(html) {
            if (!html) return '';
            const div = document.createElement('div');
            div.innerHTML = String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li)>/gi, '\n');
            return (div.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
        }

        // 긴 텍스트(메모장 등)는 검색어가 들어있는 줄만 최대 몇 줄 뽑아서 보여줌
        function extractMatchingLines(text, terms, maxLines) {
            const lines = String(text || '').split('\n').filter(line => {
                const lower = line.toLowerCase();
                return terms.some(t => lower.includes(t));
            });
            if (lines.length === 0) return String(text || '').slice(0, 200);
            const shown = lines.slice(0, maxLines || 5);
            return shown.join('\n') + (lines.length > shown.length ? `\n… 외 ${lines.length - shown.length}줄` : '');
        }

        // "최근 N개월" 같은 검색 기간 선택값을 시작일 문자열(yyyy-MM-dd)로 바꿈. 전체 기간이면 null
        function getSearchPeriodStart(periodValue) {
            const months = parseInt(periodValue, 10);
            if (!months) return null;
            const d = new Date();
            d.setMonth(d.getMonth() - months);
            return formatDate(d);
        }

        function isSearchScopeOn(id) {
            const el = document.getElementById(id);
            return !el || el.checked; // 체크박스가 없는(예전 화면) 경우엔 켜진 것으로 취급
        }

        // 카테고리 목록이 바뀔 때마다(추가/삭제/보관/이름변경) 통합 검색의 카테고리 선택지도 갱신
        // (키워드 발생 통계의 카테고리 선택지도 같은 목록을 씀)
        function refreshSearchCategoryOptions() {
            const all = getAllRecordCategories();
            ['searchCategorySelect', 'keywordStatsCategory'].forEach(id => {
                const select = document.getElementById(id);
                if (!select) return;
                const current = select.value;
                select.innerHTML = '<option value="">전체 카테고리</option>' + all.map(c =>
                    `<option value="${escapeHtml(c)}">${archivedCategories.includes(c) ? '📦 ' : ''}${escapeHtml(c)}</option>`
                ).join('');
                select.value = all.includes(current) ? current : '';
            });
        }

        function collectKeywordSearchResults(query) {
            const periodStart = getSearchPeriodStart((document.getElementById('searchPeriodSelect') || {}).value);
            const categoryFilter = (document.getElementById('searchCategorySelect') || {}).value || '';
            const inPeriod = (dateStr) => !periodStart || (dateStr && dateStr >= periodStart);
            const results = [];

            // 활동기록(카테고리별 내용) - 보관한 카테고리 포함
            if (isSearchScopeOn('searchScopeRecords')) {
                const searchCategories = categoryFilter ? [categoryFilter] : getAllRecordCategories();
                for (const dateStr in records) {
                    if (!inPeriod(dateStr)) continue;
                    const rec = records[dateStr] || {};
                    for (const category of searchCategories) {
                        const content = rec[category];
                        if (typeof content === 'string' && matchesSearchQuery(content, query)) {
                            results.push({ kind: 'record', date: dateStr, tag: category, content });
                        }
                    }
                }
            }

            // 카테고리를 특정해서 검색하는 경우엔 활동기록만 대상으로 함
            if (categoryFilter) return results;

            if (isSearchScopeOn('searchScopeEvents')) {
                for (const ev of events) {
                    if (ev.title && inPeriod(ev.start) && matchesSearchQuery(ev.title, query)) {
                        results.push({ kind: 'event', date: ev.start, tag: '예정작업', content: ev.title });
                    }
                }
            }

            // 아래는 날짜가 없는 자료라, 기간을 지정했을 때는 대상에서 제외함 (정비 완료 이력만 예외)
            if (isSearchScopeOn('searchScopeNotes') && !periodStart) {
                for (const t of todoItems) {
                    const text = [t.text, t.memo].filter(Boolean).join('\n');
                    if (matchesSearchQuery(text, query)) {
                        results.push({ kind: 'todo', date: '', tag: t.done ? '할일(완료)' : '할일', content: text });
                    }
                }
                if (typeof syncActiveFreeNotesPageData === 'function') syncActiveFreeNotesPageData();
                for (const page of freeNotesPages) {
                    const text = htmlToPlainText(page.content);
                    if (matchesSearchQuery(text, query)) {
                        results.push({ kind: 'memo', date: '', tag: '메모: ' + (page.name || '메모장'), content: extractMatchingLines(text, query.terms, 5), refId: page.id });
                    }
                }
            }

            if (isSearchScopeOn('searchScopeMaintenance')) {
                for (const m of maintenanceSchedule) {
                    const title = `${m.equipment || ''} - ${m.item || '점검'}`;
                    const completions = Array.isArray(m.completions) ? m.completions : [];
                    // 정비 완료 이력은 날짜가 있으므로 건별로 검색 (기간 필터 적용 가능)
                    completions.forEach(c => {
                        const text = `${title}\n${c.note || ''}`;
                        if (inPeriod(c.date) && matchesSearchQuery(text, query)) {
                            results.push({ kind: 'maintenance', date: c.date, tag: '정비완료', content: `${title}${c.note ? '\n' + c.note : ''}`, refId: m.id });
                        }
                    });
                    if (periodStart) continue;
                    const planText = [title, m.sop, m.cycle, m.note, m.lastDone ? '이전 완료: ' + m.lastDone : ''].filter(Boolean).join('\n');
                    if (matchesSearchQuery(planText, query)) {
                        results.push({ kind: 'maintenance', date: '', tag: '정비계획', content: planText, refId: m.id });
                    }
                }
            }

            if (isSearchScopeOn('searchScopeProjects') && !periodStart) {
                for (const p of savingsProjects) {
                    const logs = Array.isArray(p.monthlyLogs) ? p.monthlyLogs : [];
                    const text = [p.title, p.category, p.target, p.actual, ...logs.map(l => `${l.month || ''} ${l.note || ''}`)].filter(Boolean).join('\n');
                    if (matchesSearchQuery(text, query)) {
                        results.push({ kind: 'project', date: '', tag: '개선과제', content: extractMatchingLines(text, query.terms, 5), refId: p.id });
                    }
                }
            }

            return results;
        }

        function performKeywordSearch() {
            const input = document.getElementById('searchKeywordInput');
            const keyword = input.value.trim();
            const resultsEl = document.getElementById('searchResults');
            const countEl = document.getElementById('searchResultCount');
            if (countEl) countEl.textContent = '';

            if (!keyword) {
                resultsEl.innerHTML = '<div class="no-result">검색어를 입력해주세요</div>';
                lastSearchResults = [];
                return;
            }

            const query = parseSearchQuery(keyword);
            if (query.include.length === 0) {
                resultsEl.innerHTML = '<div class="no-result">포함할 검색어를 하나 이상 입력해주세요 (제외어만으로는 검색할 수 없습니다)</div>';
                lastSearchResults = [];
                return;
            }

            const results = collectKeywordSearchResults(query);
            // 최근 날짜부터, 날짜가 없는 자료(메모/할일/정비계획/과제)는 맨 뒤로
            results.sort((a, b) => {
                if (!a.date && !b.date) return 0;
                if (!a.date) return 1;
                if (!b.date) return -1;
                return b.date.localeCompare(a.date);
            });
            lastSearchResults = results; // 인라인 수정에서 참조하기 위해 결과를 보관

            if (results.length === 0) {
                resultsEl.innerHTML = `<div class="no-result">'${escapeHtml(keyword)}'에 대한 검색 결과가 없습니다</div>`;
                return;
            }
            if (countEl) countEl.textContent = `검색 결과 ${results.length}건`;

            resultsEl.innerHTML = results.map((r, idx) => {
                const dateLabel = r.date
                    ? new Date(r.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
                    : '날짜 없음';
                const snippet = highlightSearchTerms(escapeHtml(r.content), query.terms);

                // 활동기록만 인라인 수정을 제공 (나머지는 원래 화면으로 이동해서 수정)
                const editable = r.kind === 'record';
                const openLabel = r.kind === 'record' || r.kind === 'event' ? '📅 이 날짜 열기' : '↗ 열기';

                return `
                    <div class="result-item" data-result-idx="${idx}">
                        <div class="result-top">
                            <div class="result-date">📅 ${dateLabel} <span class="search-result-tag">[${escapeHtml(r.tag)}]</span></div>
                            <div class="result-actions">
                                ${editable ? `<button class="result-action-btn" onclick="startInlineEdit(${idx})">✏️ 수정</button>` : ''}
                                <button class="result-action-btn" onclick="openSearchResult(${idx})">${openLabel}</button>
                            </div>
                        </div>
                        <div class="result-content" id="resultContent-${idx}">${snippet}</div>
                    </div>
                `;
            }).join('');
        }

        // 검색 결과 카드 안에서 바로 내용을 고칠 수 있게 입력창으로 전환.
        // (달력 탭으로 이동하지 않고도 오타 수정 같은 가벼운 편집을 끝낼 수 있게 함)
        // 카테고리명에 따옴표 등이 들어가도 문제가 없도록, 값을 직접 넘기지 않고 인덱스로만 참조함
        function startInlineEdit(idx) {
            if (!checkEditPermission()) return;

            const r = lastSearchResults[idx];
            if (!r || r.kind !== 'record') return;

            const contentEl = document.getElementById(`resultContent-${idx}`);
            if (!contentEl || contentEl.dataset.editing === 'true') return;

            const currentText = (records[r.date] && records[r.date][r.tag]) || '';
            contentEl.dataset.editing = 'true';
            contentEl.innerHTML = `
                <textarea class="result-edit-textarea" id="resultEdit-${idx}"></textarea>
                <div class="result-edit-actions">
                    <button class="result-action-btn primary" onclick="saveInlineEdit(${idx})">저장</button>
                    <button class="result-action-btn" onclick="performKeywordSearch()">취소</button>
                </div>
            `;

            const ta = document.getElementById(`resultEdit-${idx}`);
            ta.value = currentText; // innerHTML로 넣으면 특수문자가 깨질 수 있어 value로 직접 대입
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
            ta.focus();
        }

        function saveInlineEdit(idx) {
            if (!checkEditPermission()) return;

            const r = lastSearchResults[idx];
            const ta = document.getElementById(`resultEdit-${idx}`);
            if (!r || !ta) return;

            // 달력에서 같은 날짜를 열어둔 상태라면, 그쪽 입력창 내용이 나중에 이 수정본을 덮어쓰지 않도록 먼저 확정
            if (selectedDate === r.date) captureCurrentFormToRecords();
            if (!records[r.date]) records[r.date] = {};
            const newValue = ta.value.trim();
            if (records[r.date][r.tag] !== newValue) {
                pushRecordRevision(r.date, r.tag, records[r.date][r.tag]);
                records[r.date][r.tag] = newValue;
                saveRecordsToStorage();
            }

            // 지금 달력에서 보고 있는 날짜를 고친 경우, 그쪽 화면도 같이 최신화
            if (selectedDate === r.date) renderRecordForm();
            renderCalendar();

            performKeywordSearch(); // 수정된 내용으로 검색 결과 다시 그리기
        }

        // 검색 결과 안에서 키워드 부분만 강조 표시 (내용은 이미 escapeHtml 처리된 상태로 전달됨)
        function highlightKeyword(escapedText, keyword) {
            return highlightSearchTerms(escapedText, [keyword]);
        }

        function highlightSearchTerms(escapedText, terms) {
            // escapedText는 이미 escapeHtml을 거친 상태라 검색어도 똑같이 escapeHtml을 거쳐야
            // 매칭됨 (안 그러면 검색어에 &/</> 같은 문자가 있을 때 강조 표시가 안 됨)
            const patterns = (terms || []).filter(Boolean)
                .map(t => escapeHtml(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                .sort((a, b) => b.length - a.length);
            if (patterns.length === 0) return escapedText;
            const re = new RegExp(patterns.join('|'), 'gi');
            return escapedText.replace(re, match => `<mark style="background:#fff3a3; padding:0 2px; border-radius:2px;">${match}</mark>`);
        }

        // 검색 결과 클릭 시 달력 탭의 해당 날짜로 이동
        function jumpToSearchResult(dateStr) {
            const d = new Date(dateStr);
            currentDate = new Date(d.getFullYear(), d.getMonth(), 1);
            switchTab('calendar');
            selectDate(dateStr);
        }

        // 결과 종류에 따라 원래 화면(달력/할일·메모/정비계획/개선과제)으로 이동
        function openSearchResult(idx) {
            const r = lastSearchResults[idx];
            if (!r) return;
            if (r.kind === 'record' || r.kind === 'event') { jumpToSearchResult(r.date); return; }
            if (r.kind === 'todo') { switchTab('notes'); return; }
            if (r.kind === 'memo') {
                switchTab('notes');
                if (r.refId && typeof switchFreeNotesPage === 'function') switchFreeNotesPage(r.refId);
                return;
            }
            if (r.kind === 'maintenance') {
                switchTab('maintenance');
                if (r.refId && maintenanceSchedule.some(m => m.id === r.refId)) openMaintenanceModal(r.refId);
                return;
            }
            if (r.kind === 'project') {
                switchTab('improvement');
                if (r.refId && savingsProjects.some(p => p.id === r.refId)) openProjectModal(r.refId);
            }
        }

        function downloadSearchResultsCsv() {
            if (lastSearchResults.length === 0) { showAppToast('먼저 검색을 실행해주세요'); return; }
            const rows = [['날짜', '구분', '내용']];
            for (const r of lastSearchResults) rows.push([r.date || '', r.tag, r.content]);
            const keyword = document.getElementById('searchKeywordInput').value.trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 30);
            downloadCsvFile(rows, `검색결과_${keyword}_${formatDate(new Date())}.csv`);
        }

        // CSV 내보내기에서 화면에 보이는 조회 결과와 똑같은 내용을 받아쓸 수 있도록 마지막 조회 결과를 보관
        let lastQueryResults = [];

        function queryRecords() {
            if (selectedCategoriesForQuery.size === 0) {
                document.getElementById('queryResults').innerHTML = '<div class="no-result">카테고리를 선택해주세요</div>';
                lastQueryResults = []; // 화면엔 결과가 없는데 CSV 내보내기가 예전 검색 결과를 그대로 받아쓰지 않도록 비움
                return;
            }

            queryStartDate = new Date(document.getElementById('startDate').value);
            queryEndDate = new Date(document.getElementById('endDate').value);
            const orderedCategories = getAllRecordCategories(); // 보관한 카테고리도 과거 기록 조회 대상

            // 날짜별로 선택된 카테고리들의 내용을 모음
            const results = [];
            for (const dateStr in records) {
                const date = new Date(dateStr);
                if (date >= queryStartDate && date <= queryEndDate) {
                    const categoryContents = [];
                    for (const category of orderedCategories) {
                        if (!selectedCategoriesForQuery.has(category)) continue;
                        const content = records[dateStr][category];
                        if (content) categoryContents.push({ category, content });
                    }
                    if (categoryContents.length > 0) {
                        results.push({ date: dateStr, categoryContents });
                    }
                }
            }

            results.sort((a, b) => new Date(b.date) - new Date(a.date));
            lastQueryResults = results;

            if (results.length === 0) {
                document.getElementById('queryResults').innerHTML = '<div class="no-result">해당 기간에 기록이 없습니다</div>';
                return;
            }

            const html = results.map(item => {
                const date = new Date(item.date);
                const dateLabel = date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

                const categoriesHtml = item.categoryContents.map(cc => `
                    <div class="result-category-block">
                        <div class="result-category-name">${escapeHtml(cc.category)}</div>
                        <div class="result-content">${escapeHtml(cc.content)}</div>
                    </div>
                `).join('');

                return `
                    <div class="result-item">
                        <div class="result-date">📅 ${dateLabel}</div>
                        ${categoriesHtml}
                    </div>
                `;
            }).join('');

            document.getElementById('queryResults').innerHTML = html;
        }

        function csvEscapeField(value) {
            const text = (value === null || value === undefined) ? '' : String(value);
            return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
        }

        function downloadCsvFile(rows, filename) {
            // 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 앞에 붙임
            const csvContent = '﻿' + rows.map(row => row.map(csvEscapeField).join(',')).join('\r\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        function getQueryPeriodLabel() {
            return `${document.getElementById('startDate').value}_${document.getElementById('endDate').value}`;
        }

        // "기간별 카테고리 조회" 결과를 CSV로 내려받음 - 화면에 지금 떠있는 조회 결과(lastQueryResults) 기준
        function downloadQueryResultsCsv() {
            if (lastQueryResults.length === 0) { showAppToast('먼저 카테고리를 선택해 조회해주세요'); return; }

            const rows = [['날짜', '카테고리', '내용']];
            for (const item of lastQueryResults) {
                for (const cc of item.categoryContents) {
                    rows.push([item.date, cc.category, cc.content]);
                }
            }
            downloadCsvFile(rows, `활동기록_${getQueryPeriodLabel()}.csv`);
        }

        // 조회 결과에 실제로 쓰인 카테고리만, 카테고리 관리 순서대로
        function getQueryResultCategories() {
            const used = new Set();
            lastQueryResults.forEach(item => item.categoryContents.forEach(cc => used.add(cc.category)));
            return getAllRecordCategories().filter(c => used.has(c));
        }

        // 날짜(행) × 카테고리(열) 표 형태 - 월간/분기 보고서나 감사 대응 자료로 바로 붙여넣기 좋게 날짜 오름차순
        function downloadQueryResultsPivotCsv() {
            if (lastQueryResults.length === 0) { showAppToast('먼저 카테고리를 선택해 조회해주세요'); return; }
            const cats = getQueryResultCategories();
            const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];
            const rows = [['날짜', '요일', ...cats]];
            const sorted = lastQueryResults.slice().sort((a, b) => a.date.localeCompare(b.date));
            for (const item of sorted) {
                const byCat = {};
                item.categoryContents.forEach(cc => { byCat[cc.category] = cc.content; });
                rows.push([item.date, weekdayNames[new Date(item.date).getDay()], ...cats.map(c => byCat[c] || '')]);
            }
            downloadCsvFile(rows, `활동기록_표_${getQueryPeriodLabel()}.csv`);
        }

        // 조회 결과를 인쇄용 표로 새 창에 띄움 (브라우저 인쇄 → PDF 저장도 가능)
        function printQueryReport() {
            if (lastQueryResults.length === 0) { showAppToast('먼저 카테고리를 선택해 조회해주세요'); return; }
            const win = window.open('', '_blank');
            if (!win) { showAppToast('팝업이 차단되어 인쇄 창을 열 수 없습니다. 팝업을 허용해주세요'); return; }

            const cats = getQueryResultCategories();
            const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];
            const sorted = lastQueryResults.slice().sort((a, b) => a.date.localeCompare(b.date));
            const bodyRows = sorted.map(item => {
                const byCat = {};
                item.categoryContents.forEach(cc => { byCat[cc.category] = cc.content; });
                return `<tr><td class="d">${item.date}<br>(${weekdayNames[new Date(item.date).getDay()]})</td>${cats.map(c => `<td>${escapeHtml(byCat[c] || '')}</td>`).join('')}</tr>`;
            }).join('');
            const start = document.getElementById('startDate').value;
            const end = document.getElementById('endDate').value;
            const owner = [currentUserDepartment, currentUserName].filter(Boolean).join(' ');

            win.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>활동기록 보고서 ${start} ~ ${end}</title>
<style>
body{font-family:'Malgun Gothic',sans-serif;margin:24px;color:#222}
h1{font-size:18px;margin:0 0 4px}
.meta{font-size:12px;color:#555;margin-bottom:12px}
table{border-collapse:collapse;width:100%;font-size:12px;table-layout:fixed}
th,td{border:1px solid #999;padding:6px;vertical-align:top;white-space:pre-wrap;word-break:break-word}
th{background:#eef0f7}
td.d{width:80px;white-space:nowrap;text-align:center}
tr{page-break-inside:avoid}
@media print{body{margin:10mm}}
</style></head><body>
<h1>활동기록 보고서</h1>
<div class="meta">기간: ${escapeHtml(start)} ~ ${escapeHtml(end)} · ${sorted.length}일 · 카테고리: ${escapeHtml(cats.join(', '))}${owner ? ' · 작성자: ' + escapeHtml(owner) : ''}</div>
<table><thead><tr><th style="width:80px">날짜</th>${cats.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${bodyRows}</tbody></table>
</body></html>`);
            win.document.close();
            win.focus();
            setTimeout(() => win.print(), 300);
        }
