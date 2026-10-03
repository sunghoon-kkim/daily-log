        // ===== 재고 관리 (약품·소모품·부품) =====
        // 현재 재고는 따로 저장하지 않고 품목마다 쌓인 입출고 기록(logs)을 날짜순으로 합산해서 계산함.
        // 그래야 기록을 지우거나 고쳐도 숫자가 어긋나지 않음. 실사(adjust)는 "그날 세어 본 실제 수량"이라
        // 그 시점의 재고를 그 값으로 맞추고, 이후 기록을 이어서 더하고 뺌
        // 소진 예측은 AI가 아니라 최근 사용 기록의 하루 평균으로 계산함(근거가 분명하고 지어낼 여지가 없음)
        const INVENTORY_CATEGORIES = ['약품', '소모품', '부품', '기타'];
        const INVENTORY_LOG_LABELS = { in: '입고', use: '사용', adjust: '실사' };
        const INVENTORY_FORECAST_WINDOW_DAYS = 60; // 하루 평균 사용량을 계산할 최근 기간
        const INVENTORY_FORECAST_MIN_SPAN_DAYS = 7; // 사용 기록이 이 기간보다 짧으면 예측하지 않음(너무 들쭉날쭉)
        const INVENTORY_SOON_DAYS = 14; // 이 일수 안에 바닥날 것 같으면 "소진 임박"
        let inventoryCategoryFilter = '전체';
        let editingInventoryItemId = null;
        let inventoryLogTarget = null; // { itemId, type }

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
            document.querySelectorAll('#inventoryCategoryFilterRow .quick-preset-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.filter === category);
            });
            renderInventory();
        }

        function saveInventory() {
            safeSetItem('inventoryItems', JSON.stringify(inventoryItems));
            queueSync();
            renderInventory();
            if (typeof renderTodaySummary === 'function') renderTodaySummary();
        }

        function renderInventory() {
            const container = document.getElementById('inventoryList');
            const summaryEl = document.getElementById('inventorySummary');
            if (!container) return;
            const todayStr = formatDate(new Date());

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
                container.innerHTML = '<div class="no-projects">아직 등록된 품목이 없습니다. "품목 추가"로 소금이나 시약부터 등록해보세요.</div>';
                return;
            }

            const filtered = withStatus.filter(x => inventoryCategoryFilter === '전체' || x.item.category === inventoryCategoryFilter);
            if (filtered.length === 0) {
                container.innerHTML = '<div class="no-projects">이 분류에 등록된 품목이 없습니다.</div>';
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
                const meta = [escapeHtml(item.category || '기타'), item.location ? escapeHtml(item.location) : ''].filter(Boolean).join(' · ');
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
                    <div class="inv-actions">
                        <button type="button" class="inv-action-btn" onclick="openInventoryLogModal('${idArg}', 'in')">+ 입고</button>
                        <button type="button" class="inv-action-btn" onclick="openInventoryLogModal('${idArg}', 'use')">− 사용</button>
                        <button type="button" class="inv-action-btn" onclick="openInventoryLogModal('${idArg}', 'adjust')">실사</button>
                    </div>
                </div>`;
            }).join('');
        }

        // ----- 품목 추가/수정 -----
        function openInventoryItemModal(itemId) {
            if (!checkEditPermission()) return;
            editingInventoryItemId = itemId;
            const item = itemId ? inventoryItems.find(x => x.id === itemId) : null;
            if (itemId && !item) return;
            document.getElementById('inventoryItemModalTitle').textContent = item ? '📦 품목 수정' : '📦 품목 추가';
            document.getElementById('inventoryNameInput').value = item ? item.name : '';
            document.getElementById('inventoryCategoryInput').value = item ? (item.category || '기타') : '약품';
            document.getElementById('inventoryUnitInput').value = item ? (item.unit || '') : '';
            document.getElementById('inventoryMinInput').value = item && item.minQty ? item.minQty : '';
            document.getElementById('inventoryLocationInput').value = item ? (item.location || '') : '';
            document.getElementById('inventoryNoteInput').value = item ? (item.note || '') : '';
            document.getElementById('inventoryStartQtyInput').value = '';
            // 시작 재고는 처음 등록할 때만 받음(이후에는 실사로 맞춤)
            document.getElementById('inventoryStartQtyField').style.display = item ? 'none' : '';
            document.getElementById('inventoryLogSection').style.display = item ? '' : 'none';
            document.getElementById('deleteInventoryItemBtn').style.display = item ? 'inline-block' : 'none';
            if (item) renderInventoryLogList(item);
            document.getElementById('inventoryItemModal').classList.add('active');
            document.getElementById('inventoryNameInput').focus();
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
            const fields = {
                name,
                category: document.getElementById('inventoryCategoryInput').value,
                unit: document.getElementById('inventoryUnitInput').value.trim(),
                minQty: minQty || 0,
                location: document.getElementById('inventoryLocationInput').value.trim(),
                note: document.getElementById('inventoryNoteInput').value.trim(),
                updatedAt: new Date().toISOString()
            };

            if (editingInventoryItemId) {
                const item = inventoryItems.find(x => x.id === editingInventoryItemId);
                if (item) Object.assign(item, fields);
            } else {
                const startQty = parseInventoryQtyInput(document.getElementById('inventoryStartQtyInput').value);
                if (Number.isNaN(startQty) || (startQty !== null && startQty < 0)) { showAppToast('지금 재고는 0 이상의 숫자로 입력해주세요'); return; }
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
            listEl.innerHTML = logs.map(log => {
                const type = INVENTORY_LOG_LABELS[log.type] ? log.type : 'adjust';
                const sign = type === 'in' ? '+' : type === 'use' ? '−' : '=';
                return `
                <div class="inv-log-item">
                    <span class="inv-log-date">${escapeHtml(log.date || '')}</span>
                    <span class="inv-log-type inv-log-${type}">${INVENTORY_LOG_LABELS[type]}</span>
                    <span class="inv-log-qty">${sign}${formatInventoryQty(Number(log.qty) || 0)}${unit}</span>
                    <span class="inv-log-note">${escapeHtml(log.note || '')}</span>
                    <button type="button" class="inv-log-delete" aria-label="이 기록 삭제" onclick="deleteInventoryLog('${itemArg}', '${escapeForOnclickArg(log.id)}')">🗑️</button>
                </div>`;
            }).join('');
        }

        function deleteInventoryLog(itemId, logId) {
            if (!checkEditPermission()) return;
            const item = inventoryItems.find(x => x.id === itemId);
            if (!item) return;
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
            document.getElementById('inventoryLogQtyLabel').textContent = type === 'adjust' ? '세어 본 실제 수량' : type === 'in' ? '들어온 수량' : '사용한 수량';
            const current = item ? getInventoryCurrentQty(item) : 0;
            document.getElementById('inventoryLogHint').textContent = type === 'adjust'
                ? `기록상 재고는 ${formatInventoryQty(current)}${item && item.unit ? item.unit : ''}입니다. 실제로 세어 본 수량으로 맞춥니다.`
                : `지금 재고 ${formatInventoryQty(current)}${item && item.unit ? item.unit : ''}`;
            document.getElementById('inventoryLogSaveBtn').textContent = `${INVENTORY_LOG_LABELS[type]} 기록`;
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
                showAppToast(type === 'adjust' ? '세어 본 수량을 0 이상의 숫자로 입력해주세요' : '수량을 0보다 큰 숫자로 입력해주세요');
                return;
            }
            const date = document.getElementById('inventoryLogDateInput').value;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { showAppToast('날짜를 선택해주세요'); return; }
            const now = new Date();
            if (!Array.isArray(item.logs)) item.logs = [];
            item.logs.push({
                id: 'invlog_' + now.getTime() + '_' + Math.random().toString(36).slice(2, 7),
                type, qty, date,
                note: document.getElementById('inventoryLogNoteInput').value.trim(),
                loggedAt: now.toISOString()
            });
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
