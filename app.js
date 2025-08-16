
const $ = (s) => document.querySelector(s);
const byId = (id) => document.getElementById(id);
const fields = {
  location: byId('location'),
  shift: byId('shift'),
  workType: byId('workType'),
  fullName: byId('fullName'),
  nationalId: byId('nationalId'),
  phone: byId('phone')
};
const msgs = {
  location: byId('location-msg'),
  shift: byId('shift-msg'),
  fullName: byId('fullName-msg'),
  nationalId: byId('nationalId-msg'),
  phone: byId('phone-msg')
};

const btnCheckIn = byId('btnCheckIn');
const btnCheckOut = byId('btnCheckOut');
const btnEarlyCheckout = byId('btnEarlyCheckout');
const btnEarlyConfirm = byId('btnEarlyConfirm');
const btnEarlyCancel = byId('btnEarlyCancel');

const CONFIG = window.SANAM_CONFIG || {};
const WEB_APP_URL = CONFIG.WEB_APP_URL || "https://script.google.com/macros/s/AKfycbw2UP_bwMIDzoGGzS_ZKYGg5P6tyEtIUeMMmkjlVliEux_ieysatF-vjNfdd7yVSELJ/exec";
const BYPASS_FOR_LOCAL_FILE = (window.location.protocol === 'file:');

// Helpers
function setMsg(el, msg, type = 'error') {
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'msg' + (msg ? ' ' + type : '');
}
function markValid(i, ok) {
  i.classList.remove('invalid', 'valid');
  i.classList.add(ok ? 'valid' : 'invalid');
}
function onlyDigits(s) {
  return (s || '').replace(/\D+/g, '');
}
function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function setBusy(el, busy=true) {
  if (!el) return;
  el.disabled = !!busy;
  el.classList.toggle('is-busy', !!busy);
}

