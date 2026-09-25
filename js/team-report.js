        // ===== 팀 보고 (개인 카테고리 기록과 별개로, 지정한 제출 대상들에게 주간 보고를 따로 제출) =====
        // 서버가 로그인/불러오기 응답에 실어주는 teamReportRole(없으면 예전 isTeamLead 값)을 이 계정의
        // 팀 보고 계층 역할로 계산함. Code.gs의 getEffectiveTeamReportRole과 규칙이 동일해야 함
        function computeEffectiveTeamReportRole(data) {
            if (data && (data.teamReportRole === 'member' || data.teamReportRole === 'partLead' || data.teamReportRole === 'teamLead')) {
                return data.teamReportRole;
            }
            if (data && data.isTeamLead) return 'teamLead';
            return '';
        }

        // 주는 항상 월요일을 기준일(weekStart)로 다룸
        function getMondayOfWeek(date) {
            const d = new Date(date);
            const day = d.getDay(); // 0=일 ~ 6=토
            d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
            d.setHours(0, 0, 0, 0);
            return d;
        }

        function addDaysToDateStr(dateStr, days) {
            const d = new Date(dateStr + 'T00:00:00');
            d.setDate(d.getDate() + days);
            return formatDate(d);
        }

        // 일정을 드래그로 옮길 때, 기간(며칠짜리)을 유지한 채 시작일만 바꾸기 위해 씀
        function daysBetweenDateStrs(startStr, endStr) {
            const start = new Date(startStr + 'T00:00:00');
            const end = new Date(endStr + 'T00:00:00');
            return Math.round((end - start) / 86400000);
        }

        // 일정 반복 등록("매월 반복")에서 씀. 31일처럼 다음 달에 없는 날짜는 Date가 자동으로
        // 그 다음 달로 넘겨버리므로(예: 1/31 + 1개월 → 3/3), 그런 경우엔 그 달의 마지막 날로 보정함
        function addMonthsToDateStr(dateStr, months) {
            const d = new Date(dateStr + 'T00:00:00');
            const targetMonth = d.getMonth() + months;
            const originalDay = d.getDate();
            d.setDate(1);
            d.setMonth(targetMonth);
            const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
            d.setDate(Math.min(originalDay, lastDayOfTargetMonth));
            return formatDate(d);
        }

        function isWeekendDateStr(dateStr) {
            const day = new Date(dateStr + 'T00:00:00').getDay();
            return day === 0 || day === 6;
        }

        // "9.8 ~ 9.14 (이번주)"처럼, 지금 실제 주와의 관계를 함께 보여주는 주 라벨
        function getTeamReportWeekLabel(weekStart) {
            if (!weekStart) return '';
            const start = new Date(weekStart + 'T00:00:00');
            const end = new Date(addDaysToDateStr(weekStart, 6) + 'T00:00:00');
            const fmt = d => `${d.getMonth() + 1}.${d.getDate()}`;
            const thisMonday = formatDate(getMondayOfWeek(new Date()));
            let tag = '';
            if (weekStart === thisMonday) tag = ' (이번주)';
            else if (weekStart === addDaysToDateStr(thisMonday, -7)) tag = ' (저번주)';
            else if (weekStart === addDaysToDateStr(thisMonday, 7)) tag = ' (다음주)';
            return `${fmt(start)} ~ ${fmt(end)}${tag}`;
        }

        function renderTeamReportWeekLabel() {
            const el = document.getElementById('teamReportWeekLabel');
            if (el) el.textContent = getTeamReportWeekLabel(teamReportCurrentWeekStart);

            const thisMonday = formatDate(getMondayOfWeek(new Date()));
            const currentBtn = document.getElementById('teamReportWeekBtnCurrent');
            if (currentBtn) currentBtn.classList.toggle('selected', teamReportCurrentWeekStart === thisMonday);
        }

        // skipAutoLoad: fillTeamReportWithDailySummary처럼 호출하는 쪽에서 직접 loadTeamReportForWeek를
        // 호출해 결과를 이어붙일 때, 여기서도 같은 주를 또 불러오면 두 요청이 경쟁해서 방금 채운
        // 내용이 뒤늦게 도착한 서버 응답으로 덮어써질 수 있음 - 그런 경우 자동 로드를 건너뜀
        async function initTeamReportTab(skipAutoLoad) {
            if (!teamReportCurrentWeekStart) {
                teamReportCurrentWeekStart = formatDate(getMondayOfWeek(new Date()));
            }

            // 팀장은 보고를 받는 입장이라 제출할 일이 없으므로, 제출 폼과 내 제출 내역은 숨기고
            // "나에게 온 보고"만 보여줌
            const isTeamLeadRole = currentUserTeamReportRole === 'teamLead';
            const submitSection = document.getElementById('teamReportSubmitSection');
            const historySection = document.getElementById('myTeamReportHistorySection');
            if (submitSection) submitSection.style.display = isTeamLeadRole ? 'none' : '';
            if (historySection) historySection.style.display = isTeamLeadRole ? 'none' : '';

            if (!isTeamLeadRole) {
                renderTeamReportWeekLabel();
                await loadTeamReportMemberList();
                if (!skipAutoLoad) loadTeamReportForWeek(teamReportCurrentWeekStart);
                loadMyTeamReportHistory();
            }
            loadTeamReportInbox();
            loadTeamReportPendingStatus();
        }

        // [팀 보고] "제출 대상" 후보 목록을 불러옴. 내가 팀원이면 파트장+팀장, 파트장이면 팀장만 후보로
        // 내려오고(서버 쪽 규칙, filterTeamReportTargetsByRole 참고), 팀장/미지정이면 전체 인원이 내려옴
        async function loadTeamReportMemberList() {
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'getTeamReportMemberList',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    teamReportMemberList = Array.isArray(data.members) ? data.members : [];
                    // 역할이 바뀌어 더 이상 후보에 없는 사람은 선택에서도 빠짐
                    teamReportSelectedTargets = teamReportSelectedTargets.filter(id => teamReportMemberList.some(m => m.employeeId === id));
                    renderTeamReportTargetChips();
                }
            } catch (err) {
                console.error('팀 보고 대상 목록 불러오기 오류:', err);
            }
        }

        // [팀 보고] "제출 대상" 여러 명을 토글 버튼(칩)으로 고를 수 있게 그려줌
        function renderTeamReportTargetChips() {
            const container = document.getElementById('teamReportTargetChips');
            if (!container) return;

            if (teamReportMemberList.length === 0) {
                container.innerHTML = '<p style="color:#999; font-size:13px;">선택 가능한 제출 대상이 없습니다. 관리자에게 역할 지정을 요청해주세요.</p>';
                updateTeamReportIntroText();
                return;
            }

            container.innerHTML = teamReportMemberList.map(m => {
                const selected = teamReportSelectedTargets.includes(m.employeeId);
                const roleIcon = m.role === 'teamLead' ? '👑 ' : (m.role === 'partLead' ? '🔹 ' : '');
                return `<button type="button" class="quick-preset-btn${selected ? ' selected' : ''}" onclick="toggleTeamReportTarget('${m.employeeId}')">${roleIcon}${escapeHtml(m.name || m.employeeId)}</button>`;
            }).join('');
            updateTeamReportIntroText();
        }

        function toggleTeamReportTarget(employeeId) {
            const idx = teamReportSelectedTargets.indexOf(employeeId);
            if (idx === -1) teamReportSelectedTargets.push(employeeId);
            else teamReportSelectedTargets.splice(idx, 1);
            renderTeamReportTargetChips();
        }

        // 상단 안내 문구의 "OOO님께 보이며"를 지금 선택된 제출 대상 이름(들)으로 갱신
        function updateTeamReportIntroText() {
            const label = document.getElementById('teamReportTargetNameLabel');
            if (!label) return;
            if (teamReportSelectedTargets.length === 0) {
                label.textContent = '-';
                return;
            }
            const names = teamReportSelectedTargets.map(id => {
                const m = teamReportMemberList.find(mm => mm.employeeId === id);
                return m ? (m.name || m.employeeId) : id;
            });
            label.textContent = names.join(', ');
        }

        // ◀ 이전주 / 다음주 ▶ 버튼: 지금 보고 있는 주 기준으로 한 주씩 계속 이동해서, 몇 주 전이든
        // 몇 주 후든 자유롭게 오갈 수 있음
        function jumpTeamReportWeek(offsetWeeks) {
            loadTeamReportForWeek(addDaysToDateStr(teamReportCurrentWeekStart, offsetWeeks * 7));
        }

        // "이번주로" 버튼: 지금 보고 있는 주와 무관하게 실제 오늘이 속한 주로 바로 돌아감
        function jumpTeamReportWeekToToday() {
            loadTeamReportForWeek(formatDate(getMondayOfWeek(new Date())));
        }

        // 한 줄(카테고리/날짜/내용)을 이번주 한 일 / 다음주 할 일 목록에 추가하고 화면에 그림
        function createTeamReportRow(section, existing) {
            // "다음주 할 일" 항목은 기본 날짜도 다음 주로 잡아줌 (지금 보고 있는 주가 기준)
            const defaultDate = section === 'nextWeek' ? addDaysToDateStr(teamReportCurrentWeekStart, 7) : teamReportCurrentWeekStart;
            const row = {
                id: 'r' + (++teamReportRowIdCounter),
                category: (existing && existing.category) || (categories[0] || ''),
                date: (existing && existing.date) || defaultDate,
                content: (existing && existing.content) || ''
            };
            teamReportRows[section].push(row);
            return row;
        }

        function addTeamReportRow(section) {
            createTeamReportRow(section);
            renderTeamReportRows(section);
        }

        function removeTeamReportRow(section, rowId) {
            teamReportRows[section] = teamReportRows[section].filter(r => r.id !== rowId);
            renderTeamReportRows(section);
        }

        function updateTeamReportRowField(section, rowId, field, value) {
            const row = teamReportRows[section].find(r => r.id === rowId);
            if (row) row[field] = value;
        }

        // 카테고리를 바꾸면 "이전 기록 불러오기" 버튼이 보일지도 달라지므로, 필드 갱신 후 다시 그림
        function updateTeamReportRowFieldAndRerender(section, rowId, field, value) {
            updateTeamReportRowField(section, rowId, field, value);
            renderTeamReportRows(section);
        }

        // 지난주 같은 카테고리로 적어뒀던 내용을 지금 줄에 그대로 불러옴 (내용이 비어있을 때만 버튼이 보임)
        function loadPreviousTeamReportContent(section, rowId) {
            const row = teamReportRows[section].find(r => r.id === rowId);
            if (!row) return;
            const prevItems = (teamReportPreviousWeekData && teamReportPreviousWeekData[section]) || [];
            const matches = prevItems.filter(it => it.category === row.category);
            if (matches.length === 0) return;
            row.content = matches.map(it => it.content).join('\n');
            renderTeamReportRows(section);
        }

        function renderTeamReportRows(section) {
            const containerId = section === 'thisWeek' ? 'teamReportThisWeekRows' : 'teamReportNextWeekRows';
            const container = document.getElementById(containerId);
            if (!container) return;
            const rows = teamReportRows[section];

            if (rows.length === 0) {
                container.innerHTML = '<p style="color:#999; font-size:13px; padding:4px 0 8px;">➕ 항목 추가 버튼을 눌러 작성해주세요.</p>';
                return;
            }

            const prevItems = (teamReportPreviousWeekData && teamReportPreviousWeekData[section]) || [];

            container.innerHTML = rows.map(row => {
                // 보관한 카테고리로 채워진 줄이면 선택지에서 사라져 엉뚱한 카테고리로 보이지 않도록 그 값도 함께 넣어줌
                const rowCategoryOptions = (row.category && !categories.includes(row.category)) ? categories.concat(row.category) : categories;
                const options = rowCategoryOptions.map(c => `<option value="${escapeHtml(c)}" ${c === row.category ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
                const hasPrev = !row.content && prevItems.some(it => it.category === row.category);
                const prevBtn = hasPrev
                    ? `<button type="button" class="category-prev-btn" onclick="loadPreviousTeamReportContent('${section}','${row.id}')" title="지난주 같은 카테고리에 적었던 내용 불러오기">↓ 이전 기록</button>`
                    : '';
                return `
                    <div class="team-report-row" data-row-id="${row.id}">
                        <select class="category-input" onchange="updateTeamReportRowFieldAndRerender('${section}','${row.id}','category',this.value)">${options}</select>
                        <input type="date" class="category-input" value="${row.date}" onchange="updateTeamReportRowField('${section}','${row.id}','date',this.value)">
                        <div class="team-report-row-content-wrap">
                            <textarea class="category-input team-report-row-content" rows="1" placeholder="내용을 입력하세요" oninput="updateTeamReportRowField('${section}','${row.id}','content',this.value)">${escapeHtml(row.content)}</textarea>
                            ${prevBtn}
                        </div>
                        <button type="button" class="admin-action-btn danger" onclick="removeTeamReportRow('${section}','${row.id}')" title="이 항목 삭제">✕</button>
                    </div>
                `;
            }).join('');
        }

        // "AI 일일 업무 요약"에서 만든 요약을 [팀 보고] 탭의 "이번주 한 일"에 새 항목으로 추가해줌
        // (제출은 아직 안 함, 사용자가 확인/수정 후 직접 제출 버튼을 눌러야 함)
        async function fillTeamReportWithDailySummary() {
            const dateStr = document.getElementById('dailySummaryDate').value;
            const summaryText = document.getElementById('dailySummaryResultTextarea').value.trim();
            if (!dateStr || !summaryText) return;

            const weekStart = formatDate(getMondayOfWeek(new Date(dateStr + 'T00:00:00')));
            switchTab('teamReport', { skipTeamReportLoad: true });
            await loadTeamReportMemberList();
            await loadTeamReportForWeek(weekStart);

            createTeamReportRow('thisWeek', { category: categories[0] || '', date: dateStr, content: summaryText });
            renderTeamReportRows('thisWeek');
        }

        // 지금 보고 있는 주의 바로 전 주 데이터를 받아와 캐시해둠. (1) 내용이 비어있는 줄에 뜨는
        // "이전 기록 불러오기" 버튼, (2) 이번 주가 완전히 비어있을 때 지난주 "다음주 할 일"을
        // 이번주 "한 일"로 자동 이월하는 데 씀
        async function loadTeamReportPreviousWeekData(weekStart) {
            teamReportPreviousWeekData = { thisWeek: [], nextWeek: [] };
            const prevWeekStart = addDaysToDateStr(weekStart, -7);
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'getMyTeamWeeklyReport',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash,
                        weekStart: prevWeekStart
                    })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    teamReportPreviousWeekData = {
                        thisWeek: Array.isArray(data.thisWeek) ? data.thisWeek : [],
                        nextWeek: Array.isArray(data.nextWeek) ? data.nextWeek : []
                    };
                }
            } catch (err) {
                console.error('지난주 팀 보고 불러오기 오류:', err);
            }
        }

        async function loadTeamReportForWeek(weekStart) {
            teamReportCurrentWeekStart = weekStart;
            renderTeamReportWeekLabel();

            const indicator = document.getElementById('teamReportSubmittedIndicator');
            const statusEl = document.getElementById('teamReportStatus');
            if (!weekStart) return;

            teamReportRows.thisWeek = [];
            teamReportRows.nextWeek = [];
            renderTeamReportRows('thisWeek');
            renderTeamReportRows('nextWeek');
            indicator.style.display = 'none';
            statusEl.textContent = '☁️ 불러오는 중...';
            statusEl.className = 'ai-status';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'getMyTeamWeeklyReport',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash,
                        weekStart: weekStart
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    (data.thisWeek || []).forEach(item => createTeamReportRow('thisWeek', item));
                    (data.nextWeek || []).forEach(item => createTeamReportRow('nextWeek', item));

                    teamReportSelectedTargets = (data.targetEmployeeIds && data.targetEmployeeIds.length)
                        ? data.targetEmployeeIds.slice()
                        : teamReportLastTargets.slice();
                    renderTeamReportTargetChips();

                    await loadTeamReportPreviousWeekData(weekStart);

                    // 이번 주가 완전히 비어있고(아직 아무것도 안 썼고) 지난주에 적어둔 "다음주 할 일"이
                    // 있으면, 이번주 "한 일"에 초안으로 자동으로 옮겨줌 (제출은 여전히 직접 눌러야 함)
                    if (teamReportRows.thisWeek.length === 0 && teamReportRows.nextWeek.length === 0
                        && teamReportPreviousWeekData.nextWeek.length > 0) {
                        teamReportPreviousWeekData.nextWeek.forEach(item => createTeamReportRow('thisWeek', item));
                    }

                    renderTeamReportRows('thisWeek');
                    renderTeamReportRows('nextWeek');

                    if (data.submittedAt) {
                        indicator.style.display = '';
                        indicator.textContent = `✓ ${formatDateTimeKo(data.submittedAt)} 제출됨`;
                    }
                    statusEl.textContent = '';
                    statusEl.className = 'ai-status';
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '불러오기에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('팀 보고 불러오기 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            }
        }

        async function submitTeamReport() {
            if (!checkEditPermission()) return;
            const weekStart = teamReportCurrentWeekStart;
            const indicator = document.getElementById('teamReportSubmittedIndicator');
            const statusEl = document.getElementById('teamReportStatus');

            if (!weekStart) return;
            if (teamReportSelectedTargets.length === 0) {
                statusEl.textContent = '⚠️ 제출 대상을 한 명 이상 선택해주세요';
                statusEl.className = 'ai-status error';
                return;
            }

            const sanitizeRows = rows => rows
                .map(r => ({ category: (r.category || '').trim(), date: (r.date || '').trim(), content: (r.content || '').trim() }))
                .filter(r => r.content); // 내용 없는 빈 줄은 제출하지 않음

            statusEl.textContent = '☁️ 제출하는 중...';
            statusEl.className = 'ai-status';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'submitTeamWeeklyReport',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash,
                        weekStart: weekStart,
                        targetEmployeeIds: teamReportSelectedTargets,
                        thisWeek: sanitizeRows(teamReportRows.thisWeek),
                        nextWeek: sanitizeRows(teamReportRows.nextWeek)
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    statusEl.textContent = '✅ 제출되었습니다';
                    statusEl.className = 'ai-status success';
                    indicator.style.display = '';
                    indicator.textContent = `✓ ${formatDateTimeKo(data.submittedAt)} 제출됨`;
                    teamReportLastTargets = teamReportSelectedTargets.slice();
                    loadMyTeamReportHistory();
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '제출에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('팀 보고 제출 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            }
        }

        // 이번주 한 일 / 다음주 할 일 목록을 "· [카테고리] 날짜 내용" 줄들로 그려주는 공용 렌더러
        // (나의 제출 내역, 나에게 온 보고 두 곳에서 같이 씀)
        function renderTeamReportItemsHtml(title, items) {
            if (!items || items.length === 0) return '';
            return `
                <div style="margin-bottom:6px;">
                    <div style="font-size:12.5px; color:#667eea; font-weight:600;">${title}</div>
                    ${items.map(it => `<div style="font-size:13.5px; padding-left:6px;">· [${escapeHtml(it.category)}] ${escapeHtml(it.date)} ${escapeHtml(it.content)}</div>`).join('')}
                </div>
            `;
        }

        // [팀 보고] 탭에서 "내가 언제, 누구에게, 뭘 제출했는지" 본인 제출 이력을 최신순으로 보여줌
        let myTeamReportHistoryItems = []; // 마지막으로 불러온 목록 (펼치기/접기 시 재요청 없이 다시 그리기 위해 캐시)
        let expandedTeamReportHistoryWeeks = new Set(); // 지금 펼쳐져 있는 항목의 weekStart 목록

        async function loadMyTeamReportHistory() {
            const statusEl = document.getElementById('myTeamReportHistoryStatus');
            const listEl = document.getElementById('myTeamReportHistoryList');
            if (!statusEl || !listEl) return;

            // 월별 필터를 아직 아무것도 고르지 않은 상태라면(=처음 열었을 때) 이번 달로 기본 설정해줌
            const monthInput = document.getElementById('myTeamReportHistoryMonthFilter');
            if (monthInput && !monthInput.value) {
                monthInput.value = formatDate(new Date()).slice(0, 7);
            }

            statusEl.textContent = '☁️ 불러오는 중...';
            statusEl.className = 'ai-status';
            listEl.innerHTML = '';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'getMyTeamWeeklyReportHistory',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    myTeamReportHistoryItems = Array.isArray(data.items) ? data.items : [];
                    statusEl.textContent = '';
                    statusEl.className = 'ai-status';
                    renderMyTeamReportHistoryList();
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '불러오기에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('내 팀 보고 내역 불러오기 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            }
        }

        // 항목이 늘어날수록 내용이 줄줄이 쌓여 보이지 않도록, 평소엔 날짜/제출 대상만 보이는
        // 박스로 접어두고 클릭했을 때만 상세 내용(한 일/할 일)을 펼쳐서 보여줌 (한 줄에 3개씩 카드로 배치됨)
        function renderMyTeamReportHistoryList() {
            const listEl = document.getElementById('myTeamReportHistoryList');
            if (!listEl) return;

            if (myTeamReportHistoryItems.length === 0) {
                listEl.innerHTML = '<p style="color:#999; text-align:center; padding:16px;">아직 제출한 보고가 없습니다.</p>';
                return;
            }

            const monthFilter = (document.getElementById('myTeamReportHistoryMonthFilter') || {}).value || '';
            const items = monthFilter
                ? myTeamReportHistoryItems.filter(item => (item.weekStart || '').slice(0, 7) === monthFilter)
                : myTeamReportHistoryItems;

            if (items.length === 0) {
                listEl.innerHTML = '<p style="color:#999; text-align:center; padding:16px;">이 달에 제출한 보고가 없습니다.</p>';
                return;
            }

            listEl.innerHTML = items.map(item => {
                const targetLabel = (item.targetNames && item.targetNames.length) ? item.targetNames.join(', ') : '-';
                const isOpen = expandedTeamReportHistoryWeeks.has(item.weekStart);
                return `
                <div class="team-report-history-item${isOpen ? ' open' : ''}">
                    <div class="team-report-history-summary" onclick="toggleTeamReportHistoryItem('${item.weekStart}')">
                        <div>
                            <span class="team-report-history-week">${escapeHtml(getTeamReportWeekLabel(item.weekStart))}</span>
                            <span class="team-report-history-target">→ ${escapeHtml(targetLabel)}님</span>
                        </div>
                        <span class="team-report-history-caret">${isOpen ? '▲' : '▼'}</span>
                    </div>
                    ${isOpen ? `
                        <div class="team-report-history-details">
                            ${renderTeamReportItemsHtml('✅ 이번주 한 일', item.thisWeek)}
                            ${renderTeamReportItemsHtml('📌 다음주 할 일', item.nextWeek)}
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
                                <span style="color:#999; font-size:12px;">제출 : ${escapeHtml(formatTeamReportSubmittedAt(item.submittedAt))}</span>
                                <button type="button" class="admin-action-btn danger" onclick="event.stopPropagation(); deleteMyTeamReport('${item.weekStart}')">🗑️ 삭제</button>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
            }).join('');
        }

        function toggleTeamReportHistoryItem(weekStart) {
            if (expandedTeamReportHistoryWeeks.has(weekStart)) expandedTeamReportHistoryWeeks.delete(weekStart);
            else expandedTeamReportHistoryWeeks.add(weekStart);
            renderMyTeamReportHistoryList();
        }

        function clearMyTeamReportHistoryMonthFilter() {
            const input = document.getElementById('myTeamReportHistoryMonthFilter');
            if (input) input.value = '';
            renderMyTeamReportHistoryList();
        }

        // "내 제출 내역"에서 실수로 제출한 건을 본인이 직접 지움 (브라우저 기본 confirm() 대신 앱 모달로 확인받음)
        let pendingDeleteTeamReportWeekStart = null;

        function deleteMyTeamReport(weekStart) {
            if (!checkEditPermission()) return;
            pendingDeleteTeamReportWeekStart = weekStart;
            document.getElementById('deleteTeamReportModalMsg').textContent = `${getTeamReportWeekLabel(weekStart)} 제출 내용을 삭제하시겠습니까? 되돌릴 수 없습니다.`;
            document.getElementById('deleteTeamReportModal').classList.add('active');
        }

        function closeDeleteTeamReportModal() {
            document.getElementById('deleteTeamReportModal').classList.remove('active');
            pendingDeleteTeamReportWeekStart = null;
        }

        async function confirmDeleteMyTeamReport() {
            const weekStart = pendingDeleteTeamReportWeekStart;
            closeDeleteTeamReportModal();
            if (!weekStart) return;

            const statusEl = document.getElementById('myTeamReportHistoryStatus');
            statusEl.textContent = '☁️ 삭제하는 중...';
            statusEl.className = 'ai-status';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'deleteTeamWeeklyReport',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash,
                        weekStart: weekStart
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    // 지운 주가 지금 위에서 보고 있는 주와 같으면, 작성 칸도 같이 비워서 화면을 맞춤
                    if (teamReportCurrentWeekStart === weekStart) {
                        loadTeamReportForWeek(weekStart);
                    }
                    loadMyTeamReportHistory();
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '삭제에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('내 팀 보고 삭제 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            }
        }

        // [팀 보고] "나에게 온 보고": 내가 제출 대상으로 지정된 모든 팀원의 보고를 최신순으로 보여줌
        let teamReportInboxItems = []; // 마지막으로 불러온 인박스 목록 (펼치기/필터 시 재요청 없이 다시 그리기 위해 캐시)
        let expandedTeamReportInboxKeys = new Set(); // 지금 펼쳐져 있는 항목의 "사번_주시작일" 목록

        function teamReportInboxItemKey(item) {
            return item.employeeId + '_' + item.weekStart;
        }

        async function loadTeamReportInbox() {
            const statusEl = document.getElementById('teamReportInboxStatus');
            const listEl = document.getElementById('teamReportInboxList');
            if (!statusEl || !listEl) return;

            // 월별 필터를 아직 아무것도 고르지 않은 상태라면(=처음 열었을 때) 이번 달로 기본 설정해줌
            const monthInput = document.getElementById('teamReportInboxMonthFilter');
            if (monthInput && !monthInput.value) {
                monthInput.value = formatDate(new Date()).slice(0, 7);
            }

            statusEl.textContent = '☁️ 불러오는 중...';
            statusEl.className = 'ai-status';
            listEl.innerHTML = '';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'getTeamReportInbox',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    teamReportInboxItems = Array.isArray(data.items) ? data.items : [];
                    statusEl.textContent = `✅ 총 ${teamReportInboxItems.length}건`;
                    statusEl.className = 'ai-status success';
                    renderTeamReportInboxList();
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '불러오기에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('받은 보고 불러오기 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            }
        }

        // 인원이 많은 팀장일수록 목록이 길어지므로, "나의 제출 내역"과 같은 방식으로 카드를
        // 접어두고(날짜/제출자만 표시) 클릭했을 때만 상세 내용을 펼쳐서 보여줌
        function renderTeamReportInboxList() {
            const listEl = document.getElementById('teamReportInboxList');
            if (!listEl) return;

            if (teamReportInboxItems.length === 0) {
                listEl.innerHTML = '<p style="color:#999; text-align:center; padding:16px;">나에게 제출된 보고가 없습니다.</p>';
                return;
            }

            const monthFilter = (document.getElementById('teamReportInboxMonthFilter') || {}).value || '';
            const items = monthFilter
                ? teamReportInboxItems.filter(item => (item.weekStart || '').slice(0, 7) === monthFilter)
                : teamReportInboxItems;

            if (items.length === 0) {
                listEl.innerHTML = '<p style="color:#999; text-align:center; padding:16px;">이 달에 제출된 보고가 없습니다.</p>';
                return;
            }

            listEl.innerHTML = items.map(item => {
                const key = teamReportInboxItemKey(item);
                const isOpen = expandedTeamReportInboxKeys.has(key);
                return `
                <div class="team-report-history-item${isOpen ? ' open' : ''}">
                    <div class="team-report-history-summary" onclick="toggleTeamReportInboxItem('${key}')">
                        <div>
                            <span class="team-report-history-week">${escapeHtml(item.name || item.employeeId)}</span>
                            <span class="team-report-history-target">${escapeHtml(getTeamReportWeekLabel(item.weekStart))}</span>
                        </div>
                        <span class="team-report-history-caret">${isOpen ? '▲' : '▼'}</span>
                    </div>
                    ${isOpen ? `
                        <div class="team-report-history-details">
                            <div style="color:#999; font-size:12px; margin-bottom:6px;">${escapeHtml(item.department || '')} · ${escapeHtml(item.employeeId)}</div>
                            ${renderTeamReportItemsHtml('✅ 이번주 한 일', item.thisWeek)}
                            ${renderTeamReportItemsHtml('📌 다음주 할 일', item.nextWeek)}
                            <div style="color:#999; font-size:12px; margin-top:4px;">제출 : ${escapeHtml(formatTeamReportSubmittedAt(item.submittedAt))}</div>
                        </div>
                    ` : ''}
                </div>
            `;
            }).join('');
        }

        function toggleTeamReportInboxItem(key) {
            if (expandedTeamReportInboxKeys.has(key)) expandedTeamReportInboxKeys.delete(key);
            else expandedTeamReportInboxKeys.add(key);
            renderTeamReportInboxList();
        }

        function clearTeamReportInboxMonthFilter() {
            const input = document.getElementById('teamReportInboxMonthFilter');
            if (input) input.value = '';
            renderTeamReportInboxList();
        }

        // [팀 보고] 미제출 알림: 나보다 한 단계 아래 역할(팀장→파트장, 파트장→팀원) 사람들 중
        // 이번주 아무한테도 아직 보고를 제출하지 않은 사람이 있으면 "나에게 온 보고" 위에 보여줌
        async function loadTeamReportPendingStatus() {
            const el = document.getElementById('teamReportPendingStatus');
            if (!el) return;
            el.innerHTML = '';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'getTeamReportPendingStatus',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash,
                        weekStart: formatDate(getMondayOfWeek(new Date()))
                    })
                });
                const data = await res.json();

                if (data.status === 'success' && data.applicable) {
                    if (data.pending.length === 0) {
                        el.innerHTML = `<div class="ai-status success">✅ 이번주 전원 제출 완료 (${data.submittedCount}/${data.totalCount}명)</div>`;
                    } else {
                        const names = data.pending.map(p => escapeHtml(p.name || p.employeeId)).join(', ');
                        el.innerHTML = `<div class="ai-status error">⚠️ 이번주 미제출 ${data.pending.length}명 (${data.submittedCount}/${data.totalCount}명 제출) - ${names}</div>`;
                    }
                }
            } catch (err) {
                console.error('팀 보고 미제출 현황 불러오기 오류:', err);
            }
        }

