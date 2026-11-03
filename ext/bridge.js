// עולם מבודד: קורא הגדרות מ-storage ומעביר לסקריפט הראשי (MAIN) באירוע
const send = (d) => window.dispatchEvent(new CustomEvent('mb-settings', { detail: d }));
chrome.storage.sync.get(null, send);
chrome.storage.onChanged.addListener((ch, area) =>
  area === 'sync' && send(Object.fromEntries(Object.entries(ch).map(([k, v]) => [k, v.newValue]))));

// לוג: טבעת של 200 רשומות ב-storage.local. ponytail: כמה לשוניות במקביל דורסות זו את זו, מספיק לדיבוג.
let buf = [], t;
// טוענים את הלוג הקיים, אחרת כל רענון עמוד מוחק את ההיסטוריה
chrome.storage.local.get('log', (r) => { buf = [...(r.log || []), ...buf].slice(-200); });
window.addEventListener('mb-log', (e) => {
  buf.push({ ...e.detail, u: location.pathname });
  buf = buf.slice(-200);
  clearTimeout(t); t = setTimeout(() => { try { chrome.storage.local.set({ log: buf }); } catch {} }, 1000); // try: התוסף נטען מחדש -> context invalidated // debounce כתיבה
});