/* ===================== Arabic name normalization ===================== */
function normalizeArabicNameLive(str) {
  if (!str) return '';
  str = str.replace(/[\u0640\u0610-\u061A\u064B-\u065F\u06D6-\u06ED]/g, '');
  str = str.replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627').replace(/[\u0649\u06CC]/g, '\u064A');
  str = str.replace(/[\s\u00A0]+/g, ' ');
  str = str.replace(/[^\u0600-\u06FF ]/g, '');

  const hasTrailingSpace = / $/.test(str);
  str = str.replace(/ {2,}/g, ' ');
  if (str.startsWith(' ')) str = str.replace(/^ +/, '');
  if (hasTrailingSpace && str.length && !str.endsWith(' ')) str += ' ';
  return str;
}
function normalizeArabicNameFinal(str) {
  return (str || '')
    .replace(/[\u0640\u0610-\u061A\u064B-\u065F\u06D6-\u06ED]/g, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/[\u0649\u06CC]/g, '\u064A')
    .replace(/[\s\u00A0]+/g, ' ')
    .replace(/[^\u0600-\u06FF ]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/* ===================== Validators ===================== */
function validateFullName() {
  const i = fields.fullName;
  i.value = normalizeArabicNameFinal(i.value);
  const ok = /^[\u0600-\u06FF]+( [\u0600-\u06FF]+){3}$/.test(i.value);
  markValid(i, ok);
  setMsg(
    msgs.fullName,
    ok ? '✅ الاسم صحيح (أربع كلمات بالعربية).'
       : 'الرجاء كتابة الاسم الرباعي بالعربية فقط (أربع كلمات).',
    ok ? 'success' : 'error'
  );
  return ok;
}
function validateNationalId() {
  const i = fields.nationalId;
  i.value = onlyDigits(i.value).slice(0, 10);
  const ok = /^\d{10}$/.test(i.value);
  markValid(i, ok);
  setMsg(msgs.nationalId, ok ? '✅ الهوية مكونة من 10 أرقام.' : 'رقم الهوية يجب أن يكون 10 أرقام بدون رموز.', ok ? 'success' : 'error');
  return ok;
}
function validatePhone() {
  const i = fields.phone;
  i.value = onlyDigits(i.value).slice(0, 10);
  const ok = /^05\d{8}$/.test(i.value);
  markValid(i, ok);
  setMsg(msgs.phone, ok ? '✅ رقم الجوال يبدأ بـ 05 وطوله 10 أرقام.' : 'يرجى إدخال رقم بصيغة 05XXXXXXXX (10 أرقام).', ok ? 'success' : 'error');
  return ok;
}
function validateLocation() {
  const ok = !!fields.location.value;
  markValid(fields.location, ok);
  setMsg(msgs.location, ok ? '' : 'الرجاء اختيار الموقع.');
  return ok;
}
function validateShift() {
  const ok = !!fields.shift.value;
  markValid(fields.shift, ok);
  setMsg(msgs.shift, ok ? '' : 'الرجاء اختيار الوردية.');
  return ok;
}
function formValid() {
  return [validateLocation(), validateShift(), validateFullName(), validateNationalId(), validatePhone()].every(Boolean);
}

/* ===================== Time utils ===================== */
// دقائق الآن بتوقيت الرياض (حساب داخلي 24h لكي يبقى دقيق)
function riyadhMinutesNow() {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date());
  const h = Number(p.find(x => x.type === 'hour').value);
  const m = Number(p.find(x => x.type === 'minute').value);
  return h * 60 + m;
}

// تحويل 12h مع AM/PM أو ص/م إلى دقائق 0..1439
function hhmm12ToMinutes(hh, mm, ap) {
  let h = Number(hh), m = Number(mm);
  const ampm = String(ap || '').trim().toLowerCase();
  const isPM = ['pm','p.m','p','م'].includes(ampm) || /م\b/.test(ampm);
  const isAM = ['am','a.m','a','ص'].includes(ampm) || /ص\b/.test(ampm);
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  return (h % 24) * 60 + m;
}

// يدعم:
// "8:00 AM-4:00 PM" / "8:00 ص - 4:00 م" / "08:00-16:00"
function parseShiftRange(v) {
  v = String(v || '').trim();

  // نمط 12h مع AM/PM أو ص/م
  const re12 = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM|am|pm|[صم])\s*[-–]\s*(\d{1,2}):(\d{2})\s*(AM|PM|am|pm|[صم])\s*$/;
  const m12 = v.match(re12);
  if (m12) {
    const [, sh, sm, sap, eh, em, eap] = m12;
    return { start: hhmm12ToMinutes(sh, sm, sap), end: hhmm12ToMinutes(eh, em, eap) };
    }

  // نمط 24h تقليدي
  const re24 = /^\s*(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})\s*$/;
  const m24 = v.match(re24);
  if (m24) {
    const [, sh, sm, eh, em] = m24.map(Number);
    return { start: sh * 60 + sm, end: eh * 60 + em };
  }

  // فشل
  return { start: 0, end: 0 };
}

// عرض وقت 12h (للاستخدام في الرسائل عند الحاجة)
function minutesTo12h(mins) {
  mins = ((mins % 1440) + 1440) % 1440;
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const isPM = h >= 12;
  const h12 = (h % 12) || 12;
  const ap = isPM ? 'م' : 'ص';
  return `${h12}:${String(m).padStart(2,'0')} ${ap}`;
}

const EARLY_ALLOW_MIN = 5, ONTIME_GRACE_MIN = 5;

function inWindow(now, start, end) {
  const allowedStart = (start - EARLY_ALLOW_MIN + 1440) % 1440;
  if (end >= start) {
    if (allowedStart <= start) {
      return now >= allowedStart && now < end;
    } else {
      return (now >= allowedStart && now < 1440) || (now >= 0 && now < end);
    }
  } else {
    if (allowedStart <= start) {
      return (now >= allowedStart && now < 1440) || (now >= 0 && now < end);
    } else {
      return (now >= allowedStart || now < end);
    }
  }
}

// حالات بالعربي
function shiftStatus(now, start) {
  if (now < start) return { type: 'مبكر', minutes: start - now };
  if (now <= start + ONTIME_GRACE_MIN) return { type: 'في الوقت', minutes: now - start };
  return { type: 'متأخر', minutes: now - start };
}

