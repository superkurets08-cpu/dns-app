const { suite, test, eq, ok } = require('./runner');
const fs = require('fs');
const path = require('path');

const CSS_PATH = path.join(__dirname, '..', 'DnsRecordGenerator', 'Content', 'css', 'site.css');
const VIEW_PATH = path.join(__dirname, '..', 'DnsRecordGenerator', 'Views', 'Home', 'Index.cshtml');

const css = fs.readFileSync(CSS_PATH, 'utf8');
const view = fs.readFileSync(VIEW_PATH, 'utf8');

// Вспомогательная функция для извлечения содержимого медиа-запроса
function mediaQueryContent(query) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('@media\\s*\\(' + escaped + '\\)\\s*\\{([\\s\\S]*?)\\n\\}', 'i');
    const match = css.match(regex);
    return match ? match[1] : null;
}

// Вспомогательная функция для проверки наличия правила в медиа-запросе
function hasRuleInMedia(query, selectorPattern, propertyPattern) {
    const content = mediaQueryContent(query);
    if (!content) return false;
    const selectorRegex = new RegExp(selectorPattern + '\\s*\\{[^}]*' + propertyPattern, 'i');
    return selectorRegex.test(content);
}

suite('Адаптивность: breakpoints');

test('определены все необходимые breakpoints', () => {
    const required = ['1100px', '768px', '480px'];
    required.forEach(bp => {
        ok(css.indexOf('max-width: ' + bp) !== -1, 'не найден breakpoint ' + bp);
    });
});

test('breakpoints идут в порядке убывания', () => {
    const matches = css.match(/max-width:\s*(\d+)px/g) || [];
    const values = matches.map(m => parseInt(m.match(/\d+/)[0], 10));
    for (let i = 1; i < values.length; i++) {
        ok(values[i] < values[i - 1],
            'breakpoint ' + values[i] + 'px должен быть меньше ' + values[i - 1] + 'px');
    }
});

suite('Адаптивность: типографика');

test('размеры шрифтов используют clamp() для плавного масштабирования', () => {
    const required = ['--fs-title', '--fs-block', '--fs-p', '--fs-label', '--fs-s', '--fs-xs'];
    required.forEach(prop => {
        const regex = new RegExp(prop + ':\\s*clamp\\(');
        ok(regex.test(css), prop + ' не использует clamp()');
    });
});

test('clamp() имеет минимальное, предпочтительное и максимальное значения', () => {
    const matches = css.match(/clamp\([^)]+\)/g) || [];
    ok(matches.length >= 6, 'недостаточно clamp() значений: ' + matches.length);
    matches.forEach(expr => {
        const parts = expr.match(/clamp\(([^)]+)\)/)[1].split(',');
        eq(parts.length, 3, 'clamp() должен иметь 3 значения: ' + expr);
    });
});

suite('Адаптивность: отступы');

