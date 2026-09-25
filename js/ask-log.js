        // ===== 내 기록에게 물어보기 =====
        // 흐름: ① AI가 질문에서 검색어/기간만 뽑음 → ② 브라우저가 내 기록에서 관련 항목을 찾음
        //       → ③ 찾은 항목만 AI에게 보내 답을 받음. AI는 ③에서 보낸 것 외에는 아무것도 모름
        const ASK_LOG_MAX_ITEMS = 50;
        const ASK_LOG_MAX_CONTEXT_CHARS = 20000;
        const ASK_LOG_LONG_CELL_CHARS = 400;
        const ASK_LOG_STOPWORDS = new Set([
            '뭐', '뭘', '무엇', '언제', '어디', '어디서', '어떻게', '왜', '얼마나', '몇', '누가',
            '있어', '있나', '있었지', '있었어', '했지', '했어', '했나', '했었지', '했던', '하는', '해줘',
            '알려줘', '알려', '정리해줘', '정리', '찾아줘', '보여줘', '그때', '관련', '내용', '기록', '일지',
            '작년', '올해', '지난달', '이번달', '최근', '요즘', '마지막', '마지막으로', '처음', '전에'
        ]);
        const ASK_LOG_PARTICLE_RE = /(에서|으로|에게|까지|부터|하고|이랑|이나|랑|은|는|이|가|을|를|에|의|도|로|와|과|만)$/;

        let askLogLastSources = [];

        function extractLocalAskTerms(question) {
            return String(question || '')
                .replace(/[?？!.,~"'()[\]]/g, ' ')
                .split(/\s+/)
                .map(t => t.trim().toLowerCase())
                .map(t => (t.length > 2 ? t.replace(ASK_LOG_PARTICLE_RE, '') : t))
                .filter(t => t.length >= 2 && !ASK_LOG_STOPWORDS.has(t));
        }

        function countMatchedTerms(text, terms) {
            const lower = String(text || '').toLowerCase();
            let n = 0;
            for (const t of terms) if (lower.includes(t)) n++;
            return n;
        }

        // 긴 칸은 검색어가 든 줄과 그 앞뒤 한 줄만 (한 칸에 여러 설비 내용이 섞여 있는 경우가 많음)
        function pickAskRelevantLines(text, terms) {
            if (text.length <= ASK_LOG_LONG_CELL_CHARS) return text;
            const lines = text.split('\n');
            const keep = new Set();
            lines.forEach((line, i) => {
                if (countMatchedTerms(line, terms) > 0) { keep.add(i - 1); keep.add(i); keep.add(i + 1); }
            });
            const picked = [...keep].filter(i => i >= 0 && i < lines.length).sort((a, b) => a - b).map(i => lines[i]);
            return picked.length ? picked.join('\n') : text.slice(0, ASK_LOG_LONG_CELL_CHARS);
        }

        function collectAskLogCandidates(terms, from, to) {
            const inRange = (d) => !!d && (!from || d >= from) && (!to || d <= to);
            const monthInRange = (ym) => !!ym && (!from || ym >= from.slice(0, 7)) && (!to || ym <= to.slice(0, 7));
            const items = [];
            const add = (item, scoreText) => {
                const score = countMatchedTerms(scoreText, terms);
                if (score > 0) items.push({ ...item, score });
            };

            for (const dateStr in records) {
                if (!inRange(dateStr)) continue;
                const rec = records[dateStr] || {};
                for (const category of getAllRecordCategories()) {
                    const content = rec[category];
                    if (typeof content !== 'string' || !content.trim()) continue;
                    add({ kind: 'record', date: dateStr, source: '활동기록', tag: category, text: pickAskRelevantLines(content, terms) }, content);
                }
            }

            for (const ev of events) {
                if (ev.title && inRange(ev.start)) add({ kind: 'event', date: ev.start, source: '일정', tag: '', text: ev.title }, ev.title);
            }

            for (const m of maintenanceSchedule) {
                const title = `${m.equipment || ''} - ${m.item || '점검'}`;
                for (const c of getMaintenanceCompletions(m)) {
                    if (!inRange(c.date)) continue;
                    const text = `${title}${c.note ? '\n' + c.note : ''}`;
                    add({ kind: 'maintenance', date: c.date, source: '정비완료', tag: m.item || '', text, refId: m.id }, text);
                }
                if (from || to) continue;
                const planText = [title, m.cycle ? '주기: ' + m.cycle : '', m.sop, m.note, m.lastDone ? '최근 완료: ' + m.lastDone : '', m.nextDue ? '다음 예정: ' + m.nextDue : ''].filter(Boolean).join('\n');
                add({ kind: 'maintenance', date: '', source: '정비계획', tag: m.equipment || '', text: planText, refId: m.id }, planText);
            }

            for (const p of savingsProjects) {
                const logs = Array.isArray(p.monthlyLogs) ? p.monthlyLogs : [];
                for (const log of logs) {
                    if (!log.note || !monthInRange(log.month)) continue;
                    add({ kind: 'project', date: log.month, source: '개선과제', tag: p.title || '', text: log.note, refId: p.id }, `${p.title || ''}\n${log.note}`);
                }
                if (from || to) continue;
                const summary = [p.title, p.category ? '분류: ' + p.category : '', p.status ? '상태: ' + p.status : '', p.target ? '목표: ' + p.target : '', p.actual ? '실적: ' + p.actual : ''].filter(Boolean).join('\n');
                add({ kind: 'project', date: '', source: '개선과제', tag: p.title || '', text: summary, refId: p.id }, summary);
            }

            // 날짜가 없는 메모/할일은 기간을 지정한 질문에서는 제외
            if (!from && !to) {
                if (typeof syncActiveFreeNotesPageData === 'function') syncActiveFreeNotesPageData();
                for (const page of freeNotesPages) {
                    const text = htmlToPlainText(page.content);
                    if (text) add({ kind: 'memo', date: '', source: '메모', tag: page.name || '메모장', text: pickAskRelevantLines(text, terms), refId: page.id }, text);
                }
                for (const t of todoItems) {
                    const text = [t.text, t.memo].filter(Boolean).join('\n');
                    if (text) add({ kind: 'todo', date: '', source: t.done ? '할일(완료)' : '할일', tag: '', text }, text);
                }
            }

            // 많이 맞는 것 우선, 같으면 최신 날짜 우선
            items.sort((a, b) => (b.score - a.score) || String(b.date).localeCompare(String(a.date)));

            const picked = [];
            let chars = 0;
            for (const item of items) {
                if (picked.length >= ASK_LOG_MAX_ITEMS) break;
                if (chars + item.text.length > ASK_LOG_MAX_CONTEXT_CHARS) continue;
                picked.push(item);
                chars += item.text.length;
            }
            // AI에게는 날짜순으로 보여줘야 흐름을 읽기 쉬움 (날짜 없는 자료는 맨 뒤)
            picked.sort((a, b) => {
                if (!a.date !== !b.date) return a.date ? -1 : 1;
                return String(a.date).localeCompare(String(b.date));
            });
            return picked;
        }

        function formatAskSourceHeader(item) {
            return [item.date || '날짜 없음', item.source, item.tag].filter(Boolean).join(' | ');
        }

        function buildAskLogContextText(items) {
            return items.map((item, i) => `[#${i + 1}] ${formatAskSourceHeader(item)}\n${item.text}`).join('\n\n');
        }

        function setAskLogBusy(busy, message) {
            document.getElementById('askLogBtn').disabled = busy || !personalAiApiKey;
            const loading = document.getElementById('askLogLoading');
            loading.style.display = busy ? 'block' : 'none';
            if (message) loading.textContent = message;
        }

        function fillAskLogExample(text) {
            const input = document.getElementById('askLogInput');
            input.value = text;
            input.focus();
        }

        async function askMyLog() {
            const input = document.getElementById('askLogInput');
            const question = input.value.trim();
            const statusEl = document.getElementById('askLogStatus');
            const resultBlock = document.getElementById('askLogResultBlock');
            statusEl.textContent = '';
            statusEl.className = 'ai-status';

            if (!question) {
                statusEl.textContent = '질문을 입력해주세요';
                statusEl.className = 'ai-status error';
                return;
            }
            if (selectedDate) captureCurrentFormToRecords(); // 방금 입력 중이던 활동기록도 검색 대상에 포함

            resultBlock.style.display = 'none';
            setAskLogBusy(true, '🔎 질문을 이해하는 중입니다...');
            const today = formatDate(new Date());

            try {
                let keywords = [];
                let from = '';
                let to = '';
                try {
                    const planRes = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({ action: 'askLogPlan', question, today, userApiKey: personalAiApiKey })
                    });
                    const plan = await planRes.json();
                    if (plan.status === 'success') {
                        keywords = plan.keywords || [];
                        from = plan.from || '';
                        to = plan.to || '';
                    }
                } catch (planErr) {
                    console.warn('검색어 추출 실패 - 질문의 단어로만 찾습니다', planErr);
                }

                const terms = [...new Set([...keywords.map(k => k.toLowerCase()), ...extractLocalAskTerms(question)])].filter(Boolean);
                const items = collectAskLogCandidates(terms, from, to);

                // 근거가 없으면 AI에게 묻지 않음 - 물으면 지어낼 여지만 생김
                if (items.length === 0) {
                    renderAskLogResult('기록에서 찾을 수 없습니다.', [], terms, from, to);
                    return;
                }

                setAskLogBusy(true, `📚 관련 기록 ${items.length}건을 읽고 답을 정리하는 중입니다...`);
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'askLog', question, today, contextText: buildAskLogContextText(items), userApiKey: personalAiApiKey })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    renderAskLogResult(data.summary || '', items, terms, from, to);
                } else {
                    statusEl.textContent = '⚠️ ' + (data.message || '답변을 받지 못했습니다');
                    statusEl.className = 'ai-status error';
                }
            } catch (err) {
                console.error('기록 질문 오류:', err);
                statusEl.textContent = '⚠️ 서버 연결에 실패했습니다.';
                statusEl.className = 'ai-status error';
            } finally {
                setAskLogBusy(false);
            }
        }

        function renderAskLogResult(answer, items, terms, from, to) {
            askLogLastSources = items;
            const cited = new Set();
            let invalidCitations = 0;

            // [#번호]를 눌러볼 수 있는 출처 표시로 바꿈. 보낸 적 없는 번호를 대면 "출처 확인 불가"로 드러냄
            const answerHtml = escapeHtml(answer).replace(/\[#(\d+)\]/g, (whole, numStr) => {
                const n = parseInt(numStr, 10);
                if (n >= 1 && n <= items.length) {
                    cited.add(n);
                    return `<button type="button" class="ask-log-cite" onclick="focusAskLogSource(${n})">#${n}</button>`;
                }
                invalidCitations++;
                return '<span class="ask-log-cite invalid" title="보낸 기록에 없는 번호입니다">출처 확인 불가</span>';
            });
            document.getElementById('askLogAnswer').innerHTML = answerHtml;

            const warnEl = document.getElementById('askLogWarning');
            if (invalidCitations > 0) {
                warnEl.style.display = 'block';
                warnEl.textContent = `⚠️ 출처를 확인할 수 없는 내용이 ${invalidCitations}곳 있습니다. 그 부분은 믿지 말고 원본 기록을 직접 확인해주세요.`;
            } else if (items.length > 0 && cited.size === 0 && !/찾을 수 없습니다/.test(answer)) {
                warnEl.style.display = 'block';
                warnEl.textContent = '⚠️ 답변에 출처 표시가 없습니다. 아래 원본 기록과 직접 대조해 확인해주세요.';
            } else {
                warnEl.style.display = 'none';
            }

            const rangeLabel = (from || to) ? ` · 기간 ${from || '처음'} ~ ${to || '지금'}` : '';
            document.getElementById('askLogMeta').textContent = items.length
                ? `검색어: ${terms.join(', ')}${rangeLabel} · 참고한 기록 ${items.length}건`
                : `검색어: ${terms.join(', ') || '(없음)'}${rangeLabel} · 일치하는 기록이 없습니다`;

            const listEl = document.getElementById('askLogSources');
            listEl.innerHTML = items.map((item, i) => {
                const n = i + 1;
                return `<div class="ask-log-source${cited.has(n) ? ' cited' : ''}" id="askLogSource${n}">
                    <div class="ask-log-source-head">
                        <span class="ask-log-source-num">#${n}</span>
                        <span>${escapeHtml(formatAskSourceHeader(item))}</span>
                        <button type="button" class="ai-copy-btn" onclick="openAskLogSource(${i})">열기</button>
                    </div>
                    <div class="ask-log-source-text">${escapeHtml(item.text)}</div>
                </div>`;
            }).join('');
            const sourcesDetails = document.getElementById('askLogSourcesDetails');
            sourcesDetails.style.display = items.length ? '' : 'none';
            sourcesDetails.open = false;

            document.getElementById('askLogResultBlock').style.display = 'block';
        }

        function focusAskLogSource(n) {
            const details = document.getElementById('askLogSourcesDetails');
            details.open = true;
            const el = document.getElementById('askLogSource' + n);
            if (!el) return;
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.remove('flash');
            void el.offsetWidth;
            el.classList.add('flash');
        }

        function openAskLogSource(idx) {
            const item = askLogLastSources[idx];
            if (!item) return;
            if ((item.kind === 'record' || item.kind === 'event') && item.date) {
                jumpToSearchResult(item.date);
            } else if (item.kind === 'maintenance') {
                switchTab('maintenance');
                if (item.refId) openMaintenanceModal(item.refId);
            } else if (item.kind === 'project') {
                switchTab('improvement');
            } else {
                switchTab('notes');
            }
        }

        function copyAskLogAnswer() {
            const text = document.getElementById('askLogAnswer').innerText;
            navigator.clipboard.writeText(text).then(
                () => showAppToast('답변을 복사했습니다', 'success'),
                () => showAppToast('복사하지 못했습니다')
            );
        }
