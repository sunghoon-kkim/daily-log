        // ===== 활동기록 입력 보조 도구: 미결 사항 추적 / 상용구·요일 템플릿 / 수정 이력 되돌리기 =====
        // 활동기록 폼(renderRecordForm)의 카테고리 머리글 버튼(buildRecordToolButtons)과
        // 요일 템플릿 안내 배너(buildWeekdayTemplateBanner)를 여기서 만들어 끼워 넣음

        function parseLocalDate(dateStr) {
            const [y, m, d] = String(dateStr).split('-').map(Number);
            return new Date(y, (m || 1) - 1, d || 1);
        }

        const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

        // 카테고리 머리글에는 자주 쓰는 ☐(미결 표시)만 두고, 나머지 도구(상용구/수정 이력/숨기기)는
        // "⋯" 메뉴로 묶어서 휴대폰 화면에서도 머리글이 한 줄에 들어가게 함
        function buildRecordToolButtons(dateStr, category, categoryArg) {
            let html = '';
            if (!isFeatureDisabled('openIssues')) {
                html += `<button class="category-prev-btn record-tool-btn" draggable="false" onclick="toggleOpenIssueMarker('${categoryArg}')" title="커서가 있는 줄을 미결 사항(☐)으로 표시/해제 - 해결 전까지 달력 위 '미결 사항'에서 계속 추적됩니다">☐</button>`;
            }
            const revisions = recordRevisions[dateStr + '|' + category];
            const hasRevisions = !isFeatureDisabled('recordRevisions') && Array.isArray(revisions) && revisions.length > 0;
            html += `<button class="category-collapse-btn category-menu-btn${hasRevisions ? ' has-badge' : ''}" draggable="false" onclick="openCategoryToolMenu(event, '${categoryArg}')" title="더보기 (상용구·수정 이력·숨기기)" aria-label="더보기" aria-haspopup="menu">⋯</button>`;
            return html;
        }

        function closeCategoryToolMenu() {
            const menu = document.getElementById('categoryToolMenu');
            if (menu) menu.remove();
        }

        function openCategoryToolMenu(e, category) {
            e.stopPropagation();
            const alreadyOpenFor = document.getElementById('categoryToolMenu');
            if (alreadyOpenFor && alreadyOpenFor.dataset.category === category) { closeCategoryToolMenu(); return; }
            closeCategoryToolMenu();

            const items = [];
            if (!isFeatureDisabled('recordSnippets')) {
                items.push({ label: '📌 상용구 · 요일 템플릿', action: () => openRecordSnippetModal(category) });
            }
            const revisions = recordRevisions[selectedDate + '|' + category];
            if (!isFeatureDisabled('recordRevisions') && Array.isArray(revisions) && revisions.length > 0) {
                items.push({ label: `🕘 수정 이력 (${revisions.length})`, action: () => openRecordRevisionModal(category) });
            }
            items.push({ label: '🙈 이 날짜에서 숨기기', action: () => hideCategoryForDate(category) });

            const menu = document.createElement('div');
            menu.id = 'categoryToolMenu';
            menu.className = 'category-tool-menu';
            menu.dataset.category = category;
            menu.setAttribute('role', 'menu');
            items.forEach(item => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'category-tool-menu-item';
                btn.setAttribute('role', 'menuitem');
                btn.textContent = item.label;
                btn.addEventListener('click', (ev) => { ev.stopPropagation(); closeCategoryToolMenu(); item.action(); });
                menu.appendChild(btn);
            });
            document.body.appendChild(menu);

            // 버튼 바로 아래에, 화면 밖으로 나가지 않게 위치를 맞춤
            const rect = e.currentTarget.getBoundingClientRect();
            const menuWidth = menu.offsetWidth || 200;
            const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
            menu.style.left = left + 'px';
            menu.style.top = (rect.bottom + 4) + 'px';
        }

        // 메뉴 바깥을 누르거나, 화면을 스크롤하거나, ESC를 누르면 메뉴를 닫음
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#categoryToolMenu')) closeCategoryToolMenu();
        });
        window.addEventListener('scroll', closeCategoryToolMenu, true);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCategoryToolMenu(); });

        // ===== 오늘 요약 카드 =====
        // 아침에 앱을 열면 오늘 챙길 것(오늘 기록/직전 근무일 누락/오늘 일정/급한 정비/오래된 미결)을 한 줄로 보여줌.
        // 이미 있는 데이터를 모아 보여주기만 하고 새로 저장하는 것은 없음
        function findPreviousWorkday(todayStr) {
            const d = parseLocalDate(todayStr);
            for (let i = 0; i < 14; i++) {
                d.setDate(d.getDate() - 1);
                const ds = formatDate(d);
                if (!isNonWorkingDay(ds, d)) return ds;
            }
            return null;
        }

        function formatShortDateWithDay(dateStr) {
            const d = parseLocalDate(dateStr);
            return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_NAMES[d.getDay()]})`;
        }

        function jumpToDateRecord(dateStr) {
            const d = parseLocalDate(dateStr);
            currentDate = new Date(d.getFullYear(), d.getMonth(), 1);
            switchTab('calendar');
            selectDate(dateStr);
            const recordBox = document.querySelector('#calendar .record-box');
            if (recordBox) recordBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function focusOpenIssuesWidget() {
            if (isOpenIssuesWidgetCollapsed()) toggleOpenIssuesWidget();
            const el = document.getElementById('openIssuesWidget');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function renderTodaySummary() {
            const el = document.getElementById('todaySummary');
            if (!el) return;
            if (isFeatureDisabled('todaySummary') || !editUnlocked) { el.innerHTML = ''; return; }

            const todayStr = formatDate(new Date());
            const chips = [];
            const chip = (tone, icon, text, onclick) => chips.push(
                `<button type="button" class="today-chip tone-${tone}" onclick="${onclick}"><span class="today-chip-icon" aria-hidden="true">${icon}</span>${text}</button>`
            );

            // 오늘 기록
            const todayWritten = hasAnyRecordContent(todayStr);
            chip(todayWritten ? 'ok' : 'neutral', todayWritten ? '✅' : '✍️', todayWritten ? '오늘 기록 작성함' : '오늘 기록 쓰기', `jumpToDateRecord('${todayStr}')`);

            // 직전 근무일 누락
            if (!isFeatureDisabled('missingRecordIndicator')) {
                const prev = findPreviousWorkday(todayStr);
                const first = getFirstRecordDate();
                if (prev && first && prev >= first && !hasAnyRecordContent(prev)) {
                    chip('alert', '⚠️', `${formatShortDateWithDay(prev)} 기록 누락`, `jumpToDateRecord('${prev}')`);
                }
            }

            // 오늘 일정
            const todayEvents = events.filter(ev => todayStr >= ev.start && todayStr <= ev.end);
            if (todayEvents.length > 0) {
                const names = todayEvents.slice(0, 2).map(ev => escapeHtml(ev.title)).join(', ');
                chip('info', '📅', `오늘 일정 ${todayEvents.length}건: ${names}${todayEvents.length > 2 ? ' 외' : ''}`, `jumpToDateRecord('${todayStr}')`);
            }

            // 급한 정비 (정비계획 탭을 쓰는 경우만)
            if (!disabledTabIds.includes('maintenance') && !isFeatureDisabled('maintenanceSchedule') && typeof getMaintenanceUrgency === 'function') {
                let overdue = 0, thisMonth = 0;
                maintenanceSchedule.forEach(m => {
                    if (m.status === '보류') return; // 보류 항목은 급한 일로 보지 않음
                    const u = getMaintenanceUrgency(m);
                    if (u.level === 'overdue') overdue++;
                    else if (u.level === 'urgent' && u.monthsUntil === 0) thisMonth++;
                });
                if (overdue + thisMonth > 0) {
                    const parts = [];
                    if (overdue) parts.push(`지연 ${overdue}`);
                    if (thisMonth) parts.push(`이번 달 ${thisMonth}`);
                    chip(overdue ? 'alert' : 'warn', '🔧', `정비 ${parts.join(' · ')}건`, `switchTab('maintenance')`);
                }
            }

            // 미결 사항
            if (!isFeatureDisabled('openIssues')) {
                const issues = collectOpenIssues();
                if (issues.length > 0) {
                    const today = parseLocalDate(todayStr);
                    const aged = issues.filter(i => (today - parseLocalDate(i.date)) / 86400000 >= 14).length;
                    chip(aged ? 'warn' : 'neutral', '📋', `미결 ${issues.length}건${aged ? ` (2주 이상 ${aged})` : ''}`, 'focusOpenIssuesWidget()');
                }
            }

            const d = parseLocalDate(todayStr);
            el.innerHTML = `<div class="today-summary-title">🌅 오늘 · ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_NAMES[d.getDay()]})</div>
                <div class="today-summary-chips">${chips.join('')}</div>`;
        }

        // ===== 미결 사항 추적 =====
        // 기록 줄 앞에 "☐"(또는 "[ ]")를 붙이면 미결, "☑"(또는 "[x]")면 해결로 봄.
        // 별도 저장소 없이 기록 본문 자체가 상태를 가지므로, 검색/내보내기/서버 시트에도 그대로 남음
        const OPEN_ISSUE_LINE = /^(\s*(?:\d+\.\s*)?)(☐|\[ \])\s?(.*)$/;
        const RESOLVED_ISSUE_LINE = /^(\s*(?:\d+\.\s*)?)(☑|\[[xXvV]\])\s?(.*)$/;
        let lastOpenIssues = [];

        function collectOpenIssues() {
            const issues = [];
            const allCategories = getAllRecordCategories();
            for (const dateStr in records) {
                const rec = records[dateStr] || {};
                for (const category of allCategories) {
                    const content = rec[category];
                    if (typeof content !== 'string' || (content.indexOf('☐') === -1 && content.indexOf('[ ]') === -1)) continue;
                    content.split('\n').forEach((line, lineIndex) => {
                        const m = line.match(OPEN_ISSUE_LINE);
                        if (m && m[3].trim()) issues.push({ date: dateStr, category, lineIndex, line, text: m[3].trim() });
                    });
                }
            }
            issues.sort((a, b) => a.date.localeCompare(b.date)); // 오래 묵은 것부터
            return issues;
        }

        function isOpenIssuesWidgetCollapsed() {
            try { return localStorage.getItem('openIssuesCollapsed') === 'true'; } catch (e) { return false; }
        }

        function toggleOpenIssuesWidget() {
            safeSetItem('openIssuesCollapsed', isOpenIssuesWidgetCollapsed() ? 'false' : 'true');
            renderOpenIssuesWidget();
        }

        function renderOpenIssuesWidget() {
            const el = document.getElementById('openIssuesWidget');
            if (!el) return;
            if (isFeatureDisabled('openIssues')) { el.innerHTML = ''; return; }

            const issues = collectOpenIssues();
            lastOpenIssues = issues;
            const collapsed = isOpenIssuesWidgetCollapsed();
            const today = parseLocalDate(formatDate(new Date()));

            let html = `<div class="open-issues-header">
                <span class="open-issues-title">📋 미결 사항 <b>${issues.length}</b>건</span>
                <button class="upcoming-toggle-btn" onclick="toggleOpenIssuesWidget()">${collapsed ? '펼치기' : '접기'}</button>
            </div>`;

            if (!collapsed) {
                if (issues.length === 0) {
                    html += '<div class="open-issues-empty">미결 사항이 없습니다. 활동기록에서 줄 앞에 ☐를 붙이면(카테고리 머리글의 ☐ 버튼) 해결할 때까지 여기에서 계속 추적됩니다.</div>';
                } else {
                    html += '<div class="open-issues-list">' + issues.map((issue, idx) => {
                        const age = Math.round((today - parseLocalDate(issue.date)) / 86400000);
                        const ageLabel = age > 0 ? `${age}일 경과` : (age === 0 ? '오늘' : `D-${-age}`);
                        const ageClass = age >= 14 ? ' aged' : '';
                        return `<div class="open-issue-item">
                            <div class="open-issue-text">☐ ${escapeHtml(issue.text)}</div>
                            <div class="open-issue-meta">
                                <span class="search-result-tag">[${escapeHtml(issue.category)}]</span>
                                <span>${issue.date}</span>
                                <span class="open-issue-age${ageClass}">${ageLabel}</span>
                                <button class="result-action-btn" onclick="jumpToSearchResult('${issue.date}')">📅 열기</button>
                                <button class="result-action-btn primary" onclick="resolveOpenIssue(${idx})">✅ 해결</button>
                            </div>
                        </div>`;
                    }).join('') + '</div>';
                }
            }
            el.innerHTML = html;
        }

        function resolveOpenIssue(idx) {
            if (!checkEditPermission()) return;
            const issue = lastOpenIssues[idx];
            if (!issue) return;
            if (selectedDate) captureCurrentFormToRecords(); // 입력 중이던 내용 먼저 확정

            const content = (records[issue.date] && records[issue.date][issue.category]) || '';
            const lines = content.split('\n');
            // 캡처 과정에서 줄 위치가 바뀌었을 수 있으므로, 원래 위치가 안 맞으면 같은 줄을 다시 찾음
            let lineIndex = lines[issue.lineIndex] === issue.line ? issue.lineIndex : lines.indexOf(issue.line);
            if (lineIndex === -1) { showAppToast('해당 줄이 변경되어 찾을 수 없습니다. 다시 확인해주세요'); renderOpenIssuesWidget(); return; }

            const m = lines[lineIndex].match(OPEN_ISSUE_LINE);
            if (!m) return;
            lines[lineIndex] = `${m[1]}☑ ${m[3].trim()} (해결: ${formatDate(new Date())})`;
            pushRecordRevision(issue.date, issue.category, content, true);
            records[issue.date][issue.category] = lines.join('\n');
            saveRecordsToStorage();

            if (selectedDate === issue.date) renderRecordForm();
            renderCalendar();
            showAppToast('해결 처리했습니다', 'success');
        }

        // 카테고리 입력창에서 커서가 있는 줄의 앞에 ☐를 붙이거나(미결 표시) 떼어냄
        function toggleOpenIssueMarker(category) {
            if (!checkEditPermission()) return;
            const textarea = document.getElementById(`category-${category}`);
            if (!textarea) return;
            const value = textarea.value;
            const cursor = textarea.selectionStart || 0;
            const lineStart = value.lastIndexOf('\n', cursor - 1) + 1;
            let lineEnd = value.indexOf('\n', cursor);
            if (lineEnd === -1) lineEnd = value.length;
            const line = value.substring(lineStart, lineEnd);

            let newLine;
            const openMatch = line.match(OPEN_ISSUE_LINE);
            const resolvedMatch = line.match(RESOLVED_ISSUE_LINE);
            if (openMatch) newLine = openMatch[1] + openMatch[3];
            else if (resolvedMatch) newLine = resolvedMatch[1] + resolvedMatch[3];
            else {
                const prefix = (line.match(/^\s*(?:\d+\.\s*)?/) || [''])[0];
                newLine = prefix + '☐ ' + line.substring(prefix.length);
            }

            textarea.value = value.substring(0, lineStart) + newLine + value.substring(lineEnd);
            const newCursor = lineStart + newLine.length;
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = newCursor;
            textarea.dispatchEvent(new Event('input', { bubbles: true })); // 자동 저장 + 박스 높이 조절
            // 자동 저장(0.8초 지연) 뒤에 미결 목록도 새로 반영
            setTimeout(renderOpenIssuesWidget, 1000);
        }

        // ===== 상용구 & 요일 템플릿 =====
        const RECORD_SNIPPET_MAX_PER_CATEGORY = 30;
        const RECORD_SNIPPET_MAX_LENGTH = 300;
        // 상용구·요일 템플릿은 서버 프로필 셀(5만자 제한)에 함께 저장되므로 합계 크기에 상한을 둠
        const RECORD_SNIPPET_TOTAL_MAX_CHARS = 15000;

        function isSnippetStorageWithinLimit() {
            return JSON.stringify(recordSnippets).length + JSON.stringify(weekdayTemplates).length <= RECORD_SNIPPET_TOTAL_MAX_CHARS;
        }
        let snippetTargetCategory = null;
        let snippetTargetCursor = null; // 모달을 열기 직전 입력창의 커서 위치 (모달로 포커스가 옮겨가도 그 자리에 넣기 위함)

        function openRecordSnippetModal(category) {
            if (!checkEditPermission()) return;
            if (!selectedDate) return;
            snippetTargetCategory = category;
            const textarea = document.getElementById(`category-${category}`);
            snippetTargetCursor = textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : null;
            document.getElementById('recordSnippetModalTitle').textContent = `📌 상용구 · ${category}`;
            document.getElementById('recordSnippetInput').value = '';
            renderRecordSnippetModal();
            document.getElementById('recordSnippetModal').classList.add('active');
            applyFormLockState();
        }

        function closeRecordSnippetModal() {
            document.getElementById('recordSnippetModal').classList.remove('active');
            snippetTargetCategory = null;
            snippetTargetCursor = null;
        }

        function renderRecordSnippetModal() {
            const category = snippetTargetCategory;
            const listEl = document.getElementById('recordSnippetList');
            const snippets = Array.isArray(recordSnippets[category]) ? recordSnippets[category] : [];
            listEl.innerHTML = snippets.length === 0
                ? '<div class="maint-completion-empty">등록된 상용구가 없습니다. 아래에서 자주 쓰는 문구를 추가해보세요.</div>'
                : snippets.map((text, i) => `
                    <div class="record-snippet-item">
                        <button type="button" class="record-snippet-insert" onclick="insertRecordSnippet(${i})" title="클릭하면 입력창의 커서 위치에 넣습니다">${escapeHtml(text)}</button>
                        <button type="button" class="category-tag-delete" onclick="deleteRecordSnippet(${i})" aria-label="상용구 삭제">✕</button>
                    </div>`).join('');

            const dow = String(parseLocalDate(selectedDate).getDay());
            const template = weekdayTemplates[dow] && weekdayTemplates[dow][category];
            document.getElementById('weekdayTemplateLabel').textContent = `🗓️ ${WEEKDAY_NAMES[dow]}요일 템플릿`;
            document.getElementById('weekdayTemplateInfo').textContent = template
                ? `저장된 템플릿: ${template.length > 80 ? template.slice(0, 80) + '…' : template}`
                : `${WEEKDAY_NAMES[dow]}요일마다 반복하는 내용(예: 주간점검 항목)을 템플릿으로 저장해두면, 빈 날짜를 열 때 한 번에 채울 수 있습니다.`;
            document.getElementById('applyWeekdayTemplateBtn').style.display = template ? '' : 'none';
            document.getElementById('deleteWeekdayTemplateBtn').style.display = template ? '' : 'none';
        }

        function addRecordSnippet() {
            if (!checkEditPermission()) return;
            const input = document.getElementById('recordSnippetInput');
            const text = input.value.trim().slice(0, RECORD_SNIPPET_MAX_LENGTH);
            if (!text || !snippetTargetCategory) return;
            const list = Array.isArray(recordSnippets[snippetTargetCategory]) ? recordSnippets[snippetTargetCategory] : [];
            if (list.includes(text)) { showAppToast('이미 등록된 상용구입니다'); return; }
            if (list.length >= RECORD_SNIPPET_MAX_PER_CATEGORY) { showAppToast(`상용구는 카테고리당 ${RECORD_SNIPPET_MAX_PER_CATEGORY}개까지 등록할 수 있습니다`); return; }
            list.push(text);
            recordSnippets[snippetTargetCategory] = list;
            if (!isSnippetStorageWithinLimit()) {
                list.pop();
                if (list.length === 0) delete recordSnippets[snippetTargetCategory];
                showAppToast('상용구·템플릿 저장 공간이 가득 찼습니다. 쓰지 않는 항목을 삭제한 뒤 추가해주세요');
                return;
            }
            saveRecordSnippetsToStorage();
            input.value = '';
            renderRecordSnippetModal();
        }

        function deleteRecordSnippet(i) {
            if (!checkEditPermission()) return;
            const list = recordSnippets[snippetTargetCategory];
            if (!Array.isArray(list)) return;
            list.splice(i, 1);
            if (list.length === 0) delete recordSnippets[snippetTargetCategory];
            saveRecordSnippetsToStorage();
            renderRecordSnippetModal();
        }

        // 입력창의 커서 위치에 텍스트를 넣음. 커서 줄에 이미 내용이 있으면 다음 줄로 넣고,
        // 번호 매기기("1. ") 중이면 다음 번호를 붙여서 기존 자동 번호 규칙과 어긋나지 않게 함
        function insertTextIntoCategory(category, text, cursor) {
            const textarea = document.getElementById(`category-${category}`);
            if (!textarea) {
                // 접혀 있거나 숨긴 카테고리는 입력창이 없으므로 기록 끝에 바로 덧붙임
                appendLineToRecord(selectedDate, category, text);
                renderRecordForm();
                renderCalendar();
                return;
            }
            const value = textarea.value;
            const pos = cursor && typeof cursor.start === 'number' ? Math.min(cursor.start, value.length) : value.length;
            const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
            let lineEnd = value.indexOf('\n', pos);
            if (lineEnd === -1) lineEnd = value.length;
            const currentLine = value.substring(lineStart, lineEnd);
            const numMatch = currentLine.match(/^(\d+)\.\s?(.*)$/);

            let newValue, newCursor;
            if (currentLine.trim() === '' || (numMatch && numMatch[2].trim() === '')) {
                // 빈 줄(또는 번호만 있는 줄)이면 그 줄에 바로 채움
                const prefix = numMatch ? numMatch[1] + '. ' : (value.trim() === '' ? '1. ' : '');
                newValue = value.substring(0, lineStart) + prefix + text + value.substring(lineEnd);
                newCursor = lineStart + prefix.length + text.length;
            } else {
                const prefix = numMatch ? (parseInt(numMatch[1], 10) + 1) + '. ' : '';
                newValue = value.substring(0, lineEnd) + '\n' + prefix + text + value.substring(lineEnd);
                newCursor = lineEnd + 1 + prefix.length + text.length;
            }
            textarea.value = newValue;
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = newCursor;
            textarea.dispatchEvent(new Event('input', { bubbles: true })); // 자동 번호 정리 + 자동 저장
        }

        function insertRecordSnippet(i) {
            if (!checkEditPermission()) return;
            const category = snippetTargetCategory;
            const text = (recordSnippets[category] || [])[i];
            if (!text) return;
            const cursor = snippetTargetCursor;
            closeRecordSnippetModal();
            insertTextIntoCategory(category, text, cursor);
        }

        function saveCurrentAsWeekdayTemplate() {
            if (!checkEditPermission()) return;
            const category = snippetTargetCategory;
            if (!category || !selectedDate) return;
            captureCurrentFormToRecords();
            const content = ((records[selectedDate] || {})[category] || '').trim();
            if (!content) { showAppToast('이 날짜의 카테고리 내용이 비어 있어 템플릿으로 저장할 수 없습니다'); return; }
            const dow = String(parseLocalDate(selectedDate).getDay());
            if (!weekdayTemplates[dow] || typeof weekdayTemplates[dow] !== 'object') weekdayTemplates[dow] = {};
            const previous = weekdayTemplates[dow][category];
            weekdayTemplates[dow][category] = content.slice(0, 2000);
            if (!isSnippetStorageWithinLimit()) {
                if (previous === undefined) delete weekdayTemplates[dow][category]; else weekdayTemplates[dow][category] = previous;
                if (Object.keys(weekdayTemplates[dow]).length === 0) delete weekdayTemplates[dow];
                showAppToast('상용구·템플릿 저장 공간이 가득 찼습니다. 쓰지 않는 템플릿을 삭제한 뒤 저장해주세요');
                return;
            }
            saveRecordSnippetsToStorage();
            renderRecordSnippetModal();
            showAppToast(`${WEEKDAY_NAMES[dow]}요일 템플릿으로 저장했습니다`, 'success');
        }

        function applyWeekdayTemplateToCategory() {
            if (!checkEditPermission()) return;
            const category = snippetTargetCategory;
            const dow = String(parseLocalDate(selectedDate).getDay());
            const template = weekdayTemplates[dow] && weekdayTemplates[dow][category];
            if (!template) return;
            closeRecordSnippetModal();
            const textarea = document.getElementById(`category-${category}`);
            if (textarea && textarea.value.trim() === '') {
                textarea.value = template;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                insertTextIntoCategory(category, template, null);
            }
        }

        function deleteWeekdayTemplate() {
            if (!checkEditPermission()) return;
            const category = snippetTargetCategory;
            const dow = String(parseLocalDate(selectedDate).getDay());
            if (!weekdayTemplates[dow]) return;
            delete weekdayTemplates[dow][category];
            if (Object.keys(weekdayTemplates[dow]).length === 0) delete weekdayTemplates[dow];
            saveRecordSnippetsToStorage();
            renderRecordSnippetModal();
        }

        // 선택한 날짜의 요일에 템플릿이 있는데 아직 비어 있는 카테고리가 있으면 한 번에 채우는 안내 배너
        function getEmptyCategoriesWithTemplate(dateStr) {
            const dow = String(parseLocalDate(dateStr).getDay());
            const templates = weekdayTemplates[dow];
            if (!templates) return [];
            const rec = records[dateStr] || {};
            const hiddenList = hiddenCategoriesByDate[dateStr] || [];
            return categories.filter(c => templates[c] && !hiddenList.includes(c) && !(rec[c] && rec[c].trim()));
        }

        function buildWeekdayTemplateBanner(dateStr) {
            if (isFeatureDisabled('recordSnippets')) return '';
            const targets = getEmptyCategoriesWithTemplate(dateStr);
            if (targets.length === 0) return '';
            const dow = parseLocalDate(dateStr).getDay();
            return `<div class="weekday-template-banner">
                🗓️ ${WEEKDAY_NAMES[dow]}요일 템플릿이 있는 빈 카테고리: ${targets.map(escapeHtml).join(', ')}
                <button class="result-action-btn primary" onclick="applyWeekdayTemplatesToEmpty()">템플릿 채우기</button>
            </div>`;
        }

        function applyWeekdayTemplatesToEmpty() {
            if (!checkEditPermission()) return;
            if (!selectedDate) return;
            captureCurrentFormToRecords();
            const dow = String(parseLocalDate(selectedDate).getDay());
            const targets = getEmptyCategoriesWithTemplate(selectedDate);
            if (targets.length === 0) return;
            if (!records[selectedDate]) records[selectedDate] = {};
            targets.forEach(c => { records[selectedDate][c] = weekdayTemplates[dow][c]; });
            saveRecordsToStorage();
            renderRecordForm();
            renderCalendar();
            showAppToast(`${targets.length}개 카테고리에 템플릿을 채웠습니다`, 'success');
        }

        // ===== 수정 이력 & 되돌리기 =====
        let revisionTargetCategory = null;

        function formatRevisionTime(ts) {
            const d = new Date(ts);
            return `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }

        function openRecordRevisionModal(category) {
            if (!selectedDate) return;
            revisionTargetCategory = category;
            captureCurrentFormToRecords(); // 지금 화면 내용까지 반영된 상태에서 비교하도록 먼저 확정
            const list = (recordRevisions[selectedDate + '|' + category] || []).slice().reverse();
            document.getElementById('recordRevisionModalTitle').textContent = `🕘 수정 이력 · ${selectedDate} · ${category}`;
            const listEl = document.getElementById('recordRevisionList');
            listEl.innerHTML = list.length === 0
                ? '<div class="maint-completion-empty">보관된 이전 내용이 없습니다.</div>'
                : list.map((rev, i) => `
                    <div class="record-revision-item">
                        <div class="record-revision-head">
                            <span>${formatRevisionTime(rev.ts)} 이전 내용</span>
                            <button class="result-action-btn primary" onclick="restoreRecordRevision(${list.length - 1 - i})">↩ 이 내용으로 되돌리기</button>
                        </div>
                        <div class="record-revision-text">${escapeHtml(rev.v)}</div>
                    </div>`).join('');
            document.getElementById('recordRevisionModal').classList.add('active');
        }

        function closeRecordRevisionModal() {
            document.getElementById('recordRevisionModal').classList.remove('active');
            revisionTargetCategory = null;
        }

        function restoreRecordRevision(originalIndex) {
            if (!checkEditPermission()) return;
            const category = revisionTargetCategory;
            const key = selectedDate + '|' + category;
            const rev = (recordRevisions[key] || [])[originalIndex];
            if (!rev) return;
            captureCurrentFormToRecords();
            if (!records[selectedDate]) records[selectedDate] = {};
            const current = records[selectedDate][category] || '';
            if (current === rev.v) { showAppToast('지금 내용과 같습니다'); return; }
            pushRecordRevision(selectedDate, category, current, true); // 되돌리기 전 내용도 다시 되돌릴 수 있게 보관
            records[selectedDate][category] = rev.v;
            saveRecordsToStorage();
            closeRecordRevisionModal();
            renderRecordForm();
            renderCalendar();
            showAppToast(`${formatRevisionTime(rev.ts)} 이전 내용으로 되돌렸습니다`, 'success');
        }
