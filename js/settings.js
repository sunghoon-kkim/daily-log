        // ===== 환경설정 (개인 AI API 키 / 탭 활성화·비활성화) =====
        function renderSettingsTab() {
            const keyInput = document.getElementById('settingsApiKeyInput');
            if (keyInput && document.activeElement !== keyInput) {
                keyInput.value = personalAiApiKey;
            }

            const listEl = document.getElementById('settingsTabToggleList');
            if (listEl) {
                const adminHiddenTabIds = getAdminFullyRestrictedTabIds();
                // 위쪽 탭 목록과 같은 순서로 보여줘서, 드래그로 탭 순서를 바꾸면 여기도 그대로 따라오게 함.
                // 관리자가 전부 제한한 탭은 어차피 못 쓰니 이 목록에도 아예 안 보여줌
                listEl.innerHTML = tabOrder
                    .filter(id => id !== 'settings' && !adminHiddenTabIds.includes(id))
                    .map(id => {
                        const enabled = !disabledTabIds.includes(id);
                        return `<button type="button" class="category-select-btn${enabled ? ' selected' : ''}" onclick="toggleTabDisabled('${id}')">${enabled ? '✅' : '⬜'} ${TAB_LABELS[id]}</button>`;
                    }).join('');
            }
        }

        function toggleTabDisabled(tabId) {
            if (!checkEditPermission()) return;
            if (tabId === 'settings' || !TAB_LABELS[tabId]) return;

            if (disabledTabIds.includes(tabId)) {
                disabledTabIds = disabledTabIds.filter(id => id !== tabId);
            } else {
                disabledTabIds.push(tabId);
            }

            saveDisabledTabIdsToStorage();
            renderTabs();
            renderSettingsTab();
        }

        function saveSettingsApiKey() {
            if (!checkEditPermission()) return;
            const input = document.getElementById('settingsApiKeyInput');
            const statusEl = document.getElementById('settingsApiKeyStatus');
            personalAiApiKey = input.value.trim();
            savePersonalAiApiKeyToStorage();
            applyPersonalApiKeyGate();

            statusEl.textContent = personalAiApiKey
                ? '✅ 개인 API 키가 저장되었습니다. 지금부터 AI 도우미 기능을 사용할 수 있습니다.'
                : '☁️ 빈 값으로 저장했습니다. AI 도우미 기능은 키를 입력해야 사용할 수 있습니다.';
            statusEl.className = 'ai-status success';
        }

        function clearSettingsApiKey() {
            if (!checkEditPermission()) return;
            personalAiApiKey = '';
            const input = document.getElementById('settingsApiKeyInput');
            if (input) input.value = '';
            savePersonalAiApiKeyToStorage();
            applyPersonalApiKeyGate();

            const statusEl = document.getElementById('settingsApiKeyStatus');
            statusEl.textContent = '🗑️ 개인 API 키가 삭제되었습니다. AI 도우미 기능은 키를 다시 입력해야 사용할 수 있습니다.';
            statusEl.className = 'ai-status success';
        }

        // ===== 자동 백업 조회/복구 =====
        let myBackupList = [];

        async function loadMyBackups() {
            const statusEl = document.getElementById('backupListStatus');
            const table = document.getElementById('backupListTable');
            statusEl.textContent = '☁️ 불러오는 중...';
            statusEl.className = 'ai-status';
            table.style.display = 'none';

            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'getMyBackups',
                        employeeId: currentEmployeeId,
                        passwordHash: currentPasswordHash
                    })
                });
                const data = await res.json();

                if (data.status !== 'success') {
                    statusEl.textContent = '⚠️ ' + (data.message || '불러오기에 실패했습니다');
                    statusEl.className = 'ai-status error';
                    return;
                }

                myBackupList = data.backups || [];
                if (myBackupList.length === 0) {
                    statusEl.textContent = '표시할 백업이 없습니다 (다른 사람들의 저장으로 밀려났을 수 있습니다)';
                    statusEl.className = 'ai-status';
                    return;
                }

                statusEl.textContent = '';
                statusEl.className = 'ai-status';
                document.getElementById('backupListTableBody').innerHTML = myBackupList.map((b, idx) => `
                    <tr>
                        <td>${escapeHtml(b.savedAt)}</td>
                        <td>${b.dateCount}일치</td>
                        <td class="admin-actions-cell"><button class="admin-action-btn danger" onclick="restoreMyBackup(${idx})">♻️ 이 시점으로 되돌리기</button></td>
                    </tr>
                `).join('');
                table.style.display = '';
            } catch (err) {
                console.error('백업 목록 조회 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            }
        }

        function restoreMyBackup(idx) {
            if (!checkEditPermission()) return;
            const backup = myBackupList[idx];
            if (!backup) return;

            confirmModal(`${backup.savedAt} 시점(${backup.dateCount}일치)으로 되돌릴까요?\n지금 상태도 백업으로 남으니, 되돌린 뒤에도 다시 취소할 수 있습니다.`, async () => {
                const statusEl = document.getElementById('backupListStatus');
                statusEl.textContent = '☁️ 되돌리는 중...';
                statusEl.className = 'ai-status';

                try {
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'restoreFromBackup',
                            employeeId: currentEmployeeId,
                            passwordHash: currentPasswordHash,
                            rowIndex: backup.rowIndex
                        })
                    });
                    const data = await res.json();

                    if (data.status === 'success') {
                        statusEl.textContent = `✅ ${data.restoredDateCount || 0}일치를 되돌렸습니다. 화면을 새로고침합니다...`;
                        statusEl.className = 'ai-status success';
                        await loadAllFromServer(); // 되돌린 내용을 화면에 반영
                        loadMyBackups(); // 방금 만들어진 "되돌리기 전" 백업이 목록에 보이도록 새로고침
                    } else {
                        statusEl.textContent = '⚠️ ' + (data.message || '복구에 실패했습니다');
                        statusEl.className = 'ai-status error';
                    }
                } catch (err) {
                    console.error('백업 복구 오류:', err);
                    statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                    statusEl.className = 'ai-status error';
                }
            });
        }

        // ===== 다크모드 =====
        function toggleTheme() {
            if (!checkEditPermission()) return;
            const isDark = document.documentElement.classList.toggle('dark-mode');
            try {
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
            } catch (e) { /* 저장 실패해도 화면 전환 자체는 계속 동작하게 무시 */ }
            applyThemeButtonLabel();
        }
        
        function applyThemeButtonLabel() {
            const btn = document.getElementById('themeToggleBtn');
            if (!btn) return;
            const isDark = document.documentElement.classList.contains('dark-mode');
            btn.textContent = isDark ? '☀️ 라이트모드' : '🌙 다크모드';
        }
        
