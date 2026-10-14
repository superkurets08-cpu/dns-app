const { suite, test, eq } = require('./runner');
const { loadSources } = require('./harness');

const V = loadSources().Validators;

suite('Валидаторы: числовые диапазоны');

test('приоритет MX: границы 0 и 50 в допустимы', () => {
    const range = V.integerInRange(0, 50);
    eq(range('0'), true);
    eq(range('50'), true);
});

test('приоритет MX: значения вне диапазона отвергаются', () => {
    const range = V.integerInRange(0, 50);
    eq(range('-1'), false);
    eq(range('51'), false);
});

test('приоритет MX: нецелые значения отвергаются', () => {
    const range = V.integerInRange(0, 50);
    eq(range('5.0'), false);
    eq(range('5.5'), false);
    eq(range('e5'), false);
});

test('числовой валидатор не принимает экспоненту и hex', () => {
    const range = V.integerInRange(0, 65535);
    eq(range('1e2'), false);
    eq(range('0x10'), false);
    eq(range('Infinity'), false);
    eq(range('+5'), false);
});

test('числовой валидатор принимает число с пробелами по краям', () => {
    eq(V.integerInRange(0, 50)('  5  '), true);
});

test('числовой валидатор отвергает пустое значение', () => {
    eq(V.integerInRange(0, 50)(''), false);
});

test('порт: 1 и 65535 допустимы, 0 и 65536 нет', () => {
    const port = V.integerInRange(1, 65535);
    eq(port('1'), true);
    eq(port('65535'), true);
    eq(port('0'), false);
    eq(port('65536'), false);
});

test('процент DMARC: 0 и 100 допустимы', () => {
    const pct = V.integerInRange(0, 100);
    eq(pct('0'), true);
    eq(pct('100'), true);
    eq(pct('101'), false);
});

suite('Валидаторы: IPv4');

test('принимает корректные адреса', () => {
    eq(V.ipv4('0.0.0.0'), true);
    eq(V.ipv4('192.168.1.10'), true);
    eq(V.ipv4('255.255.255.255'), true);
});

test('отвергает неверное число октетов', () => {
    eq(V.ipv4('1.2.3'), false);
    eq(V.ipv4('1.2.3.4.5'), false);
    eq(V.ipv4('1..1.1'), false);
    eq(V.ipv4('1.1.1.'), false);
});

test('отвергает выход за диапазон октета', () => {
    eq(V.ipv4('256.1.1.1'), false);
    eq(V.ipv4('1.1.1.999'), false);
});

test('отвергает ведущие нули', () => {
    eq(V.ipv4('01.1.1.1'), false);
    eq(V.ipv4('1.1.1.01'), false);
});

test('отвергает мусор', () => {
    eq(V.ipv4(''), false);
    eq(V.ipv4('a.b.c.d'), false);
    eq(V.ipv4('1.1.1.1a'), false);
    eq(V.ipv4('1.1.1.1 2'), false);
});

test('обрезает пробелы и переводы строк по краям', () => {
    eq(V.ipv4('1.1.1.1 '), true);
    eq(V.ipv4(' 1.1.1.1'), true);
    eq(V.ipv4('1.1.1.1\n'), true);
});

test('список адресов разбирается по запятой', () => {
    eq(V.ipv4List('1.1.1.1, 8.8.8.8'), true);
    eq(V.ipv4List('1.1.1.1,bad'), false);
    eq(V.ipv4List(''), true);
});

suite('Валидаторы: IPv6');

test('принимает сокращённые и полные формы', () => {
    eq(V.ipv6('::1'), true);
    eq(V.ipv6('::'), true);
    eq(V.ipv6('2001:db8::1'), true);
    eq(V.ipv6('1:2:3:4:5:6:7:8'), true);
    eq(V.ipv6('2001:0db8:0000:0000:0000:0000:0000:0001'), true);
});

test('отвергает неверное число групп', () => {
    eq(V.ipv6('1:2:3:4:5:6:7'), false);
    eq(V.ipv6('1:2:3:4:5:6:7:8:9'), false);
});

test('отвергает две группы подряд', () => {
    eq(V.ipv6('1::2::3'), false);
});

test('отвергает недопустимые символы', () => {
    eq(V.ipv6('gggg::1'), false);
    eq(V.ipv6('12345::1'), false);
    eq(V.ipv6('1.2.3.4'), false);
    eq(V.ipv6(''), false);
});

suite('Валидаторы: домены и поддомены');

test('принимает корректные домены', () => {
    eq(V.domain('example.com'), true);
    eq(V.domain('a.co'), true);
    eq(V.domain('sub.example.com'), true);
    eq(V.domain('xn--80ak6aa92e.com'), true);
    eq(V.domain('EXAMPLE.COM'), true);
});

