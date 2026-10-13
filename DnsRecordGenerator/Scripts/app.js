(function () {

    const state = DnsState.create();


    const MAX_LENGTH = {
        text: 253,
        number: 10,
        email: 254,
        url: 2048,
        textarea: 8192
    };

    function maxLengthFor(field) {
        if (field.maxlength) {
            return field.maxlength;
        }

        if (field.type === 'number') {
            return MAX_LENGTH.number;
        }

        return MAX_LENGTH[field.type] || MAX_LENGTH.text;
    }

    const elements = {};


    const escapeHtml = Validators.escapeHtml;

    function currentRecord() {
        return DnsRecords.find(state.recordId);
    }

    function valuesOf(record) {
        return DnsState.valuesFor(state, record);
    }

    function renderTabs() {
        elements.tabs.innerHTML = '';
        DnsRecords.all.forEach(record => {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'tab';
            tab.id = 'tab-' + record.id;
            tab.textContent = record.label;
            tab.setAttribute('role', 'tab');
            tab.addEventListener('click', function () {
                selectRecord(record.id);
            });
            tab.addEventListener('keydown', function (event) {
                moveTabFocus(event, record.id);
            });
            elements.tabs.appendChild(tab);
        });

        syncTabs();
    }

    function syncTabs() {
        DnsRecords.all.forEach(function (record) {
            document.getElementById('tab-' + record.id)
                .setAttribute('aria-selected', String(record.id === state.recordId));
        });
    }

    function moveTabFocus(event, recordId) {
        const navigable = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (navigable.indexOf(event.key) === -1) {
            return;
        }

        const ids = DnsRecords.all.map(record => record.id);
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
        document.getElementById('tab-' + ids[target]).focus();
    }

    function selectRecord(recordId) {
        DnsState.selectRecord(state, recordId);
        syncTabs();
        renderRecord();
    }

    function renderRecord() {
        const record = currentRecord();
        const values = valuesOf(record);

        elements.recordTitle.textContent = record.title;
        elements.params.className = 'grid grid--' + record.columns;
        elements.params.innerHTML = record.fields.map(field => renderField(field, values)).join('');
        elements.description.innerHTML = '<span class="description__title">Зачем нужна запись</span>' +
            escapeHtml(record.description);
        elements.keyPanel.innerHTML = record.keyGenerator ? renderKeyGenerator() : '';
        elements.extraOutputs.innerHTML = renderExtraOutputs(record);

        bindRecord(record);
        applyVisibility(record);
        update();
    }

    function renderField(field, values) {
        if (field.type === 'check') {
            return '<div class="field " data-field="' + escapeHtml(field.name) + '">' +
                '<span class="choices"><label class="choice">' +
                '<input type="checkbox" data-owner="' + escapeHtml(field.name) + '" id="f-' + escapeHtml(field.name) + '">' +
                escapeHtml(field.label) +
                '</label></span>' +
                renderHint(field) +
                '</div>';
        }

        return '<div class="field' + (field.span ? ' field--full' : '') + '" data-field="' + escapeHtml(field.name) + '">' +
            renderLabel(field) +
            renderControl(field, values) +
            renderPresets(field) +
            renderHint(field) +
            '<p class="field__error" id="e-' + escapeHtml(field.name) + '"></p>' +
            renderPreview(field) +
            '</div>';
    }

    function renderLabel(field) {
        return '<label class="field__label" for="f-' + escapeHtml(field.name) + '">' + escapeHtml(field.label) +
            (field.optional ? '' : ' <span class="field__required" aria-hidden="true">*</span>') + '</label>';
    }

    function renderControl(field, values) {
        const value = values[field.name];
        const id = 'f-' + field.name;

        switch (field.type) {
            case 'select':
                return '<select id="' + id + '">' + field.options.map(option =>
                    '<option value="' + escapeHtml(option.value) + '"' +
                    (option.value === value ? ' selected' : '') + '>' + escapeHtml(option.label) + '</option>'
                ).join('') + '</select>';

            case 'textarea':
                return '<textarea id="' + id + '"' +
                    (field.readonly ? ' readonly' : '') +
                    (field.rows ? ' rows="' + field.rows + '"' : '') +

                    ' maxlength="' + maxLengthFor(field) + '"' +
                    ' placeholder="' + escapeHtml(field.placeholder || '') + '">' +
                    escapeHtml(value) + '</textarea>';

            case 'checks':
                return '<div class="choices">' + field.options.map(option =>
                    '<label class="choice">' +
                    '<input type="checkbox" data-owner="' + escapeHtml(field.name) + '" data-option="' + escapeHtml(option.value) + '"' +
                    (value[option.value] ? ' checked' : '') + '>' +
                    escapeHtml(option.label) +
                    (option.note ? '<span class="choice-note">' + escapeHtml(option.note) + '</span>' : '') +
                    '</label>'
                ).join('') + '</div>';

            default:
                return '<input id="' + id + '" type="' + (field.type === 'number' ? 'number' : 'text') + '"' +
                    (field.type === 'number' && field.min !== undefined ? ' min="' + field.min + '"' : '') +
                    (field.type === 'number' && field.max !== undefined ? ' max="' + field.max + '"' : '') +
                    (field.readonly ? ' readonly' : '') +
                    (field.suggestions ? ' list="' + id + '-options"' : '') +
                    ' maxlength="' + maxLengthFor(field) + '"' +
                    ' value="' + escapeHtml(value) + '"' +
                    ' placeholder="' + escapeHtml(field.placeholder || '') + '">' +
                    renderSuggestions(field, id);
        }
    }

    function renderSuggestions(field, id) {
        if (!field.suggestions) {
            return '';
        }

        return '<datalist id="' + id + '-options">' + field.suggestions.map(item =>
            '<option value="' + escapeHtml(item) + '"></option>'
        ).join('') + '</datalist>';
    }

    function renderPresets(field) {
        if (!field.presets) {
            return '';
        }

        return '<div class="presets">' + field.presets.map(preset =>
            '<button type="button" class="preset" data-preset="' + escapeHtml(field.name) + '" data-value="' + escapeHtml(preset) + '">' +
            escapeHtml(preset) + '</button>'
        ).join('') + '</div>';
    }

    function renderHint(field) {
        return field.hint ? '<p class="field__hint">' + escapeHtml(field.hint) + '</p>' : '';
    }

    function renderPreview(field) {
        return field.preview ? '<p class="field__preview" id="p-' + field.name + '"></p>' : '';
    }

    function renderKeyGenerator() {
        return '<div class="key-panel">' +
            '<p class="key-panel__title">Приватный ключ</p>' +
            '<p class="key-panel__warning">Приватный ключ не публикуется в DNS. Храните его в тайне: ' +
            'тот, у кого он есть, может подписывать письма от имени вашего домена. ' +
            'Передайте его своему почтовому серверу файлом.</p>' +
            '<textarea id="f-private-key" readonly rows="7" placeholder="Ключ ещё не создан"></textarea>' +
            '<div class="actions">' +
            '<button type="button" class="btn" id="generate-key">Сгенерировать ключи</button>' +
            '<button type="button" class="btn btn--outline" id="download-key" disabled>Скачать .pem</button>' +
            '<button type="button" class="btn btn--outline" id="copy-key" disabled>Скопировать ключ</button>' +
            '<button type="button" class="btn btn--outline" id="hide-key" disabled>Скрыть ключ</button>' +
            '</div>' +
            '<p class="feedback" id="key-feedback"></p>' +
            '</div>';
    }

    function renderExtraOutputs(record) {
        if (!record.extraOutputs) {
            return '';
        }

        return record.extraOutputs.map(function (output, index) {
            return '<div class="block">' +
                '<h2 class="block__title">' + escapeHtml(output.title) + '</h2>' +
                '<p class="block__hint">' + escapeHtml(output.hint) + '</p>' +
                '<div class="result">' +
                '<textarea class="result__output" id="extra-output-' + index + '" readonly></textarea>' +
                '<div class="actions">' +
                '<button type="button" class="btn btn--outline" id="copy-extra-' + index + '">Копировать</button>' +
                '<span class="feedback" id="extra-feedback-' + index + '"></span>' +
                '</div>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    function changeEventOf(control) {
        return control.tagName === 'SELECT' || control.type === 'checkbox' ? 'change' : 'input';
    }

    function bindRecord(record) {
        const values = valuesOf(record);

        elements.params.querySelectorAll('input, select, textarea').forEach(function (control) {
            control.addEventListener(changeEventOf(control), function () {
                onControlChange(record, control);
            });
        });

        elements.params.querySelectorAll('[data-preset]').forEach(function (button) {
            button.addEventListener('click', function () {
                const name = button.dataset.preset;
                values[name] = button.dataset.value;
                document.getElementById('f-' + name).value = button.dataset.value;
                update();
            });
        });

        if (record.keyGenerator) {
            bindKeyGenerator(record);
        }

        (record.extraOutputs || []).forEach(function (output, index) {
            document.getElementById('copy-extra-' + index).addEventListener('click', function () {
                copyText(
                    document.getElementById('extra-output-' + index),
                    document.getElementById('extra-feedback-' + index)
                );
            });
        });
    }

    function onControlChange(record, control) {
        const values = valuesOf(record);
        const name = control.dataset.owner || control.id.replace(/^f-/, '');
        const field = record.fields.filter(function (item) {
            return item.name === name;
        })[0];

        if (!field) {
            return;
        }

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
            const input = document.getElementById('f-' + field.name);
            if (input && field.type === 'check') {
                input.checked = !!values[field.name];
            }

            const wrapper = elements.params.querySelector('[data-field="' + field.name + '"]');
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

    function setText(element, value) {
            if (element && element.textContent !== value) {
                element.textContent = value;
            }
        }

    function paintField(field, error) {
        const wrapper = elements.params.querySelector('[data-field="' + field.name + '"]');
        if (!wrapper) {
            return;
        }

        setText(document.getElementById('e-' + field.name), error || '');

        if (field.preview) {

            setText(document.getElementById('p-' + field.name), 'Будет создано: ' +
                DnsRecords.fqdn(state.values[state.recordId][field.name], state.domain));
        }

        const invalid = !!error;
        if (wrapper.classList.contains('field--invalid') !== invalid) {
            wrapper.classList.toggle('field--invalid', invalid);
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
            paintField(field, error);
            if (error) {
                isValid = false;
            }
        });

        const recordError = typeof record.validate === 'function' ? record.validate(values) : null;
        setText(elements.recordError, recordError || '');
        if (elements.recordError.hidden === !!recordError) {
            elements.recordError.hidden = !recordError;
        }

        const ready = isValid && !recordError;

        const output = ready ? record.build(values, state.domain, record) : '';
        if (elements.output.value !== output) {
            elements.output.value = output;
        }

        paintExtraOutputs(record, values, ready);

        if (elements.copyButton.disabled === ready) {
            elements.copyButton.disabled = !ready;
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
        if (elements.domainField.classList.contains('field--invalid') !== !isValid) {
            elements.domainField.classList.toggle('field--invalid', !isValid);
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
            const target = document.getElementById('extra-output-' + index);
            const button = document.getElementById('copy-extra-' + index);
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

    function paintMessage(target, text, kind) {
        target.textContent = text;
        target.className = 'feedback' + (kind ? ' feedback--' + kind : '');
    }

    function resetRecord() {
        DnsState.resetRecord(state);
        renderRecord();
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

        const legacyCopy = function () {
            const helper = document.createElement('textarea');
            helper.value = text;
            helper.setAttribute('readonly', '');
            helper.style.position = 'fixed';
            helper.style.opacity = '0';
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


    const KEY_VISIBLE_MS = 60000;
    const KEY_MASKED_TEXT = '•••••••••• (ключ скрыт — нажмите «Показать ключ»)';
    let keyHideTimer = null;

    function clearKeyHideTimer() {
        if (keyHideTimer !== null) {
            window.clearTimeout(keyHideTimer);
            keyHideTimer = null;
        }
    }

    function bindKeyGenerator(record) {
        const generateButton = document.getElementById('generate-key');
        const downloadButton = document.getElementById('download-key');
        const copyButton = document.getElementById('copy-key');
        const hideButton = document.getElementById('hide-key');
        const privateKeyField = document.getElementById('f-private-key');
        const feedback = document.getElementById('key-feedback');
        const values = valuesOf(record);

        clearKeyHideTimer();

        function syncKeyButtons() {
            const hasKey = !!values.privateKey;
            downloadButton.disabled = !hasKey;
            copyButton.disabled = !hasKey;
            hideButton.disabled = !hasKey;
        }

        function maskKey() {
            clearKeyHideTimer();
            privateKeyField.value = KEY_MASKED_TEXT;
            hideButton.textContent = 'Показать ключ';
        }

        function showKey() {
            privateKeyField.value = values.privateKey;
            hideButton.textContent = 'Скрыть ключ';
            clearKeyHideTimer();
            keyHideTimer = window.setTimeout(function () {

                if (document.getElementById('f-private-key') === privateKeyField) {
                    maskKey();
                    paintMessage(feedback, 'Ключ автоматически скрыт. Он сохранён и доступен для скачивания.', '');
                }
            }, KEY_VISIBLE_MS);
        }


        if (values.privateKey) {
            maskKey();
            syncKeyButtons();
        }

        hideButton.addEventListener('click', function () {
            if (!values.privateKey) {
                return;
            }
            if (privateKeyField.value === values.privateKey) {
                maskKey();
            } else {
                showKey();
            }
        });

        generateButton.addEventListener('click', function () {
            const keyLength = parseInt(values.keyLength, 10);

            generateButton.disabled = true;
            generateButton.textContent = 'Генерация…';
            paintMessage(feedback, '', '');

            generateKeyPair(keyLength).then(function (pair) {
                values.publicKey = pair.publicKey;
                values.privateKey = pair.privateKey;
                document.getElementById('f-publicKey').value = pair.publicKey;
                showKey();
                syncKeyButtons();

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
            if (!values.privateKey) {
                return;
            }
            downloadFile((values.selector.trim() || 'default') + '.pem', values.privateKey, 'application/x-pem-file');
        });

        copyButton.addEventListener('click', function () {
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

        elements.resetButton.addEventListener('click', resetRecord);

        elements.copyButton.addEventListener('click', function () {
            copyText(elements.output, elements.feedback);
        });
    }

    function cacheElements() {
        const ids = {
            domain: 'domain',
            domainField: 'domain-field',
            domainError: 'domain-error',
            tabs: 'tabs',
            recordTitle: 'record-title',
            recordError: 'record-error',
            params: 'params',
            keyPanel: 'key-panel-host',
            extraOutputs: 'extra-outputs',
            output: 'output',
            feedback: 'output-feedback',
            copyButton: 'copy-button',
            resetButton: 'reset-button',
            description: 'record-description'
        };

        Object.keys(ids).forEach(function (key) {
            elements[key] = document.getElementById(ids[key]);
        });
    }

    function init() {
        cacheElements();
        renderTabs();
        bindGlobalEvents();
        renderRecord();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
