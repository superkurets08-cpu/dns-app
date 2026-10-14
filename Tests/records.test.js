const { suite, test, eq, ok } = require('./runner');
const { loadSources } = require('./harness');

const R = loadSources().DnsRecords;

const DOMAIN = 'example.com';
const TTL = '3600';

function defaults(id) {
    const record = R.find(id);
    const values = {};
    record.fields.forEach(field => {
        values[field.name] = typeof field.value === 'function'
            ? field.value(DOMAIN)
            : (field.type === 'checks' ? Object.assign({}, field.value) : field.value);
    });
    return { record, values };
}

function build(id, overrides, ttl) {
    const { record, values } = defaults(id);
    Object.assign(values, overrides);
    return record.build(values, DOMAIN, record, ttl === undefined ? TTL : ttl);
}

function txtSegments(recordLine) {
    return (recordLine.split(' TXT ')[1].match(/"[^"]*"/g) || []).map(s => s.slice(1, -1));
}

// Полный путь пользователя: проверки полей, проверка записи и только затем
// сборка. Так проверяется то, что реально попадёт в поле результата.
function verdict(id, overrides) {
    const { record, values } = defaults(id);
    Object.assign(values, overrides);

    let ready = true;
    record.fields.forEach(field => {
        if (field.type === 'check' || field.type === 'checks') {
            return;
        }
        if (field.revealedBy && !values[field.revealedBy]) {
            return;
        }
        if (field.value === undefined && field.name === 'keyMasked') {
            return;
        }
        const value = values[field.name];
        if (value === undefined || value === null || String(value).trim() === '') {
            if (!field.optional) {
                ready = false;
            }
            return;
        }
        (field.rules || []).forEach(rule => {
            if (!rule.test(value)) {
                ready = false;
            }
        });
    });

    const recordError = typeof record.validate === 'function'
        ? record.validate(values, DOMAIN, record, TTL)
        : null;

    if (recordError) {
        ready = false;
    }

    return {
        ready: ready,
        error: recordError,
        line: ready ? record.build(values, DOMAIN, record, TTL) : ''
    };
}

suite('Схема: состав типов записей');

test('объявлено ровно 11 типов записей', () => {
    eq(R.all.length, 11);
});

test('идентификаторы типов соответствуют заданию', () => {
    eq(R.all.map(r => r.id).join(','),
        'MX,A,SPF,DKIM,DMARC,MTA-STS,TLS-RPT,SRV,CNAME,BIMI,TXT');
});

test('набор параметров каждого типа соответствует заданию', () => {
    const expected = {
        MX: 'priority,host',
        A: 'host,ip,includeIpv6,ipv6',
        SPF: 'policy,ips,providers,mechanisms',
        DKIM: 'selector,keyLength,publicKey',
        DMARC: 'policy,pct,rua,ruf,aspf,adkim',
        'MTA-STS': 'mode,id,maxAge',
        'TLS-RPT': 'rua',
        SRV: 'service,protocol,target,priority,weight,port',
        CNAME: 'alias,target',
        BIMI: 'selector,logo,useCertificate,certificate',
        TXT: 'name,value'
    };
    R.all.forEach(record => {
        eq(record.fields.map(f => f.name).join(','), expected[record.id]);
    });
});

test('у каждого поля есть подпись', () => {
    R.all.forEach(record => {
        record.fields.forEach(field => {
            ok(typeof field.label === 'string' && field.label.length > 0, record.id + '.' + field.name);
        });
    });
});

test('у каждого поля есть подсказка по формату', () => {
    R.all.forEach(record => {
        record.fields.forEach(field => {
            ok(typeof field.hint === 'string' && field.hint.length > 10, record.id + '.' + field.name);
        });
    });
});

test('у каждого типа есть описание назначения', () => {
    R.all.forEach(record => {
        ok(record.description.length > 40, record.id);
    });
});

suite('Генерация: форматы из задания');

test('MX: приоритет и имя сервера', () => {
    eq(build('MX'), '@ 3600 MX 10 mail.example.com.');
    eq(build('MX', { priority: '0', host: '' }), '@ 3600 MX 0 example.com.');
});

test('TTL подставляется во все записи', () => {
    eq(build('MX', {}, '300'), '@ 300 MX 10 mail.example.com.');
    eq(build('A', {}, '86400'), 'mail.example.com. 86400 A 192.168.1.10');
    eq(build('TXT', {}, '604800'), 'example.com. 604800 TXT "google-site-verification=abc123"');
});

test('A/AAAA: имя и адрес IPv4', () => {
    eq(build('A'), 'mail.example.com. 3600 A 192.168.1.10');
});

test('A/AAAA: галочка IPv6 добавляет вторую строку AAAA', () => {
    eq(build('A', { includeIpv6: true }),
        'mail.example.com. 3600 A 192.168.1.10\nmail.example.com. 3600 AAAA 2001:db8::1');
});

test('A/AAAA: без галочки IPv6 остаётся одна строка', () => {
    eq(build('A', { includeIpv6: false }), 'mail.example.com. 3600 A 192.168.1.10');
});

test('SPF: собирается политика, адреса, провайдеры и механизмы', () => {
    eq(build('SPF'),
        'example.com. 3600 TXT "v=spf1 ip4:192.168.1.10 mx a ~all"');
});

test('SPF: механизмы ip6 собираются из адресов IPv6', () => {
    eq(build('SPF', { ips: 'ip6:2001:db8::1' }),
        'example.com. 3600 TXT "v=spf1 ip6:2001:db8::1 mx a ~all"');
    eq(build('SPF', { ips: '192.168.1.10, ip6:2001:db8::1' }),
        'example.com. 3600 TXT "v=spf1 ip4:192.168.1.10 ip6:2001:db8::1 mx a ~all"');
});

test('SPF: голый IPv6 получает префикс ip6, регистр нормализуется', () => {
    eq(build('SPF', { ips: '2001:DB8::1' }),
        'example.com. 3600 TXT "v=spf1 ip6:2001:DB8::1 mx a ~all"');
    eq(build('SPF', { ips: 'IP6:2001:db8::1' }),
        'example.com. 3600 TXT "v=spf1 ip6:2001:db8::1 mx a ~all"');
});

test('DMARC: кириллический адрес превращается в punycode', () => {
    eq(build('DMARC', { rua: 'dmarc@пример.рф' }),
        '_dmarc.example.com. 3600 TXT "v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@xn--e1afmkfd.xn--p1ai; aspf=r; adkim=r"');
});

test('BIMI: кириллический URL превращается в punycode', () => {
    const out = build('BIMI', { logo: 'https://пример.рф/logo.svg' });
    ok(out.indexOf('xn--e1afmkfd.xn--p1ai') !== -1, out);
    ok(out.indexOf('пример') === -1, out);
});

test('запись собирается целиком в ASCII при кириллическом домене', () => {
    const { record, values } = defaults('DMARC');
    const out = record.build(values, 'xn--e1afmkfd.xn--p1ai', record);
    eq(/[^\x00-\x7F]/.test(out), false, out);
    ok(out.startsWith('_dmarc.xn--e1afmkfd.xn--p1ai.'), out);
});

test('SPF: провайдеры добавляют свои include', () => {
    const record = build('SPF', {
        providers: { google: true, yandex: true, m365: false, mailgun: false, sendgrid: false },
        mechanisms: { mx: false, a: false }
    });
    ok(record.indexOf('include:_spf.google.com') !== -1, record);
    ok(record.indexOf('include:_spf.yandex.net') !== -1, record);
});

test('SPF: без механизмов провайдеров запись не собирается', () => {
    const { record, values } = defaults('SPF');
    values.ips = '';
    values.mechanisms = { mx: false, a: false };
    ok(record.validate(values), 'ожидалась ошибка валидации');
});

test('DKIM: селектор, поддомен и значение записи', () => {
    eq(build('DKIM'),
        'default._domainkey.example.com. 3600 TXT "v=DKIM1; k=rsa; p="');
});

test('DMARC: все теги в правильном порядке', () => {
    eq(build('DMARC'), '_dmarc.example.com. 3600 TXT "v=DMARC1; p=quarantine; pct=100; ' +
        'rua=mailto:dmarc@example.com; aspf=r; adkim=r"');
});

test('DMARC: без rua не остаётся пустых тегов с двойным двоеточием', () => {
    const record = build('DMARC', { rua: '' });
    ok(record.indexOf(';;') === -1, record);
    ok(record.indexOf('mailto:') === -1, record);
});

test('DMARC: ruf добавляется только когда заполнен', () => {
    eq(build('DMARC', { ruf: 'forensics@example.com' }).indexOf('ruf=mailto:forensics@example.com') !== -1, true);
});

test('MTA-STS: запись содержит только идентификатор политики', () => {
    const record = build('MTA-STS');
    ok(record.indexOf('_mta-sts.example.com. 3600 TXT "v=STSv1; id=') === 0, record);
});

test('MTA-STS: ID политики генерируется в формате YYYYMMDDTHHMMSS', () => {
    const id = build('MTA-STS').match(/id=(\d{8}T\d{6})"/);
    ok(id !== null, 'ID не соответствует формату');
});

test('MTA-STS: policy-файл собирается из полей формы', () => {
    const { record, values } = defaults('MTA-STS');
    const policy = record.extraOutputs[0].build(values, DOMAIN, record);
    eq(policy, 'version: STSv1\nmode: testing\nmx: mail.example.com\nmax_age: 86400\n');
});

test('MTA-STS: пустой max_age не оставляет пустой строки', () => {
    const { record, values } = defaults('MTA-STS');
    values.maxAge = '';
    const policy = record.extraOutputs[0].build(values, DOMAIN, record);
    eq(policy, 'version: STSv1\nmode: testing\nmx: mail.example.com\n');
});

test('TLS-RPT: адрес оборачивается в mailto', () => {
    eq(build('TLS-RPT'), '_smtp._tls.example.com. 3600 TXT "v=TLSRPTv1; rua=mailto:tls@example.com"');
});

test('SRV: служба, протокол, приоритет, вес, порт и хост', () => {
    eq(build('SRV'),
        '_autodiscover._tcp.example.com. 3600 SRV 0 0 443 autodiscover.example.com.');
});

test('SRV: заданный вес учитывается', () => {
    eq(build('SRV', { service: '_imap', protocol: '_tcp', weight: '10', port: '993' }),
        '_imap._tcp.example.com. 3600 SRV 0 10 993 autodiscover.example.com.');
});

test('CNAME: псевдоним и целевой домен с точкой', () => {
    eq(build('CNAME'), 'mail.example.com. 3600 CNAME mail.yandex.ru.');
});

test('BIMI: логотип и необязательный VMC-сертификат', () => {
    eq(build('BIMI'), 'default._bimi.example.com. 3600 TXT "v=BIMI1; l=https://example.com/logo.svg"');
    eq(build('BIMI', { useCertificate: true }),
        'default._bimi.example.com. 3600 TXT "v=BIMI1; l=https://example.com/logo.svg; a=https://example.com/cert.pem"');
});

test('BIMI: без сертификата не остаётся висячей точки с запятой', () => {
    ok(build('BIMI').indexOf(';"') === -1, build('BIMI'));
});

test('A/AAAA: отдельной вкладки AAAA больше нет', () => {
    eq(R.find('AAAA'), undefined, 'тип AAAA не должен быть отдельной записью');
});

test('TXT: имя @ даёт корень домена', () => {
    eq(build('TXT'), 'example.com. 3600 TXT "google-site-verification=abc123"');
    eq(build('TXT', { name: 'mail' }), 'mail.example.com. 3600 TXT "google-site-verification=abc123"');
});

suite('Генерация: подстановка домена');

test('домен подставляется во все 12 типов', () => {
    R.all.forEach(record => {
        const line = record.build(defaults(record.id).values, 'mydomain.by', record);
        ok(line.indexOf('mydomain.by') !== -1, record.id + ': ' + line);
    });
});

test('пустой поддомен даёт корень домена', () => {
    eq(R.fqdn('', 'example.com'), 'example.com.');
    eq(R.fqdn('@', 'example.com'), 'example.com.');
});

test('точка в конце поддомена не дублируется', () => {
    eq(R.fqdn('mail.', 'example.com'), 'mail.example.com.');
});

test('пробелы вокруг поддомена обрезаются', () => {
    eq(R.fqdn('  mail  ', 'example.com'), 'mail.example.com.');
});

suite('Корректность TXT по RFC 1035');

test('кавычки внутри значения экранируются', () => {
    eq(build('TXT', { value: 'note="привет"' }), 'example.com. 3600 TXT "note=\\"привет\\""');
});

test('обратные слэши экранируются', () => {
    eq(build('TXT', { value: 'path\\to\\file' }), 'example.com. 3600 TXT "path\\\\to\\\\file"');
});

test('строка только из спецсимволов остаётся корректной', () => {
    const line = build('TXT', { value: '"\\"' });
    eq((line.match(/"/g) || []).length % 2, 0);
});

test('пустое значение даёт пустую строку в кавычках', () => {
    eq(build('TXT', { value: '' }), 'example.com. 3600 TXT ""');
});

test('значение длиннее 255 байт разбивается на сегменты', () => {
    const segments = txtSegments(build('TXT', { value: 'x'.repeat(300) }));
    eq(segments.length, 2);
    segments.forEach(s => ok(Buffer.byteLength(s) <= 255, 'сегмент длиннее 255 байт'));
});

test('сегменты склеиваются обратно без потерь', () => {
    ['', 'a', 'x'.repeat(254), 'x'.repeat(255), 'x'.repeat(1000), 'ё'.repeat(300), '😀😀'.repeat(200)]
        .forEach(value => {
            const restored = txtSegments(build('TXT', { value })).join('')
                .replace(/\\(["\\])/g, '$1');
            eq(restored, value, 'значение: ' + JSON.stringify(value.slice(0, 20)));
        });
});

test('разбиение считает байты, а не символы', () => {
    const segments = txtSegments(build('TXT', { value: 'ё'.repeat(300) }));
    eq(segments.length, 3);
    segments.forEach(s => ok(Buffer.byteLength(s) <= 255, 'сегмент длиннее 255 байт'));
    eq(Buffer.byteLength('ё'.repeat(300)), 600);
});

suite('Устойчивость генерации');

const PAYLOADS = ['', ' ', '"', '\\', '\n', '<b>', 'null', 'NaN', 'x'.repeat(1000), '\u0000'];

test('ни один тип не падает на мусорных значениях', () => {
    R.all.forEach(record => {
        record.fields.forEach(field => {
            PAYLOADS.forEach(payload => {
                const values = defaults(record.id).values;
                if (field.type !== 'checks') {
                    values[field.name] = payload;
                }
                try {
                    const out = record.build(values, DOMAIN, record);
                    ok(typeof out === 'string', record.id + '.' + field.name);
                } catch (error) {
                    ok(false, record.id + '.' + field.name + ': ' + error.message);
                }
            });
        });
    });
});


const PLAIN = ['MX', 'A', 'SRV', 'CNAME'];

function unescapedQuotes(line) {
    // Сначала убираем экранированные последовательности: иначе перекрывающиеся
    // совпадения дают неверный счёт (например, TXT "" считался как одна кавычка).
    return (line.replace(/\\./g, '').match(/"/g) || []).length;
}

function passesValidation(field, value) {
    if (field.type === 'select') {
        return (field.options || []).some(option => option.value === value);
    }
    if (field.type === 'checks' || field.type === 'check') {
        return true;
    }
    return (field.rules || []).length > 0 && (field.rules || []).every(rule => rule.test(value));
}

test('любое достижимое значение даёт сбалансированную запись', () => {
    const samples = PAYLOADS.concat(['mail', '10', '192.168.1.1', 'example.com', 'note="x"']);

    R.all.forEach(record => {
        record.fields.forEach(field => {
            samples.forEach(value => {
                if (!passesValidation(field, value)) {
                    return;
                }
                const values = defaults(record.id).values;
                if (field.type !== 'checks') {
                    values[field.name] = value;
                }
                const line = record.build(values, DOMAIN, record);
                eq(unescapedQuotes(line) % 2, 0,
                    record.id + '.' + field.name + ' [' + value.slice(0, 12) + ']: ' + line.slice(0, 60));
            });
        });
    });
});

test('в списках выбора доступны только объявленные варианты', () => {
    R.all.forEach(record => {
        record.fields.forEach(field => {
            if (field.type !== 'select') {
                return;
            }
            field.options.forEach(option => {
                eq(passesValidation(field, option.value), true, record.id + '.' + field.name);
            });
            eq(passesValidation(field, '\\'), false, record.id + '.' + field.name + ' пропустил обратный слэш');
            eq(passesValidation(field, '"'), false, record.id + '.' + field.name + ' пропустил кавычку');
        });
    });
});

test('не-TXT записи защищены валидацией: кавычки в полях отвергаются', () => {
    PLAIN.forEach(id => {
        R.find(id).fields.forEach(field => {
            if (!field.rules) {
                return;
            }
            field.rules.forEach(rule => {
                eq(rule.test('"'), false, id + '.' + field.name + ' пропустил кавычку');
            });
        });
    });
});

test('у каждого свободного текстового поля есть правила валидации', () => {
    PLAIN.forEach(id => {
        R.find(id).fields.forEach(field => {
            if (field.type === 'select' || field.type === 'checks' || field.type === 'check') {
                return;
            }
            ok(field.rules && field.rules.length > 0,
                id + '.' + field.name + ' — свободное текстовое поле без правил валидации');
        });
    });
});
suite('Валидация: межполевые ограничения');

test('DKIM: без публичного ключа запись не выдаётся', () => {
    const result = verdict('DKIM');
    eq(result.ready, false, 'запись собрана без ключа');
    eq(result.line, '', 'поле результата не должно наполняться');
    ok(/p=/.test(result.error), 'в сообщении не объяснён смысл пустого p=: ' + result.error);
});

test('DKIM: пустой ключ не превращается в отзыв ключа', () => {
    // RFC 6376: «p=» с пустым значением означает отзыв ключа, а не его
    // отсутствие. Молчаливая выдача такой записи отключила бы подпись писем.
    const { record, values } = defaults('DKIM');
    const line = record.build(values, DOMAIN, record, TTL);
    ok(/p="$/.test(line), 'build всё ещё собирает запись с пустым p=: ' + line);
    eq(record.validate(values, DOMAIN, record, TTL) !== null, true,
        'validate должен блокировать такую запись');
});

test('DKIM: с ключом запись собирается', () => {
    const result = verdict('DKIM', { publicKey: 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDtest' });
    eq(result.ready, true, 'запись с ключом должна собираться');
    ok(result.line.indexOf('p=MIGfMA0G') !== -1, result.line);
});

test('A/AAAA: включённая галочка без адреса не остаётся без записи', () => {
    const result = verdict('A', { includeIpv6: true, ipv6: '' });
    eq(result.ready, false, 'AAAA молча потеряна');
    ok(/IPv6/.test(result.error), 'сообщение не объясняет проблему: ' + result.error);
});

test('A/AAAA: с адресом выдаются обе строки', () => {
    const result = verdict('A', { includeIpv6: true, ipv6: '2001:db8::1' });
    eq(result.ready, true);
    eq(result.line.split('\n').length, 2, result.line);
    ok(result.line.indexOf(' AAAA 2001:db8::1') !== -1, result.line);
});

test('A/AAAA: без галочки пустой адрес IPv6 не мешает', () => {
    eq(verdict('A', { includeIpv6: false, ipv6: '' }).ready, true);
});

test('CNAME: псевдоним, совпадающий с целью, отвергается', () => {
    const result = verdict('CNAME', { alias: 'mail', target: 'mail.example.com' });
    eq(result.ready, false, 'CNAME может указывать только на себя');
    ok(/сам на себя/.test(result.error), result.error);
});

test('CNAME: сравнение целей не зависит от регистра', () => {
    // DNS-имена регистронезависимы, поэтому WWW.EXAMPLE.COM и www.example.com —
    // одно и то же имя, и цикл всё равно образуется.
    const result = verdict('CNAME', { alias: 'www', target: 'WWW.EXAMPLE.COM' });
    eq(result.ready, false, 'цикл не распознан из-за регистра');
});

test('CNAME: нормальная цель принимается', () => {
    const result = verdict('CNAME', { alias: 'mail', target: 'mail.yandex.ru' });
    eq(result.ready, true, result.error || '');
});

test('SPF: без механизмов запись не выдаётся', () => {
    const result = verdict('SPF', { ips: '', mechanisms: {}, providers: {} });
    eq(result.ready, false);
    eq(result.line, '');
});

suite('Валидация: ни одна запись не собирается из мусора');

test('все 11 типов блокируют пустые обязательные поля', () => {
    // Пустое обязательное поле блокирует запись целиком: ошибкой поля
    // или ошибкой записи. Проверяем итог через verdict — то, что реально
    // решает, попадёт ли строка в поле результата.
    const leaked = R.all.filter(record => {
        const { values } = defaults(record.id);
        record.fields.forEach(field => {
            if (field.type === 'check' || field.type === 'checks') {
                return;
            }
            values[field.name] = '';
        });
        const result = verdict(record.id, values);
        return result.ready;
    });
    eq(leaked.map(r => r.id).join(','), '', 'запись собрана из пустых полей');
});

test('каждый тип записи имеет хотя бы одну проверку', () => {
    const unchecked = R.all.filter(record => {
        const hasFieldRule = record.fields.some(field => (field.rules || []).length > 0);
        const hasRecordRule = typeof record.validate === 'function';
        const hasClosedValues = record.fields.some(field =>
            field.type === 'select' || field.type === 'checks' || field.type === 'check');
        return !hasFieldRule && !hasRecordRule && !hasClosedValues;
    });
    eq(unchecked.map(r => r.id).join(','), '', 'тип записи нечем проверить');
});

test('свободно вводимые поля имеют правила валидации', () => {
    // Селекты и чекбоксы ограничены списком значений, поля только для чтения
    // заполняет сам генератор (ключ DKIM) — остальное вводится текстом
    // и обязано проверяться правилом.
    const unguarded = [];
    R.all.forEach(record => {
        record.fields.forEach(field => {
            const isText = field.type === 'text' || field.type === 'textarea' || field.type === 'number';
            if (isText && !field.readonly && !(field.rules || []).length) {
                unguarded.push(record.id + '.' + field.name);
            }
        });
    });
    eq(unguarded.join(','), '', 'текстовое поле без правил валидации');
});

suite('Валидация: готовый вывод никогда не содержит сырых управляющих символов');

test('враждебный ввод либо блокируется, либо обезвреживается сборкой', () => {
    // Инвариант обороны в глубину: что бы ни попало в значения — через затвор
    // или мимо него, — строка записи не должна разрываться переводом строки
    // или управляющим символом. Кавычки и слэши допустимы только экранированными.
    const HOSTILE = [
        'a\nevil-line',
        'x\ry.evil.com',
        'q\u0000q',
        'q\u007fq',
        'q\u2028q',
        'q\u2029q',
        'a"b',
        'a\\b'
    ];
    const RAW_CONTROL = new RegExp('[\\n\\r\\u0000-\\u001f\\u007f\\u2028\\u2029]');

    const broken = [];
    R.all.forEach(record => {
        record.fields.forEach(field => {
            if (field.type === 'check' || field.type === 'checks' || field.type === 'select') {
                return;
            }
            HOSTILE.forEach(input => {
                const result = verdict(record.id, { [field.name]: input });
                if (!result.ready) {
                    return;
                }
                if (RAW_CONTROL.test(result.line)) {
                    broken.push(record.id + '.' + field.name + ' <- ' + JSON.stringify(input));
                }
            });
        });
    });
    eq(broken.join(' | '), '', 'сырые управляющие символы в готовой записи');
});

