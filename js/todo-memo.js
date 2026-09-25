        // ===== 메모장 (날짜와 무관한 자유 메모, 흐름도처럼 여러 개 만들어 구분해서 쓸 수 있음) =====

        // notesContent는 현재 보고 있는(currentFreeNotesPageId) 메모장의 내용을 담아두는 변수일 뿐이라,
        // 페이지를 전환/추가/삭제하기 직전마다 이 함수로 지금까지 쓴 내용을 freeNotesPages에 반영해줘야 함
        function syncActiveFreeNotesPageData() {
            const page = freeNotesPages.find(p => p.id === currentFreeNotesPageId);
            if (page) page.content = notesContent;
        }

        // freeNotesPages가 비어있으면(첫 사용, 또는 예전 버전에서 막 넘어온 계정) notesContent(그 시점의
        // 예전 단일 메모장 내용)를 그대로 살려서 메모장 하나를 만들어주고, currentFreeNotesPageId가
        // 가리키는 메모장이 없으면 첫 번째로 되돌린 뒤, notesContent가 그 메모장의 내용을 담도록 함
        function ensureActiveFreeNotesPage() {
            if (!Array.isArray(freeNotesPages)) freeNotesPages = [];
            if (freeNotesPages.length === 0) {
                freeNotesPages.push({
                    id: 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                    name: '메모장 1',
                    content: notesContent || ''
                });
            }
            let current = freeNotesPages.find(p => p.id === currentFreeNotesPageId);
            if (!current) {
                current = freeNotesPages[0];
                currentFreeNotesPageId = current.id;
            }
            if (typeof current.content !== 'string') current.content = '';
            notesContent = current.content;
        }

        function renderFreeNotesPageTabs() {
            const container = document.getElementById('freeNotesPageTabs');
            if (!container) return;
            container.innerHTML = freeNotesPages.map(p => `
                <div class="free-notes-page-tab${p.id === currentFreeNotesPageId ? ' active' : ''}" onclick="switchFreeNotesPage('${p.id}')">
                    <span>${escapeHtml(p.name)}</span>
                    <button class="free-notes-page-tab-edit" onclick="event.stopPropagation(); openFreeNotesPageModal('${p.id}')" title="이름 변경/삭제" aria-label="이름 변경/삭제">✏️</button>
                </div>
            `).join('') + '<button class="free-notes-page-add-btn" onclick="addFreeNotesPage()" title="메모장 추가" aria-label="메모장 추가">➕ 메모장 추가</button>';
        }

        function switchFreeNotesPage(pageId) {
            if (pageId === currentFreeNotesPageId) return;
            syncActiveFreeNotesPageData(); // 나가기 전에 지금 보던 메모장 내용을 확실히 반영해둠
            currentFreeNotesPageId = pageId;
            ensureActiveFreeNotesPage();
            safeSetItem('currentFreeNotesPageId', currentFreeNotesPageId);
            applyNotesContent();
        }

        function addFreeNotesPage() {
            if (!checkEditPermission()) return;
            syncActiveFreeNotesPageData();
            const newPage = {
                id: 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                name: '메모장 ' + (freeNotesPages.length + 1),
                content: ''
            };
            freeNotesPages.push(newPage);
            currentFreeNotesPageId = newPage.id;
            notesContent = newPage.content;
            safeSetItem('freeNotesPages', JSON.stringify(freeNotesPages));
            safeSetItem('currentFreeNotesPageId', currentFreeNotesPageId);
            queueSync();
            applyNotesContent();
        }

        function openFreeNotesPageModal(pageId) {
            if (!checkEditPermission()) return;
            editingFreeNotesPageId = pageId;
            const page = freeNotesPages.find(p => p.id === pageId);
            if (!page) return;
            document.getElementById('freeNotesPageNameInput').value = page.name;
            const deleteBtn = document.getElementById('deleteFreeNotesPageBtn');
            deleteBtn.style.display = freeNotesPages.length > 1 ? 'inline-block' : 'none'; // 마지막 하나 남은 메모장은 지울 수 없게 함
            document.getElementById('freeNotesPageModal').classList.add('active');
            applyFormLockState();
        }

        function closeFreeNotesPageModal() {
            document.getElementById('freeNotesPageModal').classList.remove('active');
            editingFreeNotesPageId = null;
        }

        function saveFreeNotesPageName() {
            if (!checkEditPermission()) return;
            const name = document.getElementById('freeNotesPageNameInput').value.trim();
            if (!name) {
                showAppToast('메모장 이름을 입력해주세요');
                return;
            }
            const page = freeNotesPages.find(p => p.id === editingFreeNotesPageId);
            if (page) page.name = name;
            safeSetItem('freeNotesPages', JSON.stringify(freeNotesPages));
            queueSync();
            closeFreeNotesPageModal();
            renderFreeNotesPageTabs();
        }

        function deleteFreeNotesPage() {
            if (!checkEditPermission()) return;
            if (freeNotesPages.length <= 1) return; // 메모장이 하나뿐일 때는 지울 수 없음
            const targetId = editingFreeNotesPageId;
            confirmModal('이 메모장을 삭제하시겠습니까? 안에 있는 내용이 모두 함께 사라집니다.', () => {
                freeNotesPages = freeNotesPages.filter(p => p.id !== targetId);
                if (currentFreeNotesPageId === targetId) currentFreeNotesPageId = freeNotesPages[0].id;
                ensureActiveFreeNotesPage();
                safeSetItem('freeNotesPages', JSON.stringify(freeNotesPages));
                safeSetItem('currentFreeNotesPageId', currentFreeNotesPageId);
                queueSync();
                closeFreeNotesPageModal();
                applyNotesContent();
            });
        }

        // 이 업데이트 전까지 메모장은 일반 텍스트(textarea.value)로 저장됐음. 예전 방식으로 저장된
        // 내용을 그대로 innerHTML에 넣으면 <, >, & 같은 문자가 HTML로 해석돼 깨질 수 있어서,
        // HTML 태그가 없는(=아직 예전 방식인) 내용일 때만 이스케이프 + 줄바꿈 변환을 거쳐줌
        function toDisplayNotesHtml(content) {
            if (!content) return '';
            if (/<[a-z][\s\S]*>/i.test(content)) return content; // 이미 서식 있는 메모(새 방식)로 저장된 내용
            const escaped = content
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            return escaped.replace(/\n/g, '<br>');
        }

        function applyNotesContent() {
            renderFreeNotesPageTabs();
            document.getElementById('notesTextarea').innerHTML = toDisplayNotesHtml(notesContent);
            wireUpNoteImages(); // innerHTML로 새로 그린 내용 안의 이미지는 이벤트 리스너가 붙어있지 않으므로 다시 연결해줌
            renderTodoList();
        }

        let notesSaveTimeout = null;
        function scheduleNotesSave() {
            autoGrowNotesContainer();
            clearTimeout(notesSaveTimeout);
            notesSaveTimeout = setTimeout(() => {
                const textarea = document.getElementById('notesTextarea');
                notesContent = textarea.innerHTML;
                syncActiveFreeNotesPageData();
                safeSetItem('freeNotesPages', JSON.stringify(freeNotesPages));
                safeSetItem('currentFreeNotesPageId', currentFreeNotesPageId || '');
                queueSync();
                const indicator = document.getElementById('notesSaveIndicator');
                indicator.classList.add('show');
                setTimeout(() => indicator.classList.remove('show'), 1500);
            }, 500);
        }

        function setupNotesAutosave() {
            const textarea = document.getElementById('notesTextarea');
            document.execCommand('defaultParagraphSeparator', false, 'br'); // 브라우저마다 다른 줄바꿈 태그(div/p)를 <br>로 통일
            textarea.addEventListener('input', scheduleNotesSave);
            textarea.addEventListener('paste', handleNotesImagePaste);
        }

        // 메모장에 이미지를 붙여넣으면(스크린샷, 복사한 이미지 등) 커서 위치에 삽입함.
        // 일반 텍스트 붙여넣기는 손대지 않고 브라우저 기본 동작에 그대로 맡김
        async function handleNotesImagePaste(e) {
            const file = extractPastedImageFile(e);
            if (!file) return;
            e.preventDefault();
            if (!checkEditPermission()) return;

            const textarea = document.getElementById('notesTextarea');
            const placeholder = document.createElement('span');
            placeholder.textContent = '🖼️ 이미지 업로드 중...';
            placeholder.className = 'note-image-uploading';
            insertNodeAtCaret(textarea, placeholder);

            try {
                const { dataUrl, width, height } = await resizeImageFileToDataUrl(file, 1600, 0.82);
                const result = await uploadImageToDrive(dataUrl);
                const img = createResizableNoteImage(result.url, width, height);
                placeholder.replaceWith(img);
            } catch (err) {
                console.error('메모 이미지 업로드 실패:', err);
                placeholder.textContent = '⚠️ 이미지 업로드 실패';
            }
            scheduleNotesSave();
        }

        // contenteditable 영역의 현재 커서(선택 영역) 위치에 노드를 삽입함
        function insertNodeAtCaret(container, node) {
            container.focus();
            const sel = window.getSelection();
            let range;
            if (sel && sel.rangeCount > 0 && container.contains(sel.getRangeAt(0).commonAncestorContainer)) {
                range = sel.getRangeAt(0);
            } else {
                range = document.createRange();
                range.selectNodeContents(container);
                range.collapse(false);
            }
            range.deleteContents();
            range.insertNode(node);
            range.setStartAfter(node);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }

        // 새로 업로드한 메모장 이미지를 클릭하면 확대되고, 모서리를 드래그하면 크기를 바꿀 수 있는 <img>를 만듦
        function createResizableNoteImage(url, naturalWidth, naturalHeight) {
            const img = document.createElement('img');
            img.src = url;
            img.className = 'note-image';
            img.alt = '첨부 이미지';
            const initialWidth = Math.min(naturalWidth || 320, 320);
            const ratio = (naturalWidth && naturalHeight) ? naturalHeight / naturalWidth : 0.75;
            img.style.width = initialWidth + 'px';
            img.style.height = Math.round(initialWidth * ratio) + 'px';
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                openImageLightbox(img.src);
            });
            observeImageResize(img, scheduleNotesSave);
            return img;
        }

        // 저장돼있던 메모 내용을 innerHTML로 새로 그린 뒤 호출: 그 안의 이미지들에 클릭(확대보기)/
        // 크기조절 저장 이벤트를 다시 연결함 (innerHTML 대입으로는 예전 리스너가 살아있지 않음)
        function wireUpNoteImages() {
            document.querySelectorAll('#notesTextarea img.note-image').forEach(img => {
                img.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openImageLightbox(img.src);
                });
                observeImageResize(img, scheduleNotesSave);
            });
        }

        // ===== 메모장 서식(굵게/글씨 크기/글자색/형광펜) =====
        let savedNoteRange = null;

        // 색상 선택창(input[type=color])을 열면 메모장이 포커스를 잃어 선택 영역이 풀릴 수 있어서,
        // 선택창을 열기 직전(mousedown)에 선택 범위를 저장해뒀다가 색을 고른 뒤 되살려서 그 자리에 적용함
        function saveNoteSelectionRange() {
            const textarea = document.getElementById('notesTextarea');
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0 && textarea.contains(sel.getRangeAt(0).commonAncestorContainer)) {
                savedNoteRange = sel.getRangeAt(0).cloneRange();
            } else {
                savedNoteRange = null;
            }
        }

        function restoreNoteSelectionRange() {
            document.getElementById('notesTextarea').focus();
            if (!savedNoteRange) return;
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(savedNoteRange);
        }

        function applyNoteFormat(command, value) {
            if (!checkEditPermission()) return;
            document.getElementById('notesTextarea').focus();
            document.execCommand('styleWithCSS', false, true);
            document.execCommand(command, false, value || null);
            scheduleNotesSave();
        }

        // execCommand('fontSize')는 1~7단계뿐이라 세밀한 조절이 안 돼서, 선택한 부분을
        // <span style="font-size">로 직접 감싸는 방식으로 원하는 만큼 키우고 줄일 수 있게 함
        function changeNoteFontSize(delta) {
            if (!checkEditPermission()) return;
            const textarea = document.getElementById('notesTextarea');
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !textarea.contains(sel.getRangeAt(0).commonAncestorContainer)) {
                showAppToast('크기를 바꿀 글자를 먼저 선택해주세요.');
                return;
            }

            const range = sel.getRangeAt(0);
            const refEl = range.commonAncestorContainer.nodeType === 3
                ? range.commonAncestorContainer.parentElement
                : range.commonAncestorContainer;
            const currentSize = parseFloat(getComputedStyle(refEl).fontSize) || 14;
            const newSize = Math.min(Math.max(Math.round(currentSize + delta * 2), 10), 36);

            const span = document.createElement('span');
            span.style.fontSize = newSize + 'px';
            try {
                range.surroundContents(span);
            } catch (e) {
                // 선택 영역이 여러 태그에 걸쳐 있으면 surroundContents가 실패할 수 있어 대체 방식으로 처리
                const frag = range.extractContents();
                span.appendChild(frag);
                range.insertNode(span);
            }

            sel.removeAllRanges();
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            sel.addRange(newRange);

            scheduleNotesSave();
        }

        function clearNoteFormat() {
            if (!checkEditPermission()) return;
            document.getElementById('notesTextarea').focus();
            document.execCommand('removeFormat', false, null);
            document.execCommand('styleWithCSS', false, true);
            document.execCommand('hiliteColor', false, 'transparent'); // removeFormat만으로는 형광펜 배경이 안 지워지는 경우가 있어 한 번 더 처리
            scheduleNotesSave();
        }

        // ===== 해야 할 일 (체크박스로 추가/수정/삭제/완료 표시하는 할일 목록) =====
        function loadTodoItems() {
            const stored = localStorage.getItem('todoItems');
            if (stored) {
                todoItems = safeJsonParse(stored, [], 'todoItems');
                return;
            }
            // 예전 버전(자유 텍스트 textarea)에서 넘어온 사용자를 위한 1회성 마이그레이션
            const legacyText = localStorage.getItem('todoNotes');
            todoItems = legacyText ? migrateTodoTextToItems(legacyText) : [];
        }

        function migrateTodoTextToItems(text) {
            return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => ({
                id: 'todo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                text: line,
                done: false,
                memo: ''
            }));
        }

        function saveTodoItems() {
            safeSetItem('todoItems', JSON.stringify(todoItems));
            queueSync();
            const indicator = document.getElementById('todoSaveIndicator');
            if (indicator) {
                indicator.classList.add('show');
                setTimeout(() => indicator.classList.remove('show'), 1500);
            }
        }

        // 해야 할 일 목록 순서 변경: "해야 할 일"과 "완료"는 화면에서도 분리된 별개의 목록이라,
        // 같은 완료 상태를 가진 항목끼리만 순서 변경을 허용함. 드래그/화살표 키 공통 로직은
        // createDragReorder(탭 순서 변경 위쪽 참고)를 그대로 씀
        const todoItemDragReorder = createDragReorder({
            itemClass: 'todo-item-wrap',
            ghostClass: 'todo-item-ghost',
            checkPermission: () => editUnlocked,
            getId: el => el.dataset.id,
            handleSelector: '.todo-drag-handle',
            canDrop: (fromId, toId) => {
                const fromItem = todoItems.find(t => t.id === fromId);
                const toItem = todoItems.find(t => t.id === toId);
                return !!fromItem && !!toItem && !!fromItem.done === !!toItem.done;
            },
            onReorder: (fromId, toId) => {
                const fromIndex = todoItems.findIndex(t => t.id === fromId);
                const toIndex = todoItems.findIndex(t => t.id === toId);
                if (fromIndex === -1 || toIndex === -1) return;
                const [moved] = todoItems.splice(fromIndex, 1);
                todoItems.splice(toIndex, 0, moved);

                saveTodoItems();
                renderTodoList();
            }
        });

        function todoItemPointerDown(e, id) {
            todoItemDragReorder.pointerDown(e, id);
        }

        function todoItemKeyDown(e, id) {
            todoItemDragReorder.keyDown(e, id);
        }

        function buildTodoItemRow(item) {
            const wrap = document.createElement('div');
            wrap.className = 'todo-item-wrap';
            wrap.dataset.id = item.id;

            const row = document.createElement('div');
            row.className = 'todo-item' + (item.done ? ' done' : '');

            const dragHandle = document.createElement('span');
            dragHandle.className = 'todo-drag-handle';
            dragHandle.title = '드래그하거나 화살표 키로 순서 변경';
            dragHandle.textContent = '⠿';
            dragHandle.tabIndex = 0;
            dragHandle.setAttribute('role', 'button');
            dragHandle.setAttribute('aria-label', (item.text || '할 일') + ' 순서 변경 (화살표 키 사용 가능)');
            dragHandle.addEventListener('pointerdown', (e) => todoItemPointerDown(e, item.id));
            dragHandle.addEventListener('keydown', (e) => todoItemKeyDown(e, item.id));
            row.appendChild(dragHandle);

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'todo-checkbox';
            checkbox.checked = !!item.done;
            checkbox.addEventListener('change', () => toggleTodoItem(item.id));

            const textInput = document.createElement('input');
            textInput.type = 'text';
            textInput.className = 'todo-text-input';
            textInput.value = item.text;
            textInput.addEventListener('blur', () => updateTodoItemText(item.id, textInput.value));
            textInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') textInput.blur();
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'todo-delete-btn';
            deleteBtn.title = '삭제';
            deleteBtn.textContent = '✕';
            deleteBtn.addEventListener('click', () => deleteTodoItem(item.id));

            row.appendChild(checkbox);
            row.appendChild(textInput);
            row.appendChild(deleteBtn);

            const memoInput = document.createElement('textarea');
            memoInput.className = 'todo-memo-input';
            memoInput.rows = 1;
            memoInput.placeholder = '메모 추가...';
            memoInput.value = item.memo || '';
            memoInput.addEventListener('blur', () => updateTodoItemMemo(item.id, memoInput.value));
            memoInput.addEventListener('input', () => {
                memoInput.style.height = 'auto';
                memoInput.style.height = memoInput.scrollHeight + 'px';
                autoGrowNotesContainer();
            });

            wrap.appendChild(row);
            wrap.appendChild(memoInput);
            return wrap;
        }

        function renderTodoList() {
            const activeContainer = document.getElementById('todoList');
            const doneContainer = document.getElementById('todoDoneList');
            if (!activeContainer || !doneContainer) return;
            activeContainer.innerHTML = '';
            doneContainer.innerHTML = '';

            const activeItems = todoItems.filter(item => !item.done);
            const doneItems = todoItems.filter(item => item.done);

            if (activeItems.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'todo-empty';
                empty.textContent = '할 일이 없습니다. 위에서 추가해보세요.';
                activeContainer.appendChild(empty);
            } else {
                activeItems.forEach(item => activeContainer.appendChild(buildTodoItemRow(item)));
            }

            if (doneItems.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'todo-empty';
                empty.textContent = '완료된 항목이 없습니다.';
                doneContainer.appendChild(empty);
            } else {
                doneItems.forEach(item => doneContainer.appendChild(buildTodoItemRow(item)));
            }

            [activeContainer, doneContainer].forEach(c => {
                c.querySelectorAll('.todo-memo-input').forEach(ta => {
                    ta.style.height = 'auto';
                    ta.style.height = ta.scrollHeight + 'px';
                });
            });

            applyFormLockState();
            autoGrowNotesContainer();
        }

        function addTodoItem() {
            if (!checkEditPermission()) return;
            const input = document.getElementById('todoNewInput');
            const text = input.value.trim();
            if (!text) return;

            todoItems.push({
                id: 'todo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                text,
                done: false,
                memo: ''
            });
            input.value = '';
            saveTodoItems();
            renderTodoList();
            document.getElementById('todoNewInput').focus();
        }

        function toggleTodoItem(id) {
            if (!checkEditPermission()) { renderTodoList(); return; }
            const item = todoItems.find(t => t.id === id);
            if (!item) return;
            item.done = !item.done;
            saveTodoItems();
            renderTodoList();
        }

        function updateTodoItemText(id, value) {
            const item = todoItems.find(t => t.id === id);
            if (!item) return;
            const trimmed = value.trim();
            if (!trimmed || trimmed === item.text) {
                renderTodoList(); // 빈 값으로 바꾸려 했거나 변경이 없으면 원래 내용으로 되돌림
                return;
            }
            item.text = trimmed;
            saveTodoItems();
        }

        function updateTodoItemMemo(id, value) {
            const item = todoItems.find(t => t.id === id);
            if (!item) return;
            const trimmed = value.trim();
            if (trimmed === (item.memo || '')) return;
            item.memo = trimmed;
            saveTodoItems();
        }

        function deleteTodoItem(id) {
            if (!checkEditPermission()) return;
            todoItems = todoItems.filter(t => t.id !== id);
            saveTodoItems();
            renderTodoList();
        }

        // 할일 목록/메모장 중 더 긴 내용에 맞춰 전체 영역(notesSplitContainer) 높이를 자동 조절.
        // (활동기록 카테고리 박스와 동일한 방식: 우선 리셋해서 정확히 잰 뒤 필요한 만큼만 늘림/줄임)
        function autoGrowNotesContainer() {
            const container = document.getElementById('notesSplitContainer');
            const todoSections = document.querySelector('#todoPane .todo-sections');
            const notesTextarea = document.getElementById('notesTextarea');
            const todoPane = document.getElementById('todoPane');
            const memoPane = document.getElementById('memoPane');
            if (!container || !todoSections || !notesTextarea || !todoPane || !memoPane) return;
            if (container.offsetParent === null) return; // 탭이 안 보이는 상태면 측정이 부정확하므로 건너뜀

            container.style.height = '';

            // 메모장 textarea는 잠시 auto로 풀어서 실제 필요한 높이를 정확히 측정
            // (todoList는 일반 div라서 overflow:hidden이어도 scrollHeight가 항상 실제 내용 높이를 그대로 반영함)
            notesTextarea.style.height = 'auto';

            const todoStyle = getComputedStyle(todoPane);
            const todoPad = (parseFloat(todoStyle.paddingTop) || 0) + (parseFloat(todoStyle.paddingBottom) || 0);
            const todoOverhead = Array.from(todoPane.children).reduce((sum, el) => {
                if (el === todoSections) return sum;
                return sum + el.offsetHeight + 12;
            }, 0);

            // 해야 할 일/완료 두 칸(todo-section) 각각의 제목+목록 높이를 합산
            const sectionsStyle = getComputedStyle(todoSections);
            const sectionsGap = parseFloat(sectionsStyle.rowGap || sectionsStyle.gap) || 0;
            const sections = Array.from(todoSections.querySelectorAll('.todo-section'));
            let sectionsNeeded = sectionsGap * Math.max(sections.length - 1, 0);
            sections.forEach(section => {
                const list = section.querySelector('.todo-list');
                const title = section.querySelector('.todo-section-title');
                const sectionStyle = getComputedStyle(section);
                const sectionPad = (parseFloat(sectionStyle.paddingTop) || 0) + (parseFloat(sectionStyle.paddingBottom) || 0) + (parseFloat(sectionStyle.borderTopWidth) || 0);
                const titleHeight = title ? title.offsetHeight + (parseFloat(getComputedStyle(title).marginBottom) || 0) : 0;
                sectionsNeeded += sectionPad + titleHeight + (list ? list.scrollHeight : 0);
            });

            const todoNeededTotal = todoPad + todoOverhead + sectionsNeeded + 4;

            const memoStyle = getComputedStyle(memoPane);
            const memoPad = (parseFloat(memoStyle.paddingTop) || 0) + (parseFloat(memoStyle.paddingBottom) || 0);
            const memoHeaderEl = memoPane.querySelector('.notes-header');
            const memoDescEl = memoPane.querySelector('p');
            const memoTabsEl = memoPane.querySelector('#freeNotesPageTabs');
            const memoOverhead = (memoHeaderEl ? memoHeaderEl.offsetHeight + 15 : 0) + (memoDescEl ? memoDescEl.offsetHeight + 12 : 0) + (memoTabsEl ? memoTabsEl.offsetHeight + 12 : 0);
            const memoNeededTotal = memoPad + memoOverhead + notesTextarea.scrollHeight + 4;

            let neededHeight = Math.ceil(Math.max(todoNeededTotal, memoNeededTotal));
            if (neededHeight < 300) neededHeight = 300; // 너무 작아지지 않도록 최소 높이 유지

            container.style.height = neededHeight + 'px';

            // flex:1이 새 컨테이너 높이에 맞춰 다시 채우도록, 측정용으로 임시로 줬던 인라인 높이는 원복
            notesTextarea.style.height = '';
        }
        
        // 할일/메모장 사이 경계를 드래그해서 두 칸의 너비 비율을 자유롭게 조절
        function setupNotesSplitResizer() {
            const container = document.getElementById('notesSplitContainer');
            const divider = document.getElementById('notesSplitDivider');
            const todoPane = document.getElementById('todoPane');
            if (!container || !divider || !todoPane) return;
            
            // 저장된 비율이 있으면 복원
            const savedPercent = parseFloat(localStorage.getItem('notesSplitPercent'));
            if (!isNaN(savedPercent) && savedPercent >= 15 && savedPercent <= 85) {
                todoPane.style.flex = `0 0 ${savedPercent}%`;
            }
            
            let dragging = false;
            
            divider.addEventListener('pointerdown', (e) => {
                dragging = true;
                divider.classList.add('dragging');
                divider.setPointerCapture(e.pointerId);
            });
            
            divider.addEventListener('pointermove', (e) => {
                if (!dragging) return;
                const rect = container.getBoundingClientRect();
                let percent = ((e.clientX - rect.left) / rect.width) * 100;
                percent = Math.min(85, Math.max(15, percent)); // 너무 극단적으로 좁아지지 않게 최소/최대 제한
                todoPane.style.flex = `0 0 ${percent}%`;
            });
            
            divider.addEventListener('pointerup', (e) => {
                if (!dragging) return;
                dragging = false;
                divider.classList.remove('dragging');
                divider.releasePointerCapture(e.pointerId);
                
                // 최종 비율 저장
                const rect = container.getBoundingClientRect();
                const todoRect = todoPane.getBoundingClientRect();
                const percent = (todoRect.width / rect.width) * 100;
                safeSetItem('notesSplitPercent', percent.toFixed(1));
            });
        }
