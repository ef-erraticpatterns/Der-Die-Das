// ── Storage helpers ──────────────────────────────────────────────────────────
const STORAGE_KEY = 'knit-assistant-v1';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { projects: [], activeId: null }; }
  catch { return { projects: [], activeId: null }; }
}

function save(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) {
    // localStorage may be full (large PDFs) — warn but don't crash
    if (e.name === 'QuotaExceededError') alert('Storage is almost full. Consider removing PDF patterns to free space.');
  }
}

// ── State ────────────────────────────────────────────────────────────────────
let state = load();

function getProject(id) { return state.projects.find(p => p.id === id); }
function activeProject() { return getProject(state.activeId); }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ── Project CRUD ─────────────────────────────────────────────────────────────
function createProject(name) {
  const p = { id: uid(), name, pdfData: null, steps: [] };
  state.projects.push(p);
  state.activeId = p.id;
  save(state);
  render();
}

function deleteProject(id) {
  if (!confirm('Delete this project? This cannot be undone.')) return;
  state.projects = state.projects.filter(p => p.id !== id);
  if (state.activeId === id) state.activeId = state.projects[0]?.id || null;
  save(state);
  render();
}

function renameProject(id, name) {
  const p = getProject(id);
  if (p) { p.name = name; save(state); render(); }
}

// ── Step CRUD ─────────────────────────────────────────────────────────────────
function addStep(projectId, name, counterCount) {
  const p = getProject(projectId);
  if (!p) return;
  const counters = Array.from({ length: counterCount }, (_, i) => ({
    id: uid(), label: i === 0 ? 'Row' : `Counter ${i + 1}`, value: 0
  }));
  p.steps.push({ id: uid(), name, checked: false, counters });
  save(state);
  renderProject();
}

function deleteStep(projectId, stepId) {
  const p = getProject(projectId);
  if (!p) return;
  p.steps = p.steps.filter(s => s.id !== stepId);
  save(state);
  renderProject();
}

function toggleStep(projectId, stepId) {
  const p = getProject(projectId);
  const s = p?.steps.find(s => s.id === stepId);
  if (s) { s.checked = !s.checked; save(state); renderProject(); }
}

function renameStep(projectId, stepId, name) {
  const p = getProject(projectId);
  const s = p?.steps.find(s => s.id === stepId);
  if (s) { s.name = name; save(state); renderProject(); }
}

// ── Counter ops ───────────────────────────────────────────────────────────────
function changeCounter(projectId, stepId, counterId, delta) {
  const p = getProject(projectId);
  const s = p?.steps.find(s => s.id === stepId);
  const c = s?.counters.find(c => c.id === counterId);
  if (c) { c.value = Math.max(0, c.value + delta); save(state); updateCounterDisplay(counterId, c.value); }
}

function resetCounter(projectId, stepId, counterId) {
  if (!confirm('Reset this counter to 0?')) return;
  const p = getProject(projectId);
  const s = p?.steps.find(s => s.id === stepId);
  const c = s?.counters.find(c => c.id === counterId);
  if (c) { c.value = 0; save(state); updateCounterDisplay(counterId, 0); }
}

function renameCounter(projectId, stepId, counterId, label) {
  const p = getProject(projectId);
  const s = p?.steps.find(s => s.id === stepId);
  const c = s?.counters.find(c => c.id === counterId);
  if (c) { c.label = label; save(state); }
}

function updateCounterDisplay(counterId, value) {
  const el = document.getElementById(`cv-${counterId}`);
  if (el) el.textContent = value;
}