test('отвергает домены без точки и с ошибочными метками', () => {
    eq(V.domain('example'), false);
    eq(V.domain('-bad.com'), false);
    eq(V.domain('bad-.com'), false);
    eq(V.domain('a..b'), false);
    eq(V.domain('exa_mple.com'), false);
    eq(V.domain('a b.com'), false);
});

test('отвергает слишком длинную метку', () => {
    eq(V.domain('a'.repeat(64) + '.com'), false);
});

test('поддомен: @ означает корень домена', () => {
    eq(V.subdomain('@'), true);
});

test('поддомен принимает обычные имена', () => {
    eq(V.subdomain('mail'), true);
    eq(V.subdomain('a-b'), true);
    eq(V.subdomain('a'.repeat(63)), true);
});

test('поддомен отвергает некорректные имена', () => {
    eq(V.subdomain('a.b'), false);
    eq(V.subdomain('-a'), false);
    eq(V.subdomain('a-'), false);
    eq(V.subdomain('a b'), false);
    eq(V.subdomain('a'.repeat(64)), false);
});

suite('Валидаторы: email');

test('принимает корректные адреса', () => {
    eq(V.email('dmarc@example.com'), true);
    eq(V.email('a.b+c@sub.example.com'), true);
});

test('отвергает адреса без домена', () => {
    eq(V.email('a@b'), false);
    eq(V.email('@b.com'), false);
    eq(V.email('a@b.'), false);
    eq(V.email('a@.com'), false);
});

test('отвергает пробелы и множественные знаки', () => {
    eq(V.email('a b@c.com'), false);
    eq(V.email('a@@b.com'), false);
});

test('отвергает кавычки и обратные слэши — они ломают DNS-запись', () => {
    eq(V.email('a"b@ex.com'), false);
    eq(V.email('a\\b@ex.com'), false);
});

suite('Валидаторы: URL');

test('принимает http и https', () => {
    eq(V.url('https://example.com/logo.svg'), true);
    eq(V.url('http://example.com:8443/a?b=1#c'), true);
});

test('отвергает опасные и неполные схемы', () => {
    eq(V.url('ftp://example.com'), false);
    eq(V.url('javascript:alert(1)'), false);
    eq(V.url('data:text/html,x'), false);
    eq(V.url('file:///etc/passwd'), false);
});

test('отвергает URL без схемы и без хоста', () => {
    eq(V.url('example.com'), false);
    eq(V.url('//example.com'), false);
    eq(V.url('https://'), false);
    eq(V.url(''), false);
});

test('отвергает кавычки и обратные слэши — они ломают DNS-запись', () => {
    eq(V.url('https://ex.com/a"b'), false);
    eq(V.url('https://ex.com/a\\b'), false);
});

suite('Валидаторы: punycode и IDN-домены');

test('принимает домены в punycode — так выглядят все IDN-домены в DNS', () => {
    eq(V.domain('xn--e1afmkfd.xn--p1ai'), true);
    eq(V.domain('xn--80akhbyknj4f.xn--p1ai'), true);
    eq(V.domain('mail.xn--e1afmkfd.xn--p1ai'), true);
});

;

test('TLD короче двух символов не принимается', () => {
    eq(V.domain('a.b'), false);
    eq(V.domain('example.c'), false);
});

test('punycode-домен не путается с IP-адресом', () => {
    eq(V.domain('192.168.1.1'), false);
    eq(V.domain('10.0.0.255'), false);
    eq(V.domain('a.1'), false);
    eq(V.domain('a.12'), false);
});

test('кириллические домены принимаются через мостик в punycode', () => {
    eq(V.domain('пример.рф'), true);
    eq(V.toAsciiDomain('пример.рф'), 'xn--e1afmkfd.xn--p1ai');
    eq(V.toAsciiDomain('почта.пример.бел'), 'xn--80a1acny.xn--e1afmkfd.xn--90ais');
});

suite('Валидаторы: recordSafe — общая проверка безопасности записи');

test('отвергает управляющие символы', () => {
    const control = [String.fromCharCode(0), String.fromCharCode(9), String.fromCharCode(10),
        String.fromCharCode(13), String.fromCharCode(27), String.fromCharCode(127)];
    control.forEach(code => {
        eq(V.recordSafe('a' + code + 'b'), false, 'символ ' + code.charCodeAt(0) + ' принят');
    });
});

test('отвергает разделители строк Unicode', () => {
    eq(V.recordSafe('a' + String.fromCharCode(0x2028) + 'b'), false);
    eq(V.recordSafe('a' + String.fromCharCode(0x2029) + 'b'), false);
});

test('отвергает кавычки и обратные слэши', () => {
    eq(V.recordSafe('a"b'), false);
    eq(V.recordSafe('a\\b'), false);
});

test('разрешает обычные значения записи', () => {
    eq(V.recordSafe('v=spf1 ip4:192.168.1.10 ~all'), true);
    eq(V.recordSafe('https://ex.com/l.svg?a=1&b=2'), true, 'амперсанд разрешён');
    eq(V.recordSafe('mail.to=admin@example.com; d=ex.com'), true);
});

