/* ── Practice Screen — Session State Machine ── */
const Practice = (() => {

  let session = null;
  let currentItem = null;
  let questionStartTime = 0;
  let answered = false;
  let speedStreak = 0;

  const CASE_LABELS = {
    nominative: { de: 'Nominativ', en: 'Nominative (Subject)' },
    accusative: { de: 'Akkusativ', en: 'Accusative (Direct Object)' },
    dative:     { de: 'Dativ',     en: 'Dative (Indirect Object)' },
    genitive:   { de: 'Genitiv',   en: 'Genitive (Possession)' }
  };

  /* ── DOM refs ── */
  const els = () => ({
    screen:       document.getElementById('screen-practice'),
    progressFill: document.getElementById('practice-prog-fill'),
    progressText: document.getElementById('practice-prog-text'),
    xpDisplay:    document.getElementById('practice-xp'),
    caseChip:     document.getElementById('q-case-chip'),
    noun:         document.getElementById('q-noun'),
    plural:       document.getElementById('q-plural'),
    sentence:     document.getElementById('q-sentence'),
    card:         document.getElementById('question-card'),
    tipCard:      document.getElementById('tip-card'),
    tipRule:      document.getElementById('tip-rule'),
    tipEn:        document.getElementById('tip-en'),
    derBtn:       document.getElementById('btn-der'),
    dieBtn:       document.getElementById('btn-die'),
    dasBtn:       document.getElementById('btn-das'),
    continueBtn:  document.getElementById('btn-continue'),
    completeScreen: document.getElementById('session-complete'),
    completeEmoji:  document.getElementById('session-emoji'),
    completeTitle:  document.getElementById('session-title'),
    completeSub:    document.getElementById('session-sub'),
    ssCorrect:    document.getElementById('ss-correct'),
    ssWrong:      document.getElementById('ss-wrong'),
    ssXP:         document.getElementById('ss-xp'),
    confettiWrap: document.getElementById('confetti-wrap')
  });

  /* ── Start session ── */
  async function startSession(words, appState) {
    const e = els();
    session = {
      id: 'session-' + Utils.todayISO() + '-' + Date.now(),
      date: Utils.todayISO(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      queue: words,   // [{word, cas}]
      index: 0,
      correct: 0,
      wrong: 0,
      xpEarned: 0,
      speedStreak: 0,
      wordsDetail: []
    };
    speedStreak = 0;

    document.body.classList.add('practice-mode');
    e.completeScreen.classList.add('hidden');
    e.xpDisplay.textContent = '0 XP';
    showQuestion();
  }

  /* ── Show question ── */
  function showQuestion() {
    const e = els();
    if (session.index >= session.queue.length) { endSession(); return; }

    currentItem = session.queue[session.index];
    answered = false;
    questionStartTime = Date.now();

    const { word, cas } = currentItem;
    const caseData = word.cases[cas] || word.cases.nominative;
    const label = CASE_LABELS[cas] || CASE_LABELS.nominative;

    // Reset card state
    e.card.className = 'question-card';
    e.tipCard.classList.add('hidden');
    e.continueBtn.classList.remove('show');
    [e.derBtn, e.dieBtn, e.dasBtn].forEach(btn => {
      btn.className = btn.className.split(' ').filter(c => !['selected-correct','selected-wrong','disabled'].includes(c)).join(' ');
    });

    // Case chip
    e.caseChip.textContent = `${label.de} · ${label.en}`;

    // Noun
    e.noun.textContent = word.noun;

    // Plural
    e.plural.textContent = word.plural ? `Pl: ${word.plural}` : '';

    // Sentence with blank
    const example = (word.examples && word.examples.length > 0)
      ? word.examples[Math.floor(Math.random() * word.examples.length)]
      : '';
    if (example) {
      const articleForms = ['der','die','das','den','dem','des'];
      let sentHtml = example;
      for (const art of articleForms) {
        sentHtml = sentHtml.replace(
          new RegExp(`\\b${art}\\b`, 'i'),
          (match) => `<span class="blank">${match[0].toUpperCase() === match[0] ? '___' : '___'}</span>`
        );
        break;
      }
      e.sentence.innerHTML = sentHtml;
      e.sentence.style.display = '';
    } else {
      e.sentence.style.display = 'none';
    }

    // Update progress
    updateProgress();
  }

  function updateProgress() {
    const e = els();
    const total = session.queue.length;
    const done = session.index;
    const pctVal = total > 0 ? (done / total) * 100 : 0;
    e.progressFill.style.width = pctVal + '%';
    e.progressText.textContent = `${done} / ${total}`;
    e.xpDisplay.textContent = session.xpEarned + ' XP';
  }

  /* ── Handle answer ── */
  async function handleAnswer(chosenArticle) {
    if (answered) return;
    answered = true;

    const e = els();
    const { word, cas } = currentItem;
    const caseData = word.cases[cas] || word.cases.nominative;
    const correctArticle = caseData.article;
    const responseMs = Date.now() - questionStartTime;
    const wasCorrect = chosenArticle === correctArticle;

    // Visual feedback on buttons
    const btnMap = { der: e.derBtn, die: e.dieBtn, das: e.dasBtn };
    const chosenBtn = btnMap[chosenArticle];
    const correctBtn = btnMap[correctArticle];

    if (wasCorrect) {
      chosenBtn.classList.add('selected-correct');
    } else {
      chosenBtn.classList.add('selected-wrong');
      correctBtn.classList.add('selected-correct');
    }
    Object.values(btnMap).forEach(btn => btn.classList.add('disabled'));

    // Card animation
    if (wasCorrect) {
      e.card.classList.add('correct');
      speedStreak++;
      floatXP(e.card, calcXPForAnswer(wasCorrect, responseMs));
    } else {
      e.card.classList.add('wrong');
      speedStreak = 0;
      showTip(word, cas, correctArticle);
    }

    // Update progress data
    const progress = await Store.getWordProgress(word.id);
    progress.errorsByCase = progress.errorsByCase || { nominative:0, accusative:0, dative:0, genitive:0 };
    progress.errorsByArticle = progress.errorsByArticle || { der:0, die:0, das:0 };
    if (!wasCorrect) {
      progress.errorsByCase[cas] = (progress.errorsByCase[cas] || 0) + 1;
      progress.errorsByArticle[chosenArticle] = (progress.errorsByArticle[chosenArticle] || 0) + 1;
    }
    Adaptive.updateSM2(progress, wasCorrect, responseMs);
    await Store.setWordProgress(progress);

    // Session tallies
    const appState = App.getState();
    const xp = calcXPForAnswer(wasCorrect, responseMs);
    if (wasCorrect) {
      session.correct++;
      session.xpEarned += xp;
    } else {
      session.wrong++;
    }
    session.speedStreak = Math.max(session.speedStreak, speedStreak);
    session.wordsDetail.push({ wordId: word.id, correct: wasCorrect, case: cas, timeTaken: responseMs / 1000 });
    session.index++;

    // Update app state
    appState.today.wordsCompleted++;
    appState.today.xpEarned += xp;
    if (wasCorrect) appState.today.correctAnswers++;
    else            appState.today.wrongAnswers++;
    appState.user.totalWordsAnswered++;
    appState.user.totalCorrect += wasCorrect ? 1 : 0;
    appState.user.xp += xp;
    App.setState(appState);

    // Show continue button
    e.continueBtn.classList.add('show');
    e.continueBtn.textContent = session.index >= session.queue.length
      ? 'Fertig! / Done!'
      : 'Weiter / Continue';
  }

  function calcXPForAnswer(wasCorrect, responseMs) {
    const appState = App.getState();
    return Gamification.calcXP(wasCorrect, responseMs, appState.user.currentStreak, true);
  }

  function floatXP(card, xp) {
    if (xp <= 0) return;
    const el = document.createElement('div');
    el.className = 'xp-float';
    el.textContent = '+' + xp + ' XP';
    card.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function showTip(word, cas, correctArticle) {
    const e = els();
    e.tipCard.classList.remove('hidden');

    // Build tip text from word's tip or grammar rules
    const tip = word.tip || '';
    const casLabel = CASE_LABELS[cas].de;
    const articleClass = correctArticle;

    e.tipRule.innerHTML = `
      Im ${casLabel}: <span class="correct-answer ${articleClass}">${correctArticle}</span> ${word.noun}
      ${tip ? `<br><small style="opacity:0.7;font-weight:400;">${tip}</small>` : ''}
    `;
    e.tipEn.textContent = `In the ${CASE_LABELS[cas].en}: "${correctArticle} ${word.noun}"`;
  }

  /* ── End session ── */
  async function endSession() {
    const e = els();
    session.endedAt = new Date().toISOString();

    // Save session
    await Store.saveSession({
      id: session.id, date: session.date,
      startedAt: session.startedAt, endedAt: session.endedAt,
      wordsAttempted: session.index, correct: session.correct,
      wrong: session.wrong, xpEarned: session.xpEarned,
      speedStreak: session.speedStreak
    });

    // Update streak
    let appState = App.getState();
    if (session.correct > 0) {
      appState = Gamification.updateStreak(appState);
    }

    // Check goal completion
    const goalMet = appState.today.wordsCompleted >= appState.user.dailyGoal;
    if (goalMet) {
      appState.streakCalendar[Utils.todayISO()] = {
        completed: appState.today.wordsCompleted,
        goal: appState.user.dailyGoal,
        perfect: appState.today.wrongAnswers === 0
      };
    }

    // Check badges
    const newBadges = Gamification.checkBadges(appState, session);
    if (newBadges.length > 0) {
      appState.badges = [...(appState.badges || []), ...newBadges];
    }

    App.setState(appState);

    // Show complete screen
    const accuracy = session.index > 0 ? Math.round((session.correct / session.index) * 100) : 0;
    e.ssCorrect.textContent = session.correct;
    e.ssWrong.textContent = session.wrong;
    e.ssXP.textContent = '+' + session.xpEarned;

    if (session.wrong === 0 && session.correct >= 10) {
      e.completeEmoji.textContent = '🌟';
      e.completeTitle.textContent = 'Perfekt! / Perfect!';
      e.completeSub.textContent = 'Kein einziger Fehler! · Not a single mistake!';
      spawnConfetti();
    } else if (goalMet) {
      e.completeEmoji.textContent = '🎉';
      e.completeTitle.textContent = 'Tagesziel erreicht! / Daily goal done!';
      e.completeSub.textContent = `${accuracy}% Genauigkeit · ${accuracy}% accuracy`;
      spawnConfetti();
    } else {
      e.completeEmoji.textContent = '👍';
      e.completeTitle.textContent = 'Gut gemacht! / Well done!';
      e.completeSub.textContent = `${session.correct}/${session.index} richtig · ${accuracy}% accuracy`;
    }

    e.completeScreen.classList.remove('hidden');

    // Show new badge if any
    if (newBadges.length > 0) {
      setTimeout(() => App.showBadgeUnlock(newBadges[0].id), 1500);
    }
  }

  function spawnConfetti() {
    const e = els();
    if (!e.confettiWrap) return;
    const colors = ['#06d6a0','#ffd166','#ff6b8a','#4a9eff','#06d6a0'];
    for (let i = 0; i < 60; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.animationDuration = (1.5 + Math.random() * 2) + 's';
      p.style.animationDelay = Math.random() * 0.5 + 's';
      p.style.width = p.style.height = (6 + Math.random() * 6) + 'px';
      e.confettiWrap.appendChild(p);
      setTimeout(() => p.remove(), 4000);
    }
  }

  function exitSession() {
    document.body.classList.remove('practice-mode');
    session = null;
    App.showScreen('home');
    App.refreshDashboard();
  }

  /* ── Confirm exit ── */
  function confirmExit() {
    App.showConfirm(
      'Übung beenden? / End session?',
      'Dein bisheriger Fortschritt wird gespeichert. · Your progress so far will be saved.',
      () => {
        if (session && session.index > 0) {
          session.queue = session.queue.slice(0, session.index);
          endSession();
        } else {
          exitSession();
        }
      }
    );
  }

  return { startSession, handleAnswer, showQuestion, exitSession, confirmExit };
})();