// ── PDF handling ──────────────────────────────────────────────────────────────
function handlePdfUpload(projectId, file) {
  if (!file || file.type !== 'application/pdf') { alert('Please select a PDF file.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const p = getProject(projectId);
    if (p) {
      p.pdfData = e.target.result; // base64 data URL
      save(state);
      renderProject();
    }
  };
  reader.readAsDataURL(file);
}

function removePdf(projectId) {
  const p = getProject(projectId);
  if (p) { p.pdfData = null; save(state); renderProject(); }
}

// ── Render: tabs ──────────────────────────────────────────────────────────────
function renderTabs() {
  const nav = document.getElementById('project-tabs');
  nav.innerHTML = '';
  state.projects.forEach(p => {
    const tab = document.createElement('div');
    tab.className = 'tab' + (p.id === state.activeId ? ' active' : '');
    tab.setAttribute('role', 'tab');

    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.name;
    nameSpan.style.cursor = 'pointer';
    nameSpan.addEventListener('click', () => { state.activeId = p.id; save(state); render(); });

    const renameBtn = document.createElement('button');
    renameBtn.className = 'tab-rename'; renameBtn.title = 'Rename'; renameBtn.textContent = '✎';
    renameBtn.addEventListener('click', e => { e.stopPropagation(); openRenameModal(p.id, p.name); });

    const delBtn = document.createElement('button');
    delBtn.className = 'tab-delete'; delBtn.title = 'Delete project'; delBtn.textContent = '✕';
    delBtn.addEventListener('click', e => { e.stopPropagation(); deleteProject(p.id); });

    tab.append(nameSpan, renameBtn, delBtn);
    nav.appendChild(tab);
  });
}

// ── Render: project body ──────────────────────────────────────────────────────
function renderProject() {
  const main = document.getElementById('project-view');
  const p = activeProject();

  if (!p) {
    main.innerHTML = '<div id="empty-state"><p>No projects yet.<br/>Tap <strong>＋</strong> to create your first project.</p></div>';
    return;
  }

  main.innerHTML = '';

  // PDF section
  const pdfSec = document.createElement('div');
  pdfSec.className = 'pdf-section';
  const pdfHeader = document.createElement('div');
  pdfHeader.className = 'pdf-section-header';
  const pdfLabel = document.createElement('span');
  pdfLabel.textContent = 'Pattern PDF';
  pdfHeader.appendChild(pdfLabel);
  pdfSec.appendChild(pdfHeader);

  if (p.pdfData) {
    const wrap = document.createElement('div');
    wrap.className = 'pdf-viewer-wrap';
    const iframe = document.createElement('iframe');
    iframe.src = p.pdfData;
    iframe.title = 'Pattern PDF';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'pdf-remove-btn';
    removeBtn.textContent = '✕ Remove';
    removeBtn.addEventListener('click', () => removePdf(p.id));
    wrap.append(iframe, removeBtn);
    pdfSec.appendChild(wrap);
  } else {
    const uploadArea = document.createElement('label');
    uploadArea.className = 'pdf-upload-area';
    uploadArea.innerHTML = `<span>📄 Tap to upload your pattern PDF</span><input type="file" accept="application/pdf" />`;
    uploadArea.querySelector('input').addEventListener('change', e => handlePdfUpload(p.id, e.target.files[0]));
    pdfSec.appendChild(uploadArea);
  }
  main.appendChild(pdfSec);

  // Steps section
  const stepsSec = document.createElement('div');
  stepsSec.className = 'steps-section';
  const stepsHeader = document.createElement('div');
  stepsHeader.className = 'steps-header';
  const stepsTitle = document.createElement('h3');
  stepsTitle.textContent = 'Steps';
  const addStepBtn = document.createElement('button');
  addStepBtn.className = 'btn primary small';
  addStepBtn.textContent = '＋ Add Step';
  addStepBtn.addEventListener('click', () => openStepModal(p.id));
  stepsHeader.append(stepsTitle, addStepBtn);
  stepsSec.appendChild(stepsHeader);

  p.steps.forEach(step => {
    const card = buildStepCard(p.id, step);
    stepsSec.appendChild(card);
  });

  main.appendChild(stepsSec);
}

function buildStepCard(projectId, step) {
  const card = document.createElement('div');
  card.className = 'step-card' + (step.checked ? ' done' : '');
  card.id = `step-${step.id}`;

  // Top row: checkbox + name + edit/delete buttons
  const top = document.createElement('div');
  top.className = 'step-top';

  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.className = 'step-checkbox'; cb.checked = step.checked;
  cb.addEventListener('change', () => toggleStep(projectId, step.id));

  const nameWrap = document.createElement('div');
  nameWrap.className = 'step-name-wrap';

  const nameEl = document.createElement('span');
  nameEl.className = 'step-name'; nameEl.textContent = step.name;

  const actions = document.createElement('div');
  actions.className = 'step-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'step-edit-btn'; editBtn.title = 'Rename step'; editBtn.textContent = '✎';
  editBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'step-name-input'; input.value = step.name;
    nameWrap.replaceChild(input, nameEl);
    input.focus(); input.select();
    const finish = () => {
      const val = input.value.trim() || step.name;
      renameStep(projectId, step.id, val);
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = step.name; input.blur(); } });
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'step-delete-btn'; delBtn.title = 'Delete step'; delBtn.textContent = '🗑';
  delBtn.addEventListener('click', () => {
    if (confirm(`Delete step "${step.name}"?`)) deleteStep(projectId, step.id);
  });

  actions.append(editBtn, delBtn);
  nameWrap.append(nameEl);
  top.append(cb, nameWrap, actions);
  card.appendChild(top);

  // Counters
  const countersEl = document.createElement('div');
  countersEl.className = 'counters';

  step.counters.forEach(counter => {
    const cEl = buildCounter(projectId, step.id, counter);
    countersEl.appendChild(cEl);
  });

  card.appendChild(countersEl);
  return card;
}

