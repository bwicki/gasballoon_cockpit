// Gasballoon Cockpit - shared jsdom test harness
// Consolidates the ad-hoc test setup that was rewritten from scratch many
// times during development (and which caught real bugs each time it was
// used) into one reusable module. Run test-suite.js before every
// deployment rather than skipping straight to shipping.

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// ---------- static checks (syntax, IDs, div balance, TDZ) ----------
// These don't need a real DOM - pure text/AST-level checks, fast enough to
// run on every single edit, not just before a full deployment.

function checkSyntax(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const errors = [];
  scripts.forEach((s, i) => {
    try { new Function(s); } catch (e) { errors.push(`block ${i}: ${e.message}`); }
  });
  return errors;
}

function checkMissingIds(html) {
  const definedIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  const referenced = [...html.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]);
  const knownDynamic = new Set(['lightningPromptBanner', 'onboardingHintClose', 'quickOnboardingHintClose', 'stagedOnboardingHintClose']);
  return [...new Set(referenced)].filter(id => !definedIds.has(id) && !knownDynamic.has(id));
}

function checkDivBalance(html) {
  const bodyStart = html.indexOf('<body');
  const scriptStart = html.indexOf('<script>');
  const htmlPart = html.slice(bodyStart, scriptStart);
  const tokens = [...htmlPart.matchAll(/<div\b[^>]*(?<!\/)>|<\/div>/g)];
  const stack = [];
  for (const m of tokens) {
    const tag = m[0];
    if (tag.startsWith('</div')) {
      if (!stack.length) {
        const lineNo = htmlPart.slice(0, m.index).split('\n').length;
        return { balanced: false, problemLine: lineNo };
      }
      stack.pop();
    } else {
      stack.push(tag);
    }
  }
  return { balanced: stack.length === 0, openAtEnd: stack.length };
}

function checkTdz(html) {
  const scriptStart = html.indexOf('<script>');
  const scriptEnd = html.lastIndexOf('</script>');
  const js = html.slice(scriptStart + '<script>'.length, scriptEnd);
  const lines = js.split('\n');
  const declarations = {};
  lines.forEach((line, i) => {
    const m = line.match(/^(let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
    if (m) declarations[m[2]] = i;
  });
  const suspects = [];
  for (const [name, declLine] of Object.entries(declarations)) {
    if (name.length < 4) continue;
    const pattern = new RegExp('\\b' + name + '\\b');
    for (let i = 0; i < declLine; i++) {
      if (pattern.test(lines[i])) { suspects.push(name); break; }
    }
  }
  const openBraces = (js.match(/{/g) || []).length;
  const closeBraces = (js.match(/}/g) || []).length;
  return { suspects, bracesBalanced: openBraces === closeBraces };
}

// Suspects that are confirmed-safe false positives (comment-only earlier
// mentions, or used only inside functions called after their own
// declaration) - re-verified each time this list changes, not just copied
// forward blindly.
const KNOWN_SAFE_TDZ_SUSPECTS = new Set([
  'GATE_HASH', 'APP_DATE', 'state', 'balloonVolumeM3', 'metarLayer', 'metarActive',
  'groundWindLayer', 'particleHeightAGL', 'particleHeightMaxAGL', 'lastHodographPath',
  'windProfileChart', 'btnCapture', 'lastCachedCenter', 'WORKER_APP_SECRET'
]);

// ---------- live DOM harness ----------
// A single, shared universal Proxy stub for Leaflet/Chart.js (handles any
// property/call/construct access by returning itself), plus the other
// browser-API stubs jsdom doesn't provide, refined over many rounds of
// real bugs found by using it.

function buildDom(html, { fetchMock } = {}) {
  const htmlWithScaleBarStubs = html.replace(
    '<body>',
    '<body><div id="scaleBarRuler"></div><div id="scaleBarEndLabel"></div><div id="scaleBarSeg1Label"></div><div id="scaleBarText"></div>'
  );
  const { VirtualConsole } = require('jsdom');
  const virtualConsole = new VirtualConsole();
  // Deliberately silent - CDN script/stylesheet loads are expected to fail
  // in this offline test context, and the app's own console.error/warn
  // calls are silenced separately inside beforeParse below. A real test
  // failure surfaces through a thrown error or a failed assertion, not
  // through console noise.
  const dom = new JSDOM(htmlWithScaleBarStubs, {
    url: 'https://bwicki.github.io/gasballoon_cockpit/',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      let universal;
      universal = new Proxy(function () {}, {
        get(target, prop) {
          if (prop === Symbol.toPrimitive) return (hint) => (hint === 'number' ? 10 : '');
          if (prop === 'then' || typeof prop === 'symbol') return undefined;
          return universal;
        },
        apply() { return universal; },
        construct() { return universal; },
      });
      window.L = universal;
      window.Chart = function () { return { destroy() {}, update() {} }; };
      window.html2canvas = () => Promise.resolve({});
      const dummyEl = () => window.document.createElement('div');
      const origGetById = window.document.getElementById.bind(window.document);
      window.document.getElementById = (id) => origGetById(id) || dummyEl();
      const origQuerySelector = window.document.querySelector.bind(window.document);
      window.document.querySelector = (sel) => origQuerySelector(sel) || dummyEl();
      const fake2dNoop = new Proxy({}, { get() { return () => ({}); } });
      window.HTMLCanvasElement.prototype.getContext = () => fake2dNoop;
      window.HTMLMediaElement.prototype.play = () => Promise.resolve();
      window.HTMLMediaElement.prototype.pause = () => {};
      window.fetch = fetchMock || (() => Promise.reject(new Error('no network in test')));
      // Silence expected noise (CDN load failures with no real network,
      // the app's own network-retry logging) - a real test failure still
      // surfaces via a thrown error or an assertion, not via console output.
      window.console.error = () => {};
      window.console.warn = () => {};
      window.console.log = () => {};
    },
  });
  return dom;
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function withDom(html, opts, fn) {
  const dom = buildDom(html, opts);
  await wait(800); // let boot() and its own setTimeouts settle
  try {
    return await fn(dom);
  } finally {
    dom.window.close();
  }
}

module.exports = {
  checkSyntax, checkMissingIds, checkDivBalance, checkTdz, KNOWN_SAFE_TDZ_SUSPECTS,
  buildDom, wait, withDom,
};
