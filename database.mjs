import {DatabaseSync} from 'node:sqlite';
import {scryptSync,randomBytes,randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
export const hashPassword=(p,s=randomBytes(16).toString('hex'))=>s+':'+scryptSync(p,s,64).toString('hex');
export function openDatabase(path){
 mkdirSync(dirname(path),{recursive:true}); const db=new DatabaseSync(path);
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL,plan TEXT NOT NULL,status TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,tenant TEXT REFERENCES tenants(id),email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,password TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user TEXT REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,tenant TEXT NOT NULL REFERENCES tenants(id),kind TEXT NOT NULL,owner TEXT REFERENCES users(id),data TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS tenant_kind ON records(tenant,kind);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,tenant TEXT,actor TEXT,action TEXT,target TEXT,at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,tenant TEXT NOT NULL,owner TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,body BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,until INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS mcp_tokens(id TEXT PRIMARY KEY,hash TEXT UNIQUE NOT NULL,user TEXT NOT NULL REFERENCES users(id),scopes TEXT NOT NULL,expires INTEGER NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mcp_proposals(id TEXT PRIMARY KEY,token TEXT NOT NULL,user TEXT NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS leave_policies(tenant TEXT NOT NULL REFERENCES tenants(id),type TEXT NOT NULL,year INTEGER NOT NULL,allowance INTEGER NOT NULL,workdays TEXT NOT NULL,holidays TEXT NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(tenant,type,year));`);
 return db;
}
export function seed(db,password){
 if(db.prepare('SELECT count(*) n FROM users').get().n)return;
 const add=(t,k,o,d)=>{let now=new Date().toISOString();db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?)').run(randomUUID(),t,k,o,JSON.stringify(d),now,now)};
 db.exec('BEGIN');
 try{
 for(const [id,name] of [['north','Northstar Studio'],['south','Southbank Labs']]){
 db.prepare('INSERT INTO tenants VALUES(?,?,?,?)').run(id,name,'Growth','active');
 for(const [role,n] of [['admin','Alex Morgan'],['hr','Jordan Ellis'],['employee','Sam Rivera']])db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id+'-'+role,id,role+'@'+id+'.test',n,role,hashPassword(password));
 const employees=[['Alex Morgan','Operations','Company lead',78000,'admin'],['Jordan Ellis','People','HR partner',62000,'hr'],['Sam Rivera','Product','Product designer',56000,'employee'],['Taylor Brooks','Engineering','Software engineer',72000,null],['Jamie Chen','Marketing','Content strategist',48000,null],['Casey Parker','Engineering','Quality engineer',58000,null]];
 for(const [name,department,title,salary,role] of employees)add(id,'employees',role?id+'-'+role:null,{name,email:name.toLowerCase().replace(' ','.')+'@example.test',department,title,salary,status:'Active',start:'2026-01-12'});
 add(id,'leave',id+'-employee',{name:'Sam Rivera',type:'Annual',start:'2026-11-16',end:'2026-11-18',reason:'Personal time',status:'Pending'});
 add(id,'jobs',null,{name:'Senior product designer',department:'Product',location:'Remote',status:'Open'});
 add(id,'candidates',null,{name:'Morgan Lee',email:'morgan@example.test',position:'Senior product designer',status:'Screening'});
 add(id,'assets',null,{name:'Design laptop',serial:'SANDBOX-001',assignee:'Sam Rivera',status:'Assigned'});
 add(id,'goals',id+'-employee',{name:'Deliver design system',assignee:'Sam Rivera',due:'2026-12-15',progress:65,status:'In progress'});
 add(id,'onboarding',null,{name:'Complete welcome checklist',assignee:'Sam Rivera',due:'2026-11-07',status:'In progress'});
 add(id,'training',null,{name:'Inclusive collaboration',assignee:'All employees',due:'2026-11-20',status:'Scheduled'});
 add(id,'meetings',null,{name:'People team weekly',date:'2026-11-06',time:'10:00',location:'Studio / video',status:'Scheduled'});
 add(id,'announcements',null,{name:'Welcome to your people workspace',message:'This is a sandbox with fictional records. Start with employee profiles or review pending leave.',status:'Published'});
 }
 db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run('platform',null,'platform@peopleflow.test','Platform Admin','superadmin',hashPassword(password));
 db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}

