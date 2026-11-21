        // ===== 정비계획 =====
        // 지금 화면에 표시 중인 연도. 저장하지 않는 화면 상태값이라 새로고침하면 항상 올해로 돌아옴 (달력 탭과 동일한 방식)
        let maintenanceViewYear = new Date().getFullYear();
        // 정비계획 보기 방식: 'cards'(설비별 카드) 또는 'timeline'(월 단위 타임라인). 마지막 선택을 이 기기에 기억함
        let maintenanceLayout = (function () {
            try { return localStorage.getItem('maintenanceLayout') === 'timeline' ? 'timeline' : 'cards'; } catch (e) { return 'cards'; }
        })();
        const maintTimelineCollapsed = new Set(); // 카드·타임라인에서 접어 둔 설비 이름 (두 보기 공통, 화면 상태값이라 저장하지 않음)
        let maintenanceSearchQuery = ''; // 툴바 검색어(항목명·설비명·SOP). 화면 상태값이라 저장하지 않음

        // 화면 표시용 날짜. 저장값(YYYY-MM-DD, 예전 점 형식·월 단위 포함)은 그대로 두고 YYYY.MM.DD(짧게는 MM.DD)로만 보여줌
        function formatMaintDateDisplay(str, short) {
            const t = normalizeMaintDate(str);
            let mm = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (mm) return short ? `${mm[2]}.${mm[3]}` : `${mm[1]}.${mm[2]}.${mm[3]}`;
            mm = t.match(/^(\d{4})-(\d{2})$/);
            return mm ? `${mm[1]}.${mm[2]}` : t;
        }

        // 연동된 재고 중 모자란 품목. 재고 기능이 꺼져 있거나 이미 끝난(완료) 항목이면 빈 배열
        function getMaintenanceInventoryShortages(m) {
            if (typeof isInventoryFeatureOn !== 'function' || typeof getInventoryNeedsForMaintenance !== 'function' || !isInventoryFeatureOn()) return [];
            if (m.status === '완료') return [];
            return getInventoryNeedsForMaintenance(m.id).filter(n => !n.enough);
        }

        function formatMaintShortageText(shortages) {
            const fmt = typeof formatInventoryQty === 'function' ? formatInventoryQty : String;
            return shortages.map(n => `${n.item.name} ${fmt(n.qty)}${n.item.unit || ''} (현재 ${fmt(n.current)})`).join(', ');
        }

        function maintEquipmentHistoryBtn(equipmentName, cls) {
            if (equipmentName === '(설비 미지정)' || isFeatureDisabled('keywordSearch')) return '';
            return `<button type="button" class="${cls}" onclick="event.stopPropagation(); openEquipmentTimeline('${escapeForOnclickArg(equipmentName)}')" title="이 설비의 활동기록·정비 완료 이력을 시간순으로 보기">설비 이력</button>`;
        }

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
            const monthKey = getNextDueMonthKey(item.nextDue);
            if (!monthKey) return [];
            const [anchorYear, anchorMonth] = monthKey.split('-').map(Number);
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
        function renderOccurrenceMonthsHtml(months, doneMonths) {
            if (!months || months.length === 0) return '<span class="month-chip month-undated">미정</span>';
            const now = new Date();
            const nowIndex = now.getFullYear() * 12 + now.getMonth();
            return months.map(mo => {
                const idx = maintenanceViewYear * 12 + (mo - 1);
                if (doneMonths && doneMonths.includes(mo)) return `<span class="month-chip month-done" title="이 달에 완료 기록이 있습니다">✓ ${mo}월</span>`;
                if (idx === nowIndex) return `<span class="month-chip month-current">${mo}월 · 이번 달</span>`;
                if (idx < nowIndex) return `<span class="month-chip month-past">${mo}월</span>`;
                return `<span class="month-chip month-future">${mo}월</span>`;
            }).join(', ');
        }

        // "차기 점검 예정"은 일 단위(YYYY-MM-DD)로 정함. 예전에 월 단위(YYYY-MM)로 저장한 값도 그대로 인정함
        function isValidNextDue(nextDue) {
            return /^\d{4}-\d{2}(-\d{2})?$/.test(nextDue || '');
        }

        function getNextDueMonthKey(nextDue) {
            return isValidNextDue(nextDue) ? nextDue.slice(0, 7) : null;
        }

        // 남은 일수(D-day). 월 단위로만 정한 예전 값은 그 달 마지막 날을 기한으로 봄. 미정이면 null (지났으면 음수)
        function getDaysUntilDue(nextDue) {
            if (!isValidNextDue(nextDue)) return null;
            let dueStr = nextDue;
            if (nextDue.length === 7) {
                const [y, mo] = nextDue.split('-').map(Number);
                dueStr = formatDate(new Date(y, mo, 0));
            }
            return daysBetweenDateStrs(formatDate(new Date()), dueStr);
        }

        // 완료일 문자열을 YYYY-MM-DD로 맞춤. 수정 창 안내가 "2025.03.12" 형식이라 점·빗금·하이픈을 모두 인정함.
        // 날짜 형식이 아니면 앞뒤 공백만 뺀 원래 값을 그대로 돌려줌 (저장된 값을 함부로 지우지 않기 위해)
        function normalizeMaintDate(str) {
            if (typeof str !== 'string') return '';
            const t = str.trim();
            const m = t.match(/^(\d{4})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})\.?$/);
            if (!m) return t;
            const mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
            if (mo < 1 || mo > 12 || d < 1 || d > 31) return t;
            return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }

        // 완료 이력(completions)과 이전 완료일(lastDone) 중 가장 최근 완료일(YYYY-MM-DD). 없으면 ''
        function getLatestMaintenanceDoneDate(m) {
            const dates = getMaintenanceCompletions(m).map(c => c && normalizeMaintDate(c.date));
            dates.push(normalizeMaintDate(m && m.lastDone));
            return dates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop() || '';
        }

        // 이번 달에 이미 점검을 마쳤는지(완료 이력이나 이전 완료일이 이번 달인지).
        // "직전 예정월 이후 완료"로 판단하면 제때 완료한 모든 항목이 해당돼 사전 인지 알림 자체가 사라지므로,
        // 이번 달로만 한정함. 예: 2개월 주기를 11/10에 완료 → 11월엔 차기(1월) 인지 필요를 띄우지 않고 12월부터 띄움
        function isMaintenanceDoneThisMonth(m) {
            const latest = getLatestMaintenanceDoneDate(m);
            return !!latest && latest.slice(0, 7) === formatDate(new Date()).slice(0, 7);
        }

        function formatDday(days) {
            if (days === 0) return 'D-day';
            return days > 0 ? `D-${days}` : `D+${-days}`;
        }

        // 상태와 차기 점검 예정일을 바탕으로 이 항목이 얼마나 급한지 등급을 매김.
        // 지났는데 아직 완료가 아니면 지연, 30일 이내면 임박.
        // 기안 등 사전 보고가 필요한 경우가 많아, 60일 전부터는 "사전 인지 필요" 대상으로 표시해서
        // 미리 인지하고 준비했는지 체크할 수 있게 함. rank가 작을수록 더 급한 항목
        const MAINT_URGENT_DAYS = 30;
        const MAINT_NOTICE_DAYS = 60;

        function getMaintenanceUrgency(item) {
            if (item.status === '완료') return { level: 'done', rank: 5, daysUntil: null };
            const daysUntil = getDaysUntilDue(item.nextDue);
            if (daysUntil === null) return { level: 'undated', rank: 4, daysUntil: null };
            if (daysUntil < 0) return { level: 'overdue', rank: 0, daysUntil };
            if (daysUntil <= MAINT_URGENT_DAYS) return { level: 'urgent', rank: 1, daysUntil };
            // 이번 달 점검을 이미 끝냈다면 다음 주기를 미리 알리는 "인지 필요"는 이번 달엔 띄우지 않음
            // (2개월 이하 짧은 주기는 완료하자마자 차기 예정일이 60일 안에 들어와 늘 노란색이 되던 문제)
            if (daysUntil <= MAINT_NOTICE_DAYS) {
                if (isMaintenanceDoneThisMonth(item)) return { level: 'normal', rank: 3, daysUntil };
                return { level: 'notice', rank: 2, daysUntil };
            }
            return { level: 'normal', rank: 3, daysUntil };
        }

        function maintenanceUrgencyBadge(urgency) {
            if (urgency.level === 'overdue') return `지연 ${formatDday(urgency.daysUntil)}`;
            if (urgency.level === 'urgent') return `임박 ${formatDday(urgency.daysUntil)}`;
            if (urgency.level === 'notice') return `인지 필요 ${formatDday(urgency.daysUntil)}`;
            return '';
        }

        // 정비계획 목록 상태 필터(전체/예정/완료/보류) 버튼 클릭 시 호출
        // 상태 필터와 빠른 보기 칩(지연·임박·이번 달·재고 부족)은 둘 중 하나만 켜짐: 상태를 고르면 칩이 꺼짐
        function setMaintenanceStatusFilter(status) {
            maintenanceStatusFilter = status;
            maintQuickFilter = null;
            syncMaintenanceStatusButtons();
            renderMaintenanceSchedule();
        }

        function syncMaintenanceStatusButtons() {
            document.querySelectorAll('#maintenanceFilterRow .quick-preset-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.filter === maintenanceStatusFilter);
            });
        }

        // 검색어: 띄어쓰기로 나눈 낱말이 항목명·설비명·SOP 어디에든 모두 들어 있으면 표시. 새로 검색하면 접어 둔 설비를 모두 펼침
        function setMaintenanceSearch(value) {
            const prev = maintenanceSearchQuery.trim();
            maintenanceSearchQuery = String(value || '');
            if (!prev && maintenanceSearchQuery.trim()) maintTimelineCollapsed.clear();
            renderMaintenanceSchedule();
        }

        function maintSearchMatch(m, terms) {
            if (terms.length === 0) return true;
            const hay = [m.item, m.equipment, m.sop].map(v => String(v || '').toLowerCase()).join('\n');
            return terms.every(t => hay.includes(t));
        }

        function clearMaintenanceFilters() {
            maintenanceStatusFilter = '전체';
            maintQuickFilter = null;
            maintenanceSearchQuery = '';
            const input = document.getElementById('maintenanceSearchInput');
            if (input) input.value = '';
            syncMaintenanceStatusButtons();
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

        // [카드 / 타임라인] 보기 전환. 같은 데이터·필터·연도를 그대로 쓰고 그리는 방식만 바꿈
        function setMaintenanceLayout(layout) {
            maintenanceLayout = layout === 'timeline' ? 'timeline' : 'cards';
            safeSetItem('maintenanceLayout', maintenanceLayout);
            renderMaintenanceSchedule();
        }

        function syncMaintenanceLayoutButtons() {
            document.querySelectorAll('#maintenanceLayoutRow .quick-preset-btn').forEach(btn => {
                const on = btn.dataset.layout === maintenanceLayout;
                btn.classList.toggle('selected', on);
                btn.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            // 자세히/간단히는 카드 보기에서만 의미가 있음
            const modeRow = document.getElementById('maintenanceViewModeRow');
            if (modeRow) modeRow.style.display = maintenanceLayout === 'timeline' ? 'none' : '';
        }

        function toggleMaintGroup(name) {
            if (maintTimelineCollapsed.has(name)) maintTimelineCollapsed.delete(name);
            else maintTimelineCollapsed.add(name);
            renderMaintenanceSchedule();
        }

        // 빠른 보기(툴바 칩, 카드·타임라인 공통): null | 'overdue' | 'urgent' | 'thisMonth' | 'invShort'. 화면 상태값이라 저장하지 않음
        let maintQuickFilter = null;
        // 다시 그려도 보던 스크롤 위치를 유지하기 위한 값(연도가 바뀌면 이번 달로 다시 맞춤)
        let maintTimelineScroll = null;

        // 칩을 켜면 상태 필터는 '전체'로 돌림(칩 숫자가 상태 필터와 무관한 연도 전체 기준이라 결과와 숫자가 맞도록)
        function setMaintQuickFilter(kind) {
            maintQuickFilter = maintQuickFilter === kind ? null : kind;
            if (maintQuickFilter) { maintenanceStatusFilter = '전체'; syncMaintenanceStatusButtons(); }
            renderMaintenanceSchedule();
        }

        function maintQuickMatch(m, kind) {
            if (!kind) return true;
            if (kind === 'overdue' || kind === 'urgent') return maintTimelineLevel(m) === kind;
            if (kind === 'thisMonth') return getNextDueMonthKey(m.nextDue) === formatDate(new Date()).slice(0, 7) && m.status !== '완료' && m.status !== '보류';
            if (kind === 'invShort') return m._invShort.length > 0;
            return true;
        }

        function renderMaintenanceQuickChips(counts) {
            const el = document.getElementById('maintenanceQuickChips');
            if (!el) return;
            if (!counts) { el.innerHTML = ''; return; }
            const chip = (kind, label) => `<button type="button" class="mt-summary-chip mt-summary-${kind}${maintQuickFilter === kind ? ' active' : ''}" onclick="setMaintQuickFilter('${kind}')" aria-pressed="${maintQuickFilter === kind}">${label} <b>${counts[kind]}</b></button>`;
            const invOn = typeof isInventoryFeatureOn === 'function' && isInventoryFeatureOn();
            el.innerHTML = chip('overdue', '지연') + chip('urgent', '임박') + chip('thisMonth', '이번 달') + (invOn ? chip('invShort', '📦 재고 부족') : '');
        }

        function setAllMaintGroups(collapse) {
            maintTimelineCollapsed.clear();
            if (collapse) document.querySelectorAll('#maintenanceList [data-group]').forEach(g => maintTimelineCollapsed.add(g.dataset.group));
            renderMaintenanceSchedule();
        }

        // 보류 항목은 예정일이 지나도 '지연'으로 강조하지 않음(타임라인 전용 표시 등급)
        function maintTimelineLevel(m) {
            if (m.status === '보류') return 'hold';
            return m._urgency.level;
        }

        function maintTimelineBadge(m) {
            if (m.status === '보류') return '보류';
            return maintenanceUrgencyBadge(m._urgency);
        }

        // 월 단위 타임라인: 왼쪽은 설비 → 항목(1줄 항목명, 2줄 주기·상태), 오른쪽은 보는 연도의 1~12월.
        // 예정월은 막대(급한 정도 색), 차기 예정일은 막대 안 눈금, 완료한 날은 초록 체크 점, 올해를 보면 오늘 세로선
        function renderMaintenanceTimeline(equipmentNames, groups) {
            const now = new Date();
            const thisYear = now.getFullYear();
            const thisMonth = now.getMonth() + 1;
            const isThisYear = maintenanceViewYear === thisYear;
            const daysInMonth = new Date(thisYear, thisMonth, 0).getDate();
            const todayPos = isThisYear ? ((thisMonth - 1) + (now.getDate() - 0.5) / daysInMonth) / 12 : null; // 0~1 (월 영역 안 비율)

            const head = `<div class="mt-row mt-head">
                <div class="mt-label">설비 · 정비 항목</div>
                <div class="mt-months">${Array.from({ length: 12 }, (_, i) => `<div class="mt-month-head${isThisYear && i + 1 === thisMonth ? ' is-current' : ''}">${i + 1}월</div>`).join('')}</div>
            </div>`;

            const body = equipmentNames.map(name => {
                const items = groups[name];
                const collapsed = maintTimelineCollapsed.has(name);
                const hasOverdue = items.some(m => maintTimelineLevel(m) === 'overdue');
                const nameArg = escapeForOnclickArg(name);
                const groupRow = `<div class="mt-row mt-group${hasOverdue ? ' has-overdue' : ''}" data-group="${escapeHtml(name)}">
                    <div class="mt-label"><button type="button" class="mt-group-toggle" onclick="toggleMaintGroup('${nameArg}')" aria-expanded="${collapsed ? 'false' : 'true'}">
                        ${icon('chevron-right')}<span class="mt-group-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span><span class="mt-group-count">${items.length}</span>
                    </button>${maintEquipmentHistoryBtn(name, 'mt-text-btn mt-group-history')}</div>
                    <div class="mt-months mt-months-empty"></div>
                </div>`;
                if (collapsed) return groupRow;

                const rows = items.map(m => {
                    const level = maintTimelineLevel(m);
                    const idArg = escapeForOnclickArg(m.id);
                    const dueKey = getNextDueMonthKey(m.nextDue);
                    const dueDay = (m.nextDue && m.nextDue.length === 10) ? Number(m.nextDue.slice(8, 10)) : null;
                    const latestDone = getLatestMaintenanceDoneDate(m);
                    const days = getDaysUntilDue(m.nextDue);
                    const doneMonths = new Set(m._doneDates.map(d => Number(d.slice(5, 7))));
                    const tipBase = { name: m.item || '(항목명 없음)', equipment: m.equipment || '', cycle: m.cycle || '주기 미정', due: isValidNextDue(m.nextDue) ? formatMaintDateDisplay(m.nextDue) + (days !== null && m.status !== '완료' ? ` (${formatDday(days)})` : '') : '미정', done: latestDone ? formatMaintDateDisplay(latestDone) : '없음', status: m.status || '예정', inv: formatMaintShortageText(m._invShort) };
                    const cells = Array.from({ length: 12 }, (_, i) => {
                        const month = i + 1;
                        const key = `${maintenanceViewYear}-${String(month).padStart(2, '0')}`;
                        const monthDays = new Date(maintenanceViewYear, month, 0).getDate();
                        let bar = '';
                        if (m._occurrenceMonths.includes(month)) {
                            let cls = 'mt-bar-planned';
                            let label = '예정';
                            if (doneMonths.has(month)) { cls = 'mt-bar-done'; label = '완료한 달'; }
                            else if (level === 'hold') { cls = 'mt-bar-hold'; label = '보류'; }
                            else if (key === dueKey && ['overdue', 'urgent', 'notice'].includes(level)) { cls = 'mt-bar-' + level; label = maintTimelineBadge(m); }
                            else if (isThisYear && month < thisMonth) { cls = 'mt-bar-past'; label = '지난 예정'; }
                            const tip = escapeHtml(JSON.stringify(Object.assign({ month: `${month}월 · ${label}` }, tipBase)));
                            bar = `<button type="button" class="mt-bar ${cls}" data-tip="${tip}" onclick="openMaintQuickMenu(event, '${idArg}')" aria-label="${escapeHtml(`${tipBase.name} ${month}월 ${label}`)}"></button>`;
                        }
                        const tick = (key === dueKey && dueDay && m.status !== '완료')
                            ? `<span class="mt-due-tick" style="--d:${((dueDay - 0.5) / monthDays).toFixed(3)}" aria-hidden="true"></span>` : '';
                        const dots = m._doneDates.filter(d => Number(d.slice(5, 7)) === month)
                            .map(d => `<span class="mt-done-dot" style="--d:${((Number(d.slice(8, 10)) - 0.5) / monthDays).toFixed(3)}" title="${escapeHtml(formatMaintDateDisplay(d))} 완료" aria-label="${escapeHtml(formatMaintDateDisplay(d))} 완료">${icon('check')}</span>`).join('');
                        // 차기 예정이 보는 연도 이후면 12월 칸 끝에 이어짐 표시
                        let next = '';
                        if (month === 12 && dueKey && Number(dueKey.slice(0, 4)) > maintenanceViewYear && m.status !== '완료') {
                            const [dy, dm] = dueKey.split('-').map(Number);
                            next = `<button type="button" class="mt-next-year" title="다음 예정 ${escapeHtml(formatMaintDateDisplay(m.nextDue))} · 누르면 ${dy}년으로 이동" aria-label="차기 예정 ${dy}년 ${dm}월, ${dy}년으로 이동" onclick="changeMaintenanceViewYear(${dy - maintenanceViewYear})">→ ${dy}년 ${String(dm).padStart(2, '0')}월</button>`;
                        }
                        return `<div class="mt-cell">${bar}${tick}${dots}${next}</div>`;
                    }).join('');
                    const badge = maintTimelineBadge(m);
                    const canComplete = m.status !== '완료';
                    const acked = ['overdue', 'urgent', 'notice'].includes(m._urgency.level) && m.ackFor && m.ackFor === m.nextDue;
                    const invBadge = m._invShort.length ? `<span class="mt-badge mt-badge-inv" title="${escapeHtml('재고 부족: ' + tipBase.inv)}">📦 부족</span> · ` : '';
                    return `<div class="mt-row mt-item${level === 'overdue' ? ' is-overdue' : ''}${level === 'hold' ? ' is-hold' : ''}" data-maint-id="${escapeHtml(m.id)}">
                        <div class="mt-label">
                            <div class="mt-label-text">
                                <button type="button" class="mt-item-name" onclick="openMaintenanceModal('${idArg}')" title="${escapeHtml(tipBase.name)}">${escapeHtml(tipBase.name)}</button>
                                <span class="mt-item-meta">${badge ? `<span class="mt-badge mt-badge-${level}">${escapeHtml(badge)}</span> · ` : ''}${invBadge}${escapeHtml(m.cycle || '주기 미정')}${acked ? ' · 인지 완료' : ''}</span>
                            </div>
                            ${canComplete ? `<button type="button" class="mt-complete-btn" onclick="openMaintenanceCompleteModal('${idArg}')" title="완료 처리" aria-label="${escapeHtml(tipBase.name + ' 완료 처리')}">완료</button>` : ''}
                        </div>
                        <div class="mt-months">${cells}</div>
                    </div>`;
                }).join('');
                return groupRow + rows;
            }).join('');

            const legend = `<div class="mt-legend" aria-hidden="true">
                <span><i class="mt-bar mt-bar-overdue"></i>지연</span><span><i class="mt-bar mt-bar-urgent"></i>임박</span>
                <span><i class="mt-bar mt-bar-notice"></i>인지 필요</span><span><i class="mt-bar mt-bar-planned"></i>예정</span>
                <span><i class="mt-bar mt-bar-hold"></i>보류</span><span><i class="mt-bar mt-bar-past"></i>지난 예정</span>
                <span><i class="mt-bar mt-bar-done"></i>완료한 달</span>
                <span><span class="mt-done-dot mt-done-dot-legend">${icon('check')}</span>완료일</span>
                <span><i class="mt-due-tick mt-due-tick-legend"></i>예정일</span>
                ${isThisYear ? '<span><i class="mt-today-legend"></i>오늘</span>' : ''}
            </div>`;

            return `<div class="maint-timeline-scroll" data-year="${maintenanceViewYear}"><div class="maint-timeline"${todayPos !== null ? ` style="--today:${todayPos.toFixed(4)}"` : ''}>
                ${head}${body}${todayPos !== null ? '<div class="mt-today-line" aria-hidden="true"></div>' : ''}
            </div></div>${legend}`;
        }

        // 다시 그린 뒤: 같은 연도면 보던 스크롤 위치를 되살리고, 처음이거나 연도가 바뀌면 이번 달 근처로 맞춤(올해일 때)
        function restoreMaintTimelineScroll() {
            const sc = document.querySelector('#maintenanceList .maint-timeline-scroll');
            if (!sc) return;
            sc.addEventListener('scroll', () => { maintTimelineScroll = { year: maintenanceViewYear, left: sc.scrollLeft, top: sc.scrollTop }; hideMaintTooltip(); }, { passive: true });
            if (maintTimelineScroll && maintTimelineScroll.year === maintenanceViewYear) {
                sc.scrollLeft = maintTimelineScroll.left;
                sc.scrollTop = maintTimelineScroll.top;
                return;
            }
            if (maintenanceViewYear !== new Date().getFullYear() || sc.scrollWidth <= sc.clientWidth) return;
            const cur = sc.querySelector('.mt-month-head.is-current');
            const label = sc.querySelector('.mt-head .mt-label');
            if (cur && label) sc.scrollLeft = Math.max(0, cur.offsetLeft - label.offsetWidth - cur.offsetWidth * 2);
        }

        // ---- 막대 툴팁 카드 ----
        let maintTooltipEl = null;
        function showMaintTooltip(bar) {
            let data;
            try { data = JSON.parse(bar.dataset.tip || '{}'); } catch (e) { return; }
            if (!maintTooltipEl) {
                maintTooltipEl = document.createElement('div');
                maintTooltipEl.className = 'mt-tooltip';
                maintTooltipEl.setAttribute('role', 'tooltip');
                document.body.appendChild(maintTooltipEl);
            }
            maintTooltipEl.innerHTML = `<div class="mt-tooltip-title">${escapeHtml(data.name)}</div>
                <div class="mt-tooltip-sub">${escapeHtml(data.equipment)} · ${escapeHtml(data.month)}</div>
                <dl><dt>차기 예정</dt><dd>${escapeHtml(data.due)}</dd><dt>최근 완료</dt><dd>${escapeHtml(data.done)}</dd><dt>주기</dt><dd>${escapeHtml(data.cycle)}</dd><dt>상태</dt><dd>${escapeHtml(data.status)}</dd>${data.inv ? `<dt>재고 부족</dt><dd>${escapeHtml(data.inv)}</dd>` : ''}</dl>`;
            maintTooltipEl.classList.add('open');
            const r = bar.getBoundingClientRect();
            const w = maintTooltipEl.offsetWidth, h = maintTooltipEl.offsetHeight;
            const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
            const top = r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8;
            maintTooltipEl.style.left = left + 'px';
            maintTooltipEl.style.top = top + 'px';
        }
        function hideMaintTooltip() { if (maintTooltipEl) maintTooltipEl.classList.remove('open'); }
        document.addEventListener('mouseover', (e) => { const bar = e.target.closest && e.target.closest('#maintenanceList .mt-bar[data-tip]'); if (bar) showMaintTooltip(bar); });
        document.addEventListener('mouseout', (e) => { if (e.target.closest && e.target.closest('#maintenanceList .mt-bar[data-tip]')) hideMaintTooltip(); });
        document.addEventListener('focusin', (e) => { if (e.target.matches && e.target.matches('#maintenanceList .mt-bar[data-tip]')) showMaintTooltip(e.target); });
        document.addEventListener('focusout', (e) => { if (e.target.matches && e.target.matches('#maintenanceList .mt-bar[data-tip]')) hideMaintTooltip(); });

        // ---- 막대 클릭 빠른 메뉴: [완료 처리] [수정] ----
        let maintQuickMenuEl = null;
        function openMaintQuickMenu(event, itemId) {
            event.stopPropagation();
            hideMaintTooltip();
            const m = maintenanceSchedule.find(x => x.id === itemId);
            if (!m) return;
            if (!maintQuickMenuEl) {
                maintQuickMenuEl = document.createElement('div');
                maintQuickMenuEl.className = 'mt-quick-menu';
                maintQuickMenuEl.setAttribute('role', 'menu');
                document.body.appendChild(maintQuickMenuEl);
            }
            const idArg = escapeForOnclickArg(itemId);
            // 카드의 "사전 인지 완료" 체크와 같은 값. 지연·임박·인지 필요 항목에만 보임
            const showAck = ['overdue', 'urgent', 'notice'].includes(getMaintenanceUrgency(m).level);
            const acked = m.ackFor && m.ackFor === m.nextDue;
            const ackBtn = showAck ? `<button type="button" role="menuitemcheckbox" aria-checked="${acked ? 'true' : 'false'}" onclick="closeMaintQuickMenu(); toggleMaintenanceAck('${idArg}')">${icon(acked ? 'x' : 'check')}${acked ? '사전 인지 취소' : '사전 인지 완료'}</button>` : '';
            maintQuickMenuEl.innerHTML = `<div class="mt-quick-menu-title">${escapeHtml(m.item || '(항목명 없음)')}</div>
                ${m.status !== '완료' ? `<button type="button" role="menuitem" onclick="closeMaintQuickMenu(); openMaintenanceCompleteModal('${idArg}')">${icon('check')}완료 처리</button>` : ''}
                ${ackBtn}
                <button type="button" role="menuitem" onclick="closeMaintQuickMenu(); openMaintenanceModal('${idArg}')">${icon('pencil')}수정</button>`;
            maintQuickMenuEl.classList.add('open');
            const r = event.currentTarget.getBoundingClientRect();
            const w = maintQuickMenuEl.offsetWidth, h = maintQuickMenuEl.offsetHeight;
            maintQuickMenuEl.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
            maintQuickMenuEl.style.top = (r.bottom + h + 8 > window.innerHeight ? r.top - h - 6 : r.bottom + 6) + 'px';
            const first = maintQuickMenuEl.querySelector('button');
            if (first) first.focus();
        }
        function closeMaintQuickMenu() { if (maintQuickMenuEl) maintQuickMenuEl.classList.remove('open'); }
        document.addEventListener('click', (e) => { if (maintQuickMenuEl && maintQuickMenuEl.classList.contains('open') && !maintQuickMenuEl.contains(e.target)) closeMaintQuickMenu(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMaintQuickMenu(); hideMaintTooltip(); } });
        window.addEventListener('scroll', () => { closeMaintQuickMenu(); hideMaintTooltip(); }, { passive: true });


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

        // 보고 있는 연도 안의 완료일 목록(오름차순). 예전 데이터(완료 이력 없이 lastDone만 있는 경우)도 인정함
        function getMaintenanceCompletionDatesInYear(m, year) {
            const prefix = year + '-';
            const dates = getMaintenanceCompletions(m).map(c => c && normalizeMaintDate(c.date)).filter(d => d.startsWith(prefix));
            // 수정 창에서 직접 적은 이전 완료일(2026.11.10 같은 점 형식 포함)도 이력에 없으면 함께 인정함
            const lastDone = normalizeMaintDate(m.lastDone);
            if (lastDone.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}$/.test(lastDone) && !dates.includes(lastDone)) dates.push(lastDone);
            return dates.sort();
        }

        // 카드에는 핵심 정보(항목명, 급한 정도·상태 배지, 예정월, 차기 점검, 최근 완료, 필요 재고)만 간결하게 보여주고,
        // SOP·메모 같은 상세 내용은 카드를 눌러 여는 수정 창에서 확인함. 설비 그룹 안에서 한 줄에 4장씩(화면이 좁으면 줄어듦) 배치
        function renderMaintenanceEquipmentGroup(equipmentName, items) {
            const cardsHtml = items.map(m => {
                const urgency = m._urgency;
                const acked = m.ackFor && m.ackFor === m.nextDue;
                // "인지 필요"는 사전 인지 완료를 체크하면 카드 강조를 끔 (지연·임박은 체크해도 그대로 강조)
                const noticeAcked = urgency.level === 'notice' && acked;
                const urgencyClass = noticeAcked ? ' maint-acked'
                    : (['overdue', 'urgent', 'notice'].includes(urgency.level) ? ` maint-${urgency.level}` : '');
                const doneDates = m._doneDates || [];
                const doneMonths = doneDates.map(d => parseInt(d.slice(5, 7), 10));
                const titleText = m.item ? escapeHtml(m.item) : '점검';
                const tooltip = escapeHtml([m.item || '점검', m.sop ? 'SOP: ' + m.sop : ''].filter(Boolean).join('\n'));
                const cardAttrs = `class="project-card maint-card${urgencyClass}" data-maint-id="${escapeHtml(m.id)}" onclick="openMaintenanceModal('${escapeForOnclickArg(m.id)}')"`;
                const monthsHtml = `<div class="maint-card-months">${renderOccurrenceMonthsHtml(m._occurrenceMonths, doneMonths)}</div>`;

                if (maintenanceViewMode === 'simple') {
                    return `
                <div ${cardAttrs}>
                    <div class="maint-card-title" title="${tooltip}">${titleText}</div>
                    ${monthsHtml}
                </div>
            `;
                }

                const badgeLabel = maintenanceUrgencyBadge(urgency);
                const lastDoneInYear = doneDates.length ? doneDates[doneDates.length - 1] : '';
                const badges = [
                    badgeLabel ? `<span class="project-badge urgency-${urgency.level}${noticeAcked ? ' is-acked' : ''}">${badgeLabel}</span>` : '',
                    lastDoneInYear ? `<span class="project-badge status-완료" title="${escapeHtml(formatMaintDateDisplay(lastDoneInYear))} 완료">완료 ${escapeHtml(formatMaintDateDisplay(lastDoneInYear, true))}</span>` : '',
                    // "예정"은 기본 상태라 배지를 생략하고, 완료 배지가 이미 있으면 "완료" 상태 배지는 중복이라 생략
                    (m.status && m.status !== '예정' && !(m.status === '완료' && lastDoneInYear)) ? `<span class="project-badge status-${maintenanceStatusClass(m.status)}">${escapeHtml(m.status)}</span>` : ''
                ].filter(Boolean).join('');
                const showAck = ['overdue', 'urgent', 'notice'].includes(urgency.level);
                const cycleUnknown = m.cycle && !parseCycleIntervalMonths(m.cycle);
                const dueParts = [];
                if (isValidNextDue(m.nextDue)) {
                    const ddayText = (urgency.daysUntil !== null && m.status !== '완료' && !badgeLabel) ? ` (${formatDday(urgency.daysUntil)})` : '';
                    dueParts.push(`<b>차기</b> ${escapeHtml(formatMaintDateDisplay(m.nextDue))}${m.nextDue.length === 7 ? ' (날짜 미지정)' : ''}${ddayText}`);
                }
                if (m.cycle) dueParts.push(cycleUnknown
                    ? `<span class="maint-cycle-warning" title="주기 표현을 자동으로 인식하지 못해, 등록된 차기 점검월만 표시돼요. (&quot;3개월&quot;, &quot;격월&quot;, &quot;분기&quot;, &quot;반기&quot;, &quot;매년&quot; 등으로 적으면 반복월이 자동 계산됩니다)">⚠️ ${escapeHtml(m.cycle)} (주기 인식 불가)</span>`
                    : `${escapeHtml(m.cycle)} 주기`);

                return `
                <div ${cardAttrs}>
                    <div class="maint-card-title" title="${tooltip}">${titleText}</div>
                    ${badges ? `<div class="maint-card-badges">${badges}</div>` : ''}
                    ${monthsHtml}
                    ${dueParts.length ? `<div class="project-card-row">${dueParts.join(' · ')}</div>` : ''}
                    ${renderMaintenanceLastDoneRow(m)}
                    ${typeof renderMaintenanceInventoryRow === 'function' ? renderMaintenanceInventoryRow(m) : ''}
                    <div class="maint-card-foot" onclick="event.stopPropagation()">
                        ${showAck ? `
                        <label class="maint-ack-row" title="기안, 재고 확보 등 사전 준비를 마쳤으면 체크">
                            <input type="checkbox" ${acked ? 'checked' : ''} onchange="toggleMaintenanceAck('${escapeForOnclickArg(m.id)}')">
                            사전 인지 완료
                        </label>` : '<span></span>'}
                        <button class="result-action-btn" onclick="openMaintenanceCompleteModal('${escapeForOnclickArg(m.id)}')">완료 처리</button>
                    </div>
                </div>
            `;
            }).join('');

            // 타임라인과 같은 접기 상태(maintTimelineCollapsed)를 씀. 접으면 머리줄만 남기고 지연 항목이 있으면 빨간 점으로 알림
            const collapsed = maintTimelineCollapsed.has(equipmentName);
            const hasOverdue = items.some(m => m._urgency.level === 'overdue' && m.status !== '보류');
            return `
                <div class="maintenance-equipment-group${collapsed ? ' is-collapsed' : ''}" data-group="${escapeHtml(equipmentName)}" style="margin-bottom:24px;">
                    <div class="result-date maint-group-title">
                        <button type="button" class="maint-group-toggle${hasOverdue ? ' has-overdue' : ''}" onclick="toggleMaintGroup('${escapeForOnclickArg(equipmentName)}')" aria-expanded="${collapsed ? 'false' : 'true'}">
                            ${icon('chevron-right')}<span class="maint-group-name">🔧 ${escapeHtml(equipmentName)}</span><span class="maint-group-count">${items.length}</span>
                        </button>
                        ${maintEquipmentHistoryBtn(equipmentName, 'result-action-btn')}
                    </div>
                    ${collapsed ? '' : `<div class="maint-card-grid">${cardsHtml}</div>`}
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
            syncMaintenanceLayoutButtons();

            if (maintenanceSchedule.length === 0) {
                renderMaintenanceQuickChips(null);
                container.innerHTML = '<div class="no-projects">' + emptyStateHtml('wrench', '아직 등록된 정비계획이 없습니다', '설비와 주기를 적어 두면 해마다 예정월이 자동으로 계산되고, 급한 정비는 오늘 요약에도 나타납니다.', { label: '새 일정 추가', icon: 'plus', onclick: 'openMaintenanceModal(null)' }) + '</div>';
                return;
            }

            const isCurrentYear = maintenanceViewYear === new Date().getFullYear();

            // 1단계: 보는 연도에 나올 항목(상태·검색과 무관). 빠른 보기 칩 숫자는 이 기준으로 셈
            const yearItems = [];
            for (const m of maintenanceSchedule) {
                const doneDates = getMaintenanceCompletionDatesInYear(m, maintenanceViewYear);
                const isUndated = !isValidNextDue(m.nextDue);
                const months = isUndated ? [] : getMaintenanceOccurrenceMonths(m, maintenanceViewYear);
                // 예정월이 없는 해라도 그 해에 완료한 기록이 있으면 표시 (완료 후 차기 일정이 다음 해 이후로 넘어간 경우)
                const visible = isUndated ? (isCurrentYear || doneDates.length > 0) : (months.length > 0 || doneDates.length > 0);
                if (visible) yearItems.push(Object.assign({}, m, { _occurrenceMonths: months, _doneDates: doneDates, _urgency: getMaintenanceUrgency(m), _invShort: getMaintenanceInventoryShortages(m) }));
            }

            const quickKinds = ['overdue', 'urgent', 'thisMonth', 'invShort'];
            renderMaintenanceQuickChips(Object.fromEntries(quickKinds.map(k => [k, yearItems.filter(m => maintQuickMatch(m, k)).length])));

            // 2단계: 상태 필터·빠른 보기·검색어로 거름.
            // 주기가 있는 항목은 완료 처리하면 바로 다음 주기("예정")로 넘어가므로, 상태만 보면 "완료" 목록에서
            // 빠져 버림. 보고 있는 연도에 완료 기록이 있으면 "완료" 필터에도 나오게 함
            const searchTerms = maintenanceSearchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
            const visibleItems = yearItems.filter(m => {
                if (maintenanceStatusFilter === '완료') { if (m.status !== '완료' && m._doneDates.length === 0) return false; }
                else if (maintenanceStatusFilter !== '전체' && m.status !== maintenanceStatusFilter) return false;
                return maintQuickMatch(m, maintQuickFilter) && maintSearchMatch(m, searchTerms);
            });

            if (visibleItems.length === 0) {
                if (yearItems.length > 0 && (searchTerms.length || maintQuickFilter)) {
                    const quickLabel = { overdue: '지연된', urgent: '임박한', thisMonth: '이번 달 예정인', invShort: '재고가 부족한' }[maintQuickFilter] || '';
                    const title = searchTerms.length
                        ? `"${maintenanceSearchQuery.trim()}"에 맞는 ${quickLabel ? quickLabel + ' ' : ''}정비계획이 없습니다`
                        : `${maintenanceViewYear}년에 ${quickLabel} 정비가 없습니다`;
                    container.innerHTML = `<div class="no-projects">${emptyStateHtml('wrench', title, '검색어나 빠른 보기를 지우면 전체 목록이 다시 보입니다.', { label: '조건 지우기', icon: 'x', onclick: 'clearMaintenanceFilters()' })}</div>`;
                    return;
                }
                container.innerHTML = `<div class="no-projects">${emptyStateHtml('wrench', `${maintenanceViewYear}년에는 ${maintenanceStatusFilter === '전체' ? '' : '"' + maintenanceStatusFilter + '" 상태의 '}정비계획이 없습니다`, '설비와 주기를 적어 두면 해마다 예정월이 자동으로 계산됩니다.', maintenanceStatusFilter === '전체' ? { label: '새 일정 추가', icon: 'plus', onclick: 'openMaintenanceModal(null)' } : null)}</div>`;
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

            if (typeof closeMaintQuickMenu === 'function') { closeMaintQuickMenu(); hideMaintTooltip(); }
            // 설비가 2개 이상일 때만 [모두 펼치기/접기] (두 보기 공통)
            const groupActions = equipmentNames.length > 1 ? `<div class="maint-list-actions">
                    <button type="button" class="mt-text-btn" onclick="setAllMaintGroups(false)">모두 펼치기</button>
                    <button type="button" class="mt-text-btn" onclick="setAllMaintGroups(true)">모두 접기</button>
                </div>` : '';
            container.innerHTML = groupActions + (maintenanceLayout === 'timeline'
                ? renderMaintenanceTimeline(equipmentNames, groups)
                : equipmentNames.map(name => renderMaintenanceEquipmentGroup(name, groups[name])).join(''));
            if (maintenanceLayout === 'timeline') restoreMaintTimelineScroll();
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

        // 날짜 입력칸은 YYYY-MM-DD만 받으므로, 예전 월 단위 값은 칸을 비워두고 안내로 보여준 뒤
        // 날짜를 새로 고르지 않고 저장하면 그 월 값을 그대로 유지함
        let maintLegacyMonthNextDue = '';

        function setMaintNextDueInput(value) {
            const isMonthOnly = /^\d{4}-\d{2}$/.test(value || '');
            maintLegacyMonthNextDue = isMonthOnly ? value : '';
            document.getElementById('maintNextDueInput').value = isMonthOnly ? '' : (value || '');
            const hint = document.getElementById('maintNextDueLegacyHint');
            if (hint) {
                hint.style.display = isMonthOnly ? '' : 'none';
                hint.textContent = isMonthOnly ? `지금은 월 단위(${value})로만 정해져 있습니다. 날짜를 고르면 일 단위로 바뀌고, 그대로 저장하면 ${value}로 유지됩니다.` : '';
            }
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
                setMaintNextDueInput(m.nextDue);
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
                setMaintNextDueInput('');
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
            const lastDone = normalizeMaintDate(document.getElementById('maintLastDoneInput').value);
            const nextDue = document.getElementById('maintNextDueInput').value.trim() || maintLegacyMonthNextDue;
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
            if (typeof renderInventory === 'function') renderInventory(); // 재고 카드의 연동 항목 이름·차기 일정
        }

        function deleteMaintenanceItem() {
            if (!checkEditPermission()) return;
            if (!editingMaintenanceId) return;
            confirmModal('이 정비계획 항목을 삭제하시겠습니까?', () => {
                const deletedId = editingMaintenanceId;
                maintenanceSchedule = maintenanceSchedule.filter(m => m.id !== deletedId);
                safeSetItem('maintenanceSchedule', JSON.stringify(maintenanceSchedule));
                queueSync();
                closeMaintenanceModal();
                renderMaintenanceSchedule();
                if (typeof removeInventoryMaintLinks === 'function') removeInventoryMaintLinks(deletedId);
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

        // 입력 순서와 무관하게 완료 이력·이전 완료일 중 가장 최근 날짜를 보여줌. 날짜 형식이 아닌 예전 값은 그대로 표시
        function renderMaintenanceLastDoneRow(m) {
            const count = getMaintenanceCompletions(m).length;
            const latest = getLatestMaintenanceDoneDate(m);
            const text = latest ? formatMaintDateDisplay(latest) : String(m.lastDone || '').trim();
            if (!text) return '';
            return `<div class="project-card-row"><b>이전 완료</b> ${escapeHtml(text)}${count > 0 ? ` <span class="maint-completion-count">(누적 ${count}회)</span>` : ''}</div>`;
        }

        // "YYYY-MM-DD" 완료일 + 주기(개월) → 다음 예정월 "YYYY-MM". 주기를 알아들을 수 없으면 null
        // 완료일 + 주기(개월)의 같은 날짜. 그 달에 없는 날(예: 31일)이면 그 달 마지막 날로 맞춤
        function computeNextDueFromCompletion(dateStr, cycleText) {
            const interval = parseCycleIntervalMonths(cycleText);
            if (!interval || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null;
            const [y, mo, d] = dateStr.split('-').map(Number);
            const idx = y * 12 + (mo - 1) + interval;
            const year = Math.floor(idx / 12), monthIndex = idx % 12;
            const lastDay = new Date(year, monthIndex + 1, 0).getDate();
            return formatDate(new Date(year, monthIndex, Math.min(d, lastDay)));
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
                        <span class="maint-completion-date">${escapeHtml(formatMaintDateDisplay(c.date))}</span>
                        <span class="maint-completion-note">${escapeHtml(c.note || '')}</span>
                        <button type="button" class="category-tag-delete" onclick="deleteMaintenanceCompletion('${m.id}', '${c.id}')" aria-label="이 완료 이력 삭제">${icon('x', 'ui-icon-em')}</button>
                    </div>`).join('');
            listEl.innerHTML = itemsHtml + `<button type="button" class="result-action-btn" style="margin-top:8px;" onclick="openMaintenanceCompleteModal('${m.id}')">완료 기록 추가</button>`;
        }

        function refreshMaintenanceCompleteHint() {
            const hintEl = document.getElementById('maintCompleteNextDueHint');
            const m = maintenanceSchedule.find(x => x.id === completingMaintenanceId);
            if (!hintEl || !m) return;
            const date = document.getElementById('maintCompleteDateInput').value;
            const nextDue = computeNextDueFromCompletion(date, m.cycle);
            hintEl.textContent = nextDue
                ? `주기(${m.cycle})에 따라 차기 점검 예정이 ${formatMaintDateDisplay(nextDue)}로 자동 변경되고 상태는 "예정"이 됩니다.`
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
            if (typeof renderMaintCompleteInventory === 'function') renderMaintCompleteInventory(m);
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
            const completionId = 'mc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            m.completions.push({ id: completionId, date, note, loggedAt: new Date().toISOString() });
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
            // 연동된 재고 차감 (재고 쪽 저장·다시 그리기는 함수 안에서 함). 창을 닫기 전에 체크 상태를 읽어야 함
            const inventoryMsg = typeof applyMaintCompleteInventory === 'function' ? applyMaintCompleteInventory(m, date, completionId) : '';
            queueSync();
            closeMaintenanceCompleteModal();

            // 정비계획 수정 모달이 같은 항목으로 열려 있으면, 거기서 "저장"을 눌러도 방금 바뀐 값이
            // 예전 값으로 되돌아가지 않도록 입력칸도 최신 값으로 맞춰줌
            if (editingMaintenanceId === m.id) {
                pickMaintenanceStatus(m.status);
                document.getElementById('maintLastDoneInput').value = m.lastDone || '';
                setMaintNextDueInput(m.nextDue);
                renderMaintenanceCompletionHistory(m);
            }

            renderMaintenanceSchedule();
            highlightMaintenanceCard(m.id);
            renderCalendar();
            if (selectedDate === date) renderRecordForm();
            if (typeof renderInventory === 'function') renderInventory(); // 재고 카드의 차기 일정
            const baseMsg = logToRecord && category ? `완료 처리했습니다 (${formatMaintDateDisplay(date)} 활동기록 [${category}]에도 기록됨)` : '완료 처리했습니다';
            // 재고가 모자라 출고를 건너뛴 품목이 있으면 놓치지 않게 경고 색으로 보여줌
            const inventorySkipped = inventoryMsg.includes('출고 안 함');
            showAppToast(inventoryMsg ? `${baseMsg} · ${inventoryMsg}` : baseMsg, inventorySkipped ? 'error' : 'success');
        }

        // 완료 처리 후 급한 순서 정렬로 카드 위치가 바뀌어도 놓치지 않도록, 그 카드로 스크롤하고 잠깐 강조함
        function highlightMaintenanceCard(itemId) {
            const card = Array.from(document.querySelectorAll('#maintenanceList .maint-card, #maintenanceList .mt-item')).find(el => el.dataset.maintId === itemId);
            if (!card) return;
            const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            card.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
            card.classList.remove('maint-just-done');
            void card.offsetWidth;
            card.classList.add('maint-just-done');
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
