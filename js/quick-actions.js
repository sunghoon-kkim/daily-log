        // ===== 빠른 조작·표시 도구 모음 =====
        // 명령 팔레트(Ctrl/⌘+K), 활동 히트맵, 활동기록 '/' 빠른 입력, 빈 화면 안내, 스켈레톤 로딩, 완료 애니메이션.
        // 모두 브라우저에 이미 있는 데이터만 쓰고 서버 호출을 늘리지 않음

        // 상단 '빠른 이동' 버튼의 단축키 표시를 Mac에서는 ⌘K로
        document.addEventListener('DOMContentLoaded', () => {
            const kbd = document.getElementById('cmdkKbd');
            if (kbd && typeof IS_MAC !== 'undefined' && IS_MAC) kbd.textContent = '⌘K';
        });

        // ---------- 빈 화면 안내 ----------
        // icon: icons.js 아이콘 이름, action: { label, onclick } (onclick은 이 앱 코드의 고정 문자열만 넣음)
        function emptyStateHtml(iconName, title, desc, action) {
            const iconHtml = typeof icon === 'function' ? icon(iconName || 'file-text') : '';
            const actionHtml = action
                ? `<button type="button" class="empty-state-action" onclick="${action.onclick}">${typeof icon === 'function' && action.icon ? icon(action.icon) : ''}${escapeHtml(action.label)}</button>`
                : '';
            return `<div class="empty-state">
                <span class="empty-state-icon" aria-hidden="true">${iconHtml}</span>
                <div class="empty-state-title">${escapeHtml(title)}</div>
                ${desc ? `<div class="empty-state-desc">${escapeHtml(desc)}</div>` : ''}
                ${actionHtml}
            </div>`;
        }

        // ---------- 스켈레톤 로딩 ----------
        // 기준 요소 바로 뒤에 회색 뼈대를 끼워 넣고, 지우는 함수를 돌려줌
        function showSkeletonAfter(anchorEl, kind) {
            if (!anchorEl || !anchorEl.parentNode) return () => {};
            const sk = document.createElement('div');
            sk.className = 'skeleton-block' + (kind === 'app' ? ' skeleton-app' : '');
            sk.setAttribute('aria-hidden', 'true');
            sk.innerHTML = kind === 'app'
                ? '<div class="skeleton-bar skeleton-tabs"></div><div class="skeleton-panel"><div class="skeleton-card"><div class="skeleton-bar w-30"></div><div class="skeleton-bar w-80"></div><div class="skeleton-bar w-60"></div></div><div class="skeleton-card"><div class="skeleton-bar w-40"></div><div class="skeleton-bar w-70"></div></div></div>'
                : Array.from({ length: typeof kind === 'number' ? kind : 3 }, () => '<div class="skeleton-row"><div class="skeleton-bar w-20"></div><div class="skeleton-bar w-60"></div><div class="skeleton-bar w-30"></div></div>').join('');
            anchorEl.parentNode.insertBefore(sk, anchorEl.nextSibling);
            return () => sk.remove();
        }

        // ---------- 완료 애니메이션 ----------
        // 저장 버튼 아이콘을 잠깐 체크로 바꿨다 되돌림
        function flashButtonSuccess(btn) {
            if (!btn || btn.dataset.flashing === '1' || (typeof prefersReducedMotion === 'function' && prefersReducedMotion())) return;
            const iconEl = btn.querySelector('.ui-icon');
            if (!iconEl || typeof icon !== 'function') return;
            btn.dataset.flashing = '1';
            const original = iconEl.outerHTML;
            iconEl.outerHTML = icon('check');
            btn.classList.add('btn-success-flash');
            setTimeout(() => {
                const now = btn.querySelector('.ui-icon');
                if (now) now.outerHTML = original;
                btn.classList.remove('btn-success-flash');
                delete btn.dataset.flashing;
            }, 1200);
        }

        // ---------- 활동 히트맵 ----------
        const HEATMAP_WEEKS = 53;

        function countFilledCategories(dateStr) {
            const rec = records[dateStr];
            if (!rec) return 0;
            return Object.keys(rec).filter(c => typeof rec[c] === 'string' && rec[c].replace(/^\s*\d+\.\s*$/gm, '').trim() !== '').length;
        }

        function isHeatmapVisible() {
            try { return localStorage.getItem('activityHeatmapVisible') !== 'false'; } catch (e) { return true; }
        }

        function toggleActivityHeatmap() {
            safeSetItem('activityHeatmapVisible', isHeatmapVisible() ? 'false' : 'true');
            renderActivityHeatmap();
        }

        function renderActivityHeatmap() {
            const wrap = document.getElementById('activityHeatmapWrap');
            const grid = document.getElementById('activityHeatmap');
            if (!wrap || !grid) return;
            if (isFeatureDisabled('activityHeatmap') || !editUnlocked) { wrap.style.display = 'none'; return; }
            wrap.style.display = '';
            const visible = isHeatmapVisible();
            const toggleBtn = document.getElementById('activityHeatmapToggle');
            if (toggleBtn) toggleBtn.textContent = visible ? '숨기기' : '보이기';
            grid.parentElement.style.display = visible ? '' : 'none';

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const start = new Date(today);
            start.setDate(start.getDate() - (HEATMAP_WEEKS - 1) * 7 - today.getDay()); // 첫 칸은 일요일
            const todayStr = formatDate(today);
            const yearPrefix = String(today.getFullYear());

            let cells = '';
            let monthLabels = '';
            let lastMonth = -1;
            let writtenDays = 0;
            const d = new Date(start);
            for (let w = 0; w < HEATMAP_WEEKS; w++) {
                for (let dow = 0; dow < 7; dow++) {
                    const ds = formatDate(d);
                    if (d > today) {
                        cells += '<span class="hm-cell hm-future" aria-hidden="true"></span>';
                    } else {
                        const n = countFilledCategories(ds);
                        if (n > 0 && ds.startsWith(yearPrefix)) writtenDays++;
                        const level = Math.min(n, 4);
                        const off = typeof isNonWorkingDay === 'function' && isNonWorkingDay(ds, new Date(d));
                        const label = `${d.getMonth() + 1}월 ${d.getDate()}일(${WEEKDAY_NAMES[d.getDay()]}) · ${n ? n + '개 카테고리 작성' : (off ? '쉬는 날' : '기록 없음')}`;
                        cells += `<button type="button" class="hm-cell hm-l${level}${off && !n ? ' hm-off' : ''}${ds === todayStr ? ' hm-today' : ''}" data-date="${ds}" title="${label}" aria-label="${label}"></button>`;
                    }
                    if (dow === 0 && d.getMonth() !== lastMonth && d.getDate() <= 7) {
                        monthLabels += `<span class="hm-month" style="grid-column:${w + 1}">${d.getMonth() + 1}월</span>`;
                        lastMonth = d.getMonth();
                    }
                    d.setDate(d.getDate() + 1);
                }
            }
            grid.innerHTML = `<div class="hm-months">${monthLabels}</div><div class="hm-grid">${cells}</div>`;
            const summary = document.getElementById('activityHeatmapSummary');
            if (summary) summary.textContent = `올해 ${writtenDays}일 작성`;
            const scroller = grid.parentElement;
            scroller.scrollLeft = scroller.scrollWidth; // 좁은 화면에서는 최근 쪽이 먼저 보이게
        }

        // 화면 폭이 바뀌어 가로 스크롤이 생기면 최근(오른쪽) 쪽이 보이게 다시 맞춤
        window.addEventListener('resize', () => {
            const grid = document.getElementById('activityHeatmap');
            if (grid && grid.parentElement) grid.parentElement.scrollLeft = grid.parentElement.scrollWidth;
        });

        document.addEventListener('click', (e) => {
            const cell = e.target.closest && e.target.closest('#activityHeatmap .hm-cell[data-date]');
            if (cell) jumpToDateRecord(cell.dataset.date);
        });

        // ---------- 명령 팔레트 ----------
        let cmdkState = null;

        function cmdkIsOpen() { return !!(cmdkState && cmdkState.overlay.classList.contains('active')); }

        function parseCommandDate(q) {
            const s = q.trim();
            const base = new Date(); base.setHours(0, 0, 0, 0);
            const rel = { '오늘': 0, '어제': -1, '그제': -2, '그저께': -2, '내일': 1, '모레': 2 };
            if (Object.prototype.hasOwnProperty.call(rel, s)) { base.setDate(base.getDate() + rel[s]); return formatDate(base); }
            let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
            if (m) return checkDate(+m[1], +m[2], +m[3]);
            m = s.match(/^(\d{1,2})\s*[/.]\s*(\d{1,2})$/) || s.match(/^(\d{1,2})\s*월\s*(\d{1,2})\s*일?$/);
            if (m) return checkDate(base.getFullYear(), +m[1], +m[2]);
            return null;
            function checkDate(y, mo, da) {
                const dt = new Date(y, mo - 1, da);
                return (dt.getMonth() === mo - 1 && dt.getDate() === da) ? formatDate(dt) : null;
            }
        }

        function buildCommandItems(query) {
            const q = query.trim().toLowerCase();
            const match = (text) => !q || text.toLowerCase().includes(q);
            const groups = [];

            const date = parseCommandDate(query);
            if (date) {
                const dt = parseLocalDate(date);
                groups.push({ title: '날짜로 가기', items: [{ icon: 'calendar-days', label: `${dt.getFullYear()}년 ${dt.getMonth() + 1}월 ${dt.getDate()}일(${WEEKDAY_NAMES[dt.getDay()]}) 기록 열기`, run: () => jumpToDateRecord(date) }] });
            }

            const hiddenTabs = typeof getFullyHiddenTabIds === 'function' ? getFullyHiddenTabIds() : [];
            const tabs = tabOrder.filter(id => id === 'settings' || (!disabledTabIds.includes(id) && !hiddenTabs.includes(id)))
                .filter(id => match(TAB_LABELS[id] + ' 탭 이동'))
                .map(id => ({ icon: TAB_ICONS[id], label: TAB_LABELS[id], hint: '이동', run: () => switchTab(id) }));
            if (tabs.length) groups.push({ title: '이동', items: tabs });

            const actions = [
                { icon: 'calendar-plus', label: '새 일정 추가', keys: '일정 추가 새 일정', run: () => { switchTab('calendar'); openEventModal(null, formatDate(new Date())); } },
                { icon: 'calendar-days', label: '오늘 기록으로 가기', keys: '오늘 today', run: () => jumpToDateRecord(formatDate(new Date())) },
                { icon: 'save', label: '저장하기', keys: '저장 save', run: () => { switchTab('calendar'); saveAllRecords(); } },
                { icon: document.documentElement.classList.contains('dark-mode') ? 'sun' : 'moon', label: document.documentElement.classList.contains('dark-mode') ? '라이트 모드로 전환' : '다크 모드로 전환', keys: '다크 라이트 테마 dark', run: () => toggleTheme() },
                { icon: 'settings', label: layoutWidth === 'wide' ? '화면 너비: 표준 폭으로' : '화면 너비: 와이드 폭으로', keys: '화면 너비 와이드 표준 폭', run: () => setLayoutWidth(layoutWidth === 'wide' ? 'standard' : 'wide') }
            ].filter(a => match(a.label + ' ' + a.keys));
            if (actions.length) groups.push({ title: '동작', items: actions });

            if (q.length >= 2 && !date) {
                const hits = [];
                const dates = Object.keys(records).sort().reverse();
                for (const ds of dates) {
                    const rec = records[ds];
                    for (const cat of Object.keys(rec || {})) {
                        const text = typeof rec[cat] === 'string' ? rec[cat] : '';
                        const idx = text.toLowerCase().indexOf(q);
                        if (idx === -1) continue;
                        const from = Math.max(0, idx - 18);
                        const snippet = (from > 0 ? '…' : '') + text.slice(from, idx + q.length + 40).replace(/\s+/g, ' ');
                        hits.push({ icon: 'file-text', label: `${formatShortDateWithDay(ds)} · ${cat}`, sub: snippet, run: () => jumpToDateRecord(ds) });
                        break;
                    }
                    if (hits.length >= 5) break;
                }
                if (hits.length) groups.push({ title: '활동기록', items: hits });
                if (!isFeatureDisabled('keywordSearch')) {
                    groups.push({ title: '검색', items: [{ icon: 'search', label: `통합 검색에서 "${query.trim()}" 전체 보기`, run: () => {
                        switchTab('query');
                        if (typeof showQuerySection === 'function') showQuerySection('search');
                        const input = document.getElementById('searchKeywordInput');
                        if (input) { input.value = query.trim(); if (typeof performKeywordSearch === 'function') performKeywordSearch(); }
                    } }] });
                }
            }
            return groups;
        }

        function ensureCommandPalette() {
            if (cmdkState) return cmdkState;
            const overlay = document.createElement('div');
            overlay.className = 'cmdk-overlay';
            overlay.innerHTML = `<div class="cmdk" role="dialog" aria-modal="true" aria-label="명령 팔레트">
                <div class="cmdk-input-row">${typeof icon === 'function' ? icon('search') : ''}<input type="text" class="cmdk-input" placeholder="탭 이름, 날짜(11/3·어제), 동작, 기록 내용을 입력하세요" aria-label="명령 검색" autocomplete="off"></div>
                <div class="cmdk-list" role="listbox"></div>
                <div class="cmdk-footer"><span><kbd>↑</kbd><kbd>↓</kbd> 이동</span><span><kbd>Enter</kbd> 실행</span><span><kbd>Esc</kbd> 닫기</span></div>
            </div>`;
            document.body.appendChild(overlay);
            const input = overlay.querySelector('.cmdk-input');
            const list = overlay.querySelector('.cmdk-list');
            cmdkState = { overlay, input, list, flat: [], active: 0 };
            overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeCommandPalette(); });
            input.addEventListener('input', renderCommandList);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const n = cmdkState.flat.length;
                    if (!n) return;
                    cmdkState.active = (cmdkState.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
                    highlightCommand(true);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    runCommand(cmdkState.active);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    closeCommandPalette();
                }
            });
            list.addEventListener('mousemove', (e) => {
                const item = e.target.closest('.cmdk-item');
                if (item && Number(item.dataset.index) !== cmdkState.active) { cmdkState.active = Number(item.dataset.index); highlightCommand(false); }
            });
            list.addEventListener('click', (e) => {
                const item = e.target.closest('.cmdk-item');
                if (item) runCommand(Number(item.dataset.index));
            });
            return cmdkState;
        }

        function renderCommandList() {
            const st = cmdkState;
            const groups = buildCommandItems(st.input.value);
            st.flat = [];
            st.active = 0;
            st.list.innerHTML = groups.length ? groups.map(g => `<div class="cmdk-group-title">${escapeHtml(g.title)}</div>` + g.items.map(it => {
                const i = st.flat.push(it) - 1;
                return `<div class="cmdk-item" role="option" data-index="${i}">${typeof icon === 'function' ? icon(it.icon || 'file-text') : ''}<span class="cmdk-item-text"><span class="cmdk-item-label">${escapeHtml(it.label)}</span>${it.sub ? `<span class="cmdk-item-sub">${escapeHtml(it.sub)}</span>` : ''}</span>${it.hint ? `<span class="cmdk-item-hint">${escapeHtml(it.hint)}</span>` : ''}</div>`;
            }).join('')).join('') : '<div class="cmdk-empty">일치하는 항목이 없습니다</div>';
            highlightCommand(false);
        }

        function highlightCommand(scroll) {
            cmdkState.list.querySelectorAll('.cmdk-item').forEach(el => {
                const on = Number(el.dataset.index) === cmdkState.active;
                el.classList.toggle('active', on);
                el.setAttribute('aria-selected', on ? 'true' : 'false');
                if (on && scroll) el.scrollIntoView({ block: 'nearest' });
            });
        }

        function runCommand(index) {
            const item = cmdkState && cmdkState.flat[index];
            if (!item) return;
            closeCommandPalette();
            item.run();
        }

        // 명령 팔레트는 비활성화 상태(사용자 요청). 다시 켜려면 이 값을 true로 바꾸고 index.html 상단 바에
        // '빠른 이동' 버튼을, main.js의 Ctrl/⌘+K 처리에 openCommandPalette() 호출을 되살리면 됨
        const COMMAND_PALETTE_ENABLED = false;

        function openCommandPalette() {
            if (!COMMAND_PALETTE_ENABLED) return;
            if (!editUnlocked || document.body.classList.contains('admin-mode')) return;
            const st = ensureCommandPalette();
            st.lastFocus = document.activeElement;
            st.input.value = '';
            renderCommandList();
            st.overlay.classList.add('active');
            st.input.focus(); // 열자마자 입력한 첫 글자도 놓치지 않게 바로 포커스
        }

        function closeCommandPalette() {
            if (!cmdkState) return;
            cmdkState.overlay.classList.remove('active');
            if (cmdkState.lastFocus && document.contains(cmdkState.lastFocus)) {
                try { cmdkState.lastFocus.focus(); } catch (e) { /* 무시 */ }
            }
        }

        // ---------- 활동기록 '/' 빠른 입력 ----------
        let slashState = null;

        function slashEnabled() {
            return editUnlocked && !isFeatureDisabled('quickInsert');
        }

        // 커서가 있는 줄의 "N. " 다음부터 커서까지가 "/검색어" 형태면 그 정보를 돌려줌
        function getSlashToken(textarea) {
            const pos = textarea.selectionStart;
            if (pos !== textarea.selectionEnd) return null;
            const before = textarea.value.slice(0, pos);
            const lineStart = before.lastIndexOf('\n') + 1;
            const lineBefore = before.slice(lineStart);
            const m = lineBefore.match(/^(\d+\.\s?)?\/([^\n]*)$/);
            if (!m) return null;
            return { start: lineStart + (m[1] ? m[1].length : 0), end: pos, query: m[2] };
        }

        function frequentLinesFor(category) {
            const counts = {};
            const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
            const cutoffStr = formatDate(cutoff);
            Object.keys(records).forEach(ds => {
                if (ds < cutoffStr || ds === selectedDate) return;
                const text = records[ds] && records[ds][category];
                if (typeof text !== 'string') return;
                text.split('\n').forEach(line => {
                    const t = line.replace(/^\s*\d+\.\s*/, '').trim();
                    if (t.length >= 2 && t.length <= 80) counts[t] = (counts[t] || 0) + 1;
                });
            });
            return Object.keys(counts).filter(t => counts[t] >= 3).sort((a, b) => counts[b] - counts[a]).slice(0, 8);
        }

        function equipmentNamesForSlash() {
            const set = new Set();
            (maintenanceSchedule || []).forEach(m => { if (m && m.equipment) set.add(String(m.equipment).trim()); });
            if (typeof getRecentList === 'function') getRecentList('recentEquipmentNames').forEach(n => set.add(n));
            return [...set].filter(Boolean).slice(0, 12);
        }

        // 여러 줄 문구를 넣을 때 앞의 번호("1. ")는 떼고 넣음(입력칸이 번호를 다시 매김)
        function stripLineNumbers(text) {
            return String(text || '').split('\n').map(l => l.replace(/^\s*\d+\.\s*/, '')).filter(l => l.trim() !== '').join('\n' + '0. ');
        }

        function buildSlashItems(textarea, query) {
            const category = textarea.dataset.category || textarea.id.replace('category-', '');
            const q = query.trim().toLowerCase();
            const match = (s) => !q || s.toLowerCase().includes(q);
            const items = [];
            const dateStr = selectedDate || formatDate(new Date());
            const dow = parseLocalDate(dateStr).getDay();
            const tpl = weekdayTemplates && weekdayTemplates[dow] && weekdayTemplates[dow][category];
            if (tpl && match('템플릿 ' + tpl)) items.push({ group: '불러오기', icon: 'file-text', label: `${WEEKDAY_NAMES[dow]}요일 템플릿`, sub: tpl.replace(/\s+/g, ' ').slice(0, 60), text: stripLineNumbers(tpl) });
            const prev = typeof findPreviousWorkday === 'function' ? findPreviousWorkday(dateStr) : null;
            const prevText = prev && records[prev] && records[prev][category];
            if (prevText && prevText.replace(/^\s*\d+\.\s*$/gm, '').trim() && match('어제 직전 이전 기록 ' + prevText)) items.push({ group: '불러오기', icon: 'history', label: `직전 근무일(${formatShortDateWithDay(prev)}) 기록`, sub: prevText.replace(/\s+/g, ' ').slice(0, 60), text: stripLineNumbers(prevText) });
            const now = new Date();
            const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
            if (match('시간 시각 ' + hhmm)) items.push({ group: '넣기', icon: 'history', label: `현재 시각 ${hhmm}`, text: hhmm + ' ' });
            const todayLabel = formatShortDateWithDay(formatDate(now));
            if (match('날짜 오늘 ' + todayLabel)) items.push({ group: '넣기', icon: 'calendar-days', label: `오늘 날짜 ${todayLabel}`, text: todayLabel + ' ' });
            const mine = Array.isArray(recordSnippets[category]) ? recordSnippets[category] : [];
            mine.filter(match).forEach(s => items.push({ group: '내 상용구', icon: 'pen-line', label: s, text: s, snippet: s }));
            frequentLinesFor(category).filter(s => !mine.includes(s) && match(s)).forEach(s => items.push({ group: '자주 쓴 문장', icon: 'repeat', label: s, text: s }));
            equipmentNamesForSlash().filter(match).forEach(s => items.push({ group: '설비명', icon: 'wrench', label: s, text: s + ' ' }));
            const typed = query.trim();
            if (typed && !mine.includes(typed)) items.push({ group: '상용구', icon: 'plus', label: `"${typed}"을(를) 상용구로 등록`, register: typed });
            return items;
        }

        function ensureSlashMenu() {
            if (slashState) return slashState;
            const menu = document.createElement('div');
            menu.className = 'slash-menu';
            menu.setAttribute('role', 'listbox');
            document.body.appendChild(menu);
            slashState = { menu, textarea: null, items: [], active: 0, token: null };
            menu.addEventListener('mousedown', (e) => {
                e.preventDefault(); // 입력칸 포커스를 유지
                const del = e.target.closest('.slash-item-delete');
                if (del) { removeSnippet(del.dataset.snippet); return; }
                const item = e.target.closest('.slash-item');
                if (item) applySlashItem(Number(item.dataset.index));
            });
            return slashState;
        }

        // 입력칸 안 커서의 화면 좌표를 구함(같은 스타일의 숨은 거울 요소로 계산)
        function caretCoordinates(textarea, pos) {
            const cs = getComputedStyle(textarea);
            const mirror = document.createElement('div');
            ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderLeftWidth', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordBreak', 'overflowWrap'].forEach(p => { mirror.style[p] = cs[p]; });
            mirror.style.position = 'absolute';
            mirror.style.visibility = 'hidden';
            mirror.style.whiteSpace = 'pre-wrap';
            mirror.textContent = textarea.value.slice(0, pos);
            const marker = document.createElement('span');
            marker.textContent = '​';
            mirror.appendChild(marker);
            document.body.appendChild(mirror);
            const top = marker.offsetTop, left = marker.offsetLeft, lh = parseFloat(cs.lineHeight) || 20;
            mirror.remove();
            const r = textarea.getBoundingClientRect();
            return { x: r.left + left - textarea.scrollLeft, y: r.top + top - textarea.scrollTop + lh };
        }

        function openOrUpdateSlashMenu(textarea) {
            const token = getSlashToken(textarea);
            if (!token) { closeSlashMenu(); return; }
            const st = ensureSlashMenu();
            st.textarea = textarea;
            st.token = token;
            st.items = buildSlashItems(textarea, token.query);
            if (st.items.length === 0) { closeSlashMenu(); return; }
            if (st.active >= st.items.length) st.active = 0;
            let lastGroup = '';
            st.menu.innerHTML = st.items.map((it, i) => {
                const head = it.group !== lastGroup ? `<div class="slash-group">${escapeHtml(it.group)}</div>` : '';
                lastGroup = it.group;
                return head + `<div class="slash-item${i === st.active ? ' active' : ''}" role="option" data-index="${i}">${typeof icon === 'function' ? icon(it.icon) : ''}<span class="slash-item-text"><span class="slash-item-label">${escapeHtml(it.label)}</span>${it.sub ? `<span class="slash-item-sub">${escapeHtml(it.sub)}</span>` : ''}</span>${it.snippet ? `<button type="button" class="slash-item-delete" data-snippet="${escapeHtml(it.snippet)}" title="상용구에서 지우기" aria-label="상용구에서 지우기">${typeof icon === 'function' ? icon('x') : '×'}</button>` : ''}</div>`;
            }).join('') + '<div class="slash-footer">↑↓ 선택 · Enter 넣기 · Esc 닫기</div>';
            const c = caretCoordinates(textarea, token.start);
            const menuW = Math.min(360, window.innerWidth - 24);
            st.menu.style.width = menuW + 'px';
            st.menu.style.left = Math.max(12, Math.min(c.x, window.innerWidth - menuW - 12)) + 'px';
            st.menu.classList.add('open');
            const h = st.menu.offsetHeight;
            st.menu.style.top = (c.y + 4 + h > window.innerHeight ? Math.max(12, c.y - h - 28) : c.y + 4) + 'px';
            const activeEl = st.menu.querySelector('.slash-item.active');
            if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
        }

        function closeSlashMenu() {
            if (!slashState) return;
            slashState.menu.classList.remove('open');
            slashState.active = 0;
        }

        function applySlashItem(index) {
            const st = slashState;
            const it = st && st.items[index];
            if (!it || !st.textarea) return;
            if (it.register) {
                if (!checkEditPermission()) return;
                const cat = st.textarea.dataset.category || st.textarea.id.replace('category-', '');
                if (!Array.isArray(recordSnippets[cat])) recordSnippets[cat] = [];
                if (!recordSnippets[cat].includes(it.register)) recordSnippets[cat].push(it.register);
                saveRecordSnippetsToStorage();
                if (typeof showAppToast === 'function') showAppToast(`상용구로 등록했습니다: ${it.register}`, 'success');
                insertSlashText(it.register);
                return;
            }
            insertSlashText(it.text);
        }

        function insertSlashText(text) {
            const st = slashState;
            const ta = st.textarea;
            const tok = getSlashToken(ta) || st.token;
            const value = ta.value;
            ta.value = value.slice(0, tok.start) + text + value.slice(tok.end);
            const caret = tok.start + text.length;
            ta.selectionStart = ta.selectionEnd = caret;
            closeSlashMenu();
            st.suppress = true;
            ta.dispatchEvent(new Event('input', { bubbles: true })); // 번호 다시 매기기·자동 저장
            st.suppress = false;
            ta.focus();
        }

        function removeSnippet(text) {
            if (!checkEditPermission() || !slashState || !slashState.textarea) return;
            const cat = slashState.textarea.dataset.category || slashState.textarea.id.replace('category-', '');
            if (Array.isArray(recordSnippets[cat])) recordSnippets[cat] = recordSnippets[cat].filter(s => s !== text);
            saveRecordSnippetsToStorage();
            openOrUpdateSlashMenu(slashState.textarea);
        }

        const isRecordTextarea = (el) => el && el.tagName === 'TEXTAREA' && el.closest && el.closest('#calendar .category-record');

        document.addEventListener('input', (e) => {
            if (!isRecordTextarea(e.target) || (slashState && slashState.suppress)) return;
            if (!slashEnabled()) return;
            openOrUpdateSlashMenu(e.target);
        });

        document.addEventListener('keydown', (e) => {
            if (!slashState || !slashState.menu.classList.contains('open') || e.target !== slashState.textarea) return;
            const n = slashState.items.length;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                slashState.active = (slashState.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
                openOrUpdateSlashMenu(slashState.textarea);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                applySlashItem(slashState.active);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeSlashMenu();
            }
        }, true);

        document.addEventListener('focusout', (e) => {
            if (slashState && e.target === slashState.textarea) setTimeout(() => { if (document.activeElement !== slashState.textarea) closeSlashMenu(); }, 120);
        });
        window.addEventListener('resize', closeSlashMenu);
        document.addEventListener('scroll', (e) => { if (slashState && slashState.menu.classList.contains('open') && !slashState.menu.contains(e.target)) closeSlashMenu(); }, true);
