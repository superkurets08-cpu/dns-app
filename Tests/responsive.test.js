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
    const match = css.match(/\.dnsr-container\s*\{[^}]*padding:\s*[^;]*clamp\(/);
    ok(match, '.dnsr-container не использует clamp() для padding');
});

test('padding блоков использует clamp()', () => {
    const match = css.match(/\.dnsr-block\s*\{[^}]*padding:\s*clamp\(/);
    ok(match, '.dnsr-block не использует clamp() для padding');
});

test('gap сетки использует clamp()', () => {
    const match = css.match(/\.dnsr-grid\s*\{[^}]*gap:\s*clamp\(/);
    ok(match, '.dnsr-grid не использует clamp() для gap');
});

test('отступы кнопок используют clamp()', () => {
    const match = css.match(/\.dnsr-btn\s*\{[^}]*padding:\s*clamp\(/);
    ok(match, '.dnsr-btn не использует clamp() для padding');
});

suite('Адаптивность: сетка');

test('grid--3 переключается на 2 колонки при 1100px', () => {
    const content = mediaQueryContent('max-width: 1100px');
    ok(content !== null, 'медиа-запрос 1100px не найден');
    ok(content.indexOf('.dnsr-grid--3') !== -1, '.dnsr-grid--3 не найден в медиа-запросе 1100px');
    ok(content.indexOf('repeat(2') !== -1, 'нет переключения на 2 колонки');
});

test('grid--2 и grid--3 переключаются на 1 колонку при 768px', () => {
    const content = mediaQueryContent('max-width: 768px');
    ok(content !== null, 'медиа-запрос 768px не найден');
    ok(content.indexOf('.dnsr-grid--2') !== -1, '.dnsr-grid--2 не найден в медиа-запросе 768px');
    ok(content.indexOf('.dnsr-grid--3') !== -1, '.dnsr-grid--3 не найден в медиа-запросе 768px');
    ok(content.indexOf('minmax(0, 1fr)') !== -1, 'нет переключения на 1 колонку');
});

test('сетка использует minmax(0, 1fr) для предотвращения переполнения', () => {
    const matches = css.match(/minmax\(0,\s*1fr\)/g) || [];
    ok(matches.length >= 3, 'недостаточно minmax(0, 1fr) в сетке');
});

suite('Адаптивность: вкладки');

test('вкладки имеют overflow-x: auto для мобильных', () => {
    const match = css.match(/\.dnsr-tabs\s*\{[^}]*overflow-x:\s*auto/);
    ok(match, '.dnsr-tabs не имеет overflow-x: auto');
});

test('вкладки выровнены по центру, когда помещаются целиком', () => {
    // Без этого справа от последней вкладки оставалось пустое поле: блок
    // занимал всю ширину, а сами вкладки прижимались к левому краю.
    const rule = /\.dnsr-tabs\s*\{([^}]*)\}/.exec(css);
    ok(rule, 'нет стилей вкладок');

    ok(/justify-content:\s*center/.test(rule[1]),
        'вкладки не выровнены по центру');
    ok(/justify-content:\s*safe\s+center/.test(rule[1]),
        'нет safe center: при переполнении обычный center обрезал бы левый край');
});

test('safe center объявлен после center для старых браузеров', () => {
    const rule = /\.dnsr-tabs\s*\{([^}]*)\}/.exec(css);
    const first = rule[1].indexOf('justify-content: center');
    const second = rule[1].indexOf('justify-content: safe center');

    ok(first !== -1 && second !== -1, 'объявления не найдены');
    ok(first < second,
        'safe center должен идти после center, иначе старые браузеры не получат запасной вариант');
});

test('вкладки имеют адаптивный padding через clamp()', () => {
    const match = css.match(/\.dnsr-tab\s*\{[^}]*padding:\s*clamp\(/);
    ok(match, '.dnsr-tab не использует clamp() для padding');
});

test('вкладки имеют white-space: nowrap', () => {
    const match = css.match(/\.dnsr-tab\s*\{[^}]*white-space:\s*nowrap/);
    ok(match, '.dnsr-tab не имеет white-space: nowrap');
});

suite('Адаптивность: кнопки');

test('кнопки становятся полноширинными на мобильных', () => {
    ok(hasRuleInMedia('max-width: 768px', '\\.dnsr-actions \\.dnsr-btn', 'flex:\\s*1\\s+1\\s+100%'),
        '.dnsr-actions .dnsr-btn не становится полноширинным на мобильных');
});

test('пресеты адаптивны на мобильных', () => {
    ok(hasRuleInMedia('max-width: 768px', '\\.dnsr-preset', 'flex:\\s*1\\s+1\\s+calc\\(50%'),
        '.dnsr-preset не адаптивен на мобильных');
});

test('пресеты полноширинные на очень узких экранах', () => {
    ok(hasRuleInMedia('max-width: 480px', '\\.dnsr-preset', 'flex:\\s*1\\s+1\\s+100%'),
        '.dnsr-preset не полноширинный на ≤480px');
});

suite('Адаптивность: чекбоксы');

test('чекбоксы выстраиваются вертикально на ≤480px', () => {
    ok(hasRuleInMedia('max-width: 480px', '\\.dnsr-choices', 'flex-direction:\\s*column'),
        '.dnsr-choices не становится вертикальным на ≤480px');
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
    const match = css.match(/\.dnsr-container\s*\{[^}]*max-width:\s*var\(--container-max\)/);
    ok(match, '.dnsr-container не использует --container-max');
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
    const match = css.match(/\.dnsr-tabs\s*\{[^}]*scrollbar-width:\s*thin/);
    ok(match, '.dnsr-tabs не имеет scrollbar-width: thin');
});

test('вкладки имеют стилизованный скроллбар для WebKit', () => {
    ok(css.indexOf('.dnsr-tabs::-webkit-scrollbar') !== -1, 'нет стилизации скроллбара для WebKit');
});

suite('Адаптивность: результат');

test('результат имеет overflow-wrap: break-word', () => {
    const match = css.match(/\.dnsr-result__output\s*\{[^}]*overflow-wrap:\s*break-word/);
    ok(match, '.dnsr-result__output не имеет overflow-wrap: break-word');
});

suite('Адаптивность: отступы страницы');

test('отступы заголовка страницы используют clamp()', () => {
    const match = css.match(/\.dnsr-page-title\s*\{[^}]*margin:\s*clamp\(/);
    ok(match, '.dnsr-page-title не использует clamp() для margin');
});

test('отступы page-note используют clamp()', () => {
    const match = css.match(/\.dnsr-page-note\s*\{[^}]*margin:\s*clamp\(/);
    ok(match, '.dnsr-page-note не использует clamp() для margin');
});

suite('Адаптивность: описание');

test('описание типа оформлено подзаголовком без рамки', () => {
    // Прямоугольник с серым текстом убран: описание стоит под заголовком
    // типа обычным текстом основного цвета.
    const rule = /\.dnsr-description\s*\{([^}]*)\}/.exec(css);
    ok(rule, 'нет стилей описания');

    eq(/background-color/.test(rule[1]), false,
        'у описания снова появилась заливка прямоугольника');
    eq(/border-left/.test(rule[1]), false,
        'у описания снова появилась рамка слева');
    eq(/padding:/.test(rule[1]), false,
        'описание снова отступляется как прямоугольник');
    ok(/color:\s*var\(--text\)/.test(rule[1]),
        'описание должно быть основного цвета, а не приглушённого');
});

suite('Адаптивность: панель ключей');

test('панель ключей имеет адаптивный padding через clamp()', () => {
    const match = css.match(/\.dnsr-key-panel\s*\{[^}]*padding:\s*clamp\(/);
    ok(match, '.dnsr-key-panel не использует clamp() для padding');
});

suite('Адаптивность: предотвращение переполнения');

test('field имеет min-width: 0 для предотвращения переполнения', () => {
    const match = css.match(/\.dnsr-field\s*\{[^}]*min-width:\s*0/);
    ok(match, '.dnsr-field не имеет min-width: 0');
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
    const components = ['.dnsr-container', '.dnsr-block', '.dnsr-btn', '.dnsr-tab', '.dnsr-description', '.dnsr-key-panel'];
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
    const match = css.match(/\.dnsr-tab:focus-visible\s*\{[^}]*outline:/);
    ok(match, '.dnsr-tab:focus-visible не имеет outline');
});

test('btn имеет outline для focus-visible', () => {
    const match = css.match(/\.dnsr-btn:focus-visible\s*\{[^}]*outline:/);
    ok(match, '.dnsr-btn:focus-visible не имеет outline');
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
    ok(css.indexOf('.dnsr-grid--1') !== -1, '.dnsr-grid--1 не определена');
});

test('grid--2 определена', () => {
    ok(css.indexOf('.dnsr-grid--2') !== -1, '.dnsr-grid--2 не определена');
});

test('grid--3 определена', () => {
    ok(css.indexOf('.dnsr-grid--3') !== -1, '.dnsr-grid--3 не определена');
});

test('field--full определена', () => {
    ok(css.indexOf('.dnsr-field--full') !== -1, '.dnsr-field--full не определена');
});

suite('Адаптивность: проверка целостности');



test('основные компоненты определены', () => {
    const components = ['.dnsr-container', '.dnsr-block', '.dnsr-grid', '.dnsr-field', '.dnsr-btn', '.dnsr-tab', '.dnsr-result', '.dnsr-description'];
    components.forEach(comp => {
        ok(css.indexOf(comp) !== -1, comp + ' не найден в CSS');
    });
});

suite('Стиль: элементы в стиле HB.BY');

test('поля ввода имеют серую рамку, а синюю при наведении и фокусе', () => {
    // Серая рамка в покое, синяя при hover и focus — как на hb.by
    ok(/--control-border:\s*#d2d2d2/.test(css), 'нет серого цвета рамки --control-border');
    ok(/border:\s*var\(--border-control\)\s*solid\s*var\(--control-border\)/.test(css),
        'поля ввода не используют серую рамку');
    ok(/input:hover[\s\S]{0,120}border-color:\s*var\(--blue\)/.test(css),
        'нет синей рамки при наведении');
    ok(/input:focus[\s\S]{0,80}border-color:\s*var\(--blue\)/.test(css),
        'нет синей рамки при фокусе');
});

test('чекбоксы нарисованы в стиле HB.BY, а не системным accent-color', () => {
    ok(css.indexOf('accent-color') === -1, 'используется системный accent-color вместо своей отрисовки');
    const block = css.match(/\.dnsr-choice input\s*\{[\s\S]*?\n\}/);
    ok(block, 'нет правила .dnsr-choice input');
    if (block) {
        ok(/appearance:\s*none/.test(block[0]), 'чекбокс не переопределён через appearance: none');
        ok(/border-radius/.test(block[0]), 'нет скругления чекбокса');
    }
    ok(/\.dnsr-choice input:checked[\s\S]{0,200}background-image:\s*url\(/.test(css),
        'нет галочки-картинки при выборе');
});

test('чекбокс использует фирменный синий', () => {
    const checked = css.match(/\.dnsr-choice input:checked\s*\{[\s\S]*?\n\}/);
    ok(checked, 'нет правила для выбранного чекбокса');
    if (checked) {
        ok(/background-color:\s*var\(--blue\)/.test(checked[0]),
            'выбранный чекбокс не синий');
    }
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


test('нет пустых правил', () => {
    const emptyRules = css.match(/\{\s*\}/g) || [];
    eq(emptyRules.length, 0, 'найдены пустые правила: ' + emptyRules.length);
});


test('нет дублирования медиа-запросов', () => {
    const mediaQueries = css.match(/@media\s*\([^)]+\)/g) || [];
    const unique = [...new Set(mediaQueries)];
    eq(mediaQueries.length, unique.length, 'найдены дублирующиеся медиа-запросы');
});

suite('Адаптивность: дополнительные тесты для новых функций');

test('вкладки имеют -webkit-overflow-scrolling: touch', () => {
    const match = css.match(/\.dnsr-tabs\s*\{[^}]*-webkit-overflow-scrolling:\s*touch/);
    ok(match, '.dnsr-tabs не имеет -webkit-overflow-scrolling: touch');
});




// Разрешает значение CSS, в том числе ссылку на переменную: min-height может
// быть задан как var(--token), и прямая проверка литерала его бы пропустила.
function resolveCssLength(value) {
    const text = String(value).trim();
    const direct = /^(\d+(?:\.\d+)?)px$/.exec(text);
    if (direct) {
        return parseFloat(direct[1]);
    }

    const viaVariable = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*(.+))?\)$/.exec(text);
    if (!viaVariable) {
        const clamp = /clamp\(([^,]+),/.exec(text);
        return clamp ? resolveCssLength(clamp[1]) : null;
    }

    const declaration = new RegExp('\\' + viaVariable[1] +
        '\\s*:\\s*([^;]+);').exec(css);
    if (!declaration) {
        return viaVariable[2] ? resolveCssLength(viaVariable[2]) : null;
    }
    return resolveCssLength(declaration[1]);
}

// WCAG 2.5.8 (AA): минимальный размер цели нажатия 24×24 CSS px.
const TOUCH_TARGET_MIN = 24;

function minHeightOf(selector) {
    const match = css.match(new RegExp('^' + selector.replace('.', '\\.') +
        '\\s*\\{([^}]*)\\}', 'm'));
    if (!match) {
        return null;
    }
    const value = /min-height:\s*([^;]+)/.exec(match[1]);
    return value ? resolveCssLength(value[1]) : null;
}

test('цели нажатия соответствуют минимуму WCAG 2.5.8', () => {
    // Прежняя проверка искала min-height: <число>px и убеждалась, что число
    // есть. Она проходила при 32px, не замечая, что требование не выполнено.
    // Теперь значение разрешается, включая var(--token), и сверяется с нормой.
    const problems = [];

    ['.dnsr-choice', '.dnsr-preset', '.dnsr-tab'].forEach(selector => {
        const height = minHeightOf(selector);
        if (height === null) {
            problems.push(selector + ': min-height не задан');
            return;
        }
        if (height < TOUCH_TARGET_MIN) {
            problems.push(selector + ': min-height ' + height +
                'px меньше минимума ' + TOUCH_TARGET_MIN + 'px');
        }
    });

    eq(problems.join(' | '), '');
});

test('флажок достигает минимального размера цели нажатия', () => {
    // Размер флажка задаётся в пикселях, а не через переменную: проверяем
    // обе стороны квадрата.
    const match = css.match(/\.dnsr-choice\s+input\s*\{([^}]*)\}/);
    ok(match, '.dnsr-choice input не найден');

    const width = resolveCssLength(/width:\s*([^;]+)/.exec(match[1])[1]);
    const height = resolveCssLength(/height:\s*([^;]+)/.exec(match[1])[1]);

    eq(width !== null && width >= TOUCH_TARGET_MIN, true,
        'ширина флажка ' + width + 'px меньше минимума ' + TOUCH_TARGET_MIN + 'px');
    eq(height !== null && height >= TOUCH_TARGET_MIN, true,
        'высота флажка ' + height + 'px меньше минимума ' + TOUCH_TARGET_MIN + 'px');
});

test('preset имеет min-height для удобства нажатия', () => {
    const height = minHeightOf('.dnsr-preset');
    ok(height !== null, '.dnsr-preset не имеет min-height');
});

test('choice input имеет flex-shrink: 0', () => {
    const match = css.match(/\.dnsr-choice\s+input\s*\{[^}]*flex-shrink:\s*0/);
    ok(match, '.dnsr-choice input не имеет flex-shrink: 0');
});

test('result__output имеет word-break: break-all', () => {
    const match = css.match(/\.dnsr-result__output\s*\{[^}]*word-break:\s*break-all/);
    ok(match, '.dnsr-result__output не имеет word-break: break-all');
});

test('field__label имеет line-height', () => {
    const match = css.match(/\.dnsr-field__label\s*\{[^}]*line-height:/);
    ok(match, '.dnsr-field__label не имеет line-height');
});

test('key-panel__warning имеет line-height', () => {
    const match = css.match(/\.dnsr-key-panel__warning\s*\{[^}]*line-height:/);
    ok(match, '.dnsr-key-panel__warning не имеет line-height');
});

test('description имеет line-height', () => {
    const match = css.match(/\.dnsr-description\s*\{[^}]*line-height:/);
    ok(match, '.dnsr-description не имеет line-height');
});

test('page-note имеет line-height', () => {
    const match = css.match(/\.dnsr-page-note\s*\{[^}]*line-height:/);
    ok(match, '.dnsr-page-note не имеет line-height');
});

suite('Адаптивность: проверка новых breakpoint');




test('на 480px choice полноширинные', () => {
    ok(hasRuleInMedia('max-width: 480px', '\\.dnsr-choice', 'width:\\s*100%'),
        'choice не полноширинные на 480px');
});

test('на 480px tab имеет уменьшенный padding', () => {
    ok(hasRuleInMedia('max-width: 480px', '\\.dnsr-tab', 'padding:'),
        'tab не имеет уменьшенный padding на 480px');
});

suite('Адаптивность: проверка доступности');


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






suite('Адаптивность: проверка целостности');



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


test('нет табуляций в CSS', () => {
    const tabs = css.match(/\t/g) || [];
    eq(tabs.length, 0, 'найдены табуляции в CSS');
});

test('нет пробелов в конце строк в CSS', () => {
    const lines = css.split('\n');
    const trailing = lines.filter(line => / \s+$/.test(line));
    eq(trailing.length, 0, 'найдены пробелы в конце строк: ' + trailing.length);
});


suite('Адаптивность: блок базового набора');

test('одиночные флажки занимают всю ширину сетки', () => {
    // Подсказка под флажком переносилась на половину ширины сетки
    // (475px при сетке 980px) и читалась рваными строками.
    const singleCheckboxes = ['includeIpv6', 'useCertificate'];
    const wrong = [];

    singleCheckboxes.forEach(name => {
        const match = new RegExp('class="[^"]*dnsr-field--full[^"]*"[^>]*data-field="' +
            name + '"').test(view);
        if (!match) {
            wrong.push(name);
        }
    });

    eq(wrong.join(','), '', 'флажок не растянут на всю ширину');
});

test('группам флажков ширина не нужна', () => {
    // Провайдеры SPF и механизмы занимают место в сетке: растягивать их
    // на всю ширину нельзя, иначе строки схлопнутся в одну колонку.
    ['providers', 'mechanisms'].forEach(name => {
        const stretched = new RegExp('class="[^"]*dnsr-field--full[^"]*"[^>]*data-field="' +
            name + '"').test(view);
        eq(stretched, false, name + ': группа флажков не должна занимать всю ширину');
    });
});

test('служебная строка с кнопкой сброса не оформлена карточкой', () => {
    // Карточка ради одной кнопки занимала 144px высотой при кнопке 52px.
    const section = /<section class="([^"]*)" id="reset-block">(\s*<div class="dnsr-actions">\s*<button[^>]*id="reset-button")/;
    const match = section.exec(view);
    ok(match, 'не найдена секция с кнопкой сброса');
    ok(match[1].indexOf('dnsr-block--plain') !== -1,
        'кнопка сброса снова оформлена тяжёлой карточкой');
    ok(/\.dnsr-block--plain\s*\{[^}]*background-color:\s*transparent/.test(css),
        'нет правила прозрачного фона для служебной строки');
    ok(/\.dnsr-block--plain\s*\{[^}]*box-shadow:\s*none/.test(css),
        'нет правила отсутствия тени для служебной строки');
});

test('поле результата отделено от кнопок над ним', () => {
    // Без верхнего отступа нижний край контейнера кнопок смыкался с рамкой
    // поля: зазор составлял 16px на десктопе и 12px на телефоне.
    const rule = /\.dnsr-result\s*\{([^}]*)\}/.exec(css);
    ok(rule, 'нет стилей поля результата');

    const declared = /margin-top:\s*var\(--space-(\d+)\)/.exec(rule[1]);
    ok(declared, 'нет верхнего отступа у поля результата');
    ok(parseInt(declared[1], 10) >= 20,
        'отступ ' + declared[1] + 'px слишком мал, кнопка и поле слипаются');
});

test('записи набора переносятся, а не обрезаются по ширине', () => {
    // Шесть записей набора, из них DKIM — длинная сегментированная строка.
    // Без переноса по словам нечитаемый хвост уходит за правый край.
    const rule = /\.dnsr-result__output\s*\{([^}]*)\}/.exec(css);
    ok(rule, 'нет стилей поля результата');
    ok(/white-space:\s*pre-wrap/.test(rule[1]),
        'поле результата должно переносить строки по словам');
    ok(/word-break:\s*break-all/.test(rule[1]),
        'длинная запись должна переноситься, а не выходить за границу');
});

test('кнопки блока набора переиспользуют стили кнопок', () => {
    ok(/<button[^>]*class="dnsr-btn[^"]*"[^>]*id="build-set-button"/.test(view),
        'кнопка сбора должна использовать общий класс кнопок');
    ok(/<button[^>]*class="[^"]*dnsr-btn[^"]*"[^>]*id="copy-set-button"/.test(view),
        'кнопка копирования должна использовать общий класс кнопок');
});

test('панель «Набор» помечена классом блока и панели', () => {
    const start = view.indexOf('id="panel-SET"');
    ok(start !== -1, 'нет панели «Набор»');
    const before = view.lastIndexOf('<section', start);
    const opening = view.slice(before, start);
    ok(opening.indexOf('class="dnsr-block') !== -1,
        'панель набора должна использовать класс блока');
    ok(opening.indexOf('dnsr-record-panel') !== -1,
        'панель набора должна вести себя как остальные панели');
});
