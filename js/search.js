        function updateDateRange() {
            queryRecords();
        }

        // 기간별 카테고리 조회: 매번 시작일/종료일을 손으로 고르지 않아도 되도록 자주 쓰는
        // 기간을 버튼 하나로 바로 채워줌
        // "오늘/이번주/이번달/지난달/올해" 프리셋 공통 계산 로직. 기간별 카테고리 조회, AI 월별
        // 피드백처럼 시작일/종료일 두 칸을 직접 고르는 곳이면 어디서든 재사용함

        function applyPeriodQueryPreset(preset) {
            const range = computePresetDateRange(preset);
            if (!range) return;

            document.getElementById('startDate').value = formatDate(range.start);
            document.getElementById('endDate').value = formatDate(range.end);
            document.querySelectorAll('#periodQueryPresetRow .quick-preset-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.preset === preset);
            });
            queryRecords();
        }

        // 시작일/종료일을 직접 손으로 바꾸면 더 이상 프리셋과 일치하지 않으므로 선택 표시를 지움
        function clearPeriodQueryPresetSelection() {
            document.querySelectorAll('#periodQueryPresetRow .quick-preset-btn').forEach(btn => {
                btn.classList.remove('selected');
            });
        }
        
        // ===== 키워드 통합 검색 (전체 기간 × 전체 카테고리 × 예정작업) =====
        let lastSearchResults = []; // 인라인 수정에서 인덱스로 참조하기 위해 마지막 검색 결과를 보관
        
        function performKeywordSearch() {
            const input = document.getElementById('searchKeywordInput');
            const keyword = input.value.trim();
            const resultsEl = document.getElementById('searchResults');
            
            if (!keyword) {
                resultsEl.innerHTML = '<div class="no-result">검색어를 입력해주세요</div>';
                return;
            }
            
            const kwLower = keyword.toLowerCase();
            const results = [];
            
            // 활동기록(카테고리별 내용) 검색
            for (const dateStr in records) {
                const rec = records[dateStr];
                for (const category of categories) {
                    const content = rec[category];
                    if (content && content.toLowerCase().includes(kwLower)) {
                        results.push({ date: dateStr, tag: category, content });
                    }
                }
            }
            
            // 예정작업(제목) 검색
            for (const ev of events) {
                if (ev.title && ev.title.toLowerCase().includes(kwLower)) {
                    results.push({ date: ev.start, tag: '예정작업', content: ev.title });
                }
            }
            
            results.sort((a, b) => b.date.localeCompare(a.date)); // 최근 날짜부터
            
            if (results.length === 0) {
                resultsEl.innerHTML = `<div class="no-result">'${escapeHtml(keyword)}'에 대한 검색 결과가 없습니다</div>`;
                return;
            }
            
            lastSearchResults = results; // 인라인 수정에서 참조하기 위해 결과를 보관
            
            resultsEl.innerHTML = results.map((r, idx) => {
                const dateObj = new Date(r.date);
                const dateLabel = dateObj.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
                const snippet = highlightKeyword(escapeHtml(r.content), keyword);
                
                // 예정작업은 제목만 있어서 여기서 바로 고치기 애매하므로, 활동기록만 인라인 수정을 제공
                const editable = r.tag !== '예정작업';
                
                return `
                    <div class="result-item" data-result-idx="${idx}">
                        <div class="result-top">
                            <div class="result-date">📅 ${dateLabel} <span class="search-result-tag">[${escapeHtml(r.tag)}]</span></div>
                            <div class="result-actions">
                                ${editable ? `<button class="result-action-btn" onclick="startInlineEdit(${idx})">✏️ 수정</button>` : ''}
                                <button class="result-action-btn" onclick="jumpToSearchResult('${r.date}')">📅 이 날짜 열기</button>
                            </div>
                        </div>
                        <div class="result-content" id="resultContent-${idx}">${snippet}</div>
                    </div>
                `;
            }).join('');
        }
        
        // 검색 결과 카드 안에서 바로 내용을 고칠 수 있게 입력창으로 전환.
        // (달력 탭으로 이동하지 않고도 오타 수정 같은 가벼운 편집을 끝낼 수 있게 함)
        // 카테고리명에 따옴표 등이 들어가도 문제가 없도록, 값을 직접 넘기지 않고 인덱스로만 참조함
        function startInlineEdit(idx) {
            if (!checkEditPermission()) return;
            
            const r = lastSearchResults[idx];
            if (!r) return;
            
            const contentEl = document.getElementById(`resultContent-${idx}`);
            if (!contentEl || contentEl.dataset.editing === 'true') return;
            
            const currentText = (records[r.date] && records[r.date][r.tag]) || '';
            contentEl.dataset.editing = 'true';
            contentEl.innerHTML = `
                <textarea class="result-edit-textarea" id="resultEdit-${idx}"></textarea>
                <div class="result-edit-actions">
                    <button class="result-action-btn primary" onclick="saveInlineEdit(${idx})">저장</button>
                    <button class="result-action-btn" onclick="performKeywordSearch()">취소</button>
                </div>
            `;
            
            const ta = document.getElementById(`resultEdit-${idx}`);
            ta.value = currentText; // innerHTML로 넣으면 특수문자가 깨질 수 있어 value로 직접 대입
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
            ta.focus();
        }
        
        function saveInlineEdit(idx) {
            if (!checkEditPermission()) return;
            
            const r = lastSearchResults[idx];
            const ta = document.getElementById(`resultEdit-${idx}`);
            if (!r || !ta) return;
            
            if (!records[r.date]) records[r.date] = {};
            records[r.date][r.tag] = ta.value.trim();
            saveRecordsToStorage();
            
            // 지금 달력에서 보고 있는 날짜를 고친 경우, 그쪽 화면도 같이 최신화
            if (selectedDate === r.date) renderRecordForm();
            renderCalendar();
            
            performKeywordSearch(); // 수정된 내용으로 검색 결과 다시 그리기
        }
        
        // 검색 결과 안에서 키워드 부분만 강조 표시 (내용은 이미 escapeHtml 처리된 상태로 전달됨)
        function highlightKeyword(escapedText, keyword) {
            // escapedText는 이미 escapeHtml을 거친 상태라 keyword도 똑같이 escapeHtml을 거쳐야
            // 매칭됨 (안 그러면 검색어에 &/</> 같은 문자가 있을 때 강조 표시가 안 됨)
            const escapedKeyword = escapeHtml(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(escapedKeyword, 'gi');
            return escapedText.replace(re, match => `<mark style="background:#fff3a3; padding:0 2px; border-radius:2px;">${match}</mark>`);
        }
        
        // 검색 결과 클릭 시 달력 탭의 해당 날짜로 이동
        function jumpToSearchResult(dateStr) {
            const d = new Date(dateStr);
            currentDate = new Date(d.getFullYear(), d.getMonth(), 1);
            switchTab('calendar');
            selectDate(dateStr);
        }
        
        // CSV 내보내기에서 화면에 보이는 조회 결과와 똑같은 내용을 받아쓸 수 있도록 마지막 조회 결과를 보관
        let lastQueryResults = [];

        function queryRecords() {
            if (selectedCategoriesForQuery.size === 0) {
                document.getElementById('queryResults').innerHTML = '<div class="no-result">카테고리를 선택해주세요</div>';
                lastQueryResults = []; // 화면엔 결과가 없는데 CSV 내보내기가 예전 검색 결과를 그대로 받아쓰지 않도록 비움
                return;
            }
            
            queryStartDate = new Date(document.getElementById('startDate').value);
            queryEndDate = new Date(document.getElementById('endDate').value);
            
            // 날짜별로 선택된 카테고리들의 내용을 모음
            const results = [];
            for (const dateStr in records) {
                const date = new Date(dateStr);
                if (date >= queryStartDate && date <= queryEndDate) {
                    const categoryContents = [];
                    for (const category of categories) {
                        if (!selectedCategoriesForQuery.has(category)) continue;
                        const content = records[dateStr][category];
                        if (content) categoryContents.push({ category, content });
                    }
                    if (categoryContents.length > 0) {
                        results.push({ date: dateStr, categoryContents });
                    }
                }
            }
            
            results.sort((a, b) => new Date(b.date) - new Date(a.date));
            lastQueryResults = results;

            if (results.length === 0) {
                document.getElementById('queryResults').innerHTML = '<div class="no-result">해당 기간에 기록이 없습니다</div>';
                return;
            }
            
            const html = results.map(item => {
                const date = new Date(item.date);
                const dateLabel = date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
                
                const categoriesHtml = item.categoryContents.map(cc => `
                    <div class="result-category-block">
                        <div class="result-category-name">${cc.category}</div>
                        <div class="result-content">${cc.content}</div>
                    </div>
                `).join('');
                
                return `
                    <div class="result-item">
                        <div class="result-date">📅 ${dateLabel}</div>
                        ${categoriesHtml}
                    </div>
                `;
            }).join('');
            
            document.getElementById('queryResults').innerHTML = html;
        }

        function csvEscapeField(value) {
            const text = (value === null || value === undefined) ? '' : String(value);
            return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
        }

        // "기간별 카테고리 조회" 결과를 CSV로 내려받음 - 화면에 지금 떠있는 조회 결과(lastQueryResults) 기준
        function downloadQueryResultsCsv() {
            if (lastQueryResults.length === 0) return;

            const rows = [['날짜', '카테고리', '내용']];
            for (const item of lastQueryResults) {
                for (const cc of item.categoryContents) {
                    rows.push([item.date, cc.category, cc.content]);
                }
            }

            // 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 앞에 붙임
            const csvContent = '\uFEFF' + rows.map(row => row.map(csvEscapeField).join(',')).join('\r\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `활동기록_${document.getElementById('startDate').value}_${document.getElementById('endDate').value}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