function updateShiftState() {
  const v = fields.shift.value;
  if (!v) { setMsg(msgs.shift, 'الرجاء اختيار الوردية.'); return false; }
  const { start, end } = parseShiftRange(v);
  const now = riyadhMinutesNow();
  if (!inWindow(now, start, end)) { 
    setMsg(msgs.shift, `اختر الوقت الصحيح لدوامك. (نافذة الدوام: ${minutesTo12h(start)} → ${minutesTo12h(end)})`); 
    return false; 
  }
  const st = shiftStatus(now, start);
  let t = '', kind = 'success';
  if (st.type === 'مبكر') {
    t = `⏳ مبكر بـ ${st.minutes} دقيقة (يُسمح حتى ${EARLY_ALLOW_MIN}).`;
    kind = st.minutes <= EARLY_ALLOW_MIN ? 'success' : 'error';
  } else if (st.type === 'في الوقت') {
    t = st.minutes === 0 ? '✅ على الوقت تمامًا.' : `✅ ضمن مهلة ${ONTIME_GRACE_MIN} دقائق.`;
  } else {
    t = `⏱ متأخر بـ ${st.minutes} دقيقة.`;
    kind = 'error';
  }
  setMsg(msgs.shift, t, kind);
  return true;
}

/* ===================== Live input + events ===================== */
fields.fullName.addEventListener('input', () => {
  const el = fields.fullName;
  const before = el.value;
  const after = normalizeArabicNameLive(before);
  if (after !== before) {
    const posEnd = after.length;
    el.value = after;
    try { el.setSelectionRange(posEnd, posEnd); } catch {}
  }
  msgs.fullName && setMsg(msgs.fullName, '');
  el.classList.remove('invalid', 'valid');
});
fields.fullName.addEventListener('blur', validateFullName);

fields.nationalId.addEventListener('input', validateNationalId);
fields.phone.addEventListener('input', validatePhone);
fields.location.addEventListener('change', validateLocation);
fields.shift.addEventListener('change', () => { validateShift(); updateShiftState(); });
setInterval(() => { if (fields.shift.value) updateShiftState(); }, 60 * 1000);

/* ===================== Geofence ===================== */
const LOCATIONS = {
  "النسيم 1": { lat: 21.381115689864014, lon: 39.87005086015681, radius: 50 },
  "النسيم 4": { lat: 21.383055291801348, lon: 39.871809482514266, radius: 100 },
  "test1":    { lat: 21.3818252,          lon: 39.8817189,          radius: 500 },
  "Amany":    { lat: 21.353332012296036,  lon: 39.83317700978527,   radius: 100 },
  "Mohammed": { lat: 21.358667827435426,  lon: 39.91056507116383,   radius: 50 },
  "Ahmad":    { lat: 21.547709791439225,  lon: 39.14679219068816,   radius: 100 }
};
function toRad(d) { return d * Math.PI / 180; }
function haversineMeters(a, b, c, d) {
  const R = 6371000;
  const dLat = toRad(c - a), dLon = toRad(d - b);
  const m = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLon / 2) ** 2;
  const k = 2 * Math.atan2(Math.sqrt(m), Math.sqrt(1 - m));
  return R * k;
}
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('خدمة تحديد المواقع غير مدعومة.'));
    navigator.geolocation.getCurrentPosition(
      p => resolve(p),
      e => reject(e),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}
