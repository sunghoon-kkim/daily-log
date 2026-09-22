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
            localStorage.setItem('maintenanceSchedule', JSON.stringify(maintenanceSchedule));
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
                    ${m.lastDone ? `<div class="project-card-row"><b>이전 완료:</b> ${escapeHtml(m.lastDone)}</div>` : ''}
                    ${showAck ? `
                    <label class="maint-ack-row" onclick="event.stopPropagation()">
                        <input type="checkbox" ${acked ? 'checked' : ''} onchange="toggleMaintenanceAck('${m.id}')">
                        사전 인지 완료 (기안, 재고 확보 등)
                    </label>` : ''}
                </div>
            `;
            }).join('');

            return `
                <div class="maintenance-equipment-group" style="margin-bottom:24px;">
                    <div class="result-date">🔧 ${escapeHtml(equipmentName)}</div>
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

            localStorage.setItem('maintenanceSchedule', JSON.stringify(maintenanceSchedule));
            queueSync();
            closeMaintenanceModal();
            renderMaintenanceSchedule();
        }

        function deleteMaintenanceItem() {
            if (!checkEditPermission()) return;
            if (!editingMaintenanceId) return;
            confirmModal('이 정비계획 항목을 삭제하시겠습니까?', () => {
                maintenanceSchedule = maintenanceSchedule.filter(m => m.id !== editingMaintenanceId);
                localStorage.setItem('maintenanceSchedule', JSON.stringify(maintenanceSchedule));
                queueSync();
                closeMaintenanceModal();
                renderMaintenanceSchedule();
            });
        }

