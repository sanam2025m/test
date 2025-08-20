/* ===== إعدادات عامة ===== */
const apiKey = "AIzaSyBYPUAnYE8GC4Vx32cDYSb8UH6YV-VWmEA";
const fields = ["date","from","to","subject","pages","company","site","coverText","letterBody","thanksLine","footerBlock"];

/* ===== جلب بيانات Google Sheets (الحضور) ===== */
async function fetchSheetData(sheetId, range){
  try{
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.values && data.values.length ? data.values : [["لا توجد بيانات"]];
  }catch(e){
    return [["خطأ في الاتصال بالجدول"]];
  }
}

function parseDateCell(v){
  const m=(v||'').match(/\d{4}[-\/]\d{2}[-\/]\d{2}|\d{2}[-\/]\d{2}[-\/]\d{4}/);
  return m ? new Date(m[0].replace(/-/g,'/')) : null;
}

function filterByDateRange(data, fromDateStr, toDateStr, colIndex=0){
  const f=new Date(fromDateStr), t=new Date(toDateStr);
  if(isNaN(f)||isNaN(t)) return data;
  return data.filter((row,idx)=>{
    if(idx===0) return true;
    const d=parseDateCell(row[colIndex]||"");
    return d && d>=f && d<=t;
  });
}

function buildTableHTML(values, className){
  if (!values || !values.length) return '<p>لا توجد بيانات</p>';
  const headers = values[0];
  const cls = className ? ` class="${className}"` : '';
  let h = `<table${cls}><thead><tr>` +
          headers.map(h => `<th>${h}</th>`).join('') +
          `</tr></thead><tbody>`;

  for (let i = 1; i < values.length; i++) {
    h += '<tr>' + values[i].map(c => {
      // 👇 هنا التغيير
      const val = (c === null || c === undefined || String(c).trim() === '') ? '-' : c;
      return `<td>${val}</td>`;
    }).join('') + '</tr>';
  }

  h += '</tbody></table>';
  return h;
}


function updateDocumentTitleWithDateRange(){
  const f=document.getElementById('from').value;
  const t=document.getElementById('to').value;
  const s=document.getElementById('subject').value||'تقرير الحضور والانصراف';
  document.title=(f&&t)?`${s} - من ${f} إلى ${t}`:s;
}

async function loadAndRender(){
  const fromDate=document.getElementById('from').value;
  const toDate=document.getElementById('to').value;

  const raw = await fetchSheetData('1LMeDt4PSeUBUA1IFhBoHSIgnTK-XzLcxIbN4hT6Y7fc','البيانات!A2:L');
  const data = (fromDate&&toDate)?filterByDateRange(raw,fromDate,toDate,0):raw;

  document.getElementById('attendancePreview').innerHTML = buildTableHTML(data, 'attendance-table');

  buildPrintPages(data);
  updatePagesFieldFromDOM();
  syncPrintFields();
}

function updatePagesFieldFromDOM(){
  const root  = document.getElementById('printRoot');
  const field = document.getElementById('pages');
  const span  = document.getElementById('print_pages');
  if (!root || !field) return;
  const count = root.querySelectorAll('.print-page').length;
  field.value = count; if (span) span.textContent = count;
}

/* ===== بناء صفحات الطباعة (صفحات الغلاف+المعلومات+جدول واحد) ===== */
function buildPrintPages(values){
  const root=document.getElementById('printRoot');
  root.innerHTML='';

  const coverTextSaved=document.getElementById('coverText').value||'';

  const cover=document.createElement('section');
  cover.className='print-page cover-page';
  const cText=document.createElement('div');
  Object.assign(cText.style,{position:'absolute', bottom:'90px', left:'30px', color:'#fff', fontSize:'16px', fontWeight:'700', whiteSpace:'pre-wrap', width:'300px'});
  cText.textContent=coverTextSaved; cover.appendChild(cText); root.appendChild(cover);

  const info=document.createElement('section');
  info.className='print-page second-page';
  info.innerHTML=`
    <div class="page-content">
      <div class="header">
         <img src="../logo_sanam.png" alt="شعار سنام الأمن" style="height: 85px;" />
         <img src="../logo_rajhi.png" alt="شعار الراجحي" />
      </div>
      <h1>تقرير الحضور والانصراف</h1>
      <div style="font-size:14px;line-height:1.8">
        <p><strong>التاريخ:</strong> <span id="print_date"></span></p>
        <p><strong>الفترة:</strong> من <span id="print_from"></span> إلى <span id="print_to"></span></p>
        <p><strong>الموضوع:</strong> <span id="print_subject"></span></p>
        <p><strong>عدد الصفحات:</strong> <span id="print_pages"></span></p>
        <p><strong>اسم العميل:</strong> <span id="print_company"></span></p>
        <p><strong>الموقع:</strong> <span id="print_site"></span></p>
        <div id="print_letterBlock" style="margin-top:12px"></div>
      </div>
    </div>`;
  root.appendChild(info);

  appendPaginatedTableMeasured(root, values, 'ملخص الحضور والانصراف', 20, 'attendance-table');
}

