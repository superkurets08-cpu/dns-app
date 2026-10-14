const DnsRecords = (function () {
    const TXT_CHUNK_LIMIT = 255;

    function stripControlChars(value) {
        return Validators.stripControlChars(value);
    }

    function fqdn(subdomain, domain) {
        const name = stripControlChars(Validators.toAsciiDomain(subdomain || '')).trim();
        const base = stripControlChars(Validators.toAsciiDomain(domain || '')).trim();
        if (name === '' || name === '@') {
            return base + '.';
        }

        return name.replace(/\.$/, '') + '.' + base + '.';
    }

    function absolute(host) {
        const name = stripControlChars(Validators.toAsciiDomain(host || '')).trim();
        if (name === '') {
            return '';
        }

        return name.endsWith('.') ? name : name + '.';
    }


    function qualifiedName(name, base) {
        const cleaned = stripControlChars(Validators.toAsciiDomain(name || '')).trim().replace(/\.+$/, '');
        const asciiBase = stripControlChars(Validators.toAsciiDomain(base || '')).trim();
        return cleaned === '' ? asciiBase : cleaned + '.' + asciiBase;
    }


    function asciiDomain(domain) {
        return stripControlChars(Validators.toAsciiDomain(domain || '')).trim();
    }

    function txtValue(value) {

        return 'TXT ' + quoteDnsText(stripControlChars(value));
    }


    function pick(record, values, name) {
        const fields = (record && record.fields) || [];
        const field = fields.filter(f => f.name === name)[0];

        if (!field) {
            return '';
        }

        const value = values[name];
        const options = field.options || [];
        const allowed = options.some(option => option.value === value);

        return allowed ? value : field.value;
    }

    function byteLength(value) {
        return new TextEncoder().encode(value).length;
    }

    function quoteDnsText(value) {
        const chunks = [];
        let current = '';

        for (const char of String(value)) {
            const piece = char === '\\' || char === '"' ? '\\' + char : char;

            if (current !== '' && byteLength(current + piece) > TXT_CHUNK_LIMIT) {
                chunks.push(current);
                current = '';
            }

            current += piece;
        }

        chunks.push(current);

        return chunks.map(chunk => '"' + chunk + '"').join(' ');
    }

    function txtRecord(name, value, ttl) {
        return name + ' ' + ttl + ' ' + txtValue(value);
    }

    function mtaStsPolicyId() {
        const now = new Date();
        const pad = number => String(number).padStart(2, '0');
        return String(now.getFullYear()) +
            pad(now.getMonth() + 1) +
            pad(now.getDate()) + 'T' +
            pad(now.getHours()) +
            pad(now.getMinutes()) +
            pad(now.getSeconds());
    }

    const subdomainField = function (name, label, fallback, hint, placeholder) {
        return {
            name: name,
            label: label,
            type: 'text',
            optional: true,
            value: fallback,
            placeholder: placeholder || 'mail',
            hint: hint || 'Поддомен относительно вашего домена. Оставьте поле пустым или «@», чтобы запись относилась к самому домену.',
            preview: true,
            rules: [{ test: Validators.subdomain, message: 'Допустимы латинские буквы, цифры и дефис' }]
        };
    };

    const records = [
        {
            id: 'MX',
            label: 'MX',
            title: 'MX — приоритетный почтовый сервер',
            description: 'Назначение почтового сервера домена (RFC 5321). Определяет порядок пробного доставки: ' +
                'записи с меньшим приоритетом проверяются первыми, при равенстве — по числовой случайности.',
            columns: 2,
            fields: [
                {
                    name: 'priority',
                    label: 'Приоритет',
                    type: 'number',
                    value: 10,
                    min: 0,
                    max: 50,
                    placeholder: '10',
                    presets: [10, 5, 1, 0],
                    hint: 'Чем ниже число, тем выше приоритет: при отказе основного сервера почта уйдёт на следующий по приоритету.',
                    rules: [{ test: Validators.integerInRange(0, 50), message: 'Введите целое число от 0 до 50' }]
                },
                subdomainField('host', 'Имя сервера (поддомен)', 'mail')
            ],
            build: function (values, domain, record, ttl) {
                return '@ ' + ttl + ' MX ' + values.priority + ' ' + fqdn(values.host, domain);
            }
        },

        {
            id: 'A',
            label: 'A/AAAA',
            title: 'A/AAAA — сопоставление имени с IP-адресом',
            description: 'Сопоставление имени с адресом: A — IPv4, AAAA — IPv6 (RFC 1035). ' +
                'Задаёт IP-адрес почтового сервера для входящих SMTP-соединений.',
            columns: 2,
            fields: [
                subdomainField('host', 'Имя хоста (поддомен)', 'mail'),
                {
                    name: 'ip',
                    label: 'IPv4-адрес',
                    type: 'text',
                    value: '192.168.1.10',
                    placeholder: '192.168.1.10',
                    hint: 'Адрес в формате IPv4, например 192.168.1.10. Принимается и публичный, и адрес внутри сети — запись попадёт в зону домена.',
                    rules: [{ test: Validators.ipv4, message: 'Введите корректный адрес IPv4, например 192.168.1.10' }]
                },
                {
                    name: 'includeIpv6',
                    label: 'Добавить AAAA-запись для IPv6',
                    type: 'check',
                    value: false,
                    hint: 'Создаёт вторую строку с типом AAAA для того же имени. Снимите галочку, если сервер доступен только по IPv4.',
                    reveals: 'ipv6'
                },
                {
                    name: 'ipv6',
                    label: 'IPv6-адрес',
                    type: 'text',
                    optional: true,
                    revealedBy: 'includeIpv6',
                    value: '2001:db8::1',
                    placeholder: '2001:db8::1',
                    hint: 'Адрес в формате IPv6. Сокращение через :: допустимо, например 2001:db8::1.',
                    rules: [{ test: Validators.ipv6, message: 'Введите корректный адрес IPv6, например 2001:db8::1' }]
                }
            ],
            validate: function (values) {
                // Галочка обещает вторую строку записи. Если адрес пуст, build
                // молча её не выдаст, и пользователь решит, что IPv4 и IPv6
                // настроены, хотя в зоне окажется только A.
                if (values.includeIpv6 && Validators.empty(values.ipv6)) {
                    return 'Укажите адрес IPv6 или снимите галочку про AAAA-запись';
                }

                return null;
            },
            build: function (values, domain, record, ttl) {
                const owner = fqdn(values.host, domain);
                const lines = [owner + ' ' + ttl + ' A ' + values.ip.trim()];

                if (values.includeIpv6 && !Validators.empty(values.ipv6)) {
                    lines.push(owner + ' ' + ttl + ' AAAA ' + values.ipv6.trim());
                }

                return lines.join('\n');
            }
        },

        {
            id: 'SPF',
            label: 'SPF',
            title: 'SPF — перечень серверов, разрешённых отправлять почту',
            description: 'Политика авторизации отправителей (RFC 7208). Одна TXT-запись в корне домена, начинающаяся с v=spf1. ' +
                'Задаёт перечень узлов, имеющих право отправлять почту от имени домена.',
            columns: 1,
            fields: [
                {
                    name: 'policy',
                    label: 'Политика для неавторизованных отправителей',
                    type: 'select',
                    value: '~all',
                    hint: 'Что делать с письмами, пришедшими не с разрешённых серверов. ~all — рекомендуемый компромисс на этапе настройки.',
                    options: [
                        { value: '~all', label: '~all — SoftFail: принимать, но помечать как подозрительные' },
                        { value: '-all', label: '-all — Fail: отклонять письма с чужих серверы' },
                        { value: '+all', label: '+all — Pass: разрешать любые серверы (небезопасно)' }
                    ]
                },
                {
                    name: 'ips',
                    label: 'IP-адреса серверов',
                    type: 'text',
                    optional: true,
                    value: '192.168.1.10',
                    placeholder: '192.168.1.10, ip6:2001:db8::1',
                    hint: 'Список адресов через запятую: IPv4 подставляется как есть (механизм ip4:), перед IPv6-адресом укажите префикс ip6:. Каждый адрес превращается в свой механизм в записи.',
                    rules: [{ test: Validators.spfIpList, message: 'Укажите адреса через запятую: IPv4 как есть, IPv6 с префиксом ip6:, например 192.168.1.10, ip6:2001:db8::1' }]
                },
                {
                    name: 'providers',
                    label: 'Сторонние почтовые сервисы',
                    type: 'checks',
                    optional: true,
                    value: { google: false, m365: false, yandex: false, mailgun: false, sendgrid: false },
                    hint: 'Каждый выбранный сервис добавляет свой include: с официальным адресом провайдера.',
                    options: [
                        { value: 'google', label: 'Google Workspace', note: 'include:_spf.google.com' },
                        { value: 'm365', label: 'Microsoft 365', note: 'include:spf.protection.outlook.com' },
                        { value: 'yandex', label: 'Яндекс Почта', note: 'include:_spf.yandex.net' },
                        { value: 'mailgun', label: 'Mailgun', note: 'include:mailgun.org' },
                        { value: 'sendgrid', label: 'SendGrid', note: 'include:sendgrid.net' }
                    ]
                },
                {
                    name: 'mechanisms',
                    label: 'Механизмы для собственных серверов',
                    type: 'checks',
                    optional: true,
                    value: { mx: true, a: true },
                    hint: 'mx — все почтовые серверы домена, a — адрес домена и его поддоменов.',
                    options: [
                        { value: 'mx', label: 'mx', note: 'почтовые серверы из MX-записей' },
                        { value: 'a', label: 'a', note: 'адрес самого домена' }
                    ]
                }
            ],
            validate: function (values) {
                const hasIps = !Validators.empty(values.ips);
                // Группы чекбоксов всегда объекты, но проверка не должна ронять
                // весь интерфейс исключением, если состояние повреждено.
                const providers = values.providers || {};
                const mechanisms = values.mechanisms || {};
                const hasProvider = Object.keys(providers).some(key => providers[key]);
                const hasMechanism = Object.keys(mechanisms).some(key => mechanisms[key]);
                if (!hasIps && !hasProvider && !hasMechanism) {
                    return 'Укажите хотя бы один IP-адрес, провайдера или механизм';
                }

                return null;
            },
            build: function (values, domain, record, ttl) {
                const parts = ['v=spf1'];

                String(values.ips || '')
                    .split(',')
                    .map(item => item.trim())
                    .filter(item => item !== '')
                    .forEach(ip => {
                        const lower = ip.toLowerCase();
                        if (lower.startsWith('ip4:') || lower.startsWith('ip6:')) {
                            parts.push(lower);
                        } else if (Validators.ipv6(ip)) {
                            parts.push('ip6:' + ip);
                        } else {
                            parts.push('ip4:' + ip);
                        }
                    });

                const includes = {
                    google: 'include:_spf.google.com',
                    m365: 'include:spf.protection.outlook.com',
                    yandex: 'include:_spf.yandex.net',
                    mailgun: 'include:mailgun.org',
                    sendgrid: 'include:sendgrid.net'
                };

                Object.keys(includes).forEach(key => {
                    if (values.providers[key]) {
                        parts.push(includes[key]);
                    }
                });

                if (values.mechanisms.mx) {
                    parts.push('mx');
                }

                if (values.mechanisms.a) {
                    parts.push('a');
                }

                parts.push(pick(record, values, 'policy'));

                return txtRecord(fqdn('@', domain), parts.join(' '), ttl);
            }
        },

        {
            id: 'DKIM',
            label: 'DKIM',
            title: 'DKIM — цифровая подпись исходящих писем',
            description: 'Публичная половина пары ключей для проверки подписи исходящих писем (RFC 6376). ' +
                'Приватный ключ не публикуется и не покидает браузер. Значение p= длиннее 255 байт ' +
                'разбивается на несколько сегментов записи, которые DNS-сервер склеивает обратно.',
            columns: 2,
            keyGenerator: true,
            fields: [
                {
                    name: 'selector',
                    label: 'Селектор',
                    type: 'text',
                    value: 'default',
                    placeholder: 'default',
                    suggestions: ['default', 'dkim', 'mail', 'google'],
                    hint: 'Префикс имени записи: <селектор>._domainkey.<домен>. Часто используют default, mail или dkim. Разные селекторы позволяют держать несколько активных ключей одновременно.',
                    rules: [{ test: Validators.subdomain, message: 'Допустимы латинские буквы, цифры и дефис' }]
                },
                {
                    name: 'keyLength',
                    label: 'Длина ключа',
                    type: 'select',
                    value: '2048',
                    hint: '2048 бит — актуальный стандарт. 1024 бит поддерживается старыми почтовыми системами, но считается недостаточно стойким.',
                    options: [
                        { value: '2048', label: '2048 бит (рекомендуется)' },
                        { value: '1024', label: '1024 бит (legacy)' }
                    ]
                },
                {
                    name: 'publicKey',
                    label: 'Публичный ключ (p=)',
                    type: 'textarea',
                    span: 2,
                    optional: true,
                    readonly: true,
                    value: '',
                    rows: 4,
                    placeholder: 'Нажмите «Сгенерировать ключи», чтобы создать пару',
                    hint: 'Публичный ключ автоматически подставляется в запись. Он не секретный и публикуется в DNS. Ключ 2048 бит длиннее предела в 255 байт, поэтому запись разбивается на несколько сегментов — так публикуются все настоящие DKIM-записи, а DNS-сервер склеивает их обратно.'
                }
            ],
            validate: function (values) {
                // Пустой «p=» по RFC 6376 означает не отсутствие ключа, а его
                // отзыв. Молчаливая выдача такой записи отключила бы подпись
                // писем домена, поэтому без ключа запись не собирается вовсе.
                if (Validators.empty(values.publicKey)) {
                    // Поле ключа заполняется только генератором, поэтому
                    // предлагать вставку своего ключа здесь нельзя.
                    return 'Сгенерируйте пару ключей: запись с пустым p= по RFC 6376 ' +
                        'отзывает ключ и отключает подпись писем';
                }

                return null;
            },
            build: function (values, domain, record, ttl) {
                const publicKey = String(values.publicKey || '').replace(/\s+/g, '');
                return qualifiedName(values.selector, '_domainkey.' + domain + '.') + ' ' + ttl + ' ' +
                    txtValue('v=DKIM1; k=rsa; p=' + publicKey);
            }
        },

        {
            id: 'DMARC',
            label: 'DMARC',
            title: 'DMARC — политика для писем, не прошедших SPF и DKIM',
            description: 'Политика обработки результатов проверки SPF и DKIM (RFC 7489). ' +
                'Определяет действие получателя для почты, не прошедшей авторизацию: отклонить, ' +
                'принять с маркировкой спама или только собрать отчёт.',
            columns: 2,
            fields: [
                {
                    name: 'policy',
                    label: 'Политика (p)',
                    type: 'select',
                    value: 'quarantine',
                    hint: 'Что делать с невалидными письмами. Начинайте с pct=100 и политики none, затем включайте quarantine или reject.',
                    options: [
                        { value: 'none', label: 'none — только собирать отчёты, письма не трогать' },
                        { value: 'quarantine', label: 'quarantine — помещать в папку «Спам»' },
                        { value: 'reject', label: 'reject — отклонять полностью' }
                    ]
                },
                {
                    name: 'pct',
                    label: 'Процент сообщений (pct)',
                    type: 'number',
                    value: 100,
                    min: 0,
                    max: 100,
                    placeholder: '100',
                    hint: 'Доля писем, к которой применяется политика: 100 — ко всем, 10 — к 10%. Позволяет внедрять правило постепенно.',
                    rules: [{ test: Validators.integerInRange(0, 100), message: 'Введите целое число от 0 до 100' }]
                },
                {
                    name: 'rua',
                    label: 'Адрес для агрегированных отчётов (rua)',
                    type: 'text',
                    value: function (domain) { return 'dmarc@' + domain; },
                    placeholder: 'dmarc@example.com',
                    hint: 'Email без префикса mailto:. На этот адрес приходят сводные отчёты о результатах проверки.',
                    rules: [{ test: Validators.email, message: 'Введите корректный email, например dmarc@example.com' }]
                },
                {
                    name: 'ruf',
                    label: 'Адрес для отчётов о нарушениях (ruf)',
                    type: 'text',
                    optional: true,
                    value: '',
                    placeholder: 'forensics@example.com',
                    hint: 'Необязательно. По адресу отправляются подробные отчёты о конкретных нарушениях. Оставьте пустым, если ruf вам не нужен.',
                    rules: [{ test: Validators.email, message: 'Введите корректный email или оставьте поле пустым' }]
                },
                {
                    name: 'aspf',
                    label: 'Выравнивание SPF (aspf)',
                    type: 'select',
                    value: 'r',
                    hint: 'Как строго домены в SPF должны совпадать с вашим доменом.',
                    options: [
                        { value: 'r', label: 'r — relaxed: поддомены допустимы' },
                        { value: 's', label: 's — strict: только точный домен' }
                    ]
                },
                {
                    name: 'adkim',
                    label: 'Выравнивание DKIM (adkim)',
                    type: 'select',
                    value: 'r',
                    hint: 'Как строго домен в подписи DKIM должен совпадать с вашим доменом.',
                    options: [
                        { value: 'r', label: 'r — relaxed: поддомены допустимы' },
                        { value: 's', label: 's — strict: только точный домен' }
                    ]
                }
            ],
            build: function (values, domain, record, ttl) {
                const tags = ['v=DMARC1', 'p=' + pick(record, values, 'policy'), 'pct=' + values.pct];

                if (!Validators.empty(values.rua)) {
                    tags.push('rua=mailto:' + Validators.toAsciiEmail(values.rua));
                }

                if (!Validators.empty(values.ruf)) {
                    tags.push('ruf=mailto:' + Validators.toAsciiEmail(values.ruf));
                }

                tags.push('aspf=' + pick(record, values, 'aspf'));
                tags.push('adkim=' + pick(record, values, 'adkim'));

                return '_dmarc.' + asciiDomain(domain) + '. ' + ttl + ' ' + txtValue(tags.join('; '));
            }
        },

        {
            id: 'MTA-STS',
            label: 'MTA-STS',
            title: 'MTA-STS — принудительное шифрование при отправке почты',
            description: 'Принудительное шифрование SMTP-соединений (RFC 8461). ' +
                'Запись публикует идентификатор версии политики; сама политика размещается отдельным файлом ' +
                'на веб-сервере домена.',
            columns: 3,
            fields: [
                {
                    name: 'mode',
                    label: 'Режим',
                    type: 'select',
                    value: 'testing',
                    hint: 'Применяется только в policy-файле на сайте домена, в DNS-запись не попадает. В режиме testing нарушения лишь собираются в отчёты.',
                    options: [
                        { value: 'testing', label: 'testing — собирать отчёты о нарушениях' },
                        { value: 'enforce', label: 'enforce — отклонять серверы без шифрования' }
                    ]
                },
                {
                    name: 'id',
                    label: 'ID политики',
                    type: 'text',
                    value: mtaStsPolicyId(),
                    placeholder: '20250601T000000',
                    hint: 'Номер версии политики в формате YYYYMMDDTHHMMSS. Меняйте его при каждом обновлении файла, иначе серверы возьмут старый кэш.',
                    rules: [{ test: function (value) { return /^\d{8}T\d{6}$/.test(String(value).trim()); }, message: 'Формат: 20250601T000000' }]
                },
                {
                    name: 'maxAge',
                    label: 'Max age (секунд)',
                    type: 'number',
                    optional: true,
                    value: 86400,
                    min: 0,
                    placeholder: '86400',
                    hint: 'Срок кэширования policy-файла. 86400 — одни сутки. Указывается в файле политики, а не в записи DNS. Оставьте пустым, если срок не задаётся.',
                    rules: [{ test: Validators.integerInRange(0, 31536000), message: 'Введите целое число не больше 31536000' }]
                }
            ],
            build: function (values, domain, record, ttl) {
                return '_mta-sts.' + asciiDomain(domain) + '. ' + ttl + ' ' + txtValue('v=STSv1; id=' + values.id.trim());
            },
            extraOutputs: [
                {
                    title: 'Policy-файл для .well-known/mta-sts.txt',
                    hint: 'Этот файл нужно разместить на сайте домена по адресу https://<домен>/.well-known/mta-sts.txt. Значения полей «Режим», «ID политики» и «Max age» берутся из формы выше.',
                    build: function (values, domain, record) {
                        const lines = [
                            'version: STSv1',
                            'mode: ' + pick(record, values, 'mode'),
                            'mx: mail.' + asciiDomain(domain)
                        ];

                        if (!Validators.empty(values.maxAge)) {
                            lines.push('max_age: ' + String(values.maxAge).trim());
                        }

                        return lines.join('\n') + '\n';
                    }
                }
            ]
        },

        {
            id: 'TLS-RPT',
            label: 'TLS-RPT',
            title: 'TLS-RPT — отчёты о проблемах с шифрованием',
            description: 'Адрес сбора отчётов о неудачных TLS-соединениях (RFC 8460). ' +
                'Действует совместно с MTA-STS, обеспечивая обратную связь о результатах применения политики.',
            columns: 1,
            fields: [
                {
                    name: 'rua',
                    label: 'Адрес для отчётов (rua)',
                    type: 'text',
                    value: function (domain) { return 'tls@' + domain; },
                    placeholder: 'tls@example.com',
                    hint: 'Email без префикса mailto:. В записи он будет обёрнут автоматически.',
                    rules: [{ test: Validators.email, message: 'Введите корректный email, например tls@example.com' }]
                }
            ],
            build: function (values, domain, record, ttl) {
                return '_smtp._tls.' + asciiDomain(domain) + '. ' + ttl + ' ' + txtValue('v=TLSRPTv1; rua=mailto:' + Validators.toAsciiEmail(values.rua));
            }
        },

        {
            id: 'SRV',
            label: 'SRV',
            title: 'SRV — адрес и порт сервера службы',
            description: 'Расширенная адресация служб (RFC 2782). Задаёт приоритет, вес, порт и целевое имя узла: ' +
                'IMAP, Submission, автонастройка почтовых клиентов.',
            columns: 3,
            fields: [
                {
                    name: 'service',
                    label: 'Служба',
                    type: 'select',
                    value: '_autodiscover',
                    hint: 'Имя службы в формате _служба. Определяет, какой почтовый клиент обращается к этой записи.',
                    options: [
                        { value: '_autodiscover', label: '_autodiscover — автонастройка почты' },
                        { value: '_imap', label: '_imap — доступ к почте' },
                        { value: '_pop3', label: '_pop3 — старый протокол POP3' },
                        { value: '_smtp', label: '_smtp — отправка писем' }
                    ]
                },
                {
                    name: 'protocol',
                    label: 'Протокол',
                    type: 'select',
                    value: '_tcp',
                    hint: 'Транспортный протокол службы. Почтовые службы работают поверх TCP.',
                    options: [
                        { value: '_tcp', label: '_tcp' },
                        { value: '_udp', label: '_udp' }
                    ]
                },
                {
                    name: 'target',
                    label: 'Целевой хост',
                    type: 'text',
                    value: function (domain) { return 'autodiscover.' + domain; },
                    placeholder: 'autodiscover.example.com',
                    hint: 'Имя сервера, который обслуживает службу. Значение подставляется относительно вашего домена и завершается точкой.',
                    rules: [{ test: Validators.hostname, message: 'Введите корректное доменное имя, например autodiscover.example.com' }]
                },
                {
                    name: 'priority',
                    label: 'Приоритет',
                    type: 'number',
                    value: 0,
                    min: 0,
                    max: 65535,
                    placeholder: '0',
                    hint: 'Чем ниже значение, тем раньше клиент попробует этот сервер. Записи с одинаковым приоритетом распределяются по весу.',
                    rules: [{ test: Validators.integerInRange(0, 65535), message: 'Введите целое число от 0 до 65535' }]
                },
                {
                    name: 'weight',
                    label: 'Вес',
                    type: 'number',
                    value: 0,
                    min: 0,
                    max: 65535,
                    placeholder: '0',
                    hint: 'Вероятность выбора сервера среди записей с одинаковым приоритетом: чем больше вес, тем выше шанс. Обычно одинаковый у всех записей.',
                    rules: [{ test: Validators.integerInRange(0, 65535), message: 'Введите целое число от 0 до 65535' }]
                },
                {
                    name: 'port',
                    label: 'Порт',
                    type: 'number',
                    value: 443,
                    min: 1,
                    max: 65535,
                    placeholder: '443',
                    hint: 'Порт, на котором сервер принимает соединения: 993 для IMAP, 995 для POP3, 465 или 587 для отправки.',
                    rules: [{ test: Validators.integerInRange(1, 65535), message: 'Введите порт от 1 до 65535' }]
                }
            ],
            build: function (values, domain, record, ttl) {
                return pick(record, values, 'service') + '.' + pick(record, values, 'protocol') + '.' + asciiDomain(domain) + '. ' + ttl + ' SRV ' +
                    values.priority + ' ' + values.weight + ' ' + values.port + ' ' +
absolute(values.target);
            }
        },

        {
            id: 'CNAME',
            label: 'CNAME',
            title: 'CNAME — псевдоним на другой домен',
            description: 'Каноническое имя (RFC 1034, п. 3.6.2). ' +
                'Допустимо только для чистого имени: наличие иных записей того же имени нарушает требование ' +
                'отсутствия синонимов у одного узла.',
            columns: 2,
            fields: [
                subdomainField('alias', 'Псевдоним (поддомен)', 'mail'),
                {
                    name: 'target',
                    label: 'Целевой домен',
                    type: 'text',
                    value: 'mail.yandex.ru',
                    placeholder: 'mail.yandex.ru',
                    hint: 'Домен, на который перенаправляется запрос. Обычно это домен стороннего почтового сервиса.',
                    rules: [{ test: Validators.hostname, message: 'Введите корректное доменное имя, например mail.yandex.ru' }]
                }
            ],
            validate: function (values, domain) {
                // CNAME на самого себя — цикл, который DNS-сервер отвергнет,
                // а почтовый клиент будет считать имя несуществующим.
                // Имена в DNS регистронезависимы, поэтому сравниваем в нижнем регистре.
                const owner = fqdn(values.alias, domain).toLowerCase();
                const target = absolute(values.target).toLowerCase();

                if (target !== '' && owner === target) {
                    return 'CNAME не может указывать сам на себя — укажите другой целевой домен';
                }

                return null;
            },
            build: function (values, domain, record, ttl) {
                return fqdn(values.alias, domain) + ' ' + ttl + ' CNAME ' + absolute(values.target);
            }
        },

        {
            id: 'BIMI',
            label: 'BIMI',
            title: 'BIMI — логотип в почтовых ящиках получателей',
            description: 'Брендирование сообщений (RFC 6376-bis). Ссылка на SVG-логотип, отображаемый получателем ' +
                'для почты, прошедшей проверку DMARC. Требует действующей политики DMARC.',
            columns: 2,
            fields: [
                {
                    name: 'selector',
                    label: 'Селектор',
                    type: 'text',
                    value: 'default',
                    placeholder: 'default',
                    hint: 'Префикс имени записи: <селектор>._bimi.<домен>.',
                    rules: [{ test: Validators.subdomain, message: 'Допустимы латинские буквы, цифры и дефис' }]
                },
                {
                    name: 'logo',
                    label: 'URL логотипа (l)',
                    type: 'text',
                    value: function (domain) { return 'https://' + domain + '/logo.svg'; },
                    placeholder: 'https://example.com/logo.svg',
                    hint: 'Прямая ссылка на SVG-файл логотипа. Нужен формат SVG Tiny Portable/Secure, PNG принимают не все почтовые клиенты.',
                    rules: [{ test: Validators.url, message: 'Введите корректный https-адрес логотипа' }]
                },
                {
                    name: 'useCertificate',
                    label: 'Добавить VMC-сертификат',
                    type: 'check',
                    value: false,
                    hint: 'Сертификат Verified Mark Certificate обязателен для отображения логотипа у Gmail и Яндекс.Почты. Для других клиентов поле можно не заполнять.',
                    reveals: 'certificate'
                },
                {
                    name: 'certificate',
                    label: 'URL VMC-сертификата (a)',
                    type: 'text',
                    optional: true,
                    revealedBy: 'useCertificate',
                    value: function (domain) { return 'https://' + domain + '/cert.pem'; },
                    placeholder: 'https://example.com/cert.pem',
                    hint: 'Ссылка на PEM-файл сертификата. Если флажок выше выключен, поле не попадёт в запись.',
                    rules: [{ test: Validators.url, message: 'Введите корректный https-адрес сертификата' }]
                }
            ],
            build: function (values, domain, record, ttl) {
                const tags = ['v=BIMI1', 'l=' + Validators.toAsciiUrl(values.logo)];

                if (values.useCertificate && !Validators.empty(values.certificate)) {
                    tags.push('a=' + Validators.toAsciiUrl(values.certificate));
                }

                return qualifiedName(values.selector, '_bimi.' + domain + '.') + ' ' + ttl + ' ' + txtValue(tags.join('; '));
            }
        },

        {
            id: 'TXT',
            label: 'TXT',
            title: 'TXT — произвольная текстовая запись',
            description: 'Произвольная строка (RFC 1035). ' +
                'Служит для подтверждения владения доменом, проверки сторонних сервисов и размещения служебных маркеров. ' +
                'Значение разбивается на сегменты по 255 байт.',
            columns: 2,
            fields: [
                subdomainField('name', 'Имя записи', '@', 'Поддомен относительно вашего домена или @ для записи в его корне.', '@'),
                {
                    name: 'value',
                    label: 'Значение',
                    type: 'textarea',
                    value: 'google-site-verification=abc123',
                    placeholder: 'google-site-verification=abc123',
                    rows: 2,
                    hint: 'Произвольный текст: токен подтверждения, служебная строка или SPF-политика. Значение оборачивается в кавычки, кавычки и обратные слэши внутри экранируются автоматически, а значения длиннее 255 байт разбиваются на несколько сегментов. Переносы строк недопустимы: строка должна быть одной записью.',
                    rules: [{
                        test: function (value) {

                            return !/[\u0000-\u0008\u000A-\u001F\u007F\u2028\u2029]/.test(String(value));
                        },
                        message: 'Значение должно быть одной строкой — уберите переносы строк и управляющие символы'
                    }]
                }
            ],
            build: function (values, domain, record, ttl) {
                return txtRecord(fqdn(values.name, domain), values.value.trim(), ttl);
            }
        }
    ];

    return {
        all: records,
        fqdn: fqdn,
        find: function (id) {
            return records.filter(record => record.id === id)[0];
        }
    };
})();