async function validateGeofence() {
  if (BYPASS_FOR_LOCAL_FILE) { setMsg(msgs.location, '🔧 وضع اختبار محلي: تم تخطي GPS (يعمل كامل عبر HTTPS).', 'success'); return true; }
  const key = fields.location.value;
  if (!key) { setMsg(msgs.location, 'الرجاء اختيار الموقع.'); return false; }
  const spec = LOCATIONS[key];
  if (!spec) { setMsg(msgs.location, 'الموقع غير معروف في النظام.'); return false; }
  try {
    const pos = await getPosition();
    const { latitude, longitude, accuracy } = pos.coords;
    const dist = Math.round(haversineMeters(latitude, longitude, spec.lat, spec.lon));
    const inside = dist <= spec.radius;
    if (!inside) {
      setMsg(msgs.location, `أنت خارج النطاق المحدد للموقع (المسافة ${dist}م / المسموح ${spec.radius}م).`, 'error');
      return false;
    }
    setMsg(msgs.location, `✅ داخل النطاق. المسافة ~${dist}م. دقة GPS ~${Math.round(accuracy || 0)}م.`, 'success');
    return true;
  } catch (err) {
    let m = 'تعذر الوصول إلى موقعك. تأكد من تفعيل خدمة تحديد المواقع.';
    if (err && err.code === 1) m = 'تم رفض الإذن للوصول إلى الموقع. فعّل إذن الموقع.';
    else if (err && err.code === 3) m = 'انتهت مهلة الحصول على الموقع. حاول مجددًا.';
    setMsg(msgs.location, m, 'error');
    return false;
  }
}

/* ===================== 8 hours throttle (لكل رقم هوية) ===================== */
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
function lastActionKey() {
  const nid = fields.nationalId.value || 'unknown';
  return 'sanam_last_action_' + nid;
}
function canDoAction() {
  try {
    const t = Number(localStorage.getItem(lastActionKey()) || '0');
    if (!t) return true;
    return (Date.now() - t) >= EIGHT_HOURS_MS;
  } catch (_) { return true; }
}
function stampAction() {
  try { localStorage.setItem(lastActionKey(), String(Date.now())); } catch (_) {}
}

/* ===================== Dialog (تذكير) ===================== */
const reminderBackdrop = byId('reminderBackdrop');
const reminderClose = byId('reminderClose');
function showReminder() { if (reminderBackdrop) { reminderBackdrop.style.display = 'flex'; reminderBackdrop.setAttribute('aria-hidden', 'false'); } }
function hideReminder() { if (reminderBackdrop) { reminderBackdrop.style.display = 'none'; reminderBackdrop.setAttribute('aria-hidden', 'true'); } }
if (reminderClose) { reminderClose.addEventListener('click', hideReminder); }
if (reminderBackdrop) {
  reminderBackdrop.addEventListener('click', (e) => { if (e.target === reminderBackdrop) hideReminder(); });
}

/* ===================== Early checkout panel ===================== */
const earlyPanel = byId('earlyPanel');
const earlyReason = byId('earlyReason');
const earlyPhoto = byId('earlyPhoto');

if (btnEarlyCheckout) {
  btnEarlyCheckout.addEventListener('click', () => {
    earlyPanel.style.display = 'block';
    earlyPanel.setAttribute('aria-hidden', 'false');
  });
}
if (btnEarlyCancel) {
  btnEarlyCancel.addEventListener('click', () => {
    earlyPanel.style.display = 'none';
    earlyPanel.setAttribute('aria-hidden', 'true');
    earlyReason.value = '';
    earlyPhoto.value = '';
  });
}

/* ===================== Checkout window (ساعة بعد النهاية) ===================== */
function minutesDiffWrap(a, b) { return (a - b + 1440) % 1440; }
function withinCheckoutWindow(now, start, end) {
  const diff = minutesDiffWrap(now, end);
  return diff >= 0 && diff < 60;
}

