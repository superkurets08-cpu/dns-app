const DnsState = (function () {
    const DEFAULT_DOMAIN = 'example.com';
    const DEFAULT_TTL = '3600';

    function create() {
        return {
            domain: DEFAULT_DOMAIN,
            ttl: DEFAULT_TTL,
            recordId: DnsRecords.all[0].id,
            values: {}
        };
    }

    function defaultValueOf(field, domain) {
        const raw = typeof field.value === 'function' ? field.value(domain) : field.value;
        return field.type === 'checks' ? Object.assign({}, raw) : raw;
    }

    function valuesFor(state, record) {
        if (!state.values[record.id]) {
            state.values[record.id] = {};
        }

        const values = state.values[record.id];

        record.fields.forEach(function (field) {
            if (values[field.name] === undefined || values[field.name] === null) {
                values[field.name] = defaultValueOf(field, state.domain);
            }
        });

        return values;
    }

    function selectRecord(state, recordId) {
        state.recordId = recordId;
    }

    function setDomain(state, domain) {
        state.domain = domain;
    }

    function setTtl(state, ttl) {
        state.ttl = ttl;
    }

    function resetRecord(state, recordId) {
        delete state.values[recordId || state.recordId];
    }

    return {
        DEFAULT_DOMAIN: DEFAULT_DOMAIN,
        DEFAULT_TTL: DEFAULT_TTL,
        create: create,
        defaultValueOf: defaultValueOf,
        valuesFor: valuesFor,
        selectRecord: selectRecord,
        setDomain: setDomain,
        setTtl: setTtl,
        resetRecord: resetRecord
    };
})();
