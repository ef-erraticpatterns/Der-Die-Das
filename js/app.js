/* ── App — Router, Dashboard, State Manager ── */
const App = (() => {

  let state = null;
  let patternWeakness = null;

  const SCREENS = ['home','dict','pro','stats','grammar'];

  /* ── State ── */
  function getState() { return state; }
  function setState(newState) {
    state = newState;
    Store.save(state);
    updateHeader();
  }

  /* ── Init ── */
  async function init() {
    state = Store.load();
    state = Store.checkDateRollover(state);
    Store.save(state);

    // Open IndexedDB eagerly
    await Store.openDB().catch(() => {});

    // Load word data
    await loadWords();

    // Init screens
    initNav();
    initDashboard();
    initPracticeScreen();
    initDictScreen();
    initProScreen();
    initStatsScreen();
    initGrammarScreen();
    initSettingsModal();
    initConfirmDialog();

    // Notifications
    Notifications.showBanner(state);
    Notifications.updateBadge(Math.max(0, state.user.dailyGoal - state.today.wordsCompleted));
    if (state.user.notificationsEnabled) {
      await Notifications.registerPeriodicSync();
      Notifications.scheduleReminders(state);
    }

    // Detect error patterns in background
    Adaptive.detectErrorPatterns().then(p => { patternWeakness = p; });

    // Ensure back button shows exit dialog instead of leaving the app
    history.replaceState({ screen: 'home' }, '', location.href);

    // Handle URL shortcut ?screen=practice
    const params = new URLSearchParams(location.search);
    if (params.get('screen') === 'practice') {
      setTimeout(() => startPractice(), 300);
    } else {
      showScreen('home');
    }

    // Service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  async function loadWords() {
    // Words are loaded via <script> tags assigning to window.GermanData
    // Merge all word sources
    const gd = window.GermanData || {};
    const core = gd.wordsCore || [];
    const pro  = gd.wordsProfessional || [];
    const ext  = gd.wordsExtended || [];
    window._allWords = [...core, ...pro, ...ext];
    // Init dictionary with core + pro for now
    Dictionary.init([...core, ...pro]);
  }

  /* ── Navigation ── */
  function initNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const screen = btn.dataset.screen;
        if (screen) showScreen(screen);
      });
    });
    document.getElementById('btn-settings').addEventListener('click', openSettings);
  }

  function showScreen(name) {
    if (name === 'home') {
      refreshDashboard();
    } else if (name === 'stats') {
      Stats.render(state);
    } else if (name === 'grammar') {
      Grammar.init();
    }

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`screen-${name}`);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.screen === name);
    });

    // Update browser history for back-button support
    history.pushState({ screen: name }, '', name === 'home' ? '/' : `/?s=${name}`);
  }

  window.addEventListener('popstate', e => {
    const s = e.state && e.state.screen;
    if (s) {
      showScreen(s);
    } else {
      // No state = user pressed back past app entry — show exit dialog
      history.pushState({ screen: 'home' }, '', '/');
      showConfirm(
        'App verlassen? · Exit app?',
        'Möchtest du die App wirklich schließen? · Do you really want to close the app?',
        () => history.go(-2)
      );
    }
  });

  /* ── Header ── */
  function updateHeader() {
    const streakEl = document.querySelector('.header-streak');
    if (streakEl) {
      const s = state.user.currentStreak;
      streakEl.textContent = s > 0 ? `🔥 ${s}` : '—';
    }
  }

  /* ── Dashboard ── */
  function initDashboard() {
    const startBtn = document.getElementById('btn-start-practice');
    if (startBtn) startBtn.addEventListener('click', () => startPractice());
    const previewCard = document.getElementById('preview-card');
    if (previewCard) previewCard.addEventListener('click', () => startPractice());

    document.getElementById('btn-enable-notif').addEventListener('click', async () => {
      const granted = await Notifications.requestPermission();
      if (granted) {
        state.user.notificationsEnabled = true;
        setState(state);
        document.getElementById('notif-banner').classList.add('hidden');
        toast('Erinnerungen aktiviert · Reminders enabled ✓');
        Notifications.registerPeriodicSync();
        Notifications.scheduleReminders(state);
      } else {
        toast('Benachrichtigungen blockiert · Notifications blocked');
      }
    });

    document.getElementById('btn-dismiss-notif').addEventListener('click', () => {
      state.user.notifDismissed = true;
      setState(state);
      document.getElementById('notif-banner').classList.add('hidden');
    });

    document.querySelectorAll('.quick-card').forEach(card => {
      card.addEventListener('click', () => {
        const screen = card.dataset.screen;
        if (screen) showScreen(screen);
      });
    });
  }

  function refreshDashboard() {
    if (!state) return;
    updateHeader();

    const done = state.today.wordsCompleted;
    const goal = state.user.dailyGoal;
    const pct = goal > 0 ? done / goal : 0;

    // Progress ring — always neon green, stroke color set in CSS
    const ring = document.querySelector('.hero-ring svg .ring-fill');
    if (ring) {
      const circ = 2 * Math.PI * 58;
      ring.style.strokeDasharray = circ;
      ring.style.strokeDashoffset = circ * (1 - Math.min(pct, 1));
    }

    // Ring center
    const ringCount = document.querySelector('.ring-count');
    if (ringCount) ringCount.textContent = done;
    const ringGoal = document.querySelector('.ring-goal');
    if (ringGoal) ringGoal.textContent = `/ ${goal}`;

    // CTA button
    const btn = document.getElementById('btn-start-practice');
    if (btn) {
      if (pct >= 1) {
        btn.className = 'btn-cta done';
        btn.innerHTML = `Fertig für heute! · Done for today! ✓<span class="cta-sub">Bonus-Übung starten · Start bonus practice</span>`;
      } else if (done > 0) {
        btn.className = 'btn-cta';
        btn.innerHTML = `Weiter üben · Continue practice<span class="cta-sub">${goal - done} Wörter übrig · ${goal - done} words left</span>`;
      } else {
        btn.className = 'btn-cta';
        btn.innerHTML = `Übung starten · Start Practice<span class="cta-sub">Täglich ${goal} Wörter · ${goal} words daily</span>`;
      }
    }

    // Mini progress rings (TAG / WOCHE / MONAT)
    const miniCirc = 2 * Math.PI * 18; // r=18 in viewBox 44×44 → circ≈113.1
    const dayFill = document.getElementById('mini-day-fill');
    const dayVal  = document.getElementById('mini-daily-val');
    if (dayFill) {
      dayFill.style.strokeDasharray  = miniCirc;
      dayFill.style.strokeDashoffset = miniCirc * (1 - Math.min(pct, 1));
    }
    if (dayVal) dayVal.textContent = done;

    const weekCount = Utils.getWeeklyCount(state);
    const weekFill = document.getElementById('mini-week-fill');
    const weekVal  = document.getElementById('mini-weekly-val');
    if (weekFill) {
      weekFill.style.strokeDasharray  = miniCirc;
      weekFill.style.strokeDashoffset = miniCirc * (1 - Math.min(weekCount / 7, 1));
    }
    if (weekVal) weekVal.textContent = weekCount;

    const monthCount = Utils.getMonthlyCount(state);
    const monthFill = document.getElementById('mini-month-fill');
    const monthVal  = document.getElementById('mini-monthly-val');
    if (monthFill) {
      monthFill.style.strokeDasharray  = miniCirc;
      monthFill.style.strokeDashoffset = miniCirc * (1 - Math.min(monthCount / 30, 1));
    }
    if (monthVal) monthVal.textContent = monthCount;

    // Today stats
    const tc = document.getElementById('today-correct');
    const tw = document.getElementById('today-wrong');
    const ta = document.getElementById('today-accuracy');
    if (tc) tc.textContent = state.today.correctAnswers;
    if (tw) tw.textContent = state.today.wrongAnswers;
    const acc = state.today.wordsCompleted > 0
      ? Utils.pct(state.today.correctAnswers, state.today.wordsCompleted)
      : 0;
    if (ta) ta.textContent = acc + '%';

    // Notification banner
    Notifications.showBanner(state);

    // Update badge
    Notifications.updateBadge(Math.max(0, goal - done));

    refreshPreviewCard();
  }

  function refreshPreviewCard() {
    const gd = window.GermanData || {};
    const pool = gd.wordsCore || [];
    if (!pool.length) return;
    const word = pool[Math.floor(Math.random() * pool.length)];
    const translations = gd.en || {};
    const articleEl = document.getElementById('preview-article');
    const nounEl = document.getElementById('preview-noun');
    const enEl = document.getElementById('preview-en');
    if (articleEl) {
      articleEl.textContent = word.article;
      articleEl.className = 'preview-article ' + word.article;
    }
    if (nounEl) nounEl.textContent = word.noun;
    if (enEl) enEl.textContent = word.en || translations[word.noun] || '';
  }

  /* ── Practice ── */
  function initPracticeScreen() {
    document.getElementById('btn-exit-practice').addEventListener('click', () => {
      Practice.confirmExit();
    });
    document.getElementById('btn-continue').addEventListener('click', () => {
      Practice.showQuestion();
    });
    document.getElementById('btn-done').addEventListener('click', () => {
      document.getElementById('session-complete').classList.add('hidden');
      Practice.exitSession();
    });
    ['der','die','das'].forEach(art => {
      document.getElementById(`btn-${art}`).addEventListener('click', () => {
        Practice.handleAnswer(art);
      });
    });
  }

  async function startPractice(ruleId = null) {
    const gd = window.GermanData || {};
    let pool = [...(gd.wordsCore || [])];

    if (state.settings.includeProfessional) {
      const proWords = gd.wordsProfessional || [];
      const domains = state.settings.professionalDomains || [];
      const filtered = domains.length > 0
        ? proWords.filter(w => domains.includes(w.subDomain))
        : proWords;
      pool = [...pool, ...filtered];
    }

    // Rule-filtered practice
    if (ruleId) {
      const rules = gd.grammarRules || [];
      const rule = rules.find(r => r.id === ruleId);
      if (rule && rule.pattern) {
        const re = new RegExp(rule.pattern.source || rule.pattern);
        pool = pool.filter(w => re.test(w.noun) || w.article === rule.article);
      }
    }

    // Add custom queue words
    if (state.customQueue && state.customQueue.length > 0) {
      const allWords = window._allWords || [];
      const customWords = allWords.filter(w => state.customQueue.includes(w.id));
      pool = [...customWords, ...pool.filter(w => !state.customQueue.includes(w.id))];
    }

    if (pool.length === 0) {
      toast('Keine Wörter verfügbar · No words available');
      return;
    }

    const queue = await Adaptive.buildSessionQueue(pool, state.user.dailyGoal, patternWeakness);
    showScreen('practice');
    Practice.startSession(queue, state);
  }

  function startRulePractice(ruleId) {
    showScreen('home');
    setTimeout(() => startPractice(ruleId), 100);
  }

  /* ── Dictionary screen ── */
  function initDictScreen() {
    const input = document.getElementById('dict-search-input');
    const clearBtn = document.getElementById('btn-clear-search');
    const onInput = Utils.debounce(() => {
      clearBtn.classList.toggle('hidden', !input.value);
      Dictionary.filter(input.value, getActiveFilter());
    }, 200);
    input.addEventListener('input', onInput);
    clearBtn.addEventListener('click', () => { input.value = ''; clearBtn.classList.add('hidden'); Dictionary.filter('', getActiveFilter()); });

    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        Dictionary.filter(input.value, chip.dataset.filter);
      });
    });

    document.getElementById('btn-back-dict').addEventListener('click', () => {
      Dictionary.closeDetail();
    });
  }

  function getActiveFilter() {
    const active = document.querySelector('.filter-chip.active');
    return active ? active.dataset.filter : 'all';
  }

  /* ── Professional screen ── */
  function initProScreen() {
    document.querySelectorAll('.pro-cat-card').forEach(card => {
      card.addEventListener('click', () => {
        const domain = card.dataset.domain;
        openProDomain(domain, card.querySelector('.pro-cat-name').textContent);
      });
    });
  }

  function openProDomain(domain, title) {
    const listScreen = document.getElementById('pro-word-list');
    if (!listScreen) return;
    listScreen.querySelector('.pro-word-list-title').textContent = title;
    listScreen.style.display = '';

    const gd = window.GermanData || {};
    const words = (gd.wordsProfessional || []).filter(w => w.subDomain === domain || w.domain === domain);
    renderProList(words, listScreen);
  }

  function renderProList(words, container) {
    const list = container.querySelector('.pro-word-list');
    if (!list) return;
    list.innerHTML = words.map(w => `
      <div class="dict-item" style="position:relative;height:auto;padding:12px 16px;">
        <span class="article-badge badge-${w.article}">${w.article}</span>
        <div class="dict-item-text">
          <div class="dict-item-noun">${w.noun}</div>
          <div class="dict-item-sub">${w.plural ? `Pl: ${w.plural}` : ''}</div>
        </div>
        <span class="dict-item-arrow">›</span>
      </div>
    `).join('');
    list.querySelectorAll('.dict-item').forEach((el, i) => {
      el.addEventListener('click', () => Dictionary.showWordDetail(words[i]));
    });
  }

  /* ── Stats screen ── */
  function initStatsScreen() {
    document.getElementById('btn-export-data').addEventListener('click', exportData);
    document.getElementById('btn-reset-data').addEventListener('click', () => {
      showConfirm(
        'Alle Daten löschen? · Delete all data?',
        'Dein Fortschritt, Streifen und Abzeichen werden gelöscht. · Your progress, streaks and badges will be deleted.',
        async () => {
          await Store.clearAllWordProgress();
          state = Store.load();
          Store.save(state);
          toast('Daten gelöscht · Data deleted');
          Stats.render(state);
        }
      );
    });
  }

  function exportData() {
    const data = {
      exportedAt: new Date().toISOString(),
      state,
      version: 1
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `artikel-trainer-backup-${Utils.todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Daten exportiert · Data exported');
  }

  /* ── Grammar screen ── */
  function initGrammarScreen() {
    document.querySelectorAll('.grammar-tab').forEach(tab => {
      tab.addEventListener('click', () => Grammar.setTab(tab.dataset.tab));
    });
    const gInput = document.getElementById('grammar-search-input');
    if (gInput) {
      gInput.addEventListener('input', Utils.debounce(() => Grammar.setSearch(gInput.value), 250));
    }
  }

  /* ── Settings modal ── */
  function initSettingsModal() {
    const modal = document.getElementById('settings-modal');
    document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
    modal.addEventListener('click', e => { if (e.target === modal) closeSettings(); });

    // Daily goal input
    const goalInput = document.getElementById('settings-goal');
    if (goalInput) {
      goalInput.value = state.user.dailyGoal;
      goalInput.addEventListener('change', () => {
        const val = parseInt(goalInput.value);
        if (val >= 5 && val <= 100) {
          state.user.dailyGoal = val;
          setState(state);
        }
      });
    }

    // Pro vocabulary toggle
    const proToggle = document.getElementById('toggle-pro');
    if (proToggle) {
      proToggle.classList.toggle('on', state.settings.includeProfessional);
      proToggle.addEventListener('click', () => {
        state.settings.includeProfessional = !state.settings.includeProfessional;
        proToggle.classList.toggle('on', state.settings.includeProfessional);
        setState(state);
      });
    }

    // Case depth toggle
    const caseToggle = document.getElementById('toggle-cases');
    if (caseToggle) {
      caseToggle.classList.toggle('on', state.settings.caseDepth === 'all');
      caseToggle.addEventListener('click', () => {
        state.settings.caseDepth = state.settings.caseDepth === 'all' ? 'nominative' : 'all';
        caseToggle.classList.toggle('on', state.settings.caseDepth === 'all');
        setState(state);
        toast(state.settings.caseDepth === 'all'
          ? 'Alle 4 Fälle aktiv · All 4 cases active'
          : 'Nur Nominativ · Nominative only');
      });
    }
  }

  function openSettings() {
    document.getElementById('settings-modal').classList.remove('hidden');
    const streakVal = document.getElementById('settings-streak-val');
    if (streakVal) streakVal.textContent = state.user.currentStreak;
  }

  function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
  }

  /* ── Confirm dialog ── */
  function initConfirmDialog() {
    const dialog = document.getElementById('confirm-dialog');
    const hideDialog = () => {
      dialog.classList.add('hidden');
      document.body.style.overflow = '';
    };
    document.getElementById('btn-confirm-cancel').addEventListener('click', hideDialog);
    document.getElementById('btn-confirm-ok').addEventListener('click', () => {
      hideDialog();
      if (dialog._onConfirm) dialog._onConfirm();
    });
  }

  function showConfirm(title, text, onConfirm) {
    const dialog = document.getElementById('confirm-dialog');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-text').textContent = text;
    dialog._onConfirm = onConfirm;
    dialog.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  /* ── Toast ── */
  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }

  return {
    init, getState, setState, showScreen, refreshDashboard,
    startPractice, startRulePractice, showConfirm, toast
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