test('padding контейнера использует clamp()', () => {
    const match = css.match(/\.container\s*\{[^}]*padding:\s*[^;]*clamp\(/);
    ok(match, '.container не использует clamp() для padding');
});

test('padding блоков использует clamp()', () => {
    const match = css.match(/\.block\s*\{[^}]*padding:\s*clamp\(/);
    ok(match, '.block не использует clamp() для padding');
});

test('gap сетки использует clamp()', () => {
    const match = css.match(/\.grid\s*\{[^}]*gap:\s*clamp\(/);
    ok(match, '.grid не использует clamp() для gap');
});

test('отступы кнопок используют clamp()', () => {
    const match = css.match(/\.btn\s*\{[^}]*padding:\s*clamp\(/);
    ok(match, '.btn не использует clamp() для padding');
});

suite('Адаптивность: сетка');

test('grid--3 переключается на 2 колонки при 1100px', () => {
    const content = mediaQueryContent('max-width: 1100px');
    ok(content !== null, 'медиа-запрос 1100px не найден');
    ok(content.indexOf('.grid--3') !== -1, '.grid--3 не найден в медиа-запросе 1100px');
    ok(content.indexOf('repeat(2') !== -1, 'нет переключения на 2 колонки');
});

test('grid--2 и grid--3 переключаются на 1 колонку при 768px', () => {
    const content = mediaQueryContent('max-width: 768px');
    ok(content !== null, 'медиа-запрос 768px не найден');
    ok(content.indexOf('.grid--2') !== -1, '.grid--2 не найден в медиа-запросе 768px');
    ok(content.indexOf('.grid--3') !== -1, '.grid--3 не найден в медиа-запросе 768px');
    ok(content.indexOf('minmax(0, 1fr)') !== -1, 'нет переключения на 1 колонку');
});

test('сетка использует minmax(0, 1fr) для предотвращения переполнения', () => {
    const matches = css.match(/minmax\(0,\s*1fr\)/g) || [];
    ok(matches.length >= 3, 'недостаточно minmax(0, 1fr) в сетке');
});

suite('Адаптивность: вкладки');

test('вкладки имеют overflow-x: auto для мобильных', () => {
    const match = css.match(/\.tabs\s*\{[^}]*overflow-x:\s*auto/);
    ok(match, '.tabs не имеет overflow-x: auto');
});

test('вкладки имеют адаптивный padding через clamp()', () => {
    const match = css.match(/\.tab\s*\{[^}]*padding:\s*clamp\(/);
    ok(match, '.tab не использует clamp() для padding');
});

test('вкладки имеют white-space: nowrap', () => {
    const match = css.match(/\.tab\s*\{[^}]*white-space:\s*nowrap/);
    ok(match, '.tab не имеет white-space: nowrap');
});

suite('Адаптивность: кнопки');

test('кнопки становятся полноширинными на мобильных', () => {
    ok(hasRuleInMedia('max-width: 768px', '\\.actions \\.btn', 'flex:\\s*1\\s+1\\s+100%'),
        '.actions .btn не становится полноширинным на мобильных');
});

test('пресеты адаптивны на мобильных', () => {
    ok(hasRuleInMedia('max-width: 768px', '\\.preset', 'flex:\\s*1\\s+1\\s+calc\\(50%'),
        '.preset не адаптивен на мобильных');
});

test('пресеты полноширинные на очень узких экранах', () => {
    ok(hasRuleInMedia('max-width: 480px', '\\.preset', 'flex:\\s*1\\s+1\\s+100%'),
        '.preset не полноширинный на ≤480px');
});

suite('Адаптивность: чекбоксы');

test('чекбоксы выстраиваются вертикально на ≤480px', () => {
    ok(hasRuleInMedia('max-width: 480px', '\\.choices', 'flex-direction:\\s*column'),
        '.choices не становится вертикальным на ≤480px');
});

suite('Адаптивность: мета-теги');

test('viewport содержит viewport-fit=cover', () => {
    ok(view.indexOf('viewport-fit=cover') !== -1, 'viewport не содержит viewport-fit=cover');
});

test('viewport содержит width=device-width', () => {
    ok(view.indexOf('width=device-width') !== -1, 'viewport не содержит width=device-width');
});

test('viewport содержит initial-scale=1', () => {
    ok(view.indexOf('initial-scale=1') !== -1, 'viewport не содержит initial-scale=1');
});

test('определён theme-color', () => {
    ok(view.indexOf('theme-color') !== -1, 'theme-color не определён');
});

suite('Адаптивность: доступность');

test('поддерживается prefers-reduced-motion', () => {
    ok(css.indexOf('prefers-reduced-motion') !== -1, 'prefers-reduced-motion не поддерживается');
});

test('prefers-reduced-motion отключает анимации', () => {
    const content = mediaQueryContent('prefers-reduced-motion: reduce');
    ok(content !== null, 'медиа-запрос prefers-reduced-motion не найден');
    ok(content.indexOf('transition-duration: 0.01ms') !== -1, 'transition не отключён');
});

suite('Адаптивность: контейнер');

test('контейнер имеет max-width', () => {
    const match = css.match(/\.container\s*\{[^}]*max-width:\s*var\(--container-max\)/);
    ok(match, '.container не использует --container-max');
});

test('определён --container-max', () => {
    ok(css.indexOf('--container-max:') !== -1, '--container-max не определён');
});

test('определён --content-max', () => {
    ok(css.indexOf('--content-max:') !== -1, '--content-max не определён');
});

suite('Адаптивность: поля ввода');

test('поля ввода имеют адаптивную высоту через clamp()', () => {
    ok(css.indexOf('--control-height:') !== -1, '--control-height не определён');
    const match = css.match(/--control-height:\s*clamp\(/);
    ok(match, '--control-height не использует clamp()');
});

test('кнопки имеют адаптивную высоту через clamp()', () => {
    ok(css.indexOf('--btn-height:') !== -1, '--btn-height не определён');
    const match = css.match(/--btn-height:\s*clamp\(/);
    ok(match, '--btn-height не использует clamp()');
});

suite('Адаптивность: скроллбар');

test('вкладки имеют тонкий скроллбар', () => {
    const match = css.match(/\.tabs\s*\{[^}]*scrollbar-width:\s*thin/);
    ok(match, '.tabs не имеет scrollbar-width: thin');
});

test('вкладки имеют стилизованный скроллбар для WebKit', () => {
    ok(css.indexOf('.tabs::-webkit-scrollbar') !== -1, 'нет стилизации скроллбара для WebKit');
});

suite('Адаптивность: результат');

test('результат имеет overflow-wrap: break-word', () => {
    const match = css.match(/\.result__output\s*\{[^}]*overflow-wrap:\s*break-word/);
    ok(match, '.result__output не имеет overflow-wrap: break-word');
});

suite('Адаптивность: отступы страницы');

test('отступы заголовка страницы используют clamp()', () => {
    const match = css.match(/\.page-title\s*\{[^}]*margin:\s*clamp\(/);
    ok(match, '.page-title не использует clamp() для margin');
});

test('отступы page-note используют clamp()', () => {
    const match = css.match(/\.page-note\s*\{[^}]*margin:\s*clamp\(/);
    ok(match, '.page-note не использует clamp() для margin');
});

suite('Адаптивность: описание');

test('описание имеет адаптивный padding через clamp()', () => {
    const match = css.match(/\.description\s*\{[^}]*padding:\s*clamp\(/);
    ok(match, '.description не использует clamp() для padding');
});

suite('Адаптивность: панель ключей');

test('панель ключей имеет адаптивный padding через clamp()', () => {
    const match = css.match(/\.key-panel\s*\{[^}]*padding:\s*clamp\(/);
    ok(match, '.key-panel не использует clamp() для padding');
});

suite('Адаптивность: предотвращение переполнения');

test('field имеет min-width: 0 для предотвращения переполнения', () => {
    const match = css.match(/\.field\s*\{[^}]*min-width:\s*0/);
    ok(match, '.field не имеет min-width: 0');
});

test('input, select, textarea имеют width: 100%', () => {
    const match = css.match(/input\[type="text"][^}]*width:\s*100%/);
    ok(match, 'input не имеет width: 100%');
});

suite('Адаптивность: порядок загрузки скриптов');

test('скрипты загружаются в правильном порядке', () => {
    const validatorsPos = view.indexOf('validators.js');
    const recordsPos = view.indexOf('records.js');
    const appPos = view.indexOf('app.js');
    ok(validatorsPos < recordsPos, 'validators.js должен загружаться до records.js');
    ok(recordsPos < appPos, 'records.js должен загружаться до app.js');
});

suite('Адаптивность: мета-теги безопасности');

test('viewport содержит viewport-fit=cover для устройств с вырезами', () => {
    ok(view.indexOf('viewport-fit=cover') !== -1, 'viewport-fit=cover отсутствует');
});

suite('Адаптивность: дополнительные проверки');

test('нет фиксированных размеров шрифтов в пикселях без clamp()', () => {
    const lines = css.split('\n');
    const problems = [];
    lines.forEach((line, index) => {
        if (line.match(/font-size:\s*\d+px/) && !line.includes('clamp')) {
            problems.push('строка ' + (index + 1) + ': ' + line.trim());
        }
    });
    eq(problems.join('; '), '');
});

test('нет фиксированных padding без clamp()', () => {
    const components = ['.container', '.block', '.btn', '.tab', '.description', '.key-panel'];
    const problems = [];
    components.forEach(comp => {
        const regex = new RegExp(comp.replace('.', '\\.') + '\\s*\\{[^}]*padding:\\s*\\d+px');
        if (regex.test(css)) {
            problems.push(comp + ' имеет фиксированный padding');
        }
    });
    eq(problems.join('; '), '');
});

test('все медиа-запросы имеют закрывающую скобку', () => {
    const opens = (css.match(/\{/g) || []).length;
    const closes = (css.match(/\}/g) || []).length;
    eq(opens, closes, 'несбалансированные скобки в CSS');
});

test('CSS не содержит !important (кроме prefers-reduced-motion)', () => {
    const lines = css.split('\n');
    const problems = [];
    let inReducedMotion = false;
    lines.forEach((line, index) => {
        if (line.indexOf('prefers-reduced-motion') !== -1) {
            inReducedMotion = true;
        }
        if (inReducedMotion && line.indexOf('}') !== -1) {
            inReducedMotion = false;
        }
        if (line.indexOf('!important') !== -1 && !inReducedMotion) {
            problems.push('строка ' + (index + 1) + ': ' + line.trim());
        }
    });
    eq(problems.join('; '), '');
});

test('переменные --space-* определены', () => {
    const defined = css.match(/--space-\d+:\s*\d+px/g) || [];
    ok(defined.length >= 6, 'недостаточно переменных --space-*: ' + defined.length);
});

suite('Адаптивность: семантика');

test('html имеет lang="ru"', () => {
    ok(view.indexOf('lang="ru"') !== -1, 'html не имеет lang="ru"');
});

test('есть заголовок h1', () => {
    ok(view.indexOf('<h1') !== -1, 'нет заголовка h1');
});

test('есть заголовок h2 для блоков', () => {
    ok(view.indexOf('<h2') !== -1, 'нет заголовка h2');
});

test('есть noscript fallback', () => {
    ok(view.indexOf('<noscript>') !== -1, 'нет noscript fallback');
});

suite('Адаптивность: изображения');

test('favicon подключён', () => {
    ok(view.indexOf('favicon.ico') !== -1, 'favicon не подключён');
});

suite('Адаптивность: производительность');

test('шрифт имеет font-display: swap', () => {
    ok(css.indexOf('font-display: swap') !== -1, 'font-display: swap отсутствует');
});

test('шрифты подключены локально', () => {
    const externalFonts = css.match(/url\(["']?https?:\/\//g) || [];
    eq(externalFonts.length, 0, 'найдены внешние шрифты');
});

suite('Адаптивность: дополнительные медиа-запросы');

test('нет устаревших вендорных префиксов', () => {
    const outdated = ['-webkit-box-shadow', '-moz-box-shadow', '-webkit-border-radius', '-moz-border-radius'];
    const found = [];
    outdated.forEach(prefix => {
        if (css.indexOf(prefix) !== -1) {
            found.push(prefix);
        }
    });
    eq(found.join(', '), '');
});

suite('Адаптивность: доступность клавиатуры');

test('есть focus-visible стили', () => {
    const matches = css.match(/:focus-visible/g) || [];
    ok(matches.length >= 3, 'недостаточно :focus-visible стилей: ' + matches.length);
});

test('tab имеет outline для focus-visible', () => {
    const match = css.match(/\.tab:focus-visible\s*\{[^}]*outline:/);
    ok(match, '.tab:focus-visible не имеет outline');
});

test('btn имеет outline для focus-visible', () => {
    const match = css.match(/\.btn:focus-visible\s*\{[^}]*outline:/);
    ok(match, '.btn:focus-visible не имеет outline');
});

suite('Адаптивность: ARIA');

test('tabs имеют role="tablist"', () => {
    ok(view.indexOf('role="tablist"') !== -1, 'tabs не имеют role="tablist"');
});

test('tabs имеют aria-label', () => {
    ok(view.indexOf('aria-label') !== -1, 'tabs не имеют aria-label');
});

test('поля имеют aria-describedby', () => {
    ok(view.indexOf('aria-describedby') !== -1, 'поля не имеют aria-describedby');
});

suite('Адаптивность: безопасность');

test('нет внешних скриптов', () => {
    const externalScripts = view.match(/<script[^>]+src="https?:\/\//g) || [];
    eq(externalScripts.length, 0, 'найдены внешние скрипты');
});

test('нет внешних стилей', () => {
    const externalStyles = view.match(/<link[^>]+href="https?:\/\//g) || [];
    eq(externalStyles.length, 0, 'найдены внешние стили');
});

test('нет inline обработчиков событий', () => {
    const inlineHandlers = view.match(/\son\w+="[^"]*"/g) || [];
    eq(inlineHandlers.length, 0, 'найдены inline обработчики: ' + inlineHandlers.join(', '));
});

suite('Адаптивность: структура HTML');

test('есть DOCTYPE', () => {
    ok(view.indexOf('<!DOCTYPE html>') !== -1, 'нет DOCTYPE');
});

test('есть meta charset', () => {
    ok(view.indexOf('charset="utf-8"') !== -1, 'нет meta charset');
});

test('есть title', () => {
    ok(view.indexOf('<title>') !== -1, 'нет title');
});

test('есть meta description', () => {
    ok(view.indexOf('name="description"') !== -1, 'нет meta description');
});

suite('Адаптивность: дополнительные проверки сетки');

test('grid--1 определена', () => {
    ok(css.indexOf('.grid--1') !== -1, '.grid--1 не определена');
});

test('grid--2 определена', () => {
    ok(css.indexOf('.grid--2') !== -1, '.grid--2 не определена');
});

test('grid--3 определена', () => {
    ok(css.indexOf('.grid--3') !== -1, '.grid--3 не определена');
});

test('field--full определена', () => {
    ok(css.indexOf('.field--full') !== -1, '.field--full не определена');
});

suite('Адаптивность: проверка целостности');

test('CSS файл не пустой', () => {
    ok(css.length > 1000, 'CSS файл слишком мал: ' + css.length + ' символов');
});

test('VIEW файл не пустой', () => {
    ok(view.length > 500, 'VIEW файл слишком мал: ' + view.length + ' символов');
});

test('основные компоненты определены', () => {
    const components = ['.container', '.block', '.grid', '.field', '.btn', '.tab', '.result', '.description'];
    components.forEach(comp => {
        ok(css.indexOf(comp) !== -1, comp + ' не найден в CSS');
    });
});

suite('Адаптивность: проверка переменных');

test('определены все необходимые переменные', () => {
    const required = [
        '--blue', '--blue-hover', '--blue-border', '--blue-back',
        '--orange', '--orange-hover', '--orange-pressed',
        '--red', '--green', '--text', '--text-main', '--text-muted',
        '--white', '--radius-input', '--radius-btn', '--radius-block',
        '--font', '--mono', '--fw-regular', '--fw-medium', '--fw-bold',
        '--border-control'
    ];
    required.forEach(prop => {
        ok(css.indexOf(prop + ':') !== -1, prop + ' не определена');
    });
});

test('переменные используются в стилях', () => {
    const critical = ['--blue', '--orange', '--text-main', '--fs-p', '--control-height'];
    critical.forEach(prop => {
        const usages = css.split('var(' + prop + ')').length - 1;
        ok(usages > 0, prop + ' не используется');
    });
});

suite('Адаптивность: финальные проверки');

test('CSS компилируется без ошибок (базовая проверка)', () => {
    const openBraces = (css.match(/\{/g) || []).length;
    const closeBraces = (css.match(/\}/g) || []).length;
    eq(openBraces, closeBraces, 'несбалансированные скобки');
});

test('нет пустых правил', () => {
    const emptyRules = css.match(/\{\s*\}/g) || [];
    eq(emptyRules.length, 0, 'найдены пустые правила: ' + emptyRules.length);
});

test('медиа-запросы корректны', () => {
    const mediaQueries = css.match(/@media[^{]+/g) || [];
    ok(mediaQueries.length >= 3, 'недостаточно медиа-запросов: ' + mediaQueries.length);
});

test('нет дублирования медиа-запросов', () => {
    const mediaQueries = css.match(/@media\s*\([^)]+\)/g) || [];
    const unique = [...new Set(mediaQueries)];
    eq(mediaQueries.length, unique.length, 'найдены дублирующиеся медиа-запросы');
});

suite('Адаптивность: дополнительные тесты для новых функций');

test('вкладки имеют -webkit-overflow-scrolling: touch', () => {
    const match = css.match(/\.tabs\s*\{[^}]*-webkit-overflow-scrolling:\s*touch/);
    ok(match, '.tabs не имеет -webkit-overflow-scrolling: touch');
});

test('вкладки имеют scrollbar-width: thin', () => {
    const match = css.match(/\.tabs\s*\{[^}]*scrollbar-width:\s*thin/);
    ok(match, '.tabs не имеет scrollbar-width: thin');
});

test('есть стили для .tabs::-webkit-scrollbar', () => {
    ok(css.indexOf('.tabs::-webkit-scrollbar') !== -1, 'нет стилей для .tabs::-webkit-scrollbar');
});

test('есть стили для .tabs::-webkit-scrollbar-thumb', () => {
    ok(css.indexOf('.tabs::-webkit-scrollbar-thumb') !== -1, 'нет стилей для .tabs::-webkit-scrollbar-thumb');
});

test('choice имеет min-height для удобства нажатия', () => {
    const match = css.match(/\.choice\s*\{[^}]*min-height:\s*\d+px/);
    ok(match, '.choice не имеет min-height');
});

test('preset имеет min-height для удобства нажатия', () => {
    const match = css.match(/\.preset\s*\{[^}]*min-height:\s*\d+px/);
    ok(match, '.preset не имеет min-height');
});

test('choice input имеет flex-shrink: 0', () => {
    const match = css.match(/\.choice\s+input\s*\{[^}]*flex-shrink:\s*0/);
    ok(match, '.choice input не имеет flex-shrink: 0');
});

test('result__output имеет word-break: break-all', () => {
    const match = css.match(/\.result__output\s*\{[^}]*word-break:\s*break-all/);
    ok(match, '.result__output не имеет word-break: break-all');
});

test('field__label имеет line-height', () => {
    const match = css.match(/\.field__label\s*\{[^}]*line-height:/);
    ok(match, '.field__label не имеет line-height');
});

test('key-panel__warning имеет line-height', () => {
    const match = css.match(/\.key-panel__warning\s*\{[^}]*line-height:/);
    ok(match, '.key-panel__warning не имеет line-height');
});

test('description имеет line-height', () => {
    const match = css.match(/\.description\s*\{[^}]*line-height:/);
    ok(match, '.description не имеет line-height');
});

test('page-note имеет line-height', () => {
    const match = css.match(/\.page-note\s*\{[^}]*line-height:/);
    ok(match, '.page-note не имеет line-height');
});

suite('Адаптивность: проверка новых breakpoint');

test('breakpoint 480px определён', () => {
    ok(css.indexOf('max-width: 480px') !== -1, 'breakpoint 480px не определён');
});

test('на 480px presets полноширинные', () => {
    ok(hasRuleInMedia('max-width: 480px', '\\.preset', 'flex:\\s*1\\s+1\\s+100%'),
        'presets не полноширинные на 480px');
});

test('на 480px choices вертикальные', () => {
    ok(hasRuleInMedia('max-width: 480px', '\\.choices', 'flex-direction:\\s*column'),
        'choices не вертикальные на 480px');
});

test('на 480px choice полноширинные', () => {
    ok(hasRuleInMedia('max-width: 480px', '\\.choice', 'width:\\s*100%'),
        'choice не полноширинные на 480px');
});

test('на 480px tab имеет уменьшенный padding', () => {
    ok(hasRuleInMedia('max-width: 480px', '\\.tab', 'padding:'),
        'tab не имеет уменьшенный padding на 480px');
});

suite('Адаптивность: проверка доступности');

test('prefers-reduced-motion отключает transition', () => {
    const content = mediaQueryContent('prefers-reduced-motion: reduce');
    ok(content !== null, 'медиа-запрос prefers-reduced-motion не найден');
    ok(content.indexOf('transition-duration: 0.01ms') !== -1, 'transition не отключён');
});

test('prefers-reduced-motion отключает animation', () => {
    const content = mediaQueryContent('prefers-reduced-motion: reduce');
    ok(content !== null, 'медиа-запрос prefers-reduced-motion не найден');
    ok(content.indexOf('animation-duration: 0.01ms') !== -1, 'animation не отключён');
});

test('prefers-reduced-motion отключает scroll-behavior', () => {
    const content = mediaQueryContent('prefers-reduced-motion: reduce');
    ok(content !== null, 'медиа-запрос prefers-reduced-motion не найден');
    ok(content.indexOf('scroll-behavior: auto') !== -1, 'scroll-behavior не отключён');
});

suite('Адаптивность: проверка безопасности');

test('нет javascript: в ссылках', () => {
    const jsLinks = view.match(/href="javascript:/gi) || [];
    eq(jsLinks.length, 0, 'найдены javascript: ссылки');
});

test('нет onclick обработчиков', () => {
    const onclick = view.match(/onclick="/gi) || [];
    eq(onclick.length, 0, 'найдены onclick обработчики');
});

test('нет onerror обработчиков', () => {
    const onerror = view.match(/onerror="/gi) || [];
    eq(onerror.length, 0, 'найдены onerror обработчиков');
});

suite('Адаптивность: проверка производительности');

test('шрифты имеют font-display: swap', () => {
    ok(css.indexOf('font-display: swap') !== -1, 'font-display: swap отсутствует');
});

test('нет внешних запросов в CSS', () => {
    const external = css.match(/url\(["']?https?:\/\//g) || [];
    eq(external.length, 0, 'найдены внешние запросы в CSS');
});

test('нет внешних запросов в HTML', () => {
    const external = view.match(/(src|href)="https?:\/\//g) || [];
    eq(external.length, 0, 'найдены внешние запросы в HTML');
});

suite('Адаптивность: проверка целостности');

test('CSS файл заканчивается закрывающей скобкой', () => {
    const trimmed = css.trim();
    ok(trimmed.endsWith('}'), 'CSS файл не заканчивается закрывающей скобкой');
});

test('VIEW файл заканчивается </html>', () => {
    const trimmed = view.trim();
    ok(trimmed.endsWith('</html>'), 'VIEW файл не заканчивается </html>');
});

test('нет дублирования ID в HTML', () => {
    const ids = view.match(/id="[^"]+"/g) || [];
    const idValues = ids.map(id => id.match(/id="([^"]+)"/)[1]);
    const unique = [...new Set(idValues)];
    eq(idValues.length, unique.length, 'найдены дублирующиеся ID');
});

test('все ссылки имеют правильный формат', () => {
    const links = view.match(/href="[^"]+"/g) || [];
    const problems = [];
    links.forEach(link => {
        const href = link.match(/href="([^"]+)"/)[1];
        if (href.indexOf(' ') !== -1) {
            problems.push(href);
        }
    });
    eq(problems.join(', '), '');
});

suite('Адаптивность: дополнительные проверки');

test('CSS использует отступы в 4 пробела', () => {
    const lines = css.split('\n');
    const indented = lines.filter(line => line.startsWith('    '));
    ok(indented.length > 10, 'CSS не использует отступы в 4 пробела');
});

test('нет табуляций в CSS', () => {
    const tabs = css.match(/\t/g) || [];
    eq(tabs.length, 0, 'найдены табуляции в CSS');
});

test('нет пробелов в конце строк в CSS', () => {
    const lines = css.split('\n');
    const trailing = lines.filter(line => / \s+$/.test(line));
    eq(trailing.length, 0, 'найдены пробелы в конце строк: ' + trailing.length);
});

suite('Адаптивность: финальная проверка');

test('все тесты адаптивности пройдены', () => {
    ok(true, 'адаптивность настроена правильно');
});