function buildCounter(projectId, stepId, counter) {
  const el = document.createElement('div');
  el.className = 'counter';

  // Label row
  const nameRow = document.createElement('div');
  nameRow.className = 'counter-name-row';

  const nameEl = document.createElement('span');
  nameEl.className = 'counter-name'; nameEl.textContent = counter.label;

  const nameEditBtn = document.createElement('button');
  nameEditBtn.className = 'counter-name-edit-btn'; nameEditBtn.title = 'Rename counter'; nameEditBtn.textContent = '✎';
  nameEditBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'counter-name-edit-input'; input.value = counter.label;
    nameRow.replaceChild(input, nameEl);
    nameRow.removeChild(nameEditBtn);
    input.focus(); input.select();
    const finish = () => {
      const val = input.value.trim() || counter.label;
      renameCounter(projectId, stepId, counter.id, val);
      nameEl.textContent = val;
      nameRow.replaceChild(nameEl, input);
      nameRow.appendChild(nameEditBtn);
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = counter.label; input.blur(); } });
  });

  nameRow.append(nameEl, nameEditBtn);

  // Value
  const valueEl = document.createElement('div');
  valueEl.className = 'counter-value'; valueEl.id = `cv-${counter.id}`; valueEl.textContent = counter.value;

  // Buttons
  const btnsRow = document.createElement('div');
  btnsRow.className = 'counter-btns';

  const decBtn = document.createElement('button');
  decBtn.className = 'counter-btn dec'; decBtn.textContent = '−'; decBtn.title = 'Decrease';
  decBtn.addEventListener('click', () => changeCounter(projectId, stepId, counter.id, -1));

  const incBtn = document.createElement('button');
  incBtn.className = 'counter-btn inc'; incBtn.textContent = '+'; incBtn.title = 'Increase';
  incBtn.addEventListener('click', () => changeCounter(projectId, stepId, counter.id, +1));

  btnsRow.append(decBtn, incBtn);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'counter-reset-btn'; resetBtn.textContent = 'reset';
  resetBtn.addEventListener('click', () => resetCounter(projectId, stepId, counter.id));

  el.append(nameRow, valueEl, btnsRow, resetBtn);
  return el;
}

// ── Full render ───────────────────────────────────────────────────────────────
function render() {
  renderTabs();
  renderProject();
}

// ── Modals ────────────────────────────────────────────────────────────────────
let _modalMode = 'create'; // 'create' | 'rename'
let _renameId = null;

function openCreateModal() {
  _modalMode = 'create'; _renameId = null;
  document.getElementById('modal-title').textContent = 'New Project';
  document.getElementById('modal-confirm').textContent = 'Create';
  document.getElementById('modal-input').value = '';
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-input').focus();
}

function openRenameModal(id, currentName) {
  _modalMode = 'rename'; _renameId = id;
  document.getElementById('modal-title').textContent = 'Rename Project';
  document.getElementById('modal-confirm').textContent = 'Rename';
  document.getElementById('modal-input').value = currentName;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-input').focus();
  document.getElementById('modal-input').select();
}

function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

function confirmModal() {
  const name = document.getElementById('modal-input').value.trim();
  if (!name) return;
  if (_modalMode === 'create') createProject(name);
  else if (_modalMode === 'rename') renameProject(_renameId, name);
  closeModal();
}

let _stepProjectId = null;
function openStepModal(projectId) {
  _stepProjectId = projectId;
  document.getElementById('step-modal-input').value = '';
  document.getElementById('step-counter-count').value = '2';
  document.getElementById('step-modal-overlay').classList.remove('hidden');
  document.getElementById('step-modal-input').focus();
}

function closeStepModal() { document.getElementById('step-modal-overlay').classList.add('hidden'); }

function confirmStepModal() {
  const name = document.getElementById('step-modal-input').value.trim();
  if (!name) return;
  const count = parseInt(document.getElementById('step-counter-count').value, 10);
  addStep(_stepProjectId, name, count);
  closeStepModal();
}

// ── Event wiring ──────────────────────────────────────────────────────────────
document.getElementById('add-project-btn').addEventListener('click', openCreateModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-confirm').addEventListener('click', confirmModal);
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
document.getElementById('modal-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmModal(); if (e.key === 'Escape') closeModal(); });

document.getElementById('step-modal-cancel').addEventListener('click', closeStepModal);
document.getElementById('step-modal-confirm').addEventListener('click', confirmStepModal);
document.getElementById('step-modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeStepModal(); });
document.getElementById('step-modal-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmStepModal(); if (e.key === 'Escape') closeStepModal(); });

// ── Init ──────────────────────────────────────────────────────────────────────
render();
