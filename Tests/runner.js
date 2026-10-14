const path = require('path');
const fs = require('fs');

const tests = [];
let currentSuite = '';

function suite(name) {
    currentSuite = name;
}

function test(name, fn) {
    tests.push({ suite: currentSuite, name, fn });
}

// Пропуск по внешней причине — отсутствующей зависимости. Помечается
// отдельно, чтобы не выглядеть как успешно пройденная проверка.
function skip(name, reason) {
    tests.push({ suite: currentSuite, name, fn: null, reason: reason });
}

function fail(message) {
    throw new Error(message);
}

function eq(actual, expected, context) {
    if (actual !== expected) {
        fail('получено ' + JSON.stringify(actual) + ', ожидалось ' + JSON.stringify(expected) +
            (context ? ' [' + context + ']' : ''));
    }
}

function ok(value, message) {
    if (!value) {
        fail(message || 'ожидалось истинное значение, получено ' + JSON.stringify(value));
    }
}

function throws(fn, message) {
    let threw = false;
    try {
        fn();
    } catch (error) {
        threw = true;
    }
    if (!threw) {
        fail(message || 'ожидалось исключение');
    }
}

function load() {
    const dir = __dirname;
    const files = fs.readdirSync(dir)
        .filter(name => name.endsWith('.test.js'))
        .sort();
    files.forEach(name => require(path.join(dir, name)));
}

function run() {
    load();
    let passed = 0;
    let skipped = 0;
    const failures = [];
    const skipReasons = [];
    let suiteName = '';

    tests.forEach(item => {
        if (item.suite !== suiteName) {
            suiteName = item.suite;
            console.log('\n' + suiteName);
        }

        if (!item.fn) {
            skipped++;
            skipReasons.push(suiteName + ' -> ' + item.name + ': ' + (item.reason || ''));
            console.log('  пропуск  ' + item.name);
            return;
        }

        try {
            item.fn();
            passed++;
            console.log('  ok    ' + item.name);
        } catch (error) {
            failures.push(suiteName + ' -> ' + item.name + ': ' + error.message);
            console.log('  FAIL  ' + item.name + '\n          ' + error.message);
        }
    });

    console.log('\n' + '-'.repeat(50));
    console.log('Проверок: ' + tests.length + ' | Успешно: ' + passed +
        ' | Пропущено: ' + skipped + ' | Провалено: ' + failures.length);

    if (skipReasons.length) {
        console.log('\nПропущены (зависимость не установлена):');
        skipReasons.forEach(line => console.log('  ' + line));
    }

    if (failures.length) {
        console.log('\nПровалы:');
        failures.forEach(line => console.log('  ' + line));
    }

    process.exitCode = failures.length ? 1 : 0;
}

module.exports = { suite, test, skip, eq, ok, throws, run, fail };