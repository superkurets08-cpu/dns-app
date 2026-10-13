const { suite, test, eq, ok } = require('./runner');
const { loadSources } = require('./harness');

const { DnsState, DnsRecords } = loadSources();

suite('Состояние: создание и выбор');

test('начальное состояние: домен и первая запись', () => {
    const state = DnsState.create();
    eq(state.domain, 'example.com');
    eq(state.recordId, DnsRecords.all[0].id);
    eq(typeof state.values, 'object');
});

test('два состояния независимы', () => {
    const a = DnsState.create();
    const b = DnsState.create();
    DnsState.setDomain(a, 'a.com');
    eq(b.domain, 'example.com');
});

test('смена записи и домена', () => {
    const state = DnsState.create();
    DnsState.selectRecord(state, 'DKIM');
    eq(state.recordId, 'DKIM');
    DnsState.setDomain(state, 'test.example.by');
    eq(state.domain, 'test.example.by');
});

suite('Состояние: значения полей');

test('значения дополняются умолчаниями лениво', () => {
    const state = DnsState.create();
    const record = DnsRecords.find('MX');
    const values = DnsState.valuesFor(state, record);
    eq(values.priority, 10);
    eq(values.host, 'mail');
});

test('введённые значения не затираются умолчаниями', () => {
    const state = DnsState.create();
    const record = DnsRecords.find('MX');
    const values = DnsState.valuesFor(state, record);
    values.priority = 5;
    eq(DnsState.valuesFor(state, record).priority, 5);
});

test('значения функций зависят от текущего домена', () => {
    const state = DnsState.create();
    DnsState.setDomain(state, 'other.by');
    const record = DnsRecords.find('DMARC');
    eq(DnsState.valuesFor(state, record).rua, 'dmarc@other.by');
});

test('флажки копируются, а не разделяются', () => {
    const state = DnsState.create();
    const record = DnsRecords.find('SPF');
    const values = DnsState.valuesFor(state, record);
    values.providers.google = true;
    const fresh = DnsRecords.find('SPF');
    const second = DnsState.create();
    eq(DnsState.valuesFor(second, fresh).providers.google, false);
});

test('сброс очищает только текущую запись', () => {
    const state = DnsState.create();
    DnsState.valuesFor(state, DnsRecords.find('MX')).priority = 5;
    DnsState.valuesFor(state, DnsRecords.find('A')).ip = '10.0.0.1';
    DnsState.selectRecord(state, 'MX');
    DnsState.resetRecord(state);
    eq(DnsState.valuesFor(state, DnsRecords.find('MX')).priority, 10);
    eq(DnsState.valuesFor(state, DnsRecords.find('A')).ip, '10.0.0.1');
});

test('сброс по явному идентификатору', () => {
    const state = DnsState.create();
    DnsState.valuesFor(state, DnsRecords.find('MX')).priority = 5;
    DnsState.resetRecord(state, 'MX');
    eq(DnsState.valuesFor(state, DnsRecords.find('MX')).priority, 10);
});

test('сгенерированный ключ переживает смену вкладок', () => {
    const state = DnsState.create();
    const dkim = DnsRecords.find('DKIM');
    DnsState.valuesFor(state, dkim).privateKey = 'СЕКРЕТ';
    DnsState.selectRecord(state, 'MX');
    DnsState.selectRecord(state, 'DKIM');
    eq(DnsState.valuesFor(state, dkim).privateKey, 'СЕКРЕТ');
});

test('сброс записи удаляет и ключ', () => {
    const state = DnsState.create();
    const dkim = DnsRecords.find('DKIM');
    DnsState.valuesFor(state, dkim).privateKey = 'СЕКРЕТ';
    DnsState.resetRecord(state, 'DKIM');
    eq(DnsState.valuesFor(state, dkim).privateKey, undefined);
});
