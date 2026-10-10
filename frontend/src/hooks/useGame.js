import { GamePhase } from '../types/game.types.js';
import { mockPlayers, mockQuestions } from '../mocks/mockData.js';

export class GameStore extends EventTarget {
  constructor() {
    super();
    this.state = { phase:GamePhase.LOBBY, screen:'home', roomCode:'QUIZ24', name:'You', college:'VIT Vellore', isHost:false, players:structuredClone(mockPlayers), questions:mockQuestions, questionIndex:0, secondsLeft:20, selected:null, correct:null, reaction:'', score:740, combo:0 };
  }
  update(changes) { Object.assign(this.state, changes); this.dispatchEvent(new Event('change')); }
  resetMatch() { this.update({ phase:GamePhase.LOBBY, questionIndex:0, secondsLeft:20, selected:null, correct:null, reaction:'', combo:0, score:740, players:structuredClone(mockPlayers) }); }
  join(name, college, code) { const players = structuredClone(mockPlayers); players[1] = { ...players[1], name:name || 'You', college }; this.update({ phase:GamePhase.LOBBY, questionIndex:0, secondsLeft:20, selected:null, correct:null, reaction:'', combo:0, score:740, name:name || 'You', college, roomCode:code.toUpperCase(), players, screen:'lobby', isHost:false }); }
  host() { this.update({ phase:GamePhase.LOBBY, questionIndex:0, secondsLeft:20, selected:null, correct:null, reaction:'', combo:0, score:740, players:structuredClone(mockPlayers), roomCode:'APTI'+Math.floor(10 + Math.random()*90), screen:'lobby', isHost:true }); }
  start() { this.update({ phase:GamePhase.PLAYING, screen:'game', questionIndex:0, secondsLeft:20, selected:null, correct:null, combo:0 }); }
  selectAnswer(index) { if (this.state.selected !== null) return; const question = this.currentQuestion; const correct = index === question.answerIndex; const points = correct ? 100 + this.state.secondsLeft * 4 + this.state.combo * 20 : 0; const score = this.state.score + points; const players = this.state.players.map(player => player.id === 'you' ? { ...player, score, answered:true, roundPoints:points } : player); this.update({ selected:index, correct, score, combo:correct ? this.state.combo + 1 : 0, players, reaction:correct ? `+${points} POINTS!` : 'OOPS! NEXT ONE!' }); }
  showLeaderboard() { if (this.state.phase !== GamePhase.PLAYING || this.state.selected === null) return; const players = this.state.players.map(player => { if (player.id === 'you') return { ...player, answered:true, roundPoints:player.roundPoints || 0 }; const roundPoints = Math.random() > .35 ? 80 + Math.floor(Math.random() * 221) : 0; return { ...player, score:player.score + roundPoints, answered:true, roundPoints }; }); this.update({ phase:GamePhase.ROUND_RESULTS, players }); }
  next() { if (this.state.phase !== GamePhase.ROUND_RESULTS) return; if (this.state.questionIndex >= this.state.questions.length - 1) { const players = [...this.state.players].sort((a,b) => b.score-a.score); this.update({ phase:GamePhase.RESULTS, screen:'results', players }); return; } this.update({ phase:GamePhase.PLAYING, questionIndex:this.state.questionIndex+1, secondsLeft:20, selected:null, correct:null, reaction:'', players:this.state.players.map(player => ({...player,answered:false,roundPoints:0})) }); }
  tick() { if (this.state.screen !== 'game' || this.state.selected !== null) return; if (this.state.secondsLeft <= 1) { this.update({ secondsLeft:0, selected:-1, correct:false, reaction:'TIME UP!' }); return; } this.update({ secondsLeft:this.state.secondsLeft-1 }); }
  get currentQuestion() { return this.state.questions[this.state.questionIndex]; }
}

export const game = new GameStore();
