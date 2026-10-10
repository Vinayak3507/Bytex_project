import { api } from '../services/api.js';
import { setHostAccessToken, clearHostAccessToken, hasHostAccessToken } from '../services/hostAuth.js';
import { socket } from '../contexts/SocketContext.js';
import { navigate } from '../services/router.js';
import { game } from './useGame.js';

const hostPath = () => location.pathname === '/host' || location.pathname.startsWith('/host/room/') || location.pathname.startsWith('/host/quiz/');

export class HostStore extends EventTarget {
  constructor() {
    super();
    this.state = { host: null, questionSets: [], rooms: [], editingQuiz: null, previewQuiz: null, busy: false, error: '', email: '', loading: false, dirty: false };
  }
  update(changes) { Object.assign(this.state, changes); this.dispatchEvent(new Event('change')); }

  async restore() {
    if (!hasHostAccessToken()) {
      if (hostPath()) navigate('/host/login');
      return;
    }
    this.update({ loading: true, error: '' });
    try {
      const { host } = await api.currentHost();
      this.update({ host, loading: false });
      if (!hostPath()) navigate('/host');
      if (location.pathname === '/host') await this.loadDashboard();
      else if (/^\/host\/quiz\/[^/]+\/(edit|preview)$/.test(location.pathname)) await this.loadQuiz(location.pathname.split('/')[3]);
    } catch (error) {
      clearHostAccessToken();
      await socket.disconnect();
      this.update({ host: null, loading: false, error: '' });
      if (hostPath()) navigate('/host/login');
    }
  }

  async authenticate(email, password, mode) {
    this.update({ busy: true, error: '', email });
    try {
      const response = mode === 'register'
        ? await api.registerHost({ email, password })
        : await api.loginHost({ email, password });
      setHostAccessToken(response.accessToken);
      this.update({ host: response.host, busy: false, error: '' });
      socket.refreshAuthentication();
      navigate('/host');
      await this.loadDashboard();
    } catch (error) {
      this.update({ busy: false, error: error.message || 'Could not sign in. Please try again.' });
    }
  }

  async loadDashboard() {
    if (!hasHostAccessToken()) { navigate('/host/login'); return; }
    this.update({ loading: true, error: '' });
    try {
      const result = await api.getHostDashboard();
      this.update({ host: result.host, questionSets: result.questionSets, rooms: result.rooms, loading: false });
    } catch (error) {
      this.update({ loading: false, error: error.message });
      if (error.status === 401) {
        clearHostAccessToken();
        navigate('/host/login');
      }
    }
  }

  async createQuiz() {
    this.update({ busy: true, error: '' });
    try {
      const quiz = await api.createQuestionSet({ title: '', description: '', defaultDurationSeconds: 20, defaultMarks: 500, questions: [] });
      this.update({ editingQuiz: quiz, dirty: false });
      navigate(`/host/quiz/${encodeURIComponent(quiz.id)}/edit`);
    } catch (error) {
      this.update({ error: error.message || 'Could not create a quiz.' });
    } finally {
      this.update({ busy: false });
    }
  }

  async loadQuiz(quizId) {
    this.update({ loading: true, error: '' });
    try {
      const [quiz, preview] = location.pathname.endsWith('/preview')
        ? await Promise.all([api.getQuestionSet(quizId), api.previewQuestionSet(quizId)])
        : [await api.getQuestionSet(quizId), null];
      this.update({ editingQuiz: quiz, previewQuiz: preview ?? quiz, loading: false, dirty: false });
    } catch (error) {
      this.update({ loading: false, error: error.message });
      if (error.status === 401) navigate('/host/login');
    }
  }

  async editQuiz(quizId) {
    navigate(`/host/quiz/${encodeURIComponent(quizId)}/edit`);
    await this.loadQuiz(quizId);
  }

  async openPreview(quizId) {
    this.update({ loading: true, error: '' });
    try {
      const preview = await api.previewQuestionSet(quizId);
      this.update({ previewQuiz: preview, loading: false });
      navigate(`/host/quiz/${encodeURIComponent(quizId)}/preview`);
    } catch (error) { this.update({ loading: false, error: error.message }); }
  }

  async saveQuiz(quiz) {
    this.update({ busy: true, error: '', editingQuiz: quiz });
    try {
      const saved = await api.updateQuestionSet(quiz.id, quiz);
      this.update({ editingQuiz: saved, dirty: false, busy: false });
      await this.loadDashboard();
      return saved;
    } catch (error) {
      this.update({ error: error.message || 'Could not save this draft.', busy: false });
      throw error;
    }
  }

  async publishQuiz(quiz) {
    this.update({ busy: true, error: '' });
    try {
      const saved = await api.updateQuestionSet(quiz.id, quiz);
      const published = await api.publishQuestionSet(quiz.id);
      this.update({ editingQuiz: published, dirty: false, busy: false });
      await this.loadDashboard();
      navigate('/host');
      return published;
    } catch (error) {
      const fieldErrors = error.fields?.map((item) => item.message).join(' ') ?? '';
      this.update({ error: fieldErrors || error.message || 'This quiz could not be published.', busy: false });
      throw error;
    }
  }

  async previewQuiz(quiz) {
    await this.saveQuiz(quiz);
    await this.openPreview(quiz.id);
  }

  markQuizDirty(quiz) { this.update({ editingQuiz: quiz, dirty: true }); }

  async deleteQuiz(quizId) {
    this.update({ busy: true, error: '' });
    try {
      await api.deleteQuestionSet(quizId);
      await this.loadDashboard();
    } catch (error) { this.update({ error: error.message }); }
    finally { this.update({ busy: false }); }
  }

  async createRoom(questionSetId) {
    this.update({ busy: true, error: '' });
    try {
      await game.createHostRoom(questionSetId);
    } catch (error) {
      this.update({ error: error.message || 'Could not create a room.' });
    } finally {
      this.update({ busy: false });
    }
  }

  async openRoom(joinCode) {
    try {
      await game.observeHostRoom(joinCode);
    } catch (error) {
      this.update({ error: error.message || 'Could not open this room.' });
    }
  }

  async leaveRoom() {
    await game.leaveHostRoom();
    navigate('/host');
    await this.loadDashboard();
  }

  async logout() {
    try { await api.logoutHost(); } catch { /* Revoke locally even if the server is unavailable. */ }
    await game.leaveHostRoom();
    clearHostAccessToken();
    sessionStorage.removeItem('aptiquiz-live-session');
    await socket.disconnect();
      this.update({ host: null, questionSets: [], rooms: [], editingQuiz: null, previewQuiz: null, error: '', busy: false });
    navigate('/host/login');
  }
}

export const hostStore = new HostStore();
