        // ===== 관리자 전용 화면 (계정 관리) =====
        let adminUserList = [];
        let adminTrashList = [];
        let adminPendingList = [];
        let adminDefaultDisabledFeatures = [];
        let adminSortKey = 'employeeId';
        let adminSortDir = 'desc';

        function enterAdminMode() {
            document.body.classList.add('admin-mode');
            switchAdminSubTab('parts'); // 로그인할 때마다 항상 첫 번째 탭(파트&조직도관리)부터 보여줌
            loadAdminUserList();
            loadTeamReportParts();
        }

        // 관리자 화면 안의 "파트&조직도관리" / "계정관리" 서브탭 전환
        function switchAdminSubTab(name) {
            ['parts', 'accounts'].forEach(key => {
                document.getElementById('adminSubPanel-' + key).style.display = (key === name) ? 'block' : 'none';
                document.getElementById('adminSubTabBtn-' + key).classList.toggle('active', key === name);
            });
        }

        async function loadAdminUserList() {
            const statusEl = document.getElementById('adminStatus');
            statusEl.textContent = '☁️ 불러오는 중...';
            statusEl.className = 'ai-status';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'adminListUsers',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    adminUserList = Array.isArray(data.users) ? data.users : [];
                    adminTrashList = Array.isArray(data.trash) ? data.trash : [];
                    adminPendingList = Array.isArray(data.pendingApproval) ? data.pendingApproval : [];
                    adminDefaultDisabledFeatures = Array.isArray(data.defaultDisabledFeatures) ? data.defaultDisabledFeatures : [];
                    renderAdminUserTable();
                    renderAdminTrashTable();
                    renderAdminPendingTable();
                    renderAdminDefaultFeatureChecklist();
                    renderOrgChart();
                    statusEl.textContent = `✅ 총 ${adminUserList.length}개 계정 (휴지통 ${adminTrashList.length}개, 승인 대기 ${adminPendingList.length}개)`;
                    statusEl.className = 'ai-status success';
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '목록을 불러오지 못했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('관리자 계정 목록 조회 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            }
        }

        // ===== 관리자 조직도 (드래그앤드롭으로 팀장/파트장/팀원 자리 배정) =====
        // 향남공무팀 산하 파트 목록. 관리자가 자유롭게 추가/삭제/수정할 수 있어서 고정값이 아니라
        // 서버(getTeamReportParts)에서 불러와 채움 - 응답이 오기 전까지 쓸 기본값만 여기 적어둠.
        // 소속(department) 값은 "향남공무팀-설비파트"처럼 TEAM_REPORT_PART_DEPT_PREFIX + 파트명
        // 형태로 저장됨 (회원가입/계정정보 수정 드롭다운과 동일한 값)
        let TEAM_REPORT_PARTS = ['설비파트', '장비파트', 'GMP파트'];
        const TEAM_REPORT_PART_DEPT_PREFIX = '향남공무팀-';
        let partManagerRows = []; // 관리자 화면의 파트 관리 편집 상태: [{original, value}]

        function getPartFromDepartment(department) {
            if (!department) return null;
            const part = department.slice(TEAM_REPORT_PART_DEPT_PREFIX.length);
            return (department.startsWith(TEAM_REPORT_PART_DEPT_PREFIX) && TEAM_REPORT_PARTS.includes(part)) ? part : null;
        }

        // 파트 목록을 서버에서 불러와 TEAM_REPORT_PARTS를 갱신하고, 그걸 쓰는 화면들(소속 선택
        // 드롭다운 3곳, 조직도, 파트 관리 편집창)을 다시 그림. 로그인 여부와 무관하게 부를 수 있어서
        // 회원가입 모달을 열기 전(로그인 전 초기 화면)에도 호출함
        async function loadTeamReportParts() {
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'getTeamReportParts' })
                });
                const data = await res.json();
                if (data.status === 'success' && Array.isArray(data.parts) && data.parts.length > 0) {
                    TEAM_REPORT_PARTS = data.parts;
                }
            } catch (err) {
                console.error('파트 목록 불러오기 오류:', err);
            }
            renderAllDepartmentSelects();
            renderOrgChart();
            renderPartManagerUI();
        }

        // 회원가입/계정정보 수정/관리자 계정정보 수정 3곳의 소속 select를 지금의 TEAM_REPORT_PARTS로 다시 채움.
        // "직접입력"으로 저장해둔 값 등 목록에 없는 기존 선택값은 setDepartmentFieldValue가 알아서 커스텀 입력으로 되돌림
        function renderAllDepartmentSelects() {
            ['signup', 'account', 'adminEdit'].forEach(which => {
                const select = document.getElementById(which + 'DepartmentInput');
                if (!select) return;
                const prevValue = select.value;
                const partOptions = TEAM_REPORT_PARTS.map(p => {
                    const val = TEAM_REPORT_PART_DEPT_PREFIX + p;
                    return `<option value="${escapeHtml(val)}">${escapeHtml(val)}</option>`;
                }).join('');
                select.innerHTML = partOptions
                    + '<option value="나보타공무팀">나보타공무팀</option>'
                    + '<option value="__custom__">직접입력</option>';
                if (prevValue && Array.from(select.options).some(o => o.value === prevValue)) {
                    select.value = prevValue;
                }
            });
        }

        // ===== 관리자 - 파트 관리(추가/삭제/이름변경) =====
        function renderPartManagerUI() {
            const container = document.getElementById('partManagerList');
            if (!container) return;
            if (partManagerRows.length === 0) {
                partManagerRows = TEAM_REPORT_PARTS.map(p => ({ original: p, value: p }));
            }

            container.innerHTML = partManagerRows.map((row, i) => `
                <div class="team-report-row" style="margin-bottom:8px;">
                    <input type="text" class="category-input" value="${escapeHtml(row.value)}" maxlength="20"
                           placeholder="파트 이름" oninput="updatePartManagerRow(${i}, this.value)">
                    <button type="button" class="admin-action-btn danger" onclick="removePartManagerRow(${i})" title="이 파트 삭제">✕</button>
                </div>
            `).join('') || '<p style="color:#999; font-size:13px;">➕ 파트 추가 버튼을 눌러 파트를 만들어주세요.</p>';
        }

        function updatePartManagerRow(index, value) {
            if (partManagerRows[index]) partManagerRows[index].value = value;
        }

        function removePartManagerRow(index) {
            partManagerRows.splice(index, 1);
            renderPartManagerUI();
        }

        function addPartManagerRow() {
            partManagerRows.push({ original: null, value: '' });
            renderPartManagerUI();
        }

        function savePartManagerChanges() {
            const statusEl = document.getElementById('partManagerStatus');
            const trimmedRows = partManagerRows
                .map(r => ({ original: r.original, value: (r.value || '').trim() }))
                .filter(r => r.value);

            if (trimmedRows.length === 0) {
                statusEl.textContent = '⚠️ 파트를 한 개 이상 입력해주세요';
                statusEl.className = 'ai-status error';
                return;
            }
            const names = trimmedRows.map(r => r.value);
            if (new Set(names).size !== names.length) {
                statusEl.textContent = '⚠️ 파트 이름이 중복되었습니다';
                statusEl.className = 'ai-status error';
                return;
            }

            // 원래 있던 파트의 이름이 바뀐 것만 이동 대상으로 서버에 함께 보냄(새로 추가된 줄은 original이 없음)
            const renameMap = {};
            trimmedRows.forEach(r => {
                if (r.original && r.original !== r.value) renameMap[r.original] = r.value;
            });

            // 이름이 바뀐 게 아니라 완전히 없어지는 파트에 인원이 있으면, 저장 전에 미리 알려줌
            // (그 인원들은 소속은 그대로 두고 조직도에서만 "미배정"으로 보이게 됨)
            const removedParts = TEAM_REPORT_PARTS.filter(p => !names.includes(p) && !renameMap[p]);
            if (removedParts.length > 0) {
                const affectedCount = adminUserList.filter(u => removedParts.includes(getPartFromDepartment(u.department))).length;
                if (affectedCount > 0) {
                    confirmModal(
                        `삭제하는 파트(${removedParts.join(', ')})에 속한 인원이 ${affectedCount}명 있습니다. 저장하면 이 인원들은 조직도에서 "미배정 인원"으로 표시됩니다. 계속할까요?`,
                        () => savePartManagerChangesConfirmed(names, renameMap)
                    );
                    return;
                }
            }

            savePartManagerChangesConfirmed(names, renameMap);
        }

        async function savePartManagerChangesConfirmed(names, renameMap) {
            const statusEl = document.getElementById('partManagerStatus');
            statusEl.textContent = '☁️ 저장하는 중...';
            statusEl.className = 'ai-status';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'adminSetTeamReportParts',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash,
                        parts: names,
                        renameMap: renameMap
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    TEAM_REPORT_PARTS = Array.isArray(data.parts) ? data.parts : names;
                    partManagerRows = TEAM_REPORT_PARTS.map(p => ({ original: p, value: p }));
                    statusEl.textContent = '✅ 저장되었습니다';
                    statusEl.className = 'ai-status success';
                    renderAllDepartmentSelects();
                    renderPartManagerUI();
                    await loadAdminUserList(); // 소속이 바뀐 인원 반영 + 조직도 다시 그림
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '저장에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('파트 목록 저장 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            }
        }

        // adminUserList(이미 불러와 있는 계정 목록)를 팀장/각 파트의 파트장·팀원/미배정으로 나눠서
        // 카드+드롭존 형태의 조직도를 그림. 관리자 계정 자신은 이 조직도에 표시하지 않음
        function renderOrgChart() {
            const container = document.getElementById('orgChartContainer');
            if (!container) return;

            const activeUsers = adminUserList.filter(u => !u.isAdmin);
            const teamLeadUsers = activeUsers.filter(u => u.teamReportRole === 'teamLead');

            const buckets = {};
            TEAM_REPORT_PARTS.forEach(p => { buckets[p] = { partLead: [], members: [] }; });
            const unassigned = [];

            activeUsers.forEach(u => {
                if (u.teamReportRole === 'teamLead') return;
                const part = getPartFromDepartment(u.department);
                if (part && u.teamReportRole === 'partLead') {
                    buckets[part].partLead.push(u);
                } else if (part) {
                    buckets[part].members.push(u);
                } else {
                    unassigned.push(u);
                }
            });

            const cardHtml = u => `
                <div class="org-card${u.disabled ? ' org-card-disabled' : ''}"
                     onpointerdown="orgCardPointerDown(event, '${escapeForOnclickArg(u.employeeId)}')"
                     title="${escapeHtml(u.department || '소속 없음')}">
                    <div class="org-card-name">${escapeHtml(u.name || u.employeeId)}</div>
                    <div class="org-card-id">${escapeHtml(u.employeeId)}${u.disabled ? ' · 비활성' : ''}</div>
                </div>
            `;

            const slotHtml = (slotType, part, extraClass, label, users, emptyHint) => `
                <div class="org-slot ${extraClass}" data-slot-type="${slotType}" data-part="${escapeHtml(part || '')}">
                    <div class="org-slot-label">${label}</div>
                    <div class="org-slot-cards">${users.map(cardHtml).join('') || `<div class="org-slot-empty-hint">${emptyHint}</div>`}</div>
                </div>
            `;

            let html = '<div class="org-chart">';
            html += '<div class="org-chart-lead-row">';
            html += slotHtml('teamLead', '', 'org-slot-lead', '👑 팀장', teamLeadUsers, '여기로 드래그해서 팀장 지정');
            html += '</div>';

            html += '<div class="org-chart-parts-row">';
            TEAM_REPORT_PARTS.forEach(part => {
                html += `
                    <div class="org-part-column">
                        <div class="org-part-header">${escapeHtml(part)}</div>
                        ${slotHtml('partLead', part, 'org-slot-partlead', '🔹 파트장', buckets[part].partLead, '드래그해서 파트장 지정')}
                        ${slotHtml('member', part, 'org-slot-members', '팀원', buckets[part].members, '팀원을 여기로 드래그')}
                    </div>
                `;
            });
            html += '</div>';

            html += slotHtml('unassigned', '', 'org-slot-unassigned', '📥 미배정 인원 (다른 소속 포함)', unassigned, '향남공무팀 파트에 속하지 않은 인원이 없습니다');
            html += '</div>';

            container.innerHTML = html;
        }

        // 네이티브 HTML5 드래그앤드롭(draggable+dragstart/dragover/drop)은 트랙패드/브라우저별로
        // 잘 안 먹거나 버벅이는 경우가 많고 터치 기기에서는 아예 동작하지 않아서, 대신 Pointer
        // Events(마우스/터치 공용)로 직접 구현함 - 카드를 따라다니는 고스트를 그려서 옮기고,
        // 손을 뗀 지점 아래에 있는 슬롯을 elementFromPoint로 찾아 드롭 처리함
        let orgDragState = null; // { employeeId, originCard, pointerId, startX, startY, moved, ghostEl }
        const ORG_DRAG_MOVE_THRESHOLD = 6; // 이보다 적게 움직이면 그냥 클릭으로 취급(드래그로 안 침)

        function orgCardPointerDown(e, employeeId) {
            if (e.button !== undefined && e.button !== 0) return; // 마우스면 왼쪽 버튼만
            const card = e.currentTarget;
            orgDragState = {
                employeeId,
                originCard: card,
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                moved: false,
                ghostEl: null
            };
            document.addEventListener('pointermove', orgCardPointerMove);
            document.addEventListener('pointerup', orgCardPointerUp);
            document.addEventListener('pointercancel', orgCardPointerUp);
        }

        function orgCardPointerMove(e) {
            if (!orgDragState) return;
            const dx = e.clientX - orgDragState.startX;
            const dy = e.clientY - orgDragState.startY;

            if (!orgDragState.moved) {
                if (Math.hypot(dx, dy) < ORG_DRAG_MOVE_THRESHOLD) return;
                orgDragState.moved = true;
                orgDragState.originCard.classList.add('dragging');

                const rect = orgDragState.originCard.getBoundingClientRect();
                const ghost = orgDragState.originCard.cloneNode(true);
                ghost.className = 'org-card org-card-ghost';
                ghost.style.width = rect.width + 'px';
                document.body.appendChild(ghost);
                orgDragState.ghostEl = ghost;
            }

            e.preventDefault(); // 드래그 중 터치 스크롤/텍스트 선택 방지
            orgDragState.ghostEl.style.left = e.clientX + 'px';
            orgDragState.ghostEl.style.top = e.clientY + 'px';

            document.querySelectorAll('.org-slot.drag-over').forEach(el => el.classList.remove('drag-over'));
            orgDragState.ghostEl.style.display = 'none'; // elementFromPoint가 고스트 자신을 집지 않도록 잠깐 숨김
            const under = document.elementFromPoint(e.clientX, e.clientY);
            orgDragState.ghostEl.style.display = '';
            const slot = under && under.closest('.org-slot');
            if (slot) slot.classList.add('drag-over');
        }

        function orgCardPointerUp(e) {
            if (!orgDragState) return;
            document.removeEventListener('pointermove', orgCardPointerMove);
            document.removeEventListener('pointerup', orgCardPointerUp);
            document.removeEventListener('pointercancel', orgCardPointerUp);

            const state = orgDragState;
            orgDragState = null;

            state.originCard.classList.remove('dragging');
            if (state.ghostEl) state.ghostEl.remove();
            document.querySelectorAll('.org-slot.drag-over').forEach(el => el.classList.remove('drag-over'));

            if (!state.moved) return; // 움직임 없이 그냥 눌렀다 뗀 경우(클릭)는 무시

            const under = document.elementFromPoint(e.clientX, e.clientY);
            const slot = under && under.closest('.org-slot');
            if (!slot) return;

            handleOrgSlotDrop(state.employeeId, slot.dataset.slotType, slot.dataset.part || '');
        }

        // 카드를 놓은 위치(slotType/part)에 맞게 실제로 배정을 적용함
        function handleOrgSlotDrop(employeeId, slotType, part) {
            const user = adminUserList.find(u => u.employeeId === employeeId);
            if (!user) return;

            const currentPart = getPartFromDepartment(user.department);
            const currentRole = user.teamReportRole || '';
            const alreadyHere =
                (slotType === 'teamLead' && currentRole === 'teamLead') ||
                (slotType === 'partLead' && currentRole === 'partLead' && currentPart === part) ||
                (slotType === 'member' && currentRole === 'member' && currentPart === part) ||
                (slotType === 'unassigned' && !currentRole && !currentPart);
            if (alreadyHere) return;

            // 팀장/파트장 자리는 한 명이 기본이라, 이미 다른 사람이 있으면 교체할지 확인부터 받음
            if (slotType === 'teamLead' || slotType === 'partLead') {
                const occupant = adminUserList.find(u =>
                    u.employeeId !== employeeId &&
                    u.teamReportRole === slotType &&
                    (slotType === 'teamLead' || getPartFromDepartment(u.department) === part)
                );
                if (occupant) {
                    const label = slotType === 'teamLead' ? '팀장' : `${part} 파트장`;
                    confirmModal(
                        `${occupant.name || occupant.employeeId}님이 이미 ${label}(으)로 지정되어 있습니다. ${user.name || user.employeeId}님으로 교체할까요? ${occupant.name || occupant.employeeId}님은 팀원으로 내려갑니다.`,
                        () => applyOrgChartAssignment(employeeId, slotType, part, occupant.employeeId)
                    );
                    return;
                }
            }

            applyOrgChartAssignment(employeeId, slotType, part, null);
        }

        // 실제로 서버에 반영: 드래그한 사람을 그 자리로 옮기고(부서+역할), 밀려난 기존 파트장/팀장이
        // 있으면 그 사람은 자기 파트의 팀원으로 내림. 끝나면 목록을 다시 불러와 화면을 새로 그림
        async function applyOrgChartAssignment(employeeId, slotType, part, demoteEmployeeId) {
            const statusEl = document.getElementById('orgChartStatus');
            statusEl.textContent = '☁️ 반영하는 중...';
            statusEl.className = 'ai-status';

            try {
                await applyOrgChartPlacement(employeeId, slotType, part);

                if (demoteEmployeeId) {
                    // 항상 "팀원"으로 내림(확인창 문구와 일치시킴). 소속에 파트가 없으면(예: 파트 미지정
                    // 상태였던 팀장) 부서는 건드리지 않고 역할만 팀원으로 바꿈
                    const occupant = adminUserList.find(u => u.employeeId === demoteEmployeeId);
                    const occupantPart = occupant ? getPartFromDepartment(occupant.department) : null;
                    await applyOrgChartPlacement(demoteEmployeeId, 'member', occupantPart || '');
                }

                statusEl.textContent = '✅ 반영되었습니다';
                statusEl.className = 'ai-status success';
                await loadAdminUserList();
            } catch (err) {
                console.error('조직도 배정 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            }
        }

        // 한 사람을 특정 자리(slotType/part)로 옮김: 파트가 있는 자리(파트장/팀원)면 소속을 그 파트로
        // 맞추고(이미 그 파트면 건드리지 않음), 그 자리에 맞는 역할을 지정함(unassigned면 역할을 비움)
        async function applyOrgChartPlacement(employeeId, slotType, part) {
            const user = adminUserList.find(u => u.employeeId === employeeId);
            if (!user) return;

            if ((slotType === 'member' || slotType === 'partLead') && part) {
                const targetDepartment = TEAM_REPORT_PART_DEPT_PREFIX + part;
                if (user.department !== targetDepartment) {
                    await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'adminUpdateUserInfo',
                            employeeId: currentEmployeeId,
                            passwordHash: currentPasswordHash,
                            targetEmployeeId: employeeId,
                            name: user.name,
                            department: targetDepartment
                        })
                    });
                    user.department = targetDepartment;
                }
            }

            const newRole = slotType === 'unassigned' ? '' : slotType;
            if ((user.teamReportRole || '') !== newRole) {
                await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'adminSetTeamReportRole',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash,
                        targetEmployeeId: employeeId,
                        role: newRole
                    })
                });
                user.teamReportRole = newRole;
            }
        }

        function formatDisabledFeaturesSummary(disabledList) {
            const totalCount = Object.keys(FEATURE_LABELS).length;
            const disabledCount = Array.isArray(disabledList) ? disabledList.length : 0;
            if (disabledCount === 0) return '전체 사용';
            if (disabledCount >= totalCount) return '전체 제한';
            return '일부 제한';
        }

        function openAdminApiKeyViewModal(targetEmployeeId) {
            const target = adminUserList.find(u => u.employeeId === targetEmployeeId);
            if (!target || !target.aiApiKey) return;

            document.getElementById('adminApiKeyViewEmployeeId').value = targetEmployeeId;
            document.getElementById('adminApiKeyViewValue').value = target.aiApiKey;
            document.getElementById('adminApiKeyViewModal').classList.add('active');
        }

        function closeAdminApiKeyViewModal() {
            document.getElementById('adminApiKeyViewModal').classList.remove('active');
        }

        // 그룹별 체크박스 목록 HTML을 만듦. disabledList: 체크 해제(꺼짐) 상태로 표시할 키 배열
        function buildFeatureChecklistHtml(disabledList) {
            return FEATURE_GROUPS.map(group => `
                <div class="admin-feature-group">
                    <div class="admin-feature-group-title">${group.label}</div>
                    <div class="admin-feature-checklist">
                        ${Object.keys(group.features).map(key => `
                            <label class="admin-feature-checkbox-row">
                                <input type="checkbox" data-feature-key="${key}" ${disabledList.includes(key) ? '' : 'checked'}>
                                ${group.features[key]}
                            </label>
                        `).join('')}
                    </div>
                </div>
            `).join('');
        }

        // 체크 해제된(꺼진) 기능 키만 뽑아서 배열로 돌려줌
        function readDisabledFeaturesFromChecklist(containerId) {
            const checkboxes = document.querySelectorAll(`#${containerId} input[type="checkbox"]`);
            return Array.from(checkboxes).filter(cb => !cb.checked).map(cb => cb.dataset.featureKey);
        }

        function setAdminSort(key) {
            if (adminSortKey === key) {
                adminSortDir = adminSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                adminSortKey = key;
                adminSortDir = 'asc';
            }
            renderAdminUserTable();
        }

        // "2026. 9. 16. 오전 9:00:00" 같은 toLocaleString('ko-KR') 형식 문자열을 정렬 가능한 Date로
        // 바꿔줌 (Code.gs의 parseKoreanLocaleDate와 동일한 로직). new Date(문자열)로는 이 형식을
        // 못 알아듣고 Invalid Date가 되므로 직접 정규식으로 분해함
        function parseKoreanLocaleDateForSort(str) {
            if (!str) return null;
            const m = String(str).match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(오전|오후)?\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
            if (!m) return null;
            let hour = parseInt(m[5], 10);
            if (m[4] === '오후' && hour < 12) hour += 12;
            if (m[4] === '오전' && hour === 12) hour = 0;
            const date = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), hour, parseInt(m[6], 10), m[7] ? parseInt(m[7], 10) : 0);
            return isNaN(date.getTime()) ? null : date;
        }

        function renderAdminUserTable() {
            const tbody = document.getElementById('adminUserTableBody');
            if (!tbody) return;

            const keyword = (document.getElementById('adminSearchInput').value || '').trim().toLowerCase();

            let list = adminUserList.filter(u => {
                if (!keyword) return true;
                return (u.employeeId || '').toLowerCase().includes(keyword)
                    || (u.name || '').toLowerCase().includes(keyword)
                    || (u.department || '').toLowerCase().includes(keyword);
            });

            list = list.slice().sort((a, b) => {
                let result;
                switch (adminSortKey) {
                    case 'recordCount':
                        result = (a.recordCount || 0) - (b.recordCount || 0);
                        break;
                    case 'disabledFeatures':
                        result = (a.disabledFeatures ? a.disabledFeatures.length : 0) - (b.disabledFeatures ? b.disabledFeatures.length : 0);
                        break;
                    case 'name':
                    case 'department':
                        result = (a[adminSortKey] || '').localeCompare(b[adminSortKey] || '', 'ko');
                        break;
                    case 'lastSaved': {
                        // "2026. 9. 16. 오전 9:00:00"처럼 월/일이 0으로 채워지지 않는 형식이라,
                        // 문자열 그대로 비교하면 "9. 2."가 "9. 16."보다 사전순으로 뒤에 와서
                        // (문자 '2' > '1') 실제로는 더 오래된 날짜가 최신으로 정렬되는 문제가 있었음
                        const da = parseKoreanLocaleDateForSort(a.lastSaved);
                        const db = parseKoreanLocaleDateForSort(b.lastSaved);
                        result = (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
                        break;
                    }
                    default:
                        result = (a[adminSortKey] || '').localeCompare(b[adminSortKey] || '');
                }
                return adminSortDir === 'asc' ? result : -result;
            });

            // 관리자 계정은 정렬 기준과 무관하게 항상 맨 위에 고정 (Array.sort는 안정 정렬이라 나머지 순서는 그대로 유지됨)
            list.sort((a, b) => {
                if (a.isAdmin) return -1;
                if (b.isAdmin) return 1;
                return 0;
            });

            document.querySelectorAll('.admin-sort-indicator').forEach(el => {
                el.textContent = el.dataset.sortKey === adminSortKey ? (adminSortDir === 'asc' ? ' ▲' : ' ▼') : '';
            });

            if (list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color:#999; padding:20px;">계정이 없습니다</td></tr>';
                return;
            }

            tbody.innerHTML = list.map(u => `
                <tr>
                    <td>${u.disabled ? (u.disabledReason === 'inactive' ? '🚫(자동 비활성화) ' : '🚫 ') : ''}${u.locked ? '🔒 ' : ''}${escapeHtml(u.employeeId)}</td>
                    <td>${teamReportRoleIcon(u.teamReportRole)}${escapeHtml(u.name)}</td>
                    <td>${escapeHtml(u.department)}</td>
                    <td>${u.isAdmin ? '-' : `
                        <select class="category-input" style="padding:4px 6px; font-size:12px;" onchange="adminSetTeamReportRole('${u.employeeId}', this.value)">
                            <option value="" ${!u.teamReportRole ? 'selected' : ''}>미지정</option>
                            <option value="member" ${u.teamReportRole === 'member' ? 'selected' : ''}>팀원</option>
                            <option value="partLead" ${u.teamReportRole === 'partLead' ? 'selected' : ''}>파트장</option>
                            <option value="teamLead" ${u.teamReportRole === 'teamLead' ? 'selected' : ''}>팀장</option>
                        </select>`}</td>
                    <td>${u.recordCount}</td>
                    <td>${escapeHtml(formatDisabledFeaturesSummary(u.disabledFeatures))}</td>
                    <td>${u.aiApiKey ? `
                        <span>입력됨</span>
                        <button type="button" class="admin-action-btn" style="padding:3px 7px; font-size:11px;" onclick="openAdminApiKeyViewModal('${u.employeeId}')">확인</button>
                        ${u.duplicateApiKey ? '<div class="admin-apikey-dup">⚠️ 다른 계정과 중복</div>' : ''}
                    ` : '<span style="color:#999;">미입력</span>'}</td>
                    <td>${escapeHtml(u.lastSaved)}</td>
                    <td>${u.lastLoginAt ? escapeHtml(new Date(u.lastLoginAt).toLocaleString('ko-KR')) : '<span style="color:#999;">기록 없음</span>'}</td>
                    <td class="admin-actions-cell">${u.isAdmin ? '<span style="color:#999;">관리자 계정</span>' : `
                        <div class="admin-more-wrap">
                            <button type="button" class="admin-more-btn" title="관리 메뉴" onclick="toggleAdminMoreMenu(event, '${u.employeeId}')">⋮${u.passwordResetRequestedAt ? '🔴' : ''}</button>
                            <div class="admin-more-menu" id="adminMoreMenu-${u.employeeId}">
                                <button type="button" class="admin-menu-item" onclick="closeAllAdminMoreMenus(); openAdminEditUserModal('${u.employeeId}')">✏️ 정보수정</button>
                                <button type="button" class="admin-menu-item" onclick="closeAllAdminMoreMenus(); openAdminFeatureModal('${u.employeeId}')">🔧 기능 설정</button>
                                <button type="button" class="admin-menu-item" onclick="closeAllAdminMoreMenus(); adminResetPassword('${u.employeeId}')">🔑 비밀번호 초기화${u.passwordResetRequestedAt ? ' 🔴요청됨' : ''}</button>
                                <button type="button" class="admin-menu-item" onclick="closeAllAdminMoreMenus(); adminToggleUserDisabled('${u.employeeId}', ${u.disabled ? 'false' : 'true'})">${u.disabled ? '✅ 활성화' : '🚫 비활성화'}</button>
                                <button type="button" class="admin-menu-item danger" onclick="closeAllAdminMoreMenus(); adminDeleteUser('${u.employeeId}')">🗑️ 삭제</button>
                            </div>
                        </div>`}
                    </td>
                </tr>
            `).join('');
        }

        // 계정 관리 표의 "⋮" 관리 메뉴를 열고 닫음 (한 번에 하나만 열려있도록 나머지는 먼저 닫음)
        function toggleAdminMoreMenu(event, employeeId) {
            event.stopPropagation();
            const menu = document.getElementById('adminMoreMenu-' + employeeId);
            if (!menu) return;
            const willOpen = !menu.classList.contains('open');
            closeAllAdminMoreMenus();
            if (willOpen) menu.classList.add('open');
        }

        function closeAllAdminMoreMenus() {
            document.querySelectorAll('.admin-more-menu.open').forEach(m => m.classList.remove('open'));
        }

        // 관리자 화면 표에서 팀 보고 역할을 이름 앞에 짧게 표시하는 아이콘
        function teamReportRoleIcon(role) {
            if (role === 'teamLead') return '👑 ';
            if (role === 'partLead') return '🔹 ';
            return '';
        }

        function renderAdminDefaultFeatureChecklist() {
            const container = document.getElementById('adminDefaultFeatureChecklist');
            if (container) container.innerHTML = buildFeatureChecklistHtml(adminDefaultDisabledFeatures);
        }

        async function saveAdminDefaultFeatures() {
            const disabled = readDisabledFeaturesFromChecklist('adminDefaultFeatureChecklist');
            const statusEl = document.getElementById('adminDefaultFeatureStatus');
            statusEl.textContent = '☁️ 저장하는 중...';
            statusEl.className = 'ai-status';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'adminSetDefaultFeatures',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash,
                        disabledFeatures: disabled
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    adminDefaultDisabledFeatures = disabled;
                    statusEl.textContent = '✅ 기본값이 저장되었습니다. 앞으로 새로 가입하는 계정부터 적용됩니다.';
                    statusEl.className = 'ai-status success';
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '저장에 실패했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('관리자 기본값 저장 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            }
        }

        function adminDeleteUser(targetEmployeeId) {
            const target = adminUserList.find(u => u.employeeId === targetEmployeeId);
            if (target && target.isAdmin) {
                showAppToast('관리자 계정 자신은 삭제할 수 없습니다.');
                return;
            }
            // 승인 대기 목록의 "거절" 버튼도 이 함수를 그대로 재사용하는데, 그 계정은
            // adminUserList가 아니라 adminPendingList에 있으므로 거기서도 이름을 찾아봄
            const pendingTarget = adminPendingList.find(u => u.employeeId === targetEmployeeId);
            const targetName = target ? target.name : (pendingTarget ? pendingTarget.name : '');
            confirmModal(`${targetName || targetEmployeeId}(${targetEmployeeId}) 계정을 삭제할까요?\n휴지통으로 이동되며, 7일 안에는 복구할 수 있고 그 이후 자동으로 완전히 삭제됩니다.`, async () => {
                const statusEl = document.getElementById('adminStatus');
                statusEl.textContent = '☁️ 휴지통으로 옮기는 중...';
                statusEl.className = 'ai-status';

                try {
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'adminDeleteUser',
                            employeeId: currentEmployeeId,
                            passwordHash: currentPasswordHash,
                            targetEmployeeId: targetEmployeeId
                        })
                    });
                    const data = await res.json();

                    if (data.status === 'success') {
                        statusEl.textContent = '✅ 휴지통으로 이동되었습니다';
                        statusEl.className = 'ai-status success';
                        await loadAdminUserList();
                    } else {
                        statusEl.textContent = '⚠️ ' + (data.message || '삭제에 실패했습니다');
                        statusEl.className = 'ai-status error';
                    }
                } catch (err) {
                    console.error('관리자 계정 삭제 오류:', err);
                    statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                    statusEl.className = 'ai-status error';
                }
            });
        }

        function renderAdminTrashTable() {
            const tbody = document.getElementById('adminTrashTableBody');
            if (!tbody) return;

            if (adminTrashList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#999; padding:20px;">휴지통이 비어있습니다</td></tr>';
                return;
            }

            tbody.innerHTML = adminTrashList.map(u => `
                <tr>
                    <td>${escapeHtml(u.employeeId)}</td>
                    <td>${escapeHtml(u.name)}</td>
                    <td>${escapeHtml(u.department)}</td>
                    <td>${u.recordCount}</td>
                    <td>${escapeHtml(formatDisabledFeaturesSummary(u.disabledFeatures))}</td>
                    <td>${escapeHtml(formatDateTimeKo(u.deletedAt))}</td>
                    <td>${u.daysRemaining}일 후</td>
                    <td class="admin-actions-cell">
                        <button class="admin-action-btn" onclick="adminRestoreUser('${u.employeeId}')">♻️ 복구</button>
                        <button class="admin-action-btn danger" onclick="adminPurgeUser('${u.employeeId}')">💀 즉시 삭제</button>
                    </td>
                </tr>
            `).join('');
        }

        // 승인 대기: 회원가입만 하고 관리자 승인을 아직 못 받은 계정 목록. 승인 전까지는
        // getAccountAccessDenialMessage가 로그인/저장 등 모든 접근을 막아둠(Code.gs)
        function renderAdminPendingTable() {
            const tbody = document.getElementById('adminPendingTableBody');
            if (!tbody) return;

            if (adminPendingList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999; padding:20px;">승인 대기 중인 계정이 없습니다</td></tr>';
                return;
            }

            tbody.innerHTML = adminPendingList.map(u => `
                <tr>
                    <td>${escapeHtml(u.employeeId)}</td>
                    <td>${escapeHtml(u.name)}</td>
                    <td>${escapeHtml(u.department)}</td>
                    <td>${escapeHtml(formatDateTimeKo(u.requestedAt))}</td>
                    <td class="admin-actions-cell">
                        <button class="admin-action-btn" onclick="adminApproveUser('${u.employeeId}')">✅ 승인</button>
                        <button class="admin-action-btn danger" onclick="adminDeleteUser('${u.employeeId}')">🗑️ 거절</button>
                    </td>
                </tr>
            `).join('');
        }

        // 거절은 별도 액션 없이 adminDeleteUser(휴지통 이동)를 그대로 재사용함 - 실수로 거절해도
        // 7일 안에는 휴지통에서 복구할 수 있음
        function adminApproveUser(targetEmployeeId) {
            const target = adminPendingList.find(u => u.employeeId === targetEmployeeId);
            const targetName = target ? target.name : '';
            confirmModal(`${targetName || targetEmployeeId}(${targetEmployeeId}) 가입을 승인할까요?`, async () => {
                const statusEl = document.getElementById('adminStatus');
                statusEl.textContent = '☁️ 승인하는 중...';
                statusEl.className = 'ai-status';

                try {
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'adminApproveUser',
                            employeeId: currentEmployeeId,
                            passwordHash: currentPasswordHash,
                            targetEmployeeId: targetEmployeeId
                        })
                    });
                    const data = await res.json();

                    if (data.status === 'success') {
                        statusEl.textContent = '✅ 승인되었습니다';
                        statusEl.className = 'ai-status success';
                        await loadAdminUserList();
                    } else {
                        statusEl.textContent = '⚠️ ' + (data.message || '승인에 실패했습니다');
                        statusEl.className = 'ai-status error';
                    }
                } catch (err) {
                    console.error('관리자 가입 승인 오류:', err);
                    statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                    statusEl.className = 'ai-status error';
                }
            });
        }


        function adminRestoreUser(targetEmployeeId) {
            const target = adminTrashList.find(u => u.employeeId === targetEmployeeId);
            const targetName = target ? target.name : '';
            confirmModal(`${targetName || targetEmployeeId}(${targetEmployeeId}) 계정을 복구할까요?`, async () => {
                const statusEl = document.getElementById('adminStatus');
                statusEl.textContent = '☁️ 복구하는 중...';
                statusEl.className = 'ai-status';

                try {
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'adminRestoreUser',
                            employeeId: currentEmployeeId,
                            passwordHash: currentPasswordHash,
                            targetEmployeeId: targetEmployeeId
                        })
                    });
                    const data = await res.json();

                    if (data.status === 'success') {
                        statusEl.textContent = '✅ 복구되었습니다';
                        statusEl.className = 'ai-status success';
                        await loadAdminUserList();
                    } else {
                        statusEl.textContent = '⚠️ ' + (data.message || '복구에 실패했습니다');
                        statusEl.className = 'ai-status error';
                    }
                } catch (err) {
                    console.error('관리자 계정 복구 오류:', err);
                    statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                    statusEl.className = 'ai-status error';
                }
            });
        }

        function adminPurgeUser(targetEmployeeId) {
            const target = adminTrashList.find(u => u.employeeId === targetEmployeeId);
            const targetName = target ? target.name : '';
            confirmModal(`${targetName || targetEmployeeId}(${targetEmployeeId}) 계정을 지금 완전히 삭제할까요?\n\n보관기한(7일)을 기다리지 않고 즉시 삭제되며, 이 작업은 절대 되돌릴 수 없습니다.`, async () => {
                const statusEl = document.getElementById('adminStatus');
                statusEl.textContent = '☁️ 완전히 삭제하는 중...';
                statusEl.className = 'ai-status';

                try {
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'adminPurgeUser',
                            employeeId: currentEmployeeId,
                            passwordHash: currentPasswordHash,
                            targetEmployeeId: targetEmployeeId
                        })
                    });
                    const data = await res.json();

                    if (data.status === 'success') {
                        statusEl.textContent = '✅ 완전히 삭제되었습니다';
                        statusEl.className = 'ai-status success';
                        await loadAdminUserList();
                    } else {
                        statusEl.textContent = '⚠️ ' + (data.message || '삭제에 실패했습니다');
                        statusEl.className = 'ai-status error';
                    }
                } catch (err) {
                    console.error('관리자 계정 즉시 삭제 오류:', err);
                    statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                    statusEl.className = 'ai-status error';
                }
            });
        }

        function adminToggleUserDisabled(targetEmployeeId, nextDisabled) {
            const target = adminUserList.find(u => u.employeeId === targetEmployeeId);
            const targetName = target ? target.name : '';
            const confirmMsg = nextDisabled
                ? `${targetName || targetEmployeeId}(${targetEmployeeId}) 계정을 비활성화할까요? 데이터는 그대로 남지만 로그인이 막힙니다.`
                : `${targetName || targetEmployeeId}(${targetEmployeeId}) 계정을 다시 활성화할까요?`;
            confirmModal(confirmMsg, async () => {
                const statusEl = document.getElementById('adminStatus');
                statusEl.textContent = nextDisabled ? '☁️ 비활성화하는 중...' : '☁️ 활성화하는 중...';
                statusEl.className = 'ai-status';

                try {
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'adminSetUserDisabled',
                            employeeId: currentEmployeeId,
                            passwordHash: currentPasswordHash,
                            targetEmployeeId: targetEmployeeId,
                            disabled: nextDisabled
                        })
                    });
                    const data = await res.json();

                    if (data.status === 'success') {
                        statusEl.textContent = nextDisabled ? '✅ 비활성화되었습니다' : '✅ 활성화되었습니다';
                        statusEl.className = 'ai-status success';
                        await loadAdminUserList();
                    } else {
                        statusEl.textContent = '⚠️ ' + (data.message || '처리에 실패했습니다');
                        statusEl.className = 'ai-status error';
                    }
                } catch (err) {
                    console.error('관리자 계정 활성화/비활성화 오류:', err);
                    statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                    statusEl.className = 'ai-status error';
                }
            });
        }

        // [팀 보고] 계층 역할(미지정/팀원/파트장/팀장) 지정. 팀원은 파트장에게만, 파트장은 팀장에게만
        // 제출 대상을 고를 수 있게 되는 기준이 되는 값이라 확인창 없이 select 하나로 바로 적용함
        async function adminSetTeamReportRole(targetEmployeeId, role) {
            const statusEl = document.getElementById('adminStatus');
            statusEl.textContent = '☁️ 처리하는 중...';
            statusEl.className = 'ai-status';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'adminSetTeamReportRole',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash,
                        targetEmployeeId: targetEmployeeId,
                        role: role
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    statusEl.textContent = '✅ 역할이 변경되었습니다';
                    statusEl.className = 'ai-status success';
                    await loadAdminUserList();
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '처리에 실패했습니다');
                    statusEl.className = 'ai-status error';
                    await loadAdminUserList(); // select가 되돌아가도록 실패 시에도 다시 그림
                }
            } catch (err) {
                console.error('관리자 팀 보고 역할 지정 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
                await loadAdminUserList();
            }
        }

        function adminResetPassword(targetEmployeeId) {
            // 새 비밀번호를 따로 입력받지 않고, 그 사람의 사번 자체를 임시 비밀번호로 사용함
            // (초기화 후 본인이 로그인해서 비밀번호를 바꾸도록 안내하면 됨)
            confirmModal(`${targetEmployeeId} 계정의 비밀번호를 사번(${targetEmployeeId})으로 초기화할까요?`, async () => {
                const statusEl = document.getElementById('adminStatus');
                statusEl.textContent = '☁️ 비밀번호를 초기화하는 중...';
                statusEl.className = 'ai-status';

                try {
                    const newPasswordHash = await sha256Hex(targetEmployeeId + ':' + targetEmployeeId);
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'adminResetPassword',
                            employeeId: currentEmployeeId,
                            passwordHash: currentPasswordHash,
                            targetEmployeeId: targetEmployeeId,
                            newPasswordHash: newPasswordHash
                        })
                    });
                    const data = await res.json();

                    if (data.status === 'success') {
                        statusEl.textContent = `✅ ${targetEmployeeId} 계정의 비밀번호가 사번(${targetEmployeeId})으로 초기화되었습니다`;
                        statusEl.className = 'ai-status success';
                    } else {
                        statusEl.textContent = '⚠️ ' + (data.message || '비밀번호 초기화에 실패했습니다');
                        statusEl.className = 'ai-status error';
                    }
                } catch (err) {
                    console.error('관리자 비밀번호 초기화 오류:', err);
                    statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                    statusEl.className = 'ai-status error';
                }
            });
        }

        let adminEditOriginalEmployeeId = '';

        function openAdminEditUserModal(targetEmployeeId) {
            const target = adminUserList.find(u => u.employeeId === targetEmployeeId);
            if (!target) return;

            adminEditOriginalEmployeeId = targetEmployeeId;
            document.getElementById('adminEditEmployeeIdInput').value = targetEmployeeId;
            document.getElementById('adminEditNameInput').value = target.name || '';
            setDepartmentFieldValue('adminEdit', target.department || '');
            document.getElementById('adminEditErrorMsg').style.display = 'none';
            document.getElementById('adminEditUserModal').classList.add('active');
        }

        function closeAdminEditUserModal() {
            document.getElementById('adminEditUserModal').classList.remove('active');
        }

        // 사번 변경은 본인 스스로는 못 하고 관리자만 가능함. 사번이 바뀐 경우 먼저
        // adminChangeEmployeeId로 사번부터 바꾸고, 그 다음 새 사번을 대상으로 이름/소속을 저장함
        async function saveAdminUserEdit() {
            const idInput = document.getElementById('adminEditEmployeeIdInput');
            const nameInput = document.getElementById('adminEditNameInput');
            const errEl = document.getElementById('adminEditErrorMsg');
            const newEmployeeId = idInput.value.trim();
            const name = nameInput.value.trim();
            const department = getDepartmentValue('adminEdit');

            errEl.style.display = 'none';
            if (!EMPLOYEE_ID_PATTERN.test(newEmployeeId)) { errEl.textContent = EMPLOYEE_ID_INVALID_MSG; errEl.style.display = 'block'; return; }
            if (!name) { errEl.textContent = '이름을 입력해주세요'; errEl.style.display = 'block'; return; }
            if (!department) { errEl.textContent = '소속을 입력해주세요'; errEl.style.display = 'block'; return; }

            const statusEl = document.getElementById('adminStatus');
            statusEl.textContent = '☁️ 저장하는 중...';
            statusEl.className = 'ai-status';

            try {
                let workingEmployeeId = adminEditOriginalEmployeeId;

                if (newEmployeeId !== adminEditOriginalEmployeeId) {
                    const idRes = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'adminChangeEmployeeId',
                            employeeId: currentEmployeeId,
                            passwordHash: currentPasswordHash,
                            targetEmployeeId: adminEditOriginalEmployeeId,
                            newEmployeeId: newEmployeeId
                        })
                    });
                    const idData = await idRes.json();
                    if (idData.status !== 'success') {
                        errEl.textContent = idData.message || '사번 변경에 실패했습니다';
                        errEl.style.display = 'block';
                        return;
                    }
                    workingEmployeeId = newEmployeeId;
                    // 사번 변경은 이미 서버에 반영됐으니, 아래 이름/소속 저장이 실패해서 다시 시도하더라도
                    // 이 사번으로 또 바꾸려 하지 않도록(예전 사번은 이제 존재하지 않아 실패함) 갱신해둠
                    adminEditOriginalEmployeeId = newEmployeeId;
                }

                const infoRes = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'adminUpdateUserInfo',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash,
                        targetEmployeeId: workingEmployeeId,
                        name: name,
                        department: department
                    })
                });
                const infoData = await infoRes.json();

                if (infoData.status === 'success') {
                    closeAdminEditUserModal();
                    statusEl.textContent = `✅ ${workingEmployeeId} 계정 정보가 수정되었습니다`;
                    statusEl.className = 'ai-status success';
                    await loadAdminUserList();
                } else {
                    errEl.textContent = infoData.message || '저장에 실패했습니다';
                    errEl.style.display = 'block';
                }
            } catch (err) {
                console.error('관리자 계정정보 수정 오류:', err);
                errEl.textContent = '서버 연결에 실패했습니다.';
                errEl.style.display = 'block';
            }
        }

        let adminFeatureTargetEmployeeId = '';

        function openAdminFeatureModal(targetEmployeeId) {
            const target = adminUserList.find(u => u.employeeId === targetEmployeeId);
            if (!target) return;

            adminFeatureTargetEmployeeId = targetEmployeeId;
            const disabled = Array.isArray(target.disabledFeatures) ? target.disabledFeatures : [];

            const listEl = document.getElementById('adminFeatureChecklist');
            listEl.innerHTML = buildFeatureChecklistHtml(disabled);

            document.getElementById('adminFeatureErrorMsg').style.display = 'none';
            document.getElementById('adminFeatureModal').classList.add('active');
        }

        function closeAdminFeatureModal() {
            document.getElementById('adminFeatureModal').classList.remove('active');
        }

        async function saveAdminUserFeatures() {
            const errEl = document.getElementById('adminFeatureErrorMsg');
            const disabledFeaturesForTarget = readDisabledFeaturesFromChecklist('adminFeatureChecklist');

            errEl.style.display = 'none';

            const statusEl = document.getElementById('adminStatus');
            statusEl.textContent = '☁️ 저장하는 중...';
            statusEl.className = 'ai-status';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'adminUpdateUserFeatures',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash,
                        targetEmployeeId: adminFeatureTargetEmployeeId,
                        disabledFeatures: disabledFeaturesForTarget
                    })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    closeAdminFeatureModal();
                    statusEl.textContent = `✅ ${adminFeatureTargetEmployeeId} 계정의 기능 설정이 저장되었습니다`;
                    statusEl.className = 'ai-status success';
                    await loadAdminUserList();
                } else {
                    errEl.textContent = data.message || '저장에 실패했습니다';
                    errEl.style.display = 'block';
                }
            } catch (err) {
                console.error('관리자 기능 설정 오류:', err);
                errEl.textContent = '서버 연결에 실패했습니다.';
                errEl.style.display = 'block';
            }
        }
