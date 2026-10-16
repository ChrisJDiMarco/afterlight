import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const packaged=process.env.AFTERLIGHT_EXECUTABLE;
const app=await electron.launch({...(packaged?{executablePath:packaged}:{}),args:[...(packaged?[]:['.']),`--user-data-dir=/tmp/afterlight-watch-${Date.now()}`],cwd:process.cwd()});
const checks=[],errors=[],commentary=[];
try{
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.context().setOffline(true);
 await page.waitForFunction(()=>window.afterlight);
 const actual=()=>page.evaluate(()=>window.afterlight.getState());
 await page.locator('#new-button').click();await page.locator('input[name=mode][value=local]').check();await page.locator('#start-button').click();
 await page.locator('#motion-button').click();await page.locator('#pass-button').click();await page.waitForFunction(()=>window.afterlight.getState().ply===1);
 const original=await actual();
 await page.locator('#watch-button').click();await page.waitForFunction(()=>window.afterlight.getPhase()==='explaining');
 assert(await page.locator('#watch-dialog').isVisible());assert.equal((await actual()).ply,0);assert.match(await page.locator('#watch-speaker').textContent(),/AMBER AI/);assert((await page.locator('#watch-summary').textContent()).length>35);
 assert.equal(await page.locator('#watch-speed').inputValue(),'0');const readingMs=Number(await page.locator('#watch-progress-bar').getAttribute('data-duration'));assert(readingMs>=15000&&readingMs<=30000);await page.waitForTimeout(8000);assert.equal((await actual()).ply,0);checks.push('Default read-along pace leaves ample time before the first move');
 await page.locator('#watch-speed').selectOption('2500');await page.locator('#watch-pause').click();await page.waitForTimeout(3500);assert.equal((await actual()).ply,0);checks.push('Watch starts fresh, shows real move commentary, and pause cancels autoplay');
 await page.screenshot({path:'test/artifacts/spectator-paused.png'});
 await page.locator('#watch-step').click();await page.waitForFunction(()=>window.afterlight.getState().ply===1&&window.afterlight.getPhase()==='ready');await page.waitForTimeout(800);assert.equal((await actual()).ply,1);checks.push('Next move advances exactly once while paused');
 await page.locator('#watch-step').click();await page.waitForFunction(()=>window.afterlight.getState().ply===2&&window.afterlight.getPhase()==='ready');assert.match(await page.locator('#watch-speaker').textContent(),/BLUE AI/);checks.push('Both AI colors alternate with their own explanations');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('afterlight.game.v1')));assert.deepEqual(saved.state,original);assert.equal(saved.mode,'local');checks.push('Spectator moves never overwrite the saved human match');
 await page.locator('#watch-speed').selectOption('2500');await page.locator('#watch-pause').click();await page.waitForFunction(()=>window.afterlight.getState().ply>=4,{},{timeout:15000});await page.locator('#watch-pause').click();
 await page.waitForFunction(()=>window.afterlight.getPhase()!=='animating'&&window.afterlight.getPhase()!=='thinking');checks.push('Resume and selected pace automatically play both sides');
 while((await actual()).winner===null){
   const before=(await actual()).ply;
   await page.locator('#watch-step').click();await page.waitForFunction(p=>window.afterlight.getState().ply>p&&window.afterlight.getPhase()==='ready',before,{timeout:10000});
   commentary.push({ply:(await actual()).ply,speaker:await page.locator('#watch-speaker').textContent(),title:await page.locator('#watch-title').textContent(),summary:await page.locator('#watch-summary').textContent()});
   assert(commentary.length<100);
 }
 assert(await page.locator('#watch-again').isVisible());assert(!(await page.locator('#result-dialog').isVisible()));checks.push('Full AI match completes inside commentary modal with replay');await page.screenshot({path:'test/artifacts/spectator-complete.png'});
 await page.locator('#watch-again').click();await page.waitForFunction(()=>window.afterlight.getPhase()==='explaining');assert.equal((await actual()).ply,0);
 await page.locator('#watch-return').click();assert(!(await page.locator('#watch-dialog').isVisible()));assert.deepEqual(await actual(),original);checks.push('Watch another resets and return restores exact human position');
 await page.locator('#watch-button').click();await page.waitForFunction(()=>window.afterlight.getPhase()==='explaining');await page.reload();await page.waitForFunction(()=>window.afterlight);assert.deepEqual(await actual(),original);assert(!(await page.locator('#watch-dialog').isVisible()));checks.push('Closing/reloading during a watched match restores human autosave');
 // Exercise stop while a full animation is in flight.
 await page.locator('#motion-button').click();await page.locator('#watch-button').click();await page.waitForFunction(()=>window.afterlight.getPhase()==='explaining');await page.locator('#watch-pause').click();await page.locator('#watch-step').click();await page.waitForFunction(()=>window.afterlight.getPhase()==='animating');await page.locator('#watch-return').click();await page.waitForFunction(()=>!document.getElementById('watch-dialog').open);assert.deepEqual(await actual(),original);checks.push('Return during animation waits safely and restores original game');
 assert.deepEqual(errors,[]);await writeFile('test/artifacts/spectator-acceptance.json',JSON.stringify({checks,errors,commentary},null,2));console.log(JSON.stringify({checks,errors,movesExplained:commentary.length},null,2));
}finally{await app.close();}
