// ── Feedback widget (dev tool) ────────────────────────────────────────────────
(function () {
  const STATUS_URL = 'https://raw.githubusercontent.com/ef-erraticpatterns/Knit-Assistant/main/_status.json';

  let fbOpen = false;
  let pickerActive = false;
  let pickedEl = null;
  let pollTimer = null;
  let hlBox = null;

  function $(id) { return document.getElementById(id); }

  // ── Highlight overlay box ──────────────────────────────────────────────────
  function getHlBox() {
    if (!hlBox) {
      hlBox = document.createElement('div');
      hlBox.id = 'fb-hl';
      document.body.appendChild(hlBox);
    }
    return hlBox;
  }

  function moveHl(el) {
    const box = getHlBox();
    if (!el) { box.style.display = 'none'; return; }
    const r = el.getBoundingClientRect();
    box.style.top    = r.top + 'px';
    box.style.left   = r.left + 'px';
    box.style.width  = r.width + 'px';
    box.style.height = r.height + 'px';
    box.style.display = 'block';
  }

  // ── Element picker ─────────────────────────────────────────────────────────
  function startPicker() {
    pickerActive = true;
    pickedEl = null;
    $('fb-pick').textContent = '✕ Cancel';
    $('fb-pick').classList.add('picking');
    $('fb-pick-info').textContent = 'Click any element on the page…';
    $('fb-pick-info').className = 'fb-pick-info active';
    document.body.classList.add('fb-picking');
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    getHlBox().style.display = 'block';
  }

  function stopPicker() {
    pickerActive = false;
    document.body.classList.remove('fb-picking');
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    getHlBox().style.display = 'none';
    $('fb-pick').textContent = '🎯 Pick an element';
    $('fb-pick').classList.remove('picking');
  }

  function onMove(e) {
    const panel = $('fb-panel');
    if (panel && panel.contains(e.target)) return;
    if (e.target === $('fb-btn')) return;
    moveHl(e.target);
  }

  function onClick(e) {
    const panel = $('fb-panel');
    if (panel && panel.contains(e.target)) return;
    if (e.target === $('fb-btn')) return;
    e.preventDefault();
    e.stopPropagation();
    pickedEl = e.target;
    stopPicker();
    $('fb-pick-info').textContent = describeEl(pickedEl);
    $('fb-pick-info').className = 'fb-pick-info selected';
  }

  function onKey(e) { if (e.key === 'Escape') stopPicker(); }

  function describeEl(el) {
    const tag = el.tagName.toLowerCase();
    const id  = el.id ? '#' + el.id : '';
    const cls = (typeof el.className === 'string' && el.className.trim())
      ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).map(c => '.' + c).join('')
      : '';
    const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    let s = `<${tag}${id}${cls}>`;
    if (txt) s += ` "${txt}"`;
    const p = el.parentElement;
    if (p && p !== document.body) {
      const ptag = p.tagName.toLowerCase();
      const pcls = (typeof p.className === 'string' && p.className.trim())
        ? '.' + p.className.trim().split(/\s+/)[0] : '';
      s += ` inside <${ptag}${pcls}>`;
    }
    return s;
  }

  // ── Status polling ─────────────────────────────────────────────────────────
  async function pollStatus() {
    const dot    = $('fb-dot');
    const taskEl = $('fb-task');
    const doneEl = $('fb-done');
    try {
      const res = await fetch(STATUS_URL + '?nc=' + Date.now());
      if (!res.ok) throw new Error();
      const d = await res.json();
      dot.className = 'fb-dot ' + (d.status || 'idle');
      dot.title = d.status || 'idle';
      taskEl.textContent = d.current_task || '—';
      doneEl.textContent = d.last_completed || '—';
    } catch {
      dot.className = 'fb-dot offline';
      dot.title = 'offline';
      taskEl.textContent = 'Cannot reach server';
    }
  }

  // ── Open / Close ───────────────────────────────────────────────────────────
  function open() {
    fbOpen = true;
    $('fb-panel').classList.remove('hidden');
    $('fb-btn').classList.add('open');
    pollStatus();
    pollTimer = setInterval(pollStatus, 15000);
  }

  function close() {
    fbOpen = false;
    $('fb-panel').classList.add('hidden');
    $('fb-btn').classList.remove('open');
    if (pickerActive) stopPicker();
    clearInterval(pollTimer);
  }

  // ── Copy ───────────────────────────────────────────────────────────────────
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
  }

  function copyInstruction() {
    const text = $('fb-text').value.trim();
    if (!text) { $('fb-text').focus(); return; }
    const ctx  = pickedEl ? '\n\n[Element: ' + describeEl(pickedEl) + ']' : '';
    const full = text + ctx;

    const onSuccess = () => {
      const btn = $('fb-copy');
      btn.textContent = '✓ Copied — paste it in the chat';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = '📋 Copy instruction to clipboard';
        btn.classList.remove('copied');
        $('fb-text').value = '';
        pickedEl = null;
        $('fb-pick-info').textContent = '';
        $('fb-pick-info').className = 'fb-pick-info';
        $('fb-pick').textContent = '🎯 Pick an element';
      }, 2500);
    };

    if (navigator.clipboard) {
      navigator.clipboard.writeText(full).then(onSuccess).catch(() => { fallbackCopy(full); onSuccess(); });
    } else {
      fallbackCopy(full); onSuccess();
    }
  }

  // ── Wire up events ─────────────────────────────────────────────────────────
  $('fb-btn').addEventListener('click', () => fbOpen ? close() : open());
  $('fb-close').addEventListener('click', close);
  $('fb-pick').addEventListener('click', () => pickerActive ? stopPicker() : startPicker());
  $('fb-copy').addEventListener('click', copyInstruction);
  $('fb-text').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) copyInstruction();
  });
})();
