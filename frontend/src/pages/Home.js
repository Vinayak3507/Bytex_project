import { LeaderboardRow } from '../components/LeaderboardRow.js';
import { escapeHtml } from '../components/escapeHtml.js';

const tones = ['coral', 'purple', 'blue', 'lime'];
const leaders = (entries = []) => entries.map((entry, index) => LeaderboardRow({
  id: entry.collegeName, name: entry.collegeName, college: `${entry.roomsPlayed} completed ${entry.roomsPlayed === 1 ? 'room' : 'rooms'}`,
  score: entry.points, avatar: entry.collegeName.slice(0, 1).toUpperCase(), color: tones[index % tones.length]
}, index + 1, false)).join('');

export function Home(state) {
  return `<main class="home-shell">
    <nav class="top-nav"><button class="logo" data-screen="home"><span>✦</span>apti<b>quiz</b></button><div class="nav-center"><span class="live-pulse"></span> CAMPUS LEAGUE IS LIVE</div><div class="nav-actions"><button class="theme-toggle" data-action="theme-toggle" type="button" aria-label="Toggle light and dark theme"><span aria-hidden="true">☾</span><b>THEME</b></button><button class="profile-chip" data-screen="join">${escapeHtml(state.name.slice(0,1))} <b>${escapeHtml(state.name)}</b></button></div></nav>
    ${state.error?`<p class="integration-error home-error" role="alert">${escapeHtml(state.error)}</p>`:''}
    <section class="hero-stage"><div class="hero-copy"><p class="hero-label">SEASON 01 · OPEN PLAY</p><h1>STUDY HARD.<br><em>PLAY LOUD.</em></h1><p class="hero-text">The live aptitude arena where your campus competes, climbs, and claims the crown.</p><div class="hero-actions"><button class="action lime" data-screen="join">JOIN A ROOM <span>→</span></button><button class="action ghost" data-action="host" ${state.busy?'disabled':''}>${state.busy?'CREATING ROOM…':'HOST A GAME +'}</button></div><div class="hero-social"><span class="mini-faces"><i>1</i><i>2</i><i>3</i><i>+</i></span><b>Up to 50 students</b> can join one live room</div></div><div class="arena-art"><div class="orbit one"></div><div class="orbit two"></div><div class="star star-one">✦</div><div class="star star-two">✷</div><div class="trophy">♛</div><div class="floating-score"><small>LIVE ROUND</small><b>50 <i>PLAYERS</i></b></div><div class="floating-streak"><span>⚡</span><b>Fast answers.<br>Fair scoring.</b></div><p>THE CAMPUS<br>CLASH</p></div></section>
    <section class="power-grid"><article class="power-card yellow"><span>⚡</span><small>SERVER TIMER</small><strong>Live</strong><p>One synchronized clock</p></article><article class="power-card pink"><span>♛</span><small>FAIR SCORING</small><strong>Speed + accuracy</strong><p>Calculated by the referee</p></article><article class="power-card blue"><span>🏆</span><small>ROOM SIZE</small><strong>50 students</strong><p>Compete from any device</p></article></section>
    <section class="home-grid"><article class="panel leaderboard-panel"><div class="panel-title"><div><p>COLLEGE LEAGUE</p><h2>Campus leaders</h2></div><span>After completed matches</span></div>${state.leagueLeaderboard.length?leaders(state.leagueLeaderboard):'<p class="empty-state">No completed rooms yet. Host the first campus clash.</p>'}</article><aside class="panel party-panel"><div class="party-icon">⚡</div><p>START A LIVE MATCH</p><h2>Placement<br><em>power hour</em></h2><span>Choose a room, share the code, and play.</span><div class="seat-line"><i></i><b>First room is ready to host</b></div><button class="action dark full" data-action="host" ${state.busy?'disabled':''}>HOST A GAME →</button></aside></section>
  </main>`;
}
