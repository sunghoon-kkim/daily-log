        // ===== 캘린더 렌더링 =====
        function renderCalendar() {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            
            const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
            document.getElementById('monthYear').textContent = `${year}년 ${monthNames[month]}`;
            
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const firstWeekday = firstDay.getDay();
            const lastDate = lastDay.getDate();
            
            let html = '';
            
            for (let i = 0; i < firstWeekday; i++) {
                html += '<div class="day other-month"></div>';
            }
            
            const today = new Date();
            const todayStr = formatDate(today);
            // 작성 누락 표시: 처음 기록을 시작한 날 이후의 지난 근무일 중 아무 카테고리에도 내용이 없는 날
            const showMissing = !isFeatureDisabled('missingRecordIndicator');
            const firstRecordDate = showMissing ? getFirstRecordDate() : null;
            let workdayCount = 0;
            let writtenCount = 0;
            for (let d = 1; d <= lastDate; d++) {
                const dateObj = new Date(year, month, d);
                const dateStr = formatDate(dateObj);
                const isToday = dateObj.toDateString() === today.toDateString();
                const isSelected = dateStr === selectedDate;
                const isInHighlightedRange = highlightedEventRange &&
                    dateStr >= highlightedEventRange.start && dateStr <= highlightedEventRange.end;
                const dayOfWeek = dateObj.getDay(); // 0=일, 6=토
                const holidayName = KR_HOLIDAYS[dateStr];
                
                let classes = 'day';
                if (isToday) classes += ' today';
                if (isSelected) classes += ' selected';
                if (isInHighlightedRange) classes += ' range-highlight';
                let dayTitleAttr = '';
                if (firstRecordDate && dateStr >= firstRecordDate && dateStr <= todayStr && !isNonWorkingDay(dateStr, dateObj)) {
                    const written = hasAnyRecordContent(dateStr);
                    // 오늘은 아직 하루가 끝나지 않았으므로, 이미 작성했을 때만 작성률 계산에 포함
                    if (dateStr < todayStr || written) {
                        workdayCount++;
                        if (written) writtenCount++;
                    }
                    if (!written && dateStr < todayStr) {
                        classes += ' record-missing';
                        dayTitleAttr = ' title="활동기록 작성 누락 (근무일)"';
                    }
                }
                
                // 날짜 숫자 색상 클래스 결정 (공휴일 > 일요일 > 토요일 순 우선)
                let numClass = '';
                if (holidayName || dayOfWeek === 0) {
                    numClass = holidayName ? 'holiday-num' : 'sunday-num';
                } else if (dayOfWeek === 6) {
                    numClass = 'saturday-num';
                }
                
                // 이 날짜에 해당하는 이벤트 찾기
                const dayEvents = events.filter(ev => dateStr >= ev.start && dateStr <= ev.end)
                    .sort((a, b) => a.start.localeCompare(b.start));
                
                let planHtml = '<div class="day-plan-list">';
                
                if (holidayName) {
                    planHtml += `<div class="day-holiday-name" title="${holidayName}">${holidayName}</div>`;
                }
                
                const visibleEvents = dayEvents.slice(0, 5);
                for (const ev of visibleEvents) {
                    planHtml += `<div class="day-plan-item" style="background:${ev.color}" title="${escapeHtml(ev.title)}" onpointerdown="event.stopPropagation(); eventPillPointerDown(event, '${ev.id}')" onclick="event.stopPropagation(); openEventModal('${ev.id}')">${escapeHtml(ev.title)}</div>`;
                }
                
                if (dayEvents.length > 5) {
                    planHtml += `<div class="day-plan-more" onclick="event.stopPropagation(); selectDate('${dateStr}')">+${dayEvents.length - 5}개</div>`;
                }
                
                planHtml += '</div>';
                
                html += `
                    <div class="${classes}" data-date="${dateStr}"${dayTitleAttr} onclick="selectDate('${dateStr}')">
                        <button class="day-plus-btn" onclick="event.stopPropagation(); openEventModal(null, '${dateStr}')" aria-label="${dateStr} 일정 추가">+</button>
                        <div class="day-top">
                            <div class="day-number ${numClass}">${d}</div>
                            <div class="day-record-dots">${buildRecordDots(dateStr)}</div>
                        </div>
                        ${planHtml}
                    </div>
                `;
            }
            
            const remainingDays = 42 - (firstWeekday + lastDate);
            for (let i = 0; i < remainingDays; i++) {
                html += '<div class="day other-month"></div>';
            }
            
            document.getElementById('daysContainer').innerHTML = html;

            const rateEl = document.getElementById('monthRecordRate');
            if (rateEl) {
                if (showMissing && workdayCount > 0) {
                    const missing = workdayCount - writtenCount;
                    rateEl.textContent = `✍️ 작성률 ${writtenCount}/${workdayCount}일 (${Math.round(writtenCount / workdayCount * 100)}%)${missing > 0 ? ` · 누락 ${missing}일` : ''}`;
                    rateEl.classList.toggle('has-missing', missing > 0);
                } else {
                    rateEl.textContent = '';
                }
            }

            renderUpcomingWidget();
            if (typeof renderOpenIssuesWidget === 'function') renderOpenIssuesWidget();
            setupCalendarSwipe();
        }

        // 연차/휴가 등 개인 휴무 일정이 걸린 날은 근무일이 아니므로 작성 누락으로 보지 않음 (반차는 근무일)
        const LEAVE_EVENT_PATTERN = /연차|휴가|휴무|병가|경조|공가|대휴|출산|육아휴직/;

        function isNonWorkingDay(dateStr, dateObj) {
            const dayOfWeek = dateObj.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) return true;
            if (KR_HOLIDAYS[dateStr]) return true;
            return events.some(ev => ev.title && dateStr >= ev.start && dateStr <= ev.end &&
                LEAVE_EVENT_PATTERN.test(ev.title) && !/반차/.test(ev.title));
        }

        // 처음으로 무언가 기록한 날짜 (그 이전 날짜는 앱을 쓰기 전이라 누락으로 보지 않음)
        function getFirstRecordDate() {
            let first = null;
            for (const dateStr in records) {
                if ((!first || dateStr < first) && hasAnyRecordContent(dateStr)) first = dateStr;
            }
            return first;
        }

        // 캘린더 영역을 좌우로 드래그(마우스)/스와이프(터치)하면 이전달·다음달로 이동
        function setupCalendarSwipe() {
            const calendarEl = document.querySelector('#calendar .calendar');
            if (!calendarEl || calendarEl.dataset.swipeBound) return;
            calendarEl.dataset.swipeBound = 'true';
            
            let startX = 0;
            let startY = 0;
            let dragging = false;
            
            calendarEl.addEventListener('pointerdown', (e) => {
                // 로그인 모달/회원가입 모달 등이 떠 있는 동안에는 그 위에서의 드래그가
                // 뒤에 깔린 달력의 월 이동으로 이어지면 안 되므로 무시함
                if (!editUnlocked || document.querySelector('.modal-overlay.active')) return;
                startX = e.clientX;
                startY = e.clientY;
                dragging = true;
            });

            calendarEl.addEventListener('pointerup', (e) => {
                if (!dragging) return;
                dragging = false;
                if (!editUnlocked || document.querySelector('.modal-overlay.active')) return;
                
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                
                // 가로로 충분히 움직였고, 세로 움직임보다 가로 움직임이 뚜렷할 때만 스와이프로 인식
                if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                    // 스와이프 직후 이어지는 클릭이 날짜 선택으로 잘못 이어지지 않도록 한 번만 차단
                    calendarEl.addEventListener('click', function suppressClick(ev) {
                        ev.stopPropagation();
                    }, { capture: true, once: true });
                    
                    if (dx > 0) {
                        previousMonth();
                    } else {
                        nextMonth();
                    }
                }
            });
            
            calendarEl.addEventListener('pointercancel', () => {
                dragging = false;
            });
        }

        // ===== 캘린더 일정 드래그앤드롭으로 날짜 옮기기 =====
        // 네이티브 HTML5 드래그앤드롭은 터치 기기에서 동작하지 않아서, 조직도 카드 배정과 같은 방식으로
        // Pointer Events(마우스/터치 공용)로 직접 구현함 - 일정 칩을 따라다니는 고스트를 그려서 옮기고,
        // 손을 뗀 지점 아래에 있는 날짜 칸을 elementFromPoint로 찾아 그 날짜로 이동시킴
        let eventDragState = null; // { eventId, originEl, pointerId, startX, startY, moved, ghostEl }
        const EVENT_DRAG_MOVE_THRESHOLD = 6; // 이보다 적게 움직이면 그냥 클릭(일정 수정)으로 취급

        function eventPillPointerDown(e, eventId) {
            if (e.button !== undefined && e.button !== 0) return; // 마우스면 왼쪽 버튼만
            if (!editUnlocked || document.querySelector('.modal-overlay.active')) return;
            eventDragState = {
                eventId,
                originEl: e.currentTarget,
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                moved: false,
                ghostEl: null
            };
            document.addEventListener('pointermove', eventPillPointerMove);
            document.addEventListener('pointerup', eventPillPointerUp);
            document.addEventListener('pointercancel', eventPillPointerUp);
        }

        function eventPillPointerMove(e) {
            if (!eventDragState) return;
            const dx = e.clientX - eventDragState.startX;
            const dy = e.clientY - eventDragState.startY;

            if (!eventDragState.moved) {
                if (Math.hypot(dx, dy) < EVENT_DRAG_MOVE_THRESHOLD) return;
                eventDragState.moved = true;
                eventDragState.originEl.classList.add('dragging');

                const rect = eventDragState.originEl.getBoundingClientRect();
                const ghost = eventDragState.originEl.cloneNode(true);
                ghost.className = 'day-plan-item day-plan-item-ghost';
                ghost.style.background = eventDragState.originEl.style.background;
                ghost.style.width = rect.width + 'px';
                document.body.appendChild(ghost);
                eventDragState.ghostEl = ghost;
            }

            e.preventDefault(); // 드래그 중 터치 스크롤/텍스트 선택 방지
            eventDragState.ghostEl.style.left = e.clientX + 'px';
            eventDragState.ghostEl.style.top = e.clientY + 'px';

            document.querySelectorAll('.day.drag-over').forEach(el => el.classList.remove('drag-over'));
            eventDragState.ghostEl.style.display = 'none'; // elementFromPoint가 고스트 자신을 집지 않도록 잠깐 숨김
            const under = document.elementFromPoint(e.clientX, e.clientY);
            eventDragState.ghostEl.style.display = '';
            const dayEl = under && under.closest('.day[data-date]');
            if (dayEl) dayEl.classList.add('drag-over');
        }

        function eventPillPointerUp(e) {
            if (!eventDragState) return;
            document.removeEventListener('pointermove', eventPillPointerMove);
            document.removeEventListener('pointerup', eventPillPointerUp);
            document.removeEventListener('pointercancel', eventPillPointerUp);

            const state = eventDragState;
            eventDragState = null;

            state.originEl.classList.remove('dragging');
            if (state.ghostEl) state.ghostEl.remove();
            document.querySelectorAll('.day.drag-over').forEach(el => el.classList.remove('drag-over'));

            if (!state.moved) return; // 움직임 없이 눌렀다 뗀 경우(클릭)는 기존 onclick이 일정 수정 모달을 열도록 둠

            // 실제로 드래그한 경우엔 뒤이어 발생하는 click이 일정 수정 모달을 열지 않도록 한 번 막음.
            // moveEventToDate가 캘린더를 다시 그려서 원래 눌렀던 요소(state.originEl)가 사라져버릴 수
            // 있으므로, 재렌더링에도 그대로 남아있는 document에 걸어둠
            document.addEventListener('click', function suppressClick(ev) {
                ev.stopPropagation();
            }, { capture: true, once: true });

            const under = document.elementFromPoint(e.clientX, e.clientY);
            const dayEl = under && under.closest('.day[data-date]');
            if (!dayEl) return;

            moveEventToDate(state.eventId, dayEl.dataset.date);
        }

        // 일정을 다른 날짜로 옮김. 여러 날짜에 걸친 일정은 그 기간(며칠짜리인지)을 그대로 유지함
        function moveEventToDate(eventId, newStartDateStr) {
            const ev = events.find(e => e.id === eventId);
            if (!ev || ev.start === newStartDateStr) return;

            const durationDays = daysBetweenDateStrs(ev.start, ev.end);
            ev.start = newStartDateStr;
            ev.end = addDaysToDateStr(newStartDateStr, durationDays);

            saveEventsToStorage();
            renderCalendar();
            if (selectedDate) renderRecordForm();
            showStatus('📅 일정 날짜를 옮겼습니다', 'success');
        }

        // 오늘 기준으로 아직 끝나지 않은 예정 작업들을 D-day와 함께 가로 스크롤 카드로 표시.
        // 기본값은 자동 규칙(30일 이내는 펼침/이후는 접힘)을 따르고, 사용자가 카드를 눌러
        // 그 규칙을 뒤집으면(이하 "flip") 그 뒤집힌 상태가 저장되어 창을 닫았다 열어도 유지됨
        const UPCOMING_AUTO_EXPAND_DAYS = 30;
        let collapsedUpcomingCardIds = new Set(); // 자동 규칙의 기본값을 사용자가 뒤집어둔(flip) 예정작업 id 목록
        let highlightedEventRange = null; // { start, end } - 다가오는 일정 카드 클릭 시 캘린더에서 강조할 기간

        // 오늘로부터 30일 이내(이미 시작해 진행 중인 경우 포함)면 기본적으로 펼쳐서 보여줌
        function isUpcomingCardNearByDefault(ev, todayStr) {
            if (ev.start <= todayStr) return true;
            return daysBetweenDateStrs(todayStr, ev.start) <= UPCOMING_AUTO_EXPAND_DAYS;
        }

        function isUpcomingCardCollapsed(ev, todayStr) {
            const defaultCollapsed = !isUpcomingCardNearByDefault(ev, todayStr);
            const flipped = collapsedUpcomingCardIds.has(ev.id);
            return flipped ? !defaultCollapsed : defaultCollapsed;
        }

        function renderUpcomingWidget() {
            const widget = document.getElementById('upcomingWidget');
            const toggleBtn = document.getElementById('upcomingToggleBtn');
            if (!widget) return;

            const isVisible = localStorage.getItem('upcomingWidgetVisible') !== 'false';

            if (toggleBtn) toggleBtn.textContent = isVisible ? '숨기기' : '보이기';

            if (!isVisible) {
                widget.style.display = 'none';
                return;
            }
            widget.style.display = 'flex';

            const todayStr = formatDate(new Date());

            const upcomingAll = events
                .filter(ev => ev.end >= todayStr)
                .sort((a, b) => a.start.localeCompare(b.start));

            // 반복 등록된 일정(같은 repeatGroupId)은 여러 회차가 한꺼번에 다가올 수 있는데,
            // 그걸 전부 카드로 나열하면 목록이 반복분으로 도배되므로 가장 가까운 회차 하나만 대표로 표시함
            const seenRepeatGroups = new Set();
            const upcoming = [];
            for (const ev of upcomingAll) {
                if (ev.repeatGroupId) {
                    if (seenRepeatGroups.has(ev.repeatGroupId)) continue;
                    seenRepeatGroups.add(ev.repeatGroupId);
                }
                upcoming.push(ev);
                if (upcoming.length >= 10) break;
            }

            if (upcoming.length === 0) {
                widget.innerHTML = '<div class="upcoming-empty">📌 다가오는 일정이 없습니다</div>';
                return;
            }

            widget.innerHTML = upcoming.map(ev => {
                const ddayInfo = calcDDay(todayStr, ev.start, ev.end);
                const repeatLabel = ev.repeatGroupId ? ' (반복)' : '';

                // 접힌 카드는 색상 막대만 표시, 클릭하면 다시 펼쳐짐 (툴팁으로 제목/D-day 확인 가능)
                if (isUpcomingCardCollapsed(ev, todayStr)) {
                    return `
                        <div class="upcoming-card-mini" style="background:${ev.color}" onclick="toggleUpcomingCardCollapse('${ev.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleUpcomingCardCollapse('${ev.id}')}" role="button" tabindex="0" title="${escapeHtml(ev.title)}${repeatLabel} (${ddayInfo})" aria-label="${escapeHtml(ev.title)}${repeatLabel} (${ddayInfo}) 펼치기"></div>
                    `;
                }

                const dateLabel = ev.start === ev.end
                    ? formatDateLabelShort(ev.start)
                    : `${formatDateLabelShort(ev.start)} ~ ${formatDateLabelShort(ev.end)}`;

                return `
                    <div class="upcoming-card" style="border-left-color:${ev.color}" onclick="jumpToUpcomingDate('${ev.start}','${ev.end}')">
                        <button class="upcoming-card-collapse-btn" onclick="event.stopPropagation(); toggleUpcomingCardCollapse('${ev.id}')" title="작게 접기" aria-label="작게 접기">−</button>
                        ${ev.repeatGroupId ? '<div class="upcoming-card-repeat-badge">(반복)</div>' : ''}
                        <span class="upcoming-card-dday" style="background:${ev.color}">${ddayInfo}</span>
                        <div class="upcoming-card-title" title="${escapeHtml(ev.title)}">${escapeHtml(ev.title)}</div>
                        <div class="upcoming-card-date">${dateLabel}</div>
                    </div>
                `;
            }).join('');
        }

        // 다가오는 일정 카드를 클릭하면 예정 작업 수정창을 열지 않고, 그 날짜로 이동하면서
        // 예정 작업이 걸쳐 있는 전체 기간을 캘린더에서 강조 표시함
        function jumpToUpcomingDate(startStr, endStr) {
            highlightedEventRange = { start: startStr, end: endStr || startStr };

            const d = new Date(startStr);
            currentDate = new Date(d.getFullYear(), d.getMonth(), 1);
            renderCalendar();
            selectDate(startStr, true); // true = 지금 설정한 기간 강조를 유지한 채로 날짜만 선택
        }

        function toggleUpcomingCardCollapse(eventId) {
            if (!checkEditPermission()) return;
            if (collapsedUpcomingCardIds.has(eventId)) collapsedUpcomingCardIds.delete(eventId);
            else collapsedUpcomingCardIds.add(eventId);
            saveCollapsedUpcomingCardsToStorage();
            renderUpcomingWidget();
        }
        
        function toggleUpcomingWidget() {
            if (!checkEditPermission()) return;
            const isVisible = localStorage.getItem('upcomingWidgetVisible') !== 'false';
            safeSetItem('upcomingWidgetVisible', (!isVisible).toString());
            renderUpcomingWidget();
        }
        
        // D-Day 문자열 계산: 시작 전이면 D-n, 기간 중이면 D-DAY(진행중이면 남은 종료일 기준 D-n도 함께)
        function calcDDay(todayStr, startStr, endStr) {
            const oneDay = 24 * 60 * 60 * 1000;
            const today = new Date(todayStr);
            const start = new Date(startStr);
            const end = new Date(endStr);
            
            if (todayStr < startStr) {
                const diff = Math.round((start - today) / oneDay);
                return `D-${diff}`;
            }
            if (todayStr > endStr) {
                return '종료';
            }
            // 오늘이 기간 안에 포함된 경우
            if (startStr === endStr || todayStr === startStr) {
                return 'D-DAY';
            }
            // 여러 날짜에 걸친 일정이 이미 시작된 경우: 종료일까지 며칠 남았는지 표시
            const diffToEnd = Math.round((end - today) / oneDay);
            return diffToEnd === 0 ? 'D-DAY' : `종료 D-${diffToEnd}`;
        }
        
        function formatDateLabelShort(dateStr) {
            const d = new Date(dateStr);
            return `${d.getMonth() + 1}/${d.getDate()}`;
        }
        
        // 이 날짜 이전에 해당 카테고리를 마지막으로 작성했던 날을 찾음 (없으면 null).
        // 일상점검처럼 매일 비슷한 내용을 반복 입력하는 경우, 전날 내용을 가져와 수정하는 용도
        function findPreviousRecord(dateStr, category) {
            if (!dateStr) return null;
            
            const prevDates = Object.keys(records)
                .filter(d => d < dateStr && records[d][category] && records[d][category].trim() !== '')
                .sort();
            
            if (prevDates.length === 0) return null;
            
            const latest = prevDates[prevDates.length - 1];
            return { date: latest, content: records[latest][category] };
        }
        
        function loadPreviousRecord(category) {
            if (!checkEditPermission()) return;
            
            const prev = findPreviousRecord(selectedDate, category);
            if (!prev) return;
            
            // 화면 입력창에만 값을 넣으면, 자동저장(0.8초 지연)이 실행되기 전에 renderRecordForm()이
            // 화면을 다시 그리면서 값이 사라짐. 그래서 records에 먼저 확정 저장한 뒤 화면을 갱신함
            if (!records[selectedDate]) records[selectedDate] = {};
            records[selectedDate][category] = prev.content;
            saveRecordsToStorage();
            
            renderRecordForm();
            renderCalendar();
            
            const d = new Date(prev.date);
            showStatus(`${d.getMonth() + 1}/${d.getDate()} 기록을 불러왔습니다`, 'success');
        }
        
        // 그 날짜에 어떤 카테고리를 기록했는지 캘린더 칸에 작은 색상 점으로 표시.
        // 체크(✓) 하나만 있을 때는 "뭔가 썼다"만 알 수 있었는데, 이제 어느 카테고리가 비었는지도 한눈에 보임
        function buildRecordDots(dateStr) {
            const rec = records[dateStr];
            if (!rec) return '';
            
            return categories
                .filter(c => rec[c] && rec[c].trim() !== '')
                .map(c => `<span class="record-dot" style="background:${categoryColors[c] || '#667eea'}" title="${escapeHtml(c)}"></span>`)
                .join('');
        }
        
        
        // ===== 날짜 선택 & 활동기록 =====
        function selectDate(dateStr, keepRangeHighlight) {
            // 다른 날짜로 넘어가기 전에 지금까지 입력한 내용 자동 저장
            if (selectedDate && selectedDate !== dateStr) {
                captureCurrentFormToRecords();
            }
            
            // 일반적인 날짜 클릭(다가오는 일정 카드를 통한 이동이 아닌 경우)에는
            // 이전에 남아있을 수 있는 기간 강조 표시를 지움
            if (!keepRangeHighlight) highlightedEventRange = null;
            
            selectedDate = dateStr;
            const date = new Date(dateStr);
            const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
            document.getElementById('selectedDate').textContent = date.toLocaleDateString('ko-KR', options);
            
            renderCalendar();
            renderRecordForm();
        }
        
        // 워드의 자동 번호 매기기처럼, 텍스트 안의 "숫자. " 로 시작하는 줄들을 등장 순서대로 1부터 다시 매김.
        // 앞의 줄이 지워지면 뒤의 줄들이 자동으로 번호가 당겨지고, 커서 위치는 최대한 그대로 유지함
        function renumberListLines(textarea) {
            const value = textarea.value;
            const cursorPos = textarea.selectionStart;
            const lines = value.split('\n');

            // 커서가 몇 번째 줄의 몇 번째 칸에 있는지 계산
            let pos = 0;
            let cursorLine = lines.length - 1;
            let cursorCol = lines[lines.length - 1].length;
            for (let i = 0; i < lines.length; i++) {
                const lineLen = lines[i].length;
                if (cursorPos <= pos + lineLen) {
                    cursorLine = i;
                    cursorCol = cursorPos - pos;
                    break;
                }
                pos += lineLen + 1;
            }

            let expected = 1;
            let changed = false;
            let newCursorCol = cursorCol;

            const newLines = lines.map((line, i) => {
                const m = line.match(/^(\d+)(\.\s?)(.*)$/);
                if (!m) return line;

                const oldPrefixLen = m[1].length + m[2].length;
                const newPrefix = expected + '. ';
                expected++;

                if (i === cursorLine) {
                    newCursorCol = cursorCol <= oldPrefixLen
                        ? newPrefix.length
                        : cursorCol - oldPrefixLen + newPrefix.length;
                }

                if (newPrefix === m[1] + m[2]) return line;
                changed = true;
                return newPrefix + m[3];
            });

            if (!changed) return;

            textarea.value = newLines.join('\n');

            let newPos = 0;
            for (let i = 0; i < cursorLine; i++) newPos += newLines[i].length + 1;
            newPos += newCursorCol;
            textarea.selectionStart = textarea.selectionEnd = newPos;
        }

        // 현재 화면에 입력된 내용을 records에 반영 (날짜 이동/저장 공용)
        function captureCurrentFormToRecords() {
            if (!selectedDate) return false;
            if (!records[selectedDate]) records[selectedDate] = {};
            
            let changed = false;
            for (const category of categories) {
                const textarea = document.getElementById(`category-${category}`);
                // textarea가 없는 경우(그 날짜에서 숨겨둔 카테고리)는 건드리지 않음.
                // 예전에는 이때 값이 빈 문자열로 덮어써져서, 카테고리를 숨기면 그 안에 적어둔 내용이
                // 영구적으로 사라지는 버그가 있었음
                if (!textarea) continue;
                
                const val = textarea.value.trim();
                if (records[selectedDate][category] !== val) {
                    records[selectedDate][category] = val;
                    changed = true;
                }
            }
            
            if (changed) saveRecordsToStorage();
            return changed;
        }
        
        // 활동기록 카테고리 박스 하단에 표시할 이미지 썸네일 하나를 만듦 (클릭하면 확대, 모서리
        // 드래그로 크기조절, ✕로 삭제). imageObj는 categoryImages[date][category] 배열의 원소 참조를
        // 그대로 들고 있다가 크기조절/삭제 시 그 배열을 직접 찾아 갱신함
        function createCategoryImageThumb(date, category, imageObj) {
            const wrap = document.createElement('div');
            wrap.className = 'category-image-thumb';

            const img = document.createElement('img');
            img.src = imageObj.url;
            img.alt = '첨부 이미지';
            img.style.width = (imageObj.width || 160) + 'px';
            img.style.height = (imageObj.height || 120) + 'px';
            img.addEventListener('click', () => openImageLightbox(imageObj.url));
            observeImageResize(img, () => {
                imageObj.width = img.offsetWidth;
                imageObj.height = img.offsetHeight;
                saveCategoryImagesToStorage();
            });

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'category-image-remove';
            removeBtn.title = '이미지 삭제';
            removeBtn.setAttribute('aria-label', '이미지 삭제');
            removeBtn.textContent = '✕';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!checkEditPermission()) return;
                const list = categoryImages[date] && categoryImages[date][category];
                if (list) {
                    const i = list.indexOf(imageObj);
                    if (i !== -1) list.splice(i, 1);
                    saveCategoryImagesToStorage();
                }
                wrap.remove();
            });

            wrap.appendChild(img);
            wrap.appendChild(removeBtn);
            return wrap;
        }

        // 활동기록 카테고리 박스(textarea)에 이미지를 붙여넣으면 텍스트로 넣지 않고 그 박스의
        // 이미지 갤러리에 첨부함
        async function handleCategoryImagePaste(e, textarea) {
            const file = extractPastedImageFile(e);
            if (!file) return;
            e.preventDefault();
            if (!checkEditPermission()) return;

            const date = selectedDate;
            const category = textarea.dataset.category;
            if (!date || !category) return;

            const box = textarea.closest('.category-record');
            const gallery = box ? box.querySelector('.category-images') : null;

            const placeholder = document.createElement('div');
            placeholder.className = 'category-image-thumb category-image-uploading';
            placeholder.textContent = '🖼️ 업로드 중...';
            if (gallery) gallery.appendChild(placeholder);

            try {
                const { dataUrl, width, height } = await resizeImageFileToDataUrl(file, 1600, 0.82);
                const result = await uploadImageToDrive(dataUrl);
                const initialWidth = Math.min(width || 160, 200);
                const ratio = (width && height) ? height / width : 0.75;
                const imageObj = { url: result.url, fileId: result.fileId, width: initialWidth, height: Math.round(initialWidth * ratio) };

                if (!categoryImages[date]) categoryImages[date] = {};
                if (!categoryImages[date][category]) categoryImages[date][category] = [];
                categoryImages[date][category].push(imageObj);
                saveCategoryImagesToStorage();

                placeholder.remove();
                if (gallery) gallery.appendChild(createCategoryImageThumb(date, category, imageObj));
            } catch (err) {
                console.error('활동기록 이미지 업로드 실패:', err);
                placeholder.textContent = '⚠️ 업로드 실패';
                setTimeout(() => placeholder.remove(), 2500);
            }
        }

        function renderRecordForm() {
            const container = document.getElementById('recordContent');
            
            if (!selectedDate) {
                container.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">날짜를 선택해주세요</div>';
                return;
            }
            
            if (!records[selectedDate]) records[selectedDate] = {};
            
            let html = '';
            
            // 해당 날짜의 예정 작업 미리보기
            const dayEvents = events.filter(ev => selectedDate >= ev.start && selectedDate <= ev.end);
            if (dayEvents.length > 0) {
                html += '<div class="day-events-preview"><h4>📌 이 날의 일정</h4>';
                for (const ev of dayEvents) {
                    html += `
                        <div class="preview-event-item" style="background:${ev.color}" onclick="openEventModal('${ev.id}')">
                            <span>${escapeHtml(ev.title)}</span>
                            <span class="edit-hint">수정 ✏️</span>
                        </div>
                    `;
                }
                html += '</div>';
            }
            
            // 카테고리별 활동 기록 (이 날짜에서 숨긴 카테고리는 건너뜀, 이 날짜만의 순서 적용).
            // 접힌 카테고리는 세로 카드로 그리지 않고, 펼쳐진 카테고리들과 분리해서 하단에 배지 그리드로 모아 보여줌
            const hiddenList = hiddenCategoriesByDate[selectedDate] || [];
            const orderedCategories = getCategoryOrderForDate(selectedDate);
            const visibleCategories = orderedCategories.filter(c => !hiddenList.includes(c));
            const hiddenCategories = orderedCategories.filter(c => hiddenList.includes(c));

            let expandedHtml = '';
            let collapsedChipsHtml = '';

            for (const category of visibleCategories) {
                const content = records[selectedDate][category] || '';
                const color = categoryColors[category] || '#667eea';
                const isCollapsed = isCategoryCollapsed(selectedDate, category);
                const categoryHtml = escapeHtml(category);
                const categoryArg = escapeForOnclickArg(category);

                if (isCollapsed) {
                    collapsedChipsHtml += `
                        <button type="button" class="collapsed-category-chip" data-category="${categoryHtml}" style="--chip-color:${color}" onclick="toggleCategoryCollapse('${categoryArg}')" title="클릭해서 펼치기">
                            <span class="collapsed-category-chip-dot" style="background:${color}"></span>
                            <span class="collapsed-category-chip-name">${categoryHtml}</span>
                        </button>
                    `;
                    continue;
                }

                // 이 날짜에 개별 지정된 높이가 있으면 우선, 없으면 카테고리 기본값 사용
                const dateHeight = dateCategoryBoxHeights[selectedDate] && dateCategoryBoxHeights[selectedDate][category];
                const savedHeight = dateHeight || categoryBoxHeights[category];
                const heightStyle = savedHeight ? `height:${savedHeight}px;` : '';
                expandedHtml += `
                    <div class="category-record" data-category="${categoryHtml}" style="border-left-color:${color};${heightStyle}">
                        <div class="category-record-header" draggable="true">
                            <span class="category-drag-handle" title="드래그해서 순서 변경">⠿</span>
                            <div class="category-name" style="color:${color}">${categoryHtml}</div>
                            <div class="category-header-actions">
                                ${(!content && findPreviousRecord(selectedDate, category)) ? `<button class="category-prev-btn" draggable="false" onclick="loadPreviousRecord('${categoryArg}')" title="이전에 작성한 기록 불러오기">↓ 이전 기록</button>` : ''}
                                <button class="category-collapse-btn" draggable="false" onclick="toggleCategoryCollapse('${categoryArg}')" title="접기/펼치기">▾</button>
                                <button class="category-hide-btn" draggable="false" onclick="hideCategoryForDate('${categoryArg}')" title="이 날짜에서 숨기기" aria-label="이 날짜에서 숨기기">✕</button>
                            </div>
                        </div>
                        <textarea id="category-${categoryHtml}" data-category="${categoryHtml}" placeholder="활동 내용을 입력하세요...">${escapeHtml(content)}</textarea>
                        <div class="category-images" data-category="${categoryHtml}"></div>
                    </div>
                `;
            }

            html += `<div class="expanded-categories-area">${expandedHtml}</div>`;

            if (hiddenCategories.length > 0) {
                html += '<div class="hidden-categories-row">';
                html += '<span class="hidden-categories-label">이 날짜에서 숨김:</span>';
                for (const category of hiddenCategories) {
                    html += `<button class="hidden-category-chip" onclick="showCategoryForDate('${escapeForOnclickArg(category)}')">+ ${escapeHtml(category)}</button>`;
                }
                html += '</div>';
            }

            // 접힌 카테고리가 하나도 없으면 영역 자체를 그리지 않아 불필요한 여백이 남지 않게 함
            if (collapsedChipsHtml) {
                html += `
                    <div class="collapsed-categories-area">
                        <div class="collapsed-categories-label">📁 접어둔 카테고리</div>
                        <div class="collapsed-categories-grid">${collapsedChipsHtml}</div>
                    </div>
                `;
            }

            container.innerHTML = html;
            
            // 박스 크기 조절 시 이 날짜에 한해서만 자동 저장 (카테고리 기본값은 건드리지 않음)
            const dateForResize = selectedDate;
            container.querySelectorAll('.category-record').forEach(box => {
                const category = box.dataset.category;
                const observer = new ResizeObserver(() => {
                    if (box.classList.contains('collapsed')) return;
                    // offsetHeight(테두리 포함 전체 높이)를 사용해야
                    // 저장/복원 시 적용하는 style height와 기준이 일치함
                    const h = Math.round(box.offsetHeight);
                    if (!dateCategoryBoxHeights[dateForResize]) dateCategoryBoxHeights[dateForResize] = {};
                    if (dateCategoryBoxHeights[dateForResize][category] !== h) {
                        dateCategoryBoxHeights[dateForResize][category] = h;
                        queueCategoryHeightSave();
                    }
                    
                    // 박스 크기가 어떤 이유로든 바뀔 때마다(수동 드래그 포함) textarea가 그 공간을 채우도록 함.
                    // mouseup 이벤트만으로는 브라우저에 따라 놓치는 경우가 있어 ResizeObserver로 이중 보강
                    fillTextareaToFitBox(box, category);
                });
                observer.observe(box);

                // 이 날짜/카테고리에 이미 붙여넣어둔 이미지가 있으면 갤러리에 그려줌
                const galleryContainer = box.querySelector('.category-images');
                if (galleryContainer) {
                    const existingImages = (categoryImages[dateForResize] && categoryImages[dateForResize][category]) || [];
                    existingImages.forEach(imageObj => {
                        galleryContainer.appendChild(createCategoryImageThumb(dateForResize, category, imageObj));
                    });
                }

                // 날짜를 열었을 때 내용에 딱 맞게 박스 크기를 맞춤 (접힌 카테고리는 건너뜀)
                autoGrowCategoryBox(category);
                
                // 우측 하단을 드래그해서 박스를 손으로 크게 늘렸을 때, 그 남는 공간만큼 textarea도 같이 채워줌
                box.addEventListener('mouseup', () => {
                    fillTextareaToFitBox(box, category);
                });
                
                setupCategoryDragAndDrop(box);
            });
            
            // 활동 내용 입력 중에도 자동으로 임시 저장 + 박스 높이 자동 조절 (다른 날짜/새로고침 대비).
            // 예전엔 로컬 저장까지만 하고 서버 동기화는 "저장하기" 버튼을 눌러야만 나갔는데, 메모장 탭처럼
            // 서버로도 자동 동기화되게 해서 저장하기를 깜빡 잊고 나가도 내용이 남게 함
            container.querySelectorAll('.category-record textarea').forEach(textarea => {
                textarea.addEventListener('input', () => {
                    // 워드 자동 번호 매기기처럼, 줄이 추가/삭제될 때마다 번호를 항상 1부터 순서대로 다시 매김
                    renumberListLines(textarea);

                    clearTimeout(recordAutosaveTimeout);
                    recordAutosaveTimeout = setTimeout(() => {
                        if (captureCurrentFormToRecords()) queueSync();
                    }, 800);

                    autoGrowCategoryBox(textarea.dataset.category || textarea.id.replace('category-', ''));
                });

                // 활동 내용에 이미지를 붙여넣으면(스크린샷 등) 텍스트로는 들어가지 않고,
                // 박스 하단의 이미지 갤러리에 첨부됨
                textarea.addEventListener('paste', (e) => handleCategoryImagePaste(e, textarea));

                // 빈 박스를 처음 클릭했을 때 "1. " 자동 생성
                textarea.addEventListener('focus', () => {
                    if (textarea.value === '') {
                        textarea.value = '1. ';
                        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });

                // 포커스 때 자동 생성됐던 "1. "에 아무 내용도 입력하지 않고 다른 곳을 클릭하면,
                // 빈 박스였던 것처럼 다시 비워줌 (내용 없이 번호만 저장되는 것을 방지)
                textarea.addEventListener('blur', () => {
                    if (/^\d+\.\s?$/.test(textarea.value)) {
                        textarea.value = '';
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });

                textarea.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        // Enter 입력 시 다음 번호를 이어서 자동 생성 (번호만 있는 빈 줄에서 Enter를 누르면 번호 매기기 종료)
                        const value = textarea.value;
                        const cursorPos = textarea.selectionStart;
                        const beforeCursor = value.substring(0, cursorPos);
                        const lineStart = beforeCursor.lastIndexOf('\n') + 1;
                        const currentLine = beforeCursor.substring(lineStart);

                        const match = currentLine.match(/^(\d+)\.\s?(.*)$/);
                        if (!match) return; // 번호로 시작하는 줄이 아니면 기본 동작(그냥 줄바꿈) 그대로 둠

                        e.preventDefault();

                        const num = parseInt(match[1], 10);
                        const restOfLine = match[2];

                        if (restOfLine.trim() === '') {
                            // 번호만 있고 내용이 없는 줄에서 Enter → 번호 매기기를 멈추고 그냥 줄바꿈
                            textarea.value = value.substring(0, lineStart) + value.substring(cursorPos);
                            textarea.selectionStart = textarea.selectionEnd = lineStart;
                        } else {
                            const insertText = '\n' + (num + 1) + '. ';
                            textarea.value = value.substring(0, cursorPos) + insertText + value.substring(cursorPos);
                            textarea.selectionStart = textarea.selectionEnd = cursorPos + insertText.length;
                        }

                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    } else if (e.key === 'Backspace' && textarea.selectionStart === textarea.selectionEnd) {
                        // 커서가 "숫자. " 번호 바로 뒤에 있을 때 Backspace를 누르면, 번호 전체를 한 번에 지움
                        // (워드에서 자동 번호 매기기를 지울 때와 동일한 동작)
                        const value = textarea.value;
                        const cursorPos = textarea.selectionStart;
                        const beforeCursor = value.substring(0, cursorPos);
                        const lineStart = beforeCursor.lastIndexOf('\n') + 1;
                        const prefix = value.substring(lineStart, cursorPos);

                        if (!/^\d+\.\s?$/.test(prefix)) return;

                        e.preventDefault();
                        textarea.value = value.substring(0, lineStart) + value.substring(cursorPos);
                        textarea.selectionStart = textarea.selectionEnd = lineStart;
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });
            });
            
            // 새로 그려진 카테고리 textarea들에도 현재 편집 잠금 상태를 반영
            document.querySelectorAll('.category-record textarea').forEach(ta => {
                ta.readOnly = !editUnlocked;
            });
        }
        
        // 이 날짜에 저장된 순서가 있으면 그걸 쓰고, 없으면 기본 카테고리 순서를 씀.
        // 새로 추가된 카테고리가 저장된 순서에 없으면 맨 뒤에 자동으로 붙여줌
        function getCategoryOrderForDate(dateStr) {
            // 사용자가 직접 드래그로 순서를 바꾼 적이 있으면 그게 항상 우선
            const savedOrder = dateCategoryOrder[dateStr];
            if (savedOrder && savedOrder.length > 0) {
                const valid = savedOrder.filter(c => categories.includes(c));
                for (const c of categories) {
                    if (!valid.includes(c)) valid.push(c);
                }
                return valid;
            }
            
            // 지난 날짜(오늘 이전)는 작성된 카테고리를 위로, 안 쓴 카테고리를 아래로 자동 정렬
            const todayStr = formatDate(new Date());
            if (dateStr < todayStr) {
                const rec = records[dateStr] || {};
                const written = categories.filter(c => rec[c] && rec[c].trim() !== '');
                const empty = categories.filter(c => !(rec[c] && rec[c].trim() !== ''));
                return written.concat(empty);
            }
            
            return categories.slice();
        }
        
        // 이 카테고리가 지금 접혀야 하는지 판단 (우선순위 순서)
        // 1. 사용자가 이 날짜에서 직접 접기/펼치기 버튼을 클릭한 적이 있으면 그 선택이 항상 최우선
        // 2. (최우선 규칙) 지난 날짜인데 그 카테고리에 작성된 내용이 없으면 무조건 자동 접힘
        // 3. 그 외(오늘/미래 날짜이거나, 지난 날짜라도 내용이 있는 경우)는 카테고리 관리 탭에서
        //    지정해둔 기본 상태(항상 열림/기본 최소화)를 따름
        function isCategoryCollapsed(dateStr, category) {
            const key = dateStr + '::' + category;
            if (Object.prototype.hasOwnProperty.call(categoryCollapseOverride, key)) {
                return categoryCollapseOverride[key];
            }

            const todayStr = formatDate(new Date());
            if (dateStr < todayStr) {
                const content = (records[dateStr] && records[dateStr][category]) || '';
                if (content.trim() === '') return true;
            }

            return !!categoryDefaultCollapsed[category];
        }
        
        // 카테고리 박스 접기/펼치기 (제목만 남기기) - 이 날짜에서 사용자가 직접 선택한 상태로 기억됨 (세션 동안만)
        function toggleCategoryCollapse(category) {
            if (!checkEditPermission()) return;
            const key = selectedDate + '::' + category;
            const current = isCategoryCollapsed(selectedDate, category);
            categoryCollapseOverride[key] = !current;
            renderRecordForm();
        }
        
        // ===== 카테고리 박스 드래그앤드롭 순서 변경 (이 날짜에만 적용) =====
        function setupCategoryDragAndDrop(box) {
            const header = box.querySelector('.category-record-header');
            const category = box.dataset.category;
            
            header.addEventListener('dragstart', (e) => {
                if (!editUnlocked) { e.preventDefault(); return; }
                draggedCategoryId = category;
                box.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            
            header.addEventListener('dragend', () => {
                box.classList.remove('dragging');
                document.querySelectorAll('.category-record').forEach(b => b.classList.remove('drag-over'));
            });
            
            box.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (category !== draggedCategoryId) box.classList.add('drag-over');
            });
            
            box.addEventListener('dragleave', () => {
                box.classList.remove('drag-over');
            });
            
            box.addEventListener('drop', (e) => {
                e.preventDefault();
                box.classList.remove('drag-over');
                if (!draggedCategoryId || draggedCategoryId === category) return;
                
                const currentOrder = getCategoryOrderForDate(selectedDate);
                const fromIndex = currentOrder.indexOf(draggedCategoryId);
                const toIndex = currentOrder.indexOf(category);
                if (fromIndex === -1 || toIndex === -1) return;
                
                currentOrder.splice(fromIndex, 1);
                currentOrder.splice(toIndex, 0, draggedCategoryId);
                
                dateCategoryOrder[selectedDate] = currentOrder;
                saveDateCategoryOrderToStorage();
                renderRecordForm();
            });
        }
        
        // 카테고리 박스를 내용에 딱 맞게 조절 (늘리기/줄이기 모두) - 수동으로 늘려둔 박스도 내용을 지우면 다시 최소화됨
        function autoGrowCategoryBox(category) {
            const box = document.querySelector(`.category-record[data-category="${cssEscape(category)}"]`);
            const textarea = document.getElementById(`category-${category}`);
            if (!box || !textarea || box.classList.contains('collapsed')) return;
            
            // 바깥 박스의 높이를 직접 계산하지 않고, textarea 자체를 내용에 맞게 늘림.
            // 박스는 이제 flex 레이아웃상 이 textarea를 그냥 감싸기만 하면 되므로(더 이상 flex:1로
            // 늘어나지 않음) 브라우저가 알아서 딱 맞는 높이로 계산해줌 - 계산 누락으로 인한 오차 원인 자체를 제거함
            box.style.height = '';
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        }
        
        // 박스를 손으로 크게 늘렸을 때(우측 하단 드래그), 그 남는 공간만큼 textarea도 채워서
        // "박스는 커졌는데 안에 입력창은 그대로"인 상황을 방지함
        function fillTextareaToFitBox(box, category) {
            const textarea = document.getElementById(`category-${category}`);
            if (!box || !textarea || box.classList.contains('collapsed')) return;
            
            const headerEl = box.querySelector('.category-record-header');
            const galleryEl = box.querySelector('.category-images');
            const style = getComputedStyle(box);
            const paddingTop = parseFloat(style.paddingTop) || 0;
            const paddingBottom = parseFloat(style.paddingBottom) || 0;
            const headerHeight = headerEl ? headerEl.offsetHeight + 10 : 0; // 10 = margin-bottom
            // 이미지가 붙어있으면 그 갤러리 높이(+margin-top 8px)도 textarea가 차지할 수 없는 공간이므로 빼줌
            const galleryHeight = (galleryEl && galleryEl.children.length > 0) ? galleryEl.offsetHeight + 8 : 0;

            const available = box.clientHeight - paddingTop - paddingBottom - headerHeight - galleryHeight;
            
            // textarea 자신의 실제 필요한 콘텐츠 높이를 먼저 정확히 측정
            textarea.style.height = 'auto';
            const contentHeight = textarea.scrollHeight;
            
            // 박스에 남는 공간이 있으면(수동으로 크게 늘린 경우) 그 공간만큼 채우고,
            // 그렇지 않으면(내용이 더 크면) 내용 크기 그대로 유지
            const finalHeight = Math.max(contentHeight, available);
            textarea.style.height = finalHeight + 'px';
        }
        
        // CSS.escape 미지원 환경 대비 간단한 안전장치
        function cssEscape(str) {
            if (window.CSS && CSS.escape) return CSS.escape(str);
            return String(str).replace(/["\\]/g, '\\$&');
        }
        
        let recordAutosaveTimeout = null;
        let categoryHeightSaveTimeout = null;
        
        function queueCategoryHeightSave() {
            clearTimeout(categoryHeightSaveTimeout);
            categoryHeightSaveTimeout = setTimeout(() => {
                saveDateCategoryBoxHeightsToStorage();
            }, 500);
        }
        
        // 이 날짜에서만 특정 카테고리를 숨김 (전체 카테고리 목록/다른 날짜 기록에는 영향 없음)
        function hideCategoryForDate(category) {
            if (!checkEditPermission()) return;
            if (!selectedDate) return;
            
            // 숨기기 전에 지금까지 입력한 내용은 먼저 저장
            captureCurrentFormToRecords();
            
            if (!hiddenCategoriesByDate[selectedDate]) hiddenCategoriesByDate[selectedDate] = [];
            if (!hiddenCategoriesByDate[selectedDate].includes(category)) {
                hiddenCategoriesByDate[selectedDate].push(category);
            }
            saveHiddenCategoriesToStorage();
            renderRecordForm();
        }
        
        function showCategoryForDate(category) {
            if (!checkEditPermission()) return;
            if (!selectedDate) return;

            if (hiddenCategoriesByDate[selectedDate]) {
                hiddenCategoriesByDate[selectedDate] = hiddenCategoriesByDate[selectedDate].filter(c => c !== category);
                // 이 날짜에서 마지막으로 숨겨뒀던 카테고리까지 다시 보이게 하면 빈 배열([])만 계속
                // 남게 되는데, 이러면 그 어떤 것도 숨기지 않은 날짜와 동작은 똑같으면서
                // (hiddenCategoriesByDate[date] || []로 쓰이는 곳들과 결과가 같음) 프로필에 쓸모없는
                // 항목만 영구적으로 쌓이므로, 빈 배열이 되면 키 자체를 지움
                if (hiddenCategoriesByDate[selectedDate].length === 0) {
                    delete hiddenCategoriesByDate[selectedDate];
                }
            }
            saveHiddenCategoriesToStorage();
            renderRecordForm();
        }
        
        // 예전에는 로컬에 반영하자마자 무조건 "저장되었습니다"를 띄웠는데, 실제 서버 저장은 그 뒤
        // 800ms 디바운스를 거쳐 비동기로 진행되는 거라 그 사이 실패해도 사용자는 이미 성공했다고
        // 믿고 있는 상태였음. 여기서는 디바운스를 건너뛰고 바로 동기화한 뒤, 그 실제 결과를 보여줌
        async function saveAllRecords() {
            if (!selectedDate) { showStatus('날짜를 선택해주세요', 'error'); return; }

            const changed = captureCurrentFormToRecords();
            renderCalendar();

            if (!changed) {
                showStatus('변경된 내용이 없습니다', 'success');
                return;
            }

            clearTimeout(syncTimeout); // 곧 이어서 직접 동기화하므로, 뒤늦게 또 도는 디바운스 자동저장은 취소함
            showStatus('💾 저장 중...', 'success');

            // 저장이 끝나기 전에 버튼을 다시 눌러 syncToServer()가 겹쳐 나가는 것을 막음
            const saveBtn = document.getElementById('saveAllBtn');
            if (saveBtn) saveBtn.disabled = true;
            try {
                const ok = await syncToServer();
                showStatus(ok ? '✅ 저장되었습니다!' : '⚠️ 서버 저장에 실패했습니다. 다시 시도해주세요.', ok ? 'success' : 'error');
            } finally {
                if (saveBtn) saveBtn.disabled = false;
            }
        }
        
        
        // ===== 일정 모달 (Google 캘린더 스타일) =====
        // 당직/연차/휴가처럼 매번 같은 내용으로 반복 등록하는 일정을 버튼 한 번으로 채워주는 빠른 선택 목록.
        // 내용을 직접 입력하지 않아도 기간만 정하고 저장하면 캘린더에 기록이 남도록 하기 위함
        const QUICK_EVENT_PRESETS = {
            '당직': '#5f27cd',
            '연차': '#54a0ff',
            '휴가': '#54a0ff'
        };

        function renderColorPicker() {
            const container = document.getElementById('colorPicker');
            container.innerHTML = COLOR_PALETTE.map(color => `
                <div class="color-swatch" style="background:${color}" data-color="${color}" onclick="pickColor('${color}')"></div>
            `).join('') + `
                <div class="custom-color-swatch" id="customColorWrapper" title="직접 색상 선택">
                    <input type="color" class="custom-color-input" id="customColorInput"
                        oninput="pickColor(this.value)" onchange="pickColor(this.value)">
                </div>
            `;
        }

        // 팔레트 스와치 + 커스텀 색상 입력 중, 현재 선택된 색상에 맞는 것만 하이라이트
        function syncColorSwatchSelection(color) {
            document.querySelectorAll('.color-swatch').forEach(sw => {
                sw.classList.toggle('selected', sw.dataset.color === color);
            });
            const customWrapper = document.getElementById('customColorWrapper');
            const customInput = document.getElementById('customColorInput');
            if (customWrapper && customInput) {
                const isPaletteColor = COLOR_PALETTE.includes(color);
                customWrapper.classList.toggle('selected', !isPaletteColor);
                if (!isPaletteColor) customInput.value = color;
            }
        }

        function pickColor(color) {
            selectedColor = color;
            syncColorSwatchSelection(color);
        }

        // 빠른 선택 버튼(당직/연차/휴가) 클릭 시 내용/색상을 자동으로 채워서,
        // 이후 기간만 정하고 저장하면 되도록 함
        function applyQuickPreset(name) {
            document.getElementById('eventTitleInput').value = name;
            pickColor(QUICK_EVENT_PRESETS[name]);
            syncQuickPresetSelection(name);
        }

        function syncQuickPresetSelection(title) {
            document.querySelectorAll('.quick-preset-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.preset === title);
            });
        }

        function openEventModal(eventId, defaultDateStr) {
            if (!checkEditPermission()) return;
            editingEventId = eventId;
            const modal = document.getElementById('eventModal');
            const deleteBtn = document.getElementById('deleteEventBtn');
            const repeatSection = document.getElementById('eventRepeatSection');

            if (eventId) {
                // 수정 모드
                const ev = events.find(e => e.id === eventId);
                if (!ev) return;

                document.getElementById('modalTitle').textContent = '📌 일정 수정';
                document.getElementById('eventTitleInput').value = ev.title;
                document.getElementById('eventStartInput').value = ev.start;
                document.getElementById('eventEndInput').value = ev.end;
                selectedColor = ev.color;
                deleteBtn.style.display = 'block';
                // 이미 등록된 일정 하나를 고치는 중에 반복을 걸면 그 자리에서 여러 건으로
                // 불어나 버려 헷갈리므로, 반복 등록은 새 일정을 추가할 때만 제공함
                repeatSection.style.display = 'none';
            } else {
                // 추가 모드
                const dateStr = defaultDateStr || formatDate(new Date());
                document.getElementById('modalTitle').textContent = '📌 일정 추가';
                document.getElementById('eventTitleInput').value = '';
                document.getElementById('eventStartInput').value = dateStr;
                document.getElementById('eventEndInput').value = dateStr;
                selectedColor = COLOR_PALETTE[0];
                deleteBtn.style.display = 'none';
                document.getElementById('eventRepeatIntervalInput').value = '0';
                document.getElementById('eventRepeatCountInput').value = '4';
                repeatSection.style.display = '';
            }

            syncColorSwatchSelection(selectedColor);
            syncQuickPresetSelection(eventId ? document.getElementById('eventTitleInput').value : '');

            modal.classList.add('active');
        }
        
        function closeEventModal() {
            document.getElementById('eventModal').classList.remove('active');
            editingEventId = null;
        }
        
        function saveEvent() {
            if (!checkEditPermission()) return;
            const title = document.getElementById('eventTitleInput').value.trim();
            const start = document.getElementById('eventStartInput').value;
            const end = document.getElementById('eventEndInput').value;
            
            if (!title) { showAppToast('내용을 입력해주세요'); return; }
            if (!start || !end) { showAppToast('기간을 설정해주세요'); return; }
            if (start > end) { showAppToast('종료일은 시작일보다 빠를 수 없습니다'); return; }

            let repeatCount = 1;
            if (editingEventId) {
                const ev = events.find(e => e.id === editingEventId);
                if (ev) {
                    ev.title = title;
                    ev.start = start;
                    ev.end = end;
                    ev.color = selectedColor;
                }
            } else {
                // 당직/연차처럼 같은 간격으로 반복되는 일정은, 서로 독립된 일정 여러 건으로 한 번에
                // 만들어서 매번 새로 등록하지 않아도 되게 함(각 회차는 이후 따로 수정/삭제 가능)
                const repeatInterval = document.getElementById('eventRepeatIntervalInput').value;
                repeatCount = repeatInterval === '0' ? 1 : Math.max(1, Math.min(52, parseInt(document.getElementById('eventRepeatCountInput').value, 10) || 1));
                // 반복 등록된 회차들을 나중에 "전체 삭제"할 수 있도록 묶어주는 id (1건짜리는 필요 없음)
                const repeatGroupId = repeatCount > 1 ? 'rep_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) : null;

                for (let i = 0; i < repeatCount; i++) {
                    let occStart = start, occEnd = end;
                    if (i > 0) {
                        if (repeatInterval === 'month') {
                            occStart = addMonthsToDateStr(start, i);
                            occEnd = addMonthsToDateStr(end, i);
                            // 처음 고른 날짜가 평일이었는데 같은 날짜가 주말로 넘어가는 달이 있으면
                            // (당직/근무일처럼 평일에만 의미가 있는 일정이 대부분이라) 직전 금요일로 당김.
                            // 단, 매월 1~2일처럼 초순이라 당기면 전달로 넘어가버리는 경우엔 그 달을 벗어나지
                            // 않도록 대신 다음 월요일로 미룸
                            if (!isWeekendDateStr(start)) {
                                const occDate = new Date(occStart + 'T00:00:00');
                                const day = occDate.getDay();
                                if (day === 6 || day === 0) {
                                    const pullBackDays = day === 0 ? 2 : 1;
                                    const pulledBackDate = new Date(addDaysToDateStr(occStart, -pullBackDays) + 'T00:00:00');
                                    const staysInMonth = pulledBackDate.getFullYear() === occDate.getFullYear() && pulledBackDate.getMonth() === occDate.getMonth();
                                    const adjustDays = staysInMonth ? -pullBackDays : (day === 0 ? 1 : 2);
                                    occStart = addDaysToDateStr(occStart, adjustDays);
                                    occEnd = addDaysToDateStr(occEnd, adjustDays);
                                }
                            }
                        } else {
                            const offsetDays = parseInt(repeatInterval, 10) * i;
                            occStart = addDaysToDateStr(start, offsetDays);
                            occEnd = addDaysToDateStr(end, offsetDays);
                        }
                    }
                    events.push({
                        id: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '_' + i,
                        title, start: occStart, end: occEnd, color: selectedColor, repeatGroupId
                    });
                }
            }

            saveEventsToStorage();
            closeEventModal();
            renderCalendar();
            if (selectedDate) renderRecordForm();
            showStatus(repeatCount > 1 ? `✅ 일정이 ${repeatCount}건 반복 등록되었습니다!` : '✅ 일정이 저장되었습니다!', 'success');
        }

        function deleteEvent() {
            if (!checkEditPermission()) return;
            if (!editingEventId) return;

            const removeEventsByIds = (ids) => {
                events = events.filter(e => !ids.includes(e.id));
                let collapsedChanged = false;
                ids.forEach(id => { if (collapsedUpcomingCardIds.delete(id)) collapsedChanged = true; });
                if (collapsedChanged) saveCollapsedUpcomingCardsToStorage();
                saveEventsToStorage();
                closeEventModal();
                renderCalendar();
                if (selectedDate) renderRecordForm();
            };

            const targetEvent = events.find(e => e.id === editingEventId);
            const seriesEvents = targetEvent && targetEvent.repeatGroupId
                ? events.filter(e => e.repeatGroupId === targetEvent.repeatGroupId)
                : [];

            if (seriesEvents.length > 1) {
                // 반복 등록으로 여러 건 한 번에 만들어진 일정은, 이번 것 하나만 지울지
                // 반복분 전체를 지울지 골라야 함
                confirmModal(
                    `반복 등록된 일정입니다 (총 ${seriesEvents.length}건). 이 일정만 삭제할까요, 반복 전체를 삭제할까요?`,
                    () => {
                        removeEventsByIds([editingEventId]);
                        showStatus('🗑️ 삭제되었습니다', 'success');
                    },
                    {
                        confirmLabel: '이 일정만',
                        extraLabel: `전체 ${seriesEvents.length}건 삭제`,
                        extraCallback: () => {
                            removeEventsByIds(seriesEvents.map(e => e.id));
                            showStatus(`🗑️ ${seriesEvents.length}건 모두 삭제되었습니다`, 'success');
                        }
                    }
                );
                return;
            }

            confirmModal('이 일정을 삭제하시겠습니까?', () => {
                removeEventsByIds([editingEventId]);
                showStatus('🗑️ 삭제되었습니다', 'success');
            });
        }
        
        // ===== 달력 네비게이션 =====
        // 로그인/회원가입 모달 등이 떠 있는 동안에는 그 위에서 일어나는 드래그가 어떤
        // 경로로든 뒤에 깔린 달력의 월 이동으로 이어지면 안 되므로, 진입점(스와이프/버튼)에
        // 상관없이 여기서 한 번 더 막음
        function previousMonth() {
            if (!editUnlocked || document.querySelector('.modal-overlay.active')) return;
            currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1);
            renderCalendar();
        }

        function nextMonth() {
            if (!editUnlocked || document.querySelector('.modal-overlay.active')) return;
            currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1);
            renderCalendar();
        }
        
        // 캘린더 상단 "연 월" 표시를 눌렀을 때: 화살표로 한 달씩 이동하는 대신 원하는 연/월로 바로 이동
        function openMonthJumpModal() {
            if (!editUnlocked || document.querySelector('.modal-overlay.active')) return;

            const yearSelect = document.getElementById('monthJumpYearSelect');
            const monthSelect = document.getElementById('monthJumpMonthSelect');
            const currentYear = currentDate.getFullYear();

            yearSelect.innerHTML = '';
            for (let y = currentYear - 10; y <= currentYear + 2; y++) {
                const opt = document.createElement('option');
                opt.value = y;
                opt.textContent = y + '년';
                if (y === currentYear) opt.selected = true;
                yearSelect.appendChild(opt);
            }
            monthSelect.value = currentDate.getMonth();

            document.getElementById('monthJumpModal').classList.add('active');
        }

        function confirmMonthJump() {
            const year = Number(document.getElementById('monthJumpYearSelect').value);
            const month = Number(document.getElementById('monthJumpMonthSelect').value);
            currentDate = new Date(year, month, 1);
            renderCalendar();
            closeModalById('monthJumpModal');
        }

        function goToday() {
            currentDate = new Date();
            renderCalendar();
            selectDate(formatDate(new Date()));
        }
        
