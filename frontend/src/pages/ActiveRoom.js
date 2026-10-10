import { GamePhase } from '../types/game.types.js';
import { TimerBar } from '../components/TimerBar.js';
import { OptionButton } from '../components/OptionButton.js';
import { PlayerGrid } from '../components/PlayerGrid.js';
import { LeaderboardRow } from '../components/LeaderboardRow.js';
import { burst } from '../components/ui.js';

const Header = (label, labelClass='') => `<header class="game-header"><button class="logo" data-screen="home"><span>✦</span>apti<b>quiz</b></button><div class="round-status ${labelClass}"><i></i>${label}</div><button class="leave" data-screen="home">LEAVE ✕</button></header>`;

export function Lobby(state) {
  return `${Header('ROOM IS OPEN')}<main class="lobby-page"><section class="lobby-main"><p class="kicker">YOU'RE IN THE PARTY</p><h1>GET READY<br>TO <em>RUMBLE.</em></h1><p class="lobby-copy">The room is filling up. Tell your brain to bring its A-game.</p><div class="code-card"><div><small>ROOM CODE</small><strong>${state.roomCode}</strong></div><button id="copy-code">COPY</button></div><div class="lobby-title"><div><h2>WHO'S IN?</h2><span>Tap a reaction while you wait.</span></div><b>${state.players.length} PLAYERS</b></div>${PlayerGrid(state.players)}<div class="emoji-bar"><button data-react="🔥">🔥</button><button data-react="😤">😤</button><button data-react="🧠">🧠</button><button data-react="⚡">⚡</button><span id="reaction-note">${state.reaction || 'Hype the room up!'}</span></div>${state.isHost?'<button class="action lime start-button" data-action="start">START THE CLASH →</button>':'<div class="wait-note"><i></i> WAITING FOR THE HOST TO START</div>'}</section><aside class="lobby-side-panel"><div class="electric-orb">⚡</div><p>HOW IT WORKS</p><ol><li><b>01</b>Answer before the timer hits zero.</li><li><b>02</b>Fast and right means bigger points.</li><li><b>03</b>Take the top spot. Brag later.</li></ol><div class="side-sticker">NO NOTES.<br>ALL NERVE.</div></aside></main>`;
}

export function Game(state) {
  const question = state.questions[state.questionIndex];
  const answerState = state.selected !== null;
  return `${Header(`ROUND ${state.questionIndex+1} OF ${state.questions.length}`, 'playing')}<main class="game-page"><section class="question-stage"><div class="question-meta"><span>${question.category}</span><b>QUESTION ${String(state.questionIndex+1).padStart(2,'0')}</b></div>${TimerBar(state.secondsLeft, question.durationSeconds)}<div class="question-core"><p>NO PRESSURE. JUST GLORY.</p><h1>${question.prompt}</h1><div class="answers">${question.options.map((option,index)=>OptionButton(option,index,state.selected,question.answerIndex)).join('')}</div><div class="answer-help">✦ ONE TAP LOCKS YOUR ANSWER</div></div>${answerState?`<div class="answer-flash ${state.correct?'yay':'nay'}">${state.correct?'NICE!':'NEXT TIME!'} <b>${state.reaction}</b></div>${burst()}`:''}</section><aside class="score-side"><div class="score-card"><p>YOUR SCORE</p><strong>${state.score.toLocaleString()}</strong><small>POINTS · COMBO ×${state.combo}</small></div><div class="crowd-meter"><p>CROWD METER</p><div><i style="width:${Math.min(100,40 + state.questionIndex*20 + (state.selected!==null?22:0))}%"></i></div><span>THE ARENA IS BUZZING ⚡</span></div><p class="side-label">IN THIS ROUND</p>${PlayerGrid(state.players)}<div class="reaction-pad"><button data-react="🔥">🔥</button><button data-react="😤">😤</button><button data-react="👏">👏</button><span>${state.reaction || 'GO GO GO!'}</span></div></aside></main>`;
}

export function Results(state) {
  const sorted = [...state.players].sort((a,b)=>b.score-a.score);
  const rank = sorted.findIndex(player=>player.id==='you')+1;
  return `${Header('MATCH COMPLETE', 'complete')}<main class="results-page">${burst()}<section class="results-hero"><div class="winner-crown">♛</div><p>THE CLASH IS OVER</p><h1>YOU CAME <em>#${rank}!</em></h1><span>${rank===1?'You own the arena.':'That was a serious round.'} +${state.score-740} points earned.</span><div class="medals">${sorted.slice(0,3).map((player,index)=>`<div class="medal medal-${index+1}"><span>${index===0?'🥇':index===1?'🥈':'🥉'}</span>${player.name}<b>${player.score}</b></div>`).join('')}</div></section><section class="panel final-board"><div class="panel-title"><div><p>FINAL SCOREBOARD</p><h2>Room ${state.roomCode}</h2></div><span>${state.players.length} PLAYERS</span></div>${sorted.map((player,index)=>LeaderboardRow(player,index+1,player.id==='you')).join('')}</section><div class="result-actions"><button class="action lime" data-action="rematch">RUN IT BACK ↻</button><button class="action dark" data-screen="home">BACK TO ARENA</button></div></main>`;
}

export function ActiveRoom(state) { if (state.phase === GamePhase.PLAYING) return Game(state); if (state.phase === GamePhase.RESULTS) return Results(state); return Lobby(state); }
