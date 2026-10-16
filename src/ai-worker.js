import { chooseMove } from './engine.js';
self.onmessage = ({data}) => {
  try { self.postMessage({id:data.id,move:chooseMove(data.state,{difficulty:data.difficulty,depth:data.difficulty==='hard'?4:data.difficulty==='easy'?1:3})}); }
  catch (error) { self.postMessage({id:data.id,error:error.message}); }
};