suite('Валидаторы: невидимые Unicode-символы отвергаются структурой');

test('поддомен не принимает неразрывный пробел и невидимые символы', () => {
    eq(V.subdomain('ma' + String.fromCharCode(0xa0) + 'il'), false);
    eq(V.subdomain('ma' + String.fromCharCode(0x200b) + 'il'), false);
    eq(V.subdomain('admin' + String.fromCharCode(0x202e) + 'x'), false, 'правостороннее замыкание');
});

test('поддомен не принимает кириллицу, похожую на латиницу', () => {
    // а кириллическая U+0430 внешне неотличима от латинской a
    eq(V.subdomain(String.fromCharCode(0x0430)), false);
});

suite('Валидаторы: SPF с IPv6');

test('принимает ip4:, ip6: и голые адреса', () => {
    eq(V.spfIp('192.168.1.10'), true);
    eq(V.spfIp('ip4:192.168.1.10'), true);
    eq(V.spfIp('IP4:192.168.1.10'), true);
    eq(V.spfIp('ip6:2001:db8::1'), true);
    eq(V.spfIp('IP6:2001:db8::1'), true);
    eq(V.spfIp('2001:db8::1'), true);
});

test('отвергает мусор и подстановки', () => {
    eq(V.spfIp('999.1.1.1'), false);
    eq(V.spfIp('ip4:999.1.1.1'), false);
    eq(V.spfIp('ip6:::1::2'), false);
    eq(V.spfIp('ip5:1.2.3.4'), false);
    eq(V.spfIp('example.com'), false);
    eq(V.spfIp('1.2.3.4' + String.fromCharCode(10) + 'evil'), false);
    eq(V.spfIp('ip4:1.2.3.4"'), false);
});

test('список разбирается по запятой', () => {
    eq(V.spfIpList('192.168.1.10, ip6:2001:db8::1'), true);
    eq(V.spfIpList('192.168.1.10, 999.1.1.1'), false);
    eq(V.spfIpList('  '), true);
});

suite('Валидаторы: IDN-мостик');

test('ASCII проходит мостик без изменений', () => {
    eq(V.toAsciiDomain('Example.COM'), 'Example.COM');
    eq(V.toAsciiDomain('  mail.example.com  '), 'mail.example.com');
    eq(V.toAsciiDomain(''), '');
});

test('структурные символы не конвертируются', () => {
    // Иначе 'a@b' схлопнулось бы в домен 'b', а 'host:8080' — в 'host'
    eq(V.toAsciiDomain('a@b'), 'a@b');
    eq(V.toAsciiDomain('host:8080'), 'host:8080');
    eq(V.toAsciiDomain('a/b'), 'a/b');
    eq(V.domain('a@b'), false);
    eq(V.domain('example.com:8080'), false);
});

test('домен принимает кириллицу целиком', () => {
    eq(V.domain('пример.рф'), true);
    eq(V.domain('почта.пример.бел'), true);
    eq(V.domain('mail.xn--e1afmkfd.xn--90ais'), true);
});

test('email принимает кириллический домен, но не локальную часть', () => {
    eq(V.email('dmarc@пример.рф'), true);
    eq(V.toAsciiEmail('dmarc@пример.рф'), 'dmarc@xn--e1afmkfd.xn--p1ai');
    eq(V.email('дмарк@пример.рф'), false);
    eq(V.email('a@b.com' + String.fromCharCode(10) + 'x'), false);
});

test('url принимает кириллический хост', () => {
    eq(V.url('https://пример.рф/logo.svg'), true);
    const ascii = V.toAsciiUrl('https://пример.рф/logo.svg');
    eq(ascii.indexOf('xn--e1afmkfd.xn--p1ai') !== -1, true, ascii);
    eq(/[^\x00-\x7F]/.test(ascii), false, 'не ASCII: ' + ascii);
});

test('принятые значения после конвертации не содержат управляющих символов', () => {
    // Конвертер возвращает исходник при неудаче — тогда обязана сработать
    // валидация. Здесь проверяем пару «валидно => чисто» на живых функциях.
    const accepted = [
        V.toAsciiDomain('пример.рф'),
        V.toAsciiEmail('dmarc@пример.рф'),
        V.toAsciiUrl('https://пример.рф/logo.svg?a=1&b=2')
    ];
    eq(V.domain('пример.рф'), true);
    eq(V.email('dmarc@пример.рф'), true);
    eq(V.url('https://пример.рф/logo.svg?a=1&b=2'), true);
    accepted.forEach(out => {
        eq(/[\u0000-\u001F\u007F]/.test(out), false, JSON.stringify(out));
    });
});

test('неконвертируемый мусор остаётся невалидным', () => {
    eq(V.domain('a\nпример.рф'), false);
    eq(V.email('a@b\nc.com'), false);
    eq(V.url('https://ex.com/\nx'), false);
});
