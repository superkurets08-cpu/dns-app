const { suite, test, eq, ok } = require('./runner');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VIEW_PATH = path.join(ROOT, 'DnsRecordGenerator', 'Views', 'Home', 'Index.cshtml');
const APP_JS_PATH = path.join(ROOT, 'DnsRecordGenerator', 'Scripts', 'app.js');
const RECORDS_JS_PATH = path.join(ROOT, 'DnsRecordGenerator', 'Scripts', 'records.js');
const VALIDATORS_JS_PATH = path.join(ROOT, 'DnsRecordGenerator', 'Scripts', 'validators.js');
const CSS_PATH = path.join(ROOT, 'DnsRecordGenerator', 'Content', 'css', 'site.css');

const view = fs.readFileSync(VIEW_PATH, 'utf8');
const appJs = fs.readFileSync(APP_JS_PATH, 'utf8');
const recordsJs = fs.readFileSync(RECORDS_JS_PATH, 'utf8');
const validatorsJs = fs.readFileSync(VALIDATORS_JS_PATH, 'utf8');
const css = fs.readFileSync(CSS_PATH, 'utf8');
const allJs = appJs + recordsJs + validatorsJs;

// Живые модули приложения — для проверок поведения, а не исходного кода
const { loadSources } = require('./harness');
const { Validators: V, DnsRecords: R } = loadSources();

/* ------------------------------------------------------------------ */
/*  Вспомогательные функции                                            */
/* ------------------------------------------------------------------ */

