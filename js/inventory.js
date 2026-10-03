        // ===== 재고 관리 (약품·소모품·부품) =====
        // 현재 재고는 따로 저장하지 않고 품목마다 쌓인 입출고 기록(logs)을 날짜순으로 합산해서 계산함.
        // 그래야 기록을 지우거나 고쳐도 숫자가 어긋나지 않음. 실사(adjust)는 "그날 세어 본 실제 수량"이라
        // 그 시점의 재고를 그 값으로 맞추고, 이후 기록을 이어서 더하고 뺌
        // 소진 예측은 AI가 아니라 최근 사용 기록의 하루 평균으로 계산함(근거가 분명하고 지어낼 여지가 없음)
        // 분류는 사용자가 직접 만듦(inventoryCategories). 품목에 쓰였지만 목록에 없는 분류(예전 기본 분류 등)도 함께 보여줌
        const INVENTORY_UNCATEGORIZED = '__none__'; // 필터에서 "미분류"를 뜻하는 값 (분류 이름과 겹치지 않게)
        const INVENTORY_NEW_CATEGORY = '__new__'; // 품목 창 분류 선택의 "직접 입력"
        const INVENTORY_CATEGORY_MAX_LENGTH = 20;
        const INVENTORY_LOG_LABELS = { in: '입고', use: '사용', adjust: '재고 조정' };
        const INVENTORY_FORECAST_WINDOW_DAYS = 60; // 하루 평균 사용량을 계산할 최근 기간
        const INVENTORY_FORECAST_MIN_SPAN_DAYS = 7; // 사용 기록이 이 기간보다 짧으면 예측하지 않음(너무 들쭉날쭉)
        const INVENTORY_SOON_DAYS = 14; // 이 일수 안에 바닥날 것 같으면 "소진 임박"
        let inventoryCategoryFilter = '전체';
        let editingInventoryItemId = null;
        let inventoryLogTarget = null; // { itemId, type }
        let editingInventoryCategory = null; // 분류 창: null이면 새 분류 추가, 문자열이면 그 분류 이름 변경

        function roundInventoryQty(n) {
            return Math.round(n * 100) / 100;
        }

        function formatInventoryQty(n) {
            return roundInventoryQty(n).toLocaleString('ko-KR');
        }

        function getSortedInventoryLogs(item) {
            const logs = Array.isArray(item.logs) ? item.logs.filter(l => l && typeof l === 'object') : [];
            return logs.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.loggedAt || '').localeCompare(b.loggedAt || ''));
        }

        function getInventoryCurrentQty(item) {
            let qty = 0;
            for (const log of getSortedInventoryLogs(item)) {
                const n = Number(log.qty) || 0;
                if (log.type === 'in') qty += n;
                else if (log.type === 'use') qty -= n;
                else if (log.type === 'adjust') qty = n;
            }
            return roundInventoryQty(qty);
        }

        // 날짜순으로 이어 계산했을 때 재고가 처음으로 0 아래로 내려가는 기록을 찾음(없으면 null).
        // 과거 날짜로 사용을 넣거나 입고 기록을 지우면 지금 재고는 괜찮아도 중간에 마이너스가 될 수 있어서 전체를 확인함
        function findInventoryNegativePoint(logs) {
            let qty = 0;
            for (const log of getSortedInventoryLogs({ logs })) {
                const n = Number(log.qty) || 0;
                if (log.type === 'in') qty += n;
                else if (log.type === 'use') qty -= n;
                else if (log.type === 'adjust') qty = n;
                qty = roundInventoryQty(qty);
                if (qty < 0) return { date: log.date, qty };
            }
            return null;
        }

        function formatInventoryShortDate(dateStr) {
            const d = parseLocalDate(dateStr);
            return `${d.getMonth() + 1}/${d.getDate()}`;
        }

        // 품목 목록에서 가장 최근 입고/사용 날짜
        function getInventoryLastDates(item) {
            let lastIn = '', lastUse = '', lastAdjust = '';
            for (const log of (Array.isArray(item.logs) ? item.logs : [])) {
                if (!log || !/^\d{4}-\d{2}-\d{2}$/.test(log.date || '')) continue;
                if (log.type === 'in' && log.date > lastIn) lastIn = log.date;
                if (log.type === 'use' && log.date > lastUse) lastUse = log.date;
                if (log.type === 'adjust' && log.date > lastAdjust) lastAdjust = log.date;
            }
            return { lastIn, lastUse, lastAdjust };
        }

        // ----- 분류 -----
        // 사용자가 만든 분류 + 품목에 쓰였지만 목록에 없는 분류(만든 순서 뒤에 이름순)
        function getInventoryCategoryList() {
            const list = inventoryCategories.filter(c => typeof c === 'string' && c);
            const extra = new Set();
            inventoryItems.forEach(item => {
                if (item.category && !list.includes(item.category)) extra.add(item.category);
            });
            return list.concat(Array.from(extra).sort((a, b) => a.localeCompare(b, 'ko')));
        }

        function hasUncategorizedInventory() {
            return inventoryItems.some(item => !item.category);
        }

        function renderInventoryCategoryFilter() {
            const row = document.getElementById('inventoryCategoryFilterRow');
            if (!row) return;
            const list = getInventoryCategoryList();
            if (inventoryCategoryFilter !== '전체' && inventoryCategoryFilter !== INVENTORY_UNCATEGORIZED && !list.includes(inventoryCategoryFilter)) {
                inventoryCategoryFilter = '전체';
            }
            if (inventoryCategoryFilter === INVENTORY_UNCATEGORIZED && !hasUncategorizedInventory()) inventoryCategoryFilter = '전체';
            const chip = (value, label) => `<button type="button" class="quick-preset-btn${inventoryCategoryFilter === value ? ' selected' : ''}" onclick="setInventoryCategoryFilter('${escapeForOnclickArg(value)}')">${escapeHtml(label)}</button>`;
            const chips = [chip('전체', '전체')]
                .concat(list.map(c => chip(c, c)))
                .concat(hasUncategorizedInventory() ? [chip(INVENTORY_UNCATEGORIZED, '미분류')] : []);
            chips.push('<button type="button" class="quick-preset-btn inv-category-add-btn" onclick="openInventoryCategoryModal(null)">+ 분류 추가</button>');
            if (list.includes(inventoryCategoryFilter)) {
                chips.push(`<button type="button" class="inv-category-edit-btn" onclick="openInventoryCategoryModal('${escapeForOnclickArg(inventoryCategoryFilter)}')" aria-label="${escapeHtml(inventoryCategoryFilter)} 분류 이름 변경 또는 삭제">✏️ 분류 수정</button>`);
            }
            row.innerHTML = chips.join('');
        }

        function validateInventoryCategoryName(name, exceptName) {
            if (!name) return '분류 이름을 입력해주세요';
            if (name.length > INVENTORY_CATEGORY_MAX_LENGTH) return `분류 이름은 ${INVENTORY_CATEGORY_MAX_LENGTH}자 이내로 입력해주세요`;
            if (name === '전체' || name === '미분류' || name.startsWith('__')) return `'${name}'은(는) 분류 이름으로 쓸 수 없어요`;
            if (name !== exceptName && getInventoryCategoryList().includes(name)) return '이미 있는 분류입니다';
            return '';
        }

        function addInventoryCategory(name) {
            if (!inventoryCategories.includes(name)) inventoryCategories.push(name);
            safeSetItem('inventoryCategories', JSON.stringify(inventoryCategories));
        }

        function openInventoryCategoryModal(name) {
            if (!checkEditPermission()) return;
            editingInventoryCategory = name;
            document.getElementById('inventoryCategoryModalTitle').textContent = name ? '분류 수정' : '분류 추가';
            document.getElementById('inventoryCategoryNameInput').value = name || '';
            document.getElementById('deleteInventoryCategoryBtn').style.display = name ? 'inline-block' : 'none';
            const count = name ? inventoryItems.filter(i => i.category === name).length : 0;
            document.getElementById('inventoryCategoryHint').textContent = name
                ? (count ? `이 분류의 품목 ${count}개도 새 이름으로 바뀌어요. 삭제하면 품목은 미분류로 옮겨져요.` : '이 분류에 들어 있는 품목이 없어요.')
                : '';
            document.getElementById('inventoryCategoryModal').classList.add('active');
            setTimeout(() => document.getElementById('inventoryCategoryNameInput').focus(), 50);
        }

        function closeInventoryCategoryModal() {
            document.getElementById('inventoryCategoryModal').classList.remove('active');
            editingInventoryCategory = null;
        }

        function saveInventoryCategory() {
            if (!checkEditPermission()) return;
            const name = document.getElementById('inventoryCategoryNameInput').value.trim();
            const oldName = editingInventoryCategory;
            if (oldName && name === oldName) { closeInventoryCategoryModal(); return; }
            const error = validateInventoryCategoryName(name, oldName);
            if (error) { showAppToast(error); return; }
            if (oldName) {
                const idx = inventoryCategories.indexOf(oldName);
                if (idx !== -1) inventoryCategories[idx] = name;
                else inventoryCategories.push(name); // 품목에만 쓰이던 분류(목록에 없던 것)를 이름 바꾸면 목록에 올림
                inventoryItems.forEach(item => { if (item.category === oldName) item.category = name; });
                if (inventoryCategoryFilter === oldName) inventoryCategoryFilter = name;
            } else {
                inventoryCategories.push(name);
                inventoryCategoryFilter = name; // 방금 만든 분류를 바로 보여줌(품목 추가 시 기본 분류가 됨)
            }
            safeSetItem('inventoryCategories', JSON.stringify(inventoryCategories));
            closeInventoryCategoryModal();
            saveInventory();
        }

        function deleteInventoryCategory() {
            if (!checkEditPermission()) return;
            const name = editingInventoryCategory;
            if (!name) return;
            const count = inventoryItems.filter(i => i.category === name).length;
            const message = count
                ? `'${name}' 분류를 삭제할까요? 품목 ${count}개와 입출고 기록은 그대로 두고 미분류로 옮겨요.`
                : `'${name}' 분류를 삭제할까요?`;
            confirmModal(message, () => {
                inventoryCategories = inventoryCategories.filter(c => c !== name);
                inventoryItems.forEach(item => { if (item.category === name) item.category = ''; });
                if (inventoryCategoryFilter === name) inventoryCategoryFilter = '전체';
                safeSetItem('inventoryCategories', JSON.stringify(inventoryCategories));
                closeInventoryCategoryModal();
                saveInventory();
            });
        }

        // 품목 창의 분류 선택: 미분류 + 분류 목록 + 직접 입력
        function renderInventoryCategorySelect(selected) {
            const select = document.getElementById('inventoryCategoryInput');
            const list = getInventoryCategoryList();
            select.innerHTML = `<option value="">미분류</option>`
                + list.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')
                + `<option value="${INVENTORY_NEW_CATEGORY}">✏️ 직접 입력</option>`;
            select.value = list.includes(selected) ? selected : '';
            onInventoryCategorySelectChange();
        }

        function onInventoryCategorySelectChange() {
            const isNew = document.getElementById('inventoryCategoryInput').value === INVENTORY_NEW_CATEGORY;
            const input = document.getElementById('inventoryNewCategoryInput');
            input.style.display = isNew ? '' : 'none';
            if (isNew) { input.value = ''; input.focus(); }
        }

        // 최근 사용 기록으로 하루 평균 사용량을 구함. 기록 기간이 짧으면 null(예측 안 함)
        function getInventoryDailyUse(item, todayStr) {
            const today = parseLocalDate(todayStr);
            const windowStart = new Date(today);
            windowStart.setDate(windowStart.getDate() - INVENTORY_FORECAST_WINDOW_DAYS);
            const windowStartStr = formatDate(windowStart);
            const logs = getSortedInventoryLogs(item);
            if (logs.length === 0) return null;
            // 첫 기록이 최근이면 그날부터만 나눔(쓴 지 10일 된 품목을 60일로 나누면 사용량이 낮게 잡힘)
            const firstStr = logs[0].date > windowStartStr ? logs[0].date : windowStartStr;
            const spanDays = Math.round((today - parseLocalDate(firstStr)) / 86400000);
            if (spanDays < INVENTORY_FORECAST_MIN_SPAN_DAYS) return null;
            const used = logs
                .filter(log => log.type === 'use' && log.date >= windowStartStr && log.date <= todayStr)
                .reduce((sum, log) => sum + (Number(log.qty) || 0), 0);
            if (used <= 0) return null;
            return used / spanDays;
        }

        // 카드·오늘 요약에 쓰는 상태: out(바닥) > low(최소 재고 이하) > soon(2주 안 소진 예상) > ok
        function getInventoryStatus(item, todayStr) {
            const current = getInventoryCurrentQty(item);
            const minQty = Number(item.minQty) || 0;
            const dailyUse = getInventoryDailyUse(item, todayStr);
            const daysLeft = dailyUse ? Math.floor(Math.max(current, 0) / dailyUse) : null;
            let level = 'ok';
            if (current <= 0 && (item.logs || []).length > 0) level = 'out';
            else if (minQty > 0 && current <= minQty) level = 'low';
            else if (daysLeft !== null && daysLeft <= INVENTORY_SOON_DAYS) level = 'soon';
            return { current, minQty, dailyUse, daysLeft, level };
        }

        const INVENTORY_LEVEL_ORDER = { out: 0, low: 1, soon: 2, ok: 3 };
        const INVENTORY_LEVEL_BADGES = { out: '재고 없음', low: '부족', soon: '소진 임박', ok: '' };

        function setInventoryCategoryFilter(category) {
            inventoryCategoryFilter = category;
            renderInventory();
        }

        function saveInventory() {
            safeSetItem('inventoryItems', JSON.stringify(inventoryItems));
            queueSync();
            renderInventory();
            if (typeof renderTodaySummary === 'function') renderTodaySummary();
            if (typeof renderMaintenanceSchedule === 'function') renderMaintenanceSchedule(); // 정비 카드의 필요 재고 표시
        }

        function renderInventory() {
            const container = document.getElementById('inventoryList');
            const summaryEl = document.getElementById('inventorySummary');
            if (!container) return;
            const todayStr = formatDate(new Date());
            renderInventoryCategoryFilter();

            const withStatus = inventoryItems.map(item => ({ item, st: getInventoryStatus(item, todayStr) }));
            if (summaryEl) {
                const count = lv => withStatus.filter(x => x.st.level === lv).length;
                const shortage = count('out') + count('low');
                const soon = count('soon');
                summaryEl.innerHTML = inventoryItems.length === 0 ? '' : [
                    shortage ? `<span class="inv-summary-item inv-tone-low">부족 ${shortage}</span>` : '',
                    soon ? `<span class="inv-summary-item inv-tone-soon">2주 안에 소진 예상 ${soon}</span>` : '',
                    `<span class="inv-summary-item">전체 ${inventoryItems.length}품목</span>`
                ].filter(Boolean).join('');
            }

            if (inventoryItems.length === 0) {
                container.innerHTML = '<div class="no-projects">아직 등록된 품목이 없습니다. "품목 추가"로 첫 품목을 등록해보세요.</div>';
                return;
            }

            const filtered = withStatus.filter(x => inventoryCategoryFilter === '전체'
                || (inventoryCategoryFilter === INVENTORY_UNCATEGORIZED ? !x.item.category : x.item.category === inventoryCategoryFilter));
            if (filtered.length === 0) {
                container.innerHTML = inventoryCategoryFilter === INVENTORY_UNCATEGORIZED
                    ? '<div class="no-projects">미분류 품목이 없습니다.</div>'
                    : '<div class="no-projects">이 분류에 등록된 품목이 없습니다. "품목 추가"를 누르면 이 분류로 등록돼요.</div>';
                return;
            }

            filtered.sort((a, b) => (INVENTORY_LEVEL_ORDER[a.st.level] - INVENTORY_LEVEL_ORDER[b.st.level])
                || (a.st.daysLeft ?? Infinity) - (b.st.daysLeft ?? Infinity)
                || (a.item.name || '').localeCompare(b.item.name || '', 'ko'));

            container.innerHTML = filtered.map(({ item, st }) => {
                const idArg = escapeForOnclickArg(item.id);
                const unit = escapeHtml(item.unit || '');
                // 막대 눈금: 최소 재고의 3배(또는 현재 재고) 기준. 최소 재고 위치에 세로 눈금을 그림
                const scale = Math.max(st.current, st.minQty * 3, 1);
                const fillPct = Math.max(0, Math.min(100, st.current / scale * 100));
                const minPct = st.minQty > 0 ? Math.min(100, st.minQty / scale * 100) : null;
                let forecast;
                if (st.dailyUse) {
                    forecast = st.current <= 0
                        ? `하루 평균 ${formatInventoryQty(st.dailyUse)}${unit} 사용`
                        : `약 ${st.daysLeft}일 뒤 소진 예상 · 하루 평균 ${formatInventoryQty(st.dailyUse)}${unit} 사용`;
                } else {
                    forecast = '사용 기록이 1주일 이상 쌓이면 소진 예상일을 알려드려요';
                }
                const meta = [escapeHtml(item.category || '미분류'), item.location ? escapeHtml(item.location) : ''].filter(Boolean).join(' · ');
                const { lastIn, lastUse, lastAdjust } = getInventoryLastDates(item);
                // 입고·사용이 아직 없으면(처음 등록만 한 품목) 마지막 재고 조정 날짜라도 보여줌
                const lastDates = (lastIn || lastUse)
                    ? [lastIn ? `최근 입고 ${formatInventoryShortDate(lastIn)}` : '', lastUse ? `최근 사용 ${formatInventoryShortDate(lastUse)}` : ''].filter(Boolean).join(' · ')
                    : (lastAdjust ? `최근 재고 조정 ${formatInventoryShortDate(lastAdjust)}` : '');
                const badge = INVENTORY_LEVEL_BADGES[st.level];
                return `
                <div class="project-card inv-card inv-level-${st.level}">
                    <div class="project-card-top">
                        <button type="button" class="inv-card-title" onclick="openInventoryItemModal('${idArg}')">${escapeHtml(item.name)}</button>
                        ${badge ? `<span class="project-badge inv-badge-${st.level}">${badge}</span>` : ''}
                    </div>
                    <div class="project-card-category">${meta}</div>
                    <div class="inv-qty-line">
                        <span class="inv-qty-now">${formatInventoryQty(st.current)}<span class="inv-qty-unit">${unit}</span></span>
                        ${st.minQty > 0 ? `<span class="inv-qty-min">최소 ${formatInventoryQty(st.minQty)}${unit}</span>` : ''}
                    </div>
                    <div class="inv-gauge" role="img" aria-label="현재 ${formatInventoryQty(st.current)}${unit}${st.minQty > 0 ? `, 최소 ${formatInventoryQty(st.minQty)}${unit}` : ''}">
                        <div class="inv-gauge-fill" style="width:${fillPct}%"></div>
                        ${minPct !== null ? `<div class="inv-gauge-min" style="left:${minPct}%"></div>` : ''}
                    </div>
                    <div class="inv-forecast">${forecast}</div>
                    ${renderInventoryMaintLinksLine(item)}
                    <div class="inv-history-line">
                        <span>${lastDates || '아직 기록이 없어요'}</span>
                        <button type="button" class="inv-history-btn" onclick="openInventoryItemModal('${idArg}', true)">기록 보기</button>
                    </div>
                    <div class="inv-actions">
                        <button type="button" class="inv-action-btn" onclick="openInventoryLogModal('${idArg}', 'in')">+ 입고</button>
                        <button type="button" class="inv-action-btn" onclick="openInventoryLogModal('${idArg}', 'use')">− 사용</button>
                        <button type="button" class="inv-action-btn" onclick="openInventoryLogModal('${idArg}', 'adjust')">조정</button>
                    </div>
                </div>`;
            }).join('');
        }

        // ----- 품목 추가/수정 -----
        // showHistory: 카드의 [기록 보기]로 열면 입출고 기록 위치로 바로 내려감
        function openInventoryItemModal(itemId, showHistory) {
            if (!checkEditPermission()) return;
            editingInventoryItemId = itemId;
            const item = itemId ? inventoryItems.find(x => x.id === itemId) : null;
            if (itemId && !item) return;
            document.getElementById('inventoryItemModalTitle').textContent = item ? '📦 품목 수정' : '📦 품목 추가';
            document.getElementById('inventoryNameInput').value = item ? item.name : '';
            const defaultCategory = getInventoryCategoryList().includes(inventoryCategoryFilter) ? inventoryCategoryFilter : '';
            renderInventoryCategorySelect(item ? (item.category || '') : defaultCategory);
            document.getElementById('inventoryUnitInput').value = item ? (item.unit || '') : '';
            document.getElementById('inventoryMinInput').value = item && item.minQty ? item.minQty : '';
            document.getElementById('inventoryLocationInput').value = item ? (item.location || '') : '';
            document.getElementById('inventoryNoteInput').value = item ? (item.note || '') : '';
            document.getElementById('inventoryStartQtyInput').value = '';
            // 시작 재고는 처음 등록할 때만 받음(이후에는 재고 조정으로 맞춤)
            document.getElementById('inventoryStartQtyField').style.display = item ? 'none' : '';
            document.getElementById('inventoryLogSection').style.display = item ? '' : 'none';
            document.getElementById('deleteInventoryItemBtn').style.display = item ? 'inline-block' : 'none';
            if (item) renderInventoryLogList(item);
            renderInventoryMaintLinkEditor(item);
            document.getElementById('inventoryItemModal').classList.add('active');
            if (item && showHistory) {
                document.getElementById('inventoryLogSection').scrollIntoView({ block: 'start' });
            } else {
                document.getElementById('inventoryNameInput').focus();
            }
        }

        function closeInventoryItemModal() {
            document.getElementById('inventoryItemModal').classList.remove('active');
            editingInventoryItemId = null;
        }

        function parseInventoryQtyInput(raw) {
            const s = String(raw).trim();
            if (s === '') return null;
            const n = Number(s);
            return Number.isFinite(n) ? roundInventoryQty(n) : NaN;
        }

        function saveInventoryItem() {
            if (!checkEditPermission()) return;
            const name = document.getElementById('inventoryNameInput').value.trim();
            if (!name) { showAppToast('품목명을 입력해주세요'); return; }
            const minQty = parseInventoryQtyInput(document.getElementById('inventoryMinInput').value);
            if (Number.isNaN(minQty) || (minQty !== null && minQty < 0)) { showAppToast('최소 재고는 0 이상의 숫자로 입력해주세요'); return; }
            let category = document.getElementById('inventoryCategoryInput').value;
            if (category === INVENTORY_NEW_CATEGORY) {
                category = document.getElementById('inventoryNewCategoryInput').value.trim();
                const existing = getInventoryCategoryList().includes(category);
                const error = existing ? '' : validateInventoryCategoryName(category, null);
                if (error) { showAppToast(error); return; }
                if (!existing) addInventoryCategory(category);
            }
            const linkResult = isMaintenanceFeatureOn() ? readInventoryMaintLinkRows() : null;
            if (linkResult && linkResult.error) { showAppToast(linkResult.error); return; }
            const fields = {
                name,
                category,
                unit: document.getElementById('inventoryUnitInput').value.trim(),
                minQty: minQty || 0,
                location: document.getElementById('inventoryLocationInput').value.trim(),
                note: document.getElementById('inventoryNoteInput').value.trim(),
                updatedAt: new Date().toISOString()
            };
            if (linkResult) fields.maintLinks = linkResult.links; // 정비 탭을 안 쓰는 계정은 기존 연동을 건드리지 않음

            if (editingInventoryItemId) {
                const item = inventoryItems.find(x => x.id === editingInventoryItemId);
                if (item) Object.assign(item, fields);
            } else {
                const startQty = parseInventoryQtyInput(document.getElementById('inventoryStartQtyInput').value);
                if (Number.isNaN(startQty) || (startQty !== null && startQty < 0)) { showAppToast('현재 재고는 0 이상의 숫자로 입력해주세요'); return; }
                const now = new Date();
                const item = Object.assign({ id: 'inv_' + now.getTime() + '_' + Math.random().toString(36).slice(2, 7), logs: [], createdAt: now.toISOString() }, fields);
                if (startQty !== null) {
                    item.logs.push({ id: 'invlog_' + now.getTime(), type: 'adjust', qty: startQty, date: formatDate(now), note: '처음 등록', loggedAt: now.toISOString() });
                }
                inventoryItems.push(item);
            }
            closeInventoryItemModal();
            saveInventory();
        }

        function deleteInventoryItem() {
            if (!checkEditPermission()) return;
            const itemId = editingInventoryItemId;
            if (!itemId) return;
            confirmModal('이 품목과 입출고 기록을 모두 삭제하시겠습니까?', () => {
                inventoryItems = inventoryItems.filter(x => x.id !== itemId);
                closeInventoryItemModal();
                saveInventory();
            });
        }

        function renderInventoryLogList(item) {
            const listEl = document.getElementById('inventoryLogList');
            if (!listEl) return;
            const logs = getSortedInventoryLogs(item).reverse();
            if (logs.length === 0) {
                listEl.innerHTML = '<p class="inv-log-empty">아직 입출고 기록이 없습니다.</p>';
                return;
            }
            const unit = escapeHtml(item.unit || '');
            const itemArg = escapeForOnclickArg(item.id);
            // 기록마다 "그 기록을 반영한 직후의 총 재고"를 날짜순으로 이어 계산해 둠
            const balanceById = {};
            let balance = 0;
            for (const log of getSortedInventoryLogs(item)) {
                const n = Number(log.qty) || 0;
                if (log.type === 'in') balance += n;
                else if (log.type === 'use') balance -= n;
                else balance = n;
                balance = roundInventoryQty(balance);
                balanceById[log.id] = balance;
            }
            // 종류(입고/사용/재고 조정)가 이미 앞에 있으니 수량에는 +/− 부호를 붙이지 않음
            listEl.innerHTML = logs.map(log => {
                const type = INVENTORY_LOG_LABELS[log.type] ? log.type : 'adjust';
                return `
                <div class="inv-log-item">
                    <span class="inv-log-date">${escapeHtml(log.date || '')}</span>
                    <span class="inv-log-type inv-log-${type}">${INVENTORY_LOG_LABELS[type]}</span>
                    <span class="inv-log-qty">${formatInventoryQty(Number(log.qty) || 0)}${unit}</span>
                    <span class="inv-log-balance">(총 재고 : ${formatInventoryQty(balanceById[log.id] || 0)}${unit})</span>
                    <button type="button" class="inv-log-delete" aria-label="이 기록 삭제" onclick="deleteInventoryLog('${itemArg}', '${escapeForOnclickArg(log.id)}')">🗑️</button>
                    ${log.note ? `<span class="inv-log-note">${escapeHtml(log.note)}</span>` : ''}
                </div>`;
            }).join('');
        }

        function deleteInventoryLog(itemId, logId) {
            if (!checkEditPermission()) return;
            const item = inventoryItems.find(x => x.id === itemId);
            if (!item) return;
            const negative = findInventoryNegativePoint((item.logs || []).filter(l => l.id !== logId));
            if (negative) {
                showAppToast(`이 기록을 지우면 ${negative.date}에 재고가 ${formatInventoryQty(negative.qty)}${item.unit || ''}(으)로 내려가서 지울 수 없어요. 사용 기록을 먼저 고쳐주세요`, 'error');
                return;
            }
            confirmModal('이 입출고 기록을 삭제하시겠습니까? 현재 재고가 다시 계산됩니다.', () => {
                item.logs = (item.logs || []).filter(l => l.id !== logId);
                item.updatedAt = new Date().toISOString();
                renderInventoryLogList(item);
                saveInventory();
            });
        }

        // ----- 입고/사용/실사 기록 -----
        function openInventoryLogModal(itemId, type) {
            if (!checkEditPermission()) return;
            const item = inventoryItems.find(x => x.id === itemId);
            if (!item) return;
            inventoryLogTarget = { itemId, type };
            document.getElementById('inventoryLogQtyInput').value = '';
            document.getElementById('inventoryLogDateInput').value = formatDate(new Date());
            document.getElementById('inventoryLogNoteInput').value = '';
            document.getElementById('inventoryLogUnit').textContent = item.unit || '';
            setInventoryLogType(type);
            document.getElementById('inventoryLogModal').classList.add('active');
            document.getElementById('inventoryLogQtyInput').focus();
        }

        function setInventoryLogType(type) {
            if (!inventoryLogTarget) return;
            inventoryLogTarget.type = type;
            const item = inventoryItems.find(x => x.id === inventoryLogTarget.itemId);
            document.querySelectorAll('#inventoryLogTypeRow .quick-preset-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.type === type);
            });
            document.getElementById('inventoryLogModalTitle').textContent = `${item ? item.name : ''} ${INVENTORY_LOG_LABELS[type]}`;
            document.getElementById('inventoryLogQtyLabel').textContent = type === 'adjust' ? '실제로 센 수량' : type === 'in' ? '들어온 수량' : '사용한 수량';
            const current = item ? getInventoryCurrentQty(item) : 0;
            document.getElementById('inventoryLogHint').textContent = type === 'adjust'
                ? `기록상 현재 재고는 ${formatInventoryQty(current)}${item && item.unit ? item.unit : ''}입니다. 실제로 센 수량으로 맞춥니다.`
                : `현재 재고 ${formatInventoryQty(current)}${item && item.unit ? item.unit : ''}`;
            document.getElementById('inventoryLogSaveBtn').textContent = type === 'adjust' ? '재고 조정' : `${INVENTORY_LOG_LABELS[type]} 기록`;
        }

        function closeInventoryLogModal() {
            document.getElementById('inventoryLogModal').classList.remove('active');
            inventoryLogTarget = null;
        }

        function saveInventoryLog() {
            if (!checkEditPermission()) return;
            if (!inventoryLogTarget) return;
            const item = inventoryItems.find(x => x.id === inventoryLogTarget.itemId);
            if (!item) return;
            const type = inventoryLogTarget.type;
            const qty = parseInventoryQtyInput(document.getElementById('inventoryLogQtyInput').value);
            if (qty === null || Number.isNaN(qty) || qty < 0 || (type !== 'adjust' && qty === 0)) {
                showAppToast(type === 'adjust' ? '실제로 센 수량을 0 이상의 숫자로 입력해주세요' : '수량을 0보다 큰 숫자로 입력해주세요');
                return;
            }
            const date = document.getElementById('inventoryLogDateInput').value;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { showAppToast('날짜를 선택해주세요'); return; }
            const now = new Date();
            const newLog = {
                id: 'invlog_' + now.getTime() + '_' + Math.random().toString(36).slice(2, 7),
                type, qty, date,
                note: document.getElementById('inventoryLogNoteInput').value.trim(),
                loggedAt: now.toISOString()
            };
            const existingLogs = Array.isArray(item.logs) ? item.logs : [];
            const negative = findInventoryNegativePoint(existingLogs.concat(newLog));
            if (negative) {
                const unit = item.unit || '';
                const isLatest = existingLogs.every(l => (l.date || '') <= date);
                showAppToast(isLatest
                    ? `현재 재고 ${formatInventoryQty(getInventoryCurrentQty(item))}${unit}보다 많이 사용할 수 없어요`
                    : `${negative.date} 기준 재고가 ${formatInventoryQty(negative.qty)}${unit}(으)로 내려가서 저장할 수 없어요. 날짜나 수량을 확인해주세요`, 'error');
                return;
            }
            if (!Array.isArray(item.logs)) item.logs = [];
            item.logs.push(newLog);
            item.updatedAt = now.toISOString();
            closeInventoryLogModal();
            saveInventory();
            if (editingInventoryItemId === item.id) renderInventoryLogList(item);
            showAppToast(`${item.name} ${INVENTORY_LOG_LABELS[type]} 기록함 · 지금 ${formatInventoryQty(getInventoryCurrentQty(item))}${item.unit || ''}`, 'success');
        }

        // 오늘 요약 카드용: 부족(바닥 포함)·소진 임박 품목 수
        function getInventoryAlertCounts() {
            const todayStr = formatDate(new Date());
            let shortage = 0, soon = 0;
            inventoryItems.forEach(item => {
                const lv = getInventoryStatus(item, todayStr).level;
                if (lv === 'out' || lv === 'low') shortage++;
                else if (lv === 'soon') soon++;
            });
            return { shortage, soon };
        }

        // ===== 정비계획 연동 =====
        // 품목마다 maintLinks: [{ maintId, qty }]로 "이 정비 항목을 한 번 할 때 몇 개 쓰는지"를 저장함(연동은 선택).
        // 정비 완료 처리 때 그 수량만큼 사용 기록을 남기고, 정비 카드에는 필요 재고가 충분한지 보여줌
        function isInventoryFeatureOn() {
            return !disabledTabIds.includes('inventory') && !isFeatureDisabled('inventoryManage');
        }

        function isMaintenanceFeatureOn() {
            return !disabledTabIds.includes('maintenance') && !isFeatureDisabled('maintenanceSchedule');
        }

        function getMaintenanceLabel(m) {
            return `${m.equipment || '(설비 미지정)'} - ${m.item || '점검'}`;
        }

        // 지워진 정비 항목을 가리키는 연결은 빼고 돌려줌
        function getInventoryMaintLinks(item) {
            return (Array.isArray(item.maintLinks) ? item.maintLinks : [])
                .filter(l => l && maintenanceSchedule.some(m => m.id === l.maintId) && Number(l.qty) > 0);
        }

        function formatMaintenanceDueShort(nextDue) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(nextDue || '')) return formatInventoryShortDate(nextDue);
            if (/^\d{4}-\d{2}$/.test(nextDue || '')) return `${Number(nextDue.slice(5, 7))}월`;
            return '';
        }

        // 재고 카드에 들어갈 "🔧 연결된 정비 항목 · 차기 일정" 줄
        function renderInventoryMaintLinksLine(item) {
            if (!isMaintenanceFeatureOn()) return '';
            const links = getInventoryMaintLinks(item);
            if (links.length === 0) return '';
            const unit = escapeHtml(item.unit || '');
            const parts = links.map(l => {
                const m = maintenanceSchedule.find(x => x.id === l.maintId);
                const due = formatMaintenanceDueShort(m.nextDue);
                return `${escapeHtml(getMaintenanceLabel(m))} ${formatInventoryQty(Number(l.qty))}${unit}${due ? ` · 차기 ${due}` : ''}`;
            });
            return `<div class="inv-maint-line">🔧 ${parts.join('<br>🔧 ')}</div>`;
        }

        // ----- 품목 창의 연동 행 -----
        function buildInventoryMaintLinkRow(link, unit) {
            const options = maintenanceSchedule.slice()
                .sort((a, b) => getMaintenanceLabel(a).localeCompare(getMaintenanceLabel(b), 'ko'))
                .map(m => `<option value="${escapeHtml(m.id)}"${link && link.maintId === m.id ? ' selected' : ''}>${escapeHtml(getMaintenanceLabel(m))}</option>`)
                .join('');
            return `
                <div class="inv-link-row">
                    <select class="inv-link-select" aria-label="연동할 정비 항목"><option value="">정비 항목 선택</option>${options}</select>
                    <span class="inv-link-qty-label">1회</span>
                    <input type="number" class="inv-link-qty" min="0" step="any" inputmode="decimal" aria-label="1회 사용량" value="${link ? escapeHtml(String(link.qty)) : ''}">
                    <span class="inv-link-unit">${escapeHtml(unit || '')}</span>
                    <button type="button" class="inv-link-remove" aria-label="이 연동 빼기" onclick="this.closest('.inv-link-row').remove()">✕</button>
                </div>`;
        }

        function renderInventoryMaintLinkEditor(item) {
            const section = document.getElementById('inventoryMaintLinkSection');
            if (!section) return;
            section.style.display = isMaintenanceFeatureOn() ? '' : 'none';
            const list = document.getElementById('inventoryMaintLinkList');
            const addBtn = document.getElementById('inventoryMaintLinkAddBtn');
            const hint = document.getElementById('inventoryMaintLinkHint');
            const links = item ? getInventoryMaintLinks(item) : [];
            const unit = item ? item.unit : document.getElementById('inventoryUnitInput').value.trim();
            list.innerHTML = links.map(l => buildInventoryMaintLinkRow(l, unit)).join('');
            const hasMaint = maintenanceSchedule.length > 0;
            addBtn.style.display = hasMaint ? '' : 'none';
            hint.textContent = hasMaint
                ? '연동하면 정비 완료 처리할 때 1회 사용량만큼 재고에서 빠져요. 연동하지 않는 재고는 비워두세요.'
                : '정비계획 탭에 등록된 항목이 없어요. 정비 항목을 먼저 만들면 연동할 수 있어요.';
        }

        function addInventoryMaintLinkRow() {
            const unit = document.getElementById('inventoryUnitInput').value.trim();
            document.getElementById('inventoryMaintLinkList').insertAdjacentHTML('beforeend', buildInventoryMaintLinkRow(null, unit));
            const rows = document.querySelectorAll('#inventoryMaintLinkList .inv-link-row');
            rows[rows.length - 1].querySelector('select').focus();
        }

        // 단위를 바꾸면 연동 행의 단위 글자도 같이 바꿈
        function syncInventoryMaintLinkUnit() {
            const unit = document.getElementById('inventoryUnitInput').value.trim();
            document.querySelectorAll('#inventoryMaintLinkList .inv-link-unit').forEach(el => { el.textContent = unit; });
        }

        // 품목 창의 연동 행을 읽어서 검증함. 오류면 { error }, 아니면 { links }
        function readInventoryMaintLinkRows() {
            const links = [];
            for (const row of document.querySelectorAll('#inventoryMaintLinkList .inv-link-row')) {
                const maintId = row.querySelector('.inv-link-select').value;
                const qtyRaw = row.querySelector('.inv-link-qty').value;
                if (!maintId && String(qtyRaw).trim() === '') continue; // 비워둔 행은 무시
                if (!maintId) return { error: '연동할 정비 항목을 선택해주세요' };
                const qty = parseInventoryQtyInput(qtyRaw);
                if (qty === null || Number.isNaN(qty) || qty <= 0) return { error: '정비 1회 사용량을 0보다 큰 숫자로 입력해주세요' };
                if (links.some(l => l.maintId === maintId)) return { error: '같은 정비 항목이 두 번 연결돼 있어요' };
                links.push({ maintId, qty });
            }
            return { links };
        }

        // ----- 정비 카드: 필요 재고 -----
        function getInventoryNeedsForMaintenance(maintId) {
            const needs = [];
            inventoryItems.forEach(item => {
                const link = getInventoryMaintLinks(item).find(l => l.maintId === maintId);
                if (!link) return;
                const current = getInventoryCurrentQty(item);
                const qty = Number(link.qty);
                needs.push({ item, qty, current, enough: current >= qty });
            });
            return needs;
        }

        function renderMaintenanceInventoryRow(m) {
            if (!isInventoryFeatureOn()) return '';
            const needs = getInventoryNeedsForMaintenance(m.id);
            if (needs.length === 0) return '';
            const parts = needs.map(n => {
                const unit = escapeHtml(n.item.unit || '');
                return `${escapeHtml(n.item.name)} ${formatInventoryQty(n.qty)}${unit} · ${n.enough
                    ? `<span class="maint-inv-ok">현재 ${formatInventoryQty(n.current)}${unit} ✅</span>`
                    : `<span class="maint-inv-short">⚠️ 부족 (현재 ${formatInventoryQty(n.current)}${unit})</span>`}`;
            });
            return `<div class="project-card-row maint-inv-row"><b>📦 필요 재고:</b> ${parts.join(' / ')}</div>`;
        }

        // ----- 정비 완료 처리 창: 재고 차감 -----
        function renderMaintCompleteInventory(m) {
            const field = document.getElementById('maintCompleteInventoryField');
            const list = document.getElementById('maintCompleteInventoryList');
            if (!field || !list) return;
            const needs = isInventoryFeatureOn() ? getInventoryNeedsForMaintenance(m.id) : [];
            field.style.display = needs.length ? '' : 'none';
            list.innerHTML = needs.map(n => `
                <div class="maint-inv-deduct-row" data-item-id="${escapeHtml(n.item.id)}">
                    <label class="maint-inv-deduct-check">
                        <input type="checkbox" class="maint-inv-deduct-checkbox"${n.enough ? ' checked' : ''}>
                        <span>${escapeHtml(n.item.name)}</span>
                    </label>
                    <input type="number" class="maint-inv-deduct-qty" min="0" step="any" inputmode="decimal" value="${escapeHtml(String(n.qty))}" aria-label="${escapeHtml(n.item.name)} 차감 수량" oninput="refreshMaintCompleteInventoryRow(this)">
                    <span class="inv-link-unit">${escapeHtml(n.item.unit || '')}</span>
                    <span class="maint-inv-deduct-preview"></span>
                </div>`).join('');
            list.querySelectorAll('.maint-inv-deduct-qty').forEach(input => refreshMaintCompleteInventoryRow(input));
        }

        function refreshMaintCompleteInventoryRow(input) {
            const row = input.closest('.maint-inv-deduct-row');
            const item = inventoryItems.find(x => x.id === row.dataset.itemId);
            if (!item) return;
            const current = getInventoryCurrentQty(item);
            const qty = parseInventoryQtyInput(input.value);
            const preview = row.querySelector('.maint-inv-deduct-preview');
            const unit = item.unit || '';
            const short = qty !== null && !Number.isNaN(qty) && qty > current;
            preview.classList.toggle('is-short', short);
            preview.textContent = short
                ? `재고 부족 (현재 ${formatInventoryQty(current)}${unit})`
                : `현재 ${formatInventoryQty(current)}${unit} → ${formatInventoryQty(current - (qty > 0 ? qty : 0))}${unit}`;
            const checkbox = row.querySelector('.maint-inv-deduct-checkbox');
            if (short) checkbox.checked = false;
        }

        // 정비 완료를 저장할 때 호출: 체크된 품목마다 사용 기록을 남김. 재고가 모자라면 그 품목만 건너뜀.
        // 돌려주는 값은 토스트에 붙일 안내 문구
        function applyMaintCompleteInventory(m, date, completionId) {
            const rows = document.querySelectorAll('#maintCompleteInventoryList .maint-inv-deduct-row');
            if (!isInventoryFeatureOn() || rows.length === 0) return '';
            const done = [], skipped = [];
            const now = new Date();
            rows.forEach((row, i) => {
                if (!row.querySelector('.maint-inv-deduct-checkbox').checked) return;
                const item = inventoryItems.find(x => x.id === row.dataset.itemId);
                if (!item) return;
                const qty = parseInventoryQtyInput(row.querySelector('.maint-inv-deduct-qty').value);
                if (qty === null || Number.isNaN(qty) || qty <= 0) { skipped.push(item.name); return; }
                const log = {
                    id: 'invlog_' + now.getTime() + '_' + i + '_' + Math.random().toString(36).slice(2, 7),
                    type: 'use', qty, date,
                    note: `[정비완료] ${getMaintenanceLabel(m)}`,
                    maintCompletionId: completionId,
                    loggedAt: now.toISOString()
                };
                const logs = Array.isArray(item.logs) ? item.logs : [];
                if (findInventoryNegativePoint(logs.concat(log))) { skipped.push(item.name); return; }
                item.logs = logs.concat(log);
                item.updatedAt = now.toISOString();
                done.push(`${item.name} ${formatInventoryQty(qty)}${item.unit || ''}`);
            });
            if (done.length) saveInventory();
            return [done.length ? `재고 차감: ${done.join(', ')}` : '', skipped.length ? `재고 부족으로 차감 안 함: ${skipped.join(', ')}` : ''].filter(Boolean).join(' · ');
        }

        // 정비 항목을 지우면 그 항목을 가리키던 연동만 풂(품목과 기록은 그대로)
        function removeInventoryMaintLinks(maintId) {
            let changed = false;
            inventoryItems.forEach(item => {
                if (Array.isArray(item.maintLinks) && item.maintLinks.some(l => l.maintId === maintId)) {
                    item.maintLinks = item.maintLinks.filter(l => l.maintId !== maintId);
                    changed = true;
                }
            });
            if (changed) saveInventory();
        }
