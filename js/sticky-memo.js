        // ===== 플로팅 스티커 메모 (여러 장) =====
        // 어느 탭에서든 화면 위에 띄워 두고 쓰는 메모 창. 최대 STICKY_MAX장까지 동시에 띄울 수 있음.
        // 데이터는 '할일 & 메모' 탭의 freeNotesPages를 그대로 씀(저장 경로도 같음: 0.5초 뒤 반영 → 브라우저 저장소 → queueSync).
        // 창 목록(창마다 메모 페이지·위치·크기·색·투명도·글자 크기·접힘)은 이 기기의 stickyMemoWindows에 저장하고,
        // 로그아웃 때 통째로 지움(ACCOUNT_SCOPED_STORAGE_KEYS).

        const STICKY_COLORS = ['yellow', 'mint', 'sky', 'pink', 'lavender', 'default'];
        const STICKY_COLOR_LABELS = { yellow: '노랑', mint: '민트', sky: '하늘', pink: '분홍', lavender: '라벤더', default: '기본' };
        const STICKY_FONT_SIZES = [12, 13, 14, 16, 18, 20];
        const STICKY_MAX = 5;
        const STICKY_MIN_W = 240;
        const STICKY_MIN_H = 180;
        const STICKY_SNAP = 24;      // 화면 좌우 끝에서 이 거리 안에 놓으면 끝에 딱 붙임
        const STICKY_CASCADE = 28;   // 새 창을 열 때 어긋나게 놓는 간격
        const STICKY_Z_BASE = 150;   // --z-floating. 창 순서대로 150~154 (드롭다운 200 아래)

        const STICKY_DEFAULT_WIN = { side: 'right', offset: 24, y: 120, w: 320, h: 360, color: 'yellow', alpha: 100, font: 14, collapsed: false };

        function normalizeStickyWin(raw) {
            const w = Object.assign({}, STICKY_DEFAULT_WIN, (raw && typeof raw === 'object') ? raw : {});
            w.id = (typeof w.id === 'string' && /^sw_[a-z0-9_]+$/i.test(w.id)) ? w.id : newStickyWinId();
            w.pageId = typeof w.pageId === 'string' ? w.pageId : null;
            if (w.side !== 'left') w.side = 'right';
            ['offset', 'y', 'w', 'h'].forEach(k => { w[k] = Math.max(0, Math.round(Number(w[k]) || 0)); });
            w.w = Math.max(STICKY_MIN_W, w.w);
            w.h = Math.max(STICKY_MIN_H, w.h);
            if (!STICKY_COLORS.includes(w.color)) w.color = 'yellow';
            w.alpha = Math.min(100, Math.max(30, Math.round(Number(w.alpha) || 100)));
            if (!STICKY_FONT_SIZES.includes(w.font)) w.font = 14;
            w.collapsed = !!w.collapsed;
            return w;
        }

        function newStickyWinId() {
            return 'sw_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
        }

        // 저장값 읽기. 예전 한 장짜리 형식(stickyMemoUI + stickyMemoPageId)이면 한 장짜리 목록으로 옮겨 줌
        let stickyStore = (function () {
            try {
                const saved = JSON.parse(localStorage.getItem('stickyMemoWindows') || 'null');
                if (saved && Array.isArray(saved.wins)) {
                    return { visible: saved.visible !== false, wins: saved.wins.slice(0, STICKY_MAX).map(normalizeStickyWin) };
                }
                const old = JSON.parse(localStorage.getItem('stickyMemoUI') || 'null');
                if (old && typeof old === 'object') {
                    const win = normalizeStickyWin(Object.assign({}, old, { pageId: localStorage.getItem('stickyMemoPageId') }));
                    localStorage.removeItem('stickyMemoUI');
                    localStorage.removeItem('stickyMemoPageId');
                    return { visible: !!old.open, wins: old.open ? [win] : [] };
                }
            } catch (e) { /* 저장값이 깨졌으면 빈 목록으로 시작 */ }
            return { visible: true, wins: [] };
        })();

        let stickyAvailable = false;
        const stickySaveTimers = new Map(); // 창 id → 대기 중인 저장 타이머

        function saveStickyStore() {
            safeSetItem('stickyMemoWindows', JSON.stringify(stickyStore));
        }

        function getStickyWin(id) { return stickyStore.wins.find(w => w.id === id) || null; }
        function getStickyEl(id) { return document.querySelector(`.sticky-memo[data-sid="${id}"]`); }
        function getStickyEditor(id) { const el = getStickyEl(id); return el ? el.querySelector('.sticky-editor') : null; }

        // 창이 띄운 메모 페이지. 없으면(삭제됐거나 서버 데이터를 아직 못 받음) 탭에서 보던 메모 → 첫 메모를 대신 보여줌.
        // 저장된 선택(win.pageId)은 바꾸지 않아서, 서버 데이터가 도착해 그 메모가 생기면 원래 메모로 돌아옴
        function getStickyPage(win) {
            if (!win || !Array.isArray(freeNotesPages) || freeNotesPages.length === 0) return null;
            return freeNotesPages.find(p => p.id === win.pageId)
                || freeNotesPages.find(p => p.id === currentFreeNotesPageId) || freeNotesPages[0];
        }

        function getStickyPageId(win) { const p = getStickyPage(win); return p ? p.id : null; }

        // ---- 보이기/숨기기 ----
        function updateStickyMemoAvailability() {
            const btn = document.getElementById('stickyMemoToggleBtn');
            if (!btn) return;
            stickyAvailable = !!(editUnlocked && currentEmployeeId)
                && !isFeatureDisabled('freeNotes') && !isFeatureDisabled('stickyMemo')
                && !(Array.isArray(disabledTabIds) && disabledTabIds.includes('notes'));
            btn.hidden = !stickyAvailable;
            const show = stickyAvailable && stickyStore.visible && stickyStore.wins.length > 0;
            if (show) renderAllStickyWindows();
            else removeAllStickyWindowEls();
            btn.classList.toggle('active', show);
            btn.setAttribute('aria-pressed', show ? 'true' : 'false');
            const count = stickyStore.wins.length;
            btn.title = count === 0 ? '스티커 메모 열기 (Alt+M)'
                : (show ? `스티커 메모 ${count}장 모두 숨기기 (Alt+M)` : `스티커 메모 ${count}장 다시 보이기 (Alt+M)`);
        }

        // 상단 바 버튼·Alt+M: 띄운 창이 없으면 1장 열고, 있으면 배치를 그대로 둔 채 전부 숨기기/다시 보이기
        function toggleStickyMemo() {
            if (!stickyAvailable) return;
            if (window.innerWidth < 768) { showAppToast('좁은 화면에서는 할일 & 메모 탭을 이용해주세요', 'info'); return; }
            if (stickyStore.wins.length === 0) {
                const win = normalizeStickyWin({ id: newStickyWinId() });
                win.pageId = getStickyPageId(win);
                stickyStore.wins.push(win);
                stickyStore.visible = true;
                saveStickyStore();
                updateStickyMemoAvailability();
                focusStickyEditor(win.id);
                return;
            }
            if (stickyStore.visible) flushAllStickySaves();
            stickyStore.visible = !stickyStore.visible;
            saveStickyStore();
            updateStickyMemoAvailability();
        }

        // 제목 줄 '새 스티커 창': 기준 창에서 계단식으로 어긋난 자리에, 다른 색·아직 안 띄운 메모로 엶
        function openNewStickyWindow(fromId) {
            if (!checkEditPermission()) return;
            if (stickyStore.wins.length >= STICKY_MAX) { showAppToast(`스티커 메모는 최대 ${STICKY_MAX}장까지 띄울 수 있습니다`, 'info'); return; }
            const base = getStickyWin(fromId) || stickyStore.wins[stickyStore.wins.length - 1] || STICKY_DEFAULT_WIN;
            const baseEl = getStickyEl(fromId);
            const rect = baseEl ? baseEl.getBoundingClientRect() : null;
            const shown = new Set(stickyStore.wins.map(getStickyPageId));
            const freePage = (freeNotesPages || []).find(p => !shown.has(p.id));
            const pastel = STICKY_COLORS.slice(0, 5);
            const win = normalizeStickyWin({
                id: newStickyWinId(),
                pageId: freePage ? freePage.id : getStickyPageId(base),
                w: base.w, h: base.h, alpha: base.alpha, font: base.font,
                color: pastel[(pastel.indexOf(base.color) + 1) % pastel.length]
            });
            // 실제 화면 좌표 기준으로 오른쪽 아래로 어긋나게 둔 뒤, 저장 형식으로 바꿈(화면 밖이면 왼쪽 위로 어긋나게)
            const vw = window.innerWidth, vh = window.innerHeight;
            let left = rect ? rect.left + STICKY_CASCADE : vw - win.w - 24;
            let top = rect ? rect.top + STICKY_CASCADE : 120;
            if (left + win.w > vw) left = Math.max(0, (rect ? rect.left : vw) - STICKY_CASCADE * 2);
            if (top + 80 > vh) top = Math.max(0, (rect ? rect.top : 120) - STICKY_CASCADE * 2);
            setStickyWinRect(win, left, top, win.w, win.h);
            stickyStore.wins.push(win);
            stickyStore.visible = true;
            saveStickyStore();
            updateStickyMemoAvailability();
            focusStickyEditor(win.id);
        }

        // 창 하나만 완전히 닫기(목록에서 지움)
        function closeStickyWindow(id) {
            flushStickySave(id);
            stickyStore.wins = stickyStore.wins.filter(w => w.id !== id);
            saveStickyStore();
            const el = getStickyEl(id);
            if (el) el.remove();
            updateStickyMemoAvailability();
        }

        function focusStickyEditor(id) {
            const win = getStickyWin(id);
            const editor = getStickyEditor(id);
            if (win && editor && !win.collapsed) editor.focus();
        }

        // ---- 창 그리기 ----
        function stickyWindowHtml(win) {
            const sid = escapeHtml(win.id);
            const arg = escapeForOnclickArg(win.id);
            const swatches = STICKY_COLORS.map(c => `<button type="button" class="sticky-swatch" data-color="${c}" onclick="setStickyColor('${arg}', '${c}')" title="${STICKY_COLOR_LABELS[c]}" aria-label="배경색 ${STICKY_COLOR_LABELS[c]}"></button>`).join('');
            return `<section class="sticky-memo" data-sid="${sid}" role="dialog" aria-label="스티커 메모">
                <div class="sticky-titlebar" title="끌어서 이동 · 더블클릭으로 접기">
                    <span class="sticky-grip" aria-hidden="true"></span>
                    <select class="sticky-page-select" aria-label="띄울 메모 선택"></select>
                    <span class="sticky-saved" aria-live="polite">저장됨</span>
                    <button type="button" class="sticky-icon-btn sticky-bar-extra" onclick="addStickyPage('${arg}')" title="새 메모 페이지 만들기 (할일 & 메모 탭에도 추가)" aria-label="새 메모 페이지 만들기">${icon('file-plus')}</button>
                    <button type="button" class="sticky-icon-btn sticky-newwin-btn" onclick="openNewStickyWindow('${arg}')" title="새 스티커 창 열기 (최대 ${STICKY_MAX}장)" aria-label="새 스티커 창 열기">${icon('copy-plus')}</button>
                    <button type="button" class="sticky-icon-btn sticky-bar-extra" onclick="openStickyPageInTab('${arg}')" title="할일 & 메모 탭에서 열기" aria-label="할일 & 메모 탭에서 열기">${icon('external-link')}</button>
                    <button type="button" class="sticky-icon-btn sticky-more-btn" onclick="toggleStickyMenu('${arg}')" title="색·투명도·글자 크기" aria-label="색·투명도·글자 크기" aria-haspopup="true" aria-expanded="false">${icon('ellipsis')}</button>
                    <button type="button" class="sticky-icon-btn sticky-collapse-btn" onclick="toggleStickyCollapsed('${arg}')" title="접기 (제목 줄만 남김)" aria-label="접기/펼치기" aria-expanded="true">${icon('chevron-right')}</button>
                    <button type="button" class="sticky-icon-btn" onclick="closeStickyWindow('${arg}')" title="이 스티커 창 닫기" aria-label="이 스티커 창 닫기">${icon('x')}</button>
                </div>
                <div class="sticky-menu" role="group" aria-label="스티커 꾸미기" hidden>
                    <div class="sticky-menu-row"><span class="sticky-menu-label">배경색</span><div class="sticky-swatches">${swatches}</div></div>
                    <label class="sticky-menu-row" title="배경 투명도 (글자는 그대로 선명)"><span class="sticky-menu-label">투명도</span>
                        <input type="range" class="sticky-alpha-input" min="30" max="100" step="5" aria-label="배경 투명도"><span class="sticky-alpha-value"></span></label>
                    <div class="sticky-menu-row"><span class="sticky-menu-label">글자 크기</span>
                        <button type="button" class="sticky-icon-btn" onclick="changeStickyFont('${arg}', -1)" title="글자 작게" aria-label="글자 작게">A−</button>
                        <span class="sticky-font-value"></span>
                        <button type="button" class="sticky-icon-btn" onclick="changeStickyFont('${arg}', 1)" title="글자 크게" aria-label="글자 크게">A+</button></div>
                    <div class="sticky-menu-row sticky-menu-actions">
                        <button type="button" class="sticky-menu-action" onclick="closeStickyMenus(); addStickyPage('${arg}')">${icon('file-plus')}새 메모</button>
                        <button type="button" class="sticky-menu-action" onclick="closeStickyMenus(); openStickyPageInTab('${arg}')">${icon('external-link')}탭에서 열기</button></div>
                </div>
                <div class="sticky-editor" contenteditable="true" spellcheck="false" data-placeholder="여기에 메모하면 할일 & 메모 탭에도 저장됩니다"></div>
                <span class="sticky-resize" data-dir="e" aria-hidden="true"></span>
                <span class="sticky-resize" data-dir="s" aria-hidden="true"></span>
                <span class="sticky-resize" data-dir="se" aria-hidden="true"></span>
            </section>`;
        }

        // 목록과 화면을 맞춤: 없는 창은 만들고, 목록에서 빠진 창은 지우고, 순서대로 겹침 순서를 매김
        function renderAllStickyWindows() {
            const ids = new Set(stickyStore.wins.map(w => w.id));
            document.querySelectorAll('.sticky-memo[data-sid]').forEach(el => { if (!ids.has(el.dataset.sid)) el.remove(); });
            stickyStore.wins.forEach((win, i) => {
                let el = getStickyEl(win.id);
                if (!el) {
                    const holder = document.createElement('div');
                    holder.innerHTML = stickyWindowHtml(win);
                    el = holder.firstElementChild;
                    document.body.appendChild(el);
                    setupStickyWindowEl(el, win.id);
                    renderStickyPageSelect(win.id);
                    renderStickyContent(win.id, true);
                }
                el.style.zIndex = String(STICKY_Z_BASE + i);
                el.classList.toggle('is-front', i === stickyStore.wins.length - 1);
                applyStickyAppearance(win.id);
                applyStickyGeometry(win.id);
            });
            const max = stickyStore.wins.length >= STICKY_MAX;
            document.querySelectorAll('.sticky-newwin-btn').forEach(b => {
                b.classList.toggle('is-maxed', max);
                b.title = max ? `스티커 창은 최대 ${STICKY_MAX}장까지 열 수 있습니다` : `새 스티커 창 열기 (최대 ${STICKY_MAX}장)`;
            });
        }

        function removeAllStickyWindowEls() {
            document.querySelectorAll('.sticky-memo[data-sid]').forEach(el => el.remove());
        }

        // 클릭·끌기한 창을 다른 스티커 위로(목록 맨 뒤 = 맨 위)
        function bringStickyToFront(id) {
            const idx = stickyStore.wins.findIndex(w => w.id === id);
            if (idx === -1 || idx === stickyStore.wins.length - 1) return;
            const [win] = stickyStore.wins.splice(idx, 1);
            stickyStore.wins.push(win);
            saveStickyStore();
            stickyStore.wins.forEach((w, i) => {
                const el = getStickyEl(w.id);
                if (el) { el.style.zIndex = String(STICKY_Z_BASE + i); el.classList.toggle('is-front', i === stickyStore.wins.length - 1); }
            });
        }

        // ---- 모양(색·투명도·글자 크기·접힘) ----
        function applyStickyAppearance(id) {
            const win = getStickyWin(id), el = getStickyEl(id);
            if (!win || !el) return;
            el.dataset.color = win.color;
            el.style.setProperty('--sticky-alpha', win.alpha + '%');
            el.style.setProperty('--sticky-font', win.font + 'px');
            el.classList.toggle('is-collapsed', win.collapsed);
            el.querySelectorAll('.sticky-swatch').forEach(sw => {
                const on = sw.dataset.color === win.color;
                sw.classList.toggle('selected', on);
                sw.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
            el.querySelector('.sticky-alpha-input').value = win.alpha;
            el.querySelector('.sticky-alpha-value').textContent = win.alpha + '%';
            el.querySelector('.sticky-font-value').textContent = win.font + 'px';
            const collapseBtn = el.querySelector('.sticky-collapse-btn');
            collapseBtn.setAttribute('aria-expanded', win.collapsed ? 'false' : 'true');
            collapseBtn.title = win.collapsed ? '펼치기' : '접기 (제목 줄만 남김)';
        }

        function updateStickyWin(id, patch) {
            const win = getStickyWin(id);
            if (!win) return;
            Object.assign(win, patch);
            saveStickyStore();
            applyStickyAppearance(id);
        }

        function setStickyColor(id, color) { if (STICKY_COLORS.includes(color)) updateStickyWin(id, { color }); }
        function setStickyAlpha(id, value) { updateStickyWin(id, { alpha: Math.min(100, Math.max(30, Math.round(Number(value) || 100))) }); }
        function changeStickyFont(id, delta) {
            const win = getStickyWin(id);
            if (!win) return;
            const idx = STICKY_FONT_SIZES.indexOf(win.font);
            updateStickyWin(id, { font: STICKY_FONT_SIZES[Math.min(STICKY_FONT_SIZES.length - 1, Math.max(0, idx + delta))] });
        }
        function toggleStickyCollapsed(id) {
            const win = getStickyWin(id);
            if (!win) return;
            closeStickyMenus();
            updateStickyWin(id, { collapsed: !win.collapsed });
            applyStickyGeometry(id);
        }

        // '…' 메뉴(색·투명도·글자 크기)
        function toggleStickyMenu(id) {
            const el = getStickyEl(id);
            if (!el) return;
            const menu = el.querySelector('.sticky-menu');
            const open = menu.hidden;
            closeStickyMenus();
            if (open) {
                bringStickyToFront(id); // 키보드로 열어도 다른 창에 가려지지 않게
                if (getStickyWin(id).collapsed) toggleStickyCollapsed(id);
                menu.hidden = false;
                el.querySelector('.sticky-more-btn').setAttribute('aria-expanded', 'true');
                const first = menu.querySelector('.sticky-swatch.selected') || menu.querySelector('button');
                if (first) first.focus();
            }
        }
        function closeStickyMenus() {
            document.querySelectorAll('.sticky-memo .sticky-menu:not([hidden])').forEach(m => {
                m.hidden = true;
                const btn = m.closest('.sticky-memo').querySelector('.sticky-more-btn');
                if (btn) btn.setAttribute('aria-expanded', 'false');
            });
        }
        document.addEventListener('pointerdown', (e) => {
            if (!e.target.closest || (!e.target.closest('.sticky-menu') && !e.target.closest('.sticky-more-btn'))) closeStickyMenus();
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeStickyMenus(); });

        // ---- 위치·크기 ----
        // 저장값(왼쪽/오른쪽 끝 기준 거리)을 지금 창 크기에 맞춰 실제 좌표로 바꾸고 화면 밖이면 보정.
        // 보정은 화면에만 적용하고 저장값은 그대로 둬서, 큰 모니터로 돌아가면 원래 자리에 다시 나타남
        function applyStickyGeometry(id) {
            const win = getStickyWin(id), el = getStickyEl(id);
            if (!win || !el) return;
            const vw = window.innerWidth, vh = window.innerHeight;
            const w = Math.max(STICKY_MIN_W, Math.min(win.w, vw - 16));
            const fullH = Math.max(STICKY_MIN_H, Math.min(win.h, vh - 16));
            let left = win.side === 'left' ? win.offset : vw - w - win.offset;
            left = Math.max(0, Math.min(left, vw - w));
            el.style.width = w + 'px';
            el.style.height = win.collapsed ? '' : fullH + 'px';
            const h = win.collapsed ? el.offsetHeight : fullH;
            el.style.left = left + 'px';
            el.style.top = Math.max(0, Math.min(win.y, vh - h)) + 'px';
            el.classList.toggle('is-snapped-left', left === 0);
            el.classList.toggle('is-snapped-right', left + w >= vw);
        }

        // 실제 좌표를 저장 형식(가까운 쪽 끝 기준 거리)으로 바꿈. 끝에서 STICKY_SNAP 안이면 끝에 붙임
        function setStickyWinRect(win, left, top, w, h) {
            const vw = window.innerWidth;
            const toRight = vw - (left + w);
            if (left + w / 2 <= vw / 2) { win.side = 'left'; win.offset = left <= STICKY_SNAP ? 0 : Math.round(left); }
            else { win.side = 'right'; win.offset = toRight <= STICKY_SNAP ? 0 : Math.round(toRight); }
            win.y = Math.round(Math.max(0, top));
            win.w = Math.round(w);
            if (!win.collapsed) win.h = Math.round(h);
        }

        function commitStickyEl(id) {
            const win = getStickyWin(id), el = getStickyEl(id);
            if (!win || !el) return;
            const r = el.getBoundingClientRect();
            setStickyWinRect(win, r.left, r.top, r.width, r.height);
            saveStickyStore();
            applyStickyGeometry(id);
        }

        function trackPointer(target, e, onMove, onEnd) {
            target.setPointerCapture(e.pointerId);
            const up = () => {
                target.removeEventListener('pointermove', onMove);
                target.removeEventListener('pointerup', up);
                target.removeEventListener('pointercancel', up);
                onEnd();
            };
            target.addEventListener('pointermove', onMove);
            target.addEventListener('pointerup', up);
            target.addEventListener('pointercancel', up);
        }

        function setupStickyWindowEl(el, id) {
            const bar = el.querySelector('.sticky-titlebar');
            const editor = el.querySelector('.sticky-editor');
            const select = el.querySelector('.sticky-page-select');

            // 창 어디든 누르면 앞으로
            el.addEventListener('pointerdown', () => bringStickyToFront(id), true);

            bar.addEventListener('pointerdown', (e) => {
                if (e.button !== 0 || e.target.closest('button, select, input, label')) return;
                e.preventDefault();
                const rect = el.getBoundingClientRect();
                const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
                el.classList.add('is-dragging');
                trackPointer(bar, e, (ev) => {
                    const vw = window.innerWidth, vh = window.innerHeight;
                    let left = Math.max(0, Math.min(ev.clientX - dx, vw - rect.width));
                    if (left <= STICKY_SNAP) left = 0; // 끄는 중에도 끝에 붙는 자리를 미리 보여줌
                    else if (vw - (left + rect.width) <= STICKY_SNAP) left = vw - rect.width;
                    el.style.left = left + 'px';
                    el.style.top = Math.max(0, Math.min(ev.clientY - dy, vh - 40)) + 'px';
                }, () => { el.classList.remove('is-dragging'); commitStickyEl(id); });
            });
            bar.addEventListener('dblclick', (e) => {
                if (e.target.closest('button, select, input, label')) return;
                toggleStickyCollapsed(id);
            });

            el.querySelectorAll('.sticky-resize').forEach(handle => {
                handle.addEventListener('pointerdown', (e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    const dir = handle.dataset.dir;
                    const rect = el.getBoundingClientRect();
                    const sx = e.clientX, sy = e.clientY;
                    el.classList.add('is-resizing');
                    trackPointer(handle, e, (ev) => {
                        if (dir.includes('e')) el.style.width = Math.max(STICKY_MIN_W, Math.min(rect.width + ev.clientX - sx, window.innerWidth - rect.left)) + 'px';
                        if (dir.includes('s')) el.style.height = Math.max(STICKY_MIN_H, Math.min(rect.height + ev.clientY - sy, window.innerHeight - rect.top)) + 'px';
                    }, () => { el.classList.remove('is-resizing'); commitStickyEl(id); });
                });
            });

            editor.addEventListener('input', () => scheduleStickySave(id));
            editor.addEventListener('paste', (e) => handleStickyImagePaste(e, id));
            editor.addEventListener('blur', () => flushStickySave(id));
            // 다른 편집 칸에 덜 저장된 내용이 있으면 먼저 저장한 뒤, 이 칸을 최신 내용으로 맞춤
            editor.addEventListener('focus', () => {
                flushOtherEditorSaves(id);
                const page = getStickyPage(getStickyWin(id));
                if (page && editor.innerHTML !== toDisplayNotesHtml(page.content)) renderStickyContent(id, true);
            });
            select.addEventListener('change', () => selectStickyPage(id, select.value));
            const slider = el.querySelector('.sticky-alpha-input');
            slider.addEventListener('input', () => setStickyAlpha(id, slider.value));
        }

        window.addEventListener('resize', () => { stickyStore.wins.forEach(w => applyStickyGeometry(w.id)); });

        // ---- 메모 페이지 선택·내용 ----
        function renderStickyPageSelect(id) {
            const el = getStickyEl(id);
            if (!el) return;
            const select = el.querySelector('.sticky-page-select');
            const current = getStickyPage(getStickyWin(id));
            const folders = new Map();
            (freeNotesPages || []).forEach(p => {
                const f = p.folder || '';
                if (!folders.has(f)) folders.set(f, []);
                folders.get(f).push(p);
            });
            const opt = p => `<option value="${escapeHtml(p.id)}"${current && p.id === current.id ? ' selected' : ''}>${escapeHtml(p.name || '메모장')}</option>`;
            select.innerHTML = Array.from(folders, ([folder, pages]) => folder
                ? `<optgroup label="${escapeHtml(folder)}">${pages.map(opt).join('')}</optgroup>`
                : pages.map(opt).join('')).join('');
        }

        function wireStickyImages(editor, id) {
            editor.querySelectorAll('img.note-image').forEach(img => {
                img.addEventListener('click', (e) => { e.stopPropagation(); openImageLightbox(img.src); });
                observeImageResize(img, () => scheduleStickySave(id));
            });
        }

        // force가 아니면 그 창에서 입력 중일 때는 다시 그리지 않음(커서·입력 보호)
        function renderStickyContent(id, force) {
            const editor = getStickyEditor(id);
            if (!editor) return;
            if (!force && document.activeElement === editor) return;
            const page = getStickyPage(getStickyWin(id));
            const html = toDisplayNotesHtml(page ? page.content : ''); // sanitizeNotesHtml로 위험한 태그를 걸러서 표시
            if (editor.innerHTML !== html) {
                editor.innerHTML = html;
                wireStickyImages(editor, id);
            }
            editor.contentEditable = editUnlocked ? 'true' : 'false';
        }

        function selectStickyPage(id, pageId) {
            const win = getStickyWin(id);
            if (!win || !freeNotesPages.some(p => p.id === pageId)) return;
            flushStickySave(id);
            win.pageId = pageId;
            saveStickyStore();
            const el = getStickyEl(id);
            const select = el && el.querySelector('.sticky-page-select');
            if (select && select.value !== pageId) select.value = pageId;
            renderStickyContent(id, true);
        }

        function addStickyPage(id) {
            if (!checkEditPermission()) return;
            const win = getStickyWin(id);
            if (!win) return;
            flushAllStickySaves();
            if (typeof flushNotesSave === 'function') flushNotesSave();
            const base = getStickyPage(win);
            const page = {
                id: 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                name: '메모장 ' + (freeNotesPages.length + 1),
                content: '',
                folder: (base && base.folder) || ''
            };
            freeNotesPages.push(page);
            win.pageId = page.id;
            saveStickyStore();
            safeSetItem('freeNotesPages', JSON.stringify(freeNotesPages));
            queueSync();
            renderFreeNotesPageTabs(); // 탭의 메모 목록에도 바로 보이게(이 함수가 스티커 목록도 다시 그림)
            renderStickyContent(id, true);
            focusStickyEditor(id);
        }

        function openStickyPageInTab(id) {
            flushStickySave(id);
            const page = getStickyPage(getStickyWin(id));
            if (!page) return;
            switchTab('notes');
            if (typeof switchFreeNotesPage === 'function') switchFreeNotesPage(page.id);
            const ta = document.getElementById('notesTextarea');
            if (ta) ta.focus();
        }

        // ---- 저장·동기화 ----
        function scheduleStickySave(id) {
            clearTimeout(stickySaveTimers.get(id));
            stickySaveTimers.set(id, setTimeout(() => runStickySave(id), 500));
        }

        function flushStickySave(id) {
            if (!stickySaveTimers.has(id)) return;
            clearTimeout(stickySaveTimers.get(id));
            runStickySave(id);
        }

        function flushAllStickySaves() { Array.from(stickySaveTimers.keys()).forEach(flushStickySave); }

        // 편집 칸 하나(스티커 id 또는 'tab')로 옮겨 가기 직전: 나머지 칸의 대기 중 저장을 먼저 처리
        function flushOtherEditorSaves(exceptId) {
            Array.from(stickySaveTimers.keys()).forEach(k => { if (k !== exceptId) flushStickySave(k); });
            if (exceptId !== 'tab' && typeof flushNotesSave === 'function') flushNotesSave();
        }

        function runStickySave(id) {
            stickySaveTimers.delete(id);
            const editor = getStickyEditor(id);
            const page = getStickyPage(getStickyWin(id));
            if (!editor || !page) return;
            page.content = editor.innerHTML;
            // 탭에서 같은 메모를 보고 있으면 탭 쪽 변수·화면도 맞춤(탭에서 입력 중이면 화면은 건드리지 않음)
            if (page.id === currentFreeNotesPageId) {
                notesContent = page.content;
                const ta = document.getElementById('notesTextarea');
                if (ta && document.activeElement !== ta) {
                    ta.innerHTML = toDisplayNotesHtml(page.content);
                    wireUpNoteImages();
                }
            }
            refreshStickyWindowsForPage(page.id, id);
            safeSetItem('freeNotesPages', JSON.stringify(freeNotesPages));
            queueSync();
            const ind = getStickyEl(id) && getStickyEl(id).querySelector('.sticky-saved');
            if (ind) { ind.classList.add('show'); setTimeout(() => ind.classList.remove('show'), 1200); }
        }

        // 같은 메모를 띄운 다른 스티커 창들을 새 내용으로(입력 중인 창은 제외)
        function refreshStickyWindowsForPage(pageId, exceptId) {
            stickyStore.wins.forEach(w => {
                if (w.id !== exceptId && getStickyPageId(w) === pageId) renderStickyContent(w.id, false);
            });
        }

        // 탭의 메모장에서 저장했을 때(js/todo-memo.js) 호출됨
        function stickyMemoOnTabSaved(pageId) { refreshStickyWindowsForPage(pageId, null); }

        // 메모 목록이 바뀌었을 때(추가·이름 변경·삭제·서버에서 새로 받음) 호출됨. 삭제된 메모를 띄운 창은 다른 메모로 바뀜
        function stickyMemoOnPagesChanged() {
            stickyStore.wins.forEach(w => {
                if (!getStickyEl(w.id)) return;
                renderStickyPageSelect(w.id);
                renderStickyContent(w.id, false);
            });
        }

        async function handleStickyImagePaste(e, id) {
            const file = extractPastedImageFile(e);
            if (!file) return;
            e.preventDefault();
            if (!checkEditPermission()) return;
            const editor = e.currentTarget;
            const placeholder = document.createElement('span');
            placeholder.textContent = '이미지 업로드 중...';
            placeholder.className = 'note-image-uploading';
            insertNodeAtCaret(editor, placeholder);
            try {
                const { dataUrl, width, height } = await resizeImageFileToDataUrl(file, 1600, 0.82);
                const result = await uploadImageToDrive(dataUrl);
                const img = document.createElement('img');
                img.src = result.url;
                img.className = 'note-image';
                img.alt = '첨부 이미지';
                const initialWidth = Math.min(width || 240, 240);
                img.style.width = initialWidth + 'px';
                img.style.height = Math.round(initialWidth * ((width && height) ? height / width : 0.75)) + 'px';
                placeholder.replaceWith(img);
                wireStickyImages(editor, id);
            } catch (err) {
                console.error('스티커 메모 이미지 업로드 실패:', err);
                placeholder.textContent = '이미지 업로드 실패';
            }
            scheduleStickySave(id);
        }

        (function setupStickyMemo() {
            const ta = document.getElementById('notesTextarea');
            if (ta) ta.addEventListener('focus', () => {
                flushOtherEditorSaves('tab');
                const page = freeNotesPages.find(p => p.id === currentFreeNotesPageId);
                if (page && ta.innerHTML !== toDisplayNotesHtml(page.content)) {
                    ta.innerHTML = toDisplayNotesHtml(page.content);
                    wireUpNoteImages();
                }
            });
            window.addEventListener('beforeunload', flushAllStickySaves);
        })();
