        // ===== 환경설정 (개인 AI API 키 / 탭 활성화·비활성화) =====
        function renderSettingsTab() {
            const keyInput = document.getElementById('settingsApiKeyInput');
            if (keyInput && document.activeElement !== keyInput) {
                keyInput.value = personalAiApiKey;
            }

            document.querySelectorAll('input[name="layoutWidth"]').forEach(input => {
                input.checked = input.value === layoutWidth;
            });

            const listEl = document.getElementById('settingsTabToggleList');
            if (listEl) {
                const adminHiddenTabIds = getAdminFullyRestrictedTabIds();
                // 위쪽 탭 목록과 같은 순서로 보여줘서, 드래그로 탭 순서를 바꾸면 여기도 그대로 따라오게 함.
                // 관리자가 전부 제한한 탭은 어차피 못 쓰니 이 목록에도 아예 안 보여줌
                listEl.innerHTML = tabOrder
                    .filter(id => id !== 'settings' && !adminHiddenTabIds.includes(id))
                    .map(renderSettingsTabToggleGroup).join('');
            }
        }

        // 기능 라벨 앞의 컬러 이모지를 떼고 글자만 씀 (FEATURE_GROUPS 라벨은 관리자 화면과 같이 써서 이모지가 붙어 있음)
        function stripFeatureLabelEmoji(label) {
            return String(label || '').replace(/^[^\p{L}\p{N}(]+/u, '').trim();
        }

        // 관리자 화면 라벨이 탭 이름과 똑같아 헷갈리는 항목은 여기서만 이름을 바꿔 보여줌
        const SETTINGS_FEATURE_LABEL_OVERRIDES = { activityRecord: '달력·활동기록 본문' };

        // 이 탭에서 본인이 따로 켜고 끌 수 있는 세부 항목 키. 관리자·코드가 막은 항목과,
        // 환경설정 화면 안에만 있는 항목(과거 일지 가져오기 등)은 제외
        const SETTINGS_NON_DOM_FEATURES = ['quickInsert', 'stickyMemo'];

        function getUserToggleableFeatureKeys(tabId) {
            const group = FEATURE_GROUPS.find(g => g.key === tabId);
            if (!group) return [];
            return Object.keys(group.features).filter(key => {
                if (isFeatureAdminDisabled(key)) return false;
                if (SETTINGS_NON_DOM_FEATURES.includes(key)) return true; // 화면 요소 없이 동작하는 기능('/' 빠른 입력 등)
                const els = document.querySelectorAll(`[data-feature="${key}"]`);
                return Array.from(els).some(el => !el.closest('#settings'));
            });
        }

        function renderSettingsTabToggleGroup(tabId) {
            const tabEnabled = !disabledTabIds.includes(tabId);
            const group = FEATURE_GROUPS.find(g => g.key === tabId);
            const featureKeys = getUserToggleableFeatureKeys(tabId);
            // 항목이 하나뿐인 탭은 탭 체크박스와 같은 뜻이라 따로 보여주지 않음
            const featureHtml = featureKeys.length > 1 ? `
                <div class="settings-feature-toggles" role="group" aria-label="${escapeHtml(TAB_LABELS[tabId])} 안에서 보여줄 항목">
                    ${featureKeys.map(key => `
                        <label class="settings-feature-toggle">
                            <input type="checkbox" ${hiddenFeatures.includes(key) ? '' : 'checked'} ${tabEnabled ? '' : 'disabled'} onchange="toggleFeatureHidden('${key}')">
                            <span>${escapeHtml(SETTINGS_FEATURE_LABEL_OVERRIDES[key] || stripFeatureLabelEmoji(group.features[key]))}</span>
                        </label>`).join('')}
                </div>` : '';
            return `
                <div class="settings-tab-group${tabEnabled ? '' : ' is-off'}">
                    <label class="settings-tab-toggle">
                        <input type="checkbox" ${tabEnabled ? 'checked' : ''} onchange="toggleTabDisabled('${tabId}')">
                        ${typeof icon === 'function' ? icon(TAB_ICONS[tabId]) : ''}<span>${escapeHtml(TAB_LABELS[tabId])}</span>
                    </label>${featureHtml}
                </div>`;
        }

        // 환경설정 > 화면 너비: 고르는 즉시 화면 폭을 바꾸고 이 계정 설정으로 저장(서버 동기화)
        function setLayoutWidth(value) {
            if (!checkEditPermission()) { renderSettingsTab(); return; }
            layoutWidth = value === 'wide' ? 'wide' : 'standard';
            safeSetItem('layoutWidth', layoutWidth);
            queueSync();
            applyLayoutWidth();
            renderSettingsTab();
        }

        function toggleTabDisabled(tabId) {
            if (!checkEditPermission()) { renderSettingsTab(); return; }
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

        // 탭 안의 세부 항목 하나를 본인 화면에서 숨기거나 다시 보이게 함 (관리자 제한과는 별개)
        function toggleFeatureHidden(key) {
            if (!checkEditPermission()) { renderSettingsTab(); return; }
            if (!FEATURE_LABELS[key]) return;

            if (hiddenFeatures.includes(key)) {
                hiddenFeatures = hiddenFeatures.filter(k => k !== key);
            } else {
                hiddenFeatures.push(key);
            }

            saveHiddenFeaturesToStorage();
            applyFeatureRestrictions();
            renderTabs();
            renderSettingsTab();
            // 오늘 요약 카드·작성 누락 표시·교대 표시처럼 그리는 시점에 항목 설정을 보는 화면은 다시 그림
            if (typeof renderCalendar === 'function') renderCalendar();
        }

        function saveSettingsApiKey() {
            if (!checkEditPermission()) return;
            const input = document.getElementById('settingsApiKeyInput');
            const statusEl = document.getElementById('settingsApiKeyStatus');
            personalAiApiKey = input.value.trim();
            savePersonalAiApiKeyToStorage();
            applyPersonalApiKeyGate();

            statusEl.textContent = personalAiApiKey
                ? '개인 API 키가 저장되었습니다. 지금부터 AI 도우미 기능을 사용할 수 있습니다.'
                : '빈 값으로 저장했습니다. AI 도우미 기능은 키를 입력해야 사용할 수 있습니다.';
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
            statusEl.textContent = '개인 API 키가 삭제되었습니다. AI 도우미 기능은 키를 다시 입력해야 사용할 수 있습니다.';
            statusEl.className = 'ai-status success';
        }

        // ===== 자동 백업 조회/복구 =====
        let myBackupList = [];

        async function loadMyBackups() {
            const statusEl = document.getElementById('backupListStatus');
            const table = document.getElementById('backupListTable');
            statusEl.textContent = '불러오는 중...';
            statusEl.className = 'ai-status';
            table.style.display = 'none';

            const hideListSkeleton = showSkeletonAfter(statusEl, 3);
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
                    statusEl.textContent = '' + (data.message || '불러오기에 실패했습니다');
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
                        <td class="admin-actions-cell"><button class="admin-action-btn danger" onclick="restoreMyBackup(${idx})">이 시점으로 되돌리기</button></td>
                    </tr>
                `).join('');
                table.style.display = '';
            } catch (err) {
                console.error('백업 목록 조회 오류:', err);
                statusEl.textContent = '서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            } finally {
                hideListSkeleton();
            }
        }

        function restoreMyBackup(idx) {
            if (!checkEditPermission()) return;
            const backup = myBackupList[idx];
            if (!backup) return;

            confirmModal(`${backup.savedAt} 시점(${backup.dateCount}일치)으로 되돌릴까요?\n지금 상태도 백업으로 남으니, 되돌린 뒤에도 다시 취소할 수 있습니다.`, async () => {
                const statusEl = document.getElementById('backupListStatus');
                statusEl.textContent = '되돌리는 중...';
                statusEl.className = 'ai-status';

                try {
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'restoreFromBackup',
                            employeeId: currentEmployeeId,
                            passwordHash: currentPasswordHash,
                            rowIndex: backup.rowIndex,
                            savedAt: backup.savedAt // 목록을 받은 뒤 행이 밀렸으면 서버가 거부함
                        })
                    });
                    const data = await res.json();

                    if (data.status === 'success') {
                        statusEl.textContent = `${data.restoredDateCount || 0}일치를 되돌렸습니다. 화면을 새로고침합니다...`;
                        statusEl.className = 'ai-status success';
                        await loadAllFromServer(); // 되돌린 내용을 화면에 반영
                        clearPendingOutbox(); // 되돌리기 전에 못 올린 변경분이 다음 로그인 때 되돌린 내용 위에 다시 얹히지 않게 함
                        loadMyBackups(); // 방금 만들어진 "되돌리기 전" 백업이 목록에 보이도록 새로고침
                    } else {
                        statusEl.textContent = '' + (data.message || '복구에 실패했습니다');
                        statusEl.className = 'ai-status error';
                    }
                } catch (err) {
                    console.error('백업 복구 오류:', err);
                    statusEl.textContent = '서버 연결에 실패했습니다.';
                    statusEl.className = 'ai-status error';
                }
            });
        }

        // ===== 다크모드 =====
        function toggleTheme() {
            if (!checkEditPermission()) return;
            const isDark = document.documentElement.classList.toggle('dark-mode');
            try {
                safeSetItem('themePreference', isDark ? 'dark' : 'light');
            } catch (e) { /* 저장 실패해도 화면 전환 자체는 계속 동작하게 무시 */ }
            applyThemeButtonLabel();
        }
        
        function applyThemeButtonLabel() {
            const btn = document.getElementById('themeToggleBtn');
            if (!btn) return;
            const isDark = document.documentElement.classList.contains('dark-mode');
            btn.innerHTML = (typeof icon === 'function' ? icon(isDark ? 'sun' : 'moon') : '') + (isDark ? '라이트모드' : '다크모드');
        }
        
