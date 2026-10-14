const { suite, test, skip, eq, ok } = require('./runner');
const fs = require('fs');
const path = require('path');
const { loadSources } = require('./harness');
const { DnsState } = loadSources();
const { loadDom } = require('./dom-harness');

/**
 * Дрейф-тест разметки и схемы.
 *
 * Разметка интерфейса лежит в Index.cshtml, схема полей — в records.js.
 * Связь между ними идёт через идентификаторы вида f-{RecordId}-{field}.
 * Если в схему добавят поле, а в разметку забудут, — вёрстка молча
 * перестанет работать для этого поля. Именно этот тест ломает сборку,
 * поэтому «забыть» невозможно: забывшего остановит CI.
 */

const VIEW = path.join(__dirname, '..', 'DnsRecordGenerator', 'Views', 'Home', 'Index.cshtml');
const view = fs.readFileSync(VIEW, 'utf8');
const { DnsRecords: R } = loadSources();

suite('Разметка: соответствует схеме записей');

const dom = loadDom();

if (!dom) {
    skip('DOM-проверки разметки', 'не установлен jsdom — выполните npm install');
} else {
    const doc = dom.window.document;
    doc.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

    test('в разметке есть панель каждого типа записи', () => {
        const missing = R.all.filter(r => !doc.getElementById('panel-' + r.id))
            .map(r => r.id);
        eq(missing.join(', '), '');
    });

    test('в разметке есть вкладка каждого типа записи', () => {
        const missing = R.all.filter(r => !doc.getElementById('tab-' + r.id))
            .map(r => r.id);
        eq(missing.join(', '), '');
    });

    test('в разметке нет лишних панелей и вкладок', () => {
        const declared = R.all.map(r => r.id);
        const panels = Array.from(doc.querySelectorAll('[data-record]'))
            .map(el => el.dataset.record)
            .filter(id => !declared.includes(id));
        eq(panels.join(', '), '', 'лишние панели в разметке');
        eq(doc.querySelectorAll('.dnsr-tab').length, R.all.length);
    });

    test('у каждого поля схемы есть элемент в разметке', () => {
        const missing = [];
        R.all.forEach(record => {
            record.fields.forEach(field => {
                const el = doc.getElementById('f-' + record.id + '-' + field.name);
                if (!el && field.type !== 'checks') {
                    missing.push(record.id + '.' + field.name);
                }
            });
        });
        eq(missing.join(', '), '');
    });

    test('у каждого поля в разметке есть поле в схеме', () => {
        const extra = [];
        R.all.forEach(record => {
            const panel = doc.getElementById('panel-' + record.id);
            panel.querySelectorAll('[data-field]').forEach(wrapper => {
                const name = wrapper.dataset.field;
                const known = record.fields.some(f => f.name === name);
                if (!known) {
                    extra.push(record.id + '.' + name);
                }
            });
        });
        eq(extra.join(', '), '');
    });

    test('поле-группа (checks) содержит чекбоксы всех объявленных вариантов', () => {
        const problems = [];
        R.all.forEach(record => {
            record.fields.forEach(field => {
                if (field.type !== 'checks') {
                    return;
                }
                const wrapper = doc.querySelector('#panel-' + record.id +
                    ' [data-field="' + field.name + '"]');
                const boxes = wrapper.querySelectorAll('input[type="checkbox"]');
                if (boxes.length !== field.options.length) {
                    problems.push(record.id + '.' + field.name + ': чекбоксов ' +
                        boxes.length + ', ожидалось ' + field.options.length);
                }
            });
        });
        eq(problems.join(' | '), '');
    });

    test('у каждого поля есть подпись и контейнер ошибки', () => {
        const problems = [];
        R.all.forEach(record => {
            record.fields.forEach(field => {
                const wrapper = doc.querySelector('#panel-' + record.id +
                    ' [data-field="' + field.name + '"]');
                if (!wrapper) {
                    return;
                }
                if (field.type !== 'check' && !wrapper.querySelector('label')) {
                    problems.push(record.id + '.' + field.name + ': нет подписи');
                }
                if (field.type !== 'check' && !doc.getElementById('e-' + record.id + '-' + field.name)) {
                    problems.push(record.id + '.' + field.name + ': нет места для ошибки');
                }
            });
        });
        eq(problems.join(' | '), '');
    });

    test('дополнительные выводы присутствуют в разметке', () => {
        const problems = [];
        R.all.forEach(record => {
            (record.extraOutputs || []).forEach((output, index) => {
                if (!doc.getElementById('extra-' + record.id + '-' + index)) {
                    problems.push(record.id + '[' + index + ']: нет поля вывода');
                }
                if (!doc.getElementById('copy-extra-' + record.id + '-' + index)) {
                    problems.push(record.id + '[' + index + ']: нет кнопки копирования');
                }
            });
        });
        eq(problems.join(' | '), '');
    });

suite('Базовый набор записей');

test('набор содержит все записи, нужные почтовому домену', () => {
    eq(R.setupSet.join(','), 'MX,A,SPF,DKIM,DMARC,SRV');
});

test('набор собирается целиком, когда все поля заполнены', () => {
    const values = record => {
        const result = DnsState.valuesFor(DnsState.create(), record);
        result.domain = 'example.com';
        if (record.id === 'DKIM') {
            result.publicKey = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDtest';
        }
        return result;
    };

    const set = R.buildSet('example.com', '3600', values);
    eq(set.skipped.length, 0, 'пропущены: ' + set.skipped.join(', '));
    eq(set.lines.length, R.setupSet.length);
});

test('набор не содержит незаполненных записей и сообщает о них', () => {
    const values = record => {
        const result = DnsState.valuesFor(DnsState.create(), record);
        if (record.id === 'DKIM') {
            result.publicKey = '';
        }
        return result;
    };

    const set = R.buildSet('example.com', '3600', values);
    eq(set.skipped.join(','), 'DKIM', 'DKIM без ключа должен быть пропущен');
    ok(!set.lines.some(line => line.indexOf('DKIM1') !== -1),
        'запись DKIM попала в набор без ключа');
    eq(set.lines.length, R.setupSet.length - 1);
});

test('записи набора не содержат сырых переводов строк', () => {
    // Каждая строка набора должна помещаться в одну запись зоны. Разбиение
    // на сегменты допустимо внутри TXT-кавычек, но перенос строки между
    // записями превратился бы в лишнюю запись при вставке в панель.
    const values = record => {
        const result = DnsState.valuesFor(DnsState.create(), record);
        if (record.id === 'DKIM') {
            result.publicKey = 'MIGfMA0';
        }
        return result;
    };

    const set = R.buildSet('example.com', '3600', values);
    set.lines.forEach(line => {
        ok(!/\n/.test(line), 'строка набора содержит перевод строки: ' + JSON.stringify(line));
    });
});

suite('Разметка: блок базового набора');

test('в разметке есть все элементы блока набора', () => {
    ['build-set-button', 'setup-output', 'copy-set-button', 'setup-feedback'].forEach(id => {
        ok(doc.getElementById(id), 'нет элемента ' + id);
    });
});

test('кнопка сбора — настоящая кнопка, а не ссылка', () => {
    const button = doc.getElementById('build-set-button');
    eq(button.tagName, 'BUTTON');
    eq(button.getAttribute('type'), 'button', 'кнопка отправит форму при клике');
});

test('поле набора доступно только для чтения', () => {
    const output = doc.getElementById('setup-output');
    eq(output.tagName, 'TEXTAREA');
    ok(output.hasAttribute('readonly'), 'поле набора должно быть только для чтения');
});

test('кнопка копирования набора изначально заблокирована', () => {
    // До сборки набора копировать нечего: блокировка не должна сниматься
    // просто потому, что элемент отрисован статически.
    eq(doc.getElementById('copy-set-button').disabled, true);
});

test('у блока набора есть подпись и пояснение', () => {
    const titles = doc.querySelectorAll('.dnsr-block__title');
    const found = Array.from(titles).some(t => t.textContent.indexOf('Базовый набор') !== -1);
    ok(found, 'нет заголовка блока базового набора');

    const hint = doc.querySelector('.dnsr-block__hint');
    ok(hint && hint.textContent.trim().length > 40, 'нет пояснения к набору');
});

test('подсказки полей совпадают со схемой', () => {
    // datalist статичен, а список подсказок живёт в records.js. Расхождение
    // не ломает интерфейс, но подсказки молча перестают появляться.
    const problems = [];
    R.all.forEach(record => {
        record.fields.forEach(field => {
            if (!field.suggestions) {
                return;
            }
            const list = doc.getElementById('f-' + record.id + '-' + field.name + '-options');
            if (!list) {
                problems.push(record.id + '.' + field.name + ': нет datalist');
                return;
            }
            const shown = Array.from(list.querySelectorAll('option')).map(o => o.value);
            const missing = field.suggestions.filter(item => !shown.includes(item));
            if (missing.length) {
                problems.push(record.id + '.' + field.name + ': нет подсказок ' +
                    missing.join(', '));
            }
            const extra = shown.filter(item => !field.suggestions.includes(item));
            if (extra.length) {
                problems.push(record.id + '.' + field.name + ': лишние подсказки ' +
                    extra.join(', '));
            }
        });
    });
    eq(problems.join(' | '), '');
});


    test('панель DKIM содержит элементы генерации ключей', () => {
        ['private-key', 'generate-key', 'download-key', 'copy-key', 'hide-key', 'key-feedback']
            .forEach(name => {
                ok(doc.getElementById('DKIM-' + name), 'нет элемента DKIM-' + name);
            });
    });
}

