import { game } from './hooks/useGame.js';
import { hostStore } from './hooks/useHost.js';
import { Home } from './pages/Home.js';
import { JoinRoom } from './pages/JoinRoom.js';
import { ActiveRoom } from './pages/ActiveRoom.js';
import { HostAuthPage, HostDashboard, HostQuizEditor, HostQuizPreview, HostRoom, createBlankQuestion } from './pages/HostPages.js';
import { hasHostAccessToken } from './services/hostAuth.js';
import { navigate, resolveRoute } from './services/router.js';

const app = document.querySelector('#app');
function render() {
  const path = location.pathname;
  const route = resolveRoute(path, hasHostAccessToken());
  if (route.view === 'redirect') {
    navigate(route.to);
    return;
  }
  if (route.view === 'host-login' || route.view === 'host-register') {
    app.innerHTML = HostAuthPage(hostStore.state, route.view === 'host-register' ? 'register' : 'login');
  } else if (route.view === 'host-room') {
    app.innerHTML = HostRoom({ ...game.state, hostEmail: hostStore.state.host?.email });
  } else if (route.view === 'host-quiz-editor') {
    app.innerHTML = hostStore.state.loading && !hostStore.state.editingQuiz ? '<main class="host-dashboard"><p class="empty-state">Loading quiz…</p></main>' : HostQuizEditor(hostStore.state);
  } else if (route.view === 'host-quiz-preview') {
    app.innerHTML = HostQuizPreview(hostStore.state);
  } else if (route.view === 'host-dashboard') {
    app.innerHTML = hostStore.state.loading ? '<main class="host-dashboard"><p class="empty-state">Loading your host dashboard…</p></main>' : HostDashboard(hostStore.state);
  } else {
    const { state } = game;
    app.innerHTML = state.screen === 'home' ? Home(state) : state.screen === 'join' ? JoinRoom(state) : ActiveRoom(state);
  }
  bind();
}

