'use strict';
const {Worker}=require('node:worker_threads'),path=require('node:path');
function createScorePool({limit=2,maxQueue=30,timeoutMs=12000}={}){
  let active=0,closed=false;const queue=[],running=new Set();
  function pump(){while(!closed&&active<limit&&queue.length){const job=queue.shift();active++;let worker;try{worker=new Worker(path.join(__dirname,'mimic_score_worker.js'),{workerData:job.data});}catch(error){active--;job.reject(error);continue;}running.add(worker);let done=false;
    const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);running.delete(worker);void worker.terminate();active--;error?job.reject(error):job.resolve(result);pump();};
    const timer=setTimeout(()=>finish(Error('Audio-Bewertung hat zu lange gebraucht.')),timeoutMs);timer.unref?.();
    worker.on('message',m=>m.error?finish(Error(m.error)):finish(null,m.result));worker.on('error',e=>finish(e));worker.on('exit',code=>{if(!done)finish(Error('Audio-Worker wurde beendet.'));});
    worker.cancel=()=>finish(Error('Spiel beendet.'));
  }}
  return {score:(reference,recording)=>new Promise((resolve,reject)=>{if(closed||queue.length>=maxQueue)return reject(Error('Audio-Bewertung ist ausgelastet.'));queue.push({data:{reference,recording},resolve,reject});pump();}),close:()=>{closed=true;for(const job of queue.splice(0))job.reject(Error('Spiel beendet.'));for(const worker of [...running])worker.cancel();}};
}
module.exports={createScorePool};
