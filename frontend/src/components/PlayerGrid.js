import { playerPill } from './ui.js';
export const PlayerGrid = players => `<div class="player-grid">${players.map(playerPill).join('')}</div>`;
