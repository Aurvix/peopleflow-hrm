import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterTasks, taskDueState} from './public/task-filters.js';
const today='2026-11-09';
const task=(id,due,status='To do',owner='me')=>({id,owner,data:{title:`Task ${id}`,description:'Onboarding',assigneeName:'Alex',due,status,priority:'Normal',comments:[]}});
const rows=[task('past','2026-11-08'),task('today',today,'In progress'),task('future','2026-11-10','To do','other'),task('done','2026-11-08','Done')];
test('due states use date-only UTC boundaries and exclude completed tasks',()=>{
 assert.equal(taskDueState(rows[0],today),'overdue');assert.equal(taskDueState(rows[1],today),'today');assert.equal(taskDueState(rows[2],today),'');assert.equal(taskDueState(rows[3],today),'');
 assert.equal(taskDueState(task('missing',''),today),'');
});
test('overdue and due-today filters exclude done tasks',()=>{
 assert.deepEqual(filterTasks(rows,{due:'overdue',today}).map(r=>r.id),['past']);
 assert.deepEqual(filterTasks(rows,{due:'today',today}).map(r=>r.id),['today']);
});
test('ownership, status, search and due filters combine without mutating input',()=>{
 const original=JSON.stringify(rows);
 assert.deepEqual(filterTasks(rows,{ownership:'mine',userId:'me',status:'In progress',query:' ALEX ',due:'today',today}).map(r=>r.id),['today']);
 assert.deepEqual(filterTasks(rows,{ownership:'mine',userId:'me',query:'future',today}),[]);
 assert.equal(filterTasks(rows,{query:'onboarding',today}).length,4);
 assert.equal(filterTasks(rows,{query:'normal',today}).length,4);
 assert.equal(JSON.stringify(rows),original);
});
test('clearing filters restores every task including completed tasks',()=>{
 assert.deepEqual(filterTasks(rows,{query:'',ownership:'all',status:'all',due:'all',today}),rows);
 assert.deepEqual(filterTasks([],{today}),[]);
});