function appendPaginatedTableMeasured(root, values, title, extraBottomMm=20, className){
  const pages = paginateValuesMeasured(values, title, extraBottomMm);

  if (!pages.length) {
    const empty = document.createElement('section');
    empty.className = 'print-page table-page';
    empty.innerHTML = `<div class="page-content"><h2>${title}</h2><p>لا توجد بيانات.</p></div>`;
    root.appendChild(empty);
    return;
  }

  pages.forEach((vals, idx) => {
    const sec = document.createElement('section');
    sec.className = 'print-page table-page';
    const tableHTML = buildTableHTML(vals, className);
    sec.innerHTML = `<div class="page-content">${idx === 0 ? ('<h2>' + title + '</h2>') : ''}${tableHTML}</div>`;
    root.appendChild(sec);
  });
}

function paginateValuesMeasured(allValues, title, extraBottomMm = 20){
  if (!allValues || !allValues.length) return [];
  const headers = allValues[0];
  const rows = allValues.slice(1);

  const chunks = [];
  let i = 0, firstPage = true;

  while (i < rows.length) {
    const fit = measureRowsFit(headers, rows.slice(i), firstPage, title, extraBottomMm);
    const rowsThisPage = Math.max(1, fit);
    chunks.push([headers, ...rows.slice(i, i + rowsThisPage)]);
    i += rowsThisPage;
    firstPage = false;
  }
  return chunks;
}

function measureRowsFit(headers, candidateRows, includeTitle, title, extraBottomMm){
  const page = document.createElement('div');
  page.style.cssText = `position:absolute; left:-10000px; top:0; width:210mm; height:297mm; box-sizing:border-box; background:#fff; overflow:hidden; font-family:'Cairo', sans-serif;`;

  const pagePaddingStr = getComputedStyle(document.documentElement).getPropertyValue('--page-padding').trim() || '20mm';
  const padMm = parseFloat(pagePaddingStr) || 20;
  const padPx = mm2px(padMm);
  const extraPx = mm2px(extraBottomMm);

  const content = document.createElement('div');
  content.style.cssText = `box-sizing:border-box; width:100%; height:100%; padding:${padPx}px; padding-bottom:${padPx + extraPx}px;`;
  page.appendChild(content);

  if (includeTitle) {
    const h2 = document.createElement('h2');
    h2.style.cssText = `margin:8px 0; text-align:center; font-size:16px;`;
    h2.textContent = title || '';
    content.appendChild(h2);
  }

  const table = document.createElement('table');
  table.style.cssText = 'width:100%; border-collapse:collapse; table-layout:fixed;';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h ?? '';
    th.style.cssText = 'border:1px solid #ccc; padding:6px; font-size:12px; word-break:break-word; white-space:pre-wrap;';
    hr.appendChild(th);
  });
  thead.appendChild(hr); table.appendChild(thead);
  const tbody = document.createElement('tbody'); table.appendChild(tbody);
  content.appendChild(table);

  document.body.appendChild(page);

  const safeHeight = page.clientHeight;
  let fit = 0;
  for (let r = 0; r < candidateRows.length; r++) {
    const tr = document.createElement('tr');
    candidateRows[r].forEach(cell => {
      const td = document.createElement('td');
      td.textContent = (cell ?? '').toString();
      td.style.cssText = 'border:1px solid #ccc; padding:6px; font-size:12px; word-break:break-word; white-space:pre-wrap;';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);

    if (page.scrollHeight > safeHeight) { tbody.removeChild(tr); break; } else { fit++; }
  }

  document.body.removeChild(page);
  return fit;
}

