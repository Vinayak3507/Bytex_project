import { assert, HttpError } from './http-error.js';
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

const numberInRange = (value, field, { min, max, integer = true } = {}) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    const message = `${field} must be ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}.`;
    throw new HttpError(400, 'INVALID_INPUT', message, { fields: [{ field, message }] });
  }
  return number;
};

const optionalText = (value, field, max) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > max) {
    const message = `${field} must be a string of at most ${max} characters.`;
    throw new HttpError(400, 'INVALID_INPUT', message, { fields: [{ field, message }] });
  }
  return value.trim();
};

export const validateQuestionSet = (body) => {
  assert(body && typeof body === 'object' && !Array.isArray(body), 400, 'INVALID_INPUT', 'Request body must be JSON.');
  const questions = body.questions ?? [];
  assert(Array.isArray(questions) && questions.length <= 100, 400, 'INVALID_INPUT', 'questions must contain at most 100 questions.');
  const defaultDurationSeconds = numberInRange(body.defaultDurationSeconds ?? (body.defaultDurationMs ? Number(body.defaultDurationMs) / 1000 : 20), 'defaultDurationSeconds', { min: 5, max: 120 });
  const defaultMarks = numberInRange(body.defaultMarks ?? 500, 'defaultMarks', { min: 0, max: 10000 });
  const ids = new Set();
  const normalizedQuestions = questions.map((question, index) => {
    assert(question && typeof question === 'object' && !Array.isArray(question), 400, 'INVALID_INPUT', `Question ${index + 1} must be an object.`);
    const rawOptions = question.options ?? [];
    assert(Array.isArray(rawOptions) && rawOptions.length <= 10, 400, 'INVALID_INPUT', `Question ${index + 1} can have at most 10 options.`);
    const options = rawOptions.map((option, optionIndex) => ({
      id: uuidOrGenerated(option?.id, `Question ${index + 1} option ${optionIndex + 1} id`),
      text: optionalText(option?.text, `Question ${index + 1} option ${optionIndex + 1}`, 280)
    }));
    const optionIds = new Set(options.map((option) => option.id));
    assert(optionIds.size === options.length, 400, 'INVALID_INPUT', `Question ${index + 1} has duplicate option IDs.`);
    const questionId = uuidOrGenerated(question.id, `Question ${index + 1} id`);
    assert(!ids.has(questionId), 400, 'INVALID_INPUT', `Question ${index + 1} has a duplicate question ID.`);
    ids.add(questionId);
    const durationInput = question.durationSeconds !== undefined
      ? question.durationSeconds
      : question.durationMs == null ? null : Number(question.durationMs) / 1000;
    const marksInput = question.marks;
    const rawCorrectId = question.correctOptionId || null;
    if (rawCorrectId !== null) assert(typeof rawCorrectId === 'string' && UUID.test(rawCorrectId), 400, 'INVALID_INPUT', `Question ${index + 1} correctOptionId must be a UUID.`);
    return {
      id: questionId,
      prompt: optionalText(question.prompt, `Question ${index + 1} prompt`, 1200),
      topic: optionalText(question.topic ?? 'general', `Question ${index + 1} topic`, 80) || 'general',
      difficulty: optionalText(question.difficulty ?? 'medium', `Question ${index + 1} difficulty`, 32) || 'medium',
      durationMs: durationInput === null || durationInput === '' ? null : numberInRange(durationInput, `Question ${index + 1} durationSeconds`, { min: 5, max: 120 }) * 1000,
      marks: marksInput === undefined || marksInput === null || marksInput === '' ? null : numberInRange(marksInput, `Question ${index + 1} marks`, { min: 0, max: 10000 }),
      explanation: optionalText(question.explanation, `Question ${index + 1} explanation`, 1200),
      options,
      correctOptionId: rawCorrectId,
      position: index
    };
  });

  return {
    title: optionalText(body.title, 'title', 120),
    description: optionalText(body.description, 'description', 1000),
    defaultDurationMs: defaultDurationSeconds * 1000,
    defaultMarks,
    questions: normalizedQuestions
  };
};

