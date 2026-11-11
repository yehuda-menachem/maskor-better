// עולם מבודד: קורא הגדרות מ-storage ומעביר לסקריפט הראשי (MAIN) באירוע
const send = (d) => window.dispatchEvent(new CustomEvent('mb-settings', { detail: JSON.stringify(d) }));
chrome.storage.sync.get(null, send);
chrome.storage.onChanged.addListener((ch, area) =>
  area === 'sync' && send(Object.fromEntries(Object.entries(ch).map(([k, v]) => [k, v.newValue]))));

// לוג: טבעת של 200 רשומות ב-storage.local. ponytail: כמה לשוניות במקביל דורסות זו את זו, מספיק לדיבוג.
let buf = [], t;
// טוענים את הלוג הקיים, אחרת כל רענון עמוד מוחק את ההיסטוריה
// מעל 200KB = שארית מלולאת v1.0 (לוג שגדל פי 2 בשנייה) -> זורקים, אחרת כל טעינה גוררת מגה-בייטים
chrome.storage.local.get('log', (r) => {
  const old = r.log || [];
  buf = JSON.stringify(old).length > 2e5 ? buf : [...old, ...buf].slice(-200);
});
window.addEventListener('mb-log', (e) => {
  // רק t+m, חתוך ל-300 תווים: רשומה לא יכולה לנפח את הלוג (כמו ב-v1.0)
  buf.push({ t: e.detail?.t, m: String(e.detail?.m).slice(0, 300), u: location.pathname });
  buf = buf.slice(-200);
  // throttle ולא debounce: עם debounce, לוג רציף (פחות משנייה בין רשומות) דחה את הכתיבה לנצח
  if (!t) t = setTimeout(() => { t = 0; try { chrome.storage.local.set({ log: buf }); } catch {} }, 1000); // try: התוסף נטען מחדש -> context invalidated
});
