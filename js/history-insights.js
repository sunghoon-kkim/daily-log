        // ===== 설비별 이력 타임라인 =====
        // 설비 이름(약칭은 "|"로 여러 개)으로 활동기록·정비 완료 이력·일정·개선과제에 흩어진 내용을
        // 한 화면에 시간순으로 모아 보여줌. 데이터를 새로 저장하지 않는 조회 전용 기능
        let lastEquipmentTimeline = [];

        // 정비계획에 등록된 설비명을 입력창 자동완성 후보로 채움
        function refreshEquipmentNameList() {
            const list = document.getElementById('equipmentNameList');
            if (!list) return;
            const names = Array.from(new Set(maintenanceSchedule.map(m => (m.equipment || '').trim()).filter(Boolean))).sort();
            list.innerHTML = names.map(n => `<option value="${escapeHtml(n)}"></option>`).join('');
        }

        function parseEquipmentAliases(raw) {
            return String(raw || '').split('|').map(s => s.trim().toLowerCase()).filter(Boolean);
        }

        function textMentionsAny(text, aliases) {
            const lower = String(text || '').toLowerCase();
            return aliases.some(a => lower.includes(a));
        }

        function collectEquipmentTimeline(aliases, periodStart) {
            const entries = [];
            const inPeriod = (dateStr) => !periodStart || (dateStr && dateStr >= periodStart);

            // 활동기록: 설비명이 들어간 줄만 뽑아서 보여줌 (한 칸에 여러 설비 내용이 섞여 있는 경우가 많음)
            const allCategories = getAllRecordCategories();
            for (const dateStr in records) {
                if (!inPeriod(dateStr)) continue;
                const rec = records[dateStr] || {};
                for (const category of allCategories) {
                    const content = rec[category];
                    if (typeof content !== 'string' || !textMentionsAny(content, aliases)) continue;
                    const lines = content.split('\n').filter(line => textMentionsAny(line, aliases));
                    entries.push({ kind: 'record', date: dateStr, source: '활동기록', tag: category, text: lines.slice(0, 8).join('\n') });
                }
            }

            // 정비계획: 설비명(또는 점검 항목)이 일치하는 항목의 완료 이력
            const matchedPlans = maintenanceSchedule.filter(m => textMentionsAny(m.equipment, aliases) || textMentionsAny(m.item, aliases));
            for (const m of matchedPlans) {
                for (const c of getMaintenanceCompletions(m)) {
                    if (!inPeriod(c.date)) continue;
                    entries.push({ kind: 'maintenance', date: c.date, source: '정비완료', tag: m.item || '점검', text: c.note || '', refId: m.id });
                }
            }

            for (const ev of events) {
                if (ev.title && inPeriod(ev.start) && textMentionsAny(ev.title, aliases)) {
                    entries.push({ kind: 'event', date: ev.start, source: '일정', tag: ev.start === ev.end ? '' : `~${ev.end}`, text: ev.title });
                }
            }

            // 개선과제: 과제명에 설비가 들어가면 월별 기록 전체, 아니면 설비가 언급된 월별 기록만
            for (const p of savingsProjects) {
                const titleMatch = textMentionsAny(p.title, aliases);
                const logs = Array.isArray(p.monthlyLogs) ? p.monthlyLogs : [];
                for (const log of logs) {
                    if (!log.month || !(titleMatch || textMentionsAny(log.note, aliases))) continue;
                    if (periodStart && log.month < periodStart.slice(0, 7)) continue;
                    entries.push({ kind: 'project', date: log.month, source: '개선과제', tag: p.title || '', text: log.note || '', refId: p.id });
                }
            }

            // 최신순 (월 단위만 있는 개선과제 기록 "YYYY-MM"도 문자열 비교로 같은 달의 맨 앞에 정렬됨)
            entries.sort((a, b) => b.date.localeCompare(a.date));
            return { entries, matchedPlans };
        }

        function renderEquipmentTimeline() {
            const input = document.getElementById('equipmentTimelineInput');
            const resultsEl = document.getElementById('equipmentTimelineResults');
            const summaryEl = document.getElementById('equipmentTimelineSummary');
            if (!input || !resultsEl) return;
            const aliases = parseEquipmentAliases(input.value);
            if (summaryEl) summaryEl.textContent = '';
            lastEquipmentTimeline = [];

            if (aliases.length === 0) {
                resultsEl.innerHTML = '<div class="no-result">설비명을 입력해주세요</div>';
                return;
            }

            const periodValue = (document.getElementById('equipmentTimelinePeriod') || {}).value;
            const periodStart = getSearchPeriodStart(periodValue);
            const { entries, matchedPlans } = collectEquipmentTimeline(aliases, periodStart);
            lastEquipmentTimeline = entries;

            let html = '';
            if (matchedPlans.length > 0) {
                html += '<div class="equipment-plan-summary"><div class="equipment-plan-summary-title">🔧 등록된 정비계획</div>' + matchedPlans.map(m => {
                    const completions = getMaintenanceCompletions(m);
                    return `<div class="equipment-plan-row" onclick="switchTab('maintenance'); openMaintenanceModal('${m.id}')">
                        <b>${escapeHtml(m.equipment || '')}</b> · ${escapeHtml(m.item || '점검')}
                        ${m.cycle ? ` · 주기 ${escapeHtml(m.cycle)}` : ''}
                        ${m.nextDue ? ` · 차기 ${escapeHtml(m.nextDue)}` : ''}
                        · 완료 ${completions.length}회${m.lastDone ? ` (최근 ${escapeHtml(m.lastDone)})` : ''}
                    </div>`;
                }).join('') + '</div>';
            }

            if (entries.length === 0) {
                resultsEl.innerHTML = html + '<div class="no-result">해당 설비가 언급된 기록이 없습니다</div>';
                return;
            }

            const counts = {};
            entries.forEach(e => { counts[e.source] = (counts[e.source] || 0) + 1; });
            if (summaryEl) {
                const oldest = entries[entries.length - 1].date;
                const newest = entries[0].date;
                summaryEl.textContent = `총 ${entries.length}건 (${Object.keys(counts).map(k => `${k} ${counts[k]}`).join(' · ')}) · ${oldest} ~ ${newest}`;
            }

            const highlightTerms = input.value.split('|').map(s => s.trim()).filter(Boolean);
            let currentMonth = '';
            html += '<div class="equipment-timeline">';
            entries.forEach((e, idx) => {
                const month = e.date.slice(0, 7);
                if (month !== currentMonth) {
                    currentMonth = month;
                    html += `<div class="timeline-month">${month.replace('-', '년 ')}월</div>`;
                }
                html += `
                    <div class="timeline-entry timeline-${e.kind}">
                        <div class="timeline-entry-head">
                            <span class="timeline-date">${escapeHtml(e.date.length === 7 ? e.date + ' (월)' : e.date)}</span>
                            <span class="timeline-source">${escapeHtml(e.source)}</span>
                            ${e.tag ? `<span class="search-result-tag">[${escapeHtml(e.tag)}]</span>` : ''}
                            <button class="result-action-btn" onclick="openEquipmentTimelineEntry(${idx})">↗ 열기</button>
                        </div>
                        ${e.text ? `<div class="result-content">${highlightSearchTerms(escapeHtml(e.text), highlightTerms)}</div>` : ''}
                    </div>`;
            });
            html += '</div>';
            resultsEl.innerHTML = html;
        }

        function openEquipmentTimelineEntry(idx) {
            const e = lastEquipmentTimeline[idx];
            if (!e) return;
            if (e.kind === 'record' || e.kind === 'event') { jumpToSearchResult(e.date); return; }
            if (e.kind === 'maintenance') {
                switchTab('maintenance');
                if (maintenanceSchedule.some(m => m.id === e.refId)) openMaintenanceModal(e.refId);
                return;
            }
            if (e.kind === 'project') {
                switchTab('improvement');
                if (savingsProjects.some(p => p.id === e.refId)) openProjectModal(e.refId);
            }
        }

        // 정비계획 탭의 설비 그룹 "📜 설비 이력" 버튼에서 호출
        function openEquipmentTimeline(equipmentName) {
            switchTab('query');
            const input = document.getElementById('equipmentTimelineInput');
            if (!input) return;
            input.value = equipmentName;
            refreshEquipmentNameList();
            renderEquipmentTimeline();
            const section = document.getElementById('equipmentTimelineSection');
            if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        function downloadEquipmentTimelineCsv() {
            if (lastEquipmentTimeline.length === 0) { showAppToast('먼저 설비 이력을 조회해주세요'); return; }
            const rows = [['날짜', '구분', '세부', '내용']];
            lastEquipmentTimeline.forEach(e => rows.push([e.date, e.source, e.tag, e.text]));
            const name = document.getElementById('equipmentTimelineInput').value.trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 30);
            downloadCsvFile(rows, `설비이력_${name}_${formatDate(new Date())}.csv`);
        }

        // ===== 키워드 발생 통계 =====
        // "누설", "트립" 같은 이상 키워드가 월별로 며칠이나 기록됐는지 집계해서 반복·재발 여부를 숫자로 보여줌.
        // 키워드마다 막대그래프를 따로(같은 눈금) 그려서 색 구분 없이도 비교할 수 있게 함
        const KEYWORD_STATS_MAX_KEYWORDS = 5;
        let lastKeywordStats = null;

        function getRecentMonthKeys(count) {
            const now = new Date();
            const keys = [];
            for (let i = count - 1; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }
            return keys;
        }

        function computeKeywordStats(keywordGroups, monthKeys, categoryFilter) {
            const monthSet = new Set(monthKeys);
            const searchCategories = categoryFilter ? [categoryFilter] : getAllRecordCategories();
            const stats = keywordGroups.map(group => ({
                label: group.label, aliases: group.aliases,
                byMonth: Object.fromEntries(monthKeys.map(k => [k, 0])),
                byCategory: {}, total: 0, latest: ''
            }));

            for (const dateStr in records) {
                const month = dateStr.slice(0, 7);
                if (!monthSet.has(month)) continue;
                const rec = records[dateStr] || {};
                stats.forEach(stat => {
                    const hitCategories = searchCategories.filter(c => typeof rec[c] === 'string' && textMentionsAny(rec[c], stat.aliases));
                    if (hitCategories.length === 0) return;
                    stat.byMonth[month]++; // 같은 날 여러 카테고리에 적혀도 "발생 일수"는 1일로 셈
                    stat.total++;
                    if (dateStr > stat.latest) stat.latest = dateStr;
                    hitCategories.forEach(c => { stat.byCategory[c] = (stat.byCategory[c] || 0) + 1; });
                });
            }
            return stats;
        }

        function renderKeywordStats() {
            const input = document.getElementById('keywordStatsInput');
            const resultsEl = document.getElementById('keywordStatsResults');
            if (!input || !resultsEl) return;

            const keywordGroups = input.value.split(',').map(s => s.trim()).filter(Boolean)
                .slice(0, KEYWORD_STATS_MAX_KEYWORDS)
                .map(label => ({ label, aliases: parseEquipmentAliases(label) }))
                .filter(g => g.aliases.length > 0);
            lastKeywordStats = null;
            if (keywordGroups.length === 0) {
                resultsEl.innerHTML = '<div class="no-result">집계할 키워드를 쉼표로 구분해 입력해주세요 (예: 누설, 트립|정지, 알람)</div>';
                return;
            }

            const monthCount = parseInt((document.getElementById('keywordStatsPeriod') || {}).value, 10) || 12;
            const categoryFilter = (document.getElementById('keywordStatsCategory') || {}).value || '';
            const monthKeys = getRecentMonthKeys(monthCount);
            const stats = computeKeywordStats(keywordGroups, monthKeys, categoryFilter);
            lastKeywordStats = { stats, monthKeys };

            // 모든 키워드가 같은 눈금을 쓰도록 전체 최댓값 기준으로 막대 높이를 정함
            const globalMax = Math.max(1, ...stats.flatMap(s => monthKeys.map(k => s.byMonth[k])));
            const labelEvery = monthCount > 12 ? 3 : 1;

            let html = `<div class="search-help-text" style="margin:0 0 10px 0;">월별 "언급된 날 수" · 모든 그래프는 같은 눈금(최대 ${globalMax}일) · 막대를 누르면 그 키워드로 통합 검색</div>`;
            stats.forEach((stat, si) => {
                const topCategories = Object.entries(stat.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3)
                    .map(([c, n]) => `${escapeHtml(c)} ${n}일`).join(', ');
                const peakMonth = monthKeys.reduce((best, k) => stat.byMonth[k] > stat.byMonth[best] ? k : best, monthKeys[0]);
                html += `<div class="keyword-stat-block">
                    <div class="keyword-stat-head">
                        <span class="keyword-stat-name">${escapeHtml(stat.label)}</span>
                        <span class="keyword-stat-meta">총 ${stat.total}일${stat.latest ? ` · 최근 ${stat.latest}` : ''}${topCategories ? ` · 주요 카테고리: ${topCategories}` : ''}</span>
                    </div>
                    <div class="keyword-stat-chart" role="img" aria-label="${escapeHtml(stat.label)} 월별 언급 일수">
                        ${monthKeys.map((k, mi) => {
                            const v = stat.byMonth[k];
                            const h = v === 0 ? 0 : Math.max(4, Math.round(v / globalMax * 100));
                            const showValue = v > 0 && k === peakMonth; // 숫자는 가장 높은 달에만 직접 표시 (나머지는 툴팁/표)
                            return `<button type="button" class="keyword-stat-col" onclick="searchKeywordFromStats(${si})" title="${k}: ${v}일">
                                <span class="keyword-stat-value">${showValue ? v : ''}</span>
                                <span class="keyword-stat-bar-area"><span class="keyword-stat-bar" style="height:${h}%"></span></span>
                                <span class="keyword-stat-month">${mi % labelEvery === 0 || mi === monthKeys.length - 1 ? `${parseInt(k.slice(5), 10)}월` : ''}</span>
                            </button>`;
                        }).join('')}
                    </div>
                </div>`;
            });

            // 색/막대만으로 읽기 어려운 경우를 위한 표 보기 (월 × 키워드)
            html += `<details class="keyword-stat-table-wrap"><summary>표로 보기</summary>
                <table class="keyword-stat-table"><thead><tr><th>월</th>${stats.map(s => `<th>${escapeHtml(s.label)}</th>`).join('')}</tr></thead>
                <tbody>${monthKeys.slice().reverse().map(k => `<tr><td>${k}</td>${stats.map(s => `<td>${s.byMonth[k]}</td>`).join('')}</tr>`).join('')}</tbody></table>
            </details>`;
            resultsEl.innerHTML = html;
        }

        function searchKeywordFromStats(statIndex) {
            if (!lastKeywordStats) return;
            const stat = lastKeywordStats.stats[statIndex];
            if (!stat) return;
            const input = document.getElementById('searchKeywordInput');
            if (!input) return;
            // 약칭 묶음(A|B)은 통합 검색에서도 OR로 동작하도록 띄어쓰기 없이 그대로 넘김
            input.value = stat.aliases.join('|');
            const categoryFilter = (document.getElementById('keywordStatsCategory') || {}).value || '';
            const searchCategorySelect = document.getElementById('searchCategorySelect');
            if (searchCategorySelect) searchCategorySelect.value = categoryFilter;
            performKeywordSearch();
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        function downloadKeywordStatsCsv() {
            if (!lastKeywordStats) { showAppToast('먼저 키워드 통계를 집계해주세요'); return; }
            const { stats, monthKeys } = lastKeywordStats;
            const rows = [['월', ...stats.map(s => s.label)]];
            monthKeys.forEach(k => rows.push([k, ...stats.map(s => s.byMonth[k])]));
            rows.push(['합계', ...stats.map(s => s.total)]);
            downloadCsvFile(rows, `키워드통계_${formatDate(new Date())}.csv`);
        }