export const quizValidationErrors = (questionSet) => {
  const errors = [];
  if (!questionSet.title?.trim()) errors.push({ field: 'title', message: 'Add a quiz title.' });
  if (!questionSet.questions?.length) errors.push({ field: 'questions', message: 'Add at least one question.' });
  for (const [index, question] of (questionSet.questions ?? []).entries()) {
    const prefix = `questions.${index}`;
    if (!question.prompt?.trim()) errors.push({ field: `${prefix}.prompt`, message: `Question ${index + 1} needs question text.` });
    if (!Array.isArray(question.options) || question.options.length < 2) errors.push({ field: `${prefix}.options`, message: `Question ${index + 1} needs at least two options.` });
    const optionIds = new Set();
    for (const [optionIndex, option] of (question.options ?? []).entries()) {
      if (!option.text?.trim()) errors.push({ field: `${prefix}.options.${optionIndex}.text`, message: `Option ${optionIndex + 1} cannot be empty.` });
      if (optionIds.has(option.id)) errors.push({ field: `${prefix}.options`, message: 'Option IDs must be unique.' });
      optionIds.add(option.id);
    }
    if (!question.correctOptionId || !optionIds.has(question.correctOptionId)) errors.push({ field: `${prefix}.correctOptionId`, message: 'Choose exactly one correct answer.' });
    const durationMs = question.durationMs ?? questionSet.defaultDurationMs;
    if (!Number.isInteger(durationMs) || durationMs < 5000 || durationMs > 120000) errors.push({ field: `${prefix}.durationSeconds`, message: 'Duration must be between 5 and 120 seconds.' });
    if (!Number.isInteger(question.marks ?? questionSet.defaultMarks) || (question.marks !== null && (question.marks < 0 || question.marks > 10000))) errors.push({ field: `${prefix}.marks`, message: 'Marks must be a whole number from 0 to 10000.' });
    if (question.position !== index) errors.push({ field: `${prefix}.position`, message: 'Question order must be consecutive and start at 1.' });
  }
  return errors;
};

export const materializeQuestionSet = (questionSet) => ({
  ...questionSet,
  questions: questionSet.questions.map((question, index) => ({
    ...question,
    durationMs: question.durationMs ?? questionSet.defaultDurationMs ?? 20000,
    marks: question.marks ?? questionSet.defaultMarks ?? 500,
    position: index
  }))
});

export const validateRoom = (body) => ({
  collegeName: string(body?.collegeName, 'collegeName', { max: 120 }),
  seasonName: string(body?.seasonName ?? 'Hackathon Demo', 'seasonName', { max: 80 })
});

export const validateCredentials = (body, { registration = false } = {}) => {
  assert(body && typeof body === 'object', 400, 'INVALID_INPUT', 'Request body must be JSON.');
  assert(typeof body.email === 'string', 400, 'INVALID_EMAIL', 'Enter a valid email address.');
  const email = body.email.trim().toLowerCase();
  assert(email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 400, 'INVALID_EMAIL', 'Enter a valid email address.');
  assert(typeof body.password === 'string', 400, 'INVALID_PASSWORD', 'Enter a password.');
  if (registration) assert(body.password.length >= 12 && body.password.length <= 128, 400, 'INVALID_PASSWORD', 'Password must be 12 to 128 characters.');
  else assert(body.password.length > 0 && body.password.length <= 128, 400, 'INVALID_PASSWORD', 'Password must be 1 to 128 characters.');
  return { email, password: body.password };
};

export const validateJoin = (body) => ({
  joinCode: string(body?.joinCode, 'joinCode', { min: 8, max: 8 }).toUpperCase(),
  displayName: string(body?.displayName, 'displayName', { max: 40 }),
  reconnectToken: typeof body?.reconnectToken === 'string' ? body.reconnectToken : null
});
