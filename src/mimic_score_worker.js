'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {scoreMimic}=require('./mimic_score');
try{parentPort.postMessage({result:scoreMimic(workerData.reference,workerData.recording)});}catch{parentPort.postMessage({error:'Audio-Bewertung fehlgeschlagen.'});}
