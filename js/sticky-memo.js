        // ===== 플로팅 스티커 메모 =====
        // 어느 탭에서든 화면 위에 띄워 두고 쓰는 메모 창. 데이터는 '할일 & 메모' 탭의 freeNotesPages를 그대로 씀
        // (저장 경로도 같음: 0.5초 뒤 freeNotesPages 반영 → 브라우저 저장소 → queueSync로 서버 동기화).
        // 창 위치·크기·색 같은 화면 설정은 모니터마다 다를 수 있어 이 기기에만 저장(stickyMemoUI),
        // 띄워 둔 메모 페이지는 계정별 정보라 따로 저장하고 로그아웃 때 지움(stickyMemoPageId).

        const STICKY_COLORS = ['yellow', 'mint', 'sky', 'pink', 'lavender', 'default'];
        const STICKY_COLOR_LABELS = { yellow: '노랑', mint: '민트', sky: '하늘', pink: '분홍', lavender: '라벤더', default: '기본' };
        const STICKY_FONT_SIZES = [12, 13, 14, 16, 18, 20];
        const STICKY_MIN_W = 240;
        const STICKY_MIN_H = 180;
        const STICKY_SNAP = 24; // 화면 좌우 끝에서 이 거리 안에 놓으면 끝에 딱 붙임
        const STICKY_MARGIN = 8;

        const STICKY_DEFAULT_STATE = {
            open: false, collapsed: false,
            side: 'right', offset: 24, y: 120, w: 320, h: 360, // side 쪽 화면 끝에서 offset만큼 떨어진 위치
            color: 'yellow', alpha: 100, font: 14
        };

        let stickyState = Object.assign({}, STICKY_DEFAULT_STATE, (function () {
            try {
                const saved = JSON.parse(localStorage.getItem('stickyMemoUI') || '{}');
                return (saved && typeof saved === 'object') ? saved : {};
            } catch (e) { return {}; }
        })());
        if (!STICKY_COLORS.includes(stickyState.color)) stickyState.color = 'yellow';
        if (!STICKY_FONT_SIZES.includes(stickyState.font)) stickyState.font = 14;
        stickyState.alpha = Math.min(100, Math.max(30, Number(stickyState.alpha) || 100));
        if (stickyState.side !== 'left') stickyState.side = 'right';

        let stickyPageId = (function () { try { return localStorage.getItem('stickyMemoPageId') || null; } catch (e) { return null; } })();
        let stickySaveTimeout = null;
        let stickyAvailable = false;

        function saveStickyState() {
            const { open, collapsed, side, offset, y, w, h, color, alpha, font } = stickyState;
            safeSetItem('stickyMemoUI', JSON.stringify({ open, collapsed, side, offset, y, w, h, color, alpha, font }));
        }

        function getStickyEls() {
            return {
                win: document.getElementById('stickyMemo'),
                editor: document.getElementById('stickyMemoEditor'),
                select: document.getElementById('stickyMemoPageSelect'),
                btn: document.getElementById('stickyMemoToggleBtn')
            };
        }

        function getStickyPage() {
            if (!Array.isArray(freeNotesPages) || freeNotesPages.length === 0) return null;
            let page = freeNotesPages.find(p => p.id === stickyPageId);
            if (!page) {
                page = freeNotesPages.find(p => p.id === currentFreeNotesPageId) || freeNotesPages[0];
                stickyPageId = page.id;
            }
            return page;
        }

        // ---- 보이기/숨기기 ----
        // 로그인했고, '할일 & 메모' 탭·메모장·스티커 메모 기능이 모두 켜져 있을 때만 사용 가능 (좁은 화면은 CSS로 숨김)
        function updateStickyMemoAvailability() {
            const { win, btn } = getStickyEls();
            if (!win || !btn) return;
            stickyAvailable = !!(editUnlocked && currentEmployeeId)
                && !isFeatureDisabled('freeNotes') && !isFeatureDisabled('stickyMemo')
                && !(Array.isArray(disabledTabIds) && disabledTabIds.includes('notes'));
            btn.hidden = !stickyAvailable;
            const show = stickyAvailable && stickyState.open;
            if (show && win.hidden) {
                win.hidden = false;
                renderStickyPageSelect();
                renderStickyContent(true);
                applyStickyAppearance();
                applyStickyGeometry();
            } else if (!show && !win.hidden) {
                flushStickySave();
                win.hidden = true;
            }
            btn.classList.toggle('active', show);
            btn.setAttribute('aria-pressed', show ? 'true' : 'false');
        }

        function toggleStickyMemo(force) {
            if (!stickyAvailable) return;
            const next = typeof force === 'boolean' ? force : !stickyState.open;
            if (next && window.innerWidth < 768) { showAppToast('좁은 화면에서는 할일 & 메모 탭을 이용해주세요', 'info'); return; }
            stickyState.open = next;
            saveStickyState();
            updateStickyMemoAvailability();
            if (next && !stickyState.collapsed) {
                const { editor } = getStickyEls();
                if (editor) editor.focus();
            }
        }

        function toggleStickyCollapsed() {
            stickyState.collapsed = !stickyState.collapsed;
            saveStickyState();
            applyStickyAppearance();
            applyStickyGeometry();
        }

        // ---- 모양(색·투명도·글자 크기·접힘) ----
        function applyStickyAppearance() {
            const { win } = getStickyEls();
            if (!win) return;
            win.dataset.color = stickyState.color;
            win.style.setProperty('--sticky-alpha', stickyState.alpha + '%');
            win.style.setProperty('--sticky-font', stickyState.font + 'px');
            win.classList.toggle('is-collapsed', !!stickyState.collapsed);
            win.querySelectorAll('.sticky-swatch').forEach(sw => {
                const on = sw.dataset.color === stickyState.color;
                sw.classList.toggle('selected', on);
                sw.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
            const slider = document.getElementById('stickyMemoAlpha');
            if (slider) slider.value = stickyState.alpha;
            const alphaLabel = document.getElementById('stickyMemoAlphaLabel');
            if (alphaLabel) alphaLabel.textContent = stickyState.alpha + '%';
            const collapseBtn = document.getElementById('stickyMemoCollapseBtn');
            if (collapseBtn) {
                collapseBtn.setAttribute('aria-expanded', stickyState.collapsed ? 'false' : 'true');
                collapseBtn.title = stickyState.collapsed ? '펼치기' : '접기 (제목 줄만 남김)';
            }
        }

        function setStickyColor(color) {
            if (!STICKY_COLORS.includes(color)) return;
            stickyState.color = color;
            saveStickyState();
            applyStickyAppearance();
        }

        function setStickyAlpha(value) {
            stickyState.alpha = Math.min(100, Math.max(30, Math.round(Number(value) || 100)));
            saveStickyState();
            applyStickyAppearance();
        }

        function changeStickyFont(delta) {
            const idx = STICKY_FONT_SIZES.indexOf(stickyState.font);
            const next = STICKY_FONT_SIZES[Math.min(STICKY_FONT_SIZES.length - 1, Math.max(0, idx + delta))];
            stickyState.font = next;
            saveStickyState();
            applyStickyAppearance();
        }

        // ---- 위치·크기 ----
        // 저장된 값(왼쪽/오른쪽 끝 기준 거리)을 지금 창 크기에 맞춰 실제 좌표로 바꾸고, 화면 밖으로 나가지 않게 보정함.
        // 보정은 화면에만 적용하고 저장값은 그대로 둬서, 큰 모니터로 돌아가면 원래 자리에 다시 나타남
        function applyStickyGeometry() {
            const { win } = getStickyEls();
            if (!win || win.hidden) return;
            const vw = window.innerWidth, vh = window.innerHeight;
            const w = Math.max(STICKY_MIN_W, Math.min(stickyState.w, vw - STICKY_MARGIN * 2));
            const fullH = Math.max(STICKY_MIN_H, Math.min(stickyState.h, vh - STICKY_MARGIN * 2));
            let left = stickyState.side === 'left' ? stickyState.offset : vw - w - stickyState.offset;
            left = Math.max(0, Math.min(left, vw - w));
            win.style.width = w + 'px';
            win.style.height = stickyState.collapsed ? '' : fullH + 'px';
            const h = stickyState.collapsed ? win.offsetHeight : fullH;
            const top = Math.max(0, Math.min(stickyState.y, vh - h));
            win.style.left = left + 'px';
            win.style.top = top + 'px';
            win.classList.toggle('is-snapped-left', left === 0);
            win.classList.toggle('is-snapped-right', left + w >= vw);
        }

        // 끌기를 마친 실제 좌표를 저장 형식(가까운 쪽 끝 기준 거리)으로 바꿈. 끝에서 STICKY_SNAP 안이면 끝에 붙임
        function commitStickyRect(left, top, w, h) {
            const vw = window.innerWidth;
            const toLeft = left, toRight = vw - (left + w);
            if (toLeft + w / 2 <= vw / 2) { stickyState.side = 'left'; stickyState.offset = toLeft <= STICKY_SNAP ? 0 : Math.round(toLeft); }
            else { stickyState.side = 'right'; stickyState.offset = toRight <= STICKY_SNAP ? 0 : Math.round(toRight); }
            stickyState.y = Math.round(Math.max(0, top));
            stickyState.w = Math.round(w);
            if (!stickyState.collapsed) stickyState.h = Math.round(h);
            saveStickyState();
            applyStickyGeometry();
        }

        function setupStickyDragAndResize() {
            const { win } = getStickyEls();
            if (!win) return;
            const bar = win.querySelector('.sticky-titlebar');

            bar.addEventListener('pointerdown', (e) => {
                if (e.button !== 0 || e.target.closest('button, select, input, label')) return;
                e.preventDefault();
                const rect = win.getBoundingClientRect();
                const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
                win.classList.add('is-dragging');
                bar.setPointerCapture(e.pointerId);
                const move = (ev) => {
                    const vw = window.innerWidth, vh = window.innerHeight;
                    let left = Math.max(0, Math.min(ev.clientX - dx, vw - rect.width));
                    const top = Math.max(0, Math.min(ev.clientY - dy, vh - 40));
                    // 끄는 중에도 끝 근처면 붙는 위치를 미리 보여줌
                    if (left <= STICKY_SNAP) left = 0;
                    else if (vw - (left + rect.width) <= STICKY_SNAP) left = vw - rect.width;
                    win.style.left = left + 'px';
                    win.style.top = top + 'px';
                };
                const up = () => {
                    bar.removeEventListener('pointermove', move);
                    bar.removeEventListener('pointerup', up);
                    bar.removeEventListener('pointercancel', up);
                    win.classList.remove('is-dragging');
                    const r = win.getBoundingClientRect();
                    commitStickyRect(r.left, r.top, r.width, r.height);
                };
                bar.addEventListener('pointermove', move);
                bar.addEventListener('pointerup', up);
                bar.addEventListener('pointercancel', up);
            });
            bar.addEventListener('dblclick', (e) => {
                if (e.target.closest('button, select, input, label')) return;
                toggleStickyCollapsed();
            });

            win.querySelectorAll('.sticky-resize').forEach(handle => {
                handle.addEventListener('pointerdown', (e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    const dir = handle.dataset.dir; // 'e' | 's' | 'se'
                    const rect = win.getBoundingClientRect();
                    const sx = e.clientX, sy = e.clientY;
                    win.classList.add('is-resizing');
                    handle.setPointerCapture(e.pointerId);
                    const move = (ev) => {
                        const vw = window.innerWidth, vh = window.innerHeight;
                        if (dir.includes('e')) win.style.width = Math.max(STICKY_MIN_W, Math.min(rect.width + ev.clientX - sx, vw - rect.left)) + 'px';
                        if (dir.includes('s')) win.style.height = Math.max(STICKY_MIN_H, Math.min(rect.height + ev.clientY - sy, vh - rect.top)) + 'px';
                    };
                    const up = () => {
                        handle.removeEventListener('pointermove', move);
                        handle.removeEventListener('pointerup', up);
                        handle.removeEventListener('pointercancel', up);
                        win.classList.remove('is-resizing');
                        const r = win.getBoundingClientRect();
                        commitStickyRect(r.left, r.top, r.width, r.height);
                    };
                    handle.addEventListener('pointermove', move);
                    handle.addEventListener('pointerup', up);
                    handle.addEventListener('pointercancel', up);
                });
            });

            window.addEventListener('resize', () => { applyStickyGeometry(); });
        }

        // ---- 메모 페이지 선택·내용 ----
        function renderStickyPageSelect() {
            const { select } = getStickyEls();
            if (!select) return;
            const current = getStickyPage();
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

        function wireStickyImages(editor) {
            editor.querySelectorAll('img.note-image').forEach(img => {
                img.addEventListener('click', (e) => { e.stopPropagation(); openImageLightbox(img.src); });
                observeImageResize(img, scheduleStickySave);
            });
        }

        // force가 아니면 사용자가 스티커에서 입력 중일 때는 다시 그리지 않음(커서·입력 보호)
        function renderStickyContent(force) {
            const { win, editor } = getStickyEls();
            if (!win || win.hidden || !editor) return;
            if (!force && document.activeElement === editor) return;
            const page = getStickyPage();
            const html = toDisplayNotesHtml(page ? page.content : ''); // sanitizeNotesHtml로 위험한 태그를 걸러서 표시
            if (editor.innerHTML !== html) {
                editor.innerHTML = html;
                wireStickyImages(editor);
            }
            editor.contentEditable = editUnlocked ? 'true' : 'false';
        }

        function selectStickyPage(pageId) {
            flushStickySave();
            if (!freeNotesPages.some(p => p.id === pageId)) return;
            stickyPageId = pageId;
            safeSetItem('stickyMemoPageId', stickyPageId);
            const { select } = getStickyEls();
            if (select && select.value !== pageId) select.value = pageId;
            renderStickyContent(true);
        }

        function addStickyPage() {
            if (!checkEditPermission()) return;
            flushStickySave();
            if (typeof flushNotesSave === 'function') flushNotesSave();
            const base = getStickyPage();
            const page = {
                id: 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                name: '메모장 ' + (freeNotesPages.length + 1),
                content: '',
                folder: (base && base.folder) || ''
            };
            freeNotesPages.push(page);
            stickyPageId = page.id;
            safeSetItem('stickyMemoPageId', stickyPageId);
            safeSetItem('freeNotesPages', JSON.stringify(freeNotesPages));
            queueSync();
            renderFreeNotesPageTabs(); // 탭의 메모 목록에도 바로 보이게(이 함수가 스티커 목록도 다시 그림)
            renderStickyContent(true);
            const { editor } = getStickyEls();
            if (editor) editor.focus();
        }

        function openStickyPageInTab() {
            flushStickySave();
            const page = getStickyPage();
            if (!page) return;
            switchTab('notes');
            if (typeof switchFreeNotesPage === 'function') switchFreeNotesPage(page.id);
            const ta = document.getElementById('notesTextarea');
            if (ta) ta.focus();
        }

        function scheduleStickySave() {
            clearTimeout(stickySaveTimeout);
            stickySaveTimeout = setTimeout(runStickySave, 500);
        }

        function flushStickySave() {
            if (!stickySaveTimeout) return;
            clearTimeout(stickySaveTimeout);
            runStickySave();
        }

        function runStickySave() {
            stickySaveTimeout = null;
            const { editor } = getStickyEls();
            const page = getStickyPage();
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
            safeSetItem('freeNotesPages', JSON.stringify(freeNotesPages));
            queueSync();
            const ind = document.getElementById('stickyMemoSaved');
            if (ind) { ind.classList.add('show'); setTimeout(() => ind.classList.remove('show'), 1200); }
        }

        // 탭의 메모장에서 저장했을 때(js/todo-memo.js) 호출됨: 같은 메모를 띄워 두었으면 스티커 내용도 맞춤
        function stickyMemoOnTabSaved(pageId) {
            const page = getStickyPage();
            if (page && page.id === pageId) renderStickyContent(false);
        }

        // 메모 목록이 바뀌었을 때(추가·이름 변경·삭제·서버에서 새로 받음) 호출됨
        function stickyMemoOnPagesChanged() {
            renderStickyPageSelect();
            renderStickyContent(false);
        }

        async function handleStickyImagePaste(e) {
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
                wireStickyImages(editor);
            } catch (err) {
                console.error('스티커 메모 이미지 업로드 실패:', err);
                placeholder.textContent = '이미지 업로드 실패';
            }
            scheduleStickySave();
        }

        function setupStickyMemo() {
            const { win, editor, select } = getStickyEls();
            if (!win || !editor) return;
            editor.addEventListener('input', scheduleStickySave);
            editor.addEventListener('paste', handleStickyImagePaste);
            editor.addEventListener('blur', flushStickySave);
            // 다른 편집 칸에 덜 저장된 내용이 있으면 먼저 저장한 뒤, 이 칸을 최신 내용으로 맞춤
            editor.addEventListener('focus', () => {
                if (typeof flushNotesSave === 'function') flushNotesSave();
                const page = getStickyPage();
                if (page && editor.innerHTML !== toDisplayNotesHtml(page.content)) renderStickyContent(true);
            });
            const ta = document.getElementById('notesTextarea');
            if (ta) ta.addEventListener('focus', () => {
                flushStickySave();
                const page = freeNotesPages.find(p => p.id === currentFreeNotesPageId);
                if (page && ta.innerHTML !== toDisplayNotesHtml(page.content)) {
                    ta.innerHTML = toDisplayNotesHtml(page.content);
                    wireUpNoteImages();
                }
            });
            if (select) select.addEventListener('change', () => selectStickyPage(select.value));
            const slider = document.getElementById('stickyMemoAlpha');
            if (slider) slider.addEventListener('input', () => setStickyAlpha(slider.value));
            setupStickyDragAndResize();
            applyStickyAppearance();
            window.addEventListener('beforeunload', flushStickySave);
        }

        setupStickyMemo();
