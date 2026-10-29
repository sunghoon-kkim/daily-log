const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture() {
    const c = vm.createContext({console, PropertiesService: {getScriptProperties: () => ({getProperty: () => null})}});
    vm.runInContext(fs.readFileSync('Code.gs', 'utf8'), c);
    return {c};
}

test('daily summary uses custom text, supports clearing, and preserves legacy defaults', () => {
    const {c} = fixture();
    c.resolveApiKey = () => 'test-key';
    c.callGeminiAndRespond = (key, contents, prompt) => prompt;
    const request = {employeeId: '2600643', logText: '배관 보수', itemCount: 1};
    assert.match(c.handleDailySummary(request), /1\. 냉동기, 보일러, 수처리 일상점검/);
    assert.match(c.handleDailySummary({...request, employeeId: '1234567', fixedFirstItem: '1. 설비 순회점검'}), /1\. 설비 순회점검/);
    const cleared = c.handleDailySummary({...request, fixedFirstItem: ''});
    assert.doesNotMatch(cleared, /첫 번째 항목으로 고정/);
    assert.match(cleared, /총 1개/);
    assert.doesNotMatch(c.handleDailySummary({...request, employeeId: '1234567'}), /첫 번째 항목으로 고정/);
});

test('saving the first item normalizes text, queues account sync, and respects the edit lock', () => {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, {value: '', textContent: '', className: ''});
        return elements.get(id);
    };
    const saved = new Map();
    let unlocked = true, syncs = 0;
    const c = vm.createContext({
        document: {getElementById: element},
        checkEditPermission: () => unlocked,
        safeSetItem: (key, value) => saved.set(key, value),
        queueSync: () => syncs++,
        dailySummaryFixedFirstItem: ''
    });
    vm.runInContext(fs.readFileSync('js/ai-helper.js', 'utf8'), c);
    element('dailySummaryFixedFirstItem').value = ' 1. 설비\n순회점검 ';
    c.saveDailySummarySettings();
    assert.equal(saved.get('dailySummaryFixedFirstItem'), '설비 순회점검');
    assert.equal(syncs, 1);
    unlocked = false;
    element('dailySummaryFixedFirstItem').value = '잠긴 수정';
    c.saveDailySummarySettings();
    assert.equal(c.dailySummaryFixedFirstItem, '설비 순회점검');
    assert.equal(syncs, 1);
    unlocked = true;
    element('dailySummaryFixedFirstItem').value = '';
    c.saveDailySummarySettings();
    assert.equal(saved.get('dailySummaryFixedFirstItem'), '');
    assert.equal(syncs, 2);
});
