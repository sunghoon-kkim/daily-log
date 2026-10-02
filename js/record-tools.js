        // ===== 활동기록 입력 보조 도구: 미결 사항 추적 / 수정 이력 되돌리기 =====
        // 활동기록 폼(renderRecordForm)의 카테고리 머리글 버튼(buildRecordToolButtons)을 여기서 만들어 끼워 넣음

        function parseLocalDate(dateStr) {
            const [y, m, d] = String(dateStr).split('-').map(Number);
            return new Date(y, (m || 1) - 1, d || 1);
        }

        const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

        // 카테고리 머리글 도구: ☐(미결 표시)와, 수정 이력이 있을 때만 🕘(수정 이력) 버튼
        function buildRecordToolButtons(dateStr, category, categoryArg) {
            let html = '';
            if (!isFeatureDisabled('openIssues')) {
                html += `<button class="category-prev-btn record-tool-btn" draggable="false" onclick="toggleOpenIssueMarker('${categoryArg}')" title="커서가 있는 줄을 미결 사항(☐)으로 표시/해제 - 해결 전까지 달력 위 '미결 사항'에서 계속 추적됩니다">☐</button>`;
            }
            const revisions = recordRevisions[dateStr + '|' + category];
            if (!isFeatureDisabled('recordRevisions') && Array.isArray(revisions) && revisions.length > 0) {
                html += `<button class="category-collapse-btn" draggable="false" onclick="openRecordRevisionModal('${categoryArg}')" title="수정 이력 (${revisions.length})" aria-label="수정 이력 ${revisions.length}건">🕘</button>`;
            }
            return html;
        }

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
            // 교대 운전(백워시 등)은 달력에서 꺼두는 경우가 많으므로 켜고 끈 것과 상관없이
            // 오늘 할 작업을 따로 한 줄로 알려주고, 일반 오늘 일정 개수에서는 빼서 중복 표시하지 않음
            const todayAllEvents = events.filter(ev => todayStr >= ev.start && todayStr <= ev.end);
            const todayRotation = todayAllEvents.filter(ev => getEventGroup(ev) === ROTATION_EVENT_GROUP);
            if (todayRotation.length > 0) {
                chip('warn', '🔁', `오늘 ${todayRotation.map(ev => escapeHtml(ev.title)).join(', ')}`, `jumpToDateRecord('${todayStr}')`);
            }
            if (isRotationStatusEnabled()) {
                // 가동/대기 표시를 켠 경우에만: 오늘 가동 중인 설비 (백워시 줄과 겹치지 않게 가동만 짧게)
                const statuses = getRotationStatusesForDate(collectRotationPairs(), todayStr);
                const running = statuses.filter(st => !st.conflict).map(st => `${st.name} ${Object.keys(st.states).find(u => st.states[u] === 'run')}`);
                if (running.length > 0) chip('neutral', '▶️', `오늘 가동: ${running.map(escapeHtml).join(', ')}`, `jumpToDateRecord('${todayStr}')`);
                statuses.filter(st => st.conflict).forEach(st => {
                    chip('alert', '⚠️', `${escapeHtml(st.name)} ${Object.keys(st.states).sort().map(escapeHtml).join('·')} 같은 날 백워시`, `jumpToDateRecord('${todayStr}')`);
                });
            }
            const todayEvents = todayAllEvents.filter(ev => getEventGroup(ev) !== ROTATION_EVENT_GROUP);
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
