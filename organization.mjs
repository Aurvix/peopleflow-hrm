import {randomUUID} from 'node:crypto';
import {requirePermission} from './permissions.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const kinds=['branches','departments','designations'],manager=u=>['admin','hr'].includes(u.role);
const parents={departments:'branches',designations:'departments'};
export class Organization {
 constructor(db,audit){this.db=db;this.audit=audit;db.exec('CREATE TABLE IF NOT EXISTS organization(id TEXT PRIMARY KEY,tenant TEXT NOT NULL REFERENCES tenants(id),kind TEXT NOT NULL,parent TEXT REFERENCES organization(id),name TEXT NOT NULL,data TEXT NOT NULL,version INTEGER NOT NULL)');}
 access(u){if(!manager(u))throw fail(403,'Company or HR role required');}
 list(u,kind){this.access(u);requirePermission(u,'organization:read');if(!kinds.includes(kind))throw fail(404,'Organization module not found');return this.db.prepare('SELECT * FROM organization WHERE tenant=? AND kind=? ORDER BY name COLLATE NOCASE').all(u.tenant,kind).map(r=>({...r,data:JSON.parse(r.data)}));}
 get(u,id,kind){const r=this.db.prepare('SELECT * FROM organization WHERE id=? AND tenant=?').get(id,u.tenant);if(!r||kind&&r.kind!==kind)throw fail(404,'Organization record not found');return {...r,data:JSON.parse(r.data)};}
 save(u,kind,b,id){this.access(u);requirePermission(u,'organization:write');if(!kinds.includes(kind)||!b||Object.keys(b).some(k=>!['name','parent','description','address','city','state','country','postalCode','phone','email','status','version'].includes(k)))throw fail(400,'Invalid organization fields');
  const prior=id?this.get(u,id,kind):null;if(prior&&b.version!==prior.version)throw fail(409,'Record changed; reload before editing');
  const data={};for(const key of ['description','address','city','state','country','postalCode','phone','email']){const value=b[key]??'';if(typeof value!=='string'||value.length>1000||value.includes('\0'))throw fail(400,'Invalid '+key);data[key]=value.trim();}
  if(typeof b.name!=='string'||!b.name.trim()||b.name.length>120||!['Active','Inactive'].includes(b.status))throw fail(400,'Name and valid status are required');data.status=b.status;
  if(data.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))throw fail(400,'Invalid branch email');
  const parent=kind==='branches'?null:b.parent;if(kind==='branches'&&b.parent)throw fail(400,'Branch has no parent');if(parents[kind]){if(typeof parent!=='string')throw fail(400,'Parent required');const p=this.get(u,parent,parents[kind]);if(data.status==='Active'&&p.data.status!=='Active')throw fail(409,'Parent must be active');}
  const duplicate=this.db.prepare('SELECT id FROM organization WHERE tenant=? AND kind=? AND COALESCE(parent,\'\')=COALESCE(?,\'\') AND lower(name)=lower(?) AND id<>?').get(u.tenant,kind,parent,b.name.trim(),id||'');if(duplicate)throw fail(409,'Name already exists in this location');
  const employees=this.db.prepare("SELECT * FROM records WHERE tenant=? AND kind='employees'").all(u.tenant).map(r=>({...r,data:JSON.parse(r.data)}));const key={branches:'branch',departments:'department',designations:'designation'}[kind];const assigned=id?employees.filter(r=>r.data.organization?.[key]===id):[];
  if(prior&&parent!==prior.parent&&(assigned.length||this.db.prepare('SELECT id FROM organization WHERE tenant=? AND parent=? LIMIT 1').get(u.tenant,id)))throw fail(409,'Cannot move a record with linked employees or children');
  if(prior&&data.status==='Inactive'&&(assigned.some(r=>r.data.status!=='Inactive')||this.db.prepare("SELECT id FROM organization WHERE tenant=? AND parent=? AND json_extract(data,'$.status')='Active' LIMIT 1").get(u.tenant,id)))throw fail(409,'Deactivate or reassign active employees and child records first');
  const recordId=id||randomUUID();this.db.exec('BEGIN IMMEDIATE');try{
   if(prior)this.db.prepare('UPDATE organization SET parent=?,name=?,data=?,version=version+1 WHERE id=? AND tenant=?').run(parent,b.name.trim(),JSON.stringify(data),recordId,u.tenant);else this.db.prepare('INSERT INTO organization VALUES(?,?,?,?,?,?,1)').run(recordId,u.tenant,kind,parent,b.name.trim(),JSON.stringify(data));
   for(const r of assigned){const changed={...r.data,[kind==='departments'?'department':kind==='designations'?'title':'branch']:b.name.trim()};this.db.prepare('UPDATE records SET data=?,updated=? WHERE id=? AND tenant=?').run(JSON.stringify(changed),new Date().toISOString(),r.id,u.tenant);}
   this.audit(u,'organization:'+kind+':'+(id?'update':'create'),recordId);this.db.exec('COMMIT');return this.get(u,recordId,kind);
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 employee(u,input,previous){this.access(u);requirePermission(u,'employees:write');let reference=input.organization===undefined?previous?.organization:input.organization;if(reference===undefined||reference===null)return {};
  if(typeof reference!=='object'||Array.isArray(reference)||Object.keys(reference).some(k=>!['branch','department','designation'].includes(k))||['branch','department','designation'].some(k=>typeof reference[k]!=='string'||!reference[k]))throw fail(400,'Select a branch, department and designation');
  const b=this.get(u,reference.branch,'branches'),d=this.get(u,reference.department,'departments'),t=this.get(u,reference.designation,'designations');if(d.parent!==b.id||t.parent!==d.id)throw fail(400,'Branch, department and designation do not match');if([b,d,t].some(r=>r.data.status!=='Active'))throw fail(409,'Organization assignment must use active records');
  return {organization:{branch:b.id,department:d.id,designation:t.id},branch:b.name,department:d.name,title:t.name};
 }
}
