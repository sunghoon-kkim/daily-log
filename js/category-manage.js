        // ===== 카테고리 관리 =====
        function addCategory() {
            if (!checkEditPermission()) return;
            const input = document.getElementById('newCategoryInput');
            const name = input.value.trim();
            
            if (!name) { showAppToast('카테고리 이름을 입력해주세요'); return; }
            if (categories.includes(name)) { showAppToast('이미 존재하는 카테고리입니다'); return; }
            if (archivedCategories.includes(name)) { showAppToast('보관된 카테고리에 같은 이름이 있습니다. 아래 "보관된 카테고리"에서 복원해주세요'); return; }
            
            categories.push(name);
            categoryColors[name] = COLOR_PALETTE[categories.length % COLOR_PALETTE.length];
            saveCategoriesToStorage();
            saveCategoryColorsToStorage();
            input.value = '';
            renderCategories();
            renderCategorySelector();
            if (selectedDate) renderRecordForm();
        }
        
        function deleteCategory(name) {
            if (!checkEditPermission()) return;

            // 카테고리 하나만 지우는 것처럼 보이지만 실제로는 이 카테고리로 기록된 모든 날짜의
            // 내용이 함께 영구 삭제되므로, 확인창에 그 파급력을 숨기지 않고 정직하게 알려줌
            const affectedDateCount = Object.keys(records).filter(date => {
                const val = records[date] && records[date][name];
                return val && val.toString().trim() !== '';
            }).length;
            const message = affectedDateCount > 0
                ? `'${name}' 카테고리를 삭제하시겠습니까?\n\n이 카테고리로 기록된 ${affectedDateCount}일치 내용이 함께 영구 삭제됩니다.${archivedCategories.includes(name) ? '' : '\n(기록을 남겨두려면 삭제 대신 📦 보관을 사용하세요)'}`
                : `'${name}' 카테고리를 삭제하시겠습니까?`;

            confirmModal(message, () => {
                categories = categories.filter(c => c !== name);
                const wasArchived = archivedCategories.includes(name);
                archivedCategories = archivedCategories.filter(c => c !== name);
                delete categoryColors[name];
                delete categoryDefaultCollapsed[name];
                selectedCategoriesForQuery.delete(name);
                for (const key in categoryCollapseOverride) {
                    if (key.endsWith('::' + name)) delete categoryCollapseOverride[key];
                }
                for (const date in records) delete records[date][name];
                delete recordSnippets[name];
                for (const dow in weekdayTemplates) {
                    if (weekdayTemplates[dow]) delete weekdayTemplates[dow][name];
                }
                for (const key of Object.keys(recordRevisions)) {
                    if (key.endsWith('|' + name)) delete recordRevisions[key];
                }
                safeSetItem('recordRevisions', JSON.stringify(recordRevisions));
                saveRecordSnippetsToStorage();
                for (const date in categoryImages) delete categoryImages[date][name];
                for (const date in hiddenCategoriesByDate) {
                    hiddenCategoriesByDate[date] = hiddenCategoriesByDate[date].filter(c => c !== name);
                }
                for (const date in dateCategoryOrder) {
                    dateCategoryOrder[date] = dateCategoryOrder[date].filter(c => c !== name);
                }

                saveCategoriesToStorage();
                if (wasArchived) saveArchivedCategoriesToStorage();
                saveCategoryColorsToStorage();
                saveCategoryDefaultCollapsedToStorage();
                saveRecordsToStorage();
                saveCategoryImagesToStorage();
                saveHiddenCategoriesToStorage();
                saveDateCategoryOrderToStorage();
                renderCategories();
                renderCategorySelector();
                if (selectedDate) renderRecordForm();
            });
        }
        
        function changeCategoryColor(name, color) {
            if (!checkEditPermission()) { renderCategories(); return; }
            categoryColors[name] = color;
            saveCategoryColorsToStorage();
            if (selectedDate) renderRecordForm();
        }

        // 활동기록 탭에서 이 카테고리를 열어둘지(기본값) 접어둘지 카테고리 관리 탭에서 미리 정해둠.
        // 단, "지난 날짜인데 내용이 비어있으면 자동 접힘" 규칙이 이 설정보다 항상 우선함 (isCategoryCollapsed 참고)
        function toggleCategoryDefaultCollapse(name) {
            if (!checkEditPermission()) return;
            categoryDefaultCollapsed[name] = !categoryDefaultCollapsed[name];
            saveCategoryDefaultCollapsedToStorage();
            renderCategories();
            if (selectedDate) renderRecordForm();
        }

        // 카테고리 이름은 여러 곳(색상/박스높이/실제 기록/날짜별 숨김·순서/조회탭 선택/접기상태)에
        // 키로 쓰이고 있어서, 이름 하나 바꿀 때 그 흔적을 전부 옛 이름 → 새 이름으로 옮겨줘야 함
        // 카테고리 이름 변경 모달에서 대상이 되는 원래 이름
        let editingCategoryName = null;

        // 흐름도/메모장 이름변경과 마찬가지로 브라우저 네이티브 prompt() 대신 앱 자체 모달을 씀
        // (prompt는 스타일링이 안 되고 모바일에서 특히 어색해 보임)
        function renameCategory(oldName) {
            if (!checkEditPermission()) return;
            editingCategoryName = oldName;
            document.getElementById('categoryRenameInput').value = oldName;
            document.getElementById('categoryRenameModal').classList.add('active');
            applyFormLockState();
            setTimeout(() => document.getElementById('categoryRenameInput').focus(), 50);
        }

        function closeCategoryRenameModal() {
            document.getElementById('categoryRenameModal').classList.remove('active');
            editingCategoryName = null;
        }

        function saveCategoryRename() {
            if (!checkEditPermission()) return;
            const oldName = editingCategoryName;
            if (!oldName) return;

            const newName = document.getElementById('categoryRenameInput').value.trim();
            if (!newName) { showAppToast('카테고리 이름을 입력해주세요'); return; }
            if (newName === oldName) { closeCategoryRenameModal(); return; }
            if (categories.includes(newName) || archivedCategories.includes(newName)) { showAppToast('이미 존재하는 카테고리입니다 (보관된 카테고리 포함)'); return; }

            const idx = categories.indexOf(oldName);
            if (idx === -1) { closeCategoryRenameModal(); return; }
            categories[idx] = newName;

            if (Object.prototype.hasOwnProperty.call(categoryColors, oldName)) {
                categoryColors[newName] = categoryColors[oldName];
                delete categoryColors[oldName];
            }

            if (Object.prototype.hasOwnProperty.call(categoryDefaultCollapsed, oldName)) {
                categoryDefaultCollapsed[newName] = categoryDefaultCollapsed[oldName];
                delete categoryDefaultCollapsed[oldName];
            }

            if (Object.prototype.hasOwnProperty.call(categoryBoxHeights, oldName)) {
                categoryBoxHeights[newName] = categoryBoxHeights[oldName];
                delete categoryBoxHeights[oldName];
            }

            for (const date in dateCategoryBoxHeights) {
                const dayHeights = dateCategoryBoxHeights[date];
                if (dayHeights && Object.prototype.hasOwnProperty.call(dayHeights, oldName)) {
                    dayHeights[newName] = dayHeights[oldName];
                    delete dayHeights[oldName];
                }
            }

            for (const date in records) {
                if (records[date] && Object.prototype.hasOwnProperty.call(records[date], oldName)) {
                    records[date][newName] = records[date][oldName];
                    delete records[date][oldName];
                }
            }

            for (const date in categoryImages) {
                if (categoryImages[date] && Object.prototype.hasOwnProperty.call(categoryImages[date], oldName)) {
                    categoryImages[date][newName] = categoryImages[date][oldName];
                    delete categoryImages[date][oldName];
                }
            }

            for (const date in hiddenCategoriesByDate) {
                hiddenCategoriesByDate[date] = hiddenCategoriesByDate[date].map(c => c === oldName ? newName : c);
            }
            for (const date in dateCategoryOrder) {
                dateCategoryOrder[date] = dateCategoryOrder[date].map(c => c === oldName ? newName : c);
            }

            if (selectedCategoriesForQuery.has(oldName)) {
                selectedCategoriesForQuery.delete(oldName);
                selectedCategoriesForQuery.add(newName);
            }

            // 상용구 / 요일 템플릿 / 수정 이력도 카테고리 이름을 키로 쓰므로 함께 옮김
            if (Object.prototype.hasOwnProperty.call(recordSnippets, oldName)) {
                recordSnippets[newName] = recordSnippets[oldName];
                delete recordSnippets[oldName];
            }
            for (const dow in weekdayTemplates) {
                const tpl = weekdayTemplates[dow];
                if (tpl && Object.prototype.hasOwnProperty.call(tpl, oldName)) {
                    tpl[newName] = tpl[oldName];
                    delete tpl[oldName];
                }
            }
            const revisionSuffix = '|' + oldName;
            for (const key of Object.keys(recordRevisions)) {
                if (key.endsWith(revisionSuffix)) {
                    recordRevisions[key.slice(0, -revisionSuffix.length) + '|' + newName] = recordRevisions[key];
                    delete recordRevisions[key];
                }
            }
            safeSetItem('recordRevisions', JSON.stringify(recordRevisions));
            saveRecordSnippetsToStorage();

            const oldSuffix = '::' + oldName;
            for (const key of Object.keys(categoryCollapseOverride)) {
                if (key.endsWith(oldSuffix)) {
                    const newKey = key.slice(0, -oldSuffix.length) + '::' + newName;
                    categoryCollapseOverride[newKey] = categoryCollapseOverride[key];
                    delete categoryCollapseOverride[key];
                }
            }

            saveCategoriesToStorage();
            saveCategoryColorsToStorage();
            saveCategoryDefaultCollapsedToStorage();
            saveCategoryBoxHeightsToStorage();
            saveDateCategoryBoxHeightsToStorage();
            saveRecordsToStorage();
            saveCategoryImagesToStorage();
            saveHiddenCategoriesToStorage();
            saveDateCategoryOrderToStorage();

            renderCategories();
            renderCategorySelector();
            if (selectedDate) renderRecordForm();
            renderCalendar();
            closeCategoryRenameModal();
        }

        function renderCategories() {
            const container = document.getElementById('categoriesList');
            container.innerHTML = categories.map(category => {
                const isDefaultCollapsed = !!categoryDefaultCollapsed[category];
                return `
                <div class="category-tag" data-category="${escapeHtml(category)}">
                    <div class="category-tag-left">
                        <span class="category-tag-drag-handle" title="드래그하거나 화살표 키로 순서 변경" tabindex="0" role="button" aria-label="${escapeHtml(category)} 순서 변경 (화살표 키 사용 가능)" onpointerdown="categoryTagPointerDown(event, '${escapeForOnclickArg(category)}')" onkeydown="categoryTagKeyDown(event, '${escapeForOnclickArg(category)}')">⠿</span>
                        <span class="category-tag-name">${escapeHtml(category)}</span>
                    </div>
                    <div class="category-tag-actions">
                        <button class="category-default-collapse-toggle${isDefaultCollapsed ? ' active' : ''}" onclick="toggleCategoryDefaultCollapse('${escapeForOnclickArg(category)}')" title="활동기록 탭에서 이 카테고리의 기본 펼침/접힘 상태 (지난 날짜에 내용이 없으면 이 설정과 상관없이 항상 접힘)">${isDefaultCollapsed ? '▸ 기본 최소화' : '▾ 항상 열림'}</button>
                        <input type="color" class="category-color-input" value="${categoryColors[category] || '#667eea'}"
                            onchange="changeCategoryColor('${escapeForOnclickArg(category)}', this.value)" title="박스 색상 설정">
                        <button class="category-tag-edit" onclick="renameCategory('${escapeForOnclickArg(category)}')" title="이름 수정">✏️</button>
                        <button class="category-tag-edit" onclick="archiveCategory('${escapeForOnclickArg(category)}')" title="보관: 입력 화면에서만 숨기고 과거 기록은 검색·조회에 그대로 남김">📦</button>
                        <button class="category-tag-delete" onclick="deleteCategory('${escapeForOnclickArg(category)}')" aria-label="${escapeHtml(category)} 카테고리 삭제">✕</button>
                    </div>
                </div>
            `;
            }).join('');

            renderArchivedCategories();
            if (typeof applyFormLockState === 'function') applyFormLockState();
        }

        // ===== 카테고리 보관(아카이브) =====
        // 삭제와 달리 records의 과거 내용은 전혀 건드리지 않고, categories(입력 화면에 쓰는 목록)에서만
        // 빼서 archivedCategories로 옮김. 검색/조회/통계/설비 이력은 getAllRecordCategories()로 계속 조회됨
        function archiveCategory(name) {
            if (!checkEditPermission()) return;
            if (!categories.includes(name)) return;
            // 활성 카테고리가 하나도 없으면 서버가 신규 계정으로 보고 기본 카테고리를 다시 채우므로 막음
            if (categories.length <= 1) { showAppToast('카테고리가 최소 1개는 남아 있어야 합니다'); return; }

            confirmModal(`'${name}' 카테고리를 보관할까요?\n\n활동기록 입력 화면에서는 보이지 않게 되지만, 지금까지 적은 기록은 지워지지 않고 검색·기간 조회·통계에서 계속 볼 수 있습니다. 언제든 다시 복원할 수 있습니다.`, () => {
                if (selectedDate) captureCurrentFormToRecords(); // 보관 직전까지 입력한 내용을 먼저 확정
                categories = categories.filter(c => c !== name);
                if (!archivedCategories.includes(name)) archivedCategories.push(name);
                saveCategoriesToStorage();
                saveArchivedCategoriesToStorage();
                renderCategories();
                renderCategorySelector();
                if (selectedDate) renderRecordForm();
                renderCalendar();
                showAppToast(`'${name}' 카테고리를 보관했습니다`);
            });
        }

        function restoreArchivedCategory(name) {
            if (!checkEditPermission()) return;
            if (!archivedCategories.includes(name)) return;
            archivedCategories = archivedCategories.filter(c => c !== name);
            if (!categories.includes(name)) categories.push(name);
            if (!categoryColors[name]) {
                categoryColors[name] = COLOR_PALETTE[categories.length % COLOR_PALETTE.length];
                saveCategoryColorsToStorage();
            }
            saveCategoriesToStorage();
            saveArchivedCategoriesToStorage();
            renderCategories();
            renderCategorySelector();
            if (selectedDate) renderRecordForm();
            renderCalendar();
            showAppToast(`'${name}' 카테고리를 복원했습니다`);
        }

        function renderArchivedCategories() {
            const container = document.getElementById('archivedCategoriesList');
            const section = document.getElementById('archivedCategoriesSection');
            if (!container || !section) return;
            section.style.display = archivedCategories.length ? '' : 'none';
            container.innerHTML = archivedCategories.map(category => {
                const count = Object.keys(records).filter(d => records[d] && typeof records[d][category] === 'string' && records[d][category].trim() !== '').length;
                return `
                <div class="category-tag archived-category-tag">
                    <div class="category-tag-left">
                        <span class="category-tag-name">📦 ${escapeHtml(category)}</span>
                        <span class="archived-category-count">기록 ${count}일</span>
                    </div>
                    <div class="category-tag-actions">
                        <button class="category-default-collapse-toggle" onclick="restoreArchivedCategory('${escapeForOnclickArg(category)}')">↩ 복원</button>
                        <button class="category-tag-delete" onclick="deleteCategory('${escapeForOnclickArg(category)}')" aria-label="${escapeHtml(category)} 카테고리 영구 삭제" title="기록까지 영구 삭제">✕</button>
                    </div>
                </div>`;
            }).join('');
        }

        // 카테고리 관리 카드 순서 변경: categories 배열 순서를 바로 바꾸는 것이라, 날짜별로 순서를
        // 따로 바꾼 적 없는 날짜는 달력&활동기록 탭에서도 이 순서 그대로 반영됨
        // (getCategoryOrderForDate의 categories.slice() 참고). 드래그/화살표 키 공통 로직은
        // createDragReorder(탭 순서 변경 바로 위 참고)를 그대로 씀
        const categoryTagDragReorder = createDragReorder({
            itemClass: 'category-tag',
            ghostClass: 'category-tag-ghost',
            checkPermission: () => editUnlocked,
            getId: el => el.dataset.category,
            handleSelector: '.category-tag-drag-handle',
            onReorder: (fromCategory, toCategory) => {
                const fromIndex = categories.indexOf(fromCategory);
                const toIndex = categories.indexOf(toCategory);
                if (fromIndex === -1 || toIndex === -1) return;
                categories.splice(fromIndex, 1);
                categories.splice(toIndex, 0, fromCategory);

                saveCategoriesToStorage();
                renderCategories();
                renderCategorySelector();
                if (selectedDate) renderRecordForm();
            }
        });

        function categoryTagPointerDown(e, category) {
            categoryTagDragReorder.pointerDown(e, category);
        }

        function categoryTagKeyDown(e, category) {
            categoryTagDragReorder.keyDown(e, category);
        }
        
        function renderCategorySelector() {
            const container = document.getElementById('categorySelector');
            // 보관한 카테고리도 과거 기록 조회 대상이므로 함께 보여줌(📦 표시)
            container.innerHTML = getAllRecordCategories().map(category => `
                <button class="category-select-btn${archivedCategories.includes(category) ? ' archived' : ''}" data-category="${escapeHtml(category)}" onclick="selectCategoryForQuery('${escapeForOnclickArg(category)}')">${archivedCategories.includes(category) ? '📦 ' : ''}${escapeHtml(category)}</button>
            `).join('');
            if (typeof refreshSearchCategoryOptions === 'function') refreshSearchCategoryOptions();
            // 다시 그려도 기존 선택 상태가 유지되게 함
            container.querySelectorAll('.category-select-btn').forEach(btn => {
                btn.classList.toggle('selected', selectedCategoriesForQuery.has(btn.dataset.category));
            });
        }
        
        function selectCategoryForQuery(category) {
            if (selectedCategoriesForQuery.has(category)) {
                selectedCategoriesForQuery.delete(category);
            } else {
                selectedCategoriesForQuery.add(category);
            }
            
            document.querySelectorAll('.category-select-btn').forEach(btn => {
                btn.classList.toggle('selected', selectedCategoriesForQuery.has(btn.dataset.category));
            });
            
            queryRecords();
        }
        