suite('Разметка: разметка не генерируется в JavaScript');

test('в скриптах нет создания HTML', () => {
    const scripts = ['app.js', 'records.js', 'validators.js', 'state.js']
        .map(name => fs.readFileSync(
            path.join(__dirname, '..', 'DnsRecordGenerator', 'Scripts', name), 'utf8'));

    scripts.forEach((source, index) => {
        const name = ['app.js', 'records.js', 'validators.js', 'state.js'][index];
        const forbidden = ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write'];
        forbidden.forEach(api => {
            ok(source.indexOf(api) === -1,
                name + ' использует ' + api + ' — разметка не должна создаваться в скриптах');
        });
    });
});

test('в скриптах нет сборки HTML из строк', () => {
    const appJs = fs.readFileSync(
        path.join(__dirname, '..', 'DnsRecordGenerator', 'Scripts', 'app.js'), 'utf8');

    // Признак конкатенации разметки: строковый литерал с «<» и закрывающим тегом
    const markupLiterals = appJs.match(/['"]<\/?(div|section|label|input|select|textarea|span|p|button|ul)\b[^'"]*>/g) || [];
    eq(markupLiterals.join(' '), '', 'в app.js собирается разметка');
});

test('в разметке есть описания типов записей', () => {
    R.all.forEach(record => {
        ok(view.indexOf(record.title) !== -1, 'нет заголовка типа ' + record.id);
        ok(view.indexOf(record.description.slice(0, 40)) !== -1,
            'нет описания типа ' + record.id);
    });
});

test('сообщения об ошибке не предлагают то, чего сделать нельзя', () => {
    // Поле ключа DKIM заполняется только генератором. Если подсказка
    // предлагает вставить свой ключ, пользователь потратит время впустую.
    R.all.forEach(record => {
        if (typeof record.validate !== 'function') {
            return;
        }
        const values = {};
        record.fields.forEach(field => {
            values[field.name] = field.value;
        });
        const error = record.validate(values, 'example.com', record, '3600');
        if (!error) {
            return;
        }

        const readonlyFields = record.fields.filter(field => field.readonly);
        if (!readonlyFields.length) {
            return;
        }
        // Сообщение не должно предлагать ввод в поле, доступное только для чтения
        ok(!/встав|заполните поле|введите ключ/i.test(error),
            record.id + ': сообщение предлагает изменить поле, доступное только для чтения — ' + error);
    });
});

test('описания заданы терминно, а не разговорно', () => {
    // Описания обращаются к назначению записи и стандарту, а не объясняют
    // действие пользователя. Разговорные формулировки быстро расходятся.
    const colloquial = [
        'почта уходит', 'переходит на', 'нужен чтобы', 'чтобы письма',
        'показывает рядом', 'просто введите', 'если хотите'
    ];

    R.all.forEach(record => {
        const lower = record.description.toLowerCase();
        colloquial.forEach(phrase => {
            ok(lower.indexOf(phrase) === -1,
                record.id + ': разговорная формулировка «' + phrase + '»');
        });
        ok(/RFC\s\d+/.test(record.description) || record.id === 'TXT' || record.id === 'A',
            record.id + ': описание не ссылается на стандарт');
    });
});

test('у всех панелей одинаковый заголовок блока описания', () => {
    const titles = view.match(/<span class="dnsr-description__title">[^<]*<\/span>/g) || [];
    eq(titles.length, R.all.length, 'число блоков описания не совпадает с числом типов');
    const unique = new Set(titles);
    eq(unique.size, 1, 'заголовки блоков описания различаются: ' + [...unique].join(' / '));
});