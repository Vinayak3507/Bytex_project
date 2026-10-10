export const ROUND_GRACE_MS = 300;

export const scoreAnswer = ({ isCorrect, receivedAt, startedAt, durationMs, streak }) => {
  if (!isCorrect) return 0;
  const elapsedMs = Math.max(0, receivedAt - startedAt);
  const speedRatio = Math.max(0, 1 - elapsedMs / durationMs);
  const speedBonus = Math.round(speedRatio * 500);
  const streakBonus = streak >= 3 ? 150 : 0;
  return 500 + speedBonus + streakBonus;
};

export const calculateTopicStats = (answers) => {
  const topics = new Map();
  for (const answer of answers) {
    const stat = topics.get(answer.topic) ?? { topic: answer.topic, correct: 0, total: 0, responseMs: 0 };
    stat.total += 1;
    stat.correct += answer.isCorrect ? 1 : 0;
    stat.responseMs += answer.responseMs;
    topics.set(answer.topic, stat);
  }
  return [...topics.values()].map((stat) => ({
    ...stat,
    accuracy: stat.total ? Math.round((stat.correct / stat.total) * 100) : 0,
    averageResponseMs: stat.total ? Math.round(stat.responseMs / stat.total) : 0
  }));
};
