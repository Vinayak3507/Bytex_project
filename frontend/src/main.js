import { game } from './hooks/useGame.js';
import { Home } from './pages/Home.js';
import { JoinRoom } from './pages/JoinRoom.js';
import { ActiveRoom } from './pages/ActiveRoom.js';

const app = document.querySelector('#app');
let clock;

function render() {
  clearInterval(clock);
  const { state } = game;
  app.innerHTML = state.screen === 'home' ? Home(state) : state.screen === 'join' ? JoinRoom(state) : ActiveRoom(state);
  bind();
  if (state.screen === 'game' && state.selected === null) clock = setInterval(() => game.tick(), 1000);
  if (state.screen === 'game' && state.selected !== null) setTimeout(() => game.next(), 1450);
}

function bind() {
  document.querySelectorAll('[data-screen]').forEach(button => button.addEventListener('click', () => { game.update({ screen:button.dataset.screen }); }));
  document.querySelectorAll('[data-action="host"]').forEach(button => button.addEventListener('click', () => game.host()));
  document.querySelectorAll('[data-action="start"]').forEach(button => button.addEventListener('click', () => game.start()));
  document.querySelectorAll('[data-action="rematch"]').forEach(button => button.addEventListener('click', () => { game.resetMatch(); game.start(); }));
  document.querySelectorAll('[data-action="toast"]').forEach(button => button.addEventListener('click', () => game.update({ reaction:'Season standings unlock after the next clash!' })));
  document.querySelectorAll('[data-answer]').forEach(button => button.addEventListener('click', () => game.selectAnswer(Number(button.dataset.answer))));
  document.querySelectorAll('[data-react]').forEach(button => button.addEventListener('click', () => game.update({ reaction:`${button.dataset.react} ${game.state.name} brought the energy!` })));
  const form = document.querySelector('#join-form');
  if (form) form.addEventListener('submit', event => { event.preventDefault(); game.join(document.querySelector('#player-name').value.trim(), document.querySelector('#college').value, document.querySelector('#room-code').value.trim() || 'QUIZ24'); });
  const copy = document.querySelector('#copy-code');
  if (copy) copy.addEventListener('click', async () => { await navigator.clipboard?.writeText(game.state.roomCode); copy.textContent='COPIED!'; });
}

game.addEventListener('change', render);
render();
