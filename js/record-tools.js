        // ===== 활동기록 입력 보조 도구: 수정 이력 되돌리기 =====
        // 활동기록 폼(renderRecordForm)의 카테고리 머리글 버튼(buildRecordToolButtons)을 여기서 만들어 끼워 넣음

        function parseLocalDate(dateStr) {
            const [y, m, d] = String(dateStr).split('-').map(Number);
            return new Date(y, (m || 1) - 1, d || 1);
        }

        const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

        // 카테고리 머리글 도구: 수정 이력이 있을 때만 🕘(수정 이력) 버튼
        function buildRecordToolButtons(dateStr, category, categoryArg) {
            let html = '';
            const revisions = recordRevisions[dateStr + '|' + category];
            if (!isFeatureDisabled('recordRevisions') && Array.isArray(revisions) && revisions.length > 0) {
                html += `<button class="category-collapse-btn" draggable="false" onclick="openRecordRevisionModal('${categoryArg}')" title="수정 이력 (${revisions.length})" aria-label="수정 이력 ${revisions.length}건">🕘</button>`;
            }
            return html;
        }

        // ===== 오늘 요약 카드 =====
        // 아침에 앱을 열면 오늘 챙길 것(오늘 기록/직전 근무일 누락/오늘 일정/급한 정비)을 한 줄로 보여줌.
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
                let overdue = 0, soon = 0;
                maintenanceSchedule.forEach(m => {
                    if (m.status === '보류') return; // 보류 항목은 급한 일로 보지 않음
                    const u = getMaintenanceUrgency(m);
                    if (u.level === 'overdue') overdue++;
                    else if (u.level === 'urgent' && u.daysUntil <= 7) soon++;
                });
                if (overdue + soon > 0) {
                    const parts = [];
                    if (overdue) parts.push(`지연 ${overdue}`);
                    if (soon) parts.push(`7일 이내 ${soon}`);
                    chip(overdue ? 'alert' : 'warn', '🔧', `정비 ${parts.join(' · ')}건`, `switchTab('maintenance')`);
                }
            }

            const d = parseLocalDate(todayStr);
            el.innerHTML = `<div class="today-summary-title">🌅 오늘 · ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_NAMES[d.getDay()]})</div>
                <div class="today-summary-chips">${chips.join('')}</div>`;
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
