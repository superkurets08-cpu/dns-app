(function () {

    const state = DnsState.create();

    const elements = {};

    function currentRecord() {
        return DnsRecords.find(state.recordId);
    }

    function valuesOf(record) {
        return DnsState.valuesFor(state, record);
    }

    // Контракт идентификаторов задан разметкой в Index.cshtml:
    //   поле      f-{RecordId}-{field}
    //   ошибка    e-{RecordId}-{field}
    //   превью    p-{RecordId}-{field}
    //   панель    panel-{RecordId}
    //   доп. вывод extra-{RecordId}-{index}
    // Тест разметки сверяет этот контракт со схемой, поэтому опечатка
    // приводит к падению сборки, а не к молчаливой поломке поля.

    function fieldId(record, name) {
        return 'f-' + record.id + '-' + name;
    }

    function errorId(record, name) {
        return 'e-' + record.id + '-' + name;
    }

    function previewId(record, name) {
        return 'p-' + record.id + '-' + name;
    }

    function panelOf(record) {
        return elements.panels[record.id];
    }

    function controlOf(record, field) {
        return document.getElementById(fieldId(record, field.name));
    }

    // У поля-группы (checks) нет одного элемента с идентификатором —
    // это набор чекбоксов внутри контейнера. Возвращаем их списком,
    // чтобы обработчики и сброс работали одинаково для всех типов полей.
    function controlsOf(record, field) {
        if (field.type === 'checks') {
            const wrapper = wrapperOf(record, field);
            return wrapper ? Array.prototype.slice.call(wrapper.querySelectorAll('input[type="checkbox"]')) : [];
        }

        const control = controlOf(record, field);
        return control ? [control] : [];
    }

    function wrapperOf(record, field) {
        return panelOf(record).querySelector('[data-field="' + field.name + '"]');
    }

    function setText(element, value) {
        if (element && element.textContent !== value) {
            element.textContent = value;
        }
    }

    function paintMessage(target, text, kind) {
        target.textContent = text;
        target.className = 'dnsr-feedback' + (kind ? ' dnsr-feedback--' + kind : '');
    }

    function bindTabs() {
        DnsRecords.all.forEach(function (record) {
            const tab = elements.tabs[record.id];

            tab.addEventListener('click', function () {
                selectRecord(record.id);
            });

            tab.addEventListener('keydown', function (event) {
                moveTabFocus(event, record.id);
            });
        });
    }

    function syncTabs() {
        DnsRecords.all.forEach(function (record) {
            const active = record.id === state.recordId;
            elements.tabs[record.id].setAttribute('aria-selected', String(active));
            panelOf(record).hidden = !active;
            if (elements.extraPanels && elements.extraPanels[record.id]) {
                elements.extraPanels[record.id].hidden = !active;
            }
        });
    }

    function moveTabFocus(event, recordId) {
        const navigable = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (navigable.indexOf(event.key) === -1) {
            return;
        }

        const ids = DnsRecords.all.map(function (record) {
            return record.id;
        });
        const index = ids.indexOf(recordId);
        let target = index;

        if (event.key === 'ArrowLeft') {
            target = (index - 1 + ids.length) % ids.length;
        } else if (event.key === 'ArrowRight') {
            target = (index + 1) % ids.length;
        } else if (event.key === 'Home') {
            target = 0;
        } else {
            target = ids.length - 1;
        }

        event.preventDefault();
        selectRecord(ids[target]);
        elements.tabs[ids[target]].focus();
    }

    function selectRecord(recordId) {
        DnsState.selectRecord(state, recordId);
        syncTabs();
        update();
    }

    function changeEventOf(control) {
        return control.tagName === 'SELECT' || control.type === 'checkbox' ? 'change' : 'input';
    }

    function bindRecord(record) {
        const panel = panelOf(record);

        record.fields.forEach(function (field) {
            controlsOf(record, field).forEach(function (control) {
                control.addEventListener(changeEventOf(control), function () {
                    onControlChange(record, field, control);
                });
            });
        });

        panel.querySelectorAll('[data-preset]').forEach(function (button) {
            button.addEventListener('click', function () {
                const name = button.dataset.preset;
                // Значения берём здесь, а не при привязке: после «Сбросить»
                // DnsState создаёт новый объект, и ссылка устарела бы.
                valuesOf(record)[name] = button.dataset.value;
                controlOf(record, { name: name }).value = button.dataset.value;
                update();
            });
        });

        if (record.keyGenerator) {
            bindKeyGenerator(record);
        }

        (record.extraOutputs || []).forEach(function (output, index) {
            document.getElementById('copy-extra-' + record.id + '-' + index)
                .addEventListener('click', function () {
                    copyText(
                        document.getElementById('extra-' + record.id + '-' + index),
                        document.getElementById('extra-feedback-' + record.id + '-' + index)
                    );
                });
        });
    }

    function onControlChange(record, field, control) {
        const values = valuesOf(record);

        if (field.type === 'check') {
            values[field.name] = control.checked;
            applyVisibility(record);
        } else if (field.type === 'checks') {
            values[field.name][control.dataset.option] = control.checked;
        } else {
            values[field.name] = control.value;
        }

        update();
    }

    function applyVisibility(record) {
        const values = valuesOf(record);

        record.fields.forEach(function (field) {
            if (field.type === 'check') {
                controlsOf(record, field).forEach(function (control) {
                    control.checked = !!values[field.name];
                });
            }

            const wrapper = wrapperOf(record, field);
            if (wrapper && field.revealedBy) {
                wrapper.hidden = !values[field.revealedBy];
            }
        });
    }

    function validateField(field, values) {
        if (field.revealedBy && !values[field.revealedBy]) {
            return null;
        }

        if (field.type === 'check' || field.type === 'checks') {
            return null;
        }

        const value = values[field.name];

        if (Validators.empty(value)) {
            return field.optional ? null : 'Заполните поле «' + field.label + '»';
        }

        const rules = field.rules || [];
        for (let index = 0; index < rules.length; index++) {
            if (!rules[index].test(value)) {
                return rules[index].message;
            }
        }

        return null;
    }

    function paintField(record, field, error) {
        const wrapper = wrapperOf(record, field);
        if (!wrapper) {
            return;
        }

        setText(document.getElementById(errorId(record, field.name)), error || '');

        if (field.preview) {
            setText(document.getElementById(previewId(record, field.name)), 'Будет создано: ' +
                DnsRecords.fqdn(state.values[state.recordId][field.name], state.domain));
        }

        const invalid = !!error;
        if (wrapper.classList.contains('dnsr-field--invalid') !== invalid) {
            wrapper.classList.toggle('dnsr-field--invalid', invalid);
        }
    }

    function update() {
        const record = currentRecord();
        const values = valuesOf(record);
        const domainValid = Validators.domain(state.domain);

        paintDomain(domainValid);

        let isValid = domainValid;

        record.fields.forEach(function (field) {
            const error = validateField(field, values);
            paintField(record, field, error);
            if (error) {
                isValid = false;
            }
        });

        // Сигнатура совпадает с build: проверке записи доступны те же данные,
        // что и сборке. Иначе часть межполевых ограничений проверить нельзя.
        const recordError = typeof record.validate === 'function'
            ? record.validate(values, state.domain, record, state.ttl)
            : null;
        setText(document.getElementById('error-' + record.id), recordError || '');
        if (document.getElementById('error-' + record.id).hidden === !!recordError) {
            document.getElementById('error-' + record.id).hidden = !recordError;
        }

        const ready = isValid && !recordError;

        // Скрытый ключ прячет и итоговую DKIM-запись: в ней публичный ключ.
        // Состояние, а не порядок нажатий, определяет вид — поэтому работает всегда.
        const masked = ready && !!record.keyGenerator && !!values.keyMasked;
        const output = !ready ? '' : (masked ? KEY_MASKED_OUTPUT : record.build(values, state.domain, record, state.ttl));
        if (elements.output.value !== output) {
            elements.output.value = output;
        }

        if (elements.copyButton.disabled === (ready && !masked)) {
            elements.copyButton.disabled = !(ready && !masked);
        }

        if (recordError) {
            paintMessage(elements.feedback, recordError, 'error');
        } else if (!ready) {
            paintMessage(elements.feedback, 'Заполните обязательные поля — запись появится здесь.', 'error');
        } else {
            paintMessage(elements.feedback, '', '');
        }

        paintExtraOutputs(record, values, ready);
    }

    function paintDomain(isValid) {
        if (elements.domainField.classList.contains('dnsr-field--invalid') !== !isValid) {
            elements.domainField.classList.toggle('dnsr-field--invalid', !isValid);
        }

        setText(elements.domainError, isValid
            ? ''
            : 'Введите домен в формате example.com — он подставится во все записи');

        if (elements.domainError.hidden === !isValid) {
            elements.domainError.hidden = isValid;
        }
    }

    function paintExtraOutputs(record, values, ready) {
        (record.extraOutputs || []).forEach(function (output, index) {
            const target = document.getElementById('extra-' + record.id + '-' + index);
            const button = document.getElementById('copy-extra-' + record.id + '-' + index);
            if (!target || !button) {
                return;
            }

            const text = ready ? output.build(values, state.domain, record) : '';
            if (target.value !== text) {
                target.value = text;
            }

            if (button.disabled !== !ready) {
                button.disabled = !ready;
            }
        });
    }

    // Значения по умолчанию — источник истины, а не атрибуты value в разметке.
    // Это важно для полей, значение которых вычисляется при загрузке страницы:
    // например, ID политики MTA-STS зависит от текущей даты и в статическом
    // HTML заморожен на момент сборки.
    function syncControls(record) {
        const values = valuesOf(record);

        record.fields.forEach(function (field) {
            controlsOf(record, field).forEach(function (control) {
                if (field.type === 'check') {
                    control.checked = !!values[field.name];
                } else if (field.type === 'checks') {
                    control.checked = !!values[field.name][control.dataset.option];
                } else {
                    control.value = values[field.name];
                }
            });
        });
    }

    // Базовый набор собирается из значений всех вкладок: пользователь настраивает
    // записи в привычном интерфейсе, а копирует их одним действием.
    function buildSetupSet() {
        if (!Validators.domain(state.domain)) {
            paintMessage(elements.setupFeedback,
                'Сначала укажите корректный домен — он подставляется в каждую запись набора', 'error');
            return;
        }

        const set = DnsRecords.buildSet(state.domain, state.ttl, function (record) {
            return valuesOf(record);
        });

        elements.setupOutput.value = set.lines.join('\n');
        elements.copySetButton.disabled = set.lines.length === 0;

        if (set.skipped.length) {
            const missing = set.skipped.length === 1
                ? 'заполните её на вкладке «' + set.skipped[0] + '»'
                : 'заполните их на вкладках «' + set.skipped.join('», «') + '»';

            paintMessage(elements.setupFeedback,
                'Готово ' + set.lines.length + ' из ' + DnsRecords.setupSet.length +
                '. Не добавлены: ' + set.skipped.join(', ') + ' — ' + missing + '.', '');
            return;
        }

        paintMessage(elements.setupFeedback,
            'Готовы все ' + set.lines.length + ' записей базового набора', 'success');
    }

    function resetRecord() {
        DnsState.resetRecord(state);
        const record = currentRecord();

        syncControls(record);
        syncKeyPanel(record);
        applyVisibility(record);

        // Отчёт о последнем действии тоже относится к старому состоянию:
        // «Пара ключей создана» после сброса осталось бы врать.
        const keyFeedback = document.getElementById(record.id + '-key-feedback');
        if (keyFeedback) {
            paintMessage(keyFeedback, '', '');
        }

        update();
    }

    function copyText(textarea, feedback) {
        copyString(textarea.value, feedback);
    }

    function copyString(text, feedback, after) {
        if (!text) {
            return;
        }

        const report = function () {
            paintMessage(feedback, 'Скопировано в буфер обмена', 'success');
            window.setTimeout(function () {
                paintMessage(feedback, '', '');
                if (typeof after === 'function') {
                    after();
                }
            }, 2500);
        };

        // Запасной путь для браузеров без Clipboard API. Поле невидимое,
        // поэтому оформлено классом, а не inline-стилями: так CSP
        // остаётся без 'unsafe-inline'.
        const legacyCopy = function () {
            const helper = document.createElement('textarea');
            helper.value = text;
            helper.className = 'dnsr-copy-helper';
            helper.setAttribute('readonly', '');
            document.body.appendChild(helper);
            helper.select();
            document.execCommand('copy');
            document.body.removeChild(helper);
        };

        if (window.isSecureContext && navigator.clipboard) {
            navigator.clipboard.writeText(text).then(report, function () {
                legacyCopy();
                report();
            });
        } else {
            legacyCopy();
            report();
        }
    }

    function toBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let index = 0; index < bytes.byteLength; index++) {
            binary += String.fromCharCode(bytes[index]);
        }

        return window.btoa(binary);
    }

    function toPem(buffer) {
        const lines = toBase64(buffer).match(/.{1,64}/g) || [];
        return ['-----BEGIN PRIVATE KEY-----'].concat(lines, ['-----END PRIVATE KEY-----']).join('\n');
    }

    function isWebCryptoAvailable() {
        return !!(window.crypto && window.crypto.subtle);
    }

    function generateKeyPair(keyLength) {
        if (!isWebCryptoAvailable()) {
            return Promise.reject(new Error('WebCrypto API недоступен'));
        }

        return window.crypto.subtle.generateKey({
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength: keyLength,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256'
        }, true, ['sign', 'verify']).then(async function (pair) {
            return {
                publicKey: toBase64(await window.crypto.subtle.exportKey('spki', pair.publicKey)),
                privateKey: toPem(await window.crypto.subtle.exportKey('pkcs8', pair.privateKey))
            };
        });
    }

    function downloadFile(name, content, type) {
        const url = URL.createObjectURL(new Blob([content], { type: type }));
        const link = document.createElement('a');

        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    // Ключ виден ограниченное время: после генерации, показа или копирования
    // поле автоматически маскируется, чтобы ключ не остался на экране.
    const KEY_VISIBLE_MS = 60000;
    const KEY_MASKED_TEXT = '•••••••••• (ключ скрыт — нажмите «Показать ключ»)';
    const KEY_MASKED_OUTPUT = '•••••••••• (запись скрыта — нажмите «Показать ключ»)';
    let keyHideTimer = null;

    function clearKeyHideTimer() {
        if (keyHideTimer !== null) {
            window.clearTimeout(keyHideTimer);
            keyHideTimer = null;
        }
    }

    function syncKeyPanel(record) {
        if (!record.keyGenerator) {
            return;
        }

        const values = valuesOf(record);
        const field = document.getElementById(record.id + '-private-key');
        const hideButton = document.getElementById(record.id + '-hide-key');

        if (!field || !hideButton) {
            return;
        }

        if (values.privateKey) {
            field.value = values.keyMasked ? KEY_MASKED_TEXT : values.privateKey;
            hideButton.textContent = values.keyMasked ? 'Показать ключ' : 'Скрыть ключ';
        } else {
            field.value = '';
            hideButton.textContent = 'Скрыть ключ';
        }

        const hasKey = !!values.privateKey;
        document.getElementById(record.id + '-download-key').disabled = !hasKey;
        document.getElementById(record.id + '-copy-key').disabled = !hasKey;
        hideButton.disabled = !hasKey;
    }

    function bindKeyGenerator(record) {
        const generateButton = document.getElementById(record.id + '-generate-key');
        const downloadButton = document.getElementById(record.id + '-download-key');
        const copyButton = document.getElementById(record.id + '-copy-key');
        const hideButton = document.getElementById(record.id + '-hide-key');
        const privateKeyField = document.getElementById(record.id + '-private-key');
        const feedback = document.getElementById(record.id + '-key-feedback');

        clearKeyHideTimer();

        // Значения читаем через valuesOf на каждый вызов: после «Сбросить»
        // DnsState создаёт новый объект значений, и держать ссылку нельзя.
        function maskKey() {
            clearKeyHideTimer();
            valuesOf(record).keyMasked = true;
            privateKeyField.value = KEY_MASKED_TEXT;
            hideButton.textContent = 'Показать ключ';
            update();
        }

        function showKey() {
            const values = valuesOf(record);
            values.keyMasked = false;
            privateKeyField.value = values.privateKey;
            hideButton.textContent = 'Скрыть ключ';
            clearKeyHideTimer();
            keyHideTimer = window.setTimeout(function () {
                maskKey();
                paintMessage(feedback, 'Ключ автоматически скрыт. Он сохранён и доступен для скачивания.', '');
            }, KEY_VISIBLE_MS);
            update();
        }

        if (valuesOf(record).privateKey) {
            syncKeyPanel(record);
        }

        hideButton.addEventListener('click', function () {
            if (!valuesOf(record).privateKey) {
                return;
            }
            if (valuesOf(record).keyMasked) {
                showKey();
            } else {
                maskKey();
            }
        });

        generateButton.addEventListener('click', function () {
            const values = valuesOf(record);
            const keyLength = parseInt(values.keyLength, 10);

            generateButton.disabled = true;
            generateButton.textContent = 'Генерация…';
            paintMessage(feedback, '', '');

            generateKeyPair(keyLength).then(function (pair) {
                const current = valuesOf(record);
                current.publicKey = pair.publicKey;
                current.privateKey = pair.privateKey;
                document.getElementById(fieldId(record, 'publicKey')).value = pair.publicKey;
                showKey();
                syncKeyPanel(record);

                paintMessage(feedback, 'Пара ключей ' + keyLength + ' бит создана в браузере и никуда не отправлялась', 'success');
                update();
            }, function () {
                paintMessage(feedback, 'Браузер не смог создать ключ. Откройте страницу по HTTPS или через localhost.', 'error');
            }).then(function () {
                generateButton.disabled = false;
                generateButton.textContent = 'Сгенерировать ключи';
            });
        });

        downloadButton.addEventListener('click', function () {
            const values = valuesOf(record);
            if (!values.privateKey) {
                return;
            }
            downloadFile((values.selector.trim() || 'default') + '.pem', values.privateKey, 'application/x-pem-file');
        });

        copyButton.addEventListener('click', function () {
            const values = valuesOf(record);
            if (!values.privateKey) {
                return;
            }
            copyString(values.privateKey, feedback, function () {
                paintMessage(feedback, 'Ключ скопирован. Никому его не пересылайте и не публикуйте: он подписывает письма от имени домена.', '');
            });
        });
    }

    function bindGlobalEvents() {
        elements.domain.addEventListener('input', function () {

            DnsState.setDomain(state, Validators.toAsciiDomain(elements.domain.value.trim()));
            update();
        });

        elements.ttl.addEventListener('change', function () {
            DnsState.setTtl(state, elements.ttl.value);
            update();
        });

        elements.resetButton.addEventListener('click', resetRecord);

        elements.copyButton.addEventListener('click', function () {
            copyText(elements.output, elements.feedback);
        });

        elements.buildSetButton.addEventListener('click', buildSetupSet);

        elements.copySetButton.addEventListener('click', function () {
            copyText(elements.setupOutput, elements.setupFeedback);
        });
    }

    function cacheElements() {
        const ids = ['domain', 'domainField', 'domainError', 'ttl', 'output', 'feedback',
            'copyButton', 'resetButton', 'buildSetButton', 'setupOutput', 'setupFeedback',
            'copySetButton'];

        const mapping = {
            domain: 'domain',
            domainField: 'domain-field',
            domainError: 'domain-error',
            ttl: 'ttl',
            output: 'output',
            feedback: 'output-feedback',
            copyButton: 'copy-button',
            resetButton: 'reset-button',
            buildSetButton: 'build-set-button',
            setupOutput: 'setup-output',
            setupFeedback: 'setup-feedback',
            copySetButton: 'copy-set-button'
        };

        ids.forEach(function (key) {
            elements[key] = document.getElementById(mapping[key]);
        });

        elements.tabs = {};
        elements.panels = {};
        elements.extraPanels = {};

        DnsRecords.all.forEach(function (record) {
            elements.tabs[record.id] = document.getElementById('tab-' + record.id);
            elements.panels[record.id] = document.getElementById('panel-' + record.id);

            if (record.extraOutputs) {
                elements.extraPanels[record.id] =
                    document.getElementById('extra-outputs-' + record.id);
            }
        });
    }

    function init() {
        cacheElements();
        bindTabs();
        bindGlobalEvents();

        DnsRecords.all.forEach(function (record) {
            bindRecord(record);
            syncControls(record);
            applyVisibility(record);
        });

        syncTabs();
        update();
    }

    document.addEventListener('DOMContentLoaded', init);
})();