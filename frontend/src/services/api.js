const configuredUrl = window.APTIQUIZ_CONFIG?.backendUrl || 'http://localhost:3001';
export const backendUrl = configuredUrl.replace(/\/$/, '');
const accessToken = () => sessionStorage.getItem('aptiquiz-host-access-token');

export class ApiError extends Error {
  constructor(status, code, message, fields = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const request = async (path, { method = 'GET', body, auth = false, signal } = {}) => {
  let response;
  try {
    response = await fetch(`${backendUrl}${path}`, {
      method,
      signal,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(auth && accessToken() ? { Authorization: `Bearer ${accessToken()}` } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', `Could not reach the AptiQuiz server at ${backendUrl}.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'The AptiQuiz server returned an invalid response.');
  }
  if (!response.ok) {
    throw new ApiError(response.status, payload.error?.code ?? 'REQUEST_FAILED', payload.error?.message ?? `Request failed (${response.status}).`, payload.error?.fields ?? []);
  }
  return payload;
};

export const api = {
  health: () => request('/health'),
  registerHost: (credentials) => request('/api/auth/register', { method: 'POST', body: credentials }),
  loginHost: (credentials) => request('/api/auth/login', { method: 'POST', body: credentials }),
  currentHost: () => request('/api/auth/me', { auth: true }),
  logoutHost: () => request('/api/auth/logout', { method: 'POST', auth: true }),
  getHostDashboard: () => request('/api/host/dashboard', { auth: true }),
  createQuestionSet: (questionSet) => request('/api/question-sets', { method: 'POST', body: questionSet, auth: true }),
  listQuestionSets: () => request('/api/question-sets', { auth: true }),
  getQuestionSet: (questionSetId) => request(`/api/question-sets/${encodeURIComponent(questionSetId)}`, { auth: true }),
  updateQuestionSet: (questionSetId, questionSet) => request(`/api/question-sets/${encodeURIComponent(questionSetId)}`, { method: 'PUT', body: questionSet, auth: true }),
  deleteQuestionSet: (questionSetId) => request(`/api/question-sets/${encodeURIComponent(questionSetId)}`, { method: 'DELETE', auth: true }),
  publishQuestionSet: (questionSetId) => request(`/api/question-sets/${encodeURIComponent(questionSetId)}/publish`, { method: 'POST', auth: true }),
  previewQuestionSet: (questionSetId) => request(`/api/question-sets/${encodeURIComponent(questionSetId)}/preview`, { auth: true }),
  addQuestion: (questionSetId, question) => request(`/api/question-sets/${encodeURIComponent(questionSetId)}/questions`, { method: 'POST', body: { question }, auth: true }),
  updateQuestion: (questionSetId, questionId, question) => request(`/api/question-sets/${encodeURIComponent(questionSetId)}/questions/${encodeURIComponent(questionId)}`, { method: 'PUT', body: { question }, auth: true }),
  deleteQuestion: (questionSetId, questionId) => request(`/api/question-sets/${encodeURIComponent(questionSetId)}/questions/${encodeURIComponent(questionId)}`, { method: 'DELETE', auth: true }),
  reorderQuestions: (questionSetId, questionIds) => request(`/api/question-sets/${encodeURIComponent(questionSetId)}/questions/reorder`, { method: 'PUT', body: { questionIds }, auth: true }),
  createRoom: (questionSetId, room) => request(`/api/question-sets/${encodeURIComponent(questionSetId)}/rooms`, { method: 'POST', body: room, auth: true }),
  getRoom: (joinCode) => request(`/api/rooms/${encodeURIComponent(joinCode)}`),
  getLeague: (seasonName = 'Hackathon Demo') => request(`/api/leagues/${encodeURIComponent(seasonName)}`)
};
