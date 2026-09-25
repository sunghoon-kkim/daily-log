        // ===== 정비계획 =====
        // 지금 화면에 표시 중인 연도. 저장하지 않는 화면 상태값이라 새로고침하면 항상 올해로 돌아옴 (달력 탭과 동일한 방식)
        let maintenanceViewYear = new Date().getFullYear();

        function changeMaintenanceViewYear(delta) {
            maintenanceViewYear += delta;
            renderMaintenanceSchedule();
        }

        // "주기" 자유 텍스트(예: "1개월", "분기", "2년" 등)에서 반복 개월 수를 추정함.
        // 알아들을 수 없는 표현이면 null을 반환하고, 이 경우 반복 없이 등록된 차기 점검월에만 표시함
        function parseCycleIntervalMonths(cycleText) {
            const text = (cycleText || '').trim();
            if (!text) return null;

            let months = 0;
            let matched = false;
            const yearMatch = text.match(/(\d+)\s*년/);
            if (yearMatch) { months += parseInt(yearMatch[1], 10) * 12; matched = true; }
            const monthMatch = text.match(/(\d+)\s*(개월|달)/);
            if (monthMatch) { months += parseInt(monthMatch[1], 10); matched = true; }

            if (!matched) {
                if (/격월/.test(text)) { months = 2; matched = true; }
                else if (/분기/.test(text)) { months = 3; matched = true; }
                else if (/반기/.test(text)) { months = 6; matched = true; }
                else if (/매년|매해/.test(text)) { months = 12; matched = true; }
                else if (/매월|매달/.test(text)) { months = 1; matched = true; }
            }

            return (matched && months > 0) ? months : null;
        }

        // 등록된 차기 점검월(기준점)과 주기를 바탕으로, targetYear 안에서 이 항목이 해당하는 월(1~12) 목록을 구함.
        // 주기를 못 알아들으면 등록된 차기 점검월이 그 해에 속할 때만 그 한 달만 반환
        function getMaintenanceOccurrenceMonths(item, targetYear) {
            if (!/^\d{4}-\d{2}$/.test(item.nextDue || '')) return [];
            const [anchorYear, anchorMonth] = item.nextDue.split('-').map(Number);
            const anchorIndex = anchorYear * 12 + (anchorMonth - 1);
            const interval = parseCycleIntervalMonths(item.cycle);

            const months = [];
            for (let m = 0; m < 12; m++) {
                const idx = targetYear * 12 + m;
                if (interval) {
                    const diff = ((idx - anchorIndex) % interval + interval) % interval;
                    if (diff === 0) months.push(m + 1);
                } else if (idx === anchorIndex) {
                    months.push(m + 1);
                }
            }
            return months;
        }

        // 항목 하나의 연중 예정월 목록을 HTML로 변환 (예: [3,6,9,12] → "3월, 6월, 9월, 12월").
        // 확인하는 용도의 탭이므로 이미 지난 달은 흐리게, 아직 남은 달은 진하게, 이번 달은
        // 눈에 띄는 색 배지로 표시해서 지금 뭘 챙겨야 하는지 한눈에 보이게 함
        function renderOccurrenceMonthsHtml(months) {
            if (!months || months.length === 0) return '<span class="month-chip month-undated">📌 미정</span>';
            const now = new Date();
            const nowIndex = now.getFullYear() * 12 + now.getMonth();
            return months.map(mo => {
                const idx = maintenanceViewYear * 12 + (mo - 1);
                if (idx === nowIndex) return `<span class="month-chip month-current">${mo}월 · 이번 달</span>`;
                if (idx < nowIndex) return `<span class="month-chip month-past">${mo}월</span>`;
                return `<span class="month-chip month-future">${mo}월</span>`;
            }).join(', ');
        }

        // "차기 점검 예정"(YYYY-MM)이 지금부터 몇 개월 남았는지 계산. 미정이면 null (지난 달이면 음수)
        function getMonthsUntilDue(nextDue) {
            if (!/^\d{4}-\d{2}$/.test(nextDue || '')) return null;
            const [y, mo] = nextDue.split('-').map(Number);
            const now = new Date();
            return (y * 12 + (mo - 1)) - (now.getFullYear() * 12 + now.getMonth());
        }

        // 상태와 차기 점검 예정일을 바탕으로 이 항목이 얼마나 급한지 등급을 매김.
        // 지났는데 아직 완료가 아니면 지연, 이번 달이나 다음 달이면 임박.
        // 기안 등 사전 보고가 필요한 경우가 많아, 2개월 전부터는 "사전 인지 필요" 대상으로 표시해서
        // 미리 인지하고 준비했는지 체크할 수 있게 함. rank가 작을수록 더 급한 항목
        function getMaintenanceUrgency(item) {
            if (item.status === '완료') return { level: 'done', rank: 5, monthsUntil: null };
            const monthsUntil = getMonthsUntilDue(item.nextDue);
            if (monthsUntil === null) return { level: 'undated', rank: 4, monthsUntil: null };
            if (monthsUntil < 0) return { level: 'overdue', rank: 0, monthsUntil };
            if (monthsUntil <= 1) return { level: 'urgent', rank: 1, monthsUntil };
            if (monthsUntil === 2) return { level: 'notice', rank: 2, monthsUntil };
            return { level: 'normal', rank: 3, monthsUntil };
        }

        function maintenanceUrgencyBadge(urgency) {
            if (urgency.level === 'overdue') return '⚠️ 지연';
            if (urgency.level === 'urgent') return urgency.monthsUntil === 0 ? '🔥 이번 달' : '🔥 임박(다음 달)';
            if (urgency.level === 'notice') return '📝 인지 필요(2개월 전)';
            return '';
        }

        // 정비계획 목록 상태 필터(전체/예정/완료/보류) 버튼 클릭 시 호출
        function setMaintenanceStatusFilter(status) {
            maintenanceStatusFilter = status;
            document.querySelectorAll('#maintenanceFilterRow .quick-preset-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.filter === status);
            });
            renderMaintenanceSchedule();
        }

        // 정비계획 목록 보기 모드(자세히/간단히) 버튼 클릭 시 호출.
        // 간단히 보기는 제목과 예정월만 남기고 나머지(상태, 주기, SOP, 인지 체크 등)는 숨겨서
        // 여러 건을 빠르게 훑어볼 때 쓰는 모드
        function setMaintenanceViewMode(mode) {
            maintenanceViewMode = mode;
            document.querySelectorAll('#maintenanceViewModeRow .quick-preset-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.mode === mode);
            });
            renderMaintenanceSchedule();
        }

        // 지연/임박/인지 필요 항목에 붙는 "사전 인지 완료" 체크박스를 토글함.
        // ackFor에는 인지 처리한 시점의 nextDue 값을 저장해두고, 다음 주기로 넘어가 nextDue가
        // 바뀌면 ackFor와 값이 달라져 자동으로 다시 미인지 상태가 되어 매 주기마다 새로 체크하게 됨
        function toggleMaintenanceAck(itemId) {
            const m = maintenanceSchedule.find(x => x.id === itemId);
            if (!m) return;
            m.ackFor = (m.ackFor === m.nextDue) ? null : m.nextDue;
            safeSetItem('maintenanceSchedule', JSON.stringify(maintenanceSchedule));
            queueSync();
            renderMaintenanceSchedule();
        }

        function renderMaintenanceEquipmentGroup(equipmentName, items) {
            const cardsHtml = items.map(m => {
                const urgency = m._urgency;
                const urgencyClass = ['overdue', 'urgent', 'notice'].includes(urgency.level) ? ` maint-${urgency.level}` : '';

                if (maintenanceViewMode === 'simple') {
                    return `
                <div class="project-card${urgencyClass}" onclick="openMaintenanceModal('${m.id}')">
                    <div class="project-card-top">
                        <div class="project-card-title">${m.item ? escapeHtml(m.item) : '점검'}</div>
                    </div>
                    <div class="project-card-row"><b>예정월:</b> ${renderOccurrenceMonthsHtml(m._occurrenceMonths)}</div>
                </div>
            `;
                }

                const badgeLabel = maintenanceUrgencyBadge(urgency);
                const acked = m.ackFor && m.ackFor === m.nextDue;
                const showAck = ['overdue', 'urgent', 'notice'].includes(urgency.level);

                return `
                <div class="project-card${urgencyClass}" onclick="openMaintenanceModal('${m.id}')">
                    <div class="project-card-top">
                        <div class="project-card-title">${m.item ? escapeHtml(m.item) : '점검'}</div>
                        <div style="display:flex; gap:6px; align-items:center;">
                            ${badgeLabel ? `<span class="project-badge urgency-${urgency.level}">${badgeLabel}</span>` : ''}
                            <span class="project-badge status-${maintenanceStatusClass(m.status)}">${m.status}</span>
                        </div>
                    </div>
                    <div class="project-card-row"><b>예정월:</b> ${renderOccurrenceMonthsHtml(m._occurrenceMonths)}</div>
                    ${m.cycle ? `<div class="project-card-row"><b>주기:</b> ${escapeHtml(m.cycle)}</div>` : ''}
                    ${(m.cycle && !parseCycleIntervalMonths(m.cycle)) ? `<div class="project-card-row maint-cycle-warning">⚠️ 주기 표현을 자동으로 인식하지 못해, 등록된 차기 점검월만 표시돼요. ("3개월", "격월", "분기", "반기", "매년" 등으로 적으면 반복월이 자동 계산됩니다)</div>` : ''}
                    ${m.sop ? `<div class="project-card-row"><b>SOP:</b> ${escapeHtml(m.sop)}</div>` : ''}
                    ${renderMaintenanceLastDoneRow(m)}
                    ${showAck ? `
                    <label class="maint-ack-row" onclick="event.stopPropagation()">
                        <input type="checkbox" ${acked ? 'checked' : ''} onchange="toggleMaintenanceAck('${m.id}')">
                        사전 인지 완료 (기안, 재고 확보 등)
                    </label>` : ''}
                    <div class="maint-card-actions" onclick="event.stopPropagation()">
                        <button class="result-action-btn" onclick="openMaintenanceCompleteModal('${m.id}')">✅ 완료 처리</button>
                    </div>
                </div>
            `;
            }).join('');

            return `
                <div class="maintenance-equipment-group" style="margin-bottom:24px;">
                    <div class="result-date maint-group-title">🔧 ${escapeHtml(equipmentName)}
                        ${(equipmentName !== '(설비 미지정)' && !isFeatureDisabled('equipmentTimeline')) ? `<button class="result-action-btn" onclick="openEquipmentTimeline('${escapeForOnclickArg(equipmentName)}')" title="이 설비의 활동기록·정비 완료 이력을 시간순으로 보기">📜 설비 이력</button>` : ''}
                    </div>
                    ${cardsHtml}
                </div>
            `;
        }

        // 항목당 카드를 여러 달에 반복해서 나열하면 목록이 너무 길어지므로, 설비별로 묶어서
        // 항목 하나당 카드 1장만 표시하고 그 해의 예정월(들)은 카드 안에 텍스트로 모아서 보여줌.
        // 선택한 연도에 해당 항목의 예정월이 없으면(주기상 그 해는 건너뜀) 그 해 목록에서는 제외됨.
        // 예정월을 아직 안 정한 항목은 올해를 보고 있을 때만 표시됨.
        // 급한 항목(지연/임박/인지 필요)이 눈에 잘 띄도록, 설비 그룹 안에서는 항목을 급한 순서로
        // 정렬하고, 설비 그룹 자체도 그 안에서 가장 급한 항목 기준으로 정렬함
        function renderMaintenanceSchedule() {
            const container = document.getElementById('maintenanceList');
            if (!container) return;
            if (typeof renderTodaySummary === 'function') renderTodaySummary(); // 정비 일정이 바뀌면 오늘 요약의 "급한 정비"도 갱신

            const yearLabelEl = document.getElementById('maintenanceViewYearLabel');
            if (yearLabelEl) yearLabelEl.textContent = maintenanceViewYear + '년';

            if (maintenanceSchedule.length === 0) {
                container.innerHTML = '<div class="no-projects">아직 등록된 정비계획이 없습니다. "새 일정 추가"로 시작해보세요.</div>';
                return;
            }

            const isCurrentYear = maintenanceViewYear === new Date().getFullYear();

            const visibleItems = [];
            for (const m of maintenanceSchedule) {
                if (maintenanceStatusFilter !== '전체' && m.status !== maintenanceStatusFilter) continue;
                const isUndated = !/^\d{4}-\d{2}$/.test(m.nextDue || '');
                if (isUndated) {
                    if (isCurrentYear) visibleItems.push(Object.assign({}, m, { _occurrenceMonths: [], _urgency: getMaintenanceUrgency(m) }));
                    continue;
                }
                const months = getMaintenanceOccurrenceMonths(m, maintenanceViewYear);
                if (months.length > 0) visibleItems.push(Object.assign({}, m, { _occurrenceMonths: months, _urgency: getMaintenanceUrgency(m) }));
            }

            if (visibleItems.length === 0) {
                container.innerHTML = `<div class="no-projects">${maintenanceViewYear}년에는 ${maintenanceStatusFilter === '전체' ? '' : '"' + maintenanceStatusFilter + '" 상태의 '}정비계획이 없습니다.</div>`;
                return;
            }

            const groups = {};
            for (const m of visibleItems) {
                const key = m.equipment || '(설비 미지정)';
                if (!groups[key]) groups[key] = [];
                groups[key].push(m);
            }

            for (const key of Object.keys(groups)) {
                groups[key].sort((a, b) => a._urgency.rank - b._urgency.rank || (a.item || '').localeCompare(b.item || ''));
            }

            const equipmentNames = Object.keys(groups).sort((a, b) => {
                const rankDiff = groups[a][0]._urgency.rank - groups[b][0]._urgency.rank;
                return rankDiff !== 0 ? rankDiff : a.localeCompare(b);
            });

            container.innerHTML = equipmentNames.map(name => renderMaintenanceEquipmentGroup(name, groups[name])).join('');
        }

        // 정비계획 상태값은 개선/절감 과제와 이름이 달라서, 배지 색상 클래스(status-계획중/완료/보류)에 맞춰 매핑함
        function maintenanceStatusClass(status) {
            if (status === '완료') return '완료';
            if (status === '보류') return '보류';
            return '계획중'; // 예정
        }

        // 상태를 select 대신 버튼 3개 중 하나를 고르는 방식으로 표시. 실제 값은 숨겨진
        // maintStatusInput에 저장해서, 읽고 저장하는 나머지 코드는 select였을 때와 동일하게 동작함
        function pickMaintenanceStatus(status) {
            document.getElementById('maintStatusInput').value = status;
            document.querySelectorAll('#maintStatusButtonRow .quick-preset-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.status === status);
            });
        }

        function openMaintenanceModal(itemId) {
            if (!checkEditPermission()) return;
            editingMaintenanceId = itemId;
            const modal = document.getElementById('maintenanceModal');
            const title = document.getElementById('maintenanceModalTitle');
            const deleteBtn = document.getElementById('deleteMaintenanceBtn');

            if (itemId) {
                const m = maintenanceSchedule.find(x => x.id === itemId);
                if (!m) return;
                title.textContent = '🔧 정비계획 수정';
                document.getElementById('maintEquipmentInput').value = m.equipment || '';
                document.getElementById('maintItemInput').value = m.item || '';
                document.getElementById('maintSopInput').value = m.sop || '';
                document.getElementById('maintCycleInput').value = m.cycle || '';
                pickMaintenanceStatus(m.status || '예정');
                document.getElementById('maintLastDoneInput').value = m.lastDone || '';
                document.getElementById('maintNextDueInput').value = m.nextDue || '';
                document.getElementById('maintNoteInput').value = m.note || '';
                deleteBtn.style.display = 'inline-block';
                renderMaintenanceCompletionHistory(m);
            } else {
                title.textContent = '🔧 정비계획 추가';
                document.getElementById('maintEquipmentInput').value = '';
                document.getElementById('maintItemInput').value = '';
                document.getElementById('maintSopInput').value = '';
                document.getElementById('maintCycleInput').value = '';
                pickMaintenanceStatus('예정');
                document.getElementById('maintLastDoneInput').value = '';
                document.getElementById('maintNextDueInput').value = '';
                document.getElementById('maintNoteInput').value = '';
                deleteBtn.style.display = 'none';
                renderMaintenanceCompletionHistory(null);
            }

            modal.classList.add('active');
            applyFormLockState(); // 위 각 input.value 설정 뒤에도 잠금 상태(readOnly)가 유지되도록 재적용
        }

        function closeMaintenanceModal() {
            document.getElementById('maintenanceModal').classList.remove('active');
            editingMaintenanceId = null;
        }

        function saveMaintenanceItem() {
            if (!checkEditPermission()) return;

            const equipment = document.getElementById('maintEquipmentInput').value.trim();
            if (!equipment) {
                showAppToast('설비명을 입력해주세요');
                return;
            }

            const item = document.getElementById('maintItemInput').value.trim();
            const sop = document.getElementById('maintSopInput').value.trim();
            const cycle = document.getElementById('maintCycleInput').value.trim();
            const status = document.getElementById('maintStatusInput').value;
            const lastDone = document.getElementById('maintLastDoneInput').value.trim();
            const nextDue = document.getElementById('maintNextDueInput').value.trim();
            const note = document.getElementById('maintNoteInput').value.trim();
            const nowStr = formatDate(new Date());

            if (editingMaintenanceId) {
                const m = maintenanceSchedule.find(x => x.id === editingMaintenanceId);
                if (m) {
                    m.equipment = equipment; m.item = item; m.sop = sop;
                    m.cycle = cycle; m.status = status; m.lastDone = lastDone; m.nextDue = nextDue;
                    m.note = note; m.updatedAt = nowStr;
                }
            } else {
                maintenanceSchedule.push({
                    id: 'maint_' + Date.now(),
                    equipment, item, sop, cycle, status, lastDone, nextDue, note,
                    createdAt: nowStr, updatedAt: nowStr
                });
            }

            safeSetItem('maintenanceSchedule', JSON.stringify(maintenanceSchedule));
            queueSync();
            closeMaintenanceModal();
            renderMaintenanceSchedule();
        }

        function deleteMaintenanceItem() {
            if (!checkEditPermission()) return;
            if (!editingMaintenanceId) return;
            confirmModal('이 정비계획 항목을 삭제하시겠습니까?', () => {
                maintenanceSchedule = maintenanceSchedule.filter(m => m.id !== editingMaintenanceId);
                safeSetItem('maintenanceSchedule', JSON.stringify(maintenanceSchedule));
                queueSync();
                closeMaintenanceModal();
                renderMaintenanceSchedule();
            });
        }


        // ===== 정비 완료 이력 (완료할 때마다 누적) =====
        // 예전에는 "이전 완료일"(lastDone) 한 칸만 있어서 수정할 때마다 과거 실적이 덮어써졌음.
        // 이제 완료 처리 시 completions 배열에 한 줄씩 쌓고, lastDone은 가장 최근 완료일로 맞춰서
        // 기존 화면/데이터(lastDone만 쓰던 코드)와 그대로 호환되게 함
        let completingMaintenanceId = null;

        function getMaintenanceCompletions(m) {
            return (m && Array.isArray(m.completions)) ? m.completions : [];
        }

        function renderMaintenanceLastDoneRow(m) {
            const completions = getMaintenanceCompletions(m);
            if (completions.length > 0) {
                const latest = completions[completions.length - 1];
                return `<div class="project-card-row"><b>이전 완료:</b> ${escapeHtml(latest.date)} <span class="maint-completion-count">(누적 ${completions.length}회)</span></div>`;
            }
            return m.lastDone ? `<div class="project-card-row"><b>이전 완료:</b> ${escapeHtml(m.lastDone)}</div>` : '';
        }

        // "YYYY-MM-DD" 완료일 + 주기(개월) → 다음 예정월 "YYYY-MM". 주기를 알아들을 수 없으면 null
        function computeNextDueFromCompletion(dateStr, cycleText) {
            const interval = parseCycleIntervalMonths(cycleText);
            if (!interval || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null;
            const [y, mo] = dateStr.split('-').map(Number);
            const idx = y * 12 + (mo - 1) + interval;
            return `${Math.floor(idx / 12)}-${String(idx % 12 + 1).padStart(2, '0')}`;
        }

        function renderMaintenanceCompletionHistory(m) {
            const field = document.getElementById('maintCompletionHistoryField');
            const listEl = document.getElementById('maintCompletionHistory');
            if (!field || !listEl) return;
            if (!m) { field.style.display = 'none'; listEl.innerHTML = ''; return; }
            field.style.display = '';
            const completions = getMaintenanceCompletions(m).slice().reverse();
            const itemsHtml = completions.length === 0
                ? '<div class="maint-completion-empty">아직 누적된 완료 이력이 없습니다.</div>'
                : completions.map(c => `
                    <div class="maint-completion-item">
                        <span class="maint-completion-date">${escapeHtml(c.date)}</span>
                        <span class="maint-completion-note">${escapeHtml(c.note || '')}</span>
                        <button type="button" class="category-tag-delete" onclick="deleteMaintenanceCompletion('${m.id}', '${c.id}')" aria-label="이 완료 이력 삭제">✕</button>
                    </div>`).join('');
            listEl.innerHTML = itemsHtml + `<button type="button" class="result-action-btn" style="margin-top:8px;" onclick="openMaintenanceCompleteModal('${m.id}')">✅ 완료 기록 추가</button>`;
        }

        function refreshMaintenanceCompleteHint() {
            const hintEl = document.getElementById('maintCompleteNextDueHint');
            const m = maintenanceSchedule.find(x => x.id === completingMaintenanceId);
            if (!hintEl || !m) return;
            const date = document.getElementById('maintCompleteDateInput').value;
            const nextDue = computeNextDueFromCompletion(date, m.cycle);
            hintEl.textContent = nextDue
                ? `주기(${m.cycle})에 따라 차기 점검 예정이 ${nextDue}로 자동 변경되고 상태는 "예정"이 됩니다.`
                : '주기를 자동으로 인식하지 못해 차기 점검 예정은 그대로 두고, 상태만 "완료"로 바뀝니다.';
        }

        function openMaintenanceCompleteModal(itemId) {
            if (!checkEditPermission()) return;
            const m = maintenanceSchedule.find(x => x.id === itemId);
            if (!m) return;
            completingMaintenanceId = itemId;

            document.getElementById('maintCompleteTarget').textContent = `${m.equipment || ''} - ${m.item || '점검'}`;
            document.getElementById('maintCompleteDateInput').value = formatDate(new Date());
            document.getElementById('maintCompleteNoteInput').value = '';

            const select = document.getElementById('maintCompleteCategorySelect');
            let preferred = '';
            try { preferred = localStorage.getItem('maintCompleteCategory') || ''; } catch (e) { /* 무시 */ }
            select.innerHTML = categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
            select.value = categories.includes(preferred) ? preferred : (categories[0] || '');
            document.getElementById('maintCompleteLogCheckbox').checked = categories.length > 0;

            refreshMaintenanceCompleteHint();
            document.getElementById('maintCompleteModal').classList.add('active');
            applyFormLockState();
        }

        function closeMaintenanceCompleteModal() {
            document.getElementById('maintCompleteModal').classList.remove('active');
            completingMaintenanceId = null;
        }

        // 활동기록 끝에 한 줄 덧붙임. 번호 매기기("1. ") 형식으로 쓰던 내용이면 다음 번호를 이어서 붙임
        function appendLineToRecord(dateStr, category, line) {
            if (selectedDate) captureCurrentFormToRecords(); // 화면에 입력 중이던 내용이 나중에 이 줄을 덮어쓰지 않도록 먼저 확정
            if (!records[dateStr]) records[dateStr] = {};
            const old = (records[dateStr][category] || '').replace(/\s+$/, '');
            let newLine = line;
            if (!old) {
                newLine = '1. ' + line;
            } else {
                const lastLine = old.split('\n').pop();
                const numMatch = lastLine.match(/^(\d+)\.\s/);
                if (numMatch) newLine = (parseInt(numMatch[1], 10) + 1) + '. ' + line;
            }
            pushRecordRevision(dateStr, category, records[dateStr][category]);
            records[dateStr][category] = old ? old + '\n' + newLine : newLine;
            // 그 날짜에서 숨겨둔 카테고리였다면 방금 적은 내용이 안 보이지 않도록 다시 표시
            if (hiddenCategoriesByDate[dateStr] && hiddenCategoriesByDate[dateStr].includes(category)) {
                hiddenCategoriesByDate[dateStr] = hiddenCategoriesByDate[dateStr].filter(c => c !== category);
                saveHiddenCategoriesToStorage();
            }
            saveRecordsToStorage();
        }

        function confirmMaintenanceComplete() {
            if (!checkEditPermission()) return;
            const m = maintenanceSchedule.find(x => x.id === completingMaintenanceId);
            if (!m) { closeMaintenanceCompleteModal(); return; }

            const date = document.getElementById('maintCompleteDateInput').value;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { showAppToast('완료일을 선택해주세요'); return; }
            const note = document.getElementById('maintCompleteNoteInput').value.trim();
            const logToRecord = document.getElementById('maintCompleteLogCheckbox').checked;
            const category = document.getElementById('maintCompleteCategorySelect').value;

            if (!Array.isArray(m.completions)) m.completions = [];
            m.completions.push({ id: 'mc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), date, note, loggedAt: new Date().toISOString() });
            m.completions.sort((a, b) => a.date.localeCompare(b.date));
            const latest = m.completions[m.completions.length - 1].date;
            m.lastDone = latest;
            // 과거 날짜의 완료를 뒤늦게 입력한 경우(최근 완료가 아님)엔 일정은 건드리지 않음
            if (latest === date) {
                const nextDue = computeNextDueFromCompletion(date, m.cycle);
                if (nextDue) { m.nextDue = nextDue; m.status = '예정'; }
                else m.status = '완료';
            }
            m.updatedAt = formatDate(new Date());

            if (logToRecord && category) {
                safeSetItem('maintCompleteCategory', category);
                appendLineToRecord(date, category, `[정비완료] ${m.equipment || ''}${m.item ? ' - ' + m.item : ''}${note ? ' : ' + note : ''}`);
            }

            safeSetItem('maintenanceSchedule', JSON.stringify(maintenanceSchedule));
            queueSync();
            closeMaintenanceCompleteModal();

            // 정비계획 수정 모달이 같은 항목으로 열려 있으면, 거기서 "저장"을 눌러도 방금 바뀐 값이
            // 예전 값으로 되돌아가지 않도록 입력칸도 최신 값으로 맞춰줌
            if (editingMaintenanceId === m.id) {
                pickMaintenanceStatus(m.status);
                document.getElementById('maintLastDoneInput').value = m.lastDone || '';
                document.getElementById('maintNextDueInput').value = m.nextDue || '';
                renderMaintenanceCompletionHistory(m);
            }

            renderMaintenanceSchedule();
            renderCalendar();
            if (selectedDate === date) renderRecordForm();
            showAppToast(logToRecord && category ? `완료 처리했습니다 (${date} 활동기록 [${category}]에도 기록됨)` : '완료 처리했습니다', 'success');
        }

        function deleteMaintenanceCompletion(itemId, completionId) {
            if (!checkEditPermission()) return;
            const m = maintenanceSchedule.find(x => x.id === itemId);
            if (!m) return;
            confirmModal('이 완료 이력을 삭제할까요?\n(활동기록에 남긴 내용과 차기 점검 예정은 자동으로 되돌리지 않습니다)', () => {
                m.completions = getMaintenanceCompletions(m).filter(c => c.id !== completionId);
                if (m.completions.length > 0) m.lastDone = m.completions[m.completions.length - 1].date;
                m.updatedAt = formatDate(new Date());
                safeSetItem('maintenanceSchedule', JSON.stringify(maintenanceSchedule));
                queueSync();
                if (editingMaintenanceId === m.id) {
                    document.getElementById('maintLastDoneInput').value = m.lastDone || '';
                    renderMaintenanceCompletionHistory(m);
                }
                renderMaintenanceSchedule();
            });
        }
