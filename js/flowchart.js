        // ===== 흐름도 탭 (여러 개의 흐름도, 각각 자유 배치 블록 + 연결선) =====
        // 블록은 캔버스 위에 절대좌표(x, y, px)로 배치되고, 클릭하면 세부 내용이 펼쳐지며,
        // 드래그(Pointer Events)로 자유롭게 위치를 옮길 수 있음. 탭 순서변경/캘린더 일정 이동과
        // 같은 방식으로 "약간이라도 움직이면 드래그, 안 움직이면 클릭"을 구분해 처리함.
        // 블록 사이의 방향성 있는 연결선(계통도처럼 흐름 표시, 한 블록에서 여러 개로 연결 가능)은
        // waterFlowConnections에 { id, from, to }로 따로 저장하고, SVG로 그려서 블록 위에 겹쳐 보여줌

        // waterFlowBlocks/waterFlowConnections는 현재 보고 있는 흐름도(waterFlowDiagrams 중
        // currentWaterFlowDiagramId)의 배열을 그대로 참조하는 변수라서, .push()나 항목의 필드를
        // 바꾸는 것은 자동으로 반영되지만 "waterFlowBlocks = ....filter(...)"처럼 배열 자체를
        // 새로 만드는 곳에서는 원본 diagram 항목이 그 변경을 못 보게 되므로, 저장 직전에 이 함수로
        // 다시 연결해줘야 함(저장 함수들이 이미 항상 호출하므로 별도로 신경 쓸 필요는 없음)
        function syncActiveWaterFlowDiagramData() {
            const diagram = waterFlowDiagrams.find(d => d.id === currentWaterFlowDiagramId);
            if (diagram) {
                diagram.blocks = waterFlowBlocks;
                diagram.connections = waterFlowConnections;
            }
        }

        // waterFlowDiagrams가 비어있으면(첫 사용, 또는 예전 버전에서 막 넘어온 계정) 흐름도 하나를
        // 만들어주고, currentWaterFlowDiagramId가 가리키는 흐름도가 없으면 첫 번째로 되돌린 뒤,
        // waterFlowBlocks/waterFlowConnections가 그 흐름도의 배열을 가리키도록 다시 연결함
        function ensureActiveWaterFlowDiagram() {
            if (!Array.isArray(waterFlowDiagrams)) waterFlowDiagrams = [];
            if (waterFlowDiagrams.length === 0) {
                const hasLegacyData = (waterFlowBlocks && waterFlowBlocks.length > 0) || (waterFlowConnections && waterFlowConnections.length > 0);
                waterFlowDiagrams.push({
                    id: 'wfd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                    name: '흐름도 1',
                    blocks: hasLegacyData ? waterFlowBlocks : [],
                    connections: hasLegacyData ? waterFlowConnections : []
                });
            }
            let current = waterFlowDiagrams.find(d => d.id === currentWaterFlowDiagramId);
            if (!current) {
                current = waterFlowDiagrams[0];
                currentWaterFlowDiagramId = current.id;
            }
            if (!Array.isArray(current.blocks)) current.blocks = [];
            if (!Array.isArray(current.connections)) current.connections = [];
            waterFlowBlocks = current.blocks;
            waterFlowConnections = current.connections;
        }

        // ===== 흐름도 되돌리기(Ctrl+Z)/다시 실행(Ctrl+Shift+Z) =====
        // 실수로 블록을 옮기거나 지웠을 때 되돌릴 수 있도록, 블록/연결선/흐름도 목록을 바꾸는
        // 동작 직전마다 그 시점의 전체 상태(모든 흐름도)를 스냅샷으로 남겨둠. 되돌리기는 그 스냅샷을
        // 다시 불러오는 방식이라, 화면 이동/확대축소 같은 "보는 상태"는 대상이 아니고 실제 데이터만 대상임
        let waterFlowUndoStack = [];
        let waterFlowRedoStack = [];
        const WATER_FLOW_UNDO_LIMIT = 50;

        function pushWaterFlowUndoSnapshot() {
            syncActiveWaterFlowDiagramData();
            waterFlowUndoStack.push(JSON.stringify({ diagrams: waterFlowDiagrams, currentId: currentWaterFlowDiagramId }));
            if (waterFlowUndoStack.length > WATER_FLOW_UNDO_LIMIT) waterFlowUndoStack.shift();
            waterFlowRedoStack = []; // 새로 변경하면 다시 실행 내역은 의미가 없어지므로 비움
        }

        function restoreWaterFlowSnapshot(json) {
            const state = JSON.parse(json);
            waterFlowDiagrams = state.diagrams;
            currentWaterFlowDiagramId = state.currentId;
            ensureActiveWaterFlowDiagram();
            cancelWaterFlowConnectMode();
            safeSetItem('waterFlowDiagrams', JSON.stringify(waterFlowDiagrams));
            safeSetItem('currentWaterFlowDiagramId', currentWaterFlowDiagramId || '');
            queueSync();
            renderWaterFlowDiagramTabs();
            renderWaterFlowCanvas();
        }

        function undoWaterFlowChange() {
            if (!checkEditPermission()) return;
            if (waterFlowUndoStack.length === 0) {
                showAppToast('되돌릴 변경사항이 없습니다');
                return;
            }
            syncActiveWaterFlowDiagramData();
            waterFlowRedoStack.push(JSON.stringify({ diagrams: waterFlowDiagrams, currentId: currentWaterFlowDiagramId }));
            restoreWaterFlowSnapshot(waterFlowUndoStack.pop());
            showAppToast('↩️ 되돌렸습니다', 'info');
        }

        function redoWaterFlowChange() {
            if (!checkEditPermission()) return;
            if (waterFlowRedoStack.length === 0) {
                showAppToast('다시 실행할 변경사항이 없습니다');
                return;
            }
            syncActiveWaterFlowDiagramData();
            waterFlowUndoStack.push(JSON.stringify({ diagrams: waterFlowDiagrams, currentId: currentWaterFlowDiagramId }));
            restoreWaterFlowSnapshot(waterFlowRedoStack.pop());
            showAppToast('↪️ 다시 실행했습니다', 'info');
        }

        // 흐름도 탭을 보고 있을 때만 Ctrl+Z(되돌리기)/Ctrl+Shift+Z 또는 Ctrl+Y(다시 실행)를 가로챔.
        // 모달 안 입력창/텍스트 영역에 포커스가 있을 때는 브라우저 기본 되돌리기(글자 입력 취소)가
        // 그대로 동작하도록 손대지 않음
        function setupWaterFlowUndoRedoShortcut() {
            document.addEventListener('keydown', (e) => {
                if (activeTabId !== 'waterFlow') return;
                if (!(e.ctrlKey || e.metaKey)) return;
                const tag = (e.target.tagName || '').toLowerCase();
                if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

                const key = e.key.toLowerCase();
                if (key === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    undoWaterFlowChange();
                } else if ((key === 'z' && e.shiftKey) || key === 'y') {
                    e.preventDefault();
                    redoWaterFlowChange();
                }
            });
        }

        function renderWaterFlowDiagramTabs() {
            const container = document.getElementById('waterFlowDiagramTabs');
            if (!container) return;
            container.innerHTML = waterFlowDiagrams.map(d => `
                <div class="water-flow-diagram-tab${d.id === currentWaterFlowDiagramId ? ' active' : ''}" onclick="switchWaterFlowDiagram('${d.id}')">
                    <span>${escapeHtml(d.name)}</span>
                    <button class="water-flow-diagram-tab-edit" onclick="event.stopPropagation(); openWaterFlowDiagramModal('${d.id}')" title="이름 변경/삭제" aria-label="이름 변경/삭제">✏️</button>
                </div>
            `).join('') + '<button class="water-flow-diagram-add-btn" onclick="addWaterFlowDiagram()" title="흐름도 추가" aria-label="흐름도 추가">➕ 흐름도 추가</button>';
        }

        function switchWaterFlowDiagram(diagramId) {
            if (diagramId === currentWaterFlowDiagramId) return;
            cancelWaterFlowConnectMode();
            syncActiveWaterFlowDiagramData(); // 나가기 전에 지금 보던 흐름도 내용을 확실히 반영해둠
            currentWaterFlowDiagramId = diagramId;
            ensureActiveWaterFlowDiagram();
            safeSetItem('currentWaterFlowDiagramId', currentWaterFlowDiagramId);
            renderWaterFlowDiagramTabs();
            renderWaterFlowCanvas();
            fitWaterFlowViewToContent(); // 블록이 다 그려진 뒤에 화면에 전부 들어오도록 맞춤
        }

        function addWaterFlowDiagram() {
            if (!checkEditPermission()) return;
            pushWaterFlowUndoSnapshot();
            syncActiveWaterFlowDiagramData();
            const newDiagram = {
                id: 'wfd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                name: '흐름도 ' + (waterFlowDiagrams.length + 1),
                blocks: [],
                connections: []
            };
            waterFlowDiagrams.push(newDiagram);
            currentWaterFlowDiagramId = newDiagram.id;
            waterFlowBlocks = newDiagram.blocks;
            waterFlowConnections = newDiagram.connections;
            safeSetItem('waterFlowDiagrams', JSON.stringify(waterFlowDiagrams));
            safeSetItem('currentWaterFlowDiagramId', currentWaterFlowDiagramId);
            queueSync();
            resetWaterFlowView();
            renderWaterFlowDiagramTabs();
            renderWaterFlowCanvas();
        }

        function openWaterFlowDiagramModal(diagramId) {
            if (!checkEditPermission()) return;
            editingWaterFlowDiagramId = diagramId;
            const diagram = waterFlowDiagrams.find(d => d.id === diagramId);
            if (!diagram) return;
            document.getElementById('waterFlowDiagramNameInput').value = diagram.name;
            const deleteBtn = document.getElementById('deleteWaterFlowDiagramBtn');
            deleteBtn.style.display = waterFlowDiagrams.length > 1 ? 'inline-block' : 'none'; // 마지막 하나 남은 흐름도는 지울 수 없게 함
            document.getElementById('waterFlowDiagramModal').classList.add('active');
            applyFormLockState();
        }

        function closeWaterFlowDiagramModal() {
            document.getElementById('waterFlowDiagramModal').classList.remove('active');
            editingWaterFlowDiagramId = null;
        }

        function saveWaterFlowDiagramName() {
            if (!checkEditPermission()) return;
            const name = document.getElementById('waterFlowDiagramNameInput').value.trim();
            if (!name) {
                showAppToast('흐름도 이름을 입력해주세요');
                return;
            }
            pushWaterFlowUndoSnapshot();
            const diagram = waterFlowDiagrams.find(d => d.id === editingWaterFlowDiagramId);
            if (diagram) diagram.name = name;
            safeSetItem('waterFlowDiagrams', JSON.stringify(waterFlowDiagrams));
            queueSync();
            closeWaterFlowDiagramModal();
            renderWaterFlowDiagramTabs();
        }

        function deleteWaterFlowDiagram() {
            if (!checkEditPermission()) return;
            if (waterFlowDiagrams.length <= 1) return; // 흐름도가 하나뿐일 때는 지울 수 없음
            const targetId = editingWaterFlowDiagramId;
            confirmModal('이 흐름도를 삭제하시겠습니까? 안에 있는 블록과 연결선이 모두 함께 사라집니다.', () => {
                pushWaterFlowUndoSnapshot();
                waterFlowDiagrams = waterFlowDiagrams.filter(d => d.id !== targetId);
                if (currentWaterFlowDiagramId === targetId) currentWaterFlowDiagramId = waterFlowDiagrams[0].id;
                ensureActiveWaterFlowDiagram();
                safeSetItem('waterFlowDiagrams', JSON.stringify(waterFlowDiagrams));
                safeSetItem('currentWaterFlowDiagramId', currentWaterFlowDiagramId);
                queueSync();
                closeWaterFlowDiagramModal();
                renderWaterFlowDiagramTabs();
                renderWaterFlowCanvas();
                fitWaterFlowViewToContent();
            });
        }

        function saveWaterFlowBlocksToStorage() {
            syncActiveWaterFlowDiagramData();
            safeSetItem('waterFlowDiagrams', JSON.stringify(waterFlowDiagrams));
            safeSetItem('currentWaterFlowDiagramId', currentWaterFlowDiagramId || '');
            queueSync();
        }

        function saveWaterFlowConnectionsToStorage() {
            syncActiveWaterFlowDiagramData();
            safeSetItem('waterFlowDiagrams', JSON.stringify(waterFlowDiagrams));
            safeSetItem('currentWaterFlowDiagramId', currentWaterFlowDiagramId || '');
            queueSync();
        }

        // 새 블록을 추가할 때마다 격자 형태로 위치를 배정해서, 기본 위치끼리 겹치지 않게 함
        // (블록 폭 190px + 여백을 감안한 간격이며, 이후엔 드래그로 자유롭게 재배치하면 됨)
        function nextWaterFlowBlockPosition() {
            const startX = 30, startY = 30;
            const stepX = 220, stepY = 160;
            const cols = 5;
            const idx = waterFlowBlocks.length;
            return { x: startX + (idx % cols) * stepX, y: startY + Math.floor(idx / cols) * stepY };
        }

        // "➕ 블록 추가" 버튼으로 만들 때, 지금 화면에 보이는(팬/줌이 적용된) 영역의 한가운데에
        // 새 블록이 생기도록 화면 중앙의 화면 좌표를 현재 팬/줌을 거꾸로 계산해 캔버스 좌표로 바꿈
        function waterFlowViewportCenterPosition() {
            const wrap = document.getElementById('waterFlowCanvasWrap');
            if (!wrap) return nextWaterFlowBlockPosition();
            const rect = wrap.getBoundingClientRect();
            const localX = (rect.width / 2 - waterFlowViewX) / waterFlowViewZoom;
            const localY = (rect.height / 2 - waterFlowViewY) / waterFlowViewZoom;
            const blockWidth = 190, approxBlockHeight = 64; // 블록의 중심이 화면 중앙에 오도록 크기의 절반만큼 보정
            return {
                x: Math.max(0, localX - blockWidth / 2),
                y: Math.max(0, localY - approxBlockHeight / 2)
            };
        }

        // ===== 흐름도 캔버스 화면 이동(팬)/확대축소(줌) =====
        // 블록을 여러 개 만들면 화면이 좁아지므로, 빈 곳을 드래그하면 화면을 이동하고 마우스 휠로
        // 확대/축소할 수 있게 함. 블록의 x/y 좌표(데이터) 자체는 그대로 두고, 캔버스 전체에
        // CSS transform(translate+scale)만 적용해서 "보는 위치"만 바꾸는 방식이라 저장할 필요가 없음
        const WATER_FLOW_ZOOM_MIN = 0.1;
        const WATER_FLOW_ZOOM_MAX = 2;
        const WATER_FLOW_ZOOM_STEP = 0.1;

        function applyWaterFlowViewTransform() {
            const canvas = document.getElementById('waterFlowCanvas');
            if (!canvas) return;
            canvas.style.transform = `translate(${waterFlowViewX}px, ${waterFlowViewY}px) scale(${waterFlowViewZoom})`;
            // 정렬 줄 손잡이(가로/세로 눈금)는 캔버스 밖(여백)에 고정된 채로, 화면 이동/확대에 맞춰
            // 안의 눈금 위치만 다시 계산해야 하므로, 화면 상태가 바뀔 때마다 함께 다시 그림
            renderWaterFlowAlignRails();
        }

        function resetWaterFlowView() {
            waterFlowViewX = 0;
            waterFlowViewY = 0;
            waterFlowViewZoom = 1;
            applyWaterFlowViewTransform();
        }

        // 지금 흐름도의 블록을 전부 포함하는 범위를 구해서, 화면 안에 상하좌우 여백을 두고
        // 한 번에 다 보이도록 화면 위치/배율을 맞춤. 흐름도 하위탭을 누를 때(전환할 때) 사용함.
        // 블록이 실제로 그려진 다음(renderWaterFlowCanvas 이후)에 불러야 정확한 위치를 잴 수 있음
        const WATER_FLOW_FIT_PADDING = 40; // 화면 상하좌우에 남길 여백(px, 화면 기준)
        const WATER_FLOW_RAIL_THICKNESS = 22; // 정렬 줄 손잡이가 놓이는 여백(캔버스 왼쪽/위쪽)의 두께(px) - style.css의 .water-flow-row-rail/.water-flow-col-rail 크기와 맞춰야 함

        function fitWaterFlowViewToContent() {
            const wrap = document.getElementById('waterFlowCanvasWrap');
            const canvas = document.getElementById('waterFlowCanvas');
            if (!wrap || !canvas || waterFlowBlocks.length === 0) {
                resetWaterFlowView();
                return;
            }

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            waterFlowBlocks.forEach(b => {
                const el = canvas.querySelector(`.water-flow-block[data-block-id="${b.id}"]`);
                if (!el) return;
                minX = Math.min(minX, el.offsetLeft);
                minY = Math.min(minY, el.offsetTop);
                maxX = Math.max(maxX, el.offsetLeft + el.offsetWidth);
                maxY = Math.max(maxY, el.offsetTop + el.offsetHeight);
            });
            if (!isFinite(minX)) {
                resetWaterFlowView();
                return;
            }

            const contentWidth = Math.max(1, maxX - minX);
            const contentHeight = Math.max(1, maxY - minY);
            const wrapRect = wrap.getBoundingClientRect();
            const availWidth = Math.max(1, wrapRect.width - WATER_FLOW_RAIL_THICKNESS - WATER_FLOW_FIT_PADDING * 2);
            const availHeight = Math.max(1, wrapRect.height - WATER_FLOW_RAIL_THICKNESS - WATER_FLOW_FIT_PADDING * 2);

            let zoom = Math.min(availWidth / contentWidth, availHeight / contentHeight, 1); // 블록 몇 개뿐이라 확대해서 채워야 하는 경우엔 100%를 넘기지 않음
            zoom = Math.min(WATER_FLOW_ZOOM_MAX, Math.max(WATER_FLOW_ZOOM_MIN, +zoom.toFixed(2)));

            // 가운데 정렬이 아니라 좌측 상단 기준으로 살짝 여백만 두고 붙여서 보여줌
            waterFlowViewZoom = zoom;
            waterFlowViewX = WATER_FLOW_FIT_PADDING - minX * zoom;
            waterFlowViewY = WATER_FLOW_FIT_PADDING - minY * zoom;
            applyWaterFlowViewTransform();
        }

        // 커서가 가리키는 지점이 화면상 같은 자리에 남도록 확대/축소 기준점을 보정함
        // (지도 서비스의 "마우스 위치 기준 확대"와 같은 방식)
        function waterFlowCanvasWheel(e) {
            e.preventDefault();
            const wrap = document.getElementById('waterFlowCanvasWrap');
            if (!wrap) return;
            const rect = wrap.getBoundingClientRect();
            // 캔버스 자체가 정렬 줄 손잡이 여백(RAIL_THICKNESS)만큼 안쪽으로 밀려 있으므로, 그만큼 뺀
            // 좌표라야 "캔버스 기준" 커서 위치가 되어 확대해도 커서 아래 지점이 그대로 유지됨
            const cursorX = e.clientX - rect.left - WATER_FLOW_RAIL_THICKNESS;
            const cursorY = e.clientY - rect.top - WATER_FLOW_RAIL_THICKNESS;

            const oldZoom = waterFlowViewZoom;
            const rawZoom = oldZoom + (e.deltaY > 0 ? -WATER_FLOW_ZOOM_STEP : WATER_FLOW_ZOOM_STEP);
            const newZoom = Math.min(WATER_FLOW_ZOOM_MAX, Math.max(WATER_FLOW_ZOOM_MIN, +rawZoom.toFixed(2)));
            if (newZoom === oldZoom) return;

            waterFlowViewX = cursorX - (cursorX - waterFlowViewX) * (newZoom / oldZoom);
            waterFlowViewY = cursorY - (cursorY - waterFlowViewY) * (newZoom / oldZoom);
            waterFlowViewZoom = newZoom;
            applyWaterFlowViewTransform();
        }

        let waterFlowPanState = null; // { startClientX, startClientY, startViewX, startViewY, moved }
        const WATER_FLOW_PAN_MOVE_THRESHOLD = 6;

        function waterFlowCanvasPointerDown(e) {
            if (e.target.closest('.water-flow-block')) return; // 블록 위 드래그는 블록 이동이 처리하므로 화면 이동을 시작하지 않음
            if (e.target.closest('.water-flow-connection-hit')) return; // 연결선 위 드래그는 연결선 이동이 처리하므로 화면 이동을 시작하지 않음
            if (e.target.closest('.water-flow-rail-handle')) return; // 정렬 줄 손잡이 위 드래그는 그 줄 전체 이동이 처리하므로 화면 이동을 시작하지 않음
            if (e.button !== undefined && e.button !== 0) return; // 마우스면 왼쪽 버튼만
            waterFlowPanState = {
                startClientX: e.clientX,
                startClientY: e.clientY,
                startViewX: waterFlowViewX,
                startViewY: waterFlowViewY,
                moved: false
            };
            document.addEventListener('pointermove', waterFlowCanvasPointerMove);
            document.addEventListener('pointerup', waterFlowCanvasPointerUp);
            document.addEventListener('pointercancel', waterFlowCanvasPointerUp);
        }

        function waterFlowCanvasPointerMove(e) {
            if (!waterFlowPanState) return;
            const dx = e.clientX - waterFlowPanState.startClientX;
            const dy = e.clientY - waterFlowPanState.startClientY;

            if (!waterFlowPanState.moved) {
                if (Math.hypot(dx, dy) < WATER_FLOW_PAN_MOVE_THRESHOLD) return;
                waterFlowPanState.moved = true;
                const wrap = document.getElementById('waterFlowCanvasWrap');
                if (wrap) wrap.classList.add('panning');
            }

            e.preventDefault();
            waterFlowViewX = waterFlowPanState.startViewX + dx;
            waterFlowViewY = waterFlowPanState.startViewY + dy;
            applyWaterFlowViewTransform();
        }

        function waterFlowCanvasPointerUp(e) {
            if (!waterFlowPanState) return;
            document.removeEventListener('pointermove', waterFlowCanvasPointerMove);
            document.removeEventListener('pointerup', waterFlowCanvasPointerUp);
            document.removeEventListener('pointercancel', waterFlowCanvasPointerUp);

            const moved = waterFlowPanState.moved;
            waterFlowPanState = null;
            const wrap = document.getElementById('waterFlowCanvasWrap');
            if (wrap) wrap.classList.remove('panning');

            if (moved) {
                // 실제로 화면을 옮긴 경우엔 뒤이어 발생하는 click이 연결 모드를 취소하지 않도록 한 번 막음
                document.addEventListener('click', function suppressClick(ev) {
                    ev.stopPropagation();
                }, { capture: true, once: true });
            }
        }

        function renderWaterFlowCanvas() {
            const canvas = document.getElementById('waterFlowCanvas');
            if (!canvas) return;

            const hintEl = document.getElementById('waterFlowConnectHint');
            if (hintEl) hintEl.classList.toggle('active', !!waterFlowConnectSourceId);

            if (waterFlowBlocks.length === 0) {
                canvas.innerHTML = '<div class="water-flow-empty">➕ "블록 추가" 버튼을 눌러 흐름도를 만들어보세요</div>';
                return;
            }

            const blocksHtml = waterFlowBlocks.map(b => {
                const expanded = !!b.expanded;
                const color = b.color || COLOR_PALETTE[0];
                const detailHtml = escapeHtml(b.detail || '').replace(/\n/g, '<br>');
                const isConnectSource = waterFlowConnectSourceId === b.id;
                return `
                    <div class="water-flow-block${expanded ? ' expanded' : ''}${isConnectSource ? ' connect-source' : ''}" data-block-id="${b.id}"
                         style="left:${b.x || 0}px; top:${b.y || 0}px; border-top-color:${color}"
                         onpointerdown="waterFlowBlockPointerDown(event, '${b.id}')"
                         onclick="toggleWaterFlowBlockExpand('${b.id}')">
                        <button class="water-flow-block-connect-btn" onclick="event.stopPropagation(); startWaterFlowConnect('${b.id}')" title="다른 블록과 화살표로 연결" aria-label="다른 블록과 화살표로 연결">🔗</button>
                        <button class="water-flow-block-duplicate-btn" onclick="event.stopPropagation(); duplicateWaterFlowBlock('${b.id}')" title="블록 복제" aria-label="블록 복제">📋</button>
                        <button class="water-flow-block-delete-btn" onclick="event.stopPropagation(); deleteWaterFlowBlockDirect('${b.id}')" title="블록 삭제" aria-label="블록 삭제">🗑️</button>
                        <button class="water-flow-block-edit-btn" onclick="event.stopPropagation(); openWaterFlowBlockModal('${b.id}')" title="블록 수정" aria-label="블록 수정">✏️</button>
                        <div class="water-flow-block-title">${escapeHtml(b.title)}</div>
                        ${expanded ? `<div class="water-flow-block-detail">${detailHtml || '<span class="water-flow-block-detail-empty">세부 내용이 없습니다</span>'}</div>` : ''}
                    </div>
                `;
            }).join('');

            canvas.innerHTML = '<svg class="water-flow-connections-svg" id="waterFlowConnectionsSvg"></svg>' + blocksHtml;
            renderWaterFlowConnections();
            renderWaterFlowAlignRails();
        }

        // ===== 정렬된 블록 줄(가로/세로) 전체를 한 번에 옮기는 투명 손잡이 =====
        // 블록 여러 개가 같은 x(세로 줄) 또는 같은 y(가로 줄)에 놓여 정렬돼 있으면, 블록을 놓을 수 없는
        // 바깥쪽 여백(캔버스 왼쪽의 가로줄용 눈금 / 위쪽의 세로줄용 눈금)에 그 줄 위치에 맞는 손잡이를
        // 놓아서, 캔버스 안(블록이 있을 수 있는 자리)과 전혀 겹치지 않고도 줄 전체를 드래그로 옮길 수
        // 있게 함. 눈금은 화면 이동/확대에 맞춰 위치가 바뀌므로 applyWaterFlowViewTransform에서도 다시 그림
        function waterFlowAlignKey(v) {
            return Math.round(v || 0); // 정수로 반올림해서 같은 줄인지 비교(스냅으로 맞춘 좌표끼리는 항상 정확히 일치함)
        }

        function renderWaterFlowAlignRails() {
            const rowRail = document.getElementById('waterFlowRowRail');
            const colRail = document.getElementById('waterFlowColRail');
            if (!rowRail || !colRail) return;
            if (waterFlowBlocks.length < 2) { rowRail.innerHTML = ''; colRail.innerHTML = ''; return; }

            const canvas = document.getElementById('waterFlowCanvas');
            const sizeById = {};
            waterFlowBlocks.forEach(b => {
                const el = canvas && canvas.querySelector(`.water-flow-block[data-block-id="${b.id}"]`);
                if (el) sizeById[b.id] = { width: el.offsetWidth, height: el.offsetHeight };
            });

            const rowMap = {}, colMap = {};
            waterFlowBlocks.forEach(b => {
                const rowKey = waterFlowAlignKey(b.y);
                const colKey = waterFlowAlignKey(b.x);
                (rowMap[rowKey] = rowMap[rowKey] || []).push(b.id);
                (colMap[colKey] = colMap[colKey] || []).push(b.id);
            });

            // 눈금 손잡이의 화면 위치는 캔버스 좌표(canvasY/canvasX)에 지금의 팬/줌을 그대로 적용해서
            // 구함(캔버스 본체가 그려지는 것과 똑같은 변환) - 캔버스 자체가 여백만큼(RAIL_THICKNESS)
            // 안쪽으로 밀려 있으므로 그만큼 더해줘야 눈금이 실제 줄과 나란히 맞음
            let rowHtml = '';
            Object.keys(rowMap).forEach(key => {
                const ids = rowMap[key];
                if (ids.length < 2) return;
                const heights = ids.map(id => sizeById[id] && sizeById[id].height).filter(h => h);
                if (!heights.length) return;
                const canvasY = Number(key), height = Math.min(...heights);
                const top = WATER_FLOW_RAIL_THICKNESS + canvasY * waterFlowViewZoom + waterFlowViewY;
                const rowHeight = height * waterFlowViewZoom;
                rowHtml += `<div class="water-flow-rail-handle" style="left:3px; right:3px; top:${top}px; height:${rowHeight}px"
                    onpointerdown="waterFlowAlignStripPointerDown(event, 'row', ${canvasY})" title="정렬된 가로줄 전체를 함께 옮기기"></div>`;
            });
            rowRail.innerHTML = rowHtml;

            let colHtml = '';
            Object.keys(colMap).forEach(key => {
                const ids = colMap[key];
                if (ids.length < 2) return;
                const widths = ids.map(id => sizeById[id] && sizeById[id].width).filter(w => w);
                if (!widths.length) return;
                const canvasX = Number(key), width = Math.min(...widths);
                const left = WATER_FLOW_RAIL_THICKNESS + canvasX * waterFlowViewZoom + waterFlowViewX;
                const colWidth = width * waterFlowViewZoom;
                colHtml += `<div class="water-flow-rail-handle" style="top:3px; bottom:3px; left:${left}px; width:${colWidth}px"
                    onpointerdown="waterFlowAlignStripPointerDown(event, 'col', ${canvasX})" title="정렬된 세로줄 전체를 함께 옮기기"></div>`;
            });
            colRail.innerHTML = colHtml;
        }

        function waterFlowAlignStripPointerDown(e, axis, keyValue) {
            if (e.button !== undefined && e.button !== 0) return; // 마우스면 왼쪽 버튼만
            if (!editUnlocked) return; // 잠긴 상태에서는 옮길 수 없음
            e.stopPropagation();
            const blocks = waterFlowBlocks.filter(b => waterFlowAlignKey(axis === 'row' ? b.y : b.x) === keyValue);
            if (blocks.length < 2) return;

            const starts = {};
            blocks.forEach(b => { starts[b.id] = { x: b.x || 0, y: b.y || 0 }; });
            waterFlowAlignDragState = {
                axis, keyValue,
                blockIds: blocks.map(b => b.id),
                startClientX: e.clientX, startClientY: e.clientY,
                starts,
                moved: false
            };
            document.addEventListener('pointermove', waterFlowAlignStripPointerMove);
            document.addEventListener('pointerup', waterFlowAlignStripPointerUp);
            document.addEventListener('pointercancel', waterFlowAlignStripPointerUp);
        }

        function waterFlowAlignStripPointerMove(e) {
            const state = waterFlowAlignDragState;
            if (!state) return;
            const rawDx = e.clientX - state.startClientX;
            const rawDy = e.clientY - state.startClientY;

            if (!state.moved) {
                if (Math.hypot(rawDx, rawDy) < WATER_FLOW_DRAG_MOVE_THRESHOLD) return;
                state.moved = true;
                pushWaterFlowUndoSnapshot(); // 옮기기 전(원래 위치)이 저장되도록 실제로 드래그가 시작되는 순간에 한 번만 남김
            }
            e.preventDefault();

            const dx = rawDx / waterFlowViewZoom;
            const dy = rawDy / waterFlowViewZoom;
            const canvas = document.getElementById('waterFlowCanvas');
            state.blockIds.forEach(id => {
                const block = waterFlowBlocks.find(b => b.id === id);
                const start = state.starts[id];
                if (!block || !start) return;
                block.x = Math.max(0, start.x + dx);
                block.y = Math.max(0, start.y + dy);
                const el = canvas && canvas.querySelector(`.water-flow-block[data-block-id="${id}"]`);
                if (el) { el.style.left = block.x + 'px'; el.style.top = block.y + 'px'; }
            });
            renderWaterFlowConnections(); // 연결선이 실시간으로 따라오도록 함
            renderWaterFlowAlignRails(); // 줄 전체를 옮기는 동안 다른 블록과 새로 정렬됐을 수도 있으므로 손잡이도 함께 갱신
        }

        function waterFlowAlignStripPointerUp(e) {
            const state = waterFlowAlignDragState;
            if (!state) return;
            document.removeEventListener('pointermove', waterFlowAlignStripPointerMove);
            document.removeEventListener('pointerup', waterFlowAlignStripPointerUp);
            document.removeEventListener('pointercancel', waterFlowAlignStripPointerUp);
            waterFlowAlignDragState = null;
            if (!state.moved) return; // 움직임 없이 눌렀다 뗀 경우엔 아무 것도 하지 않음

            // 실제로 드래그한 경우엔 뒤이어 발생하는 click이 다른 동작(캔버스 이동 등)을 트리거하지 않도록 한 번 막음
            document.addEventListener('click', function suppressClick(ev) {
                ev.stopPropagation();
            }, { capture: true, once: true });

            saveWaterFlowBlocksToStorage();
            renderWaterFlowAlignRails();
        }

        // 로그인하지 않은 상태(구경만 가능)에서도 펼쳐서 보는 것은 허용함 - 다가오는 일정
        // 카드와 같은 방식(누르면 세부 내용, 옮기기/수정/삭제만 로그인 필요)
        function toggleWaterFlowBlockExpand(blockId) {
            // 연결 모드 중에는 클릭이 "펼치기/접기"가 아니라 "이 블록으로 연결선 잇기"로 동작함.
            // 자기 자신을 다시 누르면 연결 없이 그냥 취소됨
            if (waterFlowConnectSourceId) {
                if (blockId !== waterFlowConnectSourceId) addWaterFlowConnection(waterFlowConnectSourceId, blockId);
                waterFlowConnectSourceId = null;
                renderWaterFlowCanvas();
                return;
            }
            const b = waterFlowBlocks.find(x => x.id === blockId);
            if (!b) return;
            b.expanded = !b.expanded;
            saveWaterFlowBlocksToStorage();
            renderWaterFlowCanvas();
        }

        function startWaterFlowConnect(blockId) {
            if (!checkEditPermission()) return;
            // 연결 중이던 블록을 다시 누르면 취소, 아니면 이 블록을 출발점으로 새로 시작
            waterFlowConnectSourceId = (waterFlowConnectSourceId === blockId) ? null : blockId;
            renderWaterFlowCanvas();
        }

        function cancelWaterFlowConnectMode() {
            if (!waterFlowConnectSourceId) return;
            waterFlowConnectSourceId = null;
            renderWaterFlowCanvas();
        }

        // 같은 방향으로 이미 연결돼 있으면 중복 추가하지 않되, 한 블록이 여러 블록과 연결되는 것은
        // 자유롭게 허용함(하나에서 여러 개로, 또는 여러 개가 하나로 모이는 구성 모두 가능)
        function addWaterFlowConnection(fromId, toId) {
            if (!checkEditPermission()) return;
            if (fromId === toId) return;
            if (waterFlowConnections.some(c => c.from === fromId && c.to === toId)) {
                showAppToast('이미 연결되어 있습니다');
                return;
            }
            pushWaterFlowUndoSnapshot();
            waterFlowConnections.push({
                id: 'wfc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                from: fromId,
                to: toId
            });
            saveWaterFlowConnectionsToStorage();
            renderWaterFlowConnections();
            showStatus('🔗 블록을 연결했습니다', 'success');
        }

        function deleteWaterFlowConnection(connId) {
            if (!checkEditPermission()) return;
            confirmModal('이 연결선을 삭제하시겠습니까? 이 선에 이어붙은 연결선이 있으면 함께 삭제됩니다.', () => {
                pushWaterFlowUndoSnapshot();
                const idsToRemove = collectWaterFlowConnectionCascadeIds([connId]);
                waterFlowConnections = waterFlowConnections.filter(c => !idsToRemove.has(c.id));
                saveWaterFlowConnectionsToStorage();
                renderWaterFlowConnections();
            });
        }

        // 연결선을 지울 때, 그 연결선에 이어붙어(tap) 있던 다른 연결선들도 앵커가 사라지므로
        // 함께 지워야 함. 이어붙은 선에 또 이어붙은 경우까지 체인으로 전부 찾아냄
        function collectWaterFlowConnectionCascadeIds(initialIds) {
            const ids = new Set(initialIds);
            let changed = true;
            while (changed) {
                changed = false;
                waterFlowConnections.forEach(c => {
                    if (c.toConnectionId && ids.has(c.toConnectionId) && !ids.has(c.id)) {
                        ids.add(c.id);
                        changed = true;
                    }
                });
            }
            return ids;
        }

        // 연결선을 클릭했을 때: 연결 모드 중이면(다른 블록의 🔗를 누른 상태) 이 선에 이어붙이고,
        // 아니면 원래대로 이 연결선을 삭제함
        function handleWaterFlowConnectionLineClick(connId) {
            if (waterFlowConnectSourceId) {
                addWaterFlowTapConnection(waterFlowConnectSourceId, connId);
                waterFlowConnectSourceId = null;
                renderWaterFlowCanvas();
                return;
            }
            openWaterFlowConnectionModal(connId);
        }

        // ===== 연결선 편집(선 종류/색상) 모달 =====
        let editingWaterFlowConnectionId = null;
        // 트렁크/exitBend/entryBend 드래그 손잡이를 다른 연결선의 같은 종류 지점 근처로 끌고 가면
        // 그 값에 딱 맞춰져(스냅) 두 선이 완전히 겹쳐 보이게 하기 위한 후보 목록.
        // renderWaterFlowConnections가 그릴 때마다 실제로 그려진 값들로 다시 채움
        let waterFlowScalarSnapCandidates = []; // [{ axis: 'x'|'y', value, connIds: [...] }]
        const WATER_FLOW_CONN_SNAP_THRESHOLD = 8; // 이 거리(px) 안으로 들어오면 다른 연결선의 꺾임 지점에 맞춰 붙음

        function openWaterFlowConnectionModal(connId) {
            if (!checkEditPermission()) return;
            const conn = waterFlowConnections.find(c => c.id === connId);
            if (!conn) return;
            editingWaterFlowConnectionId = connId;
            pickWaterFlowConnectionStyle(conn.lineStyle === 'dashed' ? 'dashed' : 'solid');
            pickWaterFlowConnectionColor(conn.color || '');
            document.getElementById('waterFlowConnectionModal').classList.add('active');
            applyFormLockState();
        }

        function closeWaterFlowConnectionModal() {
            document.getElementById('waterFlowConnectionModal').classList.remove('active');
            editingWaterFlowConnectionId = null;
        }

        function pickWaterFlowConnectionStyle(style) {
            document.getElementById('waterFlowConnectionStyleInput').value = style;
            document.querySelectorAll('#waterFlowConnectionStyleRow .quick-preset-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.style === style);
            });
        }

        function pickWaterFlowConnectionColor(color) {
            document.getElementById('waterFlowConnectionColorInput').value = color;
            document.querySelectorAll('#waterFlowConnectionColorRow .color-swatch').forEach(sw => {
                sw.classList.toggle('selected', sw.dataset.color === color);
            });
        }

        function saveWaterFlowConnectionStyle() {
            if (!checkEditPermission()) return;
            const conn = waterFlowConnections.find(c => c.id === editingWaterFlowConnectionId);
            if (!conn) return;
            pushWaterFlowUndoSnapshot();
            const style = document.getElementById('waterFlowConnectionStyleInput').value;
            const color = document.getElementById('waterFlowConnectionColorInput').value;
            // 지금 편집 중인 이 연결선 하나에만 적용함. 트렁크(줄기) 구간은 형제 연결선 중
            // 하나라도 점선이면 같이 점선으로 보이도록 렌더링 쪽에서 이미 처리하므로, 여기서
            // 형제 전체에 강제로 같은 스타일을 밀어붙이지 않아도 가지별로 다른 스타일이 자연스럽게 됨
            conn.lineStyle = style === 'dashed' ? 'dashed' : 'solid';
            if (color) conn.color = color; else delete conn.color;
            saveWaterFlowConnectionsToStorage();
            closeWaterFlowConnectionModal();
            renderWaterFlowConnections();
        }

        function deleteWaterFlowConnectionFromModal() {
            const connId = editingWaterFlowConnectionId;
            closeWaterFlowConnectionModal();
            deleteWaterFlowConnection(connId);
        }

        // 블록을 다른 블록이 아니라 "이미 있는 연결선"에 이어붙임(계통도의 T자 분기처럼).
        // 이어붙은 지점은 그 호스트 연결선의 가지 중간 지점이며, 호스트가 움직이면 같이 따라감.
        // 이어붙은 선에 또 이어붙는 것(체인)은 지원하지 않음 - 항상 블록↔블록 선에만 이어붙일 수 있음
        function addWaterFlowTapConnection(fromId, hostConnId) {
            if (!checkEditPermission()) return;
            const hostConn = waterFlowConnections.find(c => c.id === hostConnId);
            if (!hostConn) return;
            if (hostConn.toConnectionId) {
                showAppToast('다른 연결선에 이어붙은 선에는 연결할 수 없습니다');
                return;
            }
            if (hostConn.from === fromId || hostConn.to === fromId) {
                showAppToast('이미 직접 연결되어 있는 블록입니다');
                return;
            }
            if (waterFlowConnections.some(c => c.from === fromId && c.toConnectionId === hostConnId)) {
                showAppToast('이미 이어붙어 있습니다');
                return;
            }
            pushWaterFlowUndoSnapshot();
            waterFlowConnections.push({
                id: 'wfc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                from: fromId,
                to: null,
                toConnectionId: hostConnId
            });
            saveWaterFlowConnectionsToStorage();
            renderWaterFlowConnections();
            showStatus('🔗 연결선에 이어붙였습니다', 'success');
        }

        // 방향에 따라 블록 테두리의 연결 지점(우/좌 중앙, 하/상 중앙)을 구함
        function waterFlowAttachPoint(rect, side) {
            const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
            if (side === 'right') return { x: rect.left + rect.width, y: cy };
            if (side === 'left') return { x: rect.left, y: cy };
            if (side === 'down') return { x: cx, y: rect.top + rect.height };
            return { x: cx, y: rect.top }; // 'up'
        }

        // 나가는 방향의 반대쪽이 들어오는 블록의 진입면이 됨 (오른쪽으로 나가면 상대는 왼쪽으로 받음)
        const WATER_FLOW_ENTRY_SIDE = { right: 'left', left: 'right', down: 'up', up: 'down' };

        const WATER_FLOW_DASH_PERIOD = 12; // 점선 패턴("7,5") 한 바퀴 길이(점 7 + 칸 5)

        // 구간(가로 또는 세로 직선) 하나를 SVG 엘리먼트 문자열로 만듦. 점선일 때는 그 구간의 "캔버스
        // 절대 좌표"를 기준으로 점선이 시작되는 위치(stroke-dashoffset)를 맞춰서 그림. 이렇게 하지
        // 않고 각 폴리라인이 자기 시작점부터 점선을 새로 세면, 서로 다른 연결선의 구간이 같은 자리에
        // 겹칠 때 두 점선의 위상이 우연히 어긋나서 서로의 빈 칸을 채워 실선처럼 보이고, 드래그로 길이가
        // 바뀔 때마다 그 위상차가 계속 달라져 무늬가 흔들려 보이는 문제가 있었음. 좌표를 기준으로
        // 위상을 고정하면 어느 연결선이든 같은 자리에서는 항상 같은 무늬로 겹쳐서 이 문제가 없어짐
        function waterFlowSegmentEl(p1, p2, styleBase, dashed) {
            if (Math.abs(p1.x - p2.x) < 0.5 && Math.abs(p1.y - p2.y) < 0.5) return ''; // 길이 0인 구간은 그리지 않음
            const isHorizontal = Math.abs(p1.y - p2.y) < 0.5;
            let a = p1, b = p2;
            if (isHorizontal ? a.x > b.x : a.y > b.y) { const t = a; a = b; b = t; }
            let style = styleBase || '';
            if (dashed) {
                const ref = isHorizontal ? a.x : a.y;
                const offset = ((ref % WATER_FLOW_DASH_PERIOD) + WATER_FLOW_DASH_PERIOD) % WATER_FLOW_DASH_PERIOD;
                style += `;stroke-dasharray:7,5;stroke-dashoffset:${offset}`;
            }
            return `<polyline points="${a.x},${a.y} ${b.x},${b.y}" class="water-flow-connection-line" style="${style}"></polyline>`;
        }

        // 블록의 실제 DOM 위치/크기를 기준으로 연결선을 다시 그림. 블록을 드래그하는 동안에도
        // (전체 재렌더 없이) 매 이동마다 호출해서 선이 블록을 따라 실시간으로 움직이게 함.
        // 화살표 없이 계통도처럼 직각으로 꺾어 그리며, 같은 출발 블록에서 같은 방향으로 나가는
        // 연결선들은 출발 지점에서 꺾이는 위치(줄기)까지는 겹치는 부분을 한 줄로만 그리고,
        // 거기서부터 각 도착 블록까지는 가지로 따로 그려서 나뭇가지처럼 보이게 함
        function renderWaterFlowConnections() {
            const svg = document.getElementById('waterFlowConnectionsSvg');
            const canvas = document.getElementById('waterFlowCanvas');
            if (!svg || !canvas) return;

            waterFlowScalarSnapCandidates = []; // 이번 렌더에서 실제로 그려진 꺾임 지점들로 다시 채움(드래그로 근처 연결선에 붙일 때 씀)

            if (waterFlowConnections.length === 0) {
                svg.innerHTML = '';
                return;
            }

            const rects = {};
            waterFlowBlocks.forEach(b => {
                const el = canvas.querySelector(`.water-flow-block[data-block-id="${b.id}"]`);
                if (el) rects[b.id] = { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
            });

            // 블록↔블록 연결선과, 다른 연결선에 이어붙은(탭) 연결선을 나눔. 탭 연결선의 도착 지점은
            // 자신이 이어붙은 연결선(호스트)의 가지 중간 지점이라서, 호스트를 먼저 그려 그 지점을
            // 구해야 함 - 그래서 블록↔블록 그룹을 1단계로, 탭 그룹을 2단계로 나눠서 처리함
            const blockTargetConns = waterFlowConnections.filter(c => !c.toConnectionId);
            const tapConns = waterFlowConnections.filter(c => c.toConnectionId);
            const branchMidpointByConnId = {};

            // 같은 블록에서 나가는 연결선은 도착 지점 하나하나가 아니라 그 지점들 전체의 "평균 위치"를
            // 기준으로 방향(상/하/좌/우)을 한 번만 정함. 개별적으로 정하면 도착 지점 하나가 유독
            // 옆으로 치우쳐 있을 때 그것만 다른 방향으로 분류돼 줄기가 안 합쳐지는 경우가 생기는데,
            // 그런 일이 없도록 항상 하나로 묶이게 함
            function buildGroups(conns, getTargetPos, getEntryPoint) {
                const directionByFrom = {};
                conns.forEach(conn => {
                    if (directionByFrom[conn.from] !== undefined) return;
                    const rFrom = rects[conn.from];
                    if (!rFrom) return;
                    const positions = conns.filter(c => c.from === conn.from).map(getTargetPos).filter(Boolean);
                    if (positions.length === 0) return;
                    const srcCX = rFrom.left + rFrom.width / 2, srcCY = rFrom.top + rFrom.height / 2;
                    const avgCX = positions.reduce((s, p) => s + p.x, 0) / positions.length;
                    const avgCY = positions.reduce((s, p) => s + p.y, 0) / positions.length;
                    const dx = avgCX - srcCX, dy = avgCY - srcCY;
                    directionByFrom[conn.from] = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
                });

                const groups = {}; // fromId -> { direction, exit, branches: [{connId, entry}], overrideTrunk, overrideExitBend }
                conns.forEach(conn => {
                    const direction = directionByFrom[conn.from];
                    const rFrom = rects[conn.from];
                    if (!direction || !rFrom) return;
                    const entry = getEntryPoint(conn, direction);
                    if (!entry) return;
                    if (!groups[conn.from]) {
                        groups[conn.from] = { direction, exit: waterFlowAttachPoint(rFrom, direction), branches: [], overrideTrunk: null, overrideExitBend: null };
                    }
                    groups[conn.from].branches.push({ connId: conn.id, entry });
                    if (groups[conn.from].overrideTrunk === null && typeof conn.trunkOverride === 'number') {
                        groups[conn.from].overrideTrunk = conn.trunkOverride;
                    }
                    if (groups[conn.from].overrideExitBend === null && typeof conn.exitBend === 'number') {
                        groups[conn.from].overrideExitBend = conn.exitBend;
                    }
                });
                return groups;
            }

            let svgHtml = ''; // 클릭/드래그용 히트 영역(투명선)만 담음 - 항상 맨 위에 그려져서 클릭이 잘 먹도록 마지막에 붙임
            let dashedVisualHtml = ''; // 실제 보이는 선 중 점선만 먼저 모아둠(아래에 깔림)
            let solidVisualHtml = ''; // 실제 보이는 선 중 실선만 모아둠 - 점선보다 나중에(위에) 그려서 겹쳤을 때 실선이 우선 보이게 함

            // 겹친 선끼리는 실선이 점선보다 위에 그려지도록, 보이는 선(히트 영역 말고) 하나를
            // 점선/실선에 따라 서로 다른 버킷에 나눠 담음
            function pushVisual(p1, p2, style, dashed) {
                const html = waterFlowSegmentEl(p1, p2, style, dashed);
                if (dashed) dashedVisualHtml += html; else solidVisualHtml += html;
            }

            function renderGroup(g) {
                const isVertical = g.direction === 'down' || g.direction === 'up';
                const siblingIds = g.branches.map(b => b.connId);

                // 꺾이는 위치(트렁크): 사용자가 직접 드래그해서 옮겨뒀으면 그 값을, 아니면 출발 지점과
                // 가장 가까운 도착 지점 사이 "가운데"를 자동으로 계산해서 씀
                let trunk;
                if (g.overrideTrunk !== null) {
                    trunk = g.overrideTrunk;
                } else if (isVertical) {
                    const nearestY = g.direction === 'down' ? Math.min(...g.branches.map(b => b.entry.y)) : Math.max(...g.branches.map(b => b.entry.y));
                    trunk = (g.exit.y + nearestY) / 2;
                } else {
                    const nearestX = g.direction === 'right' ? Math.min(...g.branches.map(b => b.entry.x)) : Math.max(...g.branches.map(b => b.entry.x));
                    trunk = (g.exit.x + nearestX) / 2;
                }

                // 출발 지점 → 트렁크로 이어지는 첫 구간도, 트렁크와는 다른(수직↔수평) 축으로 따로
                // 꺾을 수 있게 함(exitBend). 기본값은 출발 지점 자신의 좌표라서, 안 건드리면 원래
                // 모양과 똑같이 보임
                const exitAxisCoord = isVertical ? g.exit.x : g.exit.y;
                const exitBend = (g.overrideExitBend !== null) ? g.overrideExitBend : exitAxisCoord;

                // 줄기(버스)는 그룹당 한 번만 그려서 여러 갈래로 나가더라도 겹치는 구간이 하나로
                // 이어져 보이게 함. 버스가 덮는 상하좌우 범위는 exitBend 위치부터 각 가지의 도착
                // 지점까지임
                const branchCoords = g.branches.map(b => isVertical ? b.entry.x : b.entry.y);
                const busMin = Math.min(exitBend, ...branchCoords);
                const busMax = Math.max(exitBend, ...branchCoords);
                const connIds = g.branches.map(b => b.connId).join(',');
                // 세로로 그려지는 구간은 항상 좌우 화살표로 좌우 이동, 가로로 그려지는 구간은 항상
                // 위아래 화살표로 상하 이동만 가능하게 함(구간의 실제 모양과 손잡이가 항상 일치하도록,
                // 값이 바뀌어도 이 두 축 배정 자체는 절대 바뀌지 않음)
                const busCursor = isVertical ? 'ns-resize' : 'ew-resize'; // 트렁크(버스) 계열 구간의 모양
                const exitBendCursor = isVertical ? 'ew-resize' : 'ns-resize'; // exitBend 계열 구간의 모양
                const busField = 'trunkOverride', busAxis = isVertical ? 'y' : 'x';
                const exitBendAxis = isVertical ? 'x' : 'y';

                // 이 그룹의 트렁크/exitBend 값을 스냅 후보로 등록해둠 - 다른 연결선을 이 값 근처로
                // 드래그하면 정확히 여기에 맞춰져 겹쳐 보이게 됨
                waterFlowScalarSnapCandidates.push({ axis: busAxis, value: trunk, connIds: siblingIds });
                waterFlowScalarSnapCandidates.push({ axis: exitBendAxis, value: exitBend, connIds: siblingIds });

                // 트렁크(버스)와 exitBend는 같은 출발 블록에서 나가는 형제 연결선 전체가 공유하므로,
                // 하나라도 점선이면 그 구간도 점선으로, 색은 형제들의 색이 전부 같을 때만 표시(다르면
                // 기본 색)해서 어느 쪽도 틀린 것처럼 보이지 않게 함
                const branchConns = g.branches.map(b => waterFlowConnections.find(c => c.id === b.connId)).filter(Boolean);
                // 형제가 여럿이라 완전히 겹쳐 보이는 구간(출발 지점~트렁크)을 클릭했을 때 어느 연결을
                // 열지 정해야 하므로, 지금 화면에 실선으로 보이는(=우선순위가 더 높은) 연결을 고르고,
                // 전부 점선이면 첫 번째 것을 고름 - 형제가 하나뿐이면 당연히 그 하나
                const primaryClickConn = branchConns.find(c => c.lineStyle !== 'dashed') || branchConns[0];
                const singleConnClickHandler = primaryClickConn ? ` onclick="handleWaterFlowConnectionLineClick('${primaryClickConn.id}')"` : '';
                // 실선이 점선보다 우선해서 보이도록(겹쳤을 때 실선이 이김), 형제 전부가 점선일 때만 점선으로 함
                const trunkDashed = branchConns.length > 0 && branchConns.every(c => c.lineStyle === 'dashed');
                const trunkColors = [...new Set(branchConns.map(c => c.color).filter(Boolean))];
                const trunkColorStyle = trunkColors.length === 1 ? `stroke:${trunkColors[0]}` : '';

                // 점 구성: 출발 지점(p0) → exitBend로 꺾임(p1) → 트렁크로 꺾여 버스에 합류(p2) → 버스 범위(p3~p4)
                const p0 = g.exit;
                const p1 = isVertical ? { x: exitBend, y: g.exit.y } : { x: g.exit.x, y: exitBend };
                const p2 = isVertical ? { x: exitBend, y: trunk } : { x: trunk, y: exitBend };
                const p3 = isVertical ? { x: busMin, y: trunk } : { x: trunk, y: busMin };
                const p4 = isVertical ? { x: busMax, y: trunk } : { x: trunk, y: busMax };

                // 구간 1: 출발 지점 → exitBend 꺾임. 출발 지점 쪽 끝은 블록에 고정된 좌표라 조정할
                // 값이 없으므로 드래그는 지원하지 않고 클릭(편집/삭제)만 지원함
                pushVisual(p0, p1, trunkColorStyle, trunkDashed);
                svgHtml += `<polyline points="${p0.x},${p0.y} ${p1.x},${p1.y}" class="water-flow-connection-hit"${singleConnClickHandler}><title>클릭하면 편집/삭제(연결 모드 중이면 여기로 이어붙이기)</title></polyline>`;

                // 구간 2: exitBend 꺾임 → 트렁크 꺾임. exitBend를 조정하는 손잡이
                pushVisual(p1, p2, trunkColorStyle, trunkDashed);
                svgHtml += `<polyline points="${p1.x},${p1.y} ${p2.x},${p2.y}" class="water-flow-connection-hit" style="cursor:${exitBendCursor}"
                    onpointerdown="waterFlowScalarPointerDown(event, '${connIds}', 'exitBend', '${exitBendAxis}', ${exitBend})"${singleConnClickHandler}><title>드래그로 출발 쪽 꺾임 옮기기 · 클릭하면 편집/삭제(연결 모드 중이면 여기로 이어붙이기)</title></polyline>`;

                // 구간 3: 트렁크 꺾임 → 버스(가지들이 갈라지는 범위). 트렁크를 조정하는 손잡이.
                // 버스의 보이는 선은 (형제 전체가 합의된 색/점선이 아니라) 가지마다 따로 그림 - 그래야
                // 예를 들어 실선 가지 하나와 점선 가지 둘이 버스를 같이 쓸 때, 실선 가지가 실제로 뻗어
                // 있는 구간만 실선으로 덮이고, 그 너머(점선 가지만 더 뻗어 있는 구간)는 점선 그대로 보임.
                // 가지들의 구간을 모두 합치면 버스 전체(busMin~busMax)가 항상 빠짐없이 채워짐
                g.branches.forEach(b => {
                    const bElbow = isVertical ? { x: b.entry.x, y: trunk } : { x: trunk, y: b.entry.y };
                    const bConn = waterFlowConnections.find(c => c.id === b.connId);
                    pushVisual(p2, bElbow, trunkColorStyle, !!(bConn && bConn.lineStyle === 'dashed'));
                });
                svgHtml += `<polyline points="${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}" class="water-flow-connection-hit" style="cursor:${busCursor}"
                    onpointerdown="waterFlowScalarPointerDown(event, '${connIds}', '${busField}', '${busAxis}', ${trunk})"${singleConnClickHandler}><title>드래그로 꺾이는 위치 옮기기 · 클릭하면 편집/삭제(연결 모드 중이면 여기로 이어붙이기)</title></polyline>`;

                // 가지(트렁크 → 각 도착 지점): 연결마다 따로 그려서 클릭하면 그 연결만 편집/삭제할 수
                // 있게 함. 도착 지점 쪽에도 트렁크와 반대 축으로 꺾을 수 있는 손잡이(entryBend)를 둬서,
                // 트렁크·exitBend·entryBend 세 손잡이를 합치면 이 연결선은 어디를 잡아도 항상 그 구간의
                // 실제 모양(세로면 좌우, 가로면 위아래)대로 자연스럽게 움직임. 가지의 (꺾이기 전) 중간
                // 지점은 다른 블록이 이 연결선에 "이어붙을" 때 앵커로 쓰임
                g.branches.forEach(b => {
                    const conn = waterFlowConnections.find(c => c.id === b.connId);
                    const elbow = isVertical ? { x: b.entry.x, y: trunk } : { x: trunk, y: b.entry.y };
                    branchMidpointByConnId[b.connId] = { x: (elbow.x + b.entry.x) / 2, y: (elbow.y + b.entry.y) / 2 };

                    const entryBendDefault = isVertical ? b.entry.x : b.entry.y;
                    const entryBend = (conn && typeof conn.entryBend === 'number') ? conn.entryBend : entryBendDefault;
                    const c1 = isVertical ? { x: entryBend, y: trunk } : { x: trunk, y: entryBend };
                    const c2 = isVertical ? { x: entryBend, y: b.entry.y } : { x: b.entry.x, y: entryBend };
                    const branchColorStyle = conn && conn.color ? `stroke:${conn.color}` : '';
                    const branchDashed = !!(conn && conn.lineStyle === 'dashed');
                    const entryBendCursor = isVertical ? 'ew-resize' : 'ns-resize';
                    const entryBendAxis = isVertical ? 'x' : 'y';
                    waterFlowScalarSnapCandidates.push({ axis: entryBendAxis, value: entryBend, connIds: [b.connId] });

                    // 구간 1: 트렁크 → entryBend 꺾임. 트렁크와 같은 값을 공유하므로 트렁크 손잡이와 동일하게 동작
                    pushVisual(elbow, c1, branchColorStyle, branchDashed);
                    svgHtml += `<polyline points="${elbow.x},${elbow.y} ${c1.x},${c1.y}" class="water-flow-connection-hit" style="cursor:${busCursor}"
                        onpointerdown="waterFlowScalarPointerDown(event, '${connIds}', '${busField}', '${busAxis}', ${trunk})"
                        onclick="handleWaterFlowConnectionLineClick('${b.connId}')"><title>드래그로 꺾이는 위치 옮기기 · 클릭하면 편집/삭제(연결 모드 중이면 여기로 이어붙이기)</title></polyline>`;

                    // 구간 2: entryBend 꺾임 → 도착 쪽 꺾임. entryBend를 조정하는 손잡이
                    pushVisual(c1, c2, branchColorStyle, branchDashed);
                    svgHtml += `<polyline points="${c1.x},${c1.y} ${c2.x},${c2.y}" class="water-flow-connection-hit" style="cursor:${entryBendCursor}"
                        onpointerdown="waterFlowScalarPointerDown(event, '${b.connId}', 'entryBend', '${entryBendAxis}', ${entryBend})"
                        onclick="handleWaterFlowConnectionLineClick('${b.connId}')"><title>드래그로 이 가지만 다른 방향으로 꺾기 · 클릭하면 편집/삭제(연결 모드 중이면 여기로 이어붙이기)</title></polyline>`;

                    // 구간 3: 도착 쪽 꺾임 → 도착 지점. 도착 지점 쪽 끝은 블록에 고정된 좌표라 드래그는
                    // 지원하지 않고 클릭(편집/삭제)만 지원함
                    pushVisual(c2, b.entry, branchColorStyle, branchDashed);
                    svgHtml += `<polyline points="${c2.x},${c2.y} ${b.entry.x},${b.entry.y}" class="water-flow-connection-hit" onclick="handleWaterFlowConnectionLineClick('${b.connId}')"><title>클릭하면 편집/삭제(연결 모드 중이면 여기로 이어붙이기)</title></polyline>`;
                });
            }

            // 1단계: 블록↔블록 연결선
            const blockGroups = buildGroups(
                blockTargetConns,
                c => { const r = rects[c.to]; return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; },
                (c, direction) => { const r = rects[c.to]; return r ? waterFlowAttachPoint(r, WATER_FLOW_ENTRY_SIDE[direction]) : null; }
            );
            Object.values(blockGroups).forEach(renderGroup);

            // 2단계: 다른 연결선에 이어붙은(탭) 연결선 - 1단계에서 구한 가지 중간 지점을 향해 그림
            const tapGroups = buildGroups(
                tapConns,
                c => branchMidpointByConnId[c.toConnectionId] || null,
                c => branchMidpointByConnId[c.toConnectionId] || null
            );
            Object.values(tapGroups).forEach(renderGroup);

            // 점선을 먼저, 실선을 나중에(위에) 그려서 서로 겹칠 때 실선이 우선 보이게 하고,
            // 클릭/드래그용 히트 영역(svgHtml)은 항상 맨 위에 둬서 클릭이 항상 잘 먹게 함
            svg.innerHTML = dashedVisualHtml + solidVisualHtml + svgHtml;
        }

        let waterFlowScalarDragState = null; // { connIds, field, axis, startClientX, startClientY, startValue, moved }
        const WATER_FLOW_CONN_DRAG_THRESHOLD = 6;

        // 연결선의 각 구간(트렁크/exitBend/entryBend)을 드래그로 옮길 수 있게 하는 공용 핸들러.
        // axis가 'x'면 좌우로, 'y'면 상하로만 움직이며, 렌더링 쪽에서 그 구간이 실제로 그려지는
        // 모양(세로면 좌우 화살표, 가로면 위아래 화살표)과 axis가 항상 일치하도록 값을 넘겨주므로
        // 여기서는 그 값만 그대로 따르면 됨. connIds에 여러 개가 담겨 있으면(트렁크·exitBend처럼
        // 형제 연결선이 공유하는 값) 한 번에 다 같이 옮겨져 계속 하나로 이어짐
        function waterFlowScalarPointerDown(e, connIdsStr, field, axis, startValue) {
            if (e.button !== undefined && e.button !== 0) return; // 마우스면 왼쪽 버튼만
            if (!editUnlocked) return; // 잠긴 상태에서는 옮길 수 없음(클릭해서 지우는 것도 로그인 필요 - deleteWaterFlowConnection에서 다시 확인함)
            waterFlowScalarDragState = {
                connIds: connIdsStr.split(','),
                field, axis,
                startClientX: e.clientX, startClientY: e.clientY,
                startValue,
                moved: false
            };
            document.addEventListener('pointermove', waterFlowScalarPointerMove);
            document.addEventListener('pointerup', waterFlowScalarPointerUp);
            document.addEventListener('pointercancel', waterFlowScalarPointerUp);
        }

        function waterFlowScalarPointerMove(e) {
            const state = waterFlowScalarDragState;
            if (!state) return;
            const rawDx = e.clientX - state.startClientX;
            const rawDy = e.clientY - state.startClientY;

            if (!state.moved) {
                if (Math.hypot(rawDx, rawDy) < WATER_FLOW_CONN_DRAG_THRESHOLD) return;
                state.moved = true;
                pushWaterFlowUndoSnapshot(); // 아직 옮기기 전(원래 위치)이 저장되도록 실제로 드래그가 시작되는 순간에 한 번만 남김
            }
            e.preventDefault();

            const delta = (state.axis === 'x' ? rawDx : rawDy) / waterFlowViewZoom; // 확대 배율만큼 보정
            let newValue = state.startValue + delta;

            // 다른 연결선(형제가 아닌)의 같은 축 꺾임 지점 근처로 오면 그 값에 딱 맞춰서, 두 선이
            // 완전히 겹쳐 하나로 합쳐진 것처럼 보이게 함
            const snapped = findWaterFlowScalarSnap(state.axis, newValue, state.connIds);
            if (snapped !== null) newValue = snapped;

            state.connIds.forEach(id => {
                const conn = waterFlowConnections.find(c => c.id === id);
                if (conn) conn[state.field] = newValue;
            });
            renderWaterFlowConnections();
        }

        // 지금 드래그 중인 연결선(자신의 connIds는 제외)이 그리는 다른 꺾임 지점들 중, 같은 축(x/y)
        // 위에서 value와 가장 가까운 값을 찾아 반환함. 임계값 밖이면 null
        function findWaterFlowScalarSnap(axis, value, excludeConnIds) {
            let best = null, bestDelta = WATER_FLOW_CONN_SNAP_THRESHOLD;
            waterFlowScalarSnapCandidates.forEach(cand => {
                if (cand.axis !== axis) return;
                if (cand.connIds.some(id => excludeConnIds.includes(id))) return;
                const delta = Math.abs(cand.value - value);
                if (delta < bestDelta) { bestDelta = delta; best = cand.value; }
            });
            return best;
        }

        function waterFlowScalarPointerUp(e) {
            if (!waterFlowScalarDragState) return;
            document.removeEventListener('pointermove', waterFlowScalarPointerMove);
            document.removeEventListener('pointerup', waterFlowScalarPointerUp);
            document.removeEventListener('pointercancel', waterFlowScalarPointerUp);

            const state = waterFlowScalarDragState;
            waterFlowScalarDragState = null;
            if (!state.moved) return; // 움직임 없이 눌렀다 뗀 경우(클릭)는 별도 onclick이 처리하도록 둠

            // 실제로 드래그한 경우엔 뒤이어 발생하는 click이 연결선을 삭제하지 않도록 한 번 막음
            document.addEventListener('click', function suppressClick(ev) {
                ev.stopPropagation();
            }, { capture: true, once: true });

            saveWaterFlowConnectionsToStorage();
        }

        let waterFlowDragState = null; // { blockId, el, startClientX, startClientY, startLeft, startTop, moved, pendingX, pendingY }
        const WATER_FLOW_DRAG_MOVE_THRESHOLD = 6;
        const WATER_FLOW_SNAP_THRESHOLD = 8; // 이 거리(px) 안으로 들어오면 다른 블록에 맞춰 자동 정렬함

        // 드래그 중인 블록의 좌/중앙/우, 상/중앙/하 기준선이 다른 블록의 같은 기준선과 가까우면
        // 그 위치에 딱 맞춰지도록(스냅) 보정값을 계산함. 가로(x)와 세로(y)는 서로 독립적으로 스냅됨
        function computeWaterFlowSnap(draggedRect, otherRects) {
            let snapLeft = null, guideX = null, bestXDelta = WATER_FLOW_SNAP_THRESHOLD;
            let snapTop = null, guideY = null, bestYDelta = WATER_FLOW_SNAP_THRESHOLD;

            const dLeft = draggedRect.left, dCenterX = draggedRect.left + draggedRect.width / 2, dRight = draggedRect.left + draggedRect.width;
            const dTop = draggedRect.top, dCenterY = draggedRect.top + draggedRect.height / 2, dBottom = draggedRect.top + draggedRect.height;

            otherRects.forEach(r => {
                const oLeft = r.left, oCenterX = r.left + r.width / 2, oRight = r.left + r.width;
                const oTop = r.top, oCenterY = r.top + r.height / 2, oBottom = r.top + r.height;

                [[dLeft, oLeft, 0], [dCenterX, oCenterX, draggedRect.width / 2], [dRight, oRight, draggedRect.width]].forEach(([dVal, oVal, offset]) => {
                    const delta = Math.abs(dVal - oVal);
                    if (delta < bestXDelta) {
                        bestXDelta = delta;
                        snapLeft = oVal - offset;
                        guideX = oVal;
                    }
                });
                [[dTop, oTop, 0], [dCenterY, oCenterY, draggedRect.height / 2], [dBottom, oBottom, draggedRect.height]].forEach(([dVal, oVal, offset]) => {
                    const delta = Math.abs(dVal - oVal);
                    if (delta < bestYDelta) {
                        bestYDelta = delta;
                        snapTop = oVal - offset;
                        guideY = oVal;
                    }
                });
            });

            return { left: snapLeft, top: snapTop, guideX, guideY };
        }

        // 정렬(위 함수)로 못 맞춘 축에 대해, 이웃한 블록들 사이 간격(빈틈)까지 맞춰줌.
        // 예를 들어 A-B 간격이 40px일 때 B 옆으로 C를 끌어오면, B-C 간격도 40px에 가까워지는 순간
        // 정확히 40px로 스냅됨(가로 방향은 세로로 겹치는 블록끼리, 세로 방향은 가로로 겹치는 블록끼리 비교)
        function computeWaterFlowSpacingSnap(draggedRect, otherRects) {
            let snapLeft = null, snapTop = null;
            const draggedCenterX = draggedRect.left + draggedRect.width / 2;
            const draggedCenterY = draggedRect.top + draggedRect.height / 2;

            const rowPeers = otherRects.filter(r => r.top < draggedRect.top + draggedRect.height && r.top + r.height > draggedRect.top);
            const beforeX = rowPeers.filter(r => r.left + r.width / 2 < draggedCenterX).sort((a, b) => (b.left + b.width) - (a.left + a.width));
            const afterX = rowPeers.filter(r => r.left + r.width / 2 >= draggedCenterX).sort((a, b) => a.left - b.left);
            const leftNeighbor = beforeX[0], rightNeighbor = afterX[0];

            if (leftNeighbor) {
                const leftOfLeft = beforeX.find(r => r !== leftNeighbor && (r.left + r.width) <= leftNeighbor.left);
                if (leftOfLeft) {
                    const refGap = leftNeighbor.left - (leftOfLeft.left + leftOfLeft.width);
                    const curGap = draggedRect.left - (leftNeighbor.left + leftNeighbor.width);
                    if (refGap >= 0 && Math.abs(curGap - refGap) < WATER_FLOW_SNAP_THRESHOLD) {
                        snapLeft = leftNeighbor.left + leftNeighbor.width + refGap;
                    }
                }
            }
            if (snapLeft === null && rightNeighbor) {
                const rightOfRight = afterX.find(r => r !== rightNeighbor && r.left >= (rightNeighbor.left + rightNeighbor.width));
                if (rightOfRight) {
                    const refGap = rightOfRight.left - (rightNeighbor.left + rightNeighbor.width);
                    const curGap = rightNeighbor.left - (draggedRect.left + draggedRect.width);
                    if (refGap >= 0 && Math.abs(curGap - refGap) < WATER_FLOW_SNAP_THRESHOLD) {
                        snapLeft = rightNeighbor.left - draggedRect.width - refGap;
                    }
                }
            }

            const colPeers = otherRects.filter(r => r.left < draggedRect.left + draggedRect.width && r.left + r.width > draggedRect.left);
            const beforeY = colPeers.filter(r => r.top + r.height / 2 < draggedCenterY).sort((a, b) => (b.top + b.height) - (a.top + a.height));
            const afterY = colPeers.filter(r => r.top + r.height / 2 >= draggedCenterY).sort((a, b) => a.top - b.top);
            const topNeighbor = beforeY[0], bottomNeighbor = afterY[0];

            if (topNeighbor) {
                const aboveTop = beforeY.find(r => r !== topNeighbor && (r.top + r.height) <= topNeighbor.top);
                if (aboveTop) {
                    const refGap = topNeighbor.top - (aboveTop.top + aboveTop.height);
                    const curGap = draggedRect.top - (topNeighbor.top + topNeighbor.height);
                    if (refGap >= 0 && Math.abs(curGap - refGap) < WATER_FLOW_SNAP_THRESHOLD) {
                        snapTop = topNeighbor.top + topNeighbor.height + refGap;
                    }
                }
            }
            if (snapTop === null && bottomNeighbor) {
                const belowBottom = afterY.find(r => r !== bottomNeighbor && r.top >= (bottomNeighbor.top + bottomNeighbor.height));
                if (belowBottom) {
                    const refGap = belowBottom.top - (bottomNeighbor.top + bottomNeighbor.height);
                    const curGap = bottomNeighbor.top - (draggedRect.top + draggedRect.height);
                    if (refGap >= 0 && Math.abs(curGap - refGap) < WATER_FLOW_SNAP_THRESHOLD) {
                        snapTop = bottomNeighbor.top - draggedRect.height - refGap;
                    }
                }
            }

            return { left: snapLeft, top: snapTop };
        }

        // 스냅이 적용된 위치에 빨간 안내선을 그어서, 지금 어떤 기준(좌/중앙/우, 상/중앙/하)에
        // 맞춰지고 있는지 보여줌. guideX/guideY가 null이면 해당 방향 안내선은 지움
        function updateWaterFlowSnapGuides(canvas, guideX, guideY) {
            let vEl = document.getElementById('waterFlowSnapGuideV');
            if (guideX !== null) {
                if (!vEl) {
                    vEl = document.createElement('div');
                    vEl.id = 'waterFlowSnapGuideV';
                    vEl.className = 'water-flow-snap-guide water-flow-snap-guide-v';
                    canvas.appendChild(vEl);
                }
                vEl.style.left = guideX + 'px';
                vEl.style.height = canvas.scrollHeight + 'px';
            } else if (vEl) {
                vEl.remove();
            }

            let hEl = document.getElementById('waterFlowSnapGuideH');
            if (guideY !== null) {
                if (!hEl) {
                    hEl = document.createElement('div');
                    hEl.id = 'waterFlowSnapGuideH';
                    hEl.className = 'water-flow-snap-guide water-flow-snap-guide-h';
                    canvas.appendChild(hEl);
                }
                hEl.style.top = guideY + 'px';
                hEl.style.width = canvas.scrollWidth + 'px';
            } else if (hEl) {
                hEl.remove();
            }
        }

        function clearWaterFlowSnapGuides() {
            document.getElementById('waterFlowSnapGuideV')?.remove();
            document.getElementById('waterFlowSnapGuideH')?.remove();
        }

        function waterFlowBlockPointerDown(e, blockId) {
            if (e.button !== undefined && e.button !== 0) return; // 마우스면 왼쪽 버튼만
            if (!editUnlocked) return; // 잠긴 상태에서는 위치를 옮길 수 없음(펼쳐보는 클릭은 별도 onclick으로 그대로 동작)
            if (e.target.closest('.water-flow-block-edit-btn') || e.target.closest('.water-flow-block-connect-btn') || e.target.closest('.water-flow-block-delete-btn') || e.target.closest('.water-flow-block-duplicate-btn')) return;
            const block = waterFlowBlocks.find(b => b.id === blockId);
            if (!block) return;

            waterFlowDragState = {
                blockId,
                el: e.currentTarget,
                startClientX: e.clientX,
                startClientY: e.clientY,
                startLeft: block.x || 0,
                startTop: block.y || 0,
                moved: false,
                pendingX: block.x || 0,
                pendingY: block.y || 0
            };
            document.addEventListener('pointermove', waterFlowBlockPointerMove);
            document.addEventListener('pointerup', waterFlowBlockPointerUp);
            document.addEventListener('pointercancel', waterFlowBlockPointerUp);
        }

        function waterFlowBlockPointerMove(e) {
            if (!waterFlowDragState) return;
            const rawDx = e.clientX - waterFlowDragState.startClientX;
            const rawDy = e.clientY - waterFlowDragState.startClientY;

            if (!waterFlowDragState.moved) {
                if (Math.hypot(rawDx, rawDy) < WATER_FLOW_DRAG_MOVE_THRESHOLD) return;
                waterFlowDragState.moved = true;
                waterFlowDragState.el.classList.add('dragging');
                pushWaterFlowUndoSnapshot(); // 아직 옮기기 전(원래 위치)이 저장되도록 실제로 드래그가 시작되는 순간에 한 번만 남김
            }

            e.preventDefault(); // 드래그 중 터치 스크롤/텍스트 선택 방지
            // 캔버스가 확대/축소된 상태에서는 화면상 이동 거리와 실제(스케일 이전) 좌표 이동량이
            // 다르므로, 배율만큼 나눠서 블록이 마우스 포인터를 그대로 따라오도록 보정함
            const dx = rawDx / waterFlowViewZoom;
            const dy = rawDy / waterFlowViewZoom;
            const canvas = document.getElementById('waterFlowCanvas');
            let newLeft = Math.max(0, waterFlowDragState.startLeft + dx);
            let newTop = Math.max(0, waterFlowDragState.startTop + dy);

            // 다른 블록들과 가로/세로로 맞춰지도록(좌/중앙/우, 상/중앙/하 기준) 스냅 보정
            const el = waterFlowDragState.el;
            const draggedRect = { left: newLeft, top: newTop, width: el.offsetWidth, height: el.offsetHeight };
            const otherRects = waterFlowBlocks
                .filter(b => b.id !== waterFlowDragState.blockId)
                .map(b => {
                    const oEl = canvas.querySelector(`.water-flow-block[data-block-id="${b.id}"]`);
                    return oEl ? { left: oEl.offsetLeft, top: oEl.offsetTop, width: oEl.offsetWidth, height: oEl.offsetHeight } : null;
                })
                .filter(Boolean);
            const snap = computeWaterFlowSnap(draggedRect, otherRects);
            if (snap.left !== null) newLeft = Math.max(0, snap.left);
            if (snap.top !== null) newTop = Math.max(0, snap.top);

            // 좌/중앙/우, 상/중앙/하로 못 맞춘 축은 이웃 블록들 사이 간격에 맞춰봄
            if (snap.left === null || snap.top === null) {
                const spacingSnap = computeWaterFlowSpacingSnap({ left: newLeft, top: newTop, width: draggedRect.width, height: draggedRect.height }, otherRects);
                if (snap.left === null && spacingSnap.left !== null) newLeft = Math.max(0, spacingSnap.left);
                if (snap.top === null && spacingSnap.top !== null) newTop = Math.max(0, spacingSnap.top);
            }

            updateWaterFlowSnapGuides(canvas, snap.guideX, snap.guideY);

            el.style.left = newLeft + 'px';
            el.style.top = newTop + 'px';
            waterFlowDragState.pendingX = newLeft;
            waterFlowDragState.pendingY = newTop;
            renderWaterFlowConnections(); // 연결선이 드래그 중인 블록을 실시간으로 따라오도록 함
        }

        function waterFlowBlockPointerUp(e) {
            if (!waterFlowDragState) return;
            document.removeEventListener('pointermove', waterFlowBlockPointerMove);
            document.removeEventListener('pointerup', waterFlowBlockPointerUp);
            document.removeEventListener('pointercancel', waterFlowBlockPointerUp);

            const state = waterFlowDragState;
            waterFlowDragState = null;
            state.el.classList.remove('dragging');
            clearWaterFlowSnapGuides();

            if (!state.moved) return; // 움직임 없이 눌렀다 뗀 경우(클릭)는 별도 onclick이 펼치기/접기를 처리하도록 둠

            // 실제로 드래그한 경우엔 뒤이어 발생하는 click이 펼치기/접기를 토글하지 않도록 한 번 막음
            document.addEventListener('click', function suppressClick(ev) {
                ev.stopPropagation();
            }, { capture: true, once: true });

            const block = waterFlowBlocks.find(b => b.id === state.blockId);
            if (!block) return;
            block.x = state.pendingX;
            block.y = state.pendingY;
            saveWaterFlowBlocksToStorage();
            renderWaterFlowAlignRails(); // 이 블록이 새로 다른 블록과 정렬됐을 수 있으므로 줄 손잡이도 갱신
        }

        // "➕ 블록 추가" 버튼 전용: 지금 보이는 화면 중앙에 놓일 위치를 미리 담아두고 추가 창을 엶
        function openAddWaterFlowBlockModalAtViewportCenter() {
            if (!checkEditPermission()) return;
            pendingNewWaterFlowBlockPosition = waterFlowViewportCenterPosition();
            openWaterFlowBlockModal(null);
        }

        function openWaterFlowBlockModal(blockId) {
            if (!checkEditPermission()) return;
            editingWaterFlowBlockId = blockId;
            const modal = document.getElementById('waterFlowBlockModal');
            const title = document.getElementById('waterFlowBlockModalTitle');
            const deleteBtn = document.getElementById('deleteWaterFlowBlockBtn');

            if (blockId) {
                const b = waterFlowBlocks.find(x => x.id === blockId);
                if (!b) return;
                title.textContent = '🔀 블록 수정';
                document.getElementById('waterFlowBlockTitleInput').value = b.title || '';
                document.getElementById('waterFlowBlockDetailInput').value = b.detail || '';
                pickWaterFlowBlockColor(b.color || COLOR_PALETTE[0]);
                deleteBtn.style.display = 'inline-block';
            } else {
                title.textContent = '🔀 블록 추가';
                document.getElementById('waterFlowBlockTitleInput').value = '';
                document.getElementById('waterFlowBlockDetailInput').value = '';
                pickWaterFlowBlockColor(COLOR_PALETTE[0]);
                deleteBtn.style.display = 'none';
            }

            modal.classList.add('active');
            applyFormLockState(); // 위 각 input.value 설정 뒤에도 잠금 상태(readOnly)가 유지되도록 재적용
        }

        function pickWaterFlowBlockColor(color) {
            document.getElementById('waterFlowBlockColorInput').value = color;
            document.querySelectorAll('#waterFlowBlockColorRow .color-swatch').forEach(sw => {
                sw.classList.toggle('selected', sw.dataset.color === color);
            });
        }

        function closeWaterFlowBlockModal() {
            document.getElementById('waterFlowBlockModal').classList.remove('active');
            editingWaterFlowBlockId = null;
            pendingNewWaterFlowBlockPosition = null; // 취소했으면 더블클릭으로 찍어둔 위치도 함께 버림
        }

        // 빈 곳을 더블클릭해서 블록을 추가할 때, 그 클릭한 위치에 새 블록을 놓기 위해 잠깐 담아두는 값.
        // "➕ 블록 추가" 버튼으로 추가할 때는 이 값이 없어서 기존처럼 격자 위치에 놓임
        let pendingNewWaterFlowBlockPosition = null;

        function saveWaterFlowBlock() {
            if (!checkEditPermission()) return;

            const title = document.getElementById('waterFlowBlockTitleInput').value.trim();
            if (!title) {
                showAppToast('블록 제목을 입력해주세요');
                return;
            }
            const detail = document.getElementById('waterFlowBlockDetailInput').value.trim();
            const color = document.getElementById('waterFlowBlockColorInput').value || COLOR_PALETTE[0];

            pushWaterFlowUndoSnapshot();
            if (editingWaterFlowBlockId) {
                const b = waterFlowBlocks.find(x => x.id === editingWaterFlowBlockId);
                if (b) { b.title = title; b.detail = detail; b.color = color; }
            } else {
                const pos = pendingNewWaterFlowBlockPosition || nextWaterFlowBlockPosition();
                pendingNewWaterFlowBlockPosition = null;
                waterFlowBlocks.push({
                    id: 'wfb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                    title, detail, color, x: pos.x, y: pos.y, expanded: true
                });
            }

            saveWaterFlowBlocksToStorage();
            closeWaterFlowBlockModal();
            renderWaterFlowCanvas();
        }

        function deleteWaterFlowBlock() {
            if (!checkEditPermission()) return;
            if (!editingWaterFlowBlockId) return;
            confirmModal('이 블록을 삭제하시겠습니까? 이 블록에 연결된 선도 함께 삭제됩니다.', () => {
                pushWaterFlowUndoSnapshot();
                const deletedId = editingWaterFlowBlockId;
                waterFlowBlocks = waterFlowBlocks.filter(b => b.id !== deletedId);
                const directIds = waterFlowConnections.filter(c => c.from === deletedId || c.to === deletedId).map(c => c.id);
                const idsToRemove = collectWaterFlowConnectionCascadeIds(directIds);
                waterFlowConnections = waterFlowConnections.filter(c => !idsToRemove.has(c.id));
                saveWaterFlowBlocksToStorage();
                saveWaterFlowConnectionsToStorage();
                closeWaterFlowBlockModal();
                renderWaterFlowCanvas();
            });
        }

        // 수정 모달을 거치지 않고 블록 카드에서 바로 삭제(확인은 그대로 거침)
        function deleteWaterFlowBlockDirect(blockId) {
            if (!checkEditPermission()) return;
            editingWaterFlowBlockId = blockId;
            deleteWaterFlowBlock();
        }

        // 제목/내용/색만 살짝 바꿔서 비슷한 블록을 또 만들고 싶을 때, 매번 새로 입력하지 않아도 되게
        // 바로 옆에 복제본을 놓음. 원본과 연결된 화살표는 복제하지 않음(무엇과 이어야 할지 애매해서)
        function duplicateWaterFlowBlock(blockId) {
            if (!checkEditPermission()) return;
            const b = waterFlowBlocks.find(x => x.id === blockId);
            if (!b) return;
            pushWaterFlowUndoSnapshot();
            waterFlowBlocks.push({
                id: 'wfb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                title: b.title, detail: b.detail, color: b.color,
                x: (b.x || 0) + 24, y: (b.y || 0) + 24,
                expanded: b.expanded
            });
            saveWaterFlowBlocksToStorage();
            renderWaterFlowCanvas();
            showStatus('📋 블록을 복제했습니다', 'success');
        }

        // 빈 곳(블록/연결선이 아닌 곳)을 더블클릭하면 그 위치에 새 블록을 추가하는 창을 바로 띄움
        function waterFlowCanvasDoubleClick(e) {
            if (e.target !== e.currentTarget) return;
            if (!checkEditPermission()) return;
            const canvas = document.getElementById('waterFlowCanvas');
            const rect = canvas.getBoundingClientRect();
            pendingNewWaterFlowBlockPosition = {
                x: Math.max(0, (e.clientX - rect.left) / waterFlowViewZoom),
                y: Math.max(0, (e.clientY - rect.top) / waterFlowViewZoom)
            };
            openWaterFlowBlockModal(null);
        }

