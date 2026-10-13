const { suite, test, eq, ok } = require('./runner');
const { loadDom, VIEW } = require('./dom-harness');

const PAYLOADS = [
    '', ' ', '"', '\\', '<script>alert(1)</script>', '<img src=x onerror=alert(1)>',
    "javascript:alert('1')", '${jndi:ldap://evil}', 'x'.repeat(300), 'null', 'NaN'
];

const dom = loadDom();

suite('Интерфейс');

test('разметка представления не содержит сырых конструкций Razor', () => {
    const source = require('fs').readFileSync(VIEW, 'utf8');
    const stripped = source.replace(/@\{[\s\S]*?\}/g, '').replace(/@Url\.Action\([^)]*\)/g, '');
    ok(stripped.indexOf('@') === -1 || !/(^|\s)@[A-Za-z]/.test(stripped),
        'в разметке остались неразобранные выражения Razor');
});

test('подключены только собственные скрипты и стили', () => {
    const source = require('fs').readFileSync(VIEW, 'utf8');
    const external = source.match(/(src|href)="https?:\/\/[^"]+"/g) || [];
    eq(external.length, 0, 'найдены внешние ресурсы: ' + external.join(', '));
});

if (!dom) {
    test('DOM-тесты пропущены: не установлен jsdom', () => {
        ok(true, '');
    });
    console.log('\n  примечание: для DOM-тестов выполните npm install jsdom в корне проекта');
} else {
    const { window } = dom;
    const doc = window.document;

    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

    const records = window.eval('DnsRecords');
    const tab = id => doc.getElementById('tab-' + id);
    const fire = element => {
        element.dispatchEvent(new window.Event('input'));
        element.dispatchEvent(new window.Event('change'));
    };

    const isInvalid = name => {
        const field = doc.querySelector('[data-field="' + name + '"]');
        return !!field && field.classList.contains('field--invalid');
    };

    const withDom = fn => {
        const result = fn();
        if (!dom) {
            throw new Error('jsdom недоступен');
        }
        return result;
    };

    test('отрисованы все 12 вкладок типов записей', () => {
        eq(doc.querySelectorAll('.tab').length, 12);
        eq(tab('MX').getAttribute('aria-selected'), 'true');
    });

    test('каждая вкладка даёт готовую запись сразу', () => {
        records.all.forEach(record => {
            tab(record.id).dispatchEvent(new window.Event('click'));
            ok(doc.getElementById('output').value.length > 0,
                record.id + ': запись пуста — ' + doc.getElementById('output').value);
        });
    });

    test('у каждого поля есть подпись и подсказка', () => {
        const missing = [];
        records.all.forEach(record => {
            tab(record.id).dispatchEvent(new window.Event('click'));
            doc.querySelectorAll('#params .field').forEach(field => {
                if (!field.querySelector('.field__label, .choice')) missing.push(record.id + '.' + field.dataset.field);
                if (!field.querySelector('.field__hint')) missing.push('hint:' + record.id + '.' + field.dataset.field);
            });
        });
        eq(missing.join(','), '');
    });

    test('домен подставляется во все 12 типов', () => {
        const domain = doc.getElementById('domain');
        domain.value = 'mydomain.by';
        fire(domain);
        const wrong = [];
        records.all.forEach(record => {
            tab(record.id).dispatchEvent(new window.Event('click'));
            if (doc.getElementById('output').value.indexOf('mydomain.by') === -1) wrong.push(record.id);
        });
        eq(wrong.join(','), '');
        domain.value = 'example.com';
        fire(domain);
    });

    test('пустой поддомен даёт запись в корне домена', () => {
        tab('MX').dispatchEvent(new window.Event('click'));
        const host = doc.getElementById('f-host');
        host.value = '';
        fire(host);
        eq(doc.getElementById('output').value, '10 example.com.');
    });

    test('предпросмотр имени записи обновляется', () => {
        const host = doc.getElementById('f-host');
        host.value = 'mail';
        fire(host);
        eq(doc.getElementById('p-host').textContent, 'Будет создано: mail.example.com.');
    });

    test('неверное значение помечает поле и блокирует копирование', () => {
        tab('SRV').dispatchEvent(new window.Event('click'));
        const port = doc.getElementById('f-port');
        port.value = '70000';
        fire(port);
        ok(isInvalid('port'), 'поле порта не помечено');
        eq(doc.getElementById('output').value, '');
        eq(doc.getElementById('copy-button').disabled, true);
    });

    test('исправление значения снимает ошибку', () => {
        const port = doc.getElementById('f-port');
        port.value = '993';
        fire(port);
        ok(!isInvalid('port'), 'ошибка не снята');
        eq(doc.getElementById('copy-button').disabled, false);
    });

    test('неверный домен помечает поле и блокирует все записи', () => {
        const domain = doc.getElementById('domain');
        domain.value = 'не домен';
        fire(domain);
        ok(doc.getElementById('domain-field').classList.contains('field--invalid'), 'домен не помечен');
        records.all.forEach(record => {
            tab(record.id).dispatchEvent(new window.Event('click'));
            eq(doc.getElementById('output').value, '', record.id);
        });
        domain.value = 'example.com';
        fire(domain);
    });

    test('панель DKIM показывает генерацию ключей', () => {
        tab('DKIM').dispatchEvent(new window.Event('click'));
        ok(doc.getElementById('generate-key') !== null, 'нет кнопки генерации');
        eq(doc.getElementById('download-key').disabled, true);
        eq(doc.getElementById('copy-key').disabled, true);
    });

    test('раскрывающиеся поля BIMI следуют за чекбоксом', () => {
        tab('BIMI').dispatchEvent(new window.Event('click'));
        const toggle = doc.getElementById('f-useCertificate');
        eq(doc.querySelector('[data-field="certificate"]').hidden, true);
        toggle.checked = true;
        fire(toggle);
        eq(doc.querySelector('[data-field="certificate"]').hidden, false);
        ok(doc.getElementById('output').value.indexOf('a=https://') !== -1,
            doc.getElementById('output').value);
    });

    test('раскрывающееся поле A показывает IPv6 по чекбоксу', () => {
        tab('A').dispatchEvent(new window.Event('click'));
        const toggle = doc.getElementById('f-includeIpv6');
        eq(doc.querySelector('[data-field="ipv6"]').hidden, true);
        toggle.checked = true;
        fire(toggle);
        eq(doc.querySelector('[data-field="ipv6"]').hidden, false);
        eq(doc.getElementById('output').value,
            'mail.example.com. A 192.168.1.10\nmail.example.com. AAAA 2001:db8::1');
    });

    test('SPF требует хотя бы один механизм или провайдера', () => {
        tab('SPF').dispatchEvent(new window.Event('click'));
        const ips = doc.getElementById('f-ips');
        ips.value = '';
        fire(ips);
        ['mx', 'a'].forEach(key => {
            const box = doc.querySelector('[data-owner="mechanisms"][data-option="' + key + '"]');
            box.checked = false;
            fire(box);
        });
        ok(doc.getElementById('record-error').hidden === false, 'не показана ошибка уровня записи');
        eq(doc.getElementById('copy-button').disabled, true);
    });

    test('мусорные значения не ломают интерфейс', () => {
        const problems = [];
        records.all.forEach(record => {
            tab(record.id).dispatchEvent(new window.Event('click'));
            doc.querySelectorAll('#params input, #params select, #params textarea').forEach(control => {
                PAYLOADS.forEach(payload => {
                    try {
                        if (control.type === 'checkbox') {
                            control.checked = payload.length % 2 === 0;
                        } else {
                            control.value = payload;
                        }
                        fire(control);
                    } catch (error) {
                        problems.push(record.id + '.' + control.id + ': ' + error.message);
                    }
                });
            });
        });
        eq(problems.slice(0, 3).join(' | '), '');
    });

    test('пользовательский ввод не попадает в разметку как HTML', () => {
        const markupSurfaces = [
            'record-title', 'record-description', 'params', 'key-panel-host', 'extra-outputs'
        ];
        const problems = [];

        records.all.forEach(record => {
            tab(record.id).dispatchEvent(new window.Event('click'));
            doc.querySelectorAll('#params input, #params select, #params textarea').forEach(control => {
                if (control.type === 'checkbox') {
                    return;
                }
                control.value = '<img src=x onerror=alert(1)>';
                fire(control);
                markupSurfaces.forEach(id => {
                    const node = doc.getElementById(id);
                    if (!node) {
                        return;
                    }
                    const html = node.innerHTML;
                    if (/<script/i.test(html) || /<img[^>]*onerror/i.test(html)) {
                        problems.push(record.id + ' -> #' + id + ': внедрён HTML');
                    }
                });
            });
        });
        eq(problems.slice(0, 3).join(' | '), '');
    });

    test('пользовательский ввод попадает в поле результата как обычный текст', () => {
        tab('TXT').dispatchEvent(new window.Event('click'));
        doc.getElementById('reset-button').dispatchEvent(new window.Event('click'));
        const value = doc.getElementById('f-value');
        value.value = '<script>alert(1)</script>';
        fire(value);
        const output = doc.getElementById('output');
        // textarea хранит значение как текст: разметка не создаётся, символы сохраняются
        ok(output.value.indexOf('<script>alert(1)</script>') !== -1,
            'текст не отражён в результате: ' + output.value);
        ok(output.innerHTML.indexOf('<script>alert(1)</script>') === -1,
            'в разметке результата появился исполняемый HTML: ' + output.innerHTML);
    });

    test('HTML-экранирование не портит содержимое записи', () => {
        tab('TXT').dispatchEvent(new window.Event('click'));
        doc.getElementById('reset-button').dispatchEvent(new window.Event('click'));
        const value = doc.getElementById('f-value');
        // Амперсанд — валидный символ TXT-записи, его нельзя превращать в &amp;
        value.value = 'url=https://example.com/logo.svg?a=1&b=2';
        fire(value);
        const output = doc.getElementById('output').value;
        ok(output.indexOf('a=1&b=2') !== -1, 'амперсанд искажён: ' + output);
        ok(output.indexOf('&amp;') === -1, 'HTML-сущности попали в запись: ' + output);
    });

    test('кнопка «Очистить» восстанавливает значения по умолчанию', () => {
        records.all.forEach(record => {
            tab(record.id).dispatchEvent(new window.Event('click'));
            doc.querySelectorAll('#params input').forEach(control => {
                if (control.type === 'checkbox') {
                    return;
                }
                control.value = 'МУСОР';
                fire(control);
            });
            doc.getElementById('reset-button').dispatchEvent(new window.Event('click'));
            ok(doc.getElementById('output').value.length > 0, record.id + ': после сброса запись пуста');
        });
    });

    test('навигация стрелками переключает вкладки', () => {
        tab('AAAA').dispatchEvent(new window.Event('click'));
        tab('AAAA').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        eq(tab('TXT').getAttribute('aria-selected'), 'true');
    });

    test('описание назначения записи отображается под блоком', () => {
        records.all.forEach(record => {
            tab(record.id).dispatchEvent(new window.Event('click'));
            ok(doc.getElementById('record-description').textContent.length > 50, record.id);
        });
    });

    test('у каждого поля ввода есть предел длины', () => {
        // Поведенческая замена разбора MAX_LENGTH в исходном коде:
        // проверяем отрендеренный DOM всех 12 записей.
        const problems = [];
        records.all.forEach(record => {
            tab(record.id).dispatchEvent(new window.Event('click'));
            doc.querySelectorAll('#params input, #params textarea').forEach(control => {
                if (control.type === 'checkbox' || control.readOnly) {
                    return;
                }
                if (!(control.maxLength > 0)) {
                    problems.push(record.id + ' -> #' + control.id);
                }
            });
        });
        eq(problems.join(' | '), '');
    });

    test('состояние переживает смену вкладок', () => {
        tab('TXT').dispatchEvent(new window.Event('click'));
        const value = doc.getElementById('f-value');
        value.value = 'сохранённое-значение';
        fire(value);
        tab('MX').dispatchEvent(new window.Event('click'));
        tab('TXT').dispatchEvent(new window.Event('click'));
        eq(doc.getElementById('f-value').value, 'сохранённое-значение');
    });

    test('кириллический домен превращается в punycode сквозняком', () => {
        const domain = doc.getElementById('domain');
        domain.value = 'пример.бел';
        fire(domain);
        tab('MX').dispatchEvent(new window.Event('click'));
        const output = doc.getElementById('output').value;
        ok(output.length > 0, 'запись не собрана');
        ok(output.indexOf('xn--e1afmkfd.xn--90ais') !== -1, output);
        ok(doc.getElementById('copy-button').disabled === false, 'копирование заблокировано');
    });

    test('панель DKIM содержит кнопку скрытия ключа', () => {
        tab('DKIM').dispatchEvent(new window.Event('click'));
        const hide = doc.getElementById('hide-key');
        ok(hide, 'нет кнопки hide-key');
        eq(hide.disabled, true, 'кнопка скрытия активна без ключа');
        ok(doc.getElementById('f-private-key'), 'нет поля приватного ключа');
        ok(doc.querySelector('.key-panel__warning').textContent.length > 20,
            'нет предупреждения о тайне ключа');
    });

    void withDom;
}