/* ===================== Send ===================== */
async function sendRecord(actionArabic, extra = {}) {
  if (!WEB_APP_URL) { alert('لم يتم ضبط رابط Web App.'); throw new Error('WEB_APP_URL missing'); }
  let imageBase64 = '';
  if (extra.file) { imageBase64 = await fileToDataURL(extra.file); }

  const payload = {
    action: actionArabic, // عربي: "تسجيل حضور" / "تسجيل انصراف" / "انصراف مبكر"
    location: fields.location.value || '',
    shift: fields.shift.value || '',
    workType: fields.workType.value || '',
    fullName: fields.fullName.value || '',
    nationalId: fields.nationalId.value || '',
    phone: fields.phone.value || '',
    status: extra.status || '', // عربي: "مبكر/في الوقت/متأخر"
    minutes: (extra.minutes != null ? String(extra.minutes) : ''),
    reason: extra.reason || '',
    imageBase64
  };

  let res;
  if (BYPASS_FOR_LOCAL_FILE) {
    const fd = new FormData();
    Object.entries(payload).forEach(([k,v]) => fd.append(k, v ?? ''));
    res = await fetch(WEB_APP_URL, { method: 'POST', body: fd, mode: 'no-cors' });
    return { ok: true }; // استجابة صامتة محليًا
  } else {
    res = await fetch(WEB_APP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  }

  const json = await res.json().catch(() => ({ ok: false, error: 'Invalid JSON' }));
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json;
}

/* ===================== Actions (تعطيل الأزرار أثناء التنفيذ) ===================== */
if (btnCheckIn) btnCheckIn.addEventListener('click', async () => {
  if (!formValid()) return alert('⚠️ تأكد من تعبئة الحقول بشكل صحيح.');
  if (!canDoAction()) return alert('لا يمكنك تنفيذ عملية جديدة قبل مرور 8 ساعات من آخر عملية.');
  const timeOK = updateShiftState(); if (!timeOK) return;
  setBusy(btnCheckIn, true);
  try {
    const geoOK = await validateGeofence(); if (!geoOK) return;
    const { start } = parseShiftRange(fields.shift.value);
    const now = riyadhMinutesNow();
    const st = shiftStatus(now, start); // عربي
    await sendRecord('تسجيل حضور', { status: st.type, minutes: st.minutes });
    stampAction(); showReminder();
    alert('✅ تم تسجيل الحضور بنجاح.');
  } catch (err) {
    alert('حدث خطأ أثناء التسجيل: ' + err.message);
  } finally {
    setBusy(btnCheckIn, false);
  }
});

if (btnCheckOut) btnCheckOut.addEventListener('click', async () => {
  if (!formValid()) return alert('⚠️ تأكد من تعبئة الحقول بشكل صحيح.');
  if (!canDoAction()) return alert('لا يمكنك تنفيذ عملية جديدة قبل مرور 8 ساعات من آخر عملية.');
  setBusy(btnCheckOut, true);
  try {
    const geoOK = await validateGeofence(); if (!geoOK) return;
    const { start, end } = parseShiftRange(fields.shift.value);
    const now = riyadhMinutesNow();
    if (!withinCheckoutWindow(now, start, end)) {
      alert('❌ تسجيل الانصراف متاح فقط خلال الساعة الأولى بعد نهاية الوردية.');
      return;
    }
    await sendRecord('تسجيل انصراف', {});
    stampAction();
    alert('✅ تم تسجيل الانصراف بنجاح.');
  } catch (err) {
    alert('حدث خطأ أثناء التسجيل: ' + err.message);
  } finally {
    setBusy(btnCheckOut, false);
  }
});

if (btnEarlyConfirm) btnEarlyConfirm.addEventListener('click', async () => {
  if (!formValid()) return alert('⚠️ تأكد من تعبئة الحقول بشكل صحيح.');
  if (!canDoAction()) return alert('لا يمكنك تنفيذ عملية جديدة قبل مرور 8 ساعات من آخر عملية.');
  setBusy(btnEarlyConfirm, true);
  try {
    const geoOK = await validateGeofence(); if (!geoOK) return;
    const reason = (earlyReason.value || '').trim(); if (!reason) { alert('يرجى كتابة سبب الانصراف المبكر.'); return; }
    const file = earlyPhoto.files && earlyPhoto.files[0] ? earlyPhoto.files[0] : null;
    await sendRecord('انصراف مبكر', { reason, file, status: 'مبكر' });
    stampAction();
    alert('✅ تم تسجيل الانصراف المبكر.');
    earlyPanel.style.display = 'none'; earlyReason.value = ''; earlyPhoto.value = '';
  } catch (err) {
    alert('حدث خطأ أثناء التسجيل: ' + err.message);
  } finally {
    setBusy(btnEarlyConfirm, false);
  }
});
