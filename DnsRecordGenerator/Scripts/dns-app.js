const Validators = {
    isDomain(val) {
        if (!val) return false;
        const re = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
        return re.test(val.trim());
    },

    isIPv4(val) {
        if (!val) return false;
        const parts = val.split('.');
        if (parts.length !== 4) return false;
        return parts.every(part => {
            const num = parseInt(part, 10);
            if (part.length > 1 && part.startsWith('0')) return false;
            return !isNaN(num) && num >= 0 && num <= 255;
        });
    },

    isIPv6(val) {
        if (!val) return false;
        if (val.includes('::')) {
            const doubleColonCount = (val.match(/::/g) || []).length;
            if (doubleColonCount > 1) return false;
            const parts = val.split('::');
            const allGroups = [...parts[0].split(':'), ...parts[1].split(':')].filter(Boolean);
            if (allGroups.length > 7) return false;
            return allGroups.every(group => /^[0-9a-fA-F]{1,4}$/.test(group));
        }
        const parts = val.split(':');
        if (parts.length !== 8) return false;
        return parts.every(part => /^[0-9a-fA-F]{1,4}$/.test(part));
    },

    isEmail(val) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(val.trim());
    },

    isURL(val) {
        try {
            new URL(val);
            return true;
        } catch {
            return false;
        }
    },

    isNumberInRange(val, min, max) {
        if (val === '' || val === null || val === undefined) return false;
        const num = Number(val);
        return !isNaN(num) && num >= min && num <= max;
    },

    isPort(val) {
        return this.isNumberInRange(val, 1, 65535);
    }
};

