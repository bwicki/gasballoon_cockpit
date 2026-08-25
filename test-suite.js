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

  console.log('\n=== Settings panel positioning ===');
  await withDom(html, {}, async (dom) => {
    const topbar = dom.window.document.getElementById('topbar');
    topbar.getBoundingClientRect = () => ({ top: 0, bottom: 44, left: 0, right: 800 });
    const btnSettings = dom.window.document.getElementById('btnSettings');
    btnSettings.getBoundingClientRect = () => ({ top: 5, bottom: 15, left: 700, right: 750 }); // sits partway inside the 44px header, not near its bottom
    btnSettings.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    const panelTop = parseFloat(dom.window.document.getElementById('settingsPanel').style.top);
    record('Settings panel never starts above the header\'s own bottom edge', panelTop >= 44, `panel top: ${panelTop}px, header bottom: 44px`);
  });

  console.log('\n=== Staged descent race condition ===');
  await withDom(html, {}, async (dom) => {
    dom.window.eval(`
      state.appMode='plan'; currentSubMode='staged';
      state.altAMSL=3000; state.groundElev=450;
      windAt = () => ({u:2, v:2});
      stagedMarker = {getLatLng: () => ({lat:47.30, lng:8.30})};
    `);
    const p1 = dom.window.computeStagedReachableArea();
    dom.window.eval('stagedMarker = {getLatLng: () => ({lat:47.50, lng:8.50})};');
    const p2 = dom.window.computeStagedReachableArea();
    await Promise.all([p1, p2]);
    const markerLat = dom.window.eval('state.stagedGridContext').markerLat;
    record('A second call arriving mid-flight waits for the FRESH result, not stale data from the position active when the first call started', markerLat === 47.5, `got markerLat=${markerLat}`);
  });

  console.log('\n=== Staged descent chart height (iPad fix) ===');
  await withDom(html, {}, async (dom) => {
    dom.window.eval(`
      state.altAMSL=3000; state.groundElev=450;
      windAt = () => ({u:2, v:2});
      stagedMarker = {getLatLng: () => ({lat:47.30, lng:8.30})};
      state.stagedMarkerT = 0;
    `);
    await dom.window.computeStagedReachableArea();
    const result = dom.window.searchStagedDescentToTarget(47.35, 8.40);
    const wrap = dom.window.document.getElementById('stagedPlanSvgWrap');
    Object.defineProperty(wrap, 'clientWidth', { value: 310, configurable: true });
    dom.window.drawStagedPlanChart(result);
    const svg = wrap.querySelector('svg');
    const heightAttr = svg ? parseInt(svg.getAttribute('height')) : null;
    const expected = Math.round(310 * (350/340));
    record('Chart SVG gets an explicit height attribute matching its rendered width (not left to browser intrinsic-sizing guesses)', heightAttr === expected, `got ${heightAttr}, expected ${expected}`);
  });

  console.log('\n=== SMS button removed, but still part of "all channels" ===');
  const btnGone = !html.includes('id="btnEmergencySms"');
  record('Standalone SMS button no longer exists in the HTML', btnGone);
  await withDom(html, {}, async (dom) => {
    const opened = [];
    dom.window.open = (url) => { opened.push(url); return {}; };
    dom.window.document.getElementById('cfgSmsRecipient1').value = '+41792223344';
    dom.window.document.getElementById('cfgPilotMobile').value = '+41791110000';
    dom.window.document.getElementById('emergencyMsgText').value = 'test';
    dom.window.document.getElementById('btnEmergencyAllChannels').click();
    const smsStillFires = opened.some(u => u.startsWith('sms:'));
    record('"Send on all channels" still includes SMS as one of its channels', smsStillFires, JSON.stringify(opened));
  });

  console.log('\n=== Emergency message title/body split ===');
  await withDom(html, {}, async (dom) => {
    dom.window.document.getElementById('cfgAircraftReg').value = 'HB-TEST';
    dom.window.openEmergencyMessage();
    const title = dom.window.document.getElementById('emergencyMsgTitleLine').textContent;
    const body = dom.window.document.getElementById('emergencyMsgBodyLines').textContent;
    const fullValue = dom.window.document.getElementById('emergencyMsgText').value;
    record('Title line shows the aircraft reg + EMERGENCY POSITION REPORT', title.includes('HB-TEST') && title.includes('EMERGENCY POSITION REPORT'), title);
    record('Body does not repeat the title line', !body.startsWith('HB-TEST EMERGENCY'), body.split('\n')[0]);
    record('Hidden textarea still holds the FULL message (title + body) for Copy/WhatsApp/SMS/Email to use', fullValue.startsWith(title) && fullValue.includes(body.split('\n')[0]||''), fullValue.slice(0,60));
  });

  console.log('\n=== Multiple emergency email recipients ===');
  await withDom(html, {}, async (dom) => {
    const opened = [];
    dom.window.open = (url) => { opened.push(url); return {}; };
    dom.window.document.getElementById('cfgEmergencyEmail').value = 'one@test.com';
    dom.window.document.getElementById('cfgEmergencyEmail2').value = 'two@test.com';
    dom.window.document.getElementById('cfgEmergencyEmail3').value = '';
    dom.window.document.getElementById('emergencyMsgText').value = 'test message';
    await dom.window.sendEmergencyEmail();
    const mailtoUrl = opened.find(u => u.startsWith('mailto:'));
    record('mailto: link includes both configured recipients, comma-separated', !!mailtoUrl && mailtoUrl.includes('one@test.com,two@test.com'), mailtoUrl);
  });

  console.log('\n=== EmailJS silent-send path: one call per recipient, not a comma-list ===');
  await withDom(html, {}, async (dom) => {
    const sendCalls = [];
    dom.window.emailjs = { send: (serviceId, templateId, params) => { sendCalls.push(params.to_email); return Promise.resolve({status:200}); } };
    dom.window.document.getElementById('cfgEmergencyEmail').value = 'one@test.com';
    dom.window.document.getElementById('cfgEmergencyEmail2').value = 'two@test.com';
    dom.window.document.getElementById('cfgEmailJsServiceId').value = 'svc';
    dom.window.document.getElementById('cfgEmailJsTemplateId').value = 'tpl';
    dom.window.document.getElementById('cfgEmailJsPublicKey').value = 'pub';
    dom.window.document.getElementById('emergencyMsgText').value = 'test message';
    await dom.window.sendEmergencyEmail();
    record('emailjs.send() called once per recipient (not once with a comma-list)', sendCalls.length === 2, JSON.stringify(sendCalls));
    record('Each call carries exactly one recipient address, no commas', sendCalls.every(v => !v.includes(',')), JSON.stringify(sendCalls));
    record('Both configured recipients are covered across the calls', sendCalls.includes('one@test.com') && sendCalls.includes('two@test.com'), JSON.stringify(sendCalls));
  });

  console.log('\n=== Profile file import (previously wired to nothing) ===');
  await withDom(html, {}, async (dom) => {
    let appliedWith = null;
    dom.window.eval('applyProfileData = (p) => { window.__appliedWith = p; };');
    const fakeFile = { text: () => Promise.resolve(JSON.stringify({data:{gblp_pilot_name:'Test Pilot'}})) };
    await dom.window.importProfileFromFile(fakeFile);
    const applied = dom.window.__appliedWith;
    record('Selecting a file actually invokes applyProfileData with its parsed contents', applied && applied.data && applied.data.gblp_pilot_name === 'Test Pilot', JSON.stringify(applied));
    const statusText = dom.window.document.getElementById('profileActionStatus').textContent;
    record('Status line confirms the import succeeded', statusText.includes('Imported'), statusText);

    // Invalid file (not JSON) should fail gracefully, not throw
    const badFile = { text: () => Promise.resolve('not valid json{{{') };
    let threw = false;
    try{ await dom.window.importProfileFromFile(badFile); }catch(e){ threw = true; }
    record('An invalid file does not throw - shows an error message instead', !threw && dom.window.document.getElementById('profileActionStatus').textContent.includes('⚠'));
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
