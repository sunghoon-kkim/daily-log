const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxlH6_fhS_6p7ioSysh9rCSw0LxRCMtRNuhCdTUyG8vR451yW1aptfrlrURqO-Y1kQ/exec";
        // 이 저장소는 공개돼 있어서, 관리자 사번을 프론트에 상수로 박아두면 그대로 노출됨.
        // 그래서 관리자 여부는 로그인/불러오기 응답에 실려오는 isAdmin 플래그(아래 전역 변수)로만
        // 판단하고, 실제 관리자 API 권한 검증은 여전히 서버(Code.gs의 verifyAdmin)가 함

        const COLOR_PALETTE = [
            '#ff6b6b', '#ff9f43', '#feca57', '#1dd1a1',
            '#54a0ff', '#5f27cd', '#ee5a6f'
        ];
        
        // 대한민국 공휴일 (대체공휴일·임시공휴일 포함)
        const KR_HOLIDAYS = {
            // 2025년
            "2025-01-01": "신정",
            "2025-01-28": "설날연휴",
            "2025-01-29": "설날",
            "2025-01-30": "설날연휴",
            "2025-03-01": "삼일절",
            "2025-03-03": "대체공휴일(삼일절)",
            "2025-05-05": "어린이날·부처님오신날",
            "2025-05-06": "대체공휴일",
            "2025-06-06": "현충일",
            "2025-08-15": "광복절",
            "2025-10-03": "개천절",
            "2025-10-05": "추석연휴",
            "2025-10-06": "추석",
            "2025-10-07": "추석연휴",
            "2025-10-08": "대체공휴일(추석)",
            "2025-10-09": "한글날",
            "2025-12-25": "크리스마스",
            // 2026년
            "2026-01-01": "신정",
            "2026-02-16": "설날연휴",
            "2026-02-17": "설날",
            "2026-02-18": "설날연휴",
            "2026-03-01": "삼일절",
            "2026-03-02": "대체공휴일(삼일절)",
            "2026-05-05": "어린이날",
            "2026-05-24": "부처님오신날",
            "2026-05-25": "대체공휴일(부처님오신날)",
            "2026-06-03": "전국동시지방선거",
            "2026-06-06": "현충일",
            "2026-07-17": "제헌절",
            "2026-08-15": "광복절",
            "2026-08-17": "대체공휴일(광복절)",
            "2026-09-24": "추석연휴",
            "2026-09-25": "추석",
            "2026-09-26": "추석연휴",
            "2026-10-03": "개천절",
            "2026-10-05": "대체공휴일(개천절)",
            "2026-10-09": "한글날",
            "2026-12-25": "크리스마스",
            // 2027년
            "2027-01-01": "신정",
            "2027-02-06": "설날연휴",
            "2027-02-07": "설날",
            "2027-02-08": "설날연휴",
            "2027-02-09": "대체공휴일(설날)",
            "2027-03-01": "삼일절",
            "2027-05-05": "어린이날",
            "2027-05-13": "부처님오신날",
            "2027-06-06": "현충일",
            "2027-07-17": "제헌절",
            "2027-08-15": "광복절",
            "2027-08-16": "대체공휴일(광복절)",
            "2027-09-14": "추석연휴",
            "2027-09-15": "추석",
            "2027-09-16": "추석연휴",
            "2027-10-03": "개천절",
            "2027-10-04": "대체공휴일(개천절)",
            "2027-10-09": "한글날",
            "2027-10-11": "대체공휴일(한글날)",
            "2027-12-25": "크리스마스"
        };
        
        let currentDate = new Date();
        let selectedDate = null;
        let records = {};       // { "2026-08-25": { "수처리": "내용" } }
        let categoryImages = {}; // { "2026-08-25": { "수처리": [{url, fileId, width, height}] } } - 활동기록 카테고리 박스에 붙여넣은 이미지
        let events = [];        // [{ id, title, start, end, color }]
        let categories = ['카테고리1', '카테고리2', '카테고리3'];
        // [팀 보고] 탭 상태: 지금 보고 있는 주의 시작일(월요일, "yyyy-MM-dd"), 제출 대상 후보 목록,
        // "이번주 한 일"/"다음주 할 일" 각 줄({id, category, date, content}) - 서버에는 제출할 때만 보냄
        let teamReportCurrentWeekStart = null;
        let teamReportMemberList = []; // [{employeeId, name, role}] - 내 역할에 맞게 서버가 걸러서 내려줌
        let teamReportRows = { thisWeek: [], nextWeek: [] };
        let teamReportRowIdCounter = 0;
        let teamReportSelectedTargets = []; // 지금 체크돼 있는 제출 대상 사번 배열 (여러 명 선택 가능)
        let teamReportLastTargets = []; // 마지막으로 제출했던 대상들 - 다음 주로 넘어갔을 때 기본값으로 이어서 씀
        let teamReportPreviousWeekData = { thisWeek: [], nextWeek: [] }; // 지난주 데이터 캐시 (이전 기록 불러오기 / 자동 이월용)
        let categoryColors = { '카테고리1': '#ff6b6b', '카테고리2': '#ff9f43', '카테고리3': '#54a0ff' }; // 빨강/주황/파랑
        let categoryBoxHeights = {}; // { "수처리": 180 } - 카테고리별 기본값
        let dateCategoryBoxHeights = {}; // { "2026-08-26": { "수처리": 300 } } - 날짜별 개별 지정값 (있으면 기본값보다 우선)
        let hiddenCategoriesByDate = {}; // { "2026-08-26": ["보일러"] } - 그 날짜에 안 쓰는 카테고리 숨김 목록
        let dateCategoryOrder = {}; // { "2026-08-26": ["보일러","수처리","냉동기"] } - 그 날짜에서만 적용되는 카테고리 박스 순서
        let categoryCollapseOverride = {}; // { "2026-08-25::보일러": true/false } - 사용자가 직접 접기/펼치기를 클릭해서 자동 규칙을 덮어쓴 경우 (세션 동안만 유지)
        let categoryDefaultCollapsed = {}; // { "보일러": true } - 카테고리 관리 탭에서 지정한 기본 펼침/접힘 상태 (지난 날짜+내용없음 규칙보다는 우선순위가 낮음)
        let draggedCategoryId = null; // 드래그 중인 카테고리 박스
        let notesContent = '';
        let todoItems = []; // [{ id, text, done }] - 해야 할 일 체크리스트
        let selectedCategoriesForQuery = new Set();
        let queryStartDate = null;
        let queryEndDate = null;
        let editingEventId = null;
        let editingProjectId = null;
        // 팀 공유 버전: 공유 비밀번호 하나 대신, 사번별로 각자 계정을 갖는 방식
        let editUnlocked = false;     // 로그인 여부 (기존 코드 곳곳에서 이 이름으로 "편집 가능 여부"를 참조하고 있어 그대로 유지)
        let currentEmployeeId = '';   // 로그인한 사번
        let currentPasswordHash = ''; // 서버에 매 요청마다 같이 보내는 비밀번호 해시 (평문 비밀번호는 서버로 보내지 않음)
        let currentUserName = '';       // 로그인한 계정의 이름
        let currentUserDepartment = ''; // 로그인한 계정의 소속

        // 사번은 현재 회사 기준 숫자 7자리. 회원가입/계정정보 수정 시 이 규칙으로 검증함
        const EMPLOYEE_ID_PATTERN = /^\d{7}$/;
        const EMPLOYEE_ID_INVALID_MSG = '사번은 숫자 7자리입니다. 7자리보다 짧거나 길면 올바른 사번이 아닙니다.';
        let selectedColor = COLOR_PALETTE[0];
        
        // 탭 관리
        const TAB_LABELS = {
            calendar: '📅 달력 & 활동기록',
            category: '📊 카테고리 관리',
            query: '🔍 검색 & 조회',
            notes: '📝 할일 & 메모',
            ai: '🤖 AI 도우미',
            improvement: '💡 개선/절감 과제',
            trend: '📈 설비 데이터 분석',
            maintenance: '🔧 정비계획',
            waterFlow: '🔀 흐름도',
            teamReport: '📋 팀 보고',
            settings: '⚙️ 환경설정'
        };
        let tabOrder = ['calendar', 'category', 'query', 'notes', 'ai', 'improvement', 'trend', 'maintenance', 'waterFlow', 'teamReport', 'settings'];
        let activeTabId = 'calendar';
        // 환경설정에서 꺼둔(비활성화한) 탭 id 목록. 'settings'는 절대 여기 들어가지 않음(항상 표시)
        let disabledTabIds = [];
        // 개인이 환경설정에 입력해 저장한 본인 Gemini API 키. 공용 키는 없어서 AI 기능은 전부 이 키가 있어야만 동작함
        let personalAiApiKey = '';

        // 관리자가 계정별로(또는 신규 가입 기본값으로) 개별 켜고 끌 수 있는 세부 기능 목록.
        // "사용 가능한 기능 설정"/"신규 가입 기본값" 체크리스트가 전부 이 배열 하나로 만들어지므로,
        // 새 탭이나 탭 안의 새 기능을 추가할 때는 여기에도 그룹/키를 추가해야 그 체크리스트에 바로 나타남
        // (환경설정 탭은 관리자가 끌 수 없는 필수 화면이라 여기 넣지 않음)
        const FEATURE_GROUPS = [
            {
                key: 'calendar',
                label: '📅 달력 & 활동기록',
                features: {
                    activityRecord: '📅 달력 & 활동기록',
                    missingRecordIndicator: '🟥 작성 누락 표시 & 작성률',
                    openIssues: '📋 미결 사항 추적',
                    recordSnippets: '📌 상용구 & 요일 템플릿',
                    recordRevisions: '🕘 수정 이력 & 되돌리기'
                }
            },
            {
                key: 'category',
                label: '⚙️ 카테고리 관리',
                features: {
                    categoryManage: '⚙️ 카테고리 관리'
                }
            },
            {
                key: 'query',
                label: '🔍 검색 & 조회',
                features: {
                    keywordSearch: '🔎 통합 검색',
                    periodQuery: '📆 기간별 카테고리 조회',
                    equipmentTimeline: '🔧 설비별 이력 타임라인',
                    keywordStats: '📊 키워드 발생 통계'
                }
            },
            {
                key: 'notes',
                label: '📝 할일 & 메모',
                features: {
                    todoList: '✅ 해야 할 일',
                    freeNotes: '📝 메모장'
                }
            },
            {
                key: 'ai',
                label: '🤖 AI 도우미',
                features: {
                    dailySummary: '📝 일일 업무 요약',
                    weeklySummary: '🗓️ 이번주 업무 요약',
                    monthlyFeedback: '🤖 AI 월별 피드백',
                    monthlyFeedbackHistory: '🗂️ 월별 피드백 & 평가 이력 관리',
                    goalSetting: '🎯 목표수립'
                }
            },
            {
                key: 'improvement',
                label: '💡 개선/절감 과제',
                features: {
                    savingsProjects: '💡 개선/절감 과제 관리'
                }
            },
            {
                key: 'trend',
                label: '📈 설비 데이터 분석',
                features: {
                    trendAnalysis: '📈 설비 데이터 경향 분석'
                }
            },
            {
                key: 'maintenance',
                label: '🔧 정비계획',
                features: {
                    maintenanceSchedule: '🔧 정비계획 관리'
                }
            },
            {
                key: 'waterFlow',
                label: '🔀 흐름도',
                features: {
                    waterFlowDiagram: '🔀 흐름도'
                }
            },
            {
                key: 'teamReport',
                label: '📋 팀 보고',
                features: {
                    teamReport: '📋 팀 보고'
                }
            }
        ];
        // 위 그룹들을 { 키: 라벨 } 하나로 합친 조회용 맵
        const FEATURE_LABELS = FEATURE_GROUPS.reduce((acc, group) => Object.assign(acc, group.features), {});
        // 계정별 관리자 설정과 무관하게 코드 레벨에서 임시로 꺼두는 기능 키 목록.
        // 목표수립/이번주 업무 요약 임시 비활성화(관련 코드/UI는 그대로 두고 화면에서만 숨김) - 되살리려면 이 배열에서 빼면 됨
        const FORCE_DISABLED_FEATURES = ['goalSetting', 'weeklySummary'];
        // 관리자가 이 계정에서 꺼둔 세부 기능 키 목록 (서버에서 로그인 시 받아옴). 본인은 못 바꾸고 관리자만 조정 가능
        let disabledFeatures = [];
        // 이 계정의 [팀 보고] 계층상 역할 ('', 'member', 'partLead', 'teamLead') - 서버에서 로그인 시
        // 받아온 teamReportRole(없으면 예전 isTeamLead 값)으로 채워짐. computeEffectiveTeamReportRole 참고
        let currentUserTeamReportRole = '';
        // 이 계정이 관리자인지 (로그인/불러오기 응답의 isAdmin 필드로 채워짐). 화면 표시(관리자
        // 전용 화면 진입 등)에만 쓰고, 실제 관리자 권한 검증은 서버가 매 요청마다 다시 함
        let isAdmin = false;

        const DEFAULT_AI_TEMPLATE = `[월간 업무 피드백]

■ 잘한점(한일)

① 월 목표 (Objective)


② 핵심 결과 (KR, Key Result)


③ 실행 전략 및 노력 과정


④ 성과 및 결과


■ 개선/보완할 점(할일)

① 부족했던 점 (한계 인식)


② 개선·보완 계획
`;
        // 메모장도 흐름도처럼 여러 개 만들어 구분해서 쓸 수 있음. freeNotesPages가 실제 저장 단위이고,
        // notesContent는 그중 지금 보고 있는(currentFreeNotesPageId) 메모장의 내용을 담아두는 변수라서,
        // 페이지를 전환/추가/삭제하기 직전마다 syncActiveFreeNotesPageData()로 반영해줘야 함
        let freeNotesPages = []; // [{id, name, content}]
        let currentFreeNotesPageId = null;
        let editingFreeNotesPageId = null; // 이름 변경/삭제 모달에서 대상이 되는 메모장 id
        let aiTemplateContent = '';
        // 계정별 월별 피드백 & 평가 이력. { 'YYYY-MM': {grade, selfGood, selfImprove, receivedGood, receivedImprove, updatedAt} }
        // AI 월별 피드백 생성 시 누적 이력을 참고 컨텍스트로 함께 보내 톤앤매너를 이어가는 데도 쓰임 (buildFeedbackHistoryContextText 참고)
        let monthlyFeedbacks = {};
        let currentFeedbackHistoryMonth = ''; // 지금 [월별 피드백 및 평가 이력] 폼에 보이는 YYYY-MM. 화면 상태값이라 항상 오늘 달로 시작함
        let savingsProjects = []; // [{id, title, month, targetAmount, actualAmount, status, note}] - 에너지/비용절감 과제 트래커
        let trendSubject = ''; // 설비·측정 항목 (매번 같은 값을 다시 적지 않도록 저장)
        let trendSpec = '';    // 관리 기준 (동일)
        let maintenanceSchedule = []; // [{id, equipment, item, sop, cycle, status, lastDone, nextDue, note, ackFor, updatedAt}]
        let editingMaintenanceId = null;
        // 흐름도는 여러 개를 만들어 구분해서 볼 수 있음. waterFlowDiagrams가 실제 저장 단위이고,
        // waterFlowBlocks/waterFlowConnections는 그중 지금 보고 있는(currentWaterFlowDiagramId) 흐름도의
        // blocks/connections 배열을 그대로 가리키는 참조라서, 기존 블록/연결선 관련 코드는 그대로 두고
        // 씀 - 다만 배열을 통째로 새로 만드는(재할당하는) 곳에서는 반드시 저장 직전에 다시 연결해줘야 함
        let waterFlowDiagrams = []; // [{id, name, blocks: [...], connections: [...]}]
        let currentWaterFlowDiagramId = null;
        let waterFlowBlocks = []; // [{id, title, detail, color, x, y, expanded}] - 지금 보고 있는 흐름도의 블록(자유 배치)
        let editingWaterFlowBlockId = null;
        let waterFlowConnections = []; // [{id, from, to}] - 지금 보고 있는 흐름도의 연결선(from → to). 한 블록에서 여러 개로 연결 가능
        let waterFlowConnectSourceId = null; // 지금 연결선을 잇는 중인 출발 블록 id (연결 모드가 아니면 null). 화면 상태값이라 저장하지 않음
        let editingWaterFlowDiagramId = null; // 이름 변경/삭제 모달에서 대상이 되는 흐름도 id
        // 여러 블록이 가로(같은 y) 또는 세로(같은 x)로 정렬돼 있을 때, 그 줄 전체를 한 번에 옮길 수 있게
        // 블록들 뒤에 깔아두는 투명한 드래그 손잡이를 드래그하는 중인 상태. 화면 상태값이라 저장하지 않음
        let waterFlowAlignDragState = null; // { axis: 'row'|'col', keyValue, blockIds, startClientX, startClientY, starts: {id:{x,y}}, moved }
        // 흐름도 캔버스의 현재 화면 이동/확대 상태 (빈 곳 드래그로 이동, 휠로 확대/축소). 뷰포트일 뿐
        // 데이터가 아니라서 저장하지 않고, 탭을 나갔다 들어오거나 새로고침하면 초기 상태로 돌아옴
        let waterFlowViewX = 0, waterFlowViewY = 0, waterFlowViewZoom = 1;
        let maintenanceStatusFilter = '전체'; // 정비계획 목록 상태 필터 (전체/예정/완료/보류). 화면 상태값이라 저장하지 않음
        let maintenanceViewMode = 'detail'; // 정비계획 목록 보기 모드 (detail: 자세히 보기, simple: 간단히 보기). 화면 상태값이라 저장하지 않음
        let savingsStatusFilter = '전체'; // 개선/절감 과제 목록 상태 필터. 화면 상태값이라 저장하지 않음
        let savingsCategoryFilter = '전체'; // 개선/절감 과제 목록 카테고리 필터. 화면 상태값이라 저장하지 않음
        // 보관(아카이브)한 카테고리. 입력 화면(달력 & 활동기록)에서는 빠지지만 records의 과거 내용은
        // 지우지 않고 그대로 두어, 검색/기간 조회/설비 이력/통계에서는 계속 조회되게 함 (getAllRecordCategories 참고)
        let archivedCategories = [];
        let recordSnippets = {};   // { "수처리": ["순회점검 이상 없음", ...] } - 카테고리별 상용구
        let weekdayTemplates = {}; // { "1": { "수처리": "1. 주간점검 ..." } } - 요일(0=일~6=토)별 카테고리 템플릿
        // 날짜·카테고리별 직전 내용 보관함. { "2026-09-25|수처리": [{ ts, v }] } (오래된 것 → 최신 순)
        // 편집 세션 단위(10분)로 한 번만 쌓고, 전체 크기에 상한을 둬서 저장 공간/시트 셀 한도를 넘지 않게 함
        let recordRevisions = {};
        // 서버(Code.gs)가 recordRevisions를 별도 대용량 필드로 저장할 수 있는 버전인지. 구버전 서버에 보내면
        // 프로필 셀(5만자 제한)에 섞여 들어가므로, 서버가 지원한다고 알려준 경우에만 동기화 대상에 포함함
        let serverSupportsRecordRevisions = false;

        // 로그인 성공(자동 로그인 또는 직접 로그인) 후에만 호출됨. 로그인되기 전까지는
        // 이 함수가 아예 실행되지 않으므로, 화면에는 로그인 모달 외에 아무 데이터도 그려지지 않음
        // (이전에 이 브라우저에 남아있던 캐시 데이터가 로그인 전에 잠깐이라도 보이는 걸 방지)
        let appUIInitialized = false;
        async function initAppUI() {
            if (appUIInitialized) return;
            appUIInitialized = true;

            loadRecords();
            loadCategoryImages();
            loadEvents();
            loadCategories();
            loadCategoryColors();
            loadCategoryDefaultCollapsed();
            loadCategoryBoxHeights();
            loadHiddenCategories();
            loadCollapsedUpcomingCards();
            loadTabOrder();
            loadDisabledTabIds();
            loadPersonalAiApiKey();
            loadDisabledFeatures();
            loadRecordHistoryToolsState();
            notesContent = localStorage.getItem('freeNotes') || '';
            const storedFreeNotesPages = localStorage.getItem('freeNotesPages');
            freeNotesPages = storedFreeNotesPages ? safeJsonParse(storedFreeNotesPages, [], 'freeNotesPages') : [];
            currentFreeNotesPageId = localStorage.getItem('currentFreeNotesPageId') || null;
            ensureActiveFreeNotesPage(); // freeNotesPages가 비어있으면 위 notesContent(예전 버전 단일 메모장)를 그대로 살려서 첫 메모장으로 마이그레이션함
            currentUserName = localStorage.getItem('accountName') || '';
            currentUserDepartment = localStorage.getItem('accountDepartment') || '';
            loadTodoItems();
            aiTemplateContent = localStorage.getItem('aiTemplate') || DEFAULT_AI_TEMPLATE;
            const storedMonthlyFeedbacks = localStorage.getItem('monthlyFeedbacks');
            monthlyFeedbacks = storedMonthlyFeedbacks ? safeJsonParse(storedMonthlyFeedbacks, {}, 'monthlyFeedbacks') : {};
            currentFeedbackHistoryMonth = formatDate(new Date()).slice(0, 7);
            const storedProjects = localStorage.getItem('savingsProjects');
            savingsProjects = storedProjects ? safeJsonParse(storedProjects, [], 'savingsProjects') : [];
            trendSubject = localStorage.getItem('trendSubject') || '';
            trendSpec = localStorage.getItem('trendSpec') || '';
            const storedMaintenance = localStorage.getItem('maintenanceSchedule');
            maintenanceSchedule = storedMaintenance ? safeJsonParse(storedMaintenance, [], 'maintenanceSchedule') : [];
            const storedWaterFlowDiagrams = localStorage.getItem('waterFlowDiagrams');
            waterFlowDiagrams = storedWaterFlowDiagrams ? safeJsonParse(storedWaterFlowDiagrams, [], 'waterFlowDiagrams') : [];
            currentWaterFlowDiagramId = localStorage.getItem('currentWaterFlowDiagramId') || null;
            if (waterFlowDiagrams.length === 0) {
                // 예전 버전(흐름도가 하나뿐이던 시절)에 저장해둔 블록/연결선이 있으면 그대로 살려서 마이그레이션함
                const storedWaterFlowBlocks = localStorage.getItem('waterFlowBlocks');
                const storedWaterFlowConnections = localStorage.getItem('waterFlowConnections');
                waterFlowBlocks = storedWaterFlowBlocks ? safeJsonParse(storedWaterFlowBlocks, [], 'waterFlowBlocks') : [];
                waterFlowConnections = storedWaterFlowConnections ? safeJsonParse(storedWaterFlowConnections, [], 'waterFlowConnections') : [];
            }
            ensureActiveWaterFlowDiagram();

            renderTabs();
            renderCategories();
            renderCategorySelector();
            renderColorPicker();
            renderCalendar();
            goToday();
            applyNotesContent();
            setupNotesAutosave();
            applyAITemplate();
            setupAITemplateAutosave();
            renderGoalAreas();
            renderFeedbackHistoryForm();
            renderSavingsProjects();
            applyTrendSettings();
            setupTrendSettingsAutosave();
            renderMaintenanceSchedule();
            renderWaterFlowDiagramTabs();
            renderWaterFlowCanvas();
            renderSettingsTab();
            applyFeatureRestrictions();
            setupNotesSplitResizer();
            startLiveClock();

            const today = new Date();
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            document.getElementById('startDate').value = formatDate(firstDay);
            document.getElementById('endDate').value = formatDate(lastDay);
            document.getElementById('aiStartDate').value = formatDate(firstDay);
            document.getElementById('aiEndDate').value = formatDate(lastDay);
            document.getElementById('dailySummaryDate').value = formatDate(today);
            document.getElementById('goalRefStartDate').value = formatDate(firstDay);
            document.getElementById('goalRefEndDate').value = formatDate(today);
        }

        function init() {
            applyThemeButtonLabel(); // <head>의 조기 스크립트가 이미 dark-mode 클래스를 적용해뒀으므로 버튼 표시만 맞춰줌
            setupGlobalEditLockInterceptor();
            setupModalDismissHandlers();
            setupWaterFlowUndoRedoShortcut();
            document.addEventListener('click', function (e) {
                if (!e.target.closest('.admin-more-wrap')) closeAllAdminMoreMenus();
            });

            // 와이파이가 불안정한 현장에서 저장이 몇 번 실패해도, 인터넷이 다시 연결되는 순간
            // 자동으로 재동기화를 시도함(로그인 전이거나 아직 서버 데이터를 못 받아온 상태면
            // queueSync 안에서 알아서 무시됨)
            window.addEventListener('online', () => queueSync());

            loadTeamReportParts(); // 회원가입 모달의 소속(파트) 선택지를 채우기 위해 로그인 전에도 불러옴

            // 홈페이지에 접속하면 항상 로그아웃 상태로 시작: 로그인 모달만 띄워두고 홈페이지
            // 내용은 그리지 않음 (로그인/회원가입 성공 시 그 안에서 initAppUI/loadAllFromServer로 이어짐)
            resetToLoggedOutState();
        }
        
        // ===== 저장/로드 (로컬 캐시) =====
        // localStorage에 손상된 값이 하나 있어도 앱 전체 초기화가 멈추지 않도록
        // JSON.parse 실패 시 대체값을 반환한다.
        function safeJsonParse(str, fallback, label) {
            let parsed;
            try {
                parsed = JSON.parse(str);
            } catch (e) {
                console.warn('localStorage 데이터를 불러오지 못했습니다' + (label ? ` (${label})` : '') + ':', e);
                return fallback;
            }
            // 파싱은 성공했지만 기대한 것과 다른 형태(예: 배열이어야 하는데 객체/숫자 등)면
            // 호출부에서 .filter()/new Set() 등을 쓸 때 그대로 예외가 나서 초기화 전체가
            // 멈출 수 있으므로, fallback과 같은 형태(배열/객체)인지 확인 후 아니면 fallback으로 대체
            const expectArray = Array.isArray(fallback);
            const expectPlainObject = !expectArray && fallback && typeof fallback === 'object';
            const gotArray = Array.isArray(parsed);
            const gotPlainObject = !gotArray && parsed && typeof parsed === 'object';
            if ((expectArray && !gotArray) || (expectPlainObject && !gotPlainObject)) {
                console.warn('localStorage 데이터 형식이 올바르지 않습니다' + (label ? ` (${label})` : '') + ':', parsed);
                return fallback;
            }
            return parsed;
        }

        // localStorage 용량(보통 5MB)이 base64 이미지 등으로 꽉 차면 setItem이 QuotaExceededError를
        // 던지는데, 이게 그대로 올라가면 뒤이은 queueSync()(서버 저장)나 화면 갱신까지 통째로 건너뛰게 됨.
        // 로컬 캐시는 서버 데이터의 사본일 뿐이므로 실패해도 경고만 남기고 흐름은 계속 진행시킨다.
        let localStorageQuotaWarned = false;
        function safeSetItem(key, value) {
            try {
                localStorage.setItem(key, value);
                return true;
            } catch (e) {
                console.warn(`localStorage 저장 실패 (${key}):`, e);
                if (!localStorageQuotaWarned) {
                    localStorageQuotaWarned = true; // 같은 경고가 연달아 뜨지 않도록 세션당 한 번만 알림
                    try { showStatus('⚠️ 기기 저장 공간이 부족해 로컬 캐시 저장에 실패했습니다 (서버 저장은 계속 진행됩니다)', 'error'); } catch (_) { /* 무시 */ }
                }
                return false;
            }
        }

        function loadRecords() {
            const stored = localStorage.getItem('activityRecords');
            records = stored ? safeJsonParse(stored, {}, 'activityRecords') : {};
        }

        function loadCategoryImages() {
            const stored = localStorage.getItem('categoryImages');
            categoryImages = stored ? safeJsonParse(stored, {}, 'categoryImages') : {};
        }

        function saveCategoryImagesToStorage() {
            safeSetItem('categoryImages', JSON.stringify(categoryImages));
            queueSync();
        }

        function loadEvents() {
            const stored = localStorage.getItem('calendarEvents');
            events = stored ? safeJsonParse(stored, [], 'calendarEvents') : [];
        }

        function loadCategories() {
            const stored = localStorage.getItem('activityCategories');
            if (stored) categories = safeJsonParse(stored, categories, 'activityCategories');
        }

        function loadCategoryColors() {
            const stored = localStorage.getItem('categoryColors');
            categoryColors = stored ? safeJsonParse(stored, {}, 'categoryColors') : {};
            
            // 색상이 없는 카테고리는 팔레트에서 순서대로 배정
            let paletteIndex = 0;
            for (const category of categories) {
                if (!categoryColors[category]) {
                    categoryColors[category] = COLOR_PALETTE[paletteIndex % COLOR_PALETTE.length];
                    paletteIndex++;
                }
            }
        }
        
        function loadCategoryDefaultCollapsed() {
            const stored = localStorage.getItem('categoryDefaultCollapsed');
            categoryDefaultCollapsed = stored ? safeJsonParse(stored, {}, 'categoryDefaultCollapsed') : {};
        }

        function loadCategoryBoxHeights() {
            const stored = localStorage.getItem('categoryBoxHeights');
            categoryBoxHeights = stored ? safeJsonParse(stored, {}, 'categoryBoxHeights') : {};

            const storedDate = localStorage.getItem('dateCategoryBoxHeights');
            dateCategoryBoxHeights = storedDate ? safeJsonParse(storedDate, {}, 'dateCategoryBoxHeights') : {};
        }

        function loadHiddenCategories() {
            const stored = localStorage.getItem('hiddenCategoriesByDate');
            hiddenCategoriesByDate = stored ? safeJsonParse(stored, {}, 'hiddenCategoriesByDate') : {};

            const storedOrder = localStorage.getItem('dateCategoryOrder');
            dateCategoryOrder = storedOrder ? safeJsonParse(storedOrder, {}, 'dateCategoryOrder') : {};
        }

        function loadCollapsedUpcomingCards() {
            const stored = localStorage.getItem('collapsedUpcomingCardIds');
            collapsedUpcomingCardIds = new Set(stored ? safeJsonParse(stored, [], 'collapsedUpcomingCardIds') : []);
        }
        
        // 저장된 탭 순서에 모든 탭이 포함되어 있는지 확인하고 빠진 탭(예: 새로 추가된 AI 탭)을 채워 넣음
        function reconcileTabOrder(order) {
            const allTabs = Object.keys(TAB_LABELS);
            const valid = (order || []).filter(id => allTabs.includes(id));
            for (const id of allTabs) {
                if (!valid.includes(id)) valid.push(id);
            }
            return valid;
        }
        
        function loadTabOrder() {
            const stored = localStorage.getItem('tabOrder');
            if (stored) {
                tabOrder = reconcileTabOrder(safeJsonParse(stored, [], 'tabOrder'));
            }
        }

        function loadDisabledTabIds() {
            const stored = localStorage.getItem('disabledTabIds');
            disabledTabIds = stored ? safeJsonParse(stored, [], 'disabledTabIds').filter(id => id !== 'settings') : [];
        }

        function loadPersonalAiApiKey() {
            personalAiApiKey = localStorage.getItem('personalAiApiKey') || '';
        }

        function loadDisabledFeatures() {
            const stored = localStorage.getItem('disabledFeatures');
            disabledFeatures = stored ? safeJsonParse(stored, [], 'disabledFeatures') : [];
        }

        function loadRecordHistoryToolsState() {
            const storedArchived = localStorage.getItem('archivedCategories');
            archivedCategories = storedArchived ? safeJsonParse(storedArchived, [], 'archivedCategories').filter(c => typeof c === 'string') : [];
            const storedSnippets = localStorage.getItem('recordSnippets');
            recordSnippets = storedSnippets ? safeJsonParse(storedSnippets, {}, 'recordSnippets') : {};
            const storedTemplates = localStorage.getItem('weekdayTemplates');
            weekdayTemplates = storedTemplates ? safeJsonParse(storedTemplates, {}, 'weekdayTemplates') : {};
            const storedRevisions = localStorage.getItem('recordRevisions');
            recordRevisions = storedRevisions ? safeJsonParse(storedRevisions, {}, 'recordRevisions') : {};
        }

        function saveArchivedCategoriesToStorage() {
            safeSetItem('archivedCategories', JSON.stringify(archivedCategories));
            queueSync();
        }

        function saveRecordSnippetsToStorage() {
            safeSetItem('recordSnippets', JSON.stringify(recordSnippets));
            safeSetItem('weekdayTemplates', JSON.stringify(weekdayTemplates));
            queueSync();
        }

        // 입력 화면에 쓰는 활성 카테고리 + 보관한 카테고리. 과거 이력을 읽는 곳(검색/조회/통계/설비 이력/
        // 작성 누락 판단)은 반드시 이걸 써야 보관한 카테고리의 기록까지 빠짐없이 조회됨
        function getAllRecordCategories() {
            return categories.concat(archivedCategories.filter(c => !categories.includes(c)));
        }

        // 이 날짜에 (보관 카테고리 포함) 무엇이든 적어둔 내용이 있는지
        function hasAnyRecordContent(dateStr) {
            const rec = records[dateStr];
            if (!rec) return false;
            return Object.keys(rec).some(c => typeof rec[c] === 'string' && rec[c].trim() !== '');
        }

        const RECORD_REVISION_SESSION_MS = 10 * 60 * 1000; // 이 시간 안에 이어진 수정은 한 번의 편집으로 보고 직전 내용을 한 번만 보관
        const RECORD_REVISION_MAX_PER_KEY = 5;
        const RECORD_REVISION_MAX_TOTAL_CHARS = 20000;

        // records[dateStr][category]를 새 값으로 덮어쓰기 "직전"에 호출해서 이전 내용을 보관함.
        // force=true면 편집 세션 규칙과 관계없이 무조건 보관(되돌리기 직전의 현재 내용 등)
        function pushRecordRevision(dateStr, category, oldValue, force) {
            if (!dateStr || !category) return;
            if (typeof oldValue !== 'string' || oldValue.trim() === '') return;
            const key = dateStr + '|' + category;
            const list = Array.isArray(recordRevisions[key]) ? recordRevisions[key] : [];
            const last = list[list.length - 1];
            const now = Date.now();
            if (last && last.v === oldValue) return;
            if (!force && last && now - (last.ts || 0) < RECORD_REVISION_SESSION_MS) return;
            list.push({ ts: now, v: oldValue });
            while (list.length > RECORD_REVISION_MAX_PER_KEY) list.shift();
            recordRevisions[key] = list;
            trimRecordRevisionsToLimit();
            safeSetItem('recordRevisions', JSON.stringify(recordRevisions));
        }

        // 전체 크기가 상한을 넘으면 가장 오래된 보관본부터 지움
        function trimRecordRevisionsToLimit() {
            let size = JSON.stringify(recordRevisions).length;
            if (size <= RECORD_REVISION_MAX_TOTAL_CHARS) return;
            const all = [];
            for (const key in recordRevisions) {
                (recordRevisions[key] || []).forEach(entry => all.push({ key, entry }));
            }
            all.sort((a, b) => (a.entry.ts || 0) - (b.entry.ts || 0));
            for (const { key, entry } of all) {
                if (size <= RECORD_REVISION_MAX_TOTAL_CHARS) break;
                const list = recordRevisions[key];
                const idx = list.indexOf(entry);
                if (idx !== -1) list.splice(idx, 1);
                if (list.length === 0) delete recordRevisions[key];
                size -= JSON.stringify(entry).length + key.length;
            }
        }

        // 관리자가 계정별로 꺼둔 기능이거나, 코드 레벨에서 강제로 꺼둔(FORCE_DISABLED_FEATURES) 기능이면 true
        function isFeatureDisabled(key) {
            return disabledFeatures.includes(key) || FORCE_DISABLED_FEATURES.includes(key);
        }

        // 관리자가 꺼둔 세부 기능 블록들을 화면에서 숨기고, 탭별로 전부 꺼져있으면 안내 문구를 보여줌
        function applyFeatureRestrictions() {
            document.querySelectorAll('[data-feature]').forEach(el => {
                el.style.display = isFeatureDisabled(el.dataset.feature) ? 'none' : '';
            });

            FEATURE_GROUPS.forEach(group => {
                const keys = Object.keys(group.features);
                const allHidden = keys.every(key => isFeatureDisabled(key));
                const msgEl = document.querySelector(`[data-empty-message-group="${group.key}"]`);
                if (msgEl) msgEl.style.display = allHidden ? 'block' : 'none';
            });

            // 메모장 탭: 할일/메모 둘 다 보일 때만 사이 구분선을 표시
            const notesDivider = document.getElementById('notesSplitDivider');
            if (notesDivider) {
                const bothVisible = !disabledFeatures.includes('todoList') && !disabledFeatures.includes('freeNotes');
                notesDivider.style.display = bothVisible ? '' : 'none';
            }

            applyPersonalApiKeyGate();
        }

        // 공용 API 키가 없으므로, 개인 AI API 키를 설정하지 않았으면 AI 도우미(일일 업무 요약/
        // 월별 피드백 요약/목표수립)와 설비 데이터 분석 버튼을 전부 막고 환경설정에서 키를 넣으라는 안내를 보여줌
        function applyPersonalApiKeyGate() {
            const hasKey = !!personalAiApiKey;

            const aiMsgEl = document.getElementById('aiApiKeyMissingMsg');
            if (aiMsgEl) aiMsgEl.style.display = hasKey ? 'none' : 'block';

            const trendMsgEl = document.getElementById('trendApiKeyMissingMsg');
            if (trendMsgEl) trendMsgEl.style.display = hasKey ? 'none' : 'block';

            ['dailySummaryBtn', 'weeklySummaryBtn', 'aiGenerateBtn', 'aiReviseBtn', 'trendAnalyzeBtn', 'trendReviseBtn'].forEach(id => {
                const btn = document.getElementById(id);
                if (btn) btn.disabled = !hasKey;
            });

            ['dailySummaryDate', 'aiStartDate', 'aiEndDate', 'aiTemplateTextarea', 'goalRefStartDate', 'goalRefEndDate'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = !hasKey;
            });

            document.querySelectorAll('.goal-generate-btn, .goal-revise-btn, .goal-note-textarea, .goal-revise-input').forEach(el => {
                el.disabled = !hasKey;
            });

            // 일일 업무 요약 / 이번주 업무 요약 / AI 월별 피드백 요약 / 목표수립 박스는 키가 없으면 화면 전체를 흐리게 표시
            document.querySelectorAll('[data-feature="dailySummary"], [data-feature="weeklySummary"], [data-feature="monthlyFeedback"], [data-feature="goalSetting"]').forEach(el => {
                el.classList.toggle('ai-feature-locked', !hasKey);
            });
        }

        function saveRecordsToStorage() {
            safeSetItem('activityRecords', JSON.stringify(records));
            queueSync();
        }
        
        function saveEventsToStorage() {
            safeSetItem('calendarEvents', JSON.stringify(events));
            queueSync();
        }
        
        function saveCategoriesToStorage() {
            safeSetItem('activityCategories', JSON.stringify(categories));
            queueSync();
        }
        
        function saveCategoryColorsToStorage() {
            safeSetItem('categoryColors', JSON.stringify(categoryColors));
            queueSync();
        }
        
        function saveCategoryDefaultCollapsedToStorage() {
            safeSetItem('categoryDefaultCollapsed', JSON.stringify(categoryDefaultCollapsed));
            queueSync();
        }

        function saveCategoryBoxHeightsToStorage() {
            safeSetItem('categoryBoxHeights', JSON.stringify(categoryBoxHeights));
            queueSync();
        }
        
        function saveDateCategoryBoxHeightsToStorage() {
            safeSetItem('dateCategoryBoxHeights', JSON.stringify(dateCategoryBoxHeights));
            queueSync();
        }
        
        function saveHiddenCategoriesToStorage() {
            safeSetItem('hiddenCategoriesByDate', JSON.stringify(hiddenCategoriesByDate));
            queueSync();
        }
        
        function saveDateCategoryOrderToStorage() {
            safeSetItem('dateCategoryOrder', JSON.stringify(dateCategoryOrder));
            queueSync();
        }
        
        function saveTabOrderToStorage() {
            safeSetItem('tabOrder', JSON.stringify(tabOrder));
            queueSync();
        }

        function saveDisabledTabIdsToStorage() {
            safeSetItem('disabledTabIds', JSON.stringify(disabledTabIds));
            queueSync();
        }

        function savePersonalAiApiKeyToStorage() {
            safeSetItem('personalAiApiKey', personalAiApiKey);
            queueSync();
        }

        function saveCollapsedUpcomingCardsToStorage() {
            safeSetItem('collapsedUpcomingCardIds', JSON.stringify(Array.from(collapsedUpcomingCardIds)));
            queueSync();
        }
        
        // ===== Google Sheets 동기화 =====
        function getFullState() {
            syncActiveWaterFlowDiagramData(); // 지금 보고 있는 흐름도의 최신 블록/연결선을 waterFlowDiagrams에 반영해둠
            syncActiveFreeNotesPageData(); // 지금 보고 있는 메모장의 최신 내용을 freeNotesPages에 반영해둠
            const state = {
                employeeId: currentEmployeeId,
                passwordHash: currentPasswordHash,
                name: currentUserName,
                department: currentUserDepartment,
                records,
                categoryImages,
                events,
                categories,
                categoryColors,
                categoryDefaultCollapsed,
                categoryBoxHeights,
                dateCategoryBoxHeights,
                hiddenCategoriesByDate,
                dateCategoryOrder,
                collapsedUpcomingCardIds: Array.from(collapsedUpcomingCardIds),
                tabOrder,
                disabledTabIds,
                aiApiKey: personalAiApiKey,
                disabledFeatures,
                freeNotesPages,
                currentFreeNotesPageId,
                todo: todoItems,
                aiTemplate: aiTemplateContent,
                monthlyFeedbacks,
                savingsProjects,
                trendSubject,
                trendSpec,
                maintenanceSchedule,
                waterFlowDiagrams,
                currentWaterFlowDiagramId,
                archivedCategories,
                recordSnippets,
                weekdayTemplates
            };
            if (serverSupportsRecordRevisions) state.recordRevisions = recordRevisions;
            return state;
        }

        function cacheAllToLocalStorage() {
            safeSetItem('activityRecords', JSON.stringify(records));
            safeSetItem('categoryImages', JSON.stringify(categoryImages));
            safeSetItem('calendarEvents', JSON.stringify(events));
            safeSetItem('activityCategories', JSON.stringify(categories));
            safeSetItem('categoryColors', JSON.stringify(categoryColors));
            safeSetItem('categoryDefaultCollapsed', JSON.stringify(categoryDefaultCollapsed));
            safeSetItem('categoryBoxHeights', JSON.stringify(categoryBoxHeights));
            safeSetItem('dateCategoryBoxHeights', JSON.stringify(dateCategoryBoxHeights));
            safeSetItem('hiddenCategoriesByDate', JSON.stringify(hiddenCategoriesByDate));
            safeSetItem('dateCategoryOrder', JSON.stringify(dateCategoryOrder));
            safeSetItem('collapsedUpcomingCardIds', JSON.stringify(Array.from(collapsedUpcomingCardIds)));
            safeSetItem('tabOrder', JSON.stringify(tabOrder));
            safeSetItem('disabledTabIds', JSON.stringify(disabledTabIds));
            safeSetItem('personalAiApiKey', personalAiApiKey);
            safeSetItem('disabledFeatures', JSON.stringify(disabledFeatures));
            syncActiveFreeNotesPageData();
            safeSetItem('freeNotesPages', JSON.stringify(freeNotesPages));
            safeSetItem('currentFreeNotesPageId', currentFreeNotesPageId || '');
            safeSetItem('todoItems', JSON.stringify(todoItems));
            safeSetItem('aiTemplate', aiTemplateContent);
            safeSetItem('monthlyFeedbacks', JSON.stringify(monthlyFeedbacks));
            safeSetItem('savingsProjects', JSON.stringify(savingsProjects));
            safeSetItem('trendSubject', trendSubject);
            safeSetItem('trendSpec', trendSpec);
            safeSetItem('maintenanceSchedule', JSON.stringify(maintenanceSchedule));
            syncActiveWaterFlowDiagramData();
            safeSetItem('waterFlowDiagrams', JSON.stringify(waterFlowDiagrams));
            safeSetItem('currentWaterFlowDiagramId', currentWaterFlowDiagramId || '');
            safeSetItem('accountName', currentUserName);
            safeSetItem('accountDepartment', currentUserDepartment);
            safeSetItem('archivedCategories', JSON.stringify(archivedCategories));
            safeSetItem('recordSnippets', JSON.stringify(recordSnippets));
            safeSetItem('weekdayTemplates', JSON.stringify(weekdayTemplates));
            safeSetItem('recordRevisions', JSON.stringify(recordRevisions));
        }

        // 이 기기가 서버에서 최신 데이터를 완전히 받아오기 전까지는 절대 로컬(오래됐을 수 있는) 데이터를
        // 서버로 올려보내지 않도록 막는 안전장치. 이게 없으면, 예를 들어 폰에서 앱을 열었을 때
        // "로컬 캐시 먼저 표시 → 서버 최신 데이터로 덮어쓰기" 사이의 짧은 순간에 뭔가 저장이 트리거되면
        // 폰의 오래된 데이터가 먼저 서버로 올라가서 다른 기기(PC 등)에서 방금 쓴 최신 내용을 덮어써버리는
        // 사고가 날 수 있음 (실제로 발생했던 데이터 유실 원인)
        let initialLoadDone = false;

        // 신규 가입 시 기본으로 채워주는 카테고리 3개(빨강/주황/파랑) - 사람마다 필요한 카테고리가
        // 다르므로 이름/색은 언제든 카테고리 관리 탭에서 자유롭게 바꾸거나 지울 수 있음
        const DEFAULT_CATEGORIES = ['카테고리1', '카테고리2', '카테고리3'];
        const DEFAULT_CATEGORY_COLORS = { '카테고리1': '#ff6b6b', '카테고리2': '#ff9f43', '카테고리3': '#54a0ff' };

        // 로드가 실패한 채로 끝나면 아래 finally에서 initialLoadDone이 true가 되어 저장이 풀리는데,
        // 이때 records가 로컬에 빈 상태([]/캐시 없음)로 남아있으면 다음 자동저장이 서버의 실제 기록을
        // 빈 값으로 덮어쓰려는 요청이 되어버릴 수 있음. 그런 일이 일시적인 네트워크 문제 때문에 생기지
        // 않도록, 저장 재시도(syncToServer)와 같은 방식으로 이 요청도 몇 번 재시도한 뒤에만 포기함
        const LOAD_RETRY_DELAYS_MS = [1000, 3000];
        async function fetchLoadDataWithRetry() {
            for (let attempt = 0; attempt <= LOAD_RETRY_DELAYS_MS.length; attempt++) {
                try {
                    const url = GOOGLE_APPS_SCRIPT_URL + '?action=load'
                        + '&employeeId=' + encodeURIComponent(currentEmployeeId)
                        + '&passwordHash=' + encodeURIComponent(currentPasswordHash)
                        + '&_=' + Date.now(); // 브라우저가 동일한 GET 요청 결과를 캐시해 예전 응답(예: "등록되지 않은 사번")을 계속 보여주는 걸 막기 위한 캐시버스터
                    const res = await fetch(url, { cache: 'no-store' });
                    if (!res.ok) throw new Error('응답 오류');
                    return await res.json();
                } catch (err) {
                    if (attempt === LOAD_RETRY_DELAYS_MS.length) throw err;
                    await new Promise(r => setTimeout(r, LOAD_RETRY_DELAYS_MS[attempt]));
                }
            }
        }

        // preloadedData가 있으면(예: 로그인 직후 이미 action=login 응답으로 프로필+records를
        // 함께 받아둔 경우) 네트워크 요청을 또 보내지 않고 그 데이터를 그대로 씀. GAS 요청 자체가
        // 느려서, 로그인 때 이미 받은 데이터를 여기서 또 요청하면 로그인마다 똑같은 왕복을 두 번
        // 하게 되어 체감 지연이 두 배가 됨.
        async function loadAllFromServer(preloadedData) {
            if (!currentEmployeeId || !currentPasswordHash) return; // 로그인 전에는 불러올 대상이 없음

            showSyncStatus('☁️ 불러오는 중...', 'syncing');
            try {
                const data = preloadedData ? preloadedData : await fetchLoadDataWithRetry();

                if (data && data.status === 'error') {
                    // 로그인이 만료됐거나 비밀번호가 서버에서 바뀐 경우 등 - 다시 로그인하도록 함
                    showSyncStatus('⚠️ ' + (data.message || '인증 오류'), 'error');
                    logout();
                    return;
                }

                // data가 유효한 객체면 그대로 반영. 신규 계정은 서버가 "{}"를 주므로 필드가 다 비어있을 수
                // 있는데, 이 경우 예전(다른 사람 것이었을 수도 있는) 로컬 캐시가 아니라 기본값으로 리셋해야 함
                if (data && typeof data === 'object') {
                    currentUserName = (typeof data.name === 'string') ? data.name : '';
                    currentUserDepartment = (typeof data.department === 'string') ? data.department : '';
                    records = data.records || {};
                    categoryImages = (data.categoryImages && typeof data.categoryImages === 'object') ? data.categoryImages : {};
                    events = data.events || [];
                    // 서버에 카테고리가 하나도 없는 신규 계정일 때만 기본 카테고리+색을 함께 채움.
                    // 이미 카테고리가 있는 계정은 색 정보가 비어있어도 기본색으로 덮어쓰지 않음
                    const isBrandNewAccountCategories = !(data.categories && data.categories.length);
                    categories = isBrandNewAccountCategories ? DEFAULT_CATEGORIES.slice() : data.categories;
                    categoryColors = isBrandNewAccountCategories ? Object.assign({}, DEFAULT_CATEGORY_COLORS) : (data.categoryColors || {});
                    categoryDefaultCollapsed = (data.categoryDefaultCollapsed && typeof data.categoryDefaultCollapsed === 'object') ? data.categoryDefaultCollapsed : {};
                    categoryBoxHeights = data.categoryBoxHeights || {};
                    dateCategoryBoxHeights = data.dateCategoryBoxHeights || {};
                    hiddenCategoriesByDate = data.hiddenCategoriesByDate || {};
                    dateCategoryOrder = data.dateCategoryOrder || {};
                    collapsedUpcomingCardIds = new Set(Array.isArray(data.collapsedUpcomingCardIds) ? data.collapsedUpcomingCardIds : []);
                    tabOrder = (data.tabOrder && data.tabOrder.length) ? reconcileTabOrder(data.tabOrder) : reconcileTabOrder([]);
                    disabledTabIds = Array.isArray(data.disabledTabIds) ? data.disabledTabIds.filter(id => id !== 'settings') : [];
                    personalAiApiKey = (typeof data.aiApiKey === 'string') ? data.aiApiKey : '';
                    disabledFeatures = Array.isArray(data.disabledFeatures) ? data.disabledFeatures : [];
                    currentUserTeamReportRole = computeEffectiveTeamReportRole(data);
                    freeNotesPages = Array.isArray(data.freeNotesPages) ? data.freeNotesPages : [];
                    currentFreeNotesPageId = data.currentFreeNotesPageId || null;
                    if (freeNotesPages.length === 0) {
                        // 예전 버전(메모장이 하나뿐이던 시절) 계정에서 넘어온 데이터를 그대로 살려서 마이그레이션함
                        notesContent = (typeof data.notes === 'string') ? data.notes : '';
                    }
                    ensureActiveFreeNotesPage();
                    if (Array.isArray(data.todo)) {
                        todoItems = data.todo;
                    } else if (typeof data.todo === 'string' && data.todo) {
                        todoItems = migrateTodoTextToItems(data.todo); // 예전 버전(자유 텍스트 메모)과의 호환
                    } else {
                        todoItems = [];
                    }
                    aiTemplateContent = (typeof data.aiTemplate === 'string' && data.aiTemplate) ? data.aiTemplate : DEFAULT_AI_TEMPLATE;
                    monthlyFeedbacks = (data.monthlyFeedbacks && typeof data.monthlyFeedbacks === 'object' && !Array.isArray(data.monthlyFeedbacks)) ? data.monthlyFeedbacks : {};
                    savingsProjects = Array.isArray(data.savingsProjects) ? data.savingsProjects : [];
                    trendSubject = (typeof data.trendSubject === 'string') ? data.trendSubject : '';
                    trendSpec = (typeof data.trendSpec === 'string') ? data.trendSpec : '';
                    maintenanceSchedule = Array.isArray(data.maintenanceSchedule) ? data.maintenanceSchedule : [];
                    waterFlowDiagrams = Array.isArray(data.waterFlowDiagrams) ? data.waterFlowDiagrams : [];
                    currentWaterFlowDiagramId = data.currentWaterFlowDiagramId || null;
                    if (waterFlowDiagrams.length === 0) {
                        // 예전 버전(흐름도가 하나뿐이던 시절) 계정에서 넘어온 데이터를 그대로 살려서 마이그레이션함
                        waterFlowBlocks = Array.isArray(data.waterFlowBlocks) ? data.waterFlowBlocks : [];
                        waterFlowConnections = Array.isArray(data.waterFlowConnections) ? data.waterFlowConnections : [];
                    }
                    ensureActiveWaterFlowDiagram();
                    archivedCategories = Array.isArray(data.archivedCategories)
                        ? data.archivedCategories.filter(c => typeof c === 'string' && !categories.includes(c))
                        : [];
                    recordSnippets = (data.recordSnippets && typeof data.recordSnippets === 'object' && !Array.isArray(data.recordSnippets)) ? data.recordSnippets : {};
                    weekdayTemplates = (data.weekdayTemplates && typeof data.weekdayTemplates === 'object' && !Array.isArray(data.weekdayTemplates)) ? data.weekdayTemplates : {};
                    // 서버가 수정 이력을 대용량 필드로 따로 저장할 수 있는 버전이면 그때부터 동기화함.
                    // 서버에 아직 이력이 없으면(구버전 서버 사용 중이던 기간) 이 기기에 쌓아둔 로컬 이력을 그대로 유지
                    serverSupportsRecordRevisions = Array.isArray(data.largeFieldKeys) && data.largeFieldKeys.includes('recordRevisions');
                    if (data.recordRevisions && typeof data.recordRevisions === 'object' && !Array.isArray(data.recordRevisions)) {
                        recordRevisions = data.recordRevisions;
                    }

                    cacheAllToLocalStorage();

                    renderTabs();
                    renderCategories();
                    renderCategorySelector();
                    renderCalendar();
                    applyNotesContent();
                    applyAITemplate();
                    if (typeof renderSettingsTab === 'function') renderSettingsTab();
                    applyFeatureRestrictions();
                    if (selectedDate) renderRecordForm();
                    if (typeof renderFeedbackHistoryForm === 'function') renderFeedbackHistoryForm();
                    if (typeof renderSavingsProjects === 'function') renderSavingsProjects();
                    if (typeof applyTrendSettings === 'function') applyTrendSettings();
                    if (typeof renderMaintenanceSchedule === 'function') renderMaintenanceSchedule();
                    if (typeof renderWaterFlowDiagramTabs === 'function') renderWaterFlowDiagramTabs();
                    if (typeof renderWaterFlowCanvas === 'function') renderWaterFlowCanvas();
                    applyEditLockUI(); // 방금 받아온 이름을 상단 계정 표시에 반영
                }

                showSyncStatus('☁️ 동기화됨', 'ok');
            } catch (err) {
                console.error('서버에서 불러오기 실패:', err);
                showSyncStatus('⚠️ 서버 연결 실패 (로컬 데이터 사용 중)', 'error');
            } finally {
                // 성공하든 실패하든, 첫 로드 시도는 끝난 것이므로 이제부터는 저장을 허용함
                initialLoadDone = true;
            }
        }

        let syncTimeout = null;
        function queueSync() {
            if (!initialLoadDone) return; // 서버 최신 데이터를 아직 다 못 받아온 상태에서는 저장 자체를 하지 않음
            if (!currentEmployeeId) return; // 로그인 전에는 저장할 계정 자체가 없음
            clearTimeout(syncTimeout);
            showSyncStatus('☁️ 저장 대기 중...', 'syncing');
            syncTimeout = setTimeout(syncToServer, 800);
        }
        
        // 다른 사람의 저장과 겹쳐서 서버 락 대기 시간(30초)을 넘겼거나 네트워크가 잠깐 끊긴
        // 경우처럼 "다시 시도하면 될 수도 있는" 실패만 재시도함. 몇 초 뒤 재시도, 그래도 안 되면
        // 조금 더 기다렸다가 마지막으로 한 번 더 시도(총 3번). 비밀번호 불일치처럼 다시 시도해도
        // 똑같이 실패할 거부는 재시도하지 않고 바로 사용자에게 알림
        //
        // "기존에 기록이 있었는데 갑자기 비어있는" 빈 데이터 안전장치는 서버(handleSaveState)가
        // 판단함 - 예전에는 이 판단을 클라이언트(이 세션에서 기록을 한 번이라도 봤는지)에서도
        // 이중으로 해서 저장 자체를 아예 안 보냈는데, 그 클라이언트 쪽 플래그가 새로고침 전까지
        // 계속 true로 남아있어서 한 번 걸리면 할 일/메모/카테고리 순서 같은 무관한 변경사항까지
        // 이후 모든 저장이 조용히 막혀버리는 문제가 있었음. 서버는 매 요청마다 실제 저장된 값과
        // 비교해서 판단하므로 훨씬 더 정확하고, 활동기록만 보류하고 나머지는 저장해주므로
        // 클라이언트는 그냥 매번 보내고 서버 응답만 보면 됨
        const SYNC_RETRY_DELAYS_MS = [3000, 8000];

        async function syncToServer() {
            for (let attempt = 0; attempt <= SYNC_RETRY_DELAYS_MS.length; attempt++) {
                showSyncStatus(attempt === 0 ? '☁️ 저장 중...' : `☁️ 저장 재시도 중... (${attempt}/${SYNC_RETRY_DELAYS_MS.length})`, 'syncing');
                try {
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify(getFullState())
                    });
                    if (!res.ok) throw new Error('응답 오류');
                    const resultData = await res.json();
                    if (resultData && resultData.status === 'error') {
                        const isLockTimeout = (resultData.message || '').includes('다른 저장 요청이 진행 중');
                        if (isLockTimeout && attempt < SYNC_RETRY_DELAYS_MS.length) {
                            await new Promise(r => setTimeout(r, SYNC_RETRY_DELAYS_MS[attempt]));
                            continue;
                        }
                        console.error('서버가 저장을 거부함:', resultData.message);
                        showSyncStatus('⚠️ ' + (resultData.message || '저장 거부됨'), 'error');
                        return false;
                    }
                    if (resultData && resultData.recordsSkipped) {
                        console.warn('서버가 활동기록 저장을 보류함(다른 항목은 저장됨):', resultData.message);
                        showSyncStatus('⚠️ 활동기록 저장 보류됨 (다른 변경사항은 저장됨)', 'error');
                        return true;
                    }
                    showSyncStatus('☁️ 저장됨', 'ok');
                    return true;
                } catch (err) {
                    if (attempt < SYNC_RETRY_DELAYS_MS.length) {
                        console.warn('서버 저장 실패, 재시도 예정:', err);
                        await new Promise(r => setTimeout(r, SYNC_RETRY_DELAYS_MS[attempt]));
                        continue;
                    }
                    console.error('서버 저장 실패:', err);
                    showSyncStatus('⚠️ 저장 실패 (로컬에는 저장됨)', 'error');
                    return false;
                }
            }
        }
        
        let syncStatusHideTimeout = null;
        
        function showSyncStatus(text, state) {
            const el = document.getElementById('syncStatus');
            if (!el) return;
            
            clearTimeout(syncStatusHideTimeout);
            el.textContent = text;
            el.className = 'sync-status ' + (state || '');
            el.style.visibility = 'visible';
            el.style.opacity = '1';
        }
        
        // ===== 탭 렌더링 & 전환 =====
        // 관리자가 어떤 탭의 세부 기능을 전부 꺼뒀으면, 그 탭은 "안내 문구가 뜨는 빈 탭"이 아니라
        // 처음부터 없었던 것처럼 탭 목록에서 통째로 사라지게 함
        function getAdminFullyRestrictedTabIds() {
            return FEATURE_GROUPS
                .filter(group => Object.keys(group.features).every(key => isFeatureDisabled(key)))
                .map(group => group.key);
        }

        function renderTabs() {
            const container = document.getElementById('tabsContainer');
            const adminHiddenTabIds = getAdminFullyRestrictedTabIds();
            // 환경설정 탭은 잠겨서 없앨 수 없게 항상 표시하고, 나머지는 사용자가 꺼둔 탭 + 관리자가 전부 제한한 탭만 숨김
            const visibleTabOrder = tabOrder.filter(tabId => tabId === 'settings' || (!disabledTabIds.includes(tabId) && !adminHiddenTabIds.includes(tabId)));
            if (!visibleTabOrder.includes(activeTabId)) {
                activeTabId = visibleTabOrder[0] || 'settings';
                document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
                const activeEl = document.getElementById(activeTabId);
                if (activeEl) activeEl.classList.add('active');
            }

            container.innerHTML = visibleTabOrder.map(tabId => {
                const activeClass = tabId === activeTabId ? ' active' : '';
                return `<div class="tab${activeClass}" data-tab-id="${tabId}" tabindex="0" role="button" aria-label="${escapeHtml(TAB_LABELS[tabId])} (화살표 키로 순서 변경, Enter로 이동)" onpointerdown="tabPointerDown(event, '${tabId}')" onkeydown="tabKeyDown(event, '${tabId}')">${TAB_LABELS[tabId]}</div>`;
            }).join('');

            container.querySelectorAll('.tab').forEach(tabEl => {
                const tabId = tabEl.dataset.tabId;
                tabEl.addEventListener('click', () => switchTab(tabId));
            });
        }

        // 목록 순서 변경을 위한 공통 드래그(+화살표 키) 헬퍼. 탭 순서/카테고리 순서/할일 순서가
        // 각자 따로 구현했던 사실상 동일한 Pointer Events(pointerdown/move/up + 고스트 엘리먼트)
        // 로직을 하나로 묶음. 네이티브 HTML5 드래그앤드롭 대신 Pointer Events를 쓰는 이유는
        // 트랙패드/브라우저별로 잘 안 먹거나 버벅이고, 터치 기기에서는 아예 동작하지 않기 때문.
        // 마우스/터치가 없는 사용자를 위해 화살표 키로도 항목을 앞/뒤로 옮길 수 있게 keyDown도 제공함.
        //
        // options:
        //   itemClass: 드래그 가능한 항목 하나를 감싸는 요소의 클래스 이름(점 없이) - 예: 'tab'
        //   ghostClass: 드래그 중 커서를 따라다니는 복제본에 추가로 붙일 클래스 이름
        //   getId(itemEl): 그 항목 요소의 식별자 문자열을 돌려줌
        //   canDrop(fromId, toId): 이 조합의 드롭을 허용할지(생략하면 항상 허용)
        //   onReorder(fromId, toId): 실제로 배열을 재배열 + 저장 + 재렌더링하는 콜백
        //   checkPermission(): 드래그/키보드 이동 시작을 허용할지(생략하면 항상 허용)
        //   handleSelector: 항목 안에서 재렌더링 후 포커스를 되돌릴 손잡이를 찾는 셀렉터(생략하면 항목 자신)
        function createDragReorder(options) {
            const itemSelector = '.' + options.itemClass;
            const MOVE_THRESHOLD = 6; // 이보다 적게 움직이면 그냥 클릭으로 취급(드래그로 안 침)
            let state = null; // { id, originEl, startX, startY, moved, ghostEl }

            function clearDragOver() {
                document.querySelectorAll(itemSelector + '.drag-over').forEach(el => el.classList.remove('drag-over'));
            }

            function pointerDown(e, id) {
                if (options.checkPermission && !options.checkPermission()) return;
                if (e.button !== undefined && e.button !== 0) return; // 마우스면 왼쪽 버튼만
                state = {
                    id,
                    originEl: e.currentTarget.closest(itemSelector),
                    startX: e.clientX,
                    startY: e.clientY,
                    moved: false,
                    ghostEl: null
                };
                document.addEventListener('pointermove', pointerMove);
                document.addEventListener('pointerup', pointerUp);
                document.addEventListener('pointercancel', pointerUp);
            }

            function pointerMove(e) {
                if (!state) return;
                const dx = e.clientX - state.startX;
                const dy = e.clientY - state.startY;

                if (!state.moved) {
                    if (Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
                    state.moved = true;
                    state.originEl.classList.add('dragging');

                    const rect = state.originEl.getBoundingClientRect();
                    const ghost = state.originEl.cloneNode(true);
                    ghost.className = 'drag-ghost ' + options.itemClass + ' ' + options.ghostClass;
                    ghost.style.width = rect.width + 'px';
                    document.body.appendChild(ghost);
                    state.ghostEl = ghost;
                }

                e.preventDefault(); // 드래그 중 터치 스크롤/텍스트 선택 방지
                state.ghostEl.style.left = e.clientX + 'px';
                state.ghostEl.style.top = e.clientY + 'px';

                clearDragOver();
                state.ghostEl.style.display = 'none'; // elementFromPoint가 고스트 자신을 집지 않도록 잠깐 숨김
                const under = document.elementFromPoint(e.clientX, e.clientY);
                state.ghostEl.style.display = '';
                const targetEl = under && under.closest(itemSelector);
                if (targetEl) {
                    const targetId = options.getId(targetEl);
                    if (targetId && targetId !== state.id && (!options.canDrop || options.canDrop(state.id, targetId))) {
                        targetEl.classList.add('drag-over');
                    }
                }
            }

            function pointerUp(e) {
                if (!state) return;
                document.removeEventListener('pointermove', pointerMove);
                document.removeEventListener('pointerup', pointerUp);
                document.removeEventListener('pointercancel', pointerUp);

                const finished = state;
                state = null;

                finished.originEl.classList.remove('dragging');
                if (finished.ghostEl) finished.ghostEl.remove();
                clearDragOver();

                if (!finished.moved) return; // 움직임 없이 그냥 눌렀다 뗀 경우는 클릭으로 처리되게 둠

                const under = document.elementFromPoint(e.clientX, e.clientY);
                const targetEl = under && under.closest(itemSelector);
                if (!targetEl) return;
                const targetId = options.getId(targetEl);
                if (!targetId || targetId === finished.id) return;
                if (options.canDrop && !options.canDrop(finished.id, targetId)) return;

                options.onReorder(finished.id, targetId);
            }

            // 마우스/터치 없이 화살표 키만으로 항목을 앞/뒤로 옮김. 손잡이(또는 항목 자신)에
            // tabindex="0"과 이 함수를 연결한 keydown 리스너가 있어야 동작함
            function keyDown(e, id) {
                let direction = 0;
                if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') direction = -1;
                else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') direction = 1;
                else return;
                if (options.checkPermission && !options.checkPermission()) return;

                const itemEl = e.currentTarget.closest(itemSelector);
                const container = itemEl && itemEl.parentElement;
                if (!container) return;
                const items = Array.from(container.querySelectorAll(itemSelector));
                const currentIndex = items.findIndex(el => options.getId(el) === id);
                if (currentIndex === -1) return;
                const targetIndex = currentIndex + direction;
                if (targetIndex < 0 || targetIndex >= items.length) return;
                const targetId = options.getId(items[targetIndex]);
                if (options.canDrop && !options.canDrop(id, targetId)) return;

                e.preventDefault();
                options.onReorder(id, targetId);

                // 재렌더링된 뒤에도 방금 옮긴 항목의 손잡이에 포커스가 남아있어야 화살표를
                // 연달아 눌러서 계속 옮길 수 있음
                const newItemEl = Array.from(container.querySelectorAll(itemSelector)).find(el => options.getId(el) === id);
                const newHandle = newItemEl && (options.handleSelector ? newItemEl.querySelector(options.handleSelector) : newItemEl);
                if (newHandle) newHandle.focus();
            }

            return { pointerDown, keyDown };
        }

        const tabDragReorder = createDragReorder({
            itemClass: 'tab',
            ghostClass: 'tab-ghost',
            checkPermission: () => editUnlocked, // 잠긴 상태에서는 순서 변경을 못 하게 막되, 클릭(탭 전환)은 그대로 동작함
            getId: el => el.dataset.tabId,
            onReorder: (fromId, toId) => {
                const fromIndex = tabOrder.indexOf(fromId);
                const toIndex = tabOrder.indexOf(toId);
                if (fromIndex === -1 || toIndex === -1) return;
                tabOrder.splice(fromIndex, 1);
                tabOrder.splice(toIndex, 0, fromId);
                saveTabOrderToStorage();
                renderTabs();
                if (typeof renderSettingsTab === 'function') renderSettingsTab();
            }
        });

        function tabPointerDown(e, tabId) {
            tabDragReorder.pointerDown(e, tabId);
        }

        // 화살표 키로 순서 변경 + Enter/Space로 탭 전환(포커스만으로는 아무 것도 못 누르는 상태를
        // 피하려고, 포커스 가능하게 만든 김에 최소한의 키보드 활성화도 함께 지원함)
        function tabKeyDown(e, tabId) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                switchTab(tabId);
                return;
            }
            tabDragReorder.keyDown(e, tabId);
        }
        
        function switchTab(tabName, options) {
            options = options || {};
            activeTabId = tabName;
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            document.querySelectorAll('.tab').forEach(el => {
                el.classList.toggle('active', el.dataset.tabId === tabName);
            });

            // 메모장 탭은 숨겨져있던 동안엔 높이를 정확히 잴 수 없으므로, 보이게 된 직후에 다시 맞춤
            if (tabName === 'notes' && typeof autoGrowNotesContainer === 'function') {
                autoGrowNotesContainer();
            }

            // 흐름도 탭도 마찬가지로, 숨겨져 있는(display:none) 동안 렌더링되면 블록들의 실제 위치를
            // 잴 수 없어서(offsetLeft/Top이 0으로 나옴) 연결선이 안 그려진 채로 남음. 처음 켤 때
            // 페이지 로딩 시점에 이미 한 번 그려보려 시도하지만 그때는 탭이 숨겨져 있으므로, 탭이
            // 실제로 보이게 된 직후 블록/연결선/정렬 손잡이를 통째로 다시 그려서 이 문제를 없앰.
            // (연결선만 다시 그리는 renderWaterFlowConnections()로는 블록 쪽 측정값 자체가 이미
            // 0으로 굳어 있던 경우를 못 고치는 경우가 있어, 블록까지 포함해 완전히 새로 그림)
            if (tabName === 'waterFlow' && typeof renderWaterFlowCanvas === 'function') {
                renderWaterFlowCanvas();
            }

            if (tabName === 'teamReport' && typeof initTeamReportTab === 'function') {
                initTeamReportTab(options.skipTeamReportLoad);
            }
        }

        function computePresetDateRange(preset) {
            const today = new Date();
            if (preset === '오늘') return { start: today, end: today };
            if (preset === '이번주') {
                const start = getMondayOfWeek(today);
                const end = new Date(start);
                end.setDate(end.getDate() + 6);
                return { start, end };
            }
            if (preset === '이번달') {
                return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: new Date(today.getFullYear(), today.getMonth() + 1, 0) };
            }
            if (preset === '지난달') {
                return { start: new Date(today.getFullYear(), today.getMonth() - 1, 1), end: new Date(today.getFullYear(), today.getMonth(), 0) };
            }
            if (preset === '올해') {
                return { start: new Date(today.getFullYear(), 0, 1), end: new Date(today.getFullYear(), 11, 31) };
            }
            return null;
        }
        function escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        // 인라인 onclick="fn('...')" 인자로 안전하게 넣기 위한 이스케이프.
        // JS 문자열 리터럴의 작은따옴표부터 먼저 이스케이프한 뒤(HTML 엔티티 디코딩이
        // JS 파싱보다 먼저 일어나므로), 그 결과를 이중따옴표 속성값으로도 안전하게 이스케이프한다.
        function escapeForOnclickArg(str) {
            const jsSafe = String(str)
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(new RegExp('\u2028', 'g'), '\\u2028')
                .replace(new RegExp('\u2029', 'g'), '\\u2029');
            return jsSafe.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        }
        function showStatus(message, type) {
            const statusEl = document.getElementById('statusMessage');
            statusEl.textContent = message;
            statusEl.className = `status-message ${type}`;
            setTimeout(() => { statusEl.className = 'status-message'; }, 3000);
        }
        function formatDate(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        // 상단 실시간 시계: 1초마다 현재 날짜/시각을 갱신
        function startLiveClock() {
            const dateEl = document.getElementById('liveClockDate');
            const timeEl = document.getElementById('liveClockTime');
            if (!dateEl || !timeEl) return;

            const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

            function tick() {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const weekday = weekdays[now.getDay()];
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const seconds = String(now.getSeconds()).padStart(2, '0');

                dateEl.textContent = `${year}년 ${month}월 ${day}일 (${weekday})`;
                timeEl.textContent = `${hours}:${minutes}:${seconds}`;
            }

            tick();
            setInterval(tick, 1000);
        }

        // ===== 메모장/활동기록 카테고리 박스 공용: 이미지 붙여넣기·업로드·확대보기 =====
        // 구글시트 셀은 5만자 제한이 있어서 이미지를 base64로 직접 저장할 수 없음. 그래서 이미지는
        // Code.gs가 Google Drive에 올리고 그 URL만 돌려주며, 여기서는 그 URL만 저장/표시함

        // 붙여넣기 이벤트에 이미지 파일이 들어있으면 그 File 객체를, 없으면(일반 텍스트 붙여넣기 등) null을 돌려줌
        function extractPastedImageFile(e) {
            const items = e.clipboardData && e.clipboardData.items;
            if (!items) return null;
            for (const item of items) {
                if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
                    return item.getAsFile();
                }
            }
            return null;
        }

        // 원본 이미지를 그대로 올리면 용량이 커서 느리고 셀 제한과 무관하게 서버 왕복이 오래 걸리므로,
        // 캔버스로 한 변의 최대 길이(maxDim)에 맞게 축소 + JPEG로 압축한 뒤 올림
        function resizeImageFileToDataUrl(file, maxDim, quality) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const img = new Image();
                    img.onload = () => {
                        let width = img.naturalWidth;
                        let height = img.naturalHeight;
                        if (width > maxDim || height > maxDim) {
                            if (width > height) {
                                height = Math.round(height * maxDim / width);
                                width = maxDim;
                            } else {
                                width = Math.round(width * maxDim / height);
                                height = maxDim;
                            }
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                        resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), width, height });
                    };
                    img.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
                    img.src = ev.target.result;
                };
                reader.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
                reader.readAsDataURL(file);
            });
        }

        async function uploadImageToDrive(dataUrl) {
            const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'uploadImage',
                    employeeId: currentEmployeeId,
                    passwordHash: currentPasswordHash,
                    imageData: dataUrl
                })
            });
            if (!res.ok) throw new Error('업로드 응답 오류');
            const result = await res.json();
            if (!result || result.status !== 'success') {
                throw new Error((result && result.message) || '이미지 업로드에 실패했습니다.');
            }
            return result; // { url, fileId }
        }

        // 사용자가 이미지 모서리를 드래그해서 크기를 바꾸면(브라우저 기본 resize 핸들) 그 크기를 저장함.
        // ResizeObserver는 observe() 호출 직후 최초 1회도 즉시 실행되므로, 삽입 직후에도 한 번 호출됨(무해함)
        function observeImageResize(img, onResized) {
            let saveTimeout = null;
            const observer = new ResizeObserver(() => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(onResized, 400);
            });
            observer.observe(img);
        }

        function openImageLightbox(url) {
            document.getElementById('imageLightboxImg').src = url;
            document.getElementById('imageLightboxOverlay').classList.add('active');
        }

        function closeImageLightbox(e) {
            if (e && e.target && e.target.id !== 'imageLightboxOverlay' && !e.target.classList.contains('image-lightbox-close')) return;
            document.getElementById('imageLightboxOverlay').classList.remove('active');
            document.getElementById('imageLightboxImg').src = '';
        }

        
        // 페이지를 닫거나 새로고침할 때도 입력 중이던 내용 저장 시도
        // captureCurrentFormToRecords는 calendar-activity.js에 있어서, 그 파일이 로드되지 못했거나
        // 로컬 저장이 실패해도 아래 sendBeacon(마지막 서버 저장)은 반드시 실행되도록 따로 감쌈
        window.addEventListener('beforeunload', () => {
            try {
                if (typeof captureCurrentFormToRecords === 'function') captureCurrentFormToRecords();
            } catch (e) { /* 무시 */ }
            try {
                const blob = new Blob([JSON.stringify(getFullState())], { type: 'text/plain' });
                navigator.sendBeacon(GOOGLE_APPS_SCRIPT_URL, blob);
            } catch (e) { /* 무시 */ }
        });
        
        // ===== 사번별 로그인 =====
        // 참고: 비밀번호는 평문으로 서버에 보내지 않고 SHA-256으로 해시해서 보냅니다.
        // 다만 별도 솔트(사번 결합) 정도만 적용한 가벼운 방식이라, 회사 인증 시스템 수준의
        // 보안은 아니라는 점은 감안해주세요.

        async function sha256Hex(text) {
            const enc = new TextEncoder().encode(text);
            const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
            return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // 홈페이지에 접속하면 항상 기본은 로그아웃 상태로 시작해서 로그인 모달을 띄워둠.
        // 이전에는 브라우저에 저장된 사번/비밀번호로 자동 로그인을 시도했지만, 매번 직접
        // 로그인하도록 그 기능을 없앰
        function resetToLoggedOutState() {
            editUnlocked = false;
            currentEmployeeId = '';
            currentPasswordHash = '';
            applyEditLockUI();
            openLoginModal(true); // true = 로그인 전까지 닫을 수 없는 강제 모드
        }

        // forced=true면 로그인하기 전까지 ESC/배경클릭/취소 버튼으로 닫을 수 없게 함
        // (로그인 안 한 상태에서 뒤에 아무 데이터도 없는 빈 화면이 노출되는 걸 막기 위함)
        function openLoginModal(forced) {
            document.getElementById('loginErrorMsg').style.display = 'none';
            document.getElementById('loginCapsLockWarning').style.display = 'none';
            document.getElementById('loginCancelBtn').style.display = forced ? 'none' : 'inline-block';
            document.getElementById('loginModal').dataset.forced = forced ? 'true' : 'false';
            document.getElementById('loginModal').classList.add('active');
            setTimeout(() => document.getElementById('loginEmployeeIdInput').focus(), 50);
        }

        function closeLoginModal() {
            document.getElementById('loginModal').classList.remove('active');
            document.getElementById('loginCapsLockWarning').style.display = 'none';
        }

        // 비밀번호 입력칸에서 Caps Lock이 켜져 있으면 안내 문구를 보여줌
        function checkLoginCapsLock(e) {
            const warningEl = document.getElementById('loginCapsLockWarning');
            if (!warningEl) return;
            const isOn = typeof e.getModifierState === 'function' && e.getModifierState('CapsLock');
            warningEl.style.display = isOn ? 'block' : 'none';
        }

        function toggleLoginPasswordVisibility() {
            const input = document.getElementById('loginPasswordInput');
            const btn = document.getElementById('loginPasswordToggleBtn');
            const willShow = input.type === 'password';
            input.type = willShow ? 'text' : 'password';
            btn.textContent = willShow ? '🙈' : '👀';
            btn.title = willShow ? '비밀번호 숨기기' : '비밀번호 보기';
        }

        async function attemptLogin() {
            const idInput = document.getElementById('loginEmployeeIdInput');
            const pwInput = document.getElementById('loginPasswordInput');
            const errEl = document.getElementById('loginErrorMsg');
            const btn = document.getElementById('loginSubmitBtn');

            const employeeId = idInput.value.trim();
            const password = pwInput.value;

            errEl.style.display = 'none';
            if (!employeeId) { errEl.textContent = '사번을 입력해주세요'; errEl.style.display = 'block'; return; }
            if (!password) { errEl.textContent = '비밀번호를 입력해주세요'; errEl.style.display = 'block'; return; }

            btn.disabled = true;
            btn.textContent = '확인 중...';

            try {
                const passwordHash = await sha256Hex(password + ':' + employeeId);
                // 로그인 전용 경로(action=login)로 인증함: 등록된 사번+비밀번호가 정확히 일치할
                // 때만 통과되고, 없는 사번을 입력하면 "등록되지 않은 사번입니다"로 거부됨(회원가입을
                // 먼저 해야만 로그인 가능). 로그인 실패 5회 시 계정이 잠기는 카운트도 이 경로에서만
                // 셈 - 로그인 이후 자동저장 등에서 반복 전송되는 요청(action=load 등)에는 이 카운트가
                // 붙지 않으므로, 관리자가 비밀번호를 초기화해도 옛 해시로 인한 자동 재잠김이 없음
                const url = GOOGLE_APPS_SCRIPT_URL + '?action=login'
                    + '&employeeId=' + encodeURIComponent(employeeId)
                    + '&passwordHash=' + encodeURIComponent(passwordHash)
                    + '&_=' + Date.now(); // 브라우저가 동일한 GET 요청 결과를 캐시해 예전 응답(예: "등록되지 않은 사번")을 계속 보여주는 걸 막기 위한 캐시버스터
                const res = await fetch(url, { cache: 'no-store' });
                const result = await res.json();

                if (!(result && result.status === 'error')) {
                    currentEmployeeId = employeeId;
                    currentPasswordHash = passwordHash;
                    editUnlocked = true;
                    isAdmin = !!result.isAdmin; // 서버(action=login)가 판별해서 내려준 값. 프론트는 더 이상 사번으로 직접 판단하지 않음

                    closeLoginModal();
                    applyEditLockUI();

                    if (isAdmin) {
                        enterAdminMode();
                    } else {
                        // 로그인에 성공한 지금에서야 처음으로 홈페이지 내용을 그림(아직 안 그려졌다면).
                        // 로그인 전에 화면/캐시에 있던 데이터는 이 계정 것이 아닐 수 있으므로,
                        // 방금 로그인 확인(action=login)에서 이미 받아온 이 계정의 데이터로 덮어씀
                        // (여기서 서버를 또 호출하면 느린 GAS 왕복을 로그인마다 불필요하게 두 번 하게 됨)
                        await initAppUI();
                        await loadAllFromServer(result);
                    }
                } else {
                    errEl.textContent = result.message || '로그인에 실패했습니다';
                    errEl.style.display = 'block';
                }
            } catch (e) {
                errEl.textContent = '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.';
                errEl.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.textContent = '🔓 로그인';
            }
        }

        // forced=true면(로그인 전 강제 모드) 취소해도 다시 로그인 모달로 돌아가야 빈 화면이 안 남음
        // 소속 select의 "직접입력"을 고르면 옆에 텍스트 입력칸을 보여주고, 아니면 숨김
        function toggleDepartmentCustomInput(which) {
            const select = document.getElementById(which + 'DepartmentInput');
            const customInput = document.getElementById(which + 'DepartmentCustomInput');
            const isCustom = select.value === '__custom__';
            customInput.style.display = isCustom ? 'block' : 'none';
            if (isCustom) customInput.focus();
        }

        // 저장된 소속 값을 select+직접입력 칸에 되돌려 채움. 목록에 없는 값(직접입력으로
        // 저장했던 값 등)이면 자동으로 "직접입력"을 선택하고 그 칸에 채워줌
        function setDepartmentFieldValue(which, value) {
            const select = document.getElementById(which + 'DepartmentInput');
            const customInput = document.getElementById(which + 'DepartmentCustomInput');
            const fixedValues = Array.from(select.options).map(o => o.value).filter(v => v !== '__custom__');

            if (value && !fixedValues.includes(value)) {
                select.value = '__custom__';
                customInput.value = value;
                customInput.style.display = 'block';
            } else {
                select.value = value || fixedValues[0];
                customInput.value = '';
                customInput.style.display = 'none';
            }
        }

        // select가 "직접입력"이면 옆 텍스트 칸의 값을, 아니면 select 값을 그대로 반환
        function getDepartmentValue(which) {
            const select = document.getElementById(which + 'DepartmentInput');
            if (select.value === '__custom__') {
                return document.getElementById(which + 'DepartmentCustomInput').value.trim();
            }
            return select.value;
        }

        function openSignupModal() {
            const wasForced = document.getElementById('loginModal').dataset.forced === 'true';
            closeLoginModal();
            document.getElementById('signupModal').dataset.returnForced = wasForced ? 'true' : 'false';

            document.getElementById('signupErrorMsg').style.display = 'none';
            document.getElementById('signupEmployeeIdInput').value = '';
            document.getElementById('signupNameInput').value = '';
            setDepartmentFieldValue('signup', '');
            document.getElementById('signupPasswordInput').value = '';
            document.getElementById('signupPasswordConfirmInput').value = '';

            document.getElementById('signupModal').classList.add('active');
            setTimeout(() => document.getElementById('signupEmployeeIdInput').focus(), 50);
        }

        function closeSignupModal() {
            document.getElementById('signupModal').classList.remove('active');
            // 로그인이 안 된 상태에서 취소한 거라면, 화면이 빈 채로 남지 않도록 로그인 모달로 돌아감
            if (!editUnlocked) {
                const wasForced = document.getElementById('signupModal').dataset.returnForced === 'true';
                openLoginModal(wasForced);
            }
        }

        // 비밀번호를 잊었을 때, 로그인 정보 없이 사번만으로 관리자에게 재설정을 요청함
        // (실제 초기화는 여전히 관리자만 할 수 있고, 이건 그 요청을 관리자 화면에 표시해줄 뿐임)
        function openPasswordResetRequestModal() {
            document.getElementById('passwordResetRequestEmployeeIdInput').value = '';
            const errEl = document.getElementById('passwordResetRequestErrorMsg');
            errEl.style.display = 'none';
            errEl.className = 'goal-status error';
            document.getElementById('passwordResetRequestModal').classList.add('active');
            // 이 모달을 열어도 로그인 모달의 입력창이 그대로 포커스를 쥐고 있어서, 옮겨주지
            // 않으면 타이핑이 뒤에 깔린(안 보이는) 로그인 입력창으로 들어감
            setTimeout(() => document.getElementById('passwordResetRequestEmployeeIdInput').focus(), 50);
        }

        async function submitPasswordResetRequest() {
            const input = document.getElementById('passwordResetRequestEmployeeIdInput');
            const errEl = document.getElementById('passwordResetRequestErrorMsg');
            const employeeId = input.value.trim();

            if (!EMPLOYEE_ID_PATTERN.test(employeeId)) {
                errEl.textContent = EMPLOYEE_ID_INVALID_MSG;
                errEl.style.display = 'block';
                return;
            }

            errEl.style.display = 'none';
            try {
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'requestPasswordReset', employeeId: employeeId })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    // 다른 확인 동작들과 달리 브라우저 기본 alert() 대신, 모달을 바로 닫지 않고
                    // 같은 자리에 성공 메시지를 보여준 뒤 사용자가 직접 닫게 함
                    errEl.textContent = '✅ 요청이 접수되었습니다. 관리자가 확인 후 비밀번호를 초기화해드립니다.';
                    errEl.className = 'goal-status success';
                    errEl.style.display = 'block';
                    input.value = '';
                } else {
                    errEl.textContent = data.message || '요청에 실패했습니다';
                    errEl.className = 'goal-status error';
                    errEl.style.display = 'block';
                }
            } catch (err) {
                console.error('비밀번호 재설정 요청 오류:', err);
                errEl.textContent = '서버 연결에 실패했습니다.';
                errEl.style.display = 'block';
            }
        }

        async function attemptSignup() {
            const idInput = document.getElementById('signupEmployeeIdInput');
            const nameInput = document.getElementById('signupNameInput');
            const pwInput = document.getElementById('signupPasswordInput');
            const pwConfirmInput = document.getElementById('signupPasswordConfirmInput');
            const errEl = document.getElementById('signupErrorMsg');
            const btn = document.getElementById('signupSubmitBtn');

            const employeeId = idInput.value.trim();
            const name = nameInput.value.trim();
            const department = getDepartmentValue('signup');
            const password = pwInput.value;
            const passwordConfirm = pwConfirmInput.value;

            errEl.style.display = 'none';
            if (!EMPLOYEE_ID_PATTERN.test(employeeId)) { errEl.textContent = EMPLOYEE_ID_INVALID_MSG; errEl.style.display = 'block'; return; }
            if (!name) { errEl.textContent = '이름을 입력해주세요'; errEl.style.display = 'block'; return; }
            if (!department) { errEl.textContent = '소속을 입력해주세요'; errEl.style.display = 'block'; return; }
            if (!password) { errEl.textContent = '비밀번호를 입력해주세요'; errEl.style.display = 'block'; return; }
            if (password !== passwordConfirm) { errEl.textContent = '비밀번호가 서로 일치하지 않습니다'; errEl.style.display = 'block'; return; }

            btn.disabled = true;
            btn.textContent = '가입 중...';

            try {
                const passwordHash = await sha256Hex(password + ':' + employeeId);
                const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'signup', employeeId, passwordHash, name, department })
                });
                const result = await res.json();

                if (result.status === 'success') {
                    currentEmployeeId = employeeId;
                    currentPasswordHash = passwordHash;
                    currentUserName = name;
                    currentUserDepartment = department;
                    safeSetItem('accountName', name);
                    safeSetItem('accountDepartment', department);
                    editUnlocked = true;
                    isAdmin = false; // 관리자 계정은 이미 시트에 만들어져 있어 회원가입으로는 절대 생성되지 않음(중복 사번으로 거부됨)

                    closeSignupModal(); // editUnlocked가 이미 true라 로그인 모달로 되돌아가지 않음
                    applyEditLockUI();

                    await initAppUI();
                    await loadAllFromServer();
                    showStatus('👋 회원가입이 완료되었습니다. 환영합니다!', 'success');
                } else {
                    errEl.textContent = result.message || '회원가입에 실패했습니다';
                    errEl.style.display = 'block';
                }
            } catch (e) {
                errEl.textContent = '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.';
                errEl.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.textContent = '📝 회원가입';
            }
        }

        // [팀 보고] 내 제출 내역에서 제출시각 하나로 날짜+시간을 함께 보여주기 위한 전용 포맷 (yyyy.mm.dd. PM HH:MM)
        function formatTeamReportSubmittedAt(isoString) {
            if (!isoString) return '';
            const d = new Date(isoString);
            if (isNaN(d.getTime())) return isoString;
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const ampm = d.getHours() < 12 ? 'AM' : 'PM';
            const hh = String(d.getHours() % 12 || 12).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            return `${yyyy}.${mm}.${dd}. ${ampm} ${hh}:${min}`;
        }

        // 서버가 ISO 문자열(예: 2026-08-29T12:34:56.000Z)로 주는 삭제시각을 보기 편하게 표시
        function formatDateTimeKo(isoString) {
            if (!isoString) return '';
            const d = new Date(isoString);
            if (isNaN(d.getTime())) return isoString;
            return d.toLocaleString('ko-KR');
        }

        function openAccountModal() {
            if (!editUnlocked || !currentEmployeeId) return;
            document.getElementById('accountErrorMsg').style.display = 'none';
            document.getElementById('accountSuccessMsg').style.display = 'none';
            document.getElementById('accountEmployeeIdInput').value = currentEmployeeId;
            document.getElementById('accountNameInput').value = currentUserName;
            setDepartmentFieldValue('account', currentUserDepartment);
            document.getElementById('accountNewPasswordInput').value = '';
            document.getElementById('accountNewPasswordConfirmInput').value = '';
            document.getElementById('accountModal').classList.add('active');
        }

        function closeAccountModal() {
            document.getElementById('accountModal').classList.remove('active');
        }

        // 사번은 본인이 스스로 바꿀 수 없음(변경은 관리자 화면에서만 가능). 비밀번호 변경은
        // 서버 인증이 필요해 별도 액션으로 처리하고, 이름/소속은 별도 인증 없이 일반 동기화
        // 채널(getFullState)에 실어 저장함
        async function saveAccountChanges() {
            const nameInput = document.getElementById('accountNameInput');
            const newPwInput = document.getElementById('accountNewPasswordInput');
            const newPwConfirmInput = document.getElementById('accountNewPasswordConfirmInput');
            const errEl = document.getElementById('accountErrorMsg');
            const okEl = document.getElementById('accountSuccessMsg');
            const btn = document.getElementById('accountSaveBtn');

            const newName = nameInput.value.trim();
            const newDepartment = getDepartmentValue('account');
            const newPassword = newPwInput.value;
            const newPasswordConfirm = newPwConfirmInput.value;

            errEl.style.display = 'none';
            okEl.style.display = 'none';

            if (!newName) { errEl.textContent = '이름을 입력해주세요'; errEl.style.display = 'block'; return; }
            if (!newDepartment) { errEl.textContent = '소속을 입력해주세요'; errEl.style.display = 'block'; return; }
            if ((newPassword || newPasswordConfirm) && newPassword !== newPasswordConfirm) {
                errEl.textContent = '새 비밀번호가 서로 일치하지 않습니다'; errEl.style.display = 'block'; return;
            }

            btn.disabled = true;
            btn.textContent = '저장 중...';

            try {
                if (newPassword) {
                    const newPasswordHash = await sha256Hex(newPassword + ':' + currentEmployeeId);
                    const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'changePassword',
                            employeeId: currentEmployeeId,
                            oldPasswordHash: currentPasswordHash,
                            newPasswordHash
                        })
                    });
                    const result = await res.json();
                    if (result.status !== 'success') {
                        errEl.textContent = result.message || '비밀번호 변경에 실패했습니다';
                        errEl.style.display = 'block';
                        return;
                    }
                    currentPasswordHash = newPasswordHash;
                }

                currentUserName = newName;
                currentUserDepartment = newDepartment;
                safeSetItem('accountName', currentUserName);
                safeSetItem('accountDepartment', currentUserDepartment);
                queueSync();

                applyEditLockUI();
                newPwInput.value = '';
                newPwConfirmInput.value = '';
                okEl.textContent = '저장되었습니다';
                okEl.style.display = 'block';
            } catch (e) {
                errEl.textContent = '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.';
                errEl.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.textContent = '💾 저장';
            }
        }

        // getFullState()에 실려서 서버로 동기화되는, 즉 "이 계정 소유"인 로컬 캐시 키 전부.
        // 로그아웃할 때 이걸 지우지 않으면, 같은 브라우저에서 다른 사번으로 로그인했을 때
        // 서버 응답을 받기 전 잠깐(또는 서버 쪽 문제로 응답이 비정상일 때는 계속) 이전 계정의
        // 데이터가 화면에 남아있는 것처럼 보일 수 있음
        const ACCOUNT_SCOPED_STORAGE_KEYS = [
            'activityRecords', 'calendarEvents', 'activityCategories',
            'categoryColors', 'categoryDefaultCollapsed', 'categoryBoxHeights', 'dateCategoryBoxHeights',
            'hiddenCategoriesByDate', 'dateCategoryOrder', 'collapsedUpcomingCardIds',
            'tabOrder', 'disabledTabIds', 'personalAiApiKey', 'disabledFeatures', 'freeNotes', 'freeNotesPages', 'currentFreeNotesPageId', 'todoItems', 'todoNotes', 'aiTemplate',
            'savingsProjects', 'trendSubject', 'trendSpec', 'maintenanceSchedule', 'waterFlowDiagrams', 'currentWaterFlowDiagramId',
            'accountName', 'accountDepartment',
            'archivedCategories', 'recordSnippets', 'weekdayTemplates', 'recordRevisions'
        ];

        function logout() {
            confirmModal('로그아웃할까요? 다시 사번과 비밀번호를 입력해야 합니다.', () => {
                localStorage.removeItem('employeeId');
                localStorage.removeItem('passwordHash');
                ACCOUNT_SCOPED_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
                // 다음 사람(또는 다음 로그인)에게 이전 계정 데이터가 남아있지 않도록 전체를 새로고침함
                location.reload();
            });
        }

        // 편집이 필요한 동작(추가/수정/삭제) 시작 지점마다 이 함수로 확인.
        // 로그인 안 되어 있으면 로그인 모달을 띄우고 false를 반환해서 호출부가 하던 일을 멈추게 함
        function checkEditPermission() {
            if (editUnlocked) return true;
            openLoginModal(false);
            return false;
        }

        // 현재 로그인 상태를 화면 전체(사용자 표시 + 각종 입력칸의 읽기전용 여부)에 반영
        function applyEditLockUI() {
            const userLabel = document.getElementById('currentUserLabel');
            const logoutBtn = document.getElementById('logoutBtn');

            if (editUnlocked && currentEmployeeId) {
                if (userLabel) {
                    userLabel.textContent = '👤 개인 정보 수정';
                    userLabel.style.display = 'inline-block';
                }
                if (logoutBtn) logoutBtn.style.display = 'inline-block';
            } else {
                if (userLabel) userLabel.style.display = 'none';
                if (logoutBtn) logoutBtn.style.display = 'none';
            }

            document.body.classList.toggle('edit-locked', !editUnlocked);

            const notesTextarea = document.getElementById('notesTextarea');
            const aiTemplateTextarea = document.getElementById('aiTemplateTextarea');
            if (notesTextarea) notesTextarea.contentEditable = editUnlocked ? 'true' : 'false';
            if (aiTemplateTextarea) aiTemplateTextarea.readOnly = !editUnlocked;

            // 활동기록 카테고리 textarea들은 날짜를 선택할 때마다 새로 그려지므로, 그때도 이 상태를 반영해야 함
            document.querySelectorAll('.category-record textarea').forEach(ta => {
                ta.readOnly = !editUnlocked;
            });

            applyFormLockState();
        }
        
        // 잠긴 상태에서는 화면 전체의 버튼/입력창/날짜칸 클릭을 여기서 한 번에 차단함.
        // (하나하나 함수마다 손대는 대신, 새 버튼이 추가되더라도 자동으로 같이 잠기도록 캡처 단계에서 가로챔)
        // 예외: 로그인 모달 내부, 잠금 버튼 자체, 탭 전환(탭 이동 자체는 "구경"에 해당하므로 허용)
        // 열려 있는 모달을 ESC 키로만 닫을 수 있게 함 (바깥 배경 클릭으로는 닫히지 않음).
        // 모달마다 따로 붙이지 않고 한 곳에서 처리해서, 나중에 모달이 추가돼도 자동으로 동작함
        function setupModalDismissHandlers() {
            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape') return;

                // confirmActionModal은 다른 모달(일정/절감과제 삭제 등) 위에 겹쳐서 뜰 수 있는데,
                // 이때 querySelector는 DOM에 먼저 나오는(밑에 깔린) 모달을 집어올 수 있으므로
                // 항상 confirmActionModal이 열려 있으면 그것부터(맨 위에 있는 것부터) 닫음
                const confirmModalEl = document.getElementById('confirmActionModal');
                const openModal = confirmModalEl.classList.contains('active')
                    ? confirmModalEl
                    : document.querySelector('.modal-overlay.active');
                if (!openModal) return;

                e.preventDefault();
                closeModalById(openModal.id);
            });
        }

        function closeModalById(id) {
            if (id === 'loginModal') {
                // 아직 로그인 전(강제 모드)이면 ESC로 닫지 못하게 함
                if (document.getElementById('loginModal').dataset.forced === 'true') return;
                closeLoginModal();
            }
            else if (id === 'eventModal') closeEventModal();
            else if (id === 'projectModal') closeProjectModal();
            else if (id === 'maintenanceModal') closeMaintenanceModal();
            else if (id === 'waterFlowBlockModal') closeWaterFlowBlockModal();
            else if (id === 'waterFlowDiagramModal') closeWaterFlowDiagramModal();
            else if (id === 'waterFlowConnectionModal') closeWaterFlowConnectionModal();
            else if (id === 'deleteTeamReportModal') closeDeleteTeamReportModal();
            else if (id === 'signupModal') closeSignupModal();
            else if (id === 'adminEditUserModal') closeAdminEditUserModal();
            else if (id === 'confirmActionModal') closeConfirmActionModal();
            else document.getElementById(id).classList.remove('active');
        }

        // 입력값 검증 오류처럼 짧게 알리고 사라지면 되는 메시지를 브라우저 기본 alert() 대신
        // 화면 하단 토스트로 보여줌 (alert()는 확인을 누를 때까지 화면을 막아 PWA에서 이질감이 있었음)
        let appToastTimer = null;

        function showAppToast(message) {
            const el = document.getElementById('appToast');
            if (!el) { alert(message); return; } // 안전망(토스트 요소가 없는 예외적인 상황)
            el.textContent = message;
            el.classList.add('show');
            clearTimeout(appToastTimer);
            appToastTimer = setTimeout(() => el.classList.remove('show'), 2600);
        }

        // 삭제/로그아웃처럼 되돌리기 어려운 동작을 브라우저 기본 confirm() 대신 앱 스타일 모달로
        // 확인받음. confirm()과 달리 결과를 바로 리턴하지 못하고 비동기(모달 클릭 이후)로 진행되므로,
        // 호출부는 "if (!confirm(...)) return;" 대신 원래 하려던 동작을 callback 안에 넣는 식으로 씀
        let confirmActionCallback = null;
        let confirmActionExtraCallback = null;

        // options로 { confirmLabel, extraLabel, extraCallback }을 주면, 반복 일정 삭제처럼
        // "이 일정만" / "전체 삭제" 두 가지 중 고르게 해야 하는 경우에 버튼을 하나 더 보여줄 수 있음
        function confirmModal(message, callback, options) {
            document.getElementById('confirmActionMessage').textContent = message;
            confirmActionCallback = callback;
            document.getElementById('confirmActionConfirmBtn').textContent = (options && options.confirmLabel) || '확인';
            const extraBtn = document.getElementById('confirmActionExtraBtn');
            if (options && options.extraLabel) {
                extraBtn.textContent = options.extraLabel;
                extraBtn.style.display = '';
                confirmActionExtraCallback = options.extraCallback;
            } else {
                extraBtn.style.display = 'none';
                confirmActionExtraCallback = null;
            }
            document.getElementById('confirmActionModal').classList.add('active');
        }

        function confirmActionModalConfirm() {
            const callback = confirmActionCallback;
            confirmActionCallback = null;
            confirmActionExtraCallback = null;
            document.getElementById('confirmActionModal').classList.remove('active');
            if (typeof callback === 'function') callback();
        }

        function confirmActionModalExtra() {
            const callback = confirmActionExtraCallback;
            confirmActionCallback = null;
            confirmActionExtraCallback = null;
            document.getElementById('confirmActionModal').classList.remove('active');
            if (typeof callback === 'function') callback();
        }

        function closeConfirmActionModal() {
            // 취소/ESC로 닫을 땐 예정돼있던 동작을 실행하지 않도록 콜백을 버림
            confirmActionCallback = null;
            confirmActionExtraCallback = null;
            document.getElementById('confirmActionModal').classList.remove('active');
        }

        function setupGlobalEditLockInterceptor() {
            document.addEventListener('click', function (e) {
                if (editUnlocked) return;
                if (e.target.closest('#loginModal')) return;
                if (e.target.closest('#signupModal')) return;
                if (e.target.closest('#passwordResetRequestModal')) return;
                if (e.target.closest('#logoutBtn')) return;
                if (e.target.closest('#tabsContainer')) return;

                const blocked = e.target.closest(
                    'button, [onclick], select, input:not(#loginPasswordInput):not(#loginEmployeeIdInput), .day, .upcoming-card, .upcoming-card-mini, .hidden-category-chip, .result-item.clickable, .color-swatch'
                );
                if (blocked) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    openLoginModal(false);
                }
            }, true);
        }

        // input/select 요소는 타입에 따라 readOnly가 먹히지 않는 것들(색상/체크박스/select 등)이 있어서
        // 타입별로 readOnly 또는 disabled를 정확히 나눠서 적용함. 텍스트를 선택해서 복사하는 건 여전히
        // 가능하게 하려고, 되도록 disabled보다는 readOnly를 우선 사용함(disabled는 클릭/포커스 자체가 막혀서
        // 내용을 보거나 복사하기도 불편해짐)
        function applyFormLockState() {
            document.querySelectorAll('input, select').forEach(el => {
                if (el.closest('#loginModal') || el.closest('#signupModal') || el.closest('#passwordResetRequestModal')) return; // 로그인/회원가입/비밀번호 재설정 요청 입력창은 항상 사용 가능해야 함

                const noReadonlyEffect = ['color', 'checkbox', 'radio', 'range'];
                if (el.tagName === 'SELECT' || noReadonlyEffect.includes(el.type)) {
                    el.disabled = !editUnlocked;
                } else {
                    el.readOnly = !editUnlocked;
                }
            });

            // 해야 할 일의 메모 textarea는 목록이 다시 그려질 때마다 호출되므로 여기서 같이 반영함
            document.querySelectorAll('.todo-memo-input').forEach(ta => {
                ta.readOnly = !editUnlocked;
            });
        }
        
        window.addEventListener('load', init);
        
        // PWA: 서비스워커 등록 (홈화면 설치 가능하게 해주고, 정적 파일 캐싱으로 로딩도 빨라짐)
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').catch((err) => {
                    console.error('서비스워커 등록 실패:', err);
                });
            });
        }

