        // ===== 카테고리 관리 =====
        function addCategory() {
            if (!checkEditPermission()) return;
            const input = document.getElementById('newCategoryInput');
            const name = input.value.trim();
            
            if (!name) { showAppToast('카테고리 이름을 입력해주세요'); return; }
            if (categories.includes(name)) { showAppToast('이미 존재하는 카테고리입니다'); return; }
            
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
                ? `'${name}' 카테고리를 삭제하시겠습니까?\n\n이 카테고리로 기록된 ${affectedDateCount}일치 내용이 함께 영구 삭제됩니다.`
                : `'${name}' 카테고리를 삭제하시겠습니까?`;

            confirmModal(message, () => {
                categories = categories.filter(c => c !== name);
                delete categoryColors[name];
                delete categoryDefaultCollapsed[name];
                selectedCategoriesForQuery.delete(name);
                for (const key in categoryCollapseOverride) {
                    if (key.endsWith('::' + name)) delete categoryCollapseOverride[key];
                }
                for (const date in records) delete records[date][name];
                for (const date in categoryImages) delete categoryImages[date][name];
                for (const date in hiddenCategoriesByDate) {
                    hiddenCategoriesByDate[date] = hiddenCategoriesByDate[date].filter(c => c !== name);
                }
                for (const date in dateCategoryOrder) {
                    dateCategoryOrder[date] = dateCategoryOrder[date].filter(c => c !== name);
                }

                saveCategoriesToStorage();
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
            if (categories.includes(newName)) { showAppToast('이미 존재하는 카테고리입니다'); return; }

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
                        <button class="category-tag-delete" onclick="deleteCategory('${escapeForOnclickArg(category)}')" aria-label="${escapeHtml(category)} 카테고리 삭제">✕</button>
                    </div>
                </div>
            `;
            }).join('');

            if (typeof applyFormLockState === 'function') applyFormLockState();
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
            container.innerHTML = categories.map(category => `
                <button class="category-select-btn" data-category="${escapeHtml(category)}" onclick="selectCategoryForQuery('${escapeForOnclickArg(category)}')">${escapeHtml(category)}</button>
            `).join('');
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
        
