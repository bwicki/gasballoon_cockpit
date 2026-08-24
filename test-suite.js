#!/usr/bin/env node
// Gasballoon Cockpit - regression test suite
// Run this before every deployment: `node test-suite.js`
// Exits with code 0 if everything passes, 1 if anything fails.

const fs = require('fs');
const path = require('path');
const {
  checkSyntax, checkMissingIds, checkDivBalance, checkTdz, KNOWN_SAFE_TDZ_SUSPECTS,
  withDom, wait,
} = require('./test-helpers');

const INDEX_PATH = path.join(__dirname, 'index.html');
const html = fs.readFileSync(INDEX_PATH, 'utf8');

let passed = 0, failed = 0;
const failures = [];

function record(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name + (detail ? ' - ' + detail : '')); console.log(`  ✗ ${name}${detail ? ' - ' + detail : ''}`); }
}

async function main() {
  console.log('=== Static checks ===');
  const syntaxErrors = checkSyntax(html);
  record('Syntax valid', syntaxErrors.length === 0, syntaxErrors.join('; '));

  const missingIds = checkMissingIds(html);
  record('No missing element IDs', missingIds.length === 0, missingIds.join(', '));

  const divCheck = checkDivBalance(html);
  record('Div tags balanced', divCheck.balanced, divCheck.balanced ? '' : `unbalanced at line ${divCheck.problemLine}`);

  const tdz = checkTdz(html);
  record('Braces balanced', tdz.bracesBalanced);
  const newSuspects = tdz.suspects.filter(s => !KNOWN_SAFE_TDZ_SUSPECTS.has(s));
  record('No new TDZ suspects', newSuspects.length === 0, newSuspects.join(', '));

  console.log('\n=== Live boot ===');
  await withDom(html, {}, async (dom) => {
    // If boot() itself throws, this whole test fails - a bare page load
    // with no network at all should still reach a stable, non-crashed state.
    record('App boots without throwing', true);
  });

  console.log('\n=== Login flow ===');
  await withDom(html, {
    fetchMock: (url) => {
      const u = String(url);
      if (u.includes('workers.dev')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ users: { TST: 'test1234' }, flightProfiles: {} }) });
      }
      return Promise.reject(new Error('no mock for: ' + u));
    },
  }, async (dom) => {
    dom.window.document.getElementById('gateUserCode').value = 'TST';
    dom.window.document.getElementById('gatePw').value = 'test1234';
    await dom.window.checkGatePassword();
    const gateHidden = dom.window.document.getElementById('passwordGate').style.display === 'none';
    record('Correct credentials unlock the gate', gateHidden);
  });

  await withDom(html, {
    fetchMock: (url) => {
      const u = String(url);
      if (u.includes('workers.dev')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ users: { TST: 'test1234' }, flightProfiles: {} }) });
      }
      return Promise.reject(new Error('no mock for: ' + u));
    },
  }, async (dom) => {
    dom.window.document.getElementById('gateUserCode').value = 'TST';
    dom.window.document.getElementById('gatePw').value = 'WRONGPASSWORD';
    await dom.window.checkGatePassword();
    const gateStillShown = dom.window.document.getElementById('passwordGate').style.display !== 'none';
    record('Wrong password does NOT unlock the gate', gateStillShown);
  });

  console.log('\n=== New flight profile creation ===');
  await withDom(html, {
    fetchMock: (() => {
      let store = { users: { TST: 'test1234' }, flightProfiles: {} };
      return (url, opts) => {
        const u = String(url);
        if (!u.includes('workers.dev')) return Promise.reject(new Error('no mock for: ' + u));
        if (opts && opts.method === 'PUT') { store = JSON.parse(opts.body); return Promise.resolve({ ok: true, text: () => Promise.resolve('OK') }); }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(store) });
      };
    })(),
  }, async (dom) => {
    dom.window.document.getElementById('gateUserCode').value = 'TST';
    dom.window.document.getElementById('gatePw').value = 'test1234';
    dom.window.document.getElementById('gateProfileName').value = 'ALPHA';
    dom.window.document.getElementById('gateProfilePin').value = '123456';
    await dom.window.startNewFlightProfileAtLogin();
    const footer = dom.window.document.getElementById('footerFlightProfile').textContent;
    record('New profile becomes active and shows in footer', footer.includes('ALPHA'), footer);
  });

  console.log('\n=== Emergency channels ===');
  await withDom(html, {}, async (dom) => {
    const opened = [];
    dom.window.open = (url) => { opened.push(url); return {}; };
    dom.window.document.getElementById('cfgPilotMobile').value = '+41791110000';
    dom.window.document.getElementById('cfgSmsRecipient1').value = '+41792223344';
    dom.window.document.getElementById('emergencyMsgText').value = 'test';
    dom.window.sendEmergencyWhatsapp();
    const hasRecipient = opened.some(u => u.includes('41792223344'));
    const noPilotNumber = !opened.some(u => u.includes('41791110000'));
    record('WhatsApp messages the recipient, not the pilot', hasRecipient && noPilotNumber, JSON.stringify(opened));
  });

  console.log('\n=== Settings save-prompt ===');
  await withDom(html, {}, async (dom) => {
    dom.window.eval('state.currentFlightProfile = null;');
    dom.window.showSettingsSavePrompt();
    const hiddenWhenNoProfile = dom.window.document.getElementById('settingsSaveToExistingBtn').style.display === 'none';
    dom.window.eval('state.currentFlightProfile = "ALPHA";');
    dom.window.showSettingsSavePrompt();
    const shownWhenProfileActive = dom.window.document.getElementById('settingsSaveToExistingBtn').style.display === 'block';
    record('"Existing profile" option only shown when one is active', hiddenWhenNoProfile && shownWhenProfileActive);
  });

  console.log('\n=== APRS via worker proxy ===');
  await withDom(html, {
    fetchMock: (url, opts) => {
      const u = String(url);
      if (u.includes('workers.dev/aprs')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ result: 'ok', entries: [{ name: 'HB3XAD-11', lat: '47.1', lng: '8.5', symbol: 'O', lasttime: Math.floor(Date.now()/1000) }] }) });
      }
      return Promise.reject(new Error('no mock for: ' + u));
    },
  }, async (dom) => {
    dom.window.eval('aprsActive = true;');
    dom.window.document.getElementById('sAprsApiKey').value = 'testkey123';
    dom.window.document.getElementById('sAprsCallsigns').value = 'HB3XAD-11';
    let capturedUrl = null, capturedSecret = null;
    const origFetch = dom.window.fetch;
    dom.window.fetch = (url, opts) => {
      if (String(url).includes('/aprs')) { capturedUrl = String(url); capturedSecret = opts && opts.headers && opts.headers['X-App-Secret']; }
      return origFetch(url, opts);
    };
    await dom.window.fetchAprsStations();
    record('APRS request goes through the worker, not api.aprs.fi directly', !!capturedUrl && capturedUrl.includes('workers.dev/aprs'), capturedUrl);
    record('APRS request includes the app secret header', !!capturedSecret);
    record('APRS request includes the callsign and user-provided key', capturedUrl && capturedUrl.includes('HB3XAD-11') && capturedUrl.includes('testkey123'));
  });

  console.log('\n=== Recently used flight profiles ===');
  await withDom(html, {
    fetchMock: (() => {
      let store = { users: { TST: 'test1234' }, flightProfiles: {} };
      return (url, opts) => {
        const u = String(url);
        if (!u.includes('workers.dev')) return Promise.reject(new Error('no mock for: ' + u));
        if (opts && opts.method === 'PUT') { store = JSON.parse(opts.body); return Promise.resolve({ ok: true, text: () => Promise.resolve('OK') }); }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(store) });
      };
    })(),
  }, async (dom) => {
    // Pre-seed localStorage as if GAMMA and BETA were used in earlier sessions
    dom.window.localStorage.setItem('gblp_recent_profiles_v1', JSON.stringify(['GAMMA', 'BETA']));
    dom.window.document.getElementById('gateUserCode').value = 'TST';
    dom.window.document.getElementById('gatePw').value = 'test1234';
    dom.window.document.getElementById('gateProfileName').value = 'ALPHA';
    dom.window.document.getElementById('gateProfilePin').value = '123456';
    await dom.window.startNewFlightProfileAtLogin();
    const stored = JSON.parse(dom.window.localStorage.getItem('gblp_recent_profiles_v1'));
    record('Newly created profile is added to the front of the recent list', stored[0] === 'ALPHA', JSON.stringify(stored));
    record('Recent list stays capped at 3 entries', stored.length <= 3, JSON.stringify(stored));
    dom.window.renderRecentProfileChips('gateRecentProfiles', 'gateProfileName');
    const chips = dom.window.document.querySelectorAll('#gateRecentProfiles .recent-profile-chip');
    record('Chips are rendered for each recent profile', chips.length === stored.length, `${chips.length} chips for ${stored.length} entries`);
    if (chips.length) {
      dom.window.document.getElementById('gateProfileName').value = '';
      chips[0].dispatchEvent(new dom.window.Event('click', { bubbles: true }));
      const filledName = dom.window.document.getElementById('gateProfileName').value;
      record('Clicking a chip fills the name field (not the PIN)', filledName === stored[0], filledName);
    }
  });

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log('  - ' + f));
    process.exit(1);
  }
  process.exit(0);
}

main().catch(e => { console.error('Test suite itself crashed:', e); process.exit(1); });
