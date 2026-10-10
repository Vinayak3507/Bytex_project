const option = (id, text) => ({ id, text });

export const starterQuestionSet = {
  title: 'AptiQuiz Placement Sprint',
  questions: [
    {
      id: '00000000-0000-4000-8000-000000000101',
      prompt: 'A train 180 m long crosses a pole in 9 seconds. What is its speed?',
      topic: 'Quantitative aptitude', difficulty: 'easy', durationMs: 12000, position: 0,
      options: [option('00000000-0000-4000-8000-000000000111', '60 km/h'), option('00000000-0000-4000-8000-000000000112', '72 km/h'), option('00000000-0000-4000-8000-000000000113', '80 km/h'), option('00000000-0000-4000-8000-000000000114', '90 km/h')],
      correctOptionId: '00000000-0000-4000-8000-000000000112'
    },
    {
      id: '00000000-0000-4000-8000-000000000201',
      prompt: 'Find the next number in the sequence: 3, 8, 15, 24, 35, …',
      topic: 'Logical reasoning', difficulty: 'medium', durationMs: 12000, position: 1,
      options: [option('00000000-0000-4000-8000-000000000211', '44'), option('00000000-0000-4000-8000-000000000212', '46'), option('00000000-0000-4000-8000-000000000213', '48'), option('00000000-0000-4000-8000-000000000214', '50')],
      correctOptionId: '00000000-0000-4000-8000-000000000213'
    },
    {
      id: '00000000-0000-4000-8000-000000000301',
      prompt: 'Which word is closest in meaning to “pragmatic”?',
      topic: 'Verbal ability', difficulty: 'easy', durationMs: 12000, position: 2,
      options: [option('00000000-0000-4000-8000-000000000311', 'Idealistic'), option('00000000-0000-4000-8000-000000000312', 'Practical'), option('00000000-0000-4000-8000-000000000313', 'Uncertain'), option('00000000-0000-4000-8000-000000000314', 'Ambitious')],
      correctOptionId: '00000000-0000-4000-8000-000000000312'
    }
  ]
};

export const createStarterQuestionSet = () => {
  const optionIdMap = new Map();
  const questions = starterQuestionSet.questions.map((question) => {
    const nextId = crypto.randomUUID();
    for (const answerOption of question.options) optionIdMap.set(answerOption.id, crypto.randomUUID());
    return {
      ...question,
      id: nextId,
      options: question.options.map((answerOption) => ({ ...answerOption, id: optionIdMap.get(answerOption.id) })),
      correctOptionId: optionIdMap.get(question.correctOptionId)
    };
  });
  return { ...starterQuestionSet, questions };
};
