export const OptionButton = (option, index, selectedOptionId, correctOptionId, locked) => {
  let status = '';
  if (correctOptionId && option.id === correctOptionId) status = 'correct';
  if (correctOptionId && selectedOptionId === option.id && option.id !== correctOptionId) status = 'wrong';
  if (!correctOptionId && selectedOptionId === option.id) status = 'selected';
  return `<button class="answer-option ${status}" data-answer="${option.id}" ${locked?'disabled':''}><span>${String.fromCharCode(65+index)}</span><b>${option.text}</b><i>${status==='correct'?'✓':status==='wrong'?'×':'→'}</i></button>`;
};
