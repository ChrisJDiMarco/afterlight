import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { createGame, applyMove, chooseMove, legalMoves } from '../src/engine.js';
import { mkdir, writeFile } from 'node:fs/promises';
const profile=`/tmp/afterlight-smoke-${Date.now()}`;
const packaged=process.env.AFTERLIGHT_EXECUTABLE;
const app=await electron.launch({...(packaged?{executablePath:packaged}:{}),args:[...(packaged?[]:['.']),`--user-data-dir=${profile}`],cwd:process.cwd()});
let errors=[];let checks=[];
try {
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.context().setOffline(true);checks.push('Runs with browser networking disabled');
 await page.waitForFunction(()=>window.afterlight);
 const actual=()=>page.evaluate(()=>window.afterlight.getState());
 const ready=()=>page.waitForFunction(()=>window.afterlight.getPhase()==='ready',{},{timeout:15000});
 const initial=await actual();assert.deepEqual(initial,createGame());checks.push('Opening matches deterministic engine');
 await page.screenshot({path:'test/artifacts/opening.png'});
 await page.locator('#help-button').click();assert(await page.locator('#help-dialog').isVisible());await page.screenshot({path:'test/artifacts/help.png'});await page.locator('[data-close="help-dialog"]').first().click();checks.push('Help opens and closes');
 const occupied=initial.sparks[0].row*6+initial.sparks[0].col;
 let point=await page.evaluate(i=>window.afterlight.getTileScreenPosition(i),occupied);
 await page.mouse.click(point.x,point.y);assert.equal(await page.locator('#tile-select').inputValue(),'');assert.match(await page.locator('#toast').textContent(),/holds a spark/);checks.push('Occupied canvas tile blocked');
 const move=legalMoves(initial).find(m=>m!==null);
 point=await page.evaluate(i=>window.afterlight.getTileScreenPosition(i),move);await page.mouse.click(point.x,point.y);
 assert.equal(await page.locator('#tile-select').inputValue(),String(move));assert.match(await page.locator('#forecast').textContent(),/No points this step/);await page.screenshot({path:'test/artifacts/selected.png'});checks.push('Canvas raycast selects exact tile and previews');
 await page.locator('#commit-button').click();await page.waitForTimeout(400);await page.screenshot({path:'test/artifacts/in-motion.png'});await page.waitForFunction(()=>window.afterlight.getState().ply===2&&window.afterlight.getPhase()==='ready',{},{timeout:15000});
 let after=await actual();const afterHuman=applyMove(initial,move).state;
 assert(legalMoves(afterHuman).some(m=>JSON.stringify(applyMove(afterHuman,m).state)===JSON.stringify(after)));checks.push('Animated human move and real worker AI reply both follow engine');
 await page.locator('#undo-button').click();assert.deepEqual(await actual(),initial);checks.push('Undo restores entire human/computer round');
 await page.locator('#sound-button').click();assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'),'true');await page.locator('#sound-button').click();checks.push('Optional sound toggles without errors');
 await page.locator('#top-button').click();assert.equal(await page.locator('#top-button').getAttribute('aria-pressed'),'true');await page.screenshot({path:'test/artifacts/top-view.png'});await page.locator('#camera-button').click();
 const beforeDrag=await page.locator('#tile-select').inputValue();const box=await page.locator('#scene').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.5+90,box.y+box.height*.5+30,{steps:15});await page.mouse.up();assert.equal(await page.locator('#tile-select').inputValue(),beforeDrag);await page.locator('#camera-button').click();checks.push('Orbit drag does not accidentally select; top/reset controls work');
 await page.locator('#new-button').click();await page.locator('input[name=mode][value=local]').check();await page.locator('#start-button').click();await page.locator('#motion-button').click();
 assert.equal(await page.locator('#motion-button').getAttribute('aria-pressed'),'true');
 await page.locator('#pass-button').click();await ready();assert.deepEqual(await actual(),applyMove(initial,null).state);checks.push('Local mode, reduced motion, and pass follow engine');
 const beforeReload=await actual();await page.reload();await page.waitForFunction(()=>window.afterlight);assert.deepEqual(await actual(),beforeReload);checks.push('Autosave restores board, score, turn, and mode on reload');
 await page.locator('#undo-button').click();assert.deepEqual(await actual(),initial);checks.push('Saved undo history survives reload');
 let expected=initial;let plies=0;let scoringForecast=false;
 while(expected.winner===null&&plies<100){
   const m=chooseMove(expected,{depth:2});const result=applyMove(expected,m);
   if(m===null)await page.locator('#pass-button').click();else{await page.locator('#tile-select').selectOption(String(m));const text=await page.locator('#forecast').textContent();if(result.state.scores.some((n,i)=>n>expected.scores[i])){assert(!text.includes('No points'));scoringForecast=true;}await page.locator('#commit-button').click();}
   await ready();expected=result.state;assert.deepEqual(await actual(),expected);plies++;
 }
 assert.notEqual(expected.winner,null);assert(scoringForecast);assert(await page.locator('#result-dialog').isVisible());await page.screenshot({path:'test/artifacts/game-complete.png'});checks.push(`Complete ${plies}-move game reaches correct ${expected.winner} result and scoring forecasts`);
 await page.locator('#play-again').click();assert(await page.locator('#new-dialog').isVisible());await page.locator('input[name=mode][value=ai]').check();await page.locator('#start-button').click();assert.deepEqual(await actual(),initial);checks.push('Game-over replay resets to playable game');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1000,740));await page.waitForTimeout(300);await page.screenshot({path:'test/artifacts/minimum-window.png'});const sizes=await page.evaluate(()=>({w:innerWidth,h:innerHeight,scroll:document.documentElement.scrollWidth}));assert(sizes.scroll<=sizes.w);assert(await page.locator('#commit-button').isVisible());checks.push('1000×740 minimum window has no horizontal overflow');
 assert.deepEqual(errors,[]);
 await mkdir('test/artifacts',{recursive:true});await writeFile('test/artifacts/acceptance.json',JSON.stringify({checks,errors,result:{winner:expected.winner,scores:expected.scores,plies}},null,2));
 console.log(JSON.stringify({checks,errors},null,2));
} finally {await app.close();}