const RecordDefinitions = {
    MX: {
        description: "MX-запись (Mail Exchanger) указывает почтовый сервер, отвечающий за прием электронной почты для вашего домена.",
        defaults: { priority: 10, host: "mail" },
        renderForm(values) {
            return `
                <div class="grid-2">
                    <div class="field-group">
                        <label>Приоритет (0-50):</label>
                        <input type="number" id="param-priority" min="0" max="50" value="${values.priority}">
                        <div class="field-hint">Пресеты: 
                            <a href="#" onclick="document.getElementById('param-priority').value=10; AppManager.update(); return false;">10</a>, 
                            <a href="#" onclick="document.getElementById('param-priority').value=5; AppManager.update(); return false;">5</a>, 
                            <a href="#" onclick="document.getElementById('param-priority').value=1; AppManager.update(); return false;">1</a>, 
                            <a href="#" onclick="document.getElementById('param-priority').value=0; AppManager.update(); return false;">0</a>
                        </div>
                        <div class="error-message" id="err-param-priority">Укажите приоритет 0-50</div>
                    </div>
                    <div class="field-group">
                        <label>Хост (поддомен):</label>
                        <input type="text" id="param-host" value="${values.host}" maxlength="63" placeholder="mail">
                        <div class="field-hint">Максимум 63 символа</div>
                        <div class="error-message" id="err-param-host">Укажите имя хоста</div>
                    </div>
                </div>
            `;
        },
        generate(domain) {
            const prio = document.getElementById('param-priority')?.value || 10;
            const host = document.getElementById('param-host')?.value || 'mail';
            const dom = domain || 'example.com';
            return `${prio} ${host}.${dom}.`;
        },
        validate() {
            let isValid = true;

            const prioEl = document.getElementById('param-priority');
            if (!Validators.isNumberInRange(prioEl?.value, 0, 50)) {
                prioEl?.classList.add('input-error');
                document.getElementById('err-param-priority').style.display = 'block';
                isValid = false;
            } else {
                prioEl?.classList.remove('input-error');
                document.getElementById('err-param-priority').style.display = 'none';
            }

            const hostEl = document.getElementById('param-host');
            if (!hostEl || !hostEl.value.trim()) {
                hostEl?.classList.add('input-error');
                document.getElementById('err-param-host').style.display = 'block';
                isValid = false;
            } else {
                hostEl?.classList.remove('input-error');
                document.getElementById('err-param-host').style.display = 'none';
            }

            return isValid;
        }
    },

    A: {
        description: "A-запись связывает имя домена с его IPv4-адресом.",
        defaults: { subdomain: "mail", ip: "192.168.1.10", includeIpv6: false, ipv6: "2001:db8::1" },
        renderForm(values) {
            return `
                <div class="grid-2">
                    <div class="field-group">
                        <label>Поддомен:</label>
                        <input type="text" id="param-subdomain" value="${values.subdomain}" maxlength="63" placeholder="mail, smtp, imap">
                        <div class="field-hint">mail, smtp, imap или свой ввод</div>
                    </div>
                    <div class="field-group">
                        <label>IPv4-адрес:</label>
                        <input type="text" id="param-ip" value="${values.ip}" placeholder="192.168.1.10">
                        <div class="error-message" id="err-param-ip">Неверный IPv4</div>
                    </div>
                </div>
                <div class="field-group" style="margin-top: 10px;">
                    <label style="cursor:pointer;">
                        <input type="checkbox" id="param-include-v6" ${values.includeIpv6 ? 'checked' : ''}>
                        Добавить AAAA запись (IPv6)
                    </label>
                </div>
                <div class="field-group" id="v6-container" style="display:${values.includeIpv6 ? 'block' : 'none'};">
                    <label>IPv6-адрес:</label>
                    <input type="text" id="param-ipv6" value="${values.ipv6}" placeholder="2001:db8::1">
                    <div class="error-message" id="err-param-ipv6">Неверный IPv6</div>
                </div>
            `;
        },
        generate() {
            const sub = document.getElementById('param-subdomain')?.value || 'mail';
            const ip = document.getElementById('param-ip')?.value || '';
            const incV6 = document.getElementById('param-include-v6')?.checked;
            const ipV6 = document.getElementById('param-ipv6')?.value || '';

            let result = `${sub} A ${ip}`;
            if (incV6) {
                result += `\n${sub} AAAA ${ipV6}`;
            }
            return result;
        },
        validate() {
            let isValid = true;
            const ipEl = document.getElementById('param-ip');
            if (!Validators.isIPv4(ipEl?.value || '')) {
                ipEl?.classList.add('input-error');
                document.getElementById('err-param-ip').style.display = 'block';
                isValid = false;
            } else {
                ipEl?.classList.remove('input-error');
                document.getElementById('err-param-ip').style.display = 'none';
            }

            if (document.getElementById('param-include-v6')?.checked) {
                const ipv6El = document.getElementById('param-ipv6');
                if (!Validators.isIPv6(ipv6El?.value || '')) {
                    ipv6El?.classList.add('input-error');
                    document.getElementById('err-param-ipv6').style.display = 'block';
                    isValid = false;
                } else {
                    ipv6El?.classList.remove('input-error');
                    document.getElementById('err-param-ipv6').style.display = 'none';
                }
            }
            return isValid;
        }
    },

    SPF: {
        description: "SPF указывает, какие серверы могут отправлять письма от имени вашего домена.",
        defaults: { policy: "~all", ips: "192.168.1.10", google: false, m365: false, yandex: false, mailgun: false, sendgrid: false, mx: true, a: true },
        renderForm(values) {
            return `
                <div class="field-group">
                    <label>Политика:</label>
                    <select id="param-policy">
                        <option value="~all" ${values.policy === '~all' ? 'selected' : ''}>~all (SoftFail)</option>
                        <option value="-all" ${values.policy === '-all' ? 'selected' : ''}>-all (Fail)</option>
                        <option value="+all" ${values.policy === '+all' ? 'selected' : ''}>+all (Pass)</option>
                    </select>
                </div>
                <div class="field-group">
                    <label>IP-адреса (через запятую):</label>
                    <input type="text" id="param-ips" value="${values.ips}" maxlength="255" placeholder="192.168.1.10, 10.0.0.1">
                    <div class="error-message" id="err-param-ips">Неверный формат IP</div>
                </div>
                <div class="field-group">
                    <label>Include-провайдеры:</label>
                    <div style="display:flex; flex-wrap:wrap; gap: 15px; margin-top:5px;">
                        <label style="cursor:pointer;"><input type="checkbox" id="prov-google" ${values.google ? 'checked' : ''}> Google</label>
                        <label style="cursor:pointer;"><input type="checkbox" id="prov-m365" ${values.m365 ? 'checked' : ''}> M365</label>
                        <label style="cursor:pointer;"><input type="checkbox" id="prov-yandex" ${values.yandex ? 'checked' : ''}> Яндекс</label>
                        <label style="cursor:pointer;"><input type="checkbox" id="prov-mailgun" ${values.mailgun ? 'checked' : ''}> Mailgun</label>
                        <label style="cursor:pointer;"><input type="checkbox" id="prov-sendgrid" ${values.sendgrid ? 'checked' : ''}> SendGrid</label>
                    </div>
                </div>
                <div class="field-group">
                    <label>Механизмы:</label>
                    <label style="margin-right:15px; cursor:pointer;"><input type="checkbox" id="mech-mx" ${values.mx ? 'checked' : ''}> mx</label>
                    <label style="cursor:pointer;"><input type="checkbox" id="mech-a" ${values.a ? 'checked' : ''}> a</label>
                </div>
            `;
        },
        generate() {
            const policy = document.getElementById('param-policy')?.value || '~all';
            const ipsInput = document.getElementById('param-ips')?.value || '';
            const ips = ipsInput.split(',').map(s => s.trim()).filter(Boolean);

            let parts = ["v=spf1"];
            ips.forEach(ip => parts.push(`ip4:${ip}`));

            if (document.getElementById('prov-google')?.checked) parts.push("include:_spf.google.com");
            if (document.getElementById('prov-m365')?.checked) parts.push("include:spf.protection.outlook.com");
            if (document.getElementById('prov-yandex')?.checked) parts.push("include:_spf.yandex.net");
            if (document.getElementById('prov-mailgun')?.checked) parts.push("include:mailgun.org");
            if (document.getElementById('prov-sendgrid')?.checked) parts.push("include:sendgrid.net");

            if (document.getElementById('mech-mx')?.checked) parts.push("mx");
            if (document.getElementById('mech-a')?.checked) parts.push("a");

            parts.push(policy);
            return parts.join(" ");
        },
        validate() {
            let isValid = true;
            const ipsEl = document.getElementById('param-ips');
            if (ipsEl && ipsEl.value.trim() !== '') {
                const ips = ipsEl.value.split(',').map(s => s.trim()).filter(Boolean);
                const allValid = ips.every(ip => Validators.isIPv4(ip));
                if (!allValid) {
                    ipsEl.classList.add('input-error');
                    document.getElementById('err-param-ips').style.display = 'block';
                    isValid = false;
                } else {
                    ipsEl.classList.remove('input-error');
                    document.getElementById('err-param-ips').style.display = 'none';
                }
            }
            return isValid;
        }
    },

    DKIM: {
        description: "DKIM содержит публичный ключ для цифровой подписи писем. Генерация происходит локально в браузере.",
        defaults: { selector: "default", keyLength: "2048", publicKey: "" },
        renderForm(values) {
            return `
                <div class="grid-2">
                    <div class="field-group">
                        <label>Селектор (default / dkim / свой):</label>
                        <input type="text" id="param-selector" value="${values.selector}" list="dkim-selectors" maxlength="32" placeholder="default">
                        <datalist id="dkim-selectors">
                            <option value="default">
                            <option value="dkim">
                        </datalist>
                        <div class="error-message" id="err-param-selector">Укажите селектор</div>
                    </div>
                    <div class="field-group">
                        <label>Длина ключа:</label>
                        <select id="param-key-len">
                            <option value="1024" ${values.keyLength === '1024' ? 'selected' : ''}>1024 бит</option>
                            <option value="2048" ${values.keyLength === '2048' ? 'selected' : ''}>2048 бит</option>
                        </select>
                    </div>
                </div>
                <div class="field-group">
                    <label>Публичный RSA-ключ:</label>
                    <textarea id="param-pubkey" maxlength="2048" placeholder="Вставьте или сгенерируйте ключ">${values.publicKey}</textarea>
                    <button type="button" class="btn btn-secondary" id="gen-dkim-btn" style="margin-top:8px;">Сгенерировать RSA-ключ</button>
                </div>
            `;
        },
        generate() {
            const selector = document.getElementById('param-selector')?.value || 'default';
            const pubKey = document.getElementById('param-pubkey')?.value.replace(/\s+/g, '') || '';
            return `${selector}._domainkey TXT "v=DKIM1; k=rsa; p=${pubKey}"`;
        },
        validate() {
            let isValid = true;
            const selEl = document.getElementById('param-selector');
            if (!selEl || !selEl.value.trim()) {
                selEl?.classList.add('input-error');
                document.getElementById('err-param-selector').style.display = 'block';
                isValid = false;
            } else {
                selEl?.classList.remove('input-error');
                document.getElementById('err-param-selector').style.display = 'none';
            }
            return isValid;
        }
    },

    DMARC: {
        description: "DMARC определяет политику обработки писем, не прошедших проверку SPF/DKIM.",
        defaults: { policy: "quarantine", pct: 100, rua: "dmarc@example.com", ruf: "", aspf: "r", adkim: "r" },
        renderForm(values) {
            return `
                <div class="grid-2">
                    <div class="field-group">
                        <label>Политика (p):</label>
                        <select id="param-dmarc-p">
                            <option value="none" ${values.policy === 'none' ? 'selected' : ''}>none (только отчеты)</option>
                            <option value="quarantine" ${values.policy === 'quarantine' ? 'selected' : ''}>quarantine (в спам)</option>
                            <option value="reject" ${values.policy === 'reject' ? 'selected' : ''}>reject (отклонять)</option>
                        </select>
                    </div>
                    <div class="field-group">
                        <label>Процент (pct, 0-100):</label>
                        <input type="number" id="param-pct" min="0" max="100" value="${values.pct}">
                        <div class="error-message" id="err-param-pct">0-100</div>
                    </div>
                </div>
                <div class="grid-2">
                    <div class="field-group">
                        <label>RUA Email (отчеты):</label>
                        <input type="text" id="param-rua" value="${values.rua}" maxlength="254" placeholder="dmarc@example.com">
                        <div class="error-message" id="err-param-rua">Неверный email</div>
                    </div>
                    <div class="field-group">
                        <label>RUF Email (опционально):</label>
                        <input type="text" id="param-ruf" value="${values.ruf}" maxlength="254" placeholder="ruf@example.com">
                        <div class="error-message" id="err-param-ruf">Неверный email</div>
                    </div>
                </div>
                <div class="grid-2">
                    <div class="field-group">
                        <label>SPF-выравнивание (aspf):</label>
                        <select id="param-aspf">
                            <option value="r" ${values.aspf === 'r' ? 'selected' : ''}>r (Relaxed)</option>
                            <option value="s" ${values.aspf === 's' ? 'selected' : ''}>s (Strict)</option>
                        </select>
                    </div>
                    <div class="field-group">
                        <label>DKIM-выравнивание (adkim):</label>
                        <select id="param-adkim">
                            <option value="r" ${values.adkim === 'r' ? 'selected' : ''}>r (Relaxed)</option>
                            <option value="s" ${values.adkim === 's' ? 'selected' : ''}>s (Strict)</option>
                        </select>
                    </div>
                </div>
            `;
        },
        generate() {
            const p = document.getElementById('param-dmarc-p')?.value || 'quarantine';
            const pct = document.getElementById('param-pct')?.value || '100';
            const rua = document.getElementById('param-rua')?.value || '';
            const ruf = document.getElementById('param-ruf')?.value || '';
            const aspf = document.getElementById('param-aspf')?.value || 'r';
            const adkim = document.getElementById('param-adkim')?.value || 'r';

            let parts = [`v=DMARC1; p=${p}; pct=${pct};`];
            if (rua) parts.push(`rua=mailto:${rua};`);
            if (ruf) parts.push(`ruf=mailto:${ruf};`);
            parts.push(`aspf=${aspf}; adkim=${adkim}`);

            return parts.join(' ');
        },
        validate() {
            let isValid = true;
            const pctEl = document.getElementById('param-pct');
            if (!Validators.isNumberInRange(pctEl?.value, 0, 100)) {
                pctEl?.classList.add('input-error');
                document.getElementById('err-param-pct').style.display = 'block';
                isValid = false;
            } else {
                pctEl?.classList.remove('input-error');
                document.getElementById('err-param-pct').style.display = 'none';
            }

            const ruaEl = document.getElementById('param-rua');
            if (ruaEl && ruaEl.value.trim() !== '' && !Validators.isEmail(ruaEl.value)) {
                ruaEl.classList.add('input-error');
                document.getElementById('err-param-rua').style.display = 'block';
                isValid = false;
            } else {
                ruaEl?.classList.remove('input-error');
                document.getElementById('err-param-rua').style.display = 'none';
            }

            const rufEl = document.getElementById('param-ruf');
            if (rufEl && rufEl.value.trim() !== '' && !Validators.isEmail(rufEl.value)) {
                rufEl.classList.add('input-error');
                document.getElementById('err-param-ruf').style.display = 'block';
                isValid = false;
            } else {
                rufEl?.classList.remove('input-error');
                document.getElementById('err-param-ruf').style.display = 'none';
            }
            return isValid;
        }
    },

    "MTA-STS": {
        description: "MTA-STS обеспечивает шифрованное TLS-соединение. Параметры 'Режим' и 'Max age' применяются в policy-файле на сервере.",
        defaults: { mode: "enforce", id: new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14), maxAge: 86400 },
        renderForm(values) {
            return `
                <div class="grid-3">
                    <div class="field-group">
                        <label>Режим:</label>
                        <select id="param-mta-mode">
                            <option value="enforce" ${values.mode === 'enforce' ? 'selected' : ''}>enforce</option>
                            <option value="testing" ${values.mode === 'testing' ? 'selected' : ''}>testing</option>
                        </select>
                    </div>
                    <div class="field-group">
                        <label>ID Политики:</label>
                        <input type="text" id="param-mta-id" value="${values.id}" maxlength="32">
                        <div class="error-message" id="err-param-mta-id">Укажите ID</div>
                    </div>
                    <div class="field-group">
                        <label>Max age (сек):</label>
                        <input type="number" id="param-mta-maxage" value="${values.maxAge}">
                    </div>
                </div>
            `;
        },
        generate() {
            const id = document.getElementById('param-mta-id')?.value || '1';
            return `_mta-sts TXT "v=STSv1; id=${id}"`;
        },
        validate() {
            let isValid = true;
            const idEl = document.getElementById('param-mta-id');
            if (!idEl || !idEl.value.trim()) {
                idEl?.classList.add('input-error');
                document.getElementById('err-param-mta-id').style.display = 'block';
                isValid = false;
            } else {
                idEl?.classList.remove('input-error');
                document.getElementById('err-param-mta-id').style.display = 'none';
            }
            return isValid;
        }
    },

    "TLS-RPT": {
        description: "TLS-RPT позволяет получать отчеты о проблемах с доставкой TLS-почты.",
        defaults: { rua: "tls@example.com" },
        renderForm(values) {
            return `
                <div class="field-group">
                    <label>RUA Email:</label>
                    <input type="text" id="param-tls-rua" value="${values.rua}" maxlength="254" placeholder="tls@example.com">
                    <div class="error-message" id="err-param-tls-rua">Неверный email</div>
                </div>
            `;
        },
        generate() {
            const rua = document.getElementById('param-tls-rua')?.value || '';
            return `_smtp._tls TXT "v=TLSRPTv1; rua=mailto:${rua}"`;
        },
        validate() {
            let isValid = true;
            const ruaEl = document.getElementById('param-tls-rua');
            if (ruaEl && ruaEl.value.trim() !== '' && !Validators.isEmail(ruaEl.value)) {
                ruaEl.classList.add('input-error');
                document.getElementById('err-param-tls-rua').style.display = 'block';
                isValid = false;
            } else {
                ruaEl?.classList.remove('input-error');
                document.getElementById('err-param-tls-rua').style.display = 'none';
            }
            return isValid;
        }
    },

    SRV: {
        description: "SRV-запись указывает расположение серверов для определенных сервисов.",
        defaults: { service: "_autodiscover", proto: "_tcp", prio: 0, weight: 0, port: 443, target: "autodiscover.example.com" },
        renderForm(values) {
            return `
                <div class="grid-2">
                    <div class="field-group">
                        <label>Сервис:</label>
                        <select id="param-srv-service">
                            <option value="_autodiscover" ${values.service === '_autodiscover' ? 'selected' : ''}>_autodiscover</option>
                            <option value="_imap" ${values.service === '_imap' ? 'selected' : ''}>_imap</option>
                            <option value="_pop3" ${values.service === '_pop3' ? 'selected' : ''}>_pop3</option>
                            <option value="_smtp" ${values.service === '_smtp' ? 'selected' : ''}>_smtp</option>
                        </select>
                    </div>
                    <div class="field-group">
                        <label>Протокол:</label>
                        <select id="param-srv-proto">
                            <option value="_tcp" ${values.proto === '_tcp' ? 'selected' : ''}>_tcp</option>
                            <option value="_udp" ${values.proto === '_udp' ? 'selected' : ''}>_udp</option>
                        </select>
                    </div>
                </div>
                <div class="grid-3">
                    <div class="field-group">
                        <label>Приоритет:</label>
                        <input type="number" id="param-srv-prio" min="0" max="65535" value="${values.prio}">
                        <div class="error-message" id="err-param-srv-prio">0-65535</div>
                    </div>
                    <div class="field-group">
                        <label>Вес:</label>
                        <input type="number" id="param-srv-weight" min="0" max="65535" value="${values.weight}">
                        <div class="error-message" id="err-param-srv-weight">0-65535</div>
                    </div>
                    <div class="field-group">
                        <label>Порт:</label>
                        <input type="number" id="param-srv-port" min="1" max="65535" value="${values.port}">
                        <div class="error-message" id="err-param-srv-port">1-65535</div>
                    </div>
                </div>
                <div class="field-group">
                    <label>Целевой хост (FQDN):</label>
                    <input type="text" id="param-srv-target" value="${values.target}" maxlength="255" placeholder="autodiscover.example.com">
                    <div class="error-message" id="err-param-srv-target">Укажите хост</div>
                </div>
            `;
        },
        generate() {
            const s = document.getElementById('param-srv-service')?.value || '_autodiscover';
            const p = document.getElementById('param-srv-proto')?.value || '_tcp';
            const prio = document.getElementById('param-srv-prio')?.value || '0';
            const w = document.getElementById('param-srv-weight')?.value || '0';
            const port = document.getElementById('param-srv-port')?.value || '443';
            const target = document.getElementById('param-srv-target')?.value || '';

            return `${s}.${p} SRV ${prio} ${w} ${port} ${target}.`;
        },
        validate() {
            let isValid = true;

            const prioEl = document.getElementById('param-srv-prio');
            if (!Validators.isNumberInRange(prioEl?.value, 0, 65535)) {
                prioEl?.classList.add('input-error');
                document.getElementById('err-param-srv-prio').style.display = 'block';
                isValid = false;
            } else {
                prioEl?.classList.remove('input-error');
                document.getElementById('err-param-srv-prio').style.display = 'none';
            }

            const weightEl = document.getElementById('param-srv-weight');
            if (!Validators.isNumberInRange(weightEl?.value, 0, 65535)) {
                weightEl?.classList.add('input-error');
                document.getElementById('err-param-srv-weight').style.display = 'block';
                isValid = false;
            } else {
                weightEl?.classList.remove('input-error');
                document.getElementById('err-param-srv-weight').style.display = 'none';
            }

            const portEl = document.getElementById('param-srv-port');
            if (!Validators.isPort(portEl?.value)) {
                portEl?.classList.add('input-error');
                document.getElementById('err-param-srv-port').style.display = 'block';
                isValid = false;
            } else {
                portEl?.classList.remove('input-error');
                document.getElementById('err-param-srv-port').style.display = 'none';
            }

            const targetEl = document.getElementById('param-srv-target');
            if (!targetEl || !targetEl.value.trim()) {
                targetEl?.classList.add('input-error');
                document.getElementById('err-param-srv-target').style.display = 'block';
                isValid = false;
            } else {
                targetEl?.classList.remove('input-error');
                document.getElementById('err-param-srv-target').style.display = 'none';
            }
            return isValid;
        }
    },

    CNAME: {
        description: "CNAME перенаправляет запросы с одного домена/поддомена на другой.",
        defaults: { alias: "mail", target: "mail.yandex.ru" },
        renderForm(values) {
            return `
                <div class="grid-2">
                    <div class="field-group">
                        <label>Алиас (поддомен):</label>
                        <input type="text" id="param-cname-alias" value="${values.alias}" maxlength="63" placeholder="mail">
                        <div class="error-message" id="err-param-cname-alias">Укажите алиас</div>
                    </div>
                    <div class="field-group">
                        <label>Целевой домен (FQDN):</label>
                        <input type="text" id="param-cname-target" value="${values.target}" maxlength="255" placeholder="mail.yandex.ru">
                        <div class="error-message" id="err-param-cname-target">Укажите домен</div>
                    </div>
                </div>
            `;
        },
        generate() {
            const alias = document.getElementById('param-cname-alias')?.value || 'mail';
            const target = document.getElementById('param-cname-target')?.value || '';
            return `${alias} CNAME ${target}.`;
        },
        validate() {
            let isValid = true;
            const aliasEl = document.getElementById('param-cname-alias');
            if (!aliasEl || !aliasEl.value.trim()) {
                aliasEl?.classList.add('input-error');
                document.getElementById('err-param-cname-alias').style.display = 'block';
                isValid = false;
            } else {
                aliasEl?.classList.remove('input-error');
                document.getElementById('err-param-cname-alias').style.display = 'none';
            }
            const targetEl = document.getElementById('param-cname-target');
            if (!targetEl || !targetEl.value.trim()) {
                targetEl?.classList.add('input-error');
                document.getElementById('err-param-cname-target').style.display = 'block';
                isValid = false;
            } else {
                targetEl?.classList.remove('input-error');
                document.getElementById('err-param-cname-target').style.display = 'none';
            }
            return isValid;
        }
    },

    BIMI: {
        description: "BIMI позволяет отображать ваш логотип компании в почтовых ящиках получателей.",
        defaults: { logo: "https://example.com/logo.svg", cert: "https://example.com/cert.pem", useCert: false },
        renderForm(values) {
            return `
                <div class="field-group">
                    <label>URL логотипа (обязательно):</label>
                    <input type="text" id="param-bimi-logo" value="${values.logo}" placeholder="https://example.com/logo.svg">
                    <div class="error-message" id="err-param-bimi-logo">Укажите корректный URL</div>
                </div>
                <div class="field-group" style="margin-top: 10px;">
                    <label style="cursor:pointer;">
                        <input type="checkbox" id="param-bimi-use-cert" ${values.useCert ? 'checked' : ''}>
                        Добавить VMC-сертификат
                    </label>
                </div>
                <div class="field-group" id="bimi-cert-container" style="display:${values.useCert ? 'block' : 'none'};">
                    <label>URL VMC-сертификата (опционально):</label>
                    <input type="text" id="param-bimi-cert" value="${values.cert}" placeholder="https://example.com/cert.pem">
                    <div class="error-message" id="err-param-bimi-cert">Укажите корректный URL</div>
                </div>
            `;
        },
        generate() {
            const logo = document.getElementById('param-bimi-logo')?.value || '';
            const useCert = document.getElementById('param-bimi-use-cert')?.checked;
            const cert = document.getElementById('param-bimi-cert')?.value || '';

            let res = `default._bimi TXT "v=BIMI1; l=${logo};`;
            if (useCert && cert) {
                res += ` a=${cert};`;
            }
            res += `"`;;
            return res;
        },
        validate() {
            let isValid = true;
            const logoEl = document.getElementById('param-bimi-logo');
            if (!Validators.isURL(logoEl?.value || '')) {
                logoEl?.classList.add('input-error');
                document.getElementById('err-param-bimi-logo').style.display = 'block';
                isValid = false;
            } else {
                logoEl?.classList.remove('input-error');
                document.getElementById('err-param-bimi-logo').style.display = 'none';
            }

            if (document.getElementById('param-bimi-use-cert')?.checked) {
                const certEl = document.getElementById('param-bimi-cert');
                if (certEl.value.trim() !== '' && !Validators.isURL(certEl.value)) {
                    certEl.classList.add('input-error');
                    document.getElementById('err-param-bimi-cert').style.display = 'block';
                    isValid = false;
                } else {
                    certEl.classList.remove('input-error');
                    document.getElementById('err-param-bimi-cert').style.display = 'none';
                }
            }
            return isValid;
        }
    },

    AAAA: {
        description: "AAAA-запись связывает имя домена с его IPv6-адресом.",
        defaults: { subdomain: "mail", ipv6: "2001:db8::1" },
        renderForm(values) {
            return `
                <div class="grid-2">
                    <div class="field-group">
                        <label>Поддомен:</label>
                        <input type="text" id="param-aaaa-sub" value="${values.subdomain}" maxlength="63" placeholder="mail">
                        <div class="error-message" id="err-param-aaaa-sub">Укажите поддомен</div>
                    </div>
                    <div class="field-group">
                        <label>IPv6-адрес:</label>
                        <input type="text" id="param-aaaa-ip" value="${values.ipv6}" placeholder="2001:db8::1">
                        <div class="error-message" id="err-param-aaaa-ip">Неверный IPv6</div>
                    </div>
                </div>
            `;
        },
        generate() {
            const sub = document.getElementById('param-aaaa-sub')?.value || 'mail';
            const ip = document.getElementById('param-aaaa-ip')?.value || '';
            return `${sub} AAAA ${ip}`;
        },
        validate() {
            let isValid = true;
            const subEl = document.getElementById('param-aaaa-sub');
            if (!subEl || !subEl.value.trim()) {
                subEl?.classList.add('input-error');
                document.getElementById('err-param-aaaa-sub').style.display = 'block';
                isValid = false;
            } else {
                subEl?.classList.remove('input-error');
                document.getElementById('err-param-aaaa-sub').style.display = 'none';
            }

            const ipEl = document.getElementById('param-aaaa-ip');
            if (!Validators.isIPv6(ipEl?.value || '')) {
                ipEl?.classList.add('input-error');
                document.getElementById('err-param-aaaa-ip').style.display = 'block';
                isValid = false;
            } else {
                ipEl?.classList.remove('input-error');
                document.getElementById('err-param-aaaa-ip').style.display = 'none';
            }
            return isValid;
        }
    },

    TXT: {
        description: "Произвольная TXT-запись используется для верификации домена и передачи текстовых данных.",
        defaults: { name: "@", value: "google-site-verification=abc123" },
        renderForm(values) {
            return `
                <div class="grid-2">
                    <div class="field-group">
                        <label>Имя (поддомен или @):</label>
                        <input type="text" id="param-txt-name" value="${values.name}" maxlength="63" placeholder="@">
                        <div class="error-message" id="err-param-txt-name">Укажите имя записи</div>
                    </div>
                    <div class="field-group">
                        <label>Значение (текст):</label>
                        <input type="text" id="param-txt-val" value="${values.value}" placeholder="google-site-verification=...">
                        <div class="error-message" id="err-param-txt-val">Укажите значение</div>
                    </div>
                </div>
            `;
        },
        generate() {
            const name = document.getElementById('param-txt-name')?.value || '@';
            const val = document.getElementById('param-txt-val')?.value || '';
            return `${name} TXT "${val}"`;
        },
        validate() {
            let isValid = true;
            const nameEl = document.getElementById('param-txt-name');
            if (!nameEl || !nameEl.value.trim()) {
                nameEl?.classList.add('input-error');
                document.getElementById('err-param-txt-name').style.display = 'block';
                isValid = false;
            } else {
                nameEl?.classList.remove('input-error');
                document.getElementById('err-param-txt-name').style.display = 'none';
            }

            const valEl = document.getElementById('param-txt-val');
            if (!valEl || !valEl.value.trim()) {
                valEl?.classList.add('input-error');
                document.getElementById('err-param-txt-val').style.display = 'block';
                isValid = false;
            } else {
                valEl?.classList.remove('input-error');
                document.getElementById('err-param-txt-val').style.display = 'none';
            }
            return isValid;
        }
    }
};