function mm2px(mm){ return mm * (96 / 25.4); }

/* ===== مزامنة الحقول ===== */
function syncPrintFields(){
  ['date','from','to','subject','pages','company','site'].forEach(id=>{
    const el=document.getElementById(id);
    const span=document.getElementById('print_'+id);
    if(el && span) span.textContent=el.value||'';
  });

  const out = document.getElementById('print_letterBlock');
  const bodyEl   = document.getElementById('letterBody');
  const thanksEl = document.getElementById('thanksLine');
  const footEl   = document.getElementById('footerBlock');
  if(!out) return;

  const fromVal=document.getElementById('from').value||'____';
  const toVal  =document.getElementById('to').value  ||'____';

  const bodyRaw = (bodyEl?.value || '').replaceAll('{from}', fromVal).replaceAll('{to}', toVal);

  const toParas = (txt, align, bold=false) =>
    (txt || '').split(/\r?\n/).map(line=>{
      const t=line.trim(); if(!t) return `<p dir="rtl">&nbsp;</p>`;
      const alignCss  = align ? `text-align:${align};` : '';
      const weightCss = bold ? 'font-weight:700;' : '';
      return `<p dir="rtl" style="${alignCss}${weightCss}">${t}</p>`;
    }).join('');

  let html = '';
  html += toParas(bodyRaw, '');
  const thanks = (thanksEl?.value || '').trim(); if(thanks){ html += `<p dir="rtl" style="text-align:center;">${thanks}</p>`; }
  const footer = footEl?.value || ''; if(footer){ html += toParas(footer, 'left', true); }
  out.innerHTML = html;
}

/* ===== تهيئة ===== */
window.addEventListener('load', ()=>{
  fields.forEach(id=>{
    const el=document.getElementById(id);
    const saved=localStorage.getItem('report_attendance_'+id);
    if(saved && el) el.value=saved;
    if(el){
      el.addEventListener('input', ()=>{
        localStorage.setItem('report_attendance_'+id, el.value);
        updateDocumentTitleWithDateRange();
        syncPrintFields();
      });
      if(id==='from' || id==='to'){
        el.addEventListener('change', ()=>{
          loadAndRender();
          updateDocumentTitleWithDateRange();
        });
      }
    }
  });

  loadAndRender();
  syncPrintFields();
  updateDocumentTitleWithDateRange();
});

/* ===== طباعة ===== */
document.getElementById('printBtn').addEventListener('click', ()=>{
  buildPrintPages(
    document.querySelector('#attendancePreview table') ? tableToValues(document.querySelector('#attendancePreview table')) : []
  );
  finalizePrintPages();
  updatePagesFieldFromDOM();
  syncPrintFields();
  void document.body.offsetHeight;
  window.print();
});

window.addEventListener('beforeprint', ()=>{
  buildPrintPages(
    document.querySelector('#attendancePreview table') ? tableToValues(document.querySelector('#attendancePreview table')) : []
  );
  finalizePrintPages();
  updatePagesFieldFromDOM();
  syncPrintFields();
  void document.body.offsetHeight;
});

function tableToValues(table){
  const values=[];
  const headers=Array.from(table.tHead?.rows?.[0]?.cells||[]).map(th=>th.textContent.trim());
  if(headers.length) values.push(headers);
  const rows=Array.from(table.tBodies?.[0]?.rows||[]);
  rows.forEach(tr=>{ values.push(Array.from(tr.cells).map(td=>td.textContent)); });
  return values;
}

function finalizePrintPages(){
  const root = document.getElementById('printRoot');
  const pages = Array.from(root.querySelectorAll('.print-page'));
  if (pages.length) { const last = pages[pages.length - 1]; last.style.breakAfter = 'auto'; last.style.pageBreakAfter = 'auto'; }
  pages.forEach(p => {
    const hasContent = p.classList.contains('cover-page') || p.classList.contains('second-page') || p.querySelector('table, img, h1, h2, p, .page-content *');
    if (!hasContent) p.remove();
  });
}
