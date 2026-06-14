/* ── Gamification — Streaks and encouragement only ── */
const Gamification = (() => {

  function updateStreak(state) {
    const today = Utils.todayISO();
    const last = state.user.lastPracticeDate;
    if (!last) {
      state.user.currentStreak = 1;
    } else if (last === today) {
      // already counted today
    } else if (Utils.daysBetween(last, today) === 1) {
      state.user.currentStreak += 1;
    } else {
      state.user.currentStreak = 1;
    }
    state.user.lastPracticeDate = today;
    state.user.longestStreak = Math.max(state.user.longestStreak, state.user.currentStreak);
    return state;
  }

  const ENCOURAGEMENTS_DE = [
    'Du schaffst das! 💪', 'Weiter so!', 'Jeden Tag ein bisschen besser!',
    'Artikel meistern dauert seine Zeit — du bist auf dem richtigen Weg!',
    'Grammatik ist kein Sprint, sondern ein Marathon.', 'Sehr gut!',
    'Dein Deutsch wird jeden Tag besser!', 'Toll gemacht!',
    'Bleib dran — du merkst den Unterschied!', 'Jeden Tag zählt!'
  ];
  const ENCOURAGEMENTS_EN = [
    'You can do it! 💪', 'Keep going!', 'Getting a little better every day!',
    'Mastering articles takes time — you\'re on the right path!',
    'Grammar is a marathon, not a sprint.', 'Very good!',
    'Your German improves every day!', 'Well done!',
    'Stick with it — you\'ll feel the difference!', 'Every day counts!'
  ];

  function randomEncouragement() {
    const i = Math.floor(Math.random() * ENCOURAGEMENTS_DE.length);
    return `${ENCOURAGEMENTS_DE[i]}\n${ENCOURAGEMENTS_EN[i]}`;
  }

  return { updateStreak, randomEncouragement };
})();
