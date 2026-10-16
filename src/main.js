import './style.css';
import { createGame, legalMoves, applyMove } from './engine.js';
import { createScene } from './scene.js';
import { explainMove } from './commentary.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'afterlight.game.v1';
let state = createGame(), history = [], moves = [], mode = 'ai', difficulty = 'normal';
let selected = null, preview = null, phase = 'ready', sound = false;
let reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, topView = false;
let worker = null, generation = 0, audio = null, toastTimer, aiTimer, saveAvailable = true;
let watchSnapshot = null, watchPaused = false, watchPending = null, watchTimer = null;
let watchExitRequested = false, watchStepRequested = false, watchDelay = 0;

function validState(s) {
  if (!s || !Array.isArray(s.tiles) || s.tiles.length !== 36 || !s.tiles.every(t => t === 0 || t === 1)) return false;
  if (!Array.isArray(s.sparks) || s.sparks.length > 8 || !s.sparks.every(p => Number.isInteger(p.id) && Number.isInteger(p.row) && p.row >= 0 && p.row < 6 && Number.isInteger(p.col) && p.col >= 0 && p.col < 6 && Number.isInteger(p.entry) && p.entry >= 0 && p.entry < 4)) return false;
  if (new Set(s.sparks.map(p => p.id)).size !== s.sparks.length || new Set(s.sparks.map(p => `${p.row},${p.col},${p.entry}`)).size !== s.sparks.length) return false;
  return Array.isArray(s.scores) && s.scores.length === 2 && s.scores.every(n => Number.isInteger(n) && n >= 0 && n <= 8) && s.scores[0]+s.scores[1]+s.sparks.length===8 && (s.turn===0||s.turn===1) && Number.isInteger(s.ply) && s.ply>=0 && [null,0,1,'draw'].includes(s.winner) && s.repetitions && typeof s.repetitions==='object' && !Array.isArray(s.repetitions) && Object.values(s.repetitions).every(n => Number.isInteger(n) && n>0);
}
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (saved && validState(saved.state)) {
    state = saved.state;
    history = Array.isArray(saved.history) && saved.history.every(validState) ? saved.history.slice(-100) : [];
    moves = Array.isArray(saved.moves) ? saved.moves.filter(m => m && Number.isInteger(m.ply) && (m.side===0||m.side===1) && (m.tile===null || Number.isInteger(m.tile)&&m.tile>=0&&m.tile<36) && Array.isArray(m.points)&&m.points.length===2&&m.points.every(n=>Number.isInteger(n)&&n>=0)).slice(-100) : [];
    mode = saved.mode === 'local' ? 'local' : 'ai';
    difficulty = ['easy','normal','hard'].includes(saved.difficulty) ? saved.difficulty : 'normal';
    sound = saved.sound === true;
    if (typeof saved.reduced === 'boolean') reduced = saved.reduced;
  }
} catch { saveAvailable = false; }

function notify(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'),3200); }
function save() {
  const game = watchSnapshot || {state,history,moves,mode,difficulty};
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify({...game,history:game.history.slice(-100),moves:game.moves.slice(-100),sound,reduced})); saveAvailable = true; }
  catch { saveAvailable = false; }
  $('save-status').textContent = saveAvailable ? 'Saved on this Mac' : 'Session only · saving unavailable';
}
function chime(scored = false) {
  if (!sound) return;
  try {
    audio ||= new AudioContext();
    if (audio.state==='suspended') void audio.resume();
    const t = audio.currentTime;
    for (const [index,frequency] of (scored ? [440,660,880] : [330,495]).entries()) {
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.type='sine'; osc.frequency.value=frequency; osc.connect(gain); gain.connect(audio.destination);
      gain.gain.setValueAtTime(0,t+index*.06); gain.gain.linearRampToValueAtTime(.025,t+index*.06+.015); gain.gain.exponentialRampToValueAtTime(.001,t+index*.06+.6);
      osc.start(t+index*.06); osc.stop(t+index*.06+.65);
    }
  } catch { sound=false; notify('Sound is unavailable on this device.'); }
}
const tileName = index => `${String.fromCharCode(65+index%6)}${Math.floor(index/6)+1}`;
const playerName = side => mode==='ai' ? (side===0?'You':'Computer') : (side===0?'Amber':'Blue');
const humanTurn = () => state.winner===null && phase==='ready' && (mode==='local'||mode==='ai'&&state.turn===0);

