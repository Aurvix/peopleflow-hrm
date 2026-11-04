import {Scheduling} from './scheduling.mjs';
import {validDate} from './timeoff.mjs';
import {randomUUID} from 'node:crypto';
import {requirePermission} from './permissions.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const manager=u=>['admin','hr'].includes(u.role);
const time=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export class Attendance {
 constructor(db,audit){this.db=db;this.audit=audit;}
 list(u){requirePermission(u,'attendance:read');return this.db.prepare("SELECT * FROM records WHERE tenant=? AND kind='regularizations' ORDER BY created DESC").all(u.tenant).filter(r=>manager(u)||r.owner===u.id).map(r=>({...r,data:JSON.parse(r.data)}));}
 request(u,b){requirePermission(u,'attendance:request');
  if(!b||Object.keys(b).some(k=>!['attendance','clockIn','clockOut','clockOutDate','reason'].includes(k))||typeof b.attendance!=='string'||!time(b.clockIn)||!time(b.clockOut)||typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>2000)throw fail(400,'Select a record, valid same-day times, and a reason');
  const source=this.db.prepare("SELECT * FROM records WHERE id=? AND tenant=? AND owner=? AND kind='attendance'").get(b.attendance,u.tenant,u.id);if(!source)throw fail(404,'Your attendance record was not found');
  if(this.list(u).some(r=>r.data.attendance===source.id&&r.data.status==='Pending'))throw fail(409,'A request is already pending for this record');
  const original=JSON.parse(source.data),outDate=b.clockOutDate||original.date;if(!validDate(outDate)||outDate<original.date||Date.parse(outDate)-Date.parse(original.date)>86400000||outDate===original.date&&b.clockOut<=b.clockIn)throw fail(400,'Use a positive same-day or next-day interval');if(!original.snapshot&&outDate!==original.date)throw fail(400,'Overnight correction requires an assigned shift');if(original.snapshot)new Scheduling(this.db,this.audit).calculate(original.date,original.date+'T'+b.clockIn+':00.000Z',outDate+'T'+b.clockOut+':00.000Z',original.snapshot);const now=new Date().toISOString(),id=randomUUID();
  const data={attendance:source.id,name:u.name,date:original.date,outDate,clockIn:b.clockIn,clockOut:b.clockOut,reason:b.reason.trim(),status:'Pending',sourceUpdated:source.updated,originalIn:original.in,originalOut:original.out};
  this.db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?)').run(id,u.tenant,'regularizations',u.id,JSON.stringify(data),now,now);this.audit(u,'attendance:correction:request',id);return {id};
 }
 review(u,id,b){requirePermission(u,'attendance:review');
  if(!manager(u))throw fail(403,'Manager required');if(!b||Object.keys(b).some(k=>!['status','note'].includes(k))||!['Approved','Rejected'].includes(b.status)||typeof b.note!=='string'||b.note.length>2000)throw fail(400,'Invalid review');
  const request=this.list(u).find(r=>r.id===id);if(!request)throw fail(404,'Request not found');if(request.owner===u.id)throw fail(403,'Cannot review your own correction');if(request.data.status!=='Pending')throw fail(409,'Request already reviewed');
  const now=new Date().toISOString();this.db.exec('BEGIN IMMEDIATE');try{
   if(b.status==='Approved'){
    const source=this.db.prepare("SELECT * FROM records WHERE id=? AND tenant=? AND owner=? AND kind='attendance'").get(request.data.attendance,u.tenant,request.owner);if(!source)throw fail(404,'Attendance record not found');
    const original=JSON.parse(source.data);if(source.updated!==request.data.sourceUpdated||original.in!==request.data.originalIn||original.out!==request.data.originalOut)throw fail(409,'Attendance changed since this request; reject it and request a new correction');
    const changed={...original,in:request.data.date+'T'+request.data.clockIn+':00.000Z',out:(request.data.outDate||request.data.date)+'T'+request.data.clockOut+':00.000Z',status:'Complete',correction:request.id};
    if(this.db.prepare("SELECT * FROM records WHERE tenant=? AND owner=? AND kind='attendance' AND id<>?").all(u.tenant,request.owner,source.id).some(r=>{const d=JSON.parse(r.data);return d.in<changed.out&&(!d.out||d.out>changed.in)}))throw fail(409,'Correction overlaps another attendance session');
    if(original.snapshot)changed.calculation=new Scheduling(this.db,this.audit).calculate(original.date,changed.in,changed.out,original.snapshot);
    this.db.prepare('UPDATE records SET data=?,updated=? WHERE id=? AND tenant=?').run(JSON.stringify(changed),now,source.id,u.tenant);
   }
   const data={...request.data,status:b.status,reviewer:u.name,reviewNote:b.note.trim(),reviewed:now};this.db.prepare('UPDATE records SET data=?,updated=? WHERE id=? AND tenant=?').run(JSON.stringify(data),now,id,u.tenant);this.audit(u,'attendance:correction:'+b.status.toLowerCase(),id);this.db.exec('COMMIT');return {ok:true};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
}
