import { leagueCards } from '../mocks/mockData.js';
import { LeaderboardRow } from '../components/LeaderboardRow.js';

export function Home(state) {
  const leaders = [...state.players].sort((a,b) => b.score-a.score);
  return `<main class="home-shell">
    <nav class="top-nav"><button class="logo" data-screen="home"><span>✦</span>apti<b>quiz</b></button><div class="nav-center"><span class="live-pulse"></span> CAMPUS LEAGUE IS LIVE</div><button class="profile-chip" data-screen="join">${state.name.slice(0,1)} <b>${state.name}</b></button></nav>
    <section class="hero-stage"><div class="hero-copy"><p class="hero-label">SEASON 01 · WEEK 04</p><h1>STUDY HARD.<br><em>PLAY LOUD.</em></h1><p class="hero-text">The live aptitude arena where your campus competes, climbs, and claims the crown.</p><div class="hero-actions"><button class="action lime" data-screen="join">JOIN A ROOM <span>→</span></button><button class="action ghost" data-action="host">HOST A GAME <span>+</span></button></div><div class="hero-social"><span class="mini-faces"><i>R</i><i>S</i><i>N</i><i>+</i></span><b>2,486 players</b> are in the arena</div></div><div class="arena-art"><div class="orbit one"></div><div class="orbit two"></div><div class="star star-one">✦</div><div class="star star-two">✷</div><div class="trophy">♛</div><div class="floating-score"><small>YOUR RANK</small><b>#08 <i>▲ 3</i></b></div><div class="floating-streak"><span>🔥</span><b>5 day<br>streak</b></div><p>THE CAMPUS<br>CLASH</p></div></section>
    <section class="power-grid">${leagueCards.map(card => `<article class="power-card ${card.tone}"><span>${card.icon}</span><small>${card.title}</small><strong>${card.value}</strong><p>${card.text}</p></article>`).join('')}</section>
    <section class="home-grid"><article class="panel leaderboard-panel"><div class="panel-title"><div><p>CLIMB THE BOARD</p><h2>Campus leaders</h2></div><button data-action="toast">FULL TABLE →</button></div>${leaders.map((player,index)=>LeaderboardRow(player,index+1,player.id==='you')).join('')}</article><aside class="panel party-panel"><div class="party-icon">⚡</div><p>TONIGHT · 8:30 PM</p><h2>Placement<br><em>power hour</em></h2><span>20 questions · 10 min · 50 seats</span><div class="seat-line"><i></i><b>32 / 50 joined</b></div><button class="action dark full" data-screen="join">GRAB A SEAT →</button></aside></section>
  </main>`;
}
