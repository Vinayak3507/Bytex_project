export const OptionButton = (option, index, selected, correct) => {
  let status = '';
  if (selected !== null && index === correct) status = 'correct';
  if (selected === index && index !== correct) status = 'wrong';
  return `<button class="answer-option ${status}" data-answer="${index}" ${selected !== null?'disabled':''}><span>${String.fromCharCode(65+index)}</span><b>${option}</b><i>${status==='correct'?'✓':status==='wrong'?'×':'→'}</i></button>`;
};
