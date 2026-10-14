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
    const field = (recordId, name) => doc.getElementById('f-' + recordId + '-' + name);
    const fire = element => {
        element.dispatchEvent(new window.Event('input'));
        element.dispatchEvent(new window.Event('change'));
    };

    // Поле ищется внутри своей панели: разметка статична, и одноимённые
    // поля есть, например, у MX, A и TXT одновременно.
    const panelField = (recordId, name) =>
        doc.querySelector('#panel-' + recordId + ' [data-field="' + name + '"]');

    const isInvalid = (recordId, name) => {
        const element = panelField(recordId, name);
        return !!element && element.classList.contains('dnsr-field--invalid');
    };

    // Запись DKIM не собирается без публичного ключа: пустой p= означает
    // его отзыв. Генерация ключей требует WebCrypto, которого нет в jsdom,
    // поэтому ключ подставляется прямо в поле.
    const DKIM_KEY = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDplaceholder';
    const giveDkimKey = () => {
        const box = field('DKIM', 'publicKey');
        box.value = DKIM_KEY;
        fire(box);
    };

    const withDom = fn => {
        const result = fn();
        if (!dom) {
            throw new Error('jsdom недоступен');
        }
        return result;
    };

    test('отрисованы все 11 вкладок типов записей', () => {
        eq(doc.querySelectorAll('.dnsr-tab').length, 11);
        eq(tab('MX').getAttribute('aria-selected'), 'true');
    });

    test('каждая вкладка даёт готовую запись сразу', () => {
        records.all.forEach(record => {
            tab(record.id).dispatchEvent(new window.Event('click'));
            if (record.id === 'DKIM') {
                giveDkimKey();
            }
            ok(doc.getElementById('output').value.length > 0,
                record.id + ': запись пуста — ' + doc.getElementById('output').value);
        });
    });

    test('у каждого поля есть подпись и подсказка', () => {
        const missing = [];
        records.all.forEach(record => {
            tab(record.id).dispatchEvent(new window.Event('click'));
            doc.querySelectorAll('#params .dnsr-field').forEach(field => {
                if (!field.querySelector('.dnsr-field__label, .dnsr-choice')) missing.push(record.id + '.' + field.dataset.field);
                if (!field.querySelector('.dnsr-field__hint')) missing.push('hint:' + record.id + '.' + field.dataset.field);
            });
        });
        eq(missing.join(','), '');
    });

    test('домен подставляется во все 11 типов', () => {
        const domain = doc.getElementById('domain');
        domain.value = 'mydomain.by';
        fire(domain);
        const wrong = [];
        records.all.forEach(record => {
            tab(record.id).dispatchEvent(new window.Event('click'));
            if (record.id === 'DKIM') {
                giveDkimKey();
            }
            if (doc.getElementById('output').value.indexOf('mydomain.by') === -1) wrong.push(record.id);
        });
        eq(wrong.join(','), '');
        domain.value = 'example.com';
        fire(domain);
    });

    test('пустой поддомен даёт запись в корне домена', () => {
        tab('MX').dispatchEvent(new window.Event('click'));
        const host = field('MX', 'host');
        host.value = '';
        fire(host);
        eq(doc.getElementById('output').value, '@ 3600 MX 10 example.com.');
    });

    test('предпросмотр имени записи обновляется', () => {
        const host = field('MX', 'host');
        host.value = 'mail';
        fire(host);
        eq(doc.getElementById('p-MX-host').textContent, 'Будет создано: mail.example.com.');
    });

    test('неверное значение помечает поле и блокирует копирование', () => {
        tab('SRV').dispatchEvent(new window.Event('click'));
        const port = field('SRV', 'port');
        port.value = '70000';
        fire(port);
        ok(isInvalid('SRV', 'port'), 'поле порта не помечено');
        eq(doc.getElementById('output').value, '');
        eq(doc.getElementById('copy-button').disabled, true);
    });

    test('исправление значения снимает ошибку', () => {
        const port = field('SRV', 'port');
        port.value = '993';
        fire(port);
        ok(!isInvalid('SRV', 'port'), 'ошибка не снята');
        eq(doc.getElementById('copy-button').disabled, false);
    });

    test('неверный домен помечает поле и блокирует все записи', () => {
        const domain = doc.getElementById('domain');
        domain.value = 'не домен';
        fire(domain);
        ok(doc.getElementById('domain-field').classList.contains('dnsr-field--invalid'), 'домен не помечен');
        records.all.forEach(record => {
            tab(record.id).dispatchEvent(new window.Event('click'));
            eq(doc.getElementById('output').value, '', record.id);
        });
        domain.value = 'example.com';
        fire(domain);
    });

    test('панель DKIM показывает генерацию ключей', () => {
        tab('DKIM').dispatchEvent(new window.Event('click'));
        ok(doc.getElementById('DKIM-generate-key') !== null, 'нет кнопки генерации');
        eq(doc.getElementById('DKIM-download-key').disabled, true);
        eq(doc.getElementById('DKIM-copy-key').disabled, true);
    });

    test('раскрывающиеся поля BIMI следуют за чекбоксом', () => {
        tab('BIMI').dispatchEvent(new window.Event('click'));
        const toggle = field('BIMI', 'useCertificate');
        eq(doc.querySelector('[data-field="certificate"]').hidden, true);
        toggle.checked = true;
        fire(toggle);
        eq(doc.querySelector('[data-field="certificate"]').hidden, false);
        ok(doc.getElementById('output').value.indexOf('a=https://') !== -1,
            doc.getElementById('output').value);
    });

    test('раскрывающееся поле A показывает IPv6 по чекбоксу', () => {
        tab('A').dispatchEvent(new window.Event('click'));
        const toggle = field('A', 'includeIpv6');
        eq(doc.querySelector('[data-field="ipv6"]').hidden, true);
        toggle.checked = true;
        fire(toggle);
        eq(doc.querySelector('[data-field="ipv6"]').hidden, false);
        eq(doc.getElementById('output').value,
            'mail.example.com. 3600 A 192.168.1.10\nmail.example.com. 3600 AAAA 2001:db8::1');
    });

    test('SPF требует хотя бы один механизм или провайдера', () => {
        tab('SPF').dispatchEvent(new window.Event('click'));
        const ips = field('SPF', 'ips');
        ips.value = '';
        fire(ips);
        ['mx', 'a'].forEach(key => {
            const box = doc.querySelector('[data-owner="mechanisms"][data-option="' + key + '"]');
            box.checked = false;
            fire(box);
        });
        ok(doc.getElementById('error-SPF').hidden === false, 'не показана ошибка уровня записи');
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
        const value = field('TXT', 'value');
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
        const value = field('TXT', 'value');
        // Амперсанд — валидный символ TXT-записи, его нельзя превращать в &amp;
        value.value = 'url=https://example.com/logo.svg?a=1&b=2';
        fire(value);
        const output = doc.getElementById('output').value;
        ok(output.indexOf('a=1&b=2') !== -1, 'амперсанд искажён: ' + output);
        ok(output.indexOf('&amp;') === -1, 'HTML-сущности попали в запись: ' + output);
    });

    test('кнопка «Сбросить» восстанавливает значения по умолчанию', () => {
        records.all.forEach(record => {
            tab(record.id).dispatchEvent(new window.Event('click'));

            // Мусор подставляем только в свою панель: панели всех типов
            // присутствуют в документе одновременно.
            panelField(record.id, 'x');
            const panel = doc.getElementById('panel-' + record.id);
            panel.querySelectorAll('input').forEach(control => {
                if (control.type === 'checkbox' || control.readOnly) {
                    return;
                }
                control.value = 'МУСОР';
                fire(control);
            });

            doc.getElementById('reset-button').dispatchEvent(new window.Event('click'));
            if (record.id === 'DKIM') {
                giveDkimKey();
            }
            ok(doc.getElementById('output').value.length > 0, record.id + ': после сброса запись пуста');
        });
    });

    test('навигация стрелками переключает вкладки', () => {
        tab('BIMI').dispatchEvent(new window.Event('click'));
        tab('BIMI').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        eq(tab('TXT').getAttribute('aria-selected'), 'true');
    });

    test('описание назначения записи отображается под блоком', () => {
        records.all.forEach(record => {
            tab(record.id).dispatchEvent(new window.Event('click'));
            ok(doc.querySelector('#panel-MX .dnsr-description').textContent.length > 50, record.id);
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
        const value = field('TXT', 'value');
        value.value = 'сохранённое-значение';
        fire(value);
        tab('MX').dispatchEvent(new window.Event('click'));
        tab('TXT').dispatchEvent(new window.Event('click'));
        eq(field('TXT', 'value').value, 'сохранённое-значение');
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

    test('TTL выбирается на общей странице и подставляется в записи', () => {
        const ttl = doc.getElementById('ttl');
        ok(ttl, 'нет переключателя TTL');
        const options = Array.from(ttl.options).map(o => o.value);
        eq(options.join(','), '300,3600,14400,86400,604800');
        eq(ttl.value, '3600', 'значение по умолчанию');

        const domain = doc.getElementById('domain');
        domain.value = 'example.com';
        fire(domain);

        ttl.value = '300';
        ttl.dispatchEvent(new window.Event('change'));
        tab('MX').dispatchEvent(new window.Event('click'));
        eq(doc.getElementById('output').value, '@ 300 MX 10 mail.example.com.');

        ttl.value = '3600';
        ttl.dispatchEvent(new window.Event('change'));
    });

    test('кнопка сброса называется «Сбросить»', () => {
        eq(doc.getElementById('reset-button').textContent.trim(), 'Сбросить');
    });

    test('описание типа показывается под заголовком, а не под результатом', () => {
        const title = doc.querySelector('#panel-MX .dnsr-block__title');
        const description = doc.querySelector('#panel-MX .dnsr-description');
        ok(description, 'нет блока описания');
        const titleTop = title.getBoundingClientRect ? 0 : 0;
        // В разметке описание идёт раньше результата
        const html = doc.body.innerHTML;
        ok(html.indexOf('record-description') < html.indexOf('id="output"'),
            'описание должно быть над блоком результата');
    });

    test('вкладка A объединена с AAAA', () => {
        eq(doc.getElementById('tab-AAAA'), null, 'отдельная вкладка AAAA осталась');
        ok(doc.getElementById('tab-A'), 'нет вкладки A');
        tab('A').dispatchEvent(new window.Event('click'));
        eq(doc.querySelector('#tab-A').textContent, 'A/AAAA');
        ok(field('A', 'includeIpv6'), 'нет галочки IPv6 в объединённой вкладке');
        ok(field('A', 'ipv6'), 'нет поля IPv6 в объединённой вкладке');
    });

    test('поля со значением по умолчанию из текущей даты обновляются при загрузке', () => {
        // ID политики MTA-STS вычисляется при загрузке records.js, то есть на
        // каждый заход страницы. В статической разметке он заморожен на момент
        // сборки, поэтому скрипт обязан переписать его сразу при старте.
        // Проверяем на отдельном документе: общий к этому моменту уже сбрасывался
        // другими тестами и поле успело синхронизироваться.
        // Сравнение с допуском: секунда может перекатиться между вычислением
        // значения в схеме и чтением поля.
        const fresh = loadDom();
        fresh.window.document.dispatchEvent(new fresh.window.Event('DOMContentLoaded'));

        const toTime = stamp => {
            const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(stamp);
            ok(m, 'не формат даты YYYYMMDDTHHMMSS: ' + stamp);
            return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
        };

        const input = fresh.window.document.getElementById('f-MTA-STS-id');
        const expected = records.find('MTA-STS').fields
            .find(f => f.name === 'id').value;

        ok(input, 'нет поля ID политики');
        ok(Math.abs(toTime(input.value) - toTime(expected)) <= 2000,
            'поле показывает дату из разметки, а не текущую: ' +
            input.value + ' против ' + expected);
    });

    test('после сброса значения не теряют ссылку на объект состояния', () => {
        // Регрессия: обработчики держали ссылку на объект значений, который
        // DnsState заменял при сбросе, — после сброса ввод переставал работать.
        tab('SPF').dispatchEvent(new window.Event('click'));
        const ips = field('SPF', 'ips');
        ips.value = '10.0.0.1';
        fire(ips);
        ok(doc.getElementById('output').value.indexOf('ip4:10.0.0.1') !== -1,
            'изменение поля не попало в запись');

        doc.getElementById('reset-button').dispatchEvent(new window.Event('click'));
        field('SPF', 'ips').value = '10.0.0.2';
        fire(field('SPF', 'ips'));
        ok(doc.getElementById('output').value.indexOf('ip4:10.0.0.2') !== -1,
            'после сброса поле перестало влиять на запись');
    });

    test('после сброса DKIM поля панели снова отвечают', () => {
        tab('DKIM').dispatchEvent(new window.Event('click'));
        doc.getElementById('reset-button').dispatchEvent(new window.Event('click'));
        ok(doc.getElementById('DKIM-hide-key').disabled,
            'кнопка скрытия активна без ключа');

        const selector = field('DKIM', 'selector');
        selector.value = 'test';
        fire(selector);
        eq(doc.getElementById('p-DKIM-selector'), null, 'у селектора нет превью');

        giveDkimKey();
        ok(doc.getElementById('output').value.indexOf('test._domainkey.') !== -1,
            'после сброса поле селектора перестало работать');
    });

    test('после сброса отчёт о ключе не остаётся на пустых полях', () => {
        // Сообщение «Пара ключей создана» относится к старому состоянию:
        // после сброса полей пусты, и отчёт вводит в заблуждение.
        tab('DKIM').dispatchEvent(new window.Event('click'));
        giveDkimKey();
        const feedback = doc.getElementById('DKIM-key-feedback');
        feedback.textContent = 'Пара ключей 2048 бит создана в браузере';
        feedback.className = 'feedback feedback--success';

        doc.getElementById('reset-button').dispatchEvent(new window.Event('click'));
        eq(feedback.textContent.trim(), '', 'остался отчёт об уже сброшенном ключе');
        eq(field('DKIM', 'publicKey').value, '', 'поле публичного ключа не очищено');
        eq(doc.getElementById('output').value, '', 'запись DKIM выдана без ключа');
    });

    test('панель DKIM содержит кнопку скрытия ключа', () => {
        tab('DKIM').dispatchEvent(new window.Event('click'));
        const hide = doc.getElementById('DKIM-hide-key');
        ok(hide, 'нет кнопки hide-key');
        eq(hide.disabled, true, 'кнопка скрытия активна без ключа');
        ok(doc.getElementById('DKIM-private-key'), 'нет поля приватного ключа');
        ok(doc.querySelector('.dnsr-key-panel__warning').textContent.length > 20,
            'нет предупреждения о тайне ключа');
    });

    void withDom;
}