const fs = require('fs');
const path = require('path');

const VIEW = path.join(__dirname, '..', 'DnsRecordGenerator', 'Views', 'Home', 'Index.cshtml');
const SCRIPTS = path.join(__dirname, '..', 'DnsRecordGenerator', 'Scripts');

function renderMarkup() {
    return fs.readFileSync(VIEW, 'utf8')
        .replace(/@\{[\s\S]*?\}\s*/, '')
        .replace(/@Url\.Action\([^)]*\)/g, '/')
        .replace(/~(?=\/)/g, '')
        // «@» в разметке записан HTML-сущностью &#64;, чтобы Razor не считал её кодом
        .replace(/&#64;/g, '@');
}

function loadDom() {
    let JSDOM;
    try {
        JSDOM = require('jsdom').JSDOM;
    } catch (error) {
        return null;
    }

    const dom = new JSDOM(renderMarkup(), { runScripts: 'dangerously', url: 'https://localhost/' });

    // Polyfill TextEncoder/TextDecoder for jsdom
    const util = require('util');
    if (!dom.window.TextEncoder) {
        dom.window.TextEncoder = util.TextEncoder;
    }
    if (!dom.window.TextDecoder) {
        dom.window.TextDecoder = util.TextDecoder;
    }

    ['validators.js', 'records.js', 'state.js', 'app.js'].forEach(name => {
        const script = dom.window.document.createElement('script');
        script.textContent = fs.readFileSync(path.join(SCRIPTS, name), 'utf8');
        dom.window.document.body.appendChild(script);
    });
    return dom;
}

module.exports = { renderMarkup, loadDom, VIEW };