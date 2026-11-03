const D = { lock: true, year: 2025, month: 12, fixFocus: true, enterNav: true, autoFocus: true, hideNotice: true };
const $ = (id) => document.getElementById(id);
const fill = (el, vals, label = (v) => v) =>
  vals.forEach((v) => el.add(new Option(label(v), v)));
fill($('month'), [...Array(12)].map((_, i) => i + 1), (m) =>
  new Date(2000, m - 1).toLocaleString('he', { month: 'long' }));
fill($('year'), [...Array(11)].map((_, i) => 2026 - i));

chrome.storage.sync.get(D, (s) => {
  for (const k in D) {
    const el = $(k);
    el.type === 'checkbox' ? (el.checked = s[k]) : (el.value = s[k]);
    el.onchange = () => {
      const v = el.type === 'checkbox' ? el.checked : +el.value;
      chrome.storage.sync.set({ [k]: v });
      sync();
    };
  }
  sync();
});
const sync = () => $('lockSec').classList.toggle('off', !$('lock').checked);

$('copyLog').onclick = async () => {
  const { log = [] } = await chrome.storage.local.get('log');
  const m = chrome.runtime.getManifest();
  const head = `משכורשת+ v${m.version} | ${navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0]}\n` +
    `הגדרות: ${JSON.stringify(await chrome.storage.sync.get(D))}\n`;
  const lines = log.map((r) =>
    `${new Date(r.t).toLocaleTimeString('he-IL')} ${r.u} ${r.m}${r.d ? ' ' + JSON.stringify(r.d) : ''}`);
  await navigator.clipboard.writeText(head + (lines.join('\n') || '(הלוג ריק)'));
  $('copyLog').textContent = 'הועתק ✓';
  setTimeout(() => ($('copyLog').textContent = 'העתק לוג'), 1500);
};