const AppManager = {
    currentType: 'MX',

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.setTab('MX');
    },

    cacheDOM() {
        this.domainInput = document.getElementById('global-domain');
        this.domainError = document.getElementById('domain-error');
        this.tabs = document.querySelectorAll('.tab-btn');
        this.paramsContainer = document.getElementById('dynamic-params-container');
        this.resultOutput = document.getElementById('result-output');
        this.descriptionBox = document.getElementById('record-description');
        this.copyBtn = document.getElementById('copy-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.copyToast = document.getElementById('copy-toast');
    },

    bindEvents() {
        this.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.setTab(e.target.dataset.type);
            });
        });

        this.domainInput.addEventListener('input', () => this.update());
        this.copyBtn.addEventListener('click', () => this.copyToClipboard());
        this.resetBtn.addEventListener('click', () => this.resetForm());
    },

    setTab(type) {
        this.currentType = type;
        this.tabs.forEach(tab => {
            if (tab.dataset.type === type) tab.classList.add('active');
            else tab.classList.remove('active');
        });
        this.renderForm();
    },

    renderForm() {
        const definition = RecordDefinitions[this.currentType];
        this.descriptionBox.textContent = definition.description;
        this.paramsContainer.innerHTML = definition.renderForm(definition.defaults);
        this.bindDynamicEvents();
        this.update();
    },

    bindDynamicEvents() {
        const inputs = this.paramsContainer.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('input', () => this.update());
            input.addEventListener('change', () => this.update());
        });

        const genDkimBtn = document.getElementById('gen-dkim-btn');
        if (genDkimBtn) {
            genDkimBtn.addEventListener('click', async () => {
                const textarea = document.getElementById('param-pubkey');
                const keyLenEl = document.getElementById('param-key-len');
                const keyLength = keyLenEl ? parseInt(keyLenEl.value, 10) : 2048;

                genDkimBtn.disabled = true;
                genDkimBtn.textContent = 'Генерация...';

                try {
                    const keyPair = await window.crypto.subtle.generateKey(
                        {
                            name: "RSASSA-PKCS1-v1_5",
                            modulusLength: keyLength,
                            publicExponent: new Uint8Array([1, 0, 1]),
                            hash: "SHA-256"
                        },
                        true,
                        ["sign", "verify"]
                    );

                    const exportKey = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);

                    let binary = '';
                    const bytes = new Uint8Array(exportKey);
                    for (let i = 0; i < bytes.byteLength; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    const base64Key = window.btoa(binary);

                    textarea.value = base64Key;
                    this.update();
                } catch (error) {
                    console.error("Ошибка при генерации ключа:", error);
                    textarea.value = "Ошибка генерации ключа браузером.";
                } finally {
                    genDkimBtn.disabled = false;
                    genDkimBtn.textContent = 'Сгенерировать RSA-ключ';
                }
            });
        }

        const incV6 = document.getElementById('param-include-v6');
        if (incV6) {
            incV6.addEventListener('change', (e) => {
                document.getElementById('v6-container').style.display = e.target.checked ? 'block' : 'none';
            });
        }

        const bimiCert = document.getElementById('param-bimi-use-cert');
        if (bimiCert) {
            bimiCert.addEventListener('change', (e) => {
                document.getElementById('bimi-cert-container').style.display = e.target.checked ? 'block' : 'none';
            });
        }
    },

    update() {
        const domain = this.domainInput.value.trim();
        let isGlobalValid = true;

        if (!Validators.isDomain(domain)) {
            this.domainInput.classList.add('input-error');
            this.domainError.style.display = 'block';
            isGlobalValid = false;
        } else {
            this.domainInput.classList.remove('input-error');
            this.domainError.style.display = 'none';
        }

        const definition = RecordDefinitions[this.currentType];
        let isFormValid = true;

        if (definition.validate) {
            isFormValid = definition.validate();
        }

        if (isGlobalValid && isFormValid) {
            this.resultOutput.value = definition.generate(domain);
        } else {
            this.resultOutput.value = "Пожалуйста, исправьте ошибки в подсвеченных полях.";
        }
    },

    copyToClipboard() {
        const text = this.resultOutput.value;
        if (text && !text.includes('ошибки')) {
            navigator.clipboard.writeText(text).then(() => {
                this.copyToast.style.display = 'block';
                setTimeout(() => {
                    this.copyToast.style.display = 'none';
                }, 2000);
            });
        }
    },

    resetForm() {
        this.domainInput.value = 'example.com';
        this.domainInput.classList.remove('input-error');
        this.domainError.style.display = 'none';

        this.renderForm();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    AppManager.init();
});