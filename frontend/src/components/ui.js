import { escapeHtml } from './escapeHtml.js';

export const avatar = player => `<span class="avatar ${player.color}">${escapeHtml(player.avatar)}</span>`;
export const playerPill = player => `<div class="player-pill ${player.answered?'answered':''}">${avatar(player)}<span>${escapeHtml(player.name)}</span><b>${player.answered?'✓':'•'}</b></div>`;
export const leaderboardRow = (player, rank, isYou) => `<div class="leader-row ${isYou?'is-you':''}"><span class="rank-badge rank-${rank}">${rank}</span>${avatar(player)}<span class="leader-name"><b>${escapeHtml(player.name)}${isYou?' <i>YOU</i>':''}</b><small>${escapeHtml(player.college)}</small></span><strong>${Number(player.score).toLocaleString()}<small> pts</small></strong></div>`;
export const burst = () => `<div class="burst" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>`;
