const Validators = (function () {

    const TLD = '(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})';
    const DOMAIN = new RegExp(
        '^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+' + TLD + '$', 'i');
    const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
    const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
    const HEX_GROUP = /^[0-9a-f]{1,4}$/i;

    const RECORD_UNSAFE = /["\\]/;

    const CONTROL_CHARS = /[\u0000-\u001F\u007F\u2028\u2029]/;

    function empty(value) {
        return value === null || value === undefined || String(value).trim() === '';
    }

    function recordSafe(value) {
        return !CONTROL_CHARS.test(String(value)) && !RECORD_UNSAFE.test(String(value));
    }

    const CONTROL_CHARS_GLOBAL = /[\u0000-\u001F\u007F\u2028\u2029]/g;

    function stripControlChars(value) {
        return String(value).replace(CONTROL_CHARS_GLOBAL, '');
    }

    function domain(value) {
        const ascii = toAsciiDomain(value).trim();
        return recordSafe(ascii) && DOMAIN.test(ascii);
    }

    function subdomain(value) {

        const trimmed = String(value).trim();
        if (!recordSafe(trimmed)) {
            return false;
        }
        return trimmed === '@' || SUBDOMAIN.test(trimmed);
    }

    function hostname(value) {
        const ascii = toAsciiDomain(value).trim();
        return recordSafe(ascii) && DOMAIN.test(ascii);
    }

    function hostnameWithSubdomain(value) {
        const ascii = toAsciiDomain(String(value).trim());
        if (!recordSafe(ascii)) {
            return false;
        }
        return DOMAIN.test(ascii) || SUBDOMAIN.test(ascii);
    }

    function ipv4(value) {
        const trimmed = String(value).trim();
        if (!recordSafe(trimmed)) {
            return false;
        }

        const parts = trimmed.split('.');

        if (parts.length !== 4) {
            return false;
        }

        return parts.every(part => {
            if (!/^\d{1,3}$/.test(part)) {
                return false;
            }

            if (part.length > 1 && part.charAt(0) === '0') {
                return false;
            }

            return Number(part) <= 255;
        });
    }

    function ipv6(value) {
        const trimmed = String(value).trim();
        if (!recordSafe(trimmed) || !trimmed.includes(':') || /[^0-9a-f:.]/i.test(trimmed)) {
            return false;
        }

        const halves = trimmed.split('::');
        if (halves.length > 2) {
            return false;
        }

        const groups = halves.join(':').split(':').filter(part => part !== '');
        if (groups.length > 8 || (halves.length === 1 && groups.length !== 8)) {
            return false;
        }

        return groups.every(group => HEX_GROUP.test(group));
    }

    function ipv4List(value) {
        if (!recordSafe(String(value).trim())) {
            return false;
        }
        return String(value)
            .split(',')
            .map(item => item.trim())
            .filter(item => item !== '')
            .every(ipv4);
    }

    function spfIp(value) {
        const trimmed = String(value).trim();
        if (!recordSafe(trimmed)) {
            return false;
        }

        const lower = trimmed.toLowerCase();
        if (lower.startsWith('ip4:')) {
            return ipv4(trimmed.slice(4));
        }
        if (lower.startsWith('ip6:')) {
            return ipv6(trimmed.slice(4));
        }
        return ipv4(trimmed) || ipv6(trimmed);
    }

    function spfIpList(value) {
        if (!recordSafe(String(value).trim())) {
            return false;
        }
        return String(value)
            .split(',')
            .map(item => item.trim())
            .filter(item => item !== '')
            .every(spfIp);
    }

    function toAsciiDomain(value) {
        const trimmed = String(value).trim();
        if (trimmed === '' || /^[\x00-\x7F]*$/.test(trimmed)) {
            return trimmed;
        }

        if (/[\u0000-\u001F\u007F\u2028\u2029]/.test(trimmed)) {
            return trimmed;
        }

        if (/[@/?#: ]/.test(trimmed)) {
            return trimmed;
        }
        try {
            return new URL('http://' + trimmed).hostname;
        } catch (error) {
            return trimmed;
        }
    }

    function toAsciiEmail(value) {
        const trimmed = String(value).trim();
        const at = trimmed.lastIndexOf('@');
        if (at === -1) {
            return trimmed;
        }
        return trimmed.slice(0, at + 1) + toAsciiDomain(trimmed.slice(at + 1));
    }

    function toAsciiUrl(value) {
        const trimmed = String(value).trim();
        try {
            const parsed = new URL(trimmed);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                return trimmed;
            }

            return parsed.href;
        } catch (error) {
            return trimmed;
        }
    }

    function isAscii(value) {
        return /^[\x00-\x7F]*$/.test(String(value));
    }

    function email(value) {
        const trimmed = String(value).trim();

        if (!recordSafe(trimmed)) {
            return false;
        }
        const ascii = toAsciiEmail(trimmed);

        return recordSafe(ascii) && isAscii(ascii) && EMAIL.test(ascii);
    }

    function url(value) {
        const trimmed = String(value).trim();

        if (!recordSafe(trimmed)) {
            return false;
        }

        const ascii = toAsciiUrl(trimmed);
        if (!isAscii(ascii)) {
            return false;
        }

        try {
            const parsed = new URL(ascii);
            return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host !== '';
        } catch (error) {
            return false;
        }
    }

    function integerInRange(min, max) {
        return function (value) {
            if (!/^-?\d+$/.test(String(value).trim())) {
                return false;
            }

            const parsed = Number(String(value).trim());
            return parsed >= min && parsed <= max;
        };
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    return {
        empty: empty,
        domain: domain,
        subdomain: subdomain,
        hostname: hostname,
        hostnameWithSubdomain: hostnameWithSubdomain,
        ipv4: ipv4,
        ipv4List: ipv4List,
        ipv6: ipv6,
        spfIp: spfIp,
        spfIpList: spfIpList,
        email: email,
        url: url,
        integerInRange: integerInRange,
        recordSafe: recordSafe,
        stripControlChars: stripControlChars,
        toAsciiDomain: toAsciiDomain,
        toAsciiEmail: toAsciiEmail,
        toAsciiUrl: toAsciiUrl,
        escapeHtml: escapeHtml
    };
})();
