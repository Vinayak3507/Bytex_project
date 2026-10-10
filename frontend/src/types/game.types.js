/** Shared game shapes. Keep the field names in sync with the backend. */
export const GamePhase = Object.freeze({ LOBBY: 'lobby', PLAYING: 'playing', RESULTS: 'results' });

/** @typedef {{id:string, name:string, college:string, score:number, avatar:string, color:string, answered?:boolean}} Player */
/** @typedef {{id:string, category:string, prompt:string, options:string[], answerIndex:number, durationSeconds:number}} Question */
/** @typedef {{code:string, hostId:string, players:Player[], status:'waiting'|'playing'|'finished'}} Room */
