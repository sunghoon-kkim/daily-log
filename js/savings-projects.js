        // ===== 개선/절감 과제 트래커 =====
        // 개선/절감 과제 목록의 상태/카테고리 필터 버튼 클릭 시 호출
        function setSavingsStatusFilter(status) {
            savingsStatusFilter = status;
            document.querySelectorAll('#savingsStatusFilterRow .quick-preset-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.filter === status);
            });
            renderSavingsProjects();
        }

        function setSavingsCategoryFilter(category) {
            savingsCategoryFilter = category;
            document.querySelectorAll('#savingsCategoryFilterRow .quick-preset-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.filter === category);
            });
            renderSavingsProjects();
        }

        function renderSavingsProjects() {
            const container = document.getElementById('projectsList');
            if (!container) return;

            if (savingsProjects.length === 0) {
                container.innerHTML = '<div class="no-projects">아직 등록된 과제가 없습니다. "새 과제 추가"로 시작해보세요.</div>';
                return;
            }

            const filtered = savingsProjects.filter(p => {
                if (savingsStatusFilter !== '전체' && p.status !== savingsStatusFilter) return false;
                if (savingsCategoryFilter !== '전체' && p.category !== savingsCategoryFilter) return false;
                return true;
            });

            if (filtered.length === 0) {
                container.innerHTML = '<div class="no-projects">조건에 맞는 과제가 없습니다.</div>';
                return;
            }

            // 최근 수정된 순으로 표시
            const sorted = filtered.slice().sort((a, b) => (b.updatedMonth || '').localeCompare(a.updatedMonth || ''));

            container.innerHTML = sorted.map(p => `
                <div class="project-card" onclick="openProjectModal('${p.id}')">
                    <div class="project-card-top">
                        <div class="project-card-title">${escapeHtml(p.title)}</div>
                        <span class="project-badge status-${p.status}">${p.status}</span>
                    </div>
                    <div class="project-card-category">${p.category}</div>
                    ${p.target ? `<div class="project-card-row"><b>목표:</b> ${escapeHtml(p.target)}</div>` : ''}
                    ${p.actual ? `<div class="project-card-row"><b>실제:</b> ${escapeHtml(p.actual)}</div>` : ''}
                    ${(p.monthlyLogs && p.monthlyLogs.length) ? `<div class="project-card-row">📌 월별 기록 ${p.monthlyLogs.length}건</div>` : ''}
                    <div class="project-card-date">등록: ${p.createdMonth} · 최근 수정: ${p.updatedMonth}</div>
                </div>
            `).join('');
        }
        
        function openProjectModal(projectId) {
            if (!checkEditPermission()) return;
            editingProjectId = projectId;
            const modal = document.getElementById('projectModal');
            const title = document.getElementById('projectModalTitle');
            const deleteBtn = document.getElementById('deleteProjectBtn');
            
            const monthlySection = document.getElementById('projectMonthlySection');
            document.getElementById('projectMonthlyNoteInput').value = '';

            if (projectId) {
                const p = savingsProjects.find(x => x.id === projectId);
                if (!p) return;
                title.textContent = '💡 개선/절감 과제 수정';
                document.getElementById('projectTitleInput').value = p.title;
                document.getElementById('projectCategoryInput').value = p.category;
                document.getElementById('projectStatusInput').value = p.status;
                document.getElementById('projectTargetInput').value = p.target || '';
                document.getElementById('projectActualInput').value = p.actual || '';
                deleteBtn.style.display = 'inline-block';
                monthlySection.style.display = '';
                renderProjectMonthlyLogList(p);
            } else {
                title.textContent = '💡 개선/절감 과제 추가';
                document.getElementById('projectTitleInput').value = '';
                document.getElementById('projectCategoryInput').value = '에너지절감';
                document.getElementById('projectStatusInput').value = '계획중';
                document.getElementById('projectTargetInput').value = '';
                document.getElementById('projectActualInput').value = '';
                deleteBtn.style.display = 'none';
                // 월별 기록은 특정 과제에 매달아야 하는데, 새 과제는 아직 저장 전이라 매달 곳이
                // 없으므로 일단 저장한 뒤 다시 열어서 기록하도록 안내하고 이 구간은 숨김
                monthlySection.style.display = 'none';
            }

            modal.classList.add('active');
        }

        // 과제 카드/모달에서 "월별 진행 기록"을 최신순으로 그려줌
        function renderProjectMonthlyLogList(project) {
            const listEl = document.getElementById('projectMonthlyLogList');
            if (!listEl) return;
            const logs = Array.isArray(project.monthlyLogs) ? project.monthlyLogs : [];
            if (logs.length === 0) {
                listEl.innerHTML = '<p style="color:#999; font-size:13px; margin:0;">아직 기록된 월별 진행 내용이 없습니다.</p>';
                return;
            }
            const sorted = logs.slice().sort((a, b) => (b.loggedAt || '').localeCompare(a.loggedAt || ''));
            listEl.innerHTML = sorted.map(log => `
                <div style="padding:8px 0; border-bottom:1px solid #eee; font-size:13px;">
                    <div style="color:#667eea; font-weight:600; font-size:12px; margin-bottom:2px;">${escapeHtml(log.month)} · ${escapeHtml(formatTeamReportSubmittedAt(log.loggedAt))}</div>
                    <div>${escapeHtml(log.note)}</div>
                </div>
            `).join('');
        }

        // "이번 달 기록으로 추가" 버튼: 기존 target/actual을 덮어쓰는 대신, 이번 달 진행 메모를
        // 별도의 이력(monthlyLogs)에 계속 쌓아서 나중에 월별 피드백/종합평가 작성 시 근거로 쓸 수 있게 함
        function addProjectMonthlyLog() {
            if (!checkEditPermission()) return;
            if (!editingProjectId) return;
            const p = savingsProjects.find(x => x.id === editingProjectId);
            if (!p) return;

            const note = document.getElementById('projectMonthlyNoteInput').value.trim();
            if (!note) {
                showAppToast('이번 달 진행 메모를 입력해주세요');
                return;
            }

            if (!Array.isArray(p.monthlyLogs)) p.monthlyLogs = [];
            p.monthlyLogs.push({
                month: formatDate(new Date()).slice(0, 7),
                note,
                loggedAt: new Date().toISOString()
            });
            p.updatedMonth = formatDate(new Date()).slice(0, 7);

            safeSetItem('savingsProjects', JSON.stringify(savingsProjects));
            queueSync();
            document.getElementById('projectMonthlyNoteInput').value = '';
            renderProjectMonthlyLogList(p);
            renderSavingsProjects();
        }
        
        function closeProjectModal() {
            document.getElementById('projectModal').classList.remove('active');
            editingProjectId = null;
        }
        
        function saveProject() {
            if (!checkEditPermission()) return;
            const title = document.getElementById('projectTitleInput').value.trim();
            if (!title) {
                showAppToast('과제명을 입력해주세요');
                return;
            }
            
            const category = document.getElementById('projectCategoryInput').value;
            const status = document.getElementById('projectStatusInput').value;
            const target = document.getElementById('projectTargetInput').value.trim();
            const actual = document.getElementById('projectActualInput').value.trim();
            const thisMonth = formatDate(new Date()).slice(0, 7); // YYYY-MM
            
            if (editingProjectId) {
                const p = savingsProjects.find(x => x.id === editingProjectId);
                if (p) {
                    p.title = title;
                    p.category = category;
                    p.status = status;
                    p.target = target;
                    p.actual = actual;
                    p.updatedMonth = thisMonth;
                }
            } else {
                savingsProjects.push({
                    id: 'proj_' + Date.now(),
                    title, category, status, target, actual,
                    createdMonth: thisMonth,
                    updatedMonth: thisMonth
                });
            }
            
            safeSetItem('savingsProjects', JSON.stringify(savingsProjects));
            queueSync();
            closeProjectModal();
            renderSavingsProjects();
        }
        
        function deleteProject() {
            if (!checkEditPermission()) return;
            if (!editingProjectId) return;
            confirmModal('이 과제를 삭제하시겠습니까?', () => {
                savingsProjects = savingsProjects.filter(p => p.id !== editingProjectId);
                safeSetItem('savingsProjects', JSON.stringify(savingsProjects));
                queueSync();
                closeProjectModal();
                renderSavingsProjects();
            });
        }
        
        // 등록된 절감 과제들을 AI 프롬프트에 넣기 좋은 텍스트로 요약 (월별 피드백/목표수립 KPI에서 사용)
        function buildSavingsProjectsSummaryText() {
            if (savingsProjects.length === 0) return '';
            return savingsProjects.map(p => {
                const parts = [`- [${p.category}/${p.status}] ${p.title}`];
                if (p.target) parts.push(`목표: ${p.target}`);
                if (p.actual) parts.push(`실제: ${p.actual}`);
                parts.push(`(등록 ${p.createdMonth}, 최근 수정 ${p.updatedMonth})`);
                return parts.join(' / ');
            }).join('\n');
        }