let scene;
try { scene=createScene($('scene'),{onTile:selectTile,onHover(index){if (index!==null && humanTurn()) $('scene').style.cursor=legalMoves(state).includes(index)?'pointer':'not-allowed';else $('scene').style.cursor='grab';}}); }
catch (error) {
  $('scene').textContent='The 3D board could not start. Please reopen Afterlight to retry.';
  console.error('3D scene failed',error);
  throw error;
}
scene.setState(state); scene.setReducedMotion(reduced);

function selectTile(index) {
  if (!humanTurn()) return;
  if (index===null) {selected=null;preview=null;scene.setSelection(null);scene.setPreview(null);render();return;}
  if (!legalMoves(state).includes(index)) {notify(`${tileName(index)} holds a spark. Choose an empty tile.`);return;}
  selected=index; preview=applyMove(state,index); scene.setSelection(index); scene.setPreview(preview); render();
}
function render() {
  const playing=state.winner===null, human=humanTurn();
  document.body.classList.toggle('blue-turn',state.turn===1);
  document.body.classList.toggle('game-over',!playing);
  $('mode-label').textContent=mode==='watch'?'AI vs AI · SPECTATOR MODE':mode==='ai'?`VS COMPUTER · ${difficulty==='easy'?'GENTLE':difficulty==='hard'?'DEEP':'THOUGHTFUL'}`:'TWO PLAYERS';
  $('amber-name').textContent=mode==='watch'?'AMBER AI':mode==='ai'?'YOU':'AMBER'; $('blue-name').textContent=mode==='watch'?'BLUE AI':mode==='ai'?'COMPUTER':'BLUE';
  $('amber-score').textContent=state.scores[0]; $('blue-score').textContent=state.scores[1];
  for (const [side,id] of ['amber-pips','blue-pips'].entries()) $(id).innerHTML=Array.from({length:5},(_,i)=>`<i class="${i<state.scores[side]?'filled':''}"></i>`).join('');
  $('remaining').textContent=`${state.sparks.length} ${state.sparks.length===1?'spark':'sparks'} in play`;
  $('sparks-dots').innerHTML=Array.from({length:8},(_,i)=>`<i class="${i>=state.sparks.length?'spent':''}"></i>`).join('');
  $('ply-label').textContent=`TURN ${String(state.ply+1).padStart(2,'0')}`;
  $('turn-label').textContent=!playing?'GAME COMPLETE':phase==='thinking'?'COMPUTER IS THINKING':phase==='animating'?'THE FIELD IS MOVING':`${mode==='ai'&&state.turn===0?'YOUR':playerName(state.turn).toUpperCase()+"’S"} TURN`;
  $('thinking-dots').textContent=phase==='thinking'?'···':'';
  $('instruction-title').textContent=!playing?(state.winner==='draw'?'An even exchange.':`${playerName(state.winner)} ${mode==='ai'&&state.winner===0?'win':'wins'}.`):phase==='thinking'?'A path is taking shape.':phase==='animating'?'Watch what follows.':selected!==null?`Turn ${tileName(selected)}. Change what follows.`:'Shape the next arrival.';
  $('instruction').textContent=!playing?'Start another game, or undo to explore a different ending.':phase==='thinking'?'The computer is considering the next arrivals. Every move is calculated on this Mac.':phase==='animating'?'All sparks advance together. The tiles they leave behind turn.':'Choose an empty tile. Turn its tracks, then every spark moves one step.';
  $('tile-select').innerHTML='<option value="">Choose on board</option>'+Array.from({length:36},(_,i)=>`<option value="${i}" ${state.sparks.some(s=>s.row*6+s.col===i)?'disabled':''}>${tileName(i)}${state.sparks.some(s=>s.row*6+s.col===i)?' · occupied':''}</option>`).join('');
  $('tile-select').value=selected===null?'':String(selected); $('tile-select').disabled=!human;
  $('commit-button').disabled=!human||selected===null;
  $('commit-label').textContent=selected===null?'Choose a tile':'Turn & advance';
  $('pass-button').disabled=!human;
  $('undo-button').disabled=mode==='watch'||phase!=='ready'||history.length===0;
  $('new-button').disabled=mode==='watch'||phase!=='ready';
  $('watch-button').disabled=mode!=='watch'&&phase!=='ready';
  $('watch-button').textContent=mode==='watch'?'◉ Watching AI':'▷ Watch AI';
  $('forecast').replaceChildren();
  if (preview && human) {
    const points=preview.state.scores.map((n,i)=>n-state.scores[i]);
    const fragment=document.createDocumentFragment();
    const text=document.createElement('span');text.textContent=`${state.sparks.length} sparks advance. `;fragment.append(text);
    if (points[0]||points[1]) { for(let side=0;side<2;side++)if(points[side]){const span=document.createElement('span');span.className=side===0?'amber':'blue';span.textContent=`${side===0?'Amber':'Blue'} +${points[side]}. `;fragment.append(span);} }
    else {const span=document.createElement('span');span.textContent='No points this step.';fragment.append(span);}
    $('forecast').append(fragment);
  } else $('forecast').textContent=phase==='ready'&&playing?'Select a tile to see where the light goes.':!playing?'The final position is yours to explore.':'The next position will settle in a moment.';
  $('history-count').textContent=moves.length?`${state.ply} MOVES`:'—';
  $('move-history').replaceChildren();
  if (!moves.length) {const li=document.createElement('li');li.className='empty-history';li.textContent='The field is waiting.';$('move-history').append(li);}
  for (const move of moves.slice(-3).reverse()) {
    const li=document.createElement('li');
    const number=document.createElement('span');number.className='move-number';number.textContent=String(move.ply).padStart(2,'0');
    const dot=document.createElement('i');dot.className=`move-side ${move.side===0?'amber':'blue'}`;
    const label=document.createElement('span');label.textContent=`${playerName(move.side)} · ${move.tile===null?'passed':tileName(move.tile)}`;
    const score=document.createElement('span');score.className='move-score';score.textContent=move.points.some(Boolean)?move.points.map((p,i)=>p?`${i===0?'A':'B'} +${p}`:'').filter(Boolean).join(' / '):'';
    li.append(number,dot,label,score);$('move-history').append(li);
  }
  $('sound-button').textContent=sound?'♫ Sound on':'♫ Sound off';$('sound-button').setAttribute('aria-pressed',String(sound));
  $('motion-button').setAttribute('aria-pressed',String(reduced));
  $('save-status').textContent=saveAvailable?'Saved on this Mac':'Session only · saving unavailable';
  if(mode==='watch') { $('save-status').textContent='Your own game is kept safe'; renderWatch(); }
}
async function commit(move,computer=false) {
  if ((!computer&&!humanTurn()) || (computer&&(!(mode==='watch'||mode==='ai'&&state.turn===1)||state.winner!==null))) return;
  const before=state;
  let result;
  try {result=applyMove(state,move);}catch(error){phase='ready';notify(error.message);render();return;}
  phase='animating'; selected=null;preview=null;scene.setSelection(null);scene.setPreview(null);render();chime();
  try {await scene.animateMove(before,result,move,{duration:1100});}
  catch(error){console.error('Move animation failed',error);scene.setState(result.state);notify('Animation skipped. The move was completed.');}
  history.push(before);history=history.slice(-100);state=result.state;
  const points=state.scores.map((n,i)=>n-before.scores[i]);
  moves.push({ply:state.ply,side:before.turn,tile:move,points});moves=moves.slice(-100);
  phase='ready';scene.setState(state);save();render();if(points.some(Boolean))chime(true);
  if(mode==='watch') {
    watchPending=null;
    if(watchExitRequested){stopWatching();return;}
    renderWatch();
    if(state.winner===null&&!watchPaused) watchTimer=setTimeout(scheduleWatch,700);
  } else if(state.winner!==null) showResult();else scheduleComputer();
}
function scheduleComputer() {
  clearTimeout(aiTimer);
  if(mode==='watch'){scheduleWatch();return;}
  if(mode!=='ai'||state.turn!==1||state.winner!==null||phase!=='ready')return;
  phase='thinking';render();const id=++generation;
  aiTimer=setTimeout(()=>{
    worker?.terminate();worker=new Worker(new URL('./ai-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      if(data.id!==generation)return;
      worker?.terminate();worker=null;
      if(data.error){phase='ready';render();notify('The computer stopped. Start a new game or undo to retry.');return;}
      void commit(data.move,true);
    };
    worker.onerror=error=>{console.error('Computer failed',error);worker?.terminate();worker=null;phase='ready';render();notify('The computer stopped. Start a new game or undo to retry.');};
    worker.postMessage({id,state,difficulty});
  },reduced?60:450);
}
function showResult() {
  const draw=state.winner==='draw';
  $('result-title').textContent=draw?'An even exchange.':mode==='ai'&&state.winner===0?'You found the way.':`${playerName(state.winner)} wins.`;
  $('result-detail').textContent=draw?(state.scores[0]===4&&state.scores[1]===4?'Four sparks each. The light belongs to both of you.':'The field has repeated three times. This game is a draw.'):`${state.scores[0]} amber · ${state.scores[1]} blue. ${state.ply} moves shaped the field.`;
  $('result-dialog').showModal();
}
function undo() {
  if(mode==='watch'||phase!=='ready'||!history.length)return;
  generation++;clearTimeout(aiTimer);worker?.terminate();worker=null;
  const count=mode==='ai'&&state.turn===0&&history.length>=2?2:1;
  state=history[history.length-count];history=history.slice(0,-count);moves=moves.slice(0,-count);
  selected=null;preview=null;scene.setSelection(null);scene.setPreview(null);scene.setState(state);save();render();scheduleComputer();notify(count===2?'Your last turn was undone.':'Last move undone.');
}
function newGame() {
  if(phase!=='ready')return;
  mode=document.querySelector('input[name=mode]:checked').value;difficulty=$('difficulty').value;
  generation++;clearTimeout(aiTimer);worker?.terminate();worker=null;
  state=createGame();history=[];moves=[];selected=null;preview=null;
  scene.setSelection(null);scene.setPreview(null);scene.setState(state);scene.resetCamera();topView=false;$('top-button').setAttribute('aria-pressed','false');
  $('new-dialog').close();save();render();$('scene').focus();
}
function openNew() {if(mode==='watch'||phase!=='ready')return;document.querySelector(`input[name=mode][value=${mode}]`).checked=true;$('difficulty').value=difficulty;$('new-dialog').showModal();}

function renderWatch() {
  const finished=state.winner!==null;
  $('watch-pause').textContent=watchPaused?'▶ Resume':'Ⅱ Pause';
  $('watch-pause').disabled=finished||watchExitRequested;
  $('watch-step').disabled=finished||watchExitRequested||phase==='thinking'||phase==='animating';
  $('watch-again').hidden=!finished;
  $('watch-status').textContent=watchExitRequested?'Returning after this move…':finished?'Match complete':watchPaused?(phase==='animating'?'Pausing after this move…':'Paused · take your time'):phase==='thinking'?'Choosing the next move…':phase==='explaining'?'Reading the position':phase==='animating'?'Watch the light move':'The field settles';
  $('watch-progress-bar').style.animationPlayState=watchPaused?'paused':'running';
  if(finished) {
    $('watch-title').textContent=state.winner==='draw'?'An even exchange.':`${playerName(state.winner)} takes the match.`;
    $('watch-consequence').textContent=`Final score: Amber ${state.scores[0]} · Blue ${state.scores[1]}. ${state.ply} moves shaped the field.`;
  }
}
function resetWatchMatch() {
  generation++;clearTimeout(watchTimer);clearTimeout(aiTimer);worker?.terminate();worker=null;
  state=createGame();history=[];moves=[];selected=null;preview=null;phase='ready';
  watchPaused=false;watchPending=null;watchExitRequested=false;watchStepRequested=false;
  scene.setSelection(null);scene.setPreview(null);scene.setState(state);scene.resetCamera();topView=false;$('top-button').setAttribute('aria-pressed','false');
  $('watch-title').textContent='Two minds. One field.';
  $('watch-summary').textContent='Both computers are ready. Watch how each move prepares the next arrival.';
  $('watch-insight').textContent='The commentary explains visible consequences and counterfactuals of the chosen move.';
  $('watch-consequence').textContent='Your own game will be restored when you stop watching.';
  $('watch-tag').textContent='READING THE FIELD';render();scheduleWatch();
}
function startWatching() {
  if(mode==='watch'){if(!$('watch-dialog').open)$('watch-dialog').show();return;}
  if(phase!=='ready')return;
  watchSnapshot={state,history,moves,mode,difficulty};save();mode='watch';difficulty='normal';
  $('watch-dialog').show();resetWatchMatch();
}
function stopWatching() {
  if(mode!=='watch'||!watchSnapshot)return;
  clearTimeout(watchTimer);watchPaused=true;
  if(phase==='animating'){watchExitRequested=true;renderWatch();return;}
  generation++;clearTimeout(aiTimer);worker?.terminate();worker=null;
  ({state,history,moves,mode,difficulty}=watchSnapshot);watchSnapshot=null;
  watchPending=null;watchExitRequested=false;watchStepRequested=false;phase='ready';selected=null;preview=null;
  scene.setSelection(null);scene.setPreview(null);scene.setState(state);$('watch-dialog').close();save();render();
  notify('Your game is right where you left it.');scheduleComputer();
}
function readingDelay() {
  if(watchDelay>0)return watchDelay;
  const words=['watch-title','watch-summary','watch-insight','watch-consequence'].map(id=>$(id).textContent).join(' ').trim().split(/\s+/).length;
  return Math.min(30000,Math.max(15000,Math.ceil(words/2.5)*1000+2000));
}
function armWatchMove(delay=readingDelay()) {
  clearTimeout(watchTimer);
  if(!watchPending||watchPaused||mode!=='watch')return;
  const bar=$('watch-progress-bar');bar.style.animation='none';void bar.offsetWidth;
  bar.dataset.duration=String(delay);
  $('watch-status').textContent=`Reading time · ${Math.ceil(delay/1000)}s`;
  if(!reduced)bar.style.animation=`watch-read ${delay}ms linear forwards`;
  watchTimer=setTimeout(runWatchMove,delay);
}
function runWatchMove() {
  clearTimeout(watchTimer);
  if(mode!=='watch'||!watchPending||phase!=='explaining')return;
  $('watch-progress-bar').style.animation='none';
  void commit(watchPending.move,true);
}
function scheduleWatch(force=false) {
  clearTimeout(watchTimer);
  if(mode!=='watch'||state.winner!==null||phase!=='ready'||watchPaused&&!force)return;
  phase='thinking';render();const id=++generation;
  worker?.terminate();worker=new Worker(new URL('./ai-worker.js',import.meta.url),{type:'module'});
  const failed=message=>{
    if(id!==generation)return;
    console.error('Spectator opponent failed',message);worker?.terminate();worker=null;phase='ready';watchPaused=true;
    $('watch-title').textContent='The match is paused.';$('watch-summary').textContent='The computer could not choose a move. Press Resume to retry.';render();
  };
  worker.onerror=error=>failed(error.message);
  worker.onmessage=({data})=>{
    if(id!==generation||mode!=='watch')return;
    worker?.terminate();worker=null;if(data.error){failed(data.error);return;}
    try {
      const result=applyMove(state,data.move),comment=explainMove(state,data.move,result);
      watchPending={move:data.move,result};selected=data.move;preview=result;
      scene.setSelection(selected);scene.setPreview(result);
      $('watch-speaker').textContent=`${playerName(state.turn).toUpperCase()} AI`;
      $('watch-dialog').classList.toggle('blue-speaking',state.turn===1);
      $('watch-move').textContent=`MOVE ${String(state.ply+1).padStart(2,'0')} · ${data.move===null?'PASS':tileName(data.move)}`;
      $('watch-tag').textContent=comment.tag;$('watch-title').textContent=comment.title;
      $('watch-summary').textContent=comment.summary;$('watch-insight').textContent=comment.insight;$('watch-consequence').textContent=comment.consequence;
      phase='explaining';render();
      if(watchStepRequested){watchStepRequested=false;watchTimer=setTimeout(runWatchMove,reduced?0:500);}
      else armWatchMove();
    } catch(error){failed(error.message);}
  };
  worker.postMessage({id,state,difficulty:'normal'});
}
function toggleWatchPause() {
  if(mode!=='watch'||state.winner!==null)return;
  watchPaused=!watchPaused;clearTimeout(watchTimer);renderWatch();
  if(!watchPaused){if(watchPending&&phase==='explaining')armWatchMove();else if(phase==='ready')scheduleWatch();}
}
function stepWatch() {
  if(mode!=='watch'||state.winner!==null||phase==='thinking'||phase==='animating')return;
  watchPaused=true;clearTimeout(watchTimer);
  if(watchPending)runWatchMove();else{watchStepRequested=true;scheduleWatch(true);}
  renderWatch();
}
$('watch-button').addEventListener('click',startWatching);
$('watch-close').addEventListener('click',stopWatching);
$('watch-return').addEventListener('click',stopWatching);
$('watch-pause').addEventListener('click',toggleWatchPause);
$('watch-step').addEventListener('click',stepWatch);
$('watch-again').addEventListener('click',resetWatchMatch);
$('watch-speed').addEventListener('change',event=>{watchDelay=Number(event.target.value);if(phase==='explaining'&&!watchPaused)armWatchMove();});
$('tile-select').addEventListener('change',event=>selectTile(event.target.value===''?null:Number(event.target.value)));
$('commit-button').addEventListener('click',()=>{if(selected!==null)void commit(selected);});
$('pass-button').addEventListener('click',()=>void commit(null));
$('undo-button').addEventListener('click',undo);
$('help-button').addEventListener('click',()=>$('help-dialog').showModal());
$('new-button').addEventListener('click',openNew);
$('start-button').addEventListener('click',newGame);
$('play-again').addEventListener('click',()=>{$('result-dialog').close();openNew();});
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>$(button.dataset.close).close());
$('camera-button').addEventListener('click',()=>{topView=false;scene.resetCamera();$('top-button').setAttribute('aria-pressed','false');});
$('top-button').addEventListener('click',()=>{topView=!topView;scene.setTopView(topView);$('top-button').setAttribute('aria-pressed',String(topView));});
$('sound-button').addEventListener('click',()=>{sound=!sound;chime();save();render();});
$('motion-button').addEventListener('click',()=>{reduced=!reduced;scene.setReducedMotion(reduced);save();render();});
document.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open]'))return;
  if(['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;
  if(event.key==='?'){event.preventDefault();$('help-dialog').showModal();return;}
  if(event.key==='Escape'){selectTile(null);return;}
  if(event.key==='Enter'&&event.target===$('scene')&&selected!==null){event.preventDefault();void commit(selected);return;}
  if(event.key.toLowerCase()==='u'&&!event.metaKey&&!event.ctrlKey){undo();return;}
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)&&humanTurn()){
    event.preventDefault();const delta={ArrowUp:-6,ArrowDown:6,ArrowLeft:-1,ArrowRight:1}[event.key];
    let index=selected??(delta>0?35:0);
    for(let n=0;n<36;n++){index=(index+delta+36)%36;if(legalMoves(state).includes(index)){selectTile(index);break;}}
    $('scene').focus();
  }
});
window.addEventListener('beforeunload',()=>{save();clearTimeout(watchTimer);worker?.terminate();scene.dispose();audio?.close();});
// Read-only inspection lets native acceptance tests verify the visible board.
Object.defineProperty(window,'afterlight',{value:Object.freeze({getState:()=>structuredClone(state),getPhase:()=>phase,getTileScreenPosition:index=>scene.getTileScreenPosition(index)}),writable:false});
render();if(state.winner===null)scheduleComputer();