function bind() {
  document.querySelectorAll('[data-nav]').forEach((element) => element.addEventListener('click', (event) => {
    event.preventDefault();
    navigate(element.dataset.nav);
  }));
  document.querySelectorAll('[data-screen]').forEach(button => button.addEventListener('click', () => game.update({ screen: button.dataset.screen })));
  document.querySelectorAll('[data-action="host"]').forEach(button => button.addEventListener('click', () => navigate(hasHostAccessToken() ? '/host' : '/host/login')));
  document.querySelectorAll('[data-action="start"]').forEach(button => button.addEventListener('click', () => game.start()));
  document.querySelectorAll('[data-action="next-question"]').forEach(button => button.addEventListener('click', () => game.nextQuestion()));
  document.querySelectorAll('[data-action="leave"]').forEach(button => button.addEventListener('click', () => game.leave()));
  document.querySelectorAll('[data-action="host-leave-room"]').forEach(button => button.addEventListener('click', () => hostStore.leaveRoom()));
  document.querySelectorAll('[data-action="host-logout"]').forEach(button => button.addEventListener('click', () => hostStore.logout()));
  document.querySelectorAll('[data-action="create-quiz"]').forEach(button => button.addEventListener('click', () => hostStore.createQuiz()));
  document.querySelectorAll('[data-action="create-room"]').forEach(button => button.addEventListener('click', () => hostStore.createRoom(button.dataset.setId)));
  document.querySelectorAll('[data-action="edit-quiz"]').forEach(button => button.addEventListener('click', () => hostStore.editQuiz(button.dataset.quizId)));
  document.querySelectorAll('[data-action="preview-quiz"]').forEach(button => button.addEventListener('click', () => hostStore.openPreview(button.dataset.quizId)));
  document.querySelectorAll('[data-action="delete-quiz"]').forEach(button => button.addEventListener('click', () => hostStore.deleteQuiz(button.dataset.quizId)));
  document.querySelectorAll('[data-action="publish-quiz"]').forEach(button => button.addEventListener('click', () => hostStore.editQuiz(button.dataset.quizId)));
  document.querySelectorAll('[data-action="open-room"]').forEach(button => button.addEventListener('click', () => hostStore.openRoom(button.dataset.code)));
  const quizForm = document.querySelector('#quiz-editor');
  const readQuiz = () => {
    const original = hostStore.state.editingQuiz;
    if (!quizForm || !original) return original;
    const field = (name) => quizForm.querySelector(`[data-quiz-field="${name}"]`)?.value ?? '';
    const questions = [...quizForm.querySelectorAll('[data-question-id]')].map((card, index) => {
      const get = (name) => card.querySelector(`[data-question-field="${name}"]`)?.value ?? '';
      const options = [...card.querySelectorAll('[data-option-text]')].map((input) => ({ id: input.dataset.optionText, text: input.value }));
      return {
        ...original.questions.find((question) => question.id === card.dataset.questionId),
        prompt: get('prompt'), topic: get('topic'), explanation: get('explanation'),
        durationSeconds: get('durationSeconds') ? Number(get('durationSeconds')) : null,
        marks: get('marks') === '' ? null : Number(get('marks')),
        options, correctOptionId: card.querySelector('input[type="radio"]:checked')?.value ?? null, position: index
      };
    });
    return {
      ...original, title: field('title'), description: field('description'),
      defaultDurationSeconds: Number(field('defaultDurationSeconds')),
      defaultMarks: Number(field('defaultMarks')), questions
    };
  };
  quizForm?.addEventListener('input', () => {
    const status = document.querySelector('#quiz-save-state');
    if (status) status.textContent = 'Unsaved changes';
  });
  document.querySelectorAll('[data-action="save-quiz"]').forEach(button => button.addEventListener('click', () => hostStore.saveQuiz(readQuiz())));
  document.querySelectorAll('[data-action="preview-quiz-current"]').forEach(button => button.addEventListener('click', () => hostStore.previewQuiz(readQuiz())));
  document.querySelectorAll('[data-action="publish-quiz-current"]').forEach(button => button.addEventListener('click', () => hostStore.publishQuiz(readQuiz())));
  document.querySelectorAll('[data-action="add-question"]').forEach(button => button.addEventListener('click', () => {
    const quiz = readQuiz(); quiz.questions.push(createBlankQuestion()); hostStore.markQuizDirty(quiz);
  }));
  document.querySelectorAll('[data-action="remove-question"]').forEach(button => button.addEventListener('click', () => {
    const quiz = readQuiz(); quiz.questions.splice(Number(button.dataset.index), 1); quiz.questions.forEach((question, index) => { question.position = index; }); hostStore.markQuizDirty(quiz);
  }));
  document.querySelectorAll('[data-action="move-question"]').forEach(button => button.addEventListener('click', () => {
    const quiz = readQuiz(); const index = Number(button.dataset.index); const next = index + (button.dataset.direction === 'up' ? -1 : 1);
    [quiz.questions[index], quiz.questions[next]] = [quiz.questions[next], quiz.questions[index]]; quiz.questions.forEach((question, position) => { question.position = position; }); hostStore.markQuizDirty(quiz);
  }));
  document.querySelectorAll('[data-action="add-option"]').forEach(button => button.addEventListener('click', () => {
    const quiz = readQuiz(); const question = quiz.questions[Number(button.dataset.index)];
    if (question.options.length < 10) question.options.push({ id: crypto.randomUUID(), text: '' }); hostStore.markQuizDirty(quiz);
  }));
  document.querySelectorAll('[data-action="remove-option"]').forEach(button => button.addEventListener('click', () => {
    const quiz = readQuiz(); const question = quiz.questions[Number(button.dataset.questionIndex)]; const [removed] = question.options.splice(Number(button.dataset.optionIndex), 1);
    if (question.correctOptionId === removed.id) question.correctOptionId = null; hostStore.markQuizDirty(quiz);
  }));
  document.querySelectorAll('[data-answer]').forEach(button => button.addEventListener('click', () => game.submitAnswer(button.dataset.answer)));
  document.querySelectorAll('[data-action="host-copy-link"]').forEach(button => button.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(game.state.joinUrl);
    button.textContent = 'LINK COPIED';
  }));
  const authForm = document.querySelector('#host-auth-form');
  if (authForm) authForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(authForm);
    hostStore.authenticate(String(form.get('email') || '').trim(), String(form.get('password') || ''), location.pathname === '/host/register' ? 'register' : 'login');
  });
  const form = document.querySelector('#join-form');
  if (form) form.addEventListener('submit', event => {
    event.preventDefault();
    game.join(document.querySelector('#player-name').value.trim(), '', document.querySelector('#room-code').value.trim());
  });
  const copy = document.querySelector('#copy-code');
  if (copy) copy.addEventListener('click', async () => { await navigator.clipboard?.writeText(game.state.roomCode); copy.textContent = 'COPIED!'; });
  const copyLink = document.querySelector('#copy-link');
  if (copyLink) copyLink.addEventListener('click', async () => { await navigator.clipboard?.writeText(game.state.joinUrl); copyLink.textContent = 'LINK COPIED'; });
}

game.addEventListener('change', render);
hostStore.addEventListener('change', render);
window.addEventListener('popstate', render);
render();
hostStore.restore();
game.restoreSession();
game.loadLeague();
