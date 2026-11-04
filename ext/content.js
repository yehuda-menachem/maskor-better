(() => {
  'use strict';
  // ===== לוג (נשמר ע"י bridge.js; בלי נתוני עובדים/מעסיקים, רק מבנה ופעולות) =====
  const RealDate = Date; // לפני ה-Proxy, כדי שהלוג יקבל זמן אמיתי
  const log = (m) => window.dispatchEvent(new CustomEvent('mb-log', { detail: { t: RealDate.now(), m } }));
  // ===== הגדרות (מתעדכנות חי מהחלונית דרך bridge.js) =====
  const DEFAULTS = { lock: true, year: 2025, month: 12, fixFocus: true, enterNav: true, autoFocus: true, hideNotice: true };
  const cfg = { ...DEFAULTS };
  // cache סינכרוני: ההגדרות מ-storage מגיעות אסינכרונית, אחרי שהאתר כבר חישב תקופה עם ברירת המחדל
  try { Object.assign(cfg, JSON.parse(localStorage.getItem('mb-cfg'))); } catch {}
  window.addEventListener('mb-settings', (e) => {
    Object.assign(cfg, e.detail);
    try { localStorage.setItem('mb-cfg', JSON.stringify(cfg)); } catch {}
  });
  const DAY = 21; // יום >=21 => האתר לא יחזור חודש אחורה

  // ===== 1. נעילת תאריך =====
  // השעון מתקדם מהתאריך הנעול ולא קפוא: קוד שמודד זמן שעבר (אנימציות jQuery, timeouts, polling)
  // היה רץ לנצח עם Date.now קפוא -> CPU מלא ותקיעות. ponytail: אחרי ~9 ימים פתוחים עובר לחודש הבא.
  const T0 = RealDate.now();
  let _k, _v;
  const fixedTs = () => {
    const k = cfg.year * 100 + cfg.month; // cache: לא בונים Date בכל קריאה
    if (k !== _k) (_k = k, _v = new RealDate(cfg.year, cfg.month - 1, DAY, 12).getTime());
    return _v + RealDate.now() - T0;
  };
  function FakeDate(...a) {
    if (!new.target) return new RealDate(cfg.lock ? fixedTs() : RealDate.now()).toString();
    return a.length ? new RealDate(...a) : cfg.lock ? new RealDate(fixedTs()) : new RealDate();
  }
  FakeDate.prototype = RealDate.prototype; // instanceof ממשיך לעבוד
  Object.setPrototypeOf(FakeDate, RealDate); // parse / UTC בירושה
  FakeDate.now = () => (cfg.lock ? fixedTs() : RealDate.now());
  window.Date = FakeDate;

  // ===== 2. תיקון גניבת פוקוס: handler של האתר הוא onmousemove על td[tabindex] =====
  // listener ב-capture רץ לפניו; חוסמים כשיש פוקוס בשדה קלט.
  window.addEventListener('mousemove', (e) => {
    const a = document.activeElement;
    if (cfg.fixFocus && a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && e.target.closest?.('td[tabindex]'))
      e.stopImmediatePropagation();
  }, true);

  // ===== עזרים =====
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const shemInput = () => $('input[id$="-SHEM"]');
  const firstEmployer = () => $('td[id^="MS-SHEM-"]');
  const workersBtn = () => document.getElementById('עובדים');
  const isEmployers = () => !!firstEmployer();
  const isWorkers = () => !!$('td[id^="WS-"]');

  async function waitFor(check, timeout = 4000) {
    const t0 = RealDate.now(); // לא Date.now: כשהנעילה פעילה הוא קפוא -> לולאה אינסופית
    while (RealDate.now() - t0 < timeout) { if (check()) return true; await sleep(30); }
    return false;
  }

  // שדה חיפוש לפי טקסט כותרת העמודה (מזהי העמודות דינמיים)
  function filterByHeader(text) {
    const tbl = [...document.querySelectorAll('input[placeholder="תיבת חיפוש"]')]
      .map((i) => i.closest('table')).find((t) => t && t.rows.length === 2);
    if (!tbl) return null;
    const idx = [...tbl.rows[0].cells].findIndex(
      (c) => c.textContent.replace(/[▲▼\s]/g, '') === text.replace(/\s/g, ''));
    return idx < 0 ? null : tbl.rows[1].cells[idx].querySelector('input');
  }

  // הסתרת ההסבר לפי תוכן (ה-div הפנימי ביותר)
  // רץ בכל scan (כל 150ms בזמן שינויי DOM): textContent על כל div היה ריבועי + offsetParent כפה layout.
  // XPath על צמתי טקסט = מעבר אחד native. ponytail: אם הטקסט מפוצל בין תגיות - לא יימצא.
  function hideNotice() {
    if (!cfg.hideNotice) return;
    const r = document.evaluate("//*[@id='CDV']//text()[contains(., 'זוהי רשימת העובדים')]",
      document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (let i = 0; i < r.snapshotLength; i++) {
      const d = r.snapshotItem(i).parentElement?.closest('div');
      if (d && d.style.display !== 'none') d.style.display = 'none';
    }
  }

  // ===== 3. שנה/חודש: אחרי שינוי שנה האתר מאפס חודש ל-1 ובונה את הבוררים מחדש =====
  function findPeriod() {
    const ss = [...document.querySelectorAll('select')].filter((s) => s.offsetParent);
    return {
      year: ss.find((s) => s.options.length && [...s.options].every((o) => /^\d{4}$/.test(o.value))),
      // לא דורשים 12: בשנה הנוכחית ייתכנו פחות חודשים
      month: ss.find((s) => s.options.length && [...s.options].every((o) => /^\d+\/\d{4}$/.test(o.text))),
    };
  }

  document.addEventListener('change', async (e) => {
    if (!cfg.lock || !e.isTrusted) return; // רק שינוי של המשתמש
    const t = e.target;
    if (t.tagName !== 'SELECT' || !t.options.length ||
        ![...t.options].every((o) => /^\d{4}$/.test(o.value))) return;
    const y = t.value;
    const ok = await waitFor(() => {
      const m = findPeriod().month;
      return m && m.options[0].text.endsWith('/' + y);
    });
    const m = ok && findPeriod().month;
    if (!m) log('שגיאה: בורר חודש חדש לא הופיע אחרי שינוי שנה ' + y);
    // לפי טקסט האופציה ("12/2025"), לא לפי value שהפורמט שלו לא ידוע
    const o = m && [...m.options].find((o) => parseInt(o.text, 10) === cfg.month);
    if (m && !o) log('שגיאה: חודש ' + cfg.month + ' לא קיים בשנה ' + y);
    if (o && !o.selected) {
      log('שנה ' + y + ': מחזיר חודש ל-' + cfg.month);
      o.selected = true;
      m.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, true);

  // ===== 4. Enter = מעסיק ראשון → עובדים, ופוקוס אוטומטי =====
  function init() {
    let last = null;
    const scan = () => {
      const [screen, get] = isEmployers() ? ['employers', shemInput]
                          : isWorkers() ? ['workers', () => filterByHeader('שם פרטי')] : [null];
      if (screen === 'workers') hideNotice(); // גם כשנכנסים לעובדים בלחיצה ידנית, לא רק ב-Enter
      if (screen === last) return;
      last = screen;
      log('מסך: ' + (screen || 'אחר'));
      if (screen && cfg.autoFocus) setTimeout(() => {
        const el = get();
        if (!el) log('שגיאה: שדה חיפוש לא נמצא במסך ' + screen);
        if (el && document.activeElement !== el) el.focus();
      }, 60);
    };
    // debounce: האתר משנה DOM בהמוניו; סריקה סינכרונית בכל batch האטה אותו
    let timer = 0;
    new MutationObserver(() => { if (!timer) timer = setTimeout(() => { timer = 0; scan(); }, 150); })
      .observe(document.body, { childList: true, subtree: true });

    let busy = false;
    document.addEventListener('keydown', async (e) => {
      if (!cfg.enterNav || e.key !== 'Enter' || busy || e.repeat || e.isComposing || !isEmployers()) return;
      if (/^(TEXTAREA|BUTTON|SELECT|A)$/.test(e.target.tagName)) return; // לא לחטוף Enter מכפתורים/שדות אחרים
      e.preventDefault();
      busy = true;
      try { await openFirst(); } finally { busy = false; }
    }, true);

    async function openFirst() {
      log('Enter: פותח מעסיק ראשון');
      firstEmployer().click();
      // לחיצה על מעסיק בד"כ פותחת ישר את העובדים; אם לא - לוחצים על "עובדים"
      if (!(await waitFor(isWorkers, 700))) {
        log('רשימת עובדים לא נפתחה לבד, לוחץ על "עובדים"');
        if (!(await waitFor(() => !isEmployers() && workersBtn()))) return log('שגיאה: כפתור "עובדים" לא נמצא');
        workersBtn().click();
        if (!(await waitFor(isWorkers))) return log('שגיאה: רשימת עובדים לא נטענה');
      }
      hideNotice(); setTimeout(hideNotice, 300);
    }
  }

  // ===== שגיאות ולאגים: כל שגיאה ייחודית פעם אחת לעמוד (ponytail: עד 30, מספיק לדיבוג) =====
  const seen = new Set();
  const logErr = (kind, err, where) => {
    const msg = String(err?.message ?? err).slice(0, 200);
    if (seen.has(msg) || seen.size >= 30) return;
    seen.add(msg);
    // שורת stack ראשונה מצביעה על המקור; content.js = שגיאה שלנו, אחרת של האתר
    const at = where || (err?.stack || '').split('\n').find((l) => /:\d+:\d+/.test(l))?.trim().replace(/\)$/, '') || '';
    log(`שגיאה (${kind}): ${msg}${at ? ' @ ' + at.split('/').pop() : ''}`);
  };
  window.addEventListener('error', (e) =>
    logErr('JS', e.error || e.message, e.error ? '' : (e.filename || '').split('/').pop() + ':' + e.lineno));
  window.addEventListener('unhandledrejection', (e) => logErr('Promise', e.reason));
  // לאג: משימה שחוסמת את הדף מעל 300ms. ponytail: מצרפים פעם ב-10ש', מספיק כדי לראות מתי נתקע
  let lagMax = 0, lagN = 0, lagT = 0;
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.duration > 300) (lagN++, lagMax = Math.max(lagMax, e.duration));
      if (lagN && !lagT) lagT = setTimeout(() => {
        log(`לאג: ${lagN} חסימות, הארוכה ${Math.round(lagMax)}ms`);
        lagN = lagMax = lagT = 0;
      }, 10000);
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  log('התוסף נטען');
  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
