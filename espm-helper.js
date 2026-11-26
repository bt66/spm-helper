// ==UserScript==
// @name         ITRAMS Review Helper
// @namespace    https://itrams.bpjt.pu.go.id/
// @version      2.7.0
// @description  Foto evaluasi, teks cepat, dan upload/crop dokumen pendukung di modal "Komentar & Ulasan" (tanpa duplikasi).
// @match        https://itrams.bpjt.pu.go.id/*
// @run-at       document-idle
// @noframes
// @updateURL    https://githubusercontent.com
// @downloadURL  https://githubusercontent.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      itrams-api.bpjt.pu.go.id
// ==/UserScript==

(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * SINGLE-INSTANCE GUARD
   * ------------------------------------------------------------------ */
  const GUARD = 'bpjtHelper';
  if (document.documentElement.dataset[GUARD]) return;
  document.documentElement.dataset[GUARD] = '2.7.0';

  /* ------------------------------------------------------------------ *
   * CONFIG
   * ------------------------------------------------------------------ */
  const CONFIG = {
    debounceMs: 200,
    cardSelector: '.css-webmqy',
    textareaSelector: 'textarea[name="review"], textarea[name="comment"]',
    commentBtnRegex: /Komentar\s*&\s*Ulasan/i,
    // label = text on the chip, text = what gets inserted
    shortcuts: [
      { label: 'Lubang (Patching)', text: 'Lubang jalan sudah dilakukan perbaikan dengan metode patching', color: '#505154' },
      { label: 'Retak (Sealant)', text: 'Retak jalan sudah dilakukan perbaikan dengan metode sealant', color: '#3e3e40' },
      { label: 'Pembersihan Rambu', text: 'Rambu jalan sudah dilakukan pembersihan', color: '#d1a608' },
      { label: 'Rumput/Tanaman', text: 'Pemotongan rumput sudah dilakukan, area kembali bersih dan rapi', color: '#26ab0c' },
      { label: 'Kebersihan Sampah', text: 'Pembersihan dari sampah sudah dilakukan, area kembali bersih' },
      { label: 'Guardrail', text: 'Sudah dilakukan penggantian guardrail yang baru' },
      { label: 'Papan Informasi', text: 'Papan informasi sudah dilakukan pembersihan' },
      { label: 'Drainase', text: 'Saluran drainase sudah kembali bersih dan normal' },
      { label: 'Lampu Jalan', text: 'Sudah dilakukan penggantian bohlam lampu' },
      { label: 'Asphaltic Plug', text: 'perbaikan menggunakan asphaltic plug sudah dilakukan' },
      { label: 'Pagar Panel', text: 'Pagar panel sudah diganti' },
      { label: '✔ Memenuhi', text: 'sudah diperbaiki' },
    ],
    // false -> STA copies only "215+550"   (default)
    // true  -> STA copies "215+550 (KM)"
    copyStaWithUnit: false,
  };

  const Z = 2147483000; // above Chakra modals (z-index 1400)

  /* ------------------------------------------------------------------ *
   * STYLES
   * ------------------------------------------------------------------ */
  const CSS = `
  .bpjt-card{margin:0 0 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#2d3748}
  .bpjt-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #edf2f7;font-size:12px;font-weight:700;color:#2b3a5b}
  .bpjt-head .bpjt-sp{flex:1}
  .bpjt-pill{font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;background:#edf2f7;color:#4a5568}
  .bpjt-link{border:none;background:none;color:#3182ce;font-size:11px;font-weight:600;cursor:pointer;padding:2px 4px}
  .bpjt-link:hover{text-decoration:underline}

  /* thumbnails */
  .bpjt-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px}
  .bpjt-tile{position:relative;aspect-ratio:4/3;border-radius:8px;overflow:hidden;cursor:zoom-in;border:1px solid #cbd5e0;background:#edf2f7;padding:0}
  .bpjt-tile img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .2s}
  .bpjt-tile:hover img{transform:scale(1.07)}
  .bpjt-tile:focus-visible{outline:2px solid #3182ce;outline-offset:1px}
  .bpjt-tile span{position:absolute;left:0;right:0;bottom:0;padding:10px 4px 3px;font-size:10px;font-weight:700;color:#fff;text-align:center;background:linear-gradient(transparent,rgba(0,0,0,.75))}
  @media(max-width:480px){.bpjt-grid{grid-template-columns:repeat(2,1fr)}}

  /* card info (ID / STA / deskripsi) */
  .bpjt-meta{display:flex;flex-wrap:wrap;gap:6px;padding:10px 10px 0}
  .bpjt-copy{display:inline-flex;align-items:center;gap:6px;border:1px solid #cbd5e0;background:#f7fafc;border-radius:8px;padding:5px 10px;font-size:12px;color:#2d3748;cursor:pointer;transition:all .12s}
  .bpjt-copy .bpjt-k{font-size:10px;font-weight:700;color:#718096;letter-spacing:.04em}
  .bpjt-copy .bpjt-c{font-size:12px;opacity:.55}
  .bpjt-copy:hover{background:#ebf8ff;border-color:#63b3ed}
  .bpjt-copy:active{transform:scale(.97)}
  .bpjt-copy.done{background:#f0fff4;border-color:#68d391}
  .bpjt-copy.done .bpjt-c{opacity:1}
  .bpjt-desc{display:block;width:calc(100% - 20px);margin:8px 10px 0;padding:8px 10px;text-align:left;border:1px solid #e2e8f0;border-radius:8px;background:#f7fafc;font-size:12px;line-height:1.45;color:#2d3748;white-space:pre-line;max-height:84px;overflow-y:auto;cursor:pointer}
  .bpjt-desc small{display:block;font-size:10px;font-weight:700;color:#718096;letter-spacing:.04em;margin-bottom:2px}
  .bpjt-desc:hover{border-color:#63b3ed;background:#ebf8ff}
  .bpjt-desc.done{background:#f0fff4;border-color:#68d391}

  /* clickable ID / STA badges on the page cards */
  [data-bpjt-copy]{cursor:copy !important;transition:filter .12s,box-shadow .12s}
  [data-bpjt-copy]:hover{filter:brightness(.93);box-shadow:0 0 0 2px rgba(49,130,206,.45)}
  [data-bpjt-copy].bpjt-done{box-shadow:0 0 0 2px #38a169 !important}

  /* before / after compare */
  .bpjt-cmp{padding:10px}
  .bpjt-cmp.hide{display:none}
  .bpjt-cmp-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:8px;font-size:11px;color:#4a5568}
  .bpjt-cmp-bar b{font-size:10px;letter-spacing:.04em;color:#718096}
  .bpjt-cmp-bar select{font-size:12px;padding:3px 6px;border:1px solid #cbd5e0;border-radius:6px;background:#fff;color:#2d3748;max-width:130px}
  .bpjt-cmp-bar button{border:1px solid #cbd5e0;background:#f7fafc;border-radius:6px;padding:3px 9px;font-size:12px;cursor:pointer;color:#2d3748}
  .bpjt-cmp-bar button:hover{background:#ebf8ff;border-color:#63b3ed}
  .bpjt-cmp-bar .bpjt-sp{flex:1}
  .bpjt-cmp-stage{position:relative;width:100%;aspect-ratio:4/3;overflow:hidden;border-radius:8px;background:#111;cursor:ew-resize;user-select:none;touch-action:none;outline:none}
  .bpjt-cmp-stage:focus-visible{box-shadow:0 0 0 2px #3182ce}
  .bpjt-cmp-stage img,.bpjt-cmp-clip{position:absolute;inset:0;width:100%;height:100%}
  .bpjt-cmp-stage img{object-fit:contain;pointer-events:none;-webkit-user-drag:none}
  .bpjt-cmp-handle{position:absolute;top:0;bottom:0;width:2px;background:#fff;transform:translateX(-1px);box-shadow:0 0 6px rgba(0,0,0,.6);pointer-events:none}
  .bpjt-cmp-handle span{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:34px;height:34px;border-radius:50%;background:#fff;color:#2b3a5b;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.45)}
  .bpjt-cmp-tag{position:absolute;top:8px;padding:2px 9px;border-radius:999px;background:rgba(0,0,0,.62);color:#fff;font-size:10px;font-weight:700;pointer-events:none;max-width:46%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bpjt-cmp-tag.l{left:8px}.bpjt-cmp-tag.r{right:8px}
  .bpjt-cmp-split{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .bpjt-cmp-split figure{margin:0;text-align:center;font-size:11px;font-weight:700;color:#4a5568}
  .bpjt-cmp-split img{display:block;width:100%;aspect-ratio:4/3;object-fit:contain;background:#111;border-radius:8px;margin-bottom:4px;cursor:zoom-in}
  .bpjt-cmp-big{background:#fff;border-radius:12px;padding:6px;width:min(94vw,1100px)}
  .bpjt-cmp.big .bpjt-cmp-stage{aspect-ratio:auto;height:74vh}
  .bpjt-cmp.big .bpjt-cmp-split img{aspect-ratio:auto;height:66vh;cursor:default}

  /* quick fill */
  .bpjt-chips{display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px;max-height:92px;overflow-y:auto}
  .bpjt-chips.hide{display:none}
  .bpjt-chip{border:1px solid #cbd5e0;background:#f7fafc;border-radius:999px;padding:4px 11px;font-size:12px;cursor:pointer;color:#2d3748;transition:all .12s}
  .bpjt-chip:hover{background:#ebf8ff;border-color:#63b3ed;color:#2c5282}
  .bpjt-chip:active{transform:scale(.96)}
  .bpjt-chip.colored{background:var(--c);border-color:var(--c);color:var(--fg)}
  .bpjt-chip.colored:hover{background:var(--c);border-color:var(--c);color:var(--fg);filter:brightness(1.15)}

  /* upload (two side-by-side buttons, no dropdown) */
  .bpjt-up{position:relative;z-index:50;isolation:isolate}
  .bpjt-up-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .bpjt-up-btn{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;padding:10px 12px;border:1px solid transparent;border-radius:10px;font-size:13px;font-weight:600;line-height:1.3;text-align:left;cursor:pointer}
  .bpjt-up-btn small{font-size:11px;font-weight:400;opacity:.8}
  .bpjt-up-btn.crop{background:#2b3a5b;color:#fff}
  .bpjt-up-btn.crop:hover{background:#374774}
  .bpjt-up-btn.pc{background:#f7fafc;color:#2d3748;border-color:#cbd5e0}
  .bpjt-up-btn.pc:hover{background:#ebf8ff;border-color:#63b3ed}
  @media(max-width:480px){.bpjt-up-row{grid-template-columns:1fr}}
  .bpjt-prev{display:flex;align-items:center;gap:10px;margin:8px 0 0;padding:8px;border:1px solid #9ae6b4;border-radius:10px;background:#f0fff4;font-size:12px;color:#22543d}
  .bpjt-prev img{width:56px;height:42px;object-fit:cover;border-radius:6px;border:1px solid #9ae6b4;cursor:zoom-in}
  .bpjt-prev .bpjt-sp{flex:1;min-width:0}
  .bpjt-prev .bpjt-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.85}
  .bpjt-rm{border:none;background:#fed7d7;color:#9b2c2c;border-radius:6px;padding:5px 9px;cursor:pointer;font-size:11px;font-weight:600}

  /* overlays */
  .bpjt-ov{display:none;position:fixed;inset:0;z-index:${Z};background:rgba(0,0,0,.88);align-items:center;justify-content:center;flex-direction:column;padding:20px;font-family:system-ui,sans-serif}
  .bpjt-ov.open{display:flex}
  .bpjt-lb-img{max-width:92vw;max-height:82vh;border-radius:8px;box-shadow:0 6px 28px rgba(0,0,0,.6)}
  .bpjt-lb-cap{color:#fff;margin-top:12px;font-size:14px;font-weight:600}
  .bpjt-lb-btn{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border:none;border-radius:50%;background:rgba(255,255,255,.18);color:#fff;font-size:22px;cursor:pointer}
  .bpjt-lb-btn:hover{background:rgba(255,255,255,.32)}
  .bpjt-lb-prev{left:18px}.bpjt-lb-next{right:18px}
  .bpjt-lb-x{position:absolute;top:14px;right:22px;color:#fff;font-size:36px;line-height:1;cursor:pointer;background:none;border:none}

  .bpjt-crop{background:#fff;padding:18px;border-radius:12px;max-width:700px;width:100%;text-align:center}
  .bpjt-crop h3{margin:0 0 10px;font-size:15px;color:#2d3748}
  .bpjt-stage{width:100%;height:350px;border:1px solid #cbd5e0;margin-bottom:8px;background:#1a202c;display:flex;justify-content:center;align-items:center;overflow:hidden;border-radius:8px}
  .bpjt-stage canvas{display:block;max-width:100%;max-height:100%;object-fit:contain;touch-action:none}
  .bpjt-info{font-size:11px;color:#718096;margin:0 0 12px;min-height:16px}
  .bpjt-row{display:flex;justify-content:flex-end;gap:8px}
  .bpjt-row button{padding:8px 14px;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;background:#edf2f7;color:#2d3748}
  .bpjt-row .bpjt-ok{background:#3182ce;color:#fff}
  .bpjt-row .bpjt-ok:disabled{opacity:.5;cursor:default}

  .bpjt-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:${Z};background:#2d3748;color:#fff;padding:8px 16px;border-radius:999px;font:600 12px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.3);opacity:0;transition:opacity .2s;pointer-events:none}
  .bpjt-toast.show{opacity:1}
  `;

  function ensureStyle() {
    if (document.getElementById('bpjt-style')) return;
    const s = document.createElement('style');
    s.id = 'bpjt-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------ *
   * UTILITIES
   * ------------------------------------------------------------------ */
  const el = (tag, props = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v);
    }
    [].concat(kids).forEach((c) => c && n.appendChild(c));
    return n;
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  };

  let toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) { toastEl = el('div', { class: 'bpjt-toast' }); document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
  }

  function loadBlob(url) {
    const viaFetch = () => fetch(url).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    });
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') { viaFetch().then(resolve, reject); return; }
      GM_xmlhttpRequest({
        url, method: 'GET', responseType: 'blob',
        onload: (r) => (r.status >= 200 && r.status < 300 && r.response ? resolve(r.response) : viaFetch().then(resolve, reject)),
        onerror: () => viaFetch().then(resolve, reject),
        ontimeout: () => viaFetch().then(resolve, reject),
      });
    });
  }

  function setNativeValue(input, value) {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Pick readable text color (black/white) for a hex background
  function textOn(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#fff';
    const n = parseInt(m[1], 16);
    const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#1a202c' : '#fff';
  }

  /* ------------------------------------------------------------------ *
   * ACTIVE CARD
   * ------------------------------------------------------------------ */
  let activeCard = null;
  const ids = new WeakMap();
  let idSeq = 0;
  const uid = (node) => { if (!ids.has(node)) ids.set(node, ++idSeq); return ids.get(node); };

  function findCard(from) {
    const direct = from.closest(CONFIG.cardSelector);
    if (direct) return direct;
    let n = from.parentElement;
    while (n && n !== document.body) {
      if (n.querySelectorAll('img[alt^="Slide"]').length >= 4) return n;
      n = n.parentElement;
    }
    return null;
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('button');
    if (btn && CONFIG.commentBtnRegex.test(btn.textContent || '')) {
      const c = findCard(btn);
      if (c) activeCard = c;
    }
  }, true);

  function cardImages(card) {
    if (!card) return [];
    return [...card.querySelectorAll('img[alt^="Slide"]')].map((img, i) => {
      const badge = img.parentElement && img.parentElement.querySelector('.chakra-badge');
      return { label: (badge && badge.textContent.trim()) || 'Foto ' + (i + 1), src: img.currentSrc || img.src };
    });
  }

  /* ------------------------------------------------------------------ *
   * LIGHTBOX (single instance, prev/next, keyboard)
   * ------------------------------------------------------------------ */
  let lb = null;
  function ensureLightbox() {
    if (lb) return lb;
    const img = el('img', { class: 'bpjt-lb-img', alt: '' });
    const cap = el('div', { class: 'bpjt-lb-cap' });
    const prev = el('button', { class: 'bpjt-lb-btn bpjt-lb-prev', type: 'button', 'aria-label': 'Sebelumnya', text: '‹' });
    const next = el('button', { class: 'bpjt-lb-btn bpjt-lb-next', type: 'button', 'aria-label': 'Berikutnya', text: '›' });
    const x = el('button', { class: 'bpjt-lb-x', type: 'button', 'aria-label': 'Tutup', text: '×' });
    const root = el('div', { class: 'bpjt-ov', id: 'bpjt-lightbox', 'data-no-focus-lock': 'true' }, [x, prev, img, cap, next]);
    lb = { root, img, cap, items: [], i: 0 };

    const show = (i) => {
      if (!lb.items.length) return;
      lb.i = (i + lb.items.length) % lb.items.length;
      const it = lb.items[lb.i];
      img.src = it.src;
      cap.textContent = it.label + '  (' + (lb.i + 1) + '/' + lb.items.length + ')';
    };
    lb.show = show;
    lb.close = () => root.classList.remove('open');
    prev.addEventListener('click', (e) => { e.stopPropagation(); show(lb.i - 1); });
    next.addEventListener('click', (e) => { e.stopPropagation(); show(lb.i + 1); });
    x.addEventListener('click', lb.close);
    root.addEventListener('click', (e) => { if (e.target === root) lb.close(); });
    document.addEventListener('keydown', (e) => {
      if (!root.classList.contains('open')) return;
      if (e.key === 'Escape') { e.stopPropagation(); lb.close(); }
      else if (e.key === 'ArrowLeft') show(lb.i - 1);
      else if (e.key === 'ArrowRight') show(lb.i + 1);
    }, true);
    document.body.appendChild(root);
    return lb;
  }

  function openLightbox(items, index) {
    const box = ensureLightbox();
    box.items = items;
    box.show(index);
    box.root.classList.add('open');
  }

  /* ------------------------------------------------------------------ *
   * 1) THUMBNAILS
   * ------------------------------------------------------------------ */
  // Read ID, STA and Deskripsi from the clicked card
  function cardInfo(card) {
    const badges = [...card.querySelectorAll('.chakra-badge')].map((b) => b.textContent.replace(/\s+/g, ' ').trim());

    const idTxt = badges.find((t) => /^ID:/i.test(t));
    const id = idTxt ? idTxt.replace(/^ID:\s*/i, '').trim() : '';

    const staTxt = badges.find((t) => /\d+\s*\+\s*\d+/.test(t)) || '';
    const m = staTxt.match(/(\d+\s*\+\s*\d+)/);
    const staShort = m ? m[1].replace(/\s+/g, '') : '';
    const staFull = staTxt ? staTxt.toUpperCase() : '';          // e.g. "513+000 (KM)"

    let desc = '';
    const label = [...card.querySelectorAll('p')].find((p) => /^deskripsi$/i.test(p.textContent.trim()));
    if (label && label.nextElementSibling) desc = label.nextElementSibling.textContent.trim();

    return { id, staShort, staFull, desc };
  }

  // Clipboard: GM_setClipboard -> navigator.clipboard -> execCommand fallback
  function legacyCopy(text) {
    const host = document.querySelector('[role="dialog"]') || document.body;
    const ta = el('textarea', { readonly: '', 'data-no-focus-lock': 'true', style: 'position:fixed;top:0;left:0;opacity:0;pointer-events:none' });
    ta.value = text;
    host.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }

  function copyText(text) {
    return new Promise((resolve) => {
      try {
        if (typeof GM_setClipboard === 'function') { GM_setClipboard(text, 'text'); resolve(true); return; }
      } catch { /* fall through */ }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => resolve(true), () => resolve(legacyCopy(text)));
      } else {
        resolve(legacyCopy(text));
      }
    });
  }

  function flashDone(btn) {
    btn.classList.add('done');
    setTimeout(() => btn.classList.remove('done'), 1200);
  }

  function copyChip(key, shown, toCopy, what) {
    const b = el('button', { class: 'bpjt-copy', type: 'button', title: 'Klik untuk menyalin ' + what }, [
      el('span', { class: 'bpjt-k', text: key }),
      el('b', { text: shown }),
      el('span', { class: 'bpjt-c', text: '⧉' }),
    ]);
    b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      copyText(toCopy).then((ok) => {
        if (ok) { flashDone(b); toast(what + ' disalin: ' + toCopy); } else toast('Gagal menyalin ' + what);
      });
    });
    return b;
  }

  /* ------------------------------------------------------------------ *
   * BEFORE / AFTER COMPARE  (slider or side-by-side)
   * default: Repair 0% (before)  vs  Repair 100% (after)
   * ------------------------------------------------------------------ */
  function buildCompare(images, opts = {}) {
    if (!images || images.length < 2) return null;
    const find = (re) => images.findIndex((i) => re.test(i.label));
    let a = opts.a != null ? opts.a : find(/repair\s*0\s*%/i);
    let b = opts.b != null ? opts.b : find(/repair\s*100\s*%/i);
    if (b < 0) b = images.length - 1;                 // no "Repair 100%" yet -> latest photo
    if (a < 0 || a === b) a = Math.max(0, b - 1);     // e.g. unfinished card: Temuan vs Repair 0%
    let pos = opts.pos != null ? opts.pos : 50;
    let mode = store.get('bpjt_cmp_mode', 'slider');  // slider | split

    const root = el('div', { class: 'bpjt-cmp' + (opts.big ? ' big' : '') });
    const bar = el('div', { class: 'bpjt-cmp-bar' });
    const body = el('div');
    root.append(bar, body);

    const mkSelect = (get, set) => {
      const sel = el('select');
      images.forEach((im, i) => sel.appendChild(el('option', { value: String(i), text: im.label })));
      sel.value = String(get());
      sel.addEventListener('change', () => { set(parseInt(sel.value, 10)); render(); });
      return sel;
    };

    function renderBar() {
      bar.textContent = '';
      const swap = el('button', { type: 'button', title: 'Tukar sisi', text: '⇄' });
      swap.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); [a, b] = [b, a]; render(); });
      const modeBtn = el('button', { type: 'button', title: 'Ganti tampilan', text: mode === 'slider' ? '▥ Berdampingan' : '◧ Geser' });
      modeBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        mode = mode === 'slider' ? 'split' : 'slider';
        store.set('bpjt_cmp_mode', mode);
        render();
      });
      bar.append(
        el('b', { text: 'SEBELUM' }), mkSelect(() => a, (v) => { a = v; }),
        swap,
        el('b', { text: 'SESUDAH' }), mkSelect(() => b, (v) => { b = v; }),
        el('span', { class: 'bpjt-sp' }),
        modeBtn
      );
      if (!opts.big) {
        const exp = el('button', { type: 'button', title: 'Perbesar', text: '⤢' });
        exp.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openCompareOverlay(images, { a, b, pos }); });
        bar.appendChild(exp);
      }
    }

    function renderSlider() {
      const imgAfter = el('img', { src: images[b].src, alt: images[b].label, draggable: 'false' });
      const imgBefore = el('img', { src: images[a].src, alt: images[a].label, draggable: 'false' });
      const clip = el('div', { class: 'bpjt-cmp-clip' }, [imgBefore]);
      const handle = el('div', { class: 'bpjt-cmp-handle' }, [el('span', { text: '⇆' })]);
      const stage = el('div', {
        class: 'bpjt-cmp-stage', tabindex: '0', role: 'slider',
        'aria-label': 'Perbandingan sebelum dan sesudah', 'aria-valuemin': '0', 'aria-valuemax': '100',
      }, [
        imgAfter, clip, handle,
        el('span', { class: 'bpjt-cmp-tag l', text: 'SEBELUM · ' + images[a].label }),
        el('span', { class: 'bpjt-cmp-tag r', text: 'SESUDAH · ' + images[b].label }),
      ]);

      const apply = () => {
        clip.style.clipPath = 'inset(0 ' + (100 - pos) + '% 0 0)';
        handle.style.left = pos + '%';
        stage.setAttribute('aria-valuenow', String(Math.round(pos)));
      };
      const setFrom = (e) => {
        const r = stage.getBoundingClientRect();
        pos = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
        apply();
      };
      let dragging = false;
      stage.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        dragging = true;
        stage.setPointerCapture(e.pointerId);
        stage.focus({ preventScroll: true });
        setFrom(e);
      });
      stage.addEventListener('pointermove', (e) => { if (dragging) setFrom(e); });
      const stop = () => { dragging = false; };
      stage.addEventListener('pointerup', stop);
      stage.addEventListener('pointercancel', stop);
      stage.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { pos = Math.max(0, pos - 5); apply(); e.preventDefault(); e.stopPropagation(); }
        else if (e.key === 'ArrowRight') { pos = Math.min(100, pos + 5); apply(); e.preventDefault(); e.stopPropagation(); }
      });
      apply();
      return stage;
    }

    function renderSplit() {
      const fig = (i, tag) => {
        const img = el('img', { src: images[i].src, alt: images[i].label, title: opts.big ? '' : 'Klik untuk memperbesar' });
        if (!opts.big) img.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openLightbox(images, i); });
        return el('figure', {}, [img, el('figcaption', { text: tag + ' · ' + images[i].label })]);
      };
      return el('div', { class: 'bpjt-cmp-split' }, [fig(a, 'SEBELUM'), fig(b, 'SESUDAH')]);
    }

    function render() {
      renderBar();
      body.textContent = '';
      body.appendChild(mode === 'slider' ? renderSlider() : renderSplit());
    }
    render();
    return root;
  }

  function openCompareOverlay(images, st) {
    document.getElementById('bpjt-cmp-ov')?.remove();
    const cmp = buildCompare(images, { a: st.a, b: st.b, pos: st.pos, big: true });
    if (!cmp) return;
    const closeBtn = el('button', { class: 'bpjt-lb-x', type: 'button', 'aria-label': 'Tutup', text: '×' });
    const ov = el('div', { class: 'bpjt-ov open', id: 'bpjt-cmp-ov', 'data-no-focus-lock': 'true' }, [
      closeBtn,
      el('div', { class: 'bpjt-cmp-big' }, [cmp]),
    ]);
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } };
    const done = () => { document.removeEventListener('keydown', onKey, true); ov.remove(); };
    closeBtn.addEventListener('click', done);
    ov.addEventListener('click', (e) => { if (e.target === ov) done(); });
    ['mousedown', 'pointerdown'].forEach((t) => ov.addEventListener(t, (e) => e.stopPropagation()));
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(ov);
  }

  function compareSection(images) {
    const cmp = buildCompare(images);
    if (!cmp) return null;
    let collapsed = store.get('bpjt_cmp_collapsed', '0') === '1';
    const fold = el('button', { class: 'bpjt-link', type: 'button' });
    const paint = () => { fold.textContent = collapsed ? 'Tampilkan' : 'Sembunyikan'; cmp.classList.toggle('hide', collapsed); };
    fold.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      collapsed = !collapsed;
      store.set('bpjt_cmp_collapsed', collapsed ? '1' : '0');
      paint();
    });
    paint();
    const head = el('div', { class: 'bpjt-head', style: 'border-top:1px solid #edf2f7' }, [
      el('span', { text: '↔ Sebelum & Sesudah' }),
      el('span', { class: 'bpjt-sp' }),
      fold,
    ]);
    return el('div', {}, [head, cmp]);
  }

  function injectThumbs(root, rid) {
    const key = 'thumbs:' + rid;
    const cardId = activeCard ? uid(activeCard) : 0;
    const existing = root.querySelector('[data-bpjt-key="' + key + '"]');
    if (existing && existing.dataset.card === String(cardId)) return;
    if (existing) existing.remove();
    if (!activeCard) return;

    const images = cardImages(activeCard);
    const info = cardInfo(activeCard);

    const head = el('div', { class: 'bpjt-head' }, [
      el('span', { text: '📋 Info Temuan' }),
      el('span', { class: 'bpjt-sp' }),
      el('span', { class: 'bpjt-pill', text: 'Klik untuk menyalin' }),
    ]);
    const parts = [head];

    // ID + STA (click = copy)
    const meta = el('div', { class: 'bpjt-meta' });
    if (info.id) meta.appendChild(copyChip('ID', info.id, info.id, 'ID'));
    if (info.staFull) {
      meta.appendChild(copyChip('STA', info.staFull, CONFIG.copyStaWithUnit ? info.staFull : info.staShort, 'STA'));
    }
    if (meta.childNodes.length) parts.push(meta);

    // Deskripsi (click = copy)
    if (info.desc) {
      const d = el('button', { class: 'bpjt-desc', type: 'button', title: 'Klik untuk menyalin deskripsi' }, [
        el('small', { text: 'DESKRIPSI · klik untuk salin' }),
        document.createTextNode(info.desc),
      ]);
      d.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        copyText(info.desc).then((ok) => {
          if (ok) { flashDone(d); toast('Deskripsi disalin'); } else toast('Gagal menyalin deskripsi');
        });
      });
      parts.push(d);
    }

    // Before / After compare (default: Repair 0% vs Repair 100%)
    const cmpSec = compareSection(images);
    if (cmpSec) parts.push(cmpSec);

    // Photos
    if (images.length) {
      const grid = el('div', { class: 'bpjt-grid' });
      images.forEach((im, i) => {
        const tile = el('button', { class: 'bpjt-tile', type: 'button', title: im.label + ' (klik untuk memperbesar)' }, [
          el('img', { src: im.src, alt: im.label, loading: 'lazy' }),
          el('span', { text: im.label }),
        ]);
        tile.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openLightbox(images, i); });
        grid.appendChild(tile);
      });
      parts.push(grid);
    }

    const card = el('div', { class: 'bpjt-card', 'data-bpjt-key': key, 'data-card': String(cardId) }, parts);
    const body = root.querySelector('.chakra-modal__body') || root;
    body.insertBefore(card, body.firstChild);
  }

  /* ------------------------------------------------------------------ *
   * CLICK-TO-COPY ON THE CARD BADGES (ID + STA)
   * ------------------------------------------------------------------ */
  function badgeCopyInfo(badge) {
    const t = badge.textContent.replace(/\s+/g, ' ').trim();
    let m = t.match(/^ID:\s*(\d+)/i);
    if (m) return { type: 'ID', value: m[1] };
    m = t.match(/^(\d+)\s*\+\s*(\d+)/);
    if (m) {
      const sta = m[1] + '+' + m[2];
      return { type: 'STA', value: CONFIG.copyStaWithUnit ? sta + ' (KM)' : sta };
    }
    return null;
  }

  function cardBadge(target) {
    const b = target && target.closest && target.closest('.chakra-badge');
    if (!b || b.closest('.bpjt-card, .bpjt-ov')) return null;
    return findCard(b) ? b : null;
  }

  // Lazily mark badges as copyable (pointer cursor + tooltip) when hovered
  document.addEventListener('mouseover', (e) => {
    const b = cardBadge(e.target);
    if (!b || b.dataset.bpjtCopy) return;
    const info = badgeCopyInfo(b);
    if (!info) return;
    b.dataset.bpjtCopy = info.type;
    b.title = 'Klik untuk menyalin ' + info.type + ': ' + info.value;
  });

  document.addEventListener('click', (e) => {
    const b = cardBadge(e.target);
    if (!b) return;
    const info = badgeCopyInfo(b);
    if (!info) return;
    if (String(window.getSelection() || '').trim()) return; // user is selecting text, don't hijack
    e.preventDefault();
    copyText(info.value).then((ok) => {
      if (ok) {
        b.classList.add('bpjt-done');
        setTimeout(() => b.classList.remove('bpjt-done'), 1200);
        toast(info.type + ' disalin: ' + info.value);
      } else {
        toast('Gagal menyalin ' + info.type);
      }
    });
  });

  /* ------------------------------------------------------------------ *
   * 2) QUICK-FILL
   * ------------------------------------------------------------------ */
  function injectQuickFill(root, rid, ta) {
    const key = 'qf:' + rid + ':' + (ta.name || 'x');
    const prev = ta.previousElementSibling;
    if (prev && prev.dataset && prev.dataset.bpjtKey === key) return;
    if (root.querySelector('[data-bpjt-key="' + key + '"]')) return;

    let mode = store.get('bpjt_qf_mode', 'replace'); // replace | append
    let collapsed = store.get('bpjt_qf_collapsed', '0') === '1';

    const chips = el('div', { class: 'bpjt-chips' + (collapsed ? ' hide' : '') });
    const modeBtn = el('button', { class: 'bpjt-link', type: 'button' });
    const foldBtn = el('button', { class: 'bpjt-link', type: 'button' });
    const clearBtn = el('button', { class: 'bpjt-link', type: 'button', text: 'Hapus teks' });

    const paintMode = () => { modeBtn.textContent = mode === 'replace' ? 'Mode: Ganti' : 'Mode: Tambah'; };
    const paintFold = () => { foldBtn.textContent = collapsed ? 'Tampilkan' : 'Sembunyikan'; };
    paintMode(); paintFold();

    modeBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      mode = mode === 'replace' ? 'append' : 'replace';
      store.set('bpjt_qf_mode', mode); paintMode();
    });
    foldBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      collapsed = !collapsed;
      store.set('bpjt_qf_collapsed', collapsed ? '1' : '0');
      chips.classList.toggle('hide', collapsed); paintFold();
    });
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      setNativeValue(ta, ''); ta.focus();
    });

    CONFIG.shortcuts.forEach((s) => {
      const chip = el('button', { class: 'bpjt-chip', type: 'button', title: s.text, text: s.label });
      if (/^#[0-9a-f]{6}$/i.test(s.color || '')) {
        chip.classList.add('colored');
        chip.style.setProperty('--c', s.color);
        chip.style.setProperty('--fg', textOn(s.color));
      }
      chip.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const cur = ta.value.trim();
        setNativeValue(ta, mode === 'append' && cur ? cur + ' ' + s.text : s.text);
        ta.focus();
        toast('Teks dimasukkan');
      });
      chips.appendChild(chip);
    });

    const head = el('div', { class: 'bpjt-head' }, [
      el('span', { text: '⚡ Teks Cepat' }),
      el('span', { class: 'bpjt-sp' }),
      modeBtn, clearBtn, foldBtn,
    ]);
    const card = el('div', { class: 'bpjt-card', 'data-bpjt-key': key }, [head, chips]);
    ta.parentNode.insertBefore(card, ta);
  }

  /* ------------------------------------------------------------------ *
   * 3) UPLOAD + CROPPER
   * The file input is ALWAYS resolved lazily at action time: React may
   * replace the DOM node after we injected, so a stored reference can go
   * stale and the file would be attached to a detached element.
   * ------------------------------------------------------------------ */
  const DIALOG_SEL = '[role="dialog"], [role="alertdialog"], .chakra-modal__content';

  function getFileInput(root) {
    return (root && root.isConnected && root.querySelector('input[type="file"]')) ||
      document.querySelector('[role="dialog"] input[type="file"]') || null;
  }

  function findUploadLabel(root) {
    const re = /dokumen\s+pendukung/i;
    return [...root.querySelectorAll('label, p, span, div, h2, h3, h4, legend')].find((n) =>
      !n.closest('[data-bpjt-key]') &&
      re.test(n.textContent) && n.textContent.trim().length < 80 &&
      ![...n.children].some((c) => re.test(c.textContent))
    ) || null;
  }

  function repair100() {
    const imgs = cardImages(activeCard);
    return imgs.find((i) => /repair/i.test(i.label) && /100/.test(i.label)) || imgs[imgs.length - 1] || null;
  }

  function clearInput(root) {
    const input = getFileInput(root);
    if (!input) return;
    try {
      input.files = new DataTransfer().files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) { console.error('[ITRAMS helper]', e); }
  }

  function renderPreview(root, wrap, file) {
    const old = wrap.querySelector('.bpjt-prev');
    if (old) {
      const im = old.querySelector('img');
      if (im && im.src.startsWith('blob:')) URL.revokeObjectURL(im.src);
      old.remove();
    }
    if (!file) return;
    const url = URL.createObjectURL(file);
    const thumb = el('img', { src: url, alt: 'Preview' });
    thumb.addEventListener('click', () => openLightbox([{ src: url, label: file.name }], 0));
    const rm = el('button', { class: 'bpjt-rm', type: 'button', text: 'Hapus' });
    rm.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      clearInput(root);
      renderPreview(root, wrap, null);
    });
    wrap.appendChild(el('div', { class: 'bpjt-prev' }, [
      thumb,
      el('div', { class: 'bpjt-sp' }, [
        el('div', { text: '✅ Dokumen terlampir', style: 'font-weight:700' }),
        el('div', { class: 'bpjt-name', text: file.name + ' · ' + Math.max(1, Math.round(file.size / 1024)) + ' KB' }),
      ]),
      rm,
    ]));
  }

  function attachFile(root, wrap, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = getFileInput(root);
    wrap.dataset.busy = '1';
    try {
      if (input) {
        input.files = dt.files;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // No <input type=file> in the DOM: emulate a drag&drop on the upload zone
        const lbl = findUploadLabel(root);
        const zone = lbl && (lbl.nextElementSibling || lbl.parentElement);
        if (!zone) { toast('Input file tidak ditemukan di modal'); return; }
        ['dragenter', 'dragover', 'drop'].forEach((t) =>
          zone.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt })));
      }
    } catch (err) {
      console.error('[ITRAMS helper] attach failed', err);
      toast('Gagal melampirkan file');
      return;
    } finally {
      delete wrap.dataset.busy;
    }
    renderPreview(root, wrap, file);
    toast('File terlampir');
  }

  // Preview for files picked through the site's own input ("Upload dari Komputer")
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || t.type !== 'file' || !t.files || !t.files[0]) return;
    const root = t.closest(DIALOG_SEL);
    const wrap = root && root.querySelector('.bpjt-up');
    if (wrap && !wrap.dataset.busy) renderPreview(root, wrap, t.files[0]);
  }, true);

  // Safety net: the site's file input may be an invisible full-size overlay that
  // receives clicks meant for our buttons (=> OS file picker opens every time).
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element) || e.__bpjtRedirected) return;
    if (t.closest('.bpjt-up, .bpjt-ov')) return;
    if (!(t instanceof HTMLInputElement && t.type === 'file') && !t.closest('label, [role="presentation"], div')) return;
    if (!e.clientX && !e.clientY) return; // keyboard-synthesised click
    const hit = [...document.querySelectorAll('.bpjt-up-btn, .bpjt-prev .bpjt-rm')]
      .find((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      });
    if (!hit) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    hit.click();
  }, true);

  // Climb to the outermost wrapper that holds ONLY the file field (no textarea),
  // so our buttons are never inside the site's clickable dropzone / label.
  function fieldContainer(root, input) {
    const body = root.querySelector('.chakra-modal__body') || root;
    const form = input.closest('form');
    let node = input.closest('label') || input;
    while (node.parentElement &&
           node.parentElement !== body && node.parentElement !== form && node.parentElement !== root) {
      const p = node.parentElement;
      if (p.querySelector(CONFIG.textareaSelector) || p.querySelectorAll('input[type="file"]').length !== 1) break;
      node = p;
    }
    return node;
  }

  function injectUpload(root, rid) {
    const key = 'upload:' + rid;
    if (root.querySelector('[data-bpjt-key="' + key + '"]')) return;

    const input = root.querySelector('input[type="file"]');
    let anchor = null, where = 'beforebegin';
    if (input) anchor = fieldContainer(root, input);
    else { anchor = findUploadLabel(root); where = 'afterend'; }
    if (!anchor) return; // modal has no upload field (e.g. comment-only tab)

    const btnCrop = el('button', { class: 'bpjt-up-btn crop', type: 'button' }, [
      el('span', { text: '✨ Gunakan Gambar 100% (Crop)' }),
      el('small', { text: 'Ambil dari foto "Repair 100%" lalu potong area yang diperlukan' }),
    ]);
    const btnPc = el('button', { class: 'bpjt-up-btn pc', type: 'button' }, [
      el('span', { text: '💻 Upload dari Komputer' }),
      el('small', { text: 'Pilih file dari perangkat Anda' }),
    ]);
    const row = el('div', { class: 'bpjt-up-row' }, [btnCrop, btnPc]);
    const wrap = el('div', { class: 'bpjt-up', 'data-bpjt-key': key, style: 'margin:0 0 10px' }, [row]);

    btnPc.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const inp = getFileInput(root);
      if (inp) { inp.click(); return; }
      const trig = [...root.querySelectorAll('button, label, [role="button"]')].find((b) =>
        !b.closest('[data-bpjt-key]') && /upload|unggah|pilih file|browse/i.test(b.textContent));
      if (trig) trig.click(); else toast('Input file tidak ditemukan di modal');
    });

    btnCrop.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const src = repair100();
      if (!src) {
        toast('Kartu tidak terdeteksi: tutup modal, lalu klik "Komentar & Ulasan" lagi');
        return;
      }
      openCropper(src.src, (file) => attachFile(root, wrap, file));
    });

    anchor.insertAdjacentElement(where, wrap);
  }

  /* ---- Cropper (built fresh per open, removed on close => no leaks) ---- */
  function openCropper(url, onDone) {
    document.getElementById('bpjt-crop')?.remove();

    const canvas = el('canvas');
    const info = el('p', { class: 'bpjt-info', text: 'Memuat gambar…' });
    const bCancel = el('button', { type: 'button', text: 'Batal' });
    const bReset = el('button', { type: 'button', text: 'Pilih Seluruh Gambar' });
    const bOk = el('button', { type: 'button', class: 'bpjt-ok', text: 'Gunakan & Lampirkan' });
    bOk.disabled = true;

    const overlay = el('div', { class: 'bpjt-ov open', id: 'bpjt-crop', 'data-no-focus-lock': 'true' }, [
      el('div', { class: 'bpjt-crop' }, [
        el('h3', { text: 'Crop Gambar 100% untuk Dokumen Pendukung' }),
        el('div', { class: 'bpjt-stage' }, [canvas]),
        info,
        el('div', { class: 'bpjt-row' }, [bCancel, bReset, bOk]),
      ]),
    ]);
    ['mousedown', 'pointerdown', 'click'].forEach((t) => overlay.addEventListener(t, (e) => e.stopPropagation()));
    document.body.appendChild(overlay);

    const ctx = canvas.getContext('2d');
    let img = null, objUrl = null, scale = 1;
    let sel = null, mode = null, start = null, off = null;

    const close = () => {
      document.removeEventListener('keydown', onKey, true);
      if (objUrl) URL.revokeObjectURL(objUrl);
      overlay.remove();
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);

    const hasSel = () => sel && sel.w > 4 && sel.h > 4;
    const refreshInfo = () => {
      if (!img) return;
      info.textContent = hasSel()
        ? 'Area dipilih: ' + Math.round(sel.w / scale) + ' × ' + Math.round(sel.h / scale) + ' px · seret di dalam area untuk memindahkan'
        : 'Seret pada gambar untuk memilih area. Tanpa pilihan = gambar penuh (' + img.naturalWidth + ' × ' + img.naturalHeight + ' px).';
    };

    const draw = () => {
      if (!img) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (hasSel()) {
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, sel.x / scale, sel.y / scale, sel.w / scale, sel.h / scale, sel.x, sel.y, sel.w, sel.h);
        ctx.strokeStyle = '#63b3ed';
        ctx.lineWidth = 2;
        ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
      }
      refreshInfo();
    };

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(canvas.width, ((e.clientX - r.left) * canvas.width) / r.width)),
        y: Math.max(0, Math.min(canvas.height, ((e.clientY - r.top) * canvas.height) / r.height)),
      };
    };
    const inside = (p) => hasSel() && p.x >= sel.x && p.x <= sel.x + sel.w && p.y >= sel.y && p.y <= sel.y + sel.h;

    canvas.addEventListener('pointerdown', (e) => {
      if (!img) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const p = pos(e);
      if (inside(p)) { mode = 'move'; off = { x: p.x - sel.x, y: p.y - sel.y }; }
      else { mode = 'new'; start = p; sel = { x: p.x, y: p.y, w: 0, h: 0 }; }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!img) return;
      const p = pos(e);
      if (mode === 'new') {
        sel = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
        draw();
      } else if (mode === 'move') {
        sel.x = Math.max(0, Math.min(canvas.width - sel.w, p.x - off.x));
        sel.y = Math.max(0, Math.min(canvas.height - sel.h, p.y - off.y));
        draw();
      } else {
        canvas.style.cursor = inside(p) ? 'move' : 'crosshair';
      }
    });
    const end = () => { mode = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    bCancel.addEventListener('click', close);
    bReset.addEventListener('click', () => { sel = null; draw(); });
    bOk.addEventListener('click', () => {
      if (!img) return;
      const full = !hasSel();
      const sx = full ? 0 : sel.x / scale, sy = full ? 0 : sel.y / scale;
      const sw = full ? img.naturalWidth : sel.w / scale, sh = full ? img.naturalHeight : sel.h / scale;
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(sw));
      out.height = Math.max(1, Math.round(sh));
      out.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, out.width, out.height);
      out.toBlob((blob) => {
        if (!blob) { toast('Gagal membuat file crop'); return; }
        const file = new File([blob], 'dokumen_pendukung_repair100.jpg', { type: 'image/jpeg', lastModified: Date.now() });
        close();
        onDone(file);
      }, 'image/jpeg', 0.92);
    });

    loadBlob(url).then((blob) => {
      objUrl = URL.createObjectURL(blob);
      const im = new Image();
      im.onload = () => {
        img = im;
        const maxW = Math.min(640, window.innerWidth - 80), maxH = 340;
        scale = Math.min(maxW / im.naturalWidth, maxH / im.naturalHeight, 1); // fit, never upscale
        canvas.width = Math.round(im.naturalWidth * scale);
        canvas.height = Math.round(im.naturalHeight * scale);
        canvas.style.cursor = 'crosshair';
        bOk.disabled = false;
        draw();
      };
      im.onerror = () => { info.textContent = 'Gagal memuat gambar.'; };
      im.src = objUrl;
    }).catch((err) => {
      console.error('[ITRAMS helper] image load failed', err);
      info.textContent = 'Gagal memuat gambar. Jika Tampermonkey meminta izin koneksi (itrams-api.bpjt.pu.go.id), pilih "Always allow". Jika URL kedaluwarsa, muat ulang halaman.';
    });
  }

  /* ------------------------------------------------------------------ *
   * DEDUPE SWEEP
   * ------------------------------------------------------------------ */
  function dedupe() {
    const seen = new Set();
    document.querySelectorAll('[data-bpjt-key]').forEach((n) => {
      const k = n.dataset.bpjtKey;
      if (seen.has(k)) n.remove();
      else seen.add(k);
    });
  }

  /* ------------------------------------------------------------------ *
   * SCAN (one pass per distinct modal root)
   * ------------------------------------------------------------------ */
  let running = false;
  function scan() {
    if (running) return;
    running = true;
    try {
      ensureStyle();
      const roots = new Set();
      document.querySelectorAll(CONFIG.textareaSelector + ', input[type="file"]').forEach((n) => {
        const r = n.closest('[role="dialog"], [role="alertdialog"], .chakra-modal__content');
        if (r) roots.add(r);
      });

      roots.forEach((root) => {
        const rid = uid(root);
        const tas = root.querySelectorAll(CONFIG.textareaSelector);
        injectThumbs(root, rid);
        tas.forEach((ta) => injectQuickFill(root, rid, ta));
        injectUpload(root, rid);
      });

      dedupe();
    } catch (err) {
      console.error('[ITRAMS helper]', err);
    } finally {
      running = false;
    }
  }

  /* ------------------------------------------------------------------ *
   * DEBOUNCED OBSERVER (ignores our own mutations => no loops)
   * ------------------------------------------------------------------ */
  const ours = (n) =>
    n.nodeType === 1 &&
    (n.hasAttribute('data-bpjt-key') || n.classList.contains('bpjt-ov') || n.classList.contains('bpjt-toast') ||
      n.id === 'bpjt-style' || !!n.closest('[data-bpjt-key], .bpjt-ov'));

  let timer = null;
  const observer = new MutationObserver((muts) => {
    const relevant = muts.some((m) => {
      if (m.type !== 'childList') return false;
      if (m.target.nodeType === 1 && m.target.closest && m.target.closest('[data-bpjt-key], .bpjt-ov')) return false;
      const nodes = [...m.addedNodes, ...m.removedNodes];
      return nodes.length > 0 && !nodes.every(ours);
    });
    if (!relevant) return;
    clearTimeout(timer);
    timer = setTimeout(scan, CONFIG.debounceMs);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  timer = setTimeout(scan, CONFIG.debounceMs);
})();
