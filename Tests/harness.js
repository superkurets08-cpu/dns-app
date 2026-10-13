const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCRIPTS = path.join(__dirname, '..', 'DnsRecordGenerator', 'Scripts');

function loadSources() {
    const files = ['validators.js', 'records.js', 'state.js'];
    const context = vm.createContext({ window: {}, console, URL, TextEncoder, Date });
    vm.runInContext(files.map(name => fs.readFileSync(path.join(SCRIPTS, name), 'utf8')).join('\n'), context);
    vm.runInContext('globalThis.Validators = Validators;\nglobalThis.DnsRecords = DnsRecords;\nglobalThis.DnsState = DnsState;', context);
    return context;
}

module.exports = { SCRIPTS, loadSources };