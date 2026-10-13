const { suite, test, eq, ok } = require('./runner');
const { loadSources } = require('./harness');

const R = loadSources().DnsRecords;

const DOMAIN = 'example.com';

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

function build(id, overrides) {
    const { record, values } = defaults(id);
    Object.assign(values, overrides);
    return record.build(values, DOMAIN, record);
}

function txtSegments(recordLine) {
    return (recordLine.split(' TXT ')[1].match(/"[^"]*"/g) || []).map(s => s.slice(1, -1));
}

suite('Схема: состав типов записей');

test('объявлено ровно 12 типов записей', () => {
    eq(R.all.length, 12);
});

test('идентификаторы типов соответствуют заданию', () => {
    eq(R.all.map(r => r.id).join(','),
        'MX,A,SPF,DKIM,DMARC,MTA-STS,TLS-RPT,SRV,CNAME,BIMI,AAAA,TXT');
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
        AAAA: 'host,ipv6',
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
    eq(build('MX'), '10 mail.example.com.');
    eq(build('MX', { priority: '0', host: '' }), '0 example.com.');
});

test('A: имя и адрес IPv4', () => {
    eq(build('A'), 'mail.example.com. A 192.168.1.10');
});

test('A: галочка IPv6 добавляет вторую строку AAAA', () => {
    eq(build('A', { includeIpv6: true }),
        'mail.example.com. A 192.168.1.10\nmail.example.com. AAAA 2001:db8::1');
});

test('A: без галочки IPv6 остаётся одна строка', () => {
    eq(build('A', { includeIpv6: false }), 'mail.example.com. A 192.168.1.10');
});

test('SPF: собирается политика, адреса, провайдеры и механизмы', () => {
    eq(build('SPF'),
        'example.com. TXT "v=spf1 ip4:192.168.1.10 mx a ~all"');
});

test('SPF: механизмы ip6 собираются из адресов IPv6', () => {
    eq(build('SPF', { ips: 'ip6:2001:db8::1' }),
        'example.com. TXT "v=spf1 ip6:2001:db8::1 mx a ~all"');
    eq(build('SPF', { ips: '192.168.1.10, ip6:2001:db8::1' }),
        'example.com. TXT "v=spf1 ip4:192.168.1.10 ip6:2001:db8::1 mx a ~all"');
});

test('SPF: голый IPv6 получает префикс ip6, регистр нормализуется', () => {
    eq(build('SPF', { ips: '2001:DB8::1' }),
        'example.com. TXT "v=spf1 ip6:2001:DB8::1 mx a ~all"');
    eq(build('SPF', { ips: 'IP6:2001:db8::1' }),
        'example.com. TXT "v=spf1 ip6:2001:db8::1 mx a ~all"');
});

test('DMARC: кириллический адрес превращается в punycode', () => {
    eq(build('DMARC', { rua: 'dmarc@пример.рф' }),
        '_dmarc.example.com. TXT "v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@xn--e1afmkfd.xn--p1ai; aspf=r; adkim=r"');
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
        'default._domainkey.example.com. TXT "v=DKIM1; k=rsa; p="');
});

test('DMARC: все теги в правильном порядке', () => {
    eq(build('DMARC'), '_dmarc.example.com. TXT "v=DMARC1; p=quarantine; pct=100; ' +
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
    ok(record.indexOf('_mta-sts.example.com. TXT "v=STSv1; id=') === 0, record);
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
    eq(build('TLS-RPT'), '_smtp._tls.example.com. TXT "v=TLSRPTv1; rua=mailto:tls@example.com"');
});

test('SRV: служба, протокол, приоритет, вес, порт и хост', () => {
    eq(build('SRV'),
        '_autodiscover._tcp.example.com. SRV 0 0 443 autodiscover.example.com.');
});

test('SRV: заданный вес учитывается', () => {
    eq(build('SRV', { service: '_imap', protocol: '_tcp', weight: '10', port: '993' }),
        '_imap._tcp.example.com. SRV 0 10 993 autodiscover.example.com.');
});

test('CNAME: псевдоним и целевой домен с точкой', () => {
    eq(build('CNAME'), 'mail.example.com. CNAME mail.yandex.ru.');
});

test('BIMI: логотип и необязательный VMC-сертификат', () => {
    eq(build('BIMI'), 'default._bimi.example.com. TXT "v=BIMI1; l=https://example.com/logo.svg"');
    eq(build('BIMI', { useCertificate: true }),
        'default._bimi.example.com. TXT "v=BIMI1; l=https://example.com/logo.svg; a=https://example.com/cert.pem"');
});

test('BIMI: без сертификата не остаётся висячей точки с запятой', () => {
    ok(build('BIMI').indexOf(';"') === -1, build('BIMI'));
});

test('AAAA: имя и адрес IPv6', () => {
    eq(build('AAAA'), 'mail.example.com. AAAA 2001:db8::1');
});

test('TXT: имя @ даёт корень домена', () => {
    eq(build('TXT'), 'example.com. TXT "google-site-verification=abc123"');
    eq(build('TXT', { name: 'mail' }), 'mail.example.com. TXT "google-site-verification=abc123"');
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
    eq(build('TXT', { value: 'note="привет"' }), 'example.com. TXT "note=\\"привет\\""');
});

test('обратные слэши экранируются', () => {
    eq(build('TXT', { value: 'path\\to\\file' }), 'example.com. TXT "path\\\\to\\\\file"');
});

test('строка только из спецсимволов остаётся корректной', () => {
    const line = build('TXT', { value: '"\\"' });
    eq((line.match(/"/g) || []).length % 2, 0);
});

test('пустое значение даёт пустую строку в кавычках', () => {
    eq(build('TXT', { value: '' }), 'example.com. TXT ""');
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

const PAYLOADS = ['', ' ', '"', '\\', '\n', '<b>', 'null', 'NaN', 'x'.repeat(1000), ' '];

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


const PLAIN = ['MX', 'A', 'AAAA', 'SRV', 'CNAME'];

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