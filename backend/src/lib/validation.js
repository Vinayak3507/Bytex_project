import { assert } from './http-error.js';
import { id } from './ids.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidOrGenerated = (value, field) => {
  if (value === undefined || value === null || value === '') return id();
  assert(typeof value === 'string' && UUID.test(value), 400, 'INVALID_INPUT', `${field} must be a UUID.`);
  return value;
};

const string = (value, field, { min = 1, max = 500 } = {}) => {
  assert(typeof value === 'string', 400, 'INVALID_INPUT', `${field} must be a string.`);
  const result = value.trim();
  assert(result.length >= min && result.length <= max, 400, 'INVALID_INPUT', `${field} must be between ${min} and ${max} characters.`);
  return result;
};

export const validateQuestionSet = (body) => {
  assert(body && typeof body === 'object', 400, 'INVALID_INPUT', 'Request body must be JSON.');
  const questions = body.questions;
  assert(Array.isArray(questions) && questions.length > 0 && questions.length <= 100, 400, 'INVALID_INPUT', 'questions must contain 1 to 100 questions.');

  return {
    title: string(body.title, 'title', { max: 120 }),
    questions: questions.map((question, index) => {
      const options = question?.options;
      assert(Array.isArray(options) && options.length >= 2 && options.length <= 6, 400, 'INVALID_INPUT', `Question ${index + 1} needs 2 to 6 options.`);
      const normalizedOptions = options.map((option, optionIndex) => ({
        id: uuidOrGenerated(option?.id, `Question ${index + 1} option ${optionIndex + 1} id`),
        text: string(option?.text, `Question ${index + 1} option ${optionIndex + 1}`, { max: 280 })
      }));
      const optionIds = new Set(normalizedOptions.map((option) => option.id));
      assert(optionIds.size === normalizedOptions.length, 400, 'INVALID_INPUT', `Question ${index + 1} has duplicate option IDs.`);
      assert(optionIds.has(question?.correctOptionId), 400, 'INVALID_INPUT', `Question ${index + 1} correctOptionId must match an option.`);
      const durationMs = Number(question?.durationMs ?? 20000);
      assert(Number.isInteger(durationMs) && durationMs >= 5000 && durationMs <= 120000, 400, 'INVALID_INPUT', `Question ${index + 1} durationMs must be 5 to 120 seconds.`);
      return {
        id: uuidOrGenerated(question?.id, `Question ${index + 1} id`),
        prompt: string(question?.prompt, `Question ${index + 1} prompt`, { max: 1200 }),
        topic: string(question?.topic ?? 'general', `Question ${index + 1} topic`, { max: 80 }),
        difficulty: string(question?.difficulty ?? 'medium', `Question ${index + 1} difficulty`, { max: 32 }),
        durationMs,
        options: normalizedOptions,
        correctOptionId: question.correctOptionId,
        position: index
      };
    })
  };
};

export const validateRoom = (body) => ({
  collegeName: string(body?.collegeName, 'collegeName', { max: 120 }),
  seasonName: string(body?.seasonName ?? 'Hackathon Demo', 'seasonName', { max: 80 })
});

export const validateJoin = (body) => ({
  joinCode: string(body?.joinCode, 'joinCode', { min: 8, max: 8 }).toUpperCase(),
  displayName: string(body?.displayName, 'displayName', { max: 40 }),
  reconnectToken: typeof body?.reconnectToken === 'string' ? body.reconnectToken : null
});