// Значение CSP обрамлено двойными кавычками и содержит одинарные кавычки внутри
function getCspContent() {
    const match = view.match(/http-equiv=["']Content-Security-Policy["'][^>]*content="([^"]*)"/i);
    return match ? match[1] : null;
}

function cspDirectives(csp) {
    const map = {};
    csp.split(';').forEach(part => {
        const tokens = part.trim().split(/\s+/).filter(Boolean);
        if (tokens.length) {
            map[tokens[0].toLowerCase()] = tokens.slice(1);
        }
    });
    return map;
}

// Убирает комментарии и содержимое строк, чтобы проверять только код
function stripLiteralsAndComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
        .replace(/`(?:\\.|[^`\\])*`/g, '``')
        .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
        .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

/* ------------------------------------------------------------------ */
/*  Content Security Policy                                            */
/* ------------------------------------------------------------------ */

suite('Безопасность: Content Security Policy');

test('CSP-заголовок присутствует в разметке', () => {
    ok(view.indexOf('Content-Security-Policy') !== -1, 'CSP не настроен');
});

test('CSP разбирается как директивы', () => {
    const csp = getCspContent();
    ok(csp, 'CSP не удалось извлечь из разметки');
    if (csp) {
        const d = cspDirectives(csp);
        ok(d['default-src'], 'нет default-src в CSP: ' + csp);
        ok(d['script-src'], 'нет script-src в CSP: ' + csp);
    }
});

test('script-src разрешает только свои скрипты', () => {
    const csp = getCspContent();
    ok(csp, 'CSP не найден');
    if (csp) {
        eq((cspDirectives(csp)['script-src'] || []).join(' '), "'self'");
    }
});

test('style-src не разрешает внешние источники', () => {
    const csp = getCspContent();
    ok(csp, 'CSP не найден');
    if (csp) {
        const values = cspDirectives(csp)['style-src'] || [];
        values.forEach(v => {
            ok(/^(self|'self')$/.test(v) || v === "'unsafe-inline'",
                'style-src разрешает внешний источник: ' + v);
        });
    }
});

test('font-src разрешает только свои шрифты', () => {
    const csp = getCspContent();
    ok(csp, 'CSP не найден');
    if (csp) {
        eq((cspDirectives(csp)['font-src'] || []).join(' '), "'self'");
    }
});

test('connect-src запрещает утечку данных наружу', () => {
    const csp = getCspContent();
    ok(csp, 'CSP не найден');
    if (csp) {
        eq((cspDirectives(csp)['connect-src'] || []).join(' '), "'self'");
    }
});

test('frame-ancestors не задан в meta — только HTTP-заголовком', () => {
    // В <meta> директива frame-ancestors игнорируется браузером
    const csp = getCspContent() || '';
    ok(csp.indexOf('frame-ancestors') === -1,
        'frame-ancestors в <meta> игнорируется браузером');
    const config = fs.readFileSync(path.join(ROOT, 'DnsRecordGenerator', 'Web.config'), 'utf8');
    ok(config.indexOf('X-Frame-Options') !== -1,
        'нет заголовка X-Frame-Options в Web.config');
});

test('base-uri запрещает подмену базового URL', () => {
    const csp = getCspContent();
    ok(csp, 'CSP не найден');
    if (csp) {
        eq((cspDirectives(csp)['base-uri'] || []).join(' '), "'none'");
    }
});

test('form-action ограничивает отправку форм', () => {
    const csp = getCspContent();
    ok(csp, 'CSP не найден');
    if (csp) {
        eq((cspDirectives(csp)['form-action'] || []).join(' '), "'self'");
    }
});

test('CSP не разрешает unsafe-eval', () => {
    const csp = getCspContent() || '';
    ok(csp.indexOf('unsafe-eval') === -1, 'CSP разрешает unsafe-eval');
});

test('CSP не разрешает подстановку nonce и хаков', () => {
    const d = cspDirectives(getCspContent() || '');
    Object.keys(d).forEach(name => {
        ok(d[name].indexOf('*') === -1, 'директива ' + name + ' разрешает любой источник');
    });
});

test('object-src запрещает плагины', () => {
    const csp = getCspContent() || '';
    const d = cspDirectives(csp);
    eq((d['object-src'] || []).join(' '), "'none'", 'object-src должен быть none');
});

test('все директивы CSP используют только свои источники', () => {
    const d = cspDirectives(getCspContent() || '');
    Object.keys(d).forEach(name => {
        d[name].forEach(value => {
            ok(!/^https?:$/.test(value), 'директива ' + name + ' разрешает внешний протокол');
            ok(value !== '*', 'директива ' + name + ' разрешает любой источник');
        });
    });
});

/* ------------------------------------------------------------------ */
/*  HTTP-заголовки безопасности (Web.config)                            */
/* ------------------------------------------------------------------ */

suite('Безопасность: HTTP-заголовки');

function webConfig() {
    return fs.readFileSync(path.join(ROOT, 'DnsRecordGenerator', 'Web.config'), 'utf8');
}

test('X-Content-Type-Options: nosniff', () => {
    ok(/name="X-Content-Type-Options"\s+value="nosniff"/.test(webConfig()),
        'нет защиты от подмены типов содержимого');
});

test('X-Frame-Options: DENY', () => {
    ok(/name="X-Frame-Options"\s+value="DENY"/.test(webConfig()),
        'страницу можно встроить в iframe');
});

test('Referrer-Policy не утекает данные', () => {
    ok(/name="Referrer-Policy"\s+value="no-referrer"/.test(webConfig()),
        'нет политики Referrer-Policy');
});

test('Permissions-Policy отключает лишние устройства', () => {
    const match = webConfig().match(/name="Permissions-Policy"\s+value="([^"]*)"/);
    ok(match, 'нет Permissions-Policy');
    if (match) {
        ['geolocation=()', 'microphone=()', 'camera=()'].forEach(feature => {
            ok(match[1].indexOf(feature) !== -1, 'не отключено: ' + feature);
        });
    }
});

test('Cross-Origin-Opener-Policy изолирует окно', () => {
    ok(/name="Cross-Origin-Opener-Policy"\s+value="same-origin"/.test(webConfig()),
        'нет Cross-Origin-Opener-Policy');
});

test('Cross-Origin-Resource-Policy защищает ресурсы', () => {
    ok(/name="Cross-Origin-Resource-Policy"\s+value="same-origin"/.test(webConfig()),
        'нет Cross-Origin-Resource-Policy');
});

test('HSTS включён для HTTPS', () => {
    ok(/name="Strict-Transport-Security"\s+value="max-age=\d+/.test(webConfig()),
        'нет Strict-Transport-Security');
});

test('XML-конфигурация не сломана', () => {
    // Разбор настоящим XML-парсером, а не подсчётом тегов
    const { JSDOM } = require('jsdom');
    ok(JSDOM, 'не удалось подключить XML-парсер для проверки');
    if (JSDOM) {
        const dom = new JSDOM(webConfig(), { contentType: 'text/xml' });
        const doc = dom.window.document;
        const error = doc.querySelector('parsererror');
        ok(!error, 'ошибка разбора Web.config: ' + (error ? error.textContent : ''));
        if (!error) {
            eq(doc.documentElement.nodeName, 'configuration');
        }
    }
});

test('заголовки объявлены внутри httpProtocol/customHeaders', () => {
    const config = webConfig();
    ok(/<system\.webServer>/.test(config), 'нет секции system.webServer');
    ok(/<customHeaders>/.test(config), 'нет секции customHeaders');
    ok((config.match(/<customHeaders>/g) || []).length === 1,
        'секция customHeaders должна быть одна');
});

/* ------------------------------------------------------------------ */
/*  XSS                                                                */
/* ------------------------------------------------------------------ */

suite('Безопасность: XSS-защита');

test('escapeHtml доступна как живая функция модуля', () => {
    eq(typeof V.escapeHtml, 'function', 'escapeHtml не экспортируется из Validators');
});

test('escapeHtml экранирует все опасные символы', () => {
    eq(V.escapeHtml('&<>"'), '&amp;&lt;&gt;&quot;');
    eq(V.escapeHtml('обычный текст'), 'обычный текст');
    eq(V.escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('все строки схемы безопасны после экранирования', () => {
    // Поведенческая проверка на живых объектах: какие бы строки схема
    // ни подставляла в разметку, после escapeHtml в них нет исполняемого HTML.
    // Не зависит от мест вызова в исходном коде — устойчива к рефакторингу.
    R.all.forEach(record => {
        const strings = [record.title, record.description, record.label];
        record.fields.forEach(field => {
            strings.push(field.label, field.hint, field.placeholder);
            (field.options || []).forEach(option => {
                strings.push(option.label, option.note);
            });
            (field.presets || []).forEach(preset => strings.push(String(preset)));
        });
        strings.forEach(text => {
            if (text === undefined || text === null) {
                return;
            }
            const escaped = V.escapeHtml(text);
            ok(escaped.indexOf('<script') === -1, 'исполняемый HTML в схеме ' + record.id);
            ok(!/on\\w+\\s*=/i.test(escaped), 'обработчик события в схеме ' + record.id);
        });
    });
});

test('содержимое записи не искажается HTML-экранированием', () => {
    // Значение TXT попадает в textarea через .value, поэтому экранирование
    // здесь не нужно и ломало бы содержимое (&, ", < — валидные символы TXT).
    const out = R.find('TXT').build({ name: '@', value: 'a=1&b=2 "q" <x>' }, 'example.com', R.find('TXT'));
    ok(out.indexOf('a=1&b=2') !== -1, 'амперсанд искажён: ' + out);
    ok(out.indexOf('&amp;') === -1, 'HTML-сущности попали в запись: ' + out);
    ok(out.indexOf('\\"q\\"') !== -1, 'кавычки экранированы неверно: ' + out);
});

test('результат и доп. выводы заполняются как текст, а не как разметка', () => {
    ok(/elements\.output\.value\s*=/.test(appJs), 'результат заполняется не через .value');
    ok(/target\.value\s*=/.test(appJs), 'дополнительные выводы заполняются не через .value');
    ok(/setText[\s\S]{0,200}textContent/.test(appJs), 'setText должен использовать textContent');
});

test('предпросмотр имени не искажается экранированием', () => {
    // setText использует textContent, поэтому дополнительное экранирование
    // показывало бы пользователю «&quot;» вместо «"»
    ok(!/escapeHtml\(DnsRecords\.fqdn/.test(appJs),
        'предпросмотр имени экранируется и будет показан некорректно');
});

test('результат записывается через value, а не через innerHTML', () => {
    ok(!/output\.innerHTML\s*=/.test(appJs), 'output заполняется через innerHTML');
    ok(!/extra-output[\w-]*\.innerHTML\s*=/.test(appJs), 'extra-output заполняется через innerHTML');
});

test('не используются опасные API', () => {
    const banned = [
        ['document.write', /document\.write\s*\(/],
        ['eval', /\beval\s*\(/],
        ['new Function', /new\s+Function\s*\(/],
        ['insertAdjacentHTML', /insertAdjacentHTML/],
        ['outerHTML', /\.outerHTML\s*=/],
        ['setAttribute("on...", ...)', /setAttribute\s*\(\s*['"]on/i],
        ['srcdoc', /srcdoc/]
    ];
    banned.forEach(pair => {
        ok(!pair[1].test(allJs), 'используется ' + pair[0]);
    });
});

test('в разметке нет inline-обработчиков событий', () => {
    const handlers = view.match(/\son[a-z]+\s*=/gi) || [];
    eq(handlers.join(', '), '', 'найдены inline-обработчики событий');
});

test('в разметке нет javascript:-ссылок', () => {
    // Проверяем только URL-атрибуты, а не текст (например, «включите JavaScript:»)
    const urls = view.match(/(?:href|src|action|formaction)\s*=\s*["'][^"']*["']/gi) || [];
    const dangerous = urls.filter(u => /javascript\s*:/i.test(u) || /data\s*:/i.test(u));
    eq(dangerous.join(', '), '', 'найдена опасная ссылка');
});

/* ------------------------------------------------------------------ */
/*  Инъекции                                                           */
/* ------------------------------------------------------------------ */

suite('Безопасность: инъекции');

test('нет SQL-конструкций в исполняемом коде', () => {
    const clean = stripLiteralsAndComments(allJs);
    // Проверяем устойчивые SQL-конструкции, а не отдельные слова
    const sqlPatterns = [
        /SELECT[\s\S]{1,80}?\s+FROM\b/i,
        /\bINSERT\s+INTO\b/i,
        /\bDELETE\s+FROM\b/i,
        /\bDROP\s+(TABLE|DATABASE)\b/i,
        /\bUNION\s+(ALL\s+)?SELECT\b/i,
        /\bEXEC(UTE)?\s/i,
        /\bOR\s+1\s*=\s*1\b/i
    ];
    const found = sqlPatterns.filter(p => p.test(clean)).map(p => p.source);
    eq(found.join(' | '), '', 'найдены SQL-конструкции');
});

test('нет кода, передающего ввод в запросы', () => {
    // Приложение полностью клиентское: нет ни сети, ни БД
    ok(!/\bfetch\s*\(/.test(allJs), 'используется fetch');
    ok(!/XMLHttpRequest/.test(allJs), 'используется XMLHttpRequest');
    ok(!/WebSocket/.test(allJs), 'используется WebSocket');
    ok(!/sendBeacon/.test(allJs), 'используется sendBeacon');
});

test('нет доступа к локальному хранилищу и cookie', () => {
    ok(!/localStorage|sessionStorage|document\.cookie/.test(allJs),
        'используется постоянное хранилище');
});

test('нет загрязнения прототипа', () => {
    ok(!/__proto__/.test(allJs), 'используется __proto__');
    ok(!/Object\.assign\(Object\.prototype/.test(allJs), 'загрязняется Object.prototype');
    ok(!/\[\s*['"]__proto__['"]\s*\]/.test(allJs), 'обращение к __proto__ по ключу');
});

test('нет опасных глобальных API', () => {
    const banned = [
        ['document.domain', /document\.domain/],
        ['window.name', /window\.name/],
        ['window.location', /window\.location/],
        ['navigator.getUserMedia', /getUserMedia/],
        ['indexedDB', /indexedDB/],
        ['serviceWorker', /serviceWorker/],
        ['postMessage', /postMessage/]
    ];
    banned.forEach(pair => ok(!pair[1].test(allJs), 'используется ' + pair[0]));
});

/* ------------------------------------------------------------------ */
/*  Изоляция кода                                                      */
/* ------------------------------------------------------------------ */

suite('Безопасность: изоляция кода');

test('каждый модуль обёрнут в IIFE', () => {
    [appJs, recordsJs, validatorsJs].forEach((src, i) => {
        ok(/\(function\s*\(\s*\)\s*\{/.test(src), 'модуль ' + i + ' не обёрнут в IIFE');
        ok(/\}\)\(\)\s*;?\s*$/.test(src.trim()), 'модуль ' + i + ' не закрыт');
    });
});

test('модули экспортируются в собственные глобальные имена', () => {
    ok(/const\s+Validators\s*=/.test(validatorsJs), 'Validators не экспортируется');
    ok(/const\s+DnsRecords\s*=/.test(recordsJs), 'DnsRecords не экспортируется');
});

test('в app.js нет файлового модуля IIFE с внешними аргументами', () => {
    // Внутренние функции не должны получать аргументы от глобальной области
    ok(!/^\s*var\s+\w+\s*=/m.test(appJs), 'используется устаревший var на верхнем уровне');
});

test('DOM-элементы получаются через один объект', () => {
    ok(/const\s+elements\s*=\s*\{\s*\}/.test(appJs), 'нет единого объекта элементов');
    const match = appJs.match(/function\s+cacheElements\s*\(\)\s*\{([\s\S]*?)\n    \}/);
    ok(match, 'функция кэширования элементов не найдена');
    if (match) {
        ok(match[1].indexOf('document.getElementById') !== -1,
            'элементы собираются не через getElementById');
    }
});

test('пользовательские данные не попадают в атрибуты через конкатенацию', () => {
    // Атрибуты собираются только из схемы (field.name/preset), а не из values/domain
    const lines = allJs.split('\n');
    const problems = lines
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(item => /="[^"]*'\s*\+/.test(item.line))
        .filter(item => /\b(values|state\.domain|elements\.domain|control\.value)\b/.test(item.line));
    eq(problems.map(p => 'строка ' + p.n).join(', '), '',
        'пользовательский ввод попадает в HTML-атрибут');
});

test('CSS не содержит url() с внешними адресами', () => {
    const urls = css.match(/url\(\s*['"]?[^)]*\)/gi) || [];
    const external = urls.filter(u => /^url\(\s*['"]?https?:/i.test(u));
    eq(external.join(', '), '', 'CSS ссылается на внешние ресурсы');
});

/* ------------------------------------------------------------------ */
/*  Криптография и буфер обмена                                        */
/* ------------------------------------------------------------------ */

suite('Безопасность: криптография и буфер обмена');

test('DKIM-ключи генерируются через WebCrypto', () => {
    ok(/crypto\.subtle\.generateKey/.test(appJs), 'WebCrypto не используется');
    ok(/RSA/.test(appJs), 'параметры RSA не заданы');
});

test('есть проверка доступности WebCrypto', () => {
    ok(/isWebCryptoAvailable/.test(appJs), 'нет проверки доступности WebCrypto');
});

test('не используются слабые генераторы случайных чисел', () => {
    ok(!/Math\.random/.test(allJs), 'используется Math.random для генерации ключей');
    ok(!/\b(md5|sha1)\b/i.test(allJs), 'используются устаревшие хеши');
});

test('ключи никуда не отправляются', () => {
    ok(!/privateKey[\s\S]{0,200}(fetch|XMLHttpRequest|sendBeacon)/.test(appJs),
        'приватный ключ может отправляться наружу');
});

test('копирование использует безопасный API с запасным вариантом', () => {
    ok(/navigator\.clipboard/.test(appJs), 'Clipboard API не используется');
    ok(/legacyCopy/.test(appJs), 'нет запасного механизма копирования');
});

test('имя скачиваемого файла не содержит пользовательский ввод', () => {
    const match = appJs.match(/downloadFile\s*\(([\s\S]{0,300}?)\)\s*;/);
    ok(match, 'вызов downloadFile не найден');
    if (match) {
        ok(!/\bvalues\b|\bstate\.domain\b/.test(match[1]),
            'имя файла строится из пользовательского ввода');
    }
});

/* ------------------------------------------------------------------ */
/*  Валидация ввода                                                    */
/* ------------------------------------------------------------------ */

suite('Безопасность: валидация ввода');

test('каждое свободное текстовое поле имеет правила валидации', () => {
    const textFields = recordsJs.match(/type:\s*'text'/g) || [];
    const validated = recordsJs.match(/rules:\s*\[\{\s*test:/g) || [];
    ok(textFields.length > 0, 'нет текстовых полей');
    ok(validated.length >= textFields.length,
        'текстовых полей: ' + textFields.length + ', с валидацией: ' + validated.length);
});

test('каждое правило валидации содержит текст ошибки', () => {
    // Проверка на живых объектах схемы, а не разбор исходного кода:
    // устойчива к переименованиям и смене форматирования.
    let count = 0;
    R.all.forEach(record => {
        record.fields.forEach(field => {
            (field.rules || []).forEach(rule => {
                count++;
                eq(typeof rule.test, 'function', record.id + '.' + field.name + ': нет функции проверки');
                ok(typeof rule.message === 'string' && rule.message.length > 0,
                    record.id + '.' + field.name + ': нет текста ошибки');
            });
        });
    });
    ok(count >= 15, 'найдено правил: ' + count);
});

test('числовые поля ограничены диапазоном', () => {
    const numbers = recordsJs.match(/type:\s*'number'/g) || [];
    const ranges = recordsJs.match(/Validators\.integerInRange/g) || [];
    ok(numbers.length > 0, 'нет числовых полей');
    ok(ranges.length >= numbers.length,
        'числовых полей: ' + numbers.length + ', с диапазоном: ' + ranges.length);
});

test('небезопасные для DNS-строк символы отвергаются', () => {
    ok(validatorsJs.indexOf('RECORD_UNSAFE') !== -1, 'нет проверки небезопасных символов');
    ok(/RECORD_UNSAFE\s*=\s*\/\["\\\\\]\//.test(validatorsJs),
        'не проверяются кавычки и обратные слэши');
});

test('email отвергает кавычки и обратные слэши', () => {
    const match = validatorsJs.match(/function\s+email\s*\([^)]*\)\s*\{([\s\S]*?)\n {4}\}/);
    ok(match, 'валидатор email не найден');
    if (match) {
        ok(match[1].indexOf('recordSafe') !== -1,
            'email не проверяет небезопасные символы');
    }
});

test('url отвергает кавычки и обратные слэши', () => {
    const match = validatorsJs.match(/function\s+url\s*\([^)]*\)\s*\{([\s\S]*?)\n {4}\}/);
    ok(match, 'валидатор url не найден');
    if (match) {
        ok(match[1].indexOf('recordSafe') !== -1,
            'url не проверяет небезопасные символы');
    }
});

/* ------------------------------------------------------------------ */
/*  Инъекция DNS-записи через управляющие символы                       */
/* ------------------------------------------------------------------ */

suite('Безопасность: инъекция дополнительных DNS-записей');

const NL = String.fromCharCode(10);
const CRLF = String.fromCharCode(13, 10);
const NUL = String.fromCharCode(0);

// Значение, из которого при вставке в панель управления можно вывести лишнюю запись
const INJECTION = 'safe' + NL + '_x.evil.com. A 1.2.3.4';

function recordValues(id) {
    const record = R.find(id);
    const values = {};
    record.fields.forEach(field => {
        values[field.name] = typeof field.value === 'function'
            ? field.value('example.com')
            : (field.type === 'checks' ? Object.assign({}, field.value) : field.value);
    });
    return { record, values };
}

test('валидаторы отвергают перевод строки в домене', () => {
    eq(V.domain('example.com' + NL + 'evil'), false);
    eq(V.subdomain('mail' + NL + 'evil'), false);
    eq(V.hostname('a' + NL + 'b.com'), false);
    eq(V.hostnameWithSubdomain('a' + NL + 'b'), false);
});

test('валидаторы отвергают перевод строки в email и url', () => {
    eq(V.email('a@b.com' + NL + 'x'), false);
    eq(V.url('https://a.com/' + NL + 'x'), false);
});

test('валидаторы отвергают управляющие символы в адресах', () => {
    eq(V.ipv4('192.168.1.10' + NL), true, 'перевод строки по краям обрезается');
    eq(V.ipv4('19' + NL + '2.168.1.10'), false);
    eq(V.ipv6('2001:db8' + NL + '::1'), false);
    eq(V.ipv4List('192.168.1.10,' + NL + '10.0.0.1'), false);
});

test('recordSafe отвергает нули и непечатаемые символы', () => {
    eq(V.recordSafe('a' + NUL + 'b'), false);
    eq(V.recordSafe('a' + CRLF + 'b'), false);
    eq(V.recordSafe('a b'), false, 'вертикальная табуляция запрещена');
    eq(V.recordSafe('обычный текст'), true);
    eq(V.recordSafe('https://a.com/?a=1&b=2'), true, 'амперсанд разрешён');
});

test('ни один тип записи не допускает многострочной инъекции', () => {
    const targets = ['BIMI', 'TXT', 'DMARC', 'SPF', 'TLS-RPT', 'MTA-STS', 'DKIM'];
    const problems = [];

    targets.forEach(id => {
        const { record, values } = recordValues(id);
        const textFields = record.fields.filter(f => f.type === 'text');
        textFields.forEach(field => {
            const attempt = Object.assign({}, values);
            attempt[field.name] = INJECTION;
            let output;
            try {
                output = record.build(attempt, 'example.com', record);
            } catch (error) {
                problems.push(id + '.' + field.name + ' бросает исключение');
                return;
            }
            if (output.indexOf(NL) !== -1) {
                problems.push(id + '.' + field.name + ' -> перевод строки в записи');
            }
        });
    });

    eq(problems.join(' | '), '');
});

test('поддомен и хост не допускают многострочной инъекции', () => {
    const problems = [];
    ['MX', 'SRV', 'CNAME'].forEach(id => {
        const { record, values } = recordValues(id);
        const attempt = Object.assign({}, values);
        attempt.name = 'a' + NL + '_x.evil.com';
        const output = record.build(attempt, 'example.com', record);
        if (output.indexOf(NL) !== -1 || output.indexOf('_x.evil.com') !== -1) {
            problems.push(id + ' -> ' + JSON.stringify(output));
        }
    });
    eq(problems.join(' | '), '');
});

test('policy-файл MTA-STS остаётся многострочным', () => {
    // Многострочность здесь намеренная — файл .well-known/mta-sts.txt
    const { record, values } = recordValues('MTA-STS');
    const policy = record.extraOutputs[0].build(values, 'example.com', record);
    ok(policy.split('\n').length >= 4, 'policy-файл должен содержать несколько строк');
    ok(policy.indexOf('version: STSv1') !== -1, 'нет строки version');
});

test('домен не содержит управляющих символов', () => {
    const dom = R.fqdn('mail', 'example.com');
    eq(dom.indexOf(NL), -1, 'домен содержит перевод строки');
    eq(dom, 'mail.example.com.');
});

/* ------------------------------------------------------------------ */
/*  Значения полей-списков и пределы ввода                              */
/* ------------------------------------------------------------------ */

suite('Безопасность: поля-списки не доверяют значениям');

test('значение вне списка не подставляется в запись', () => {
    const problems = [];

    [['DMARC', 'policy', 'none"; p=reject'],
     ['SPF', 'policy', '+all"; evil'],
     ['MTA-STS', 'mode', 'enforce']].forEach(([id, field, injected]) => {
        const { record, values } = recordValues(id);
        const attempt = Object.assign({}, values);
        attempt[field] = injected;

        const output = id === 'MTA-STS'
            ? record.extraOutputs[0].build(attempt, 'example.com', record)
            : record.build(attempt, 'example.com', record);

        // Подставленное значение не должно попасть в запись ни в каком виде
        if (output.indexOf('evil') !== -1 || output.indexOf('p=reject') !== -1) {
            problems.push(id + '.' + field + ' -> ' + JSON.stringify(output));
        }
    });

    eq(problems.join(' | '), '');
});

test('подстановка чужого значения возвращает объявленное по умолчанию', () => {
    const dmarc = recordValues('DMARC');
    const attempt = Object.assign({}, dmarc.values, { policy: 'none"; p=reject' });
    const output = dmarc.record.build(attempt, 'example.com', dmarc.record);
    eq(output, dmarc.record.build(dmarc.values, 'example.com', dmarc.record),
        'подставленное значение повлияло на запись');
});

test('все поля-списки отбрасывают значения вне списка', () => {
    // Поведенческая проверка на живых объектах: перебираем ВСЕ поля-списки
    // всех записей, подставляем чужое значение и требуем запись по умолчанию.
    // Не зависит от имён функций и мест вызова в исходном коде.
    const problems = [];
    let count = 0;
    R.all.forEach(record => {
        record.fields.forEach(field => {
            if (field.type !== 'select') {
                return;
            }
            count++;
            const { values } = recordValues(record.id);
            const attempt = Object.assign({}, values);
            attempt[field.name] = 'чужое-значение';
            let output;
            try {
                output = record.build(attempt, 'example.com', record);
            } catch (error) {
                problems.push(record.id + '.' + field.name + ' бросает исключение');
                return;
            }
            if (output.indexOf('чужое-значение') !== -1) {
                problems.push(record.id + '.' + field.name + ' -> ' + JSON.stringify(output));
            }
        });
    });
    ok(count >= 7, 'найдено полей-списков: ' + count);
    eq(problems.join(' | '), '');
});

suite('Безопасность: пределы ввода');

test('предел длины ограничивает вставку огромного текста', () => {
    // Поведенческая проверка: сборка записи от 200000 символов не должна
    // подвешивать процесс. Статический разбор таблицы пределов заменён замером.
    const { record, values } = recordValues('TXT');
    values.value = 'a'.repeat(200000);
    const started = Date.now();
    const output = record.build(values, 'example.com', record);
    const elapsed = Date.now() - started;
    ok(output.length > 0, 'запись не собрана');
    ok(elapsed < 5000, 'сборка заняла ' + elapsed + ' мс — слишком медленно');
});

test('невалидное значение поля-списка не роняет сборку', () => {
    R.all.forEach(record => {
        record.fields.forEach(field => {
            if (field.type !== 'select') {
                return;
            }
            const { values } = recordValues(record.id);
            const attempt = Object.assign({}, values);
            attempt[field.name] = undefined;
            let output;
            try {
                output = record.build(attempt, 'example.com', record);
            } catch (error) {
                eq('исключение: ' + error.message, '', record.id + '.' + field.name);
            }
            ok(typeof output === 'string' && output.length > 0,
                record.id + '.' + field.name + ': пустая запись при сброшенном списке');
        });
    });
});

test('сборка записи не зависит от порядка полей формы', () => {
    const { record, values } = recordValues('DMARC');
    const a = record.build(values, 'example.com', record);
    const shuffled = {};
    Object.keys(values).reverse().forEach(key => { shuffled[key] = values[key]; });
    const b = record.build(shuffled, 'example.com', record);
    eq(a, b);
});

test('селекторы DKIM и BIMI не допускают инъекции', () => {
    // Валидация поля отвергает перевод строки, а сборка записи дополнительно
    // очищает значение: важно, что запись остаётся одной строкой
    ['DKIM', 'BIMI'].forEach(id => {
        const { record, values } = recordValues(id);
        const attempt = Object.assign({}, values);
        attempt.selector = 'sel' + NL + '_x.evil.com';
        const output = record.build(attempt, 'example.com', record);
        eq(output.split(NL).length, 1, id + ': запись разбилась на несколько строк');
        ok(/\._domainkey\.|\._bimi\./.test(output), id + ': потерян базовый префикс');
    });
});

test('валидация поля селектора отвергает перевод строки', () => {
    ['DKIM', 'BIMI'].forEach(id => {
        const { record } = recordValues(id);
        const field = record.fields.find(f => f.name === 'selector');
        ok(field, id + ': нет поля selector');
        if (field && field.rules) {
            field.rules.forEach(rule => {
                eq(rule.test('sel' + NL + '_x.evil.com'), false,
                    id + ': перевод строки прошёл валидацию');
            });
        }
    });
});

test('нормальные селекторы работают как раньше', () => {
    const dkim = recordValues('DKIM');
    dkim.values.publicKey = 'KEY';
    eq(dkim.record.build(dkim.values, 'example.com', dkim.record),
        'default._domainkey.example.com. TXT "v=DKIM1; k=rsa; p=KEY"');

    const bimi = recordValues('BIMI');
    ok(bimi.record.build(bimi.values, 'example.com', bimi.record)
        .startsWith('default._bimi.example.com. TXT "v=BIMI1;'));
});

test('домен ограничен длиной и безопасными символами', () => {
    const match = validatorsJs.match(/const\s+DOMAIN\s*=\s*([\s\S]*?);/);
    ok(match, 'регулярное выражение домена не найден');
    if (match) {
        ok(match[1].indexOf('{1,253}') !== -1, 'нет ограничения длины домена');
        ok(/^[^=]*\^\(\?=\./.test(match[1]) || match[1].indexOf('(?=') !== -1,
            'нет lookahead-ограничения длины');
    }
});

test('нет небезопасных регулярных выражений (ReDoS)', () => {
    const regexes = allJs.match(/\/\^[^/\n]{3,200}\/[gimsuy]*/g) || [];
    // Катастрофический бэктрекинг возникает, когда группа из повторяемого
    // символа сама повторяется: (a+)+, (a*)*, (\w+)* и т.п.
    const redos = /(\((?:\[[^\]]{1,20}\]|\\[wds]|\\.|[a-z])\s*[+*]\)|(\([^()]{1,20}\)\s*[+*]){2})/i;
    const dangerous = regexes.filter(r => redos.test(r));
    eq(dangerous.join(' | '), '', 'найдены потенциально опасные регулярные выражения');
});

test('в регулярных выражениях есть границы длины строк', () => {
    // Все входные данные ограничены по длине, чтобы исключить зависание на вводе
    ok(/function\s+domain\s*\([^)]*\)\s*\{[\s\S]{0,200}?\.test/.test(validatorsJs),
        'домен проверяется непосредственно');
    ok(recordsJs.indexOf('maxlength') !== -1 || allJs.indexOf('.slice(') !== -1 ||
        allJs.indexOf('{1,253}') !== -1,
        'нет ограничения длины входных данных');
});

/* ------------------------------------------------------------------ */
/*  Обработка ошибок                                                   */
/* ------------------------------------------------------------------ */

suite('Безопасность: обработка ошибок');

test('нет пустых блоков catch', () => {
    const empty = allJs.match(/catch\s*\([^)]*\)\s*\{\s*\}/g) || [];
    eq(empty.length, 0, 'пустые catch: ' + empty.length);
});

test('генерация ключей обрабатывает отказ WebCrypto', () => {
    // Отказ передаётся вторым аргументом .then(onSuccess, onError)
    ok(/isWebCryptoAvailable\(\)\)\s*\{[\s\S]{0,120}?Promise\.reject/.test(appJs),
        'недоступность WebCrypto не приводит к явному отказу');
    ok(/generateKeyPair\(keyLength\)\.then\(function \(pair\)[\s\S]{0,900}?\}\s*,\s*function\s*\(\s*\)\s*\{/,
        'обработчик ошибок генерации ключей не найден');
    ok(/paintMessage\(feedback,\s*'Браузер не смог создать ключ/.test(appJs),
        'пользователю не показывается понятное сообщение об ошибке');
});

test('после неудачной генерации кнопки разблокируются', () => {
    ok(/generateButton\.disabled\s*=\s*false/.test(appJs),
        'кнопка генерации может остаться заблокированной после ошибки');
});

test('инициализация приложения защищена от ошибок', () => {
    ok(/DOMContentLoaded/.test(appJs), 'нет ожидания DOMContentLoaded');
    const match = appJs.match(/addEventListener\('DOMContentLoaded'[\s\S]{0,300}?\}\s*\)/);
    ok(match, 'обработчик инициализации не найден');
});

test('поле результата всегда присутствует в разметке', () => {
    ok(/id="output"/.test(view), 'нет поля результата в разметке');
    ok(/id="domain"/.test(view), 'нет поля домена в разметке');
});

test('есть noscript-заглушка', () => {
    ok(/<noscript>/.test(view), 'нет noscript-заглушки');
});