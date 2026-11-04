import {randomUUID} from 'node:crypto';
import {requirePermission} from './permissions.mjs';
const error=(status,message)=>Object.assign(Error(message),{status});
const managers=u=>['admin','hr'].includes(u.role);
export class Tasks {
 constructor(db,audit){this.db=db;this.audit=audit;}
 assignees(u){requirePermission(u,'tasks:read');return this.db.prepare("SELECT u.id,u.name FROM users u LEFT JOIN user_access a ON a.user=u.id WHERE u.tenant=? AND COALESCE(a.status,'active')='active' ORDER BY u.name").all(u.tenant);}
 list(u){requirePermission(u,'tasks:read');return this.db.prepare("SELECT * FROM records WHERE tenant=? AND kind='tasks' ORDER BY created DESC").all(u.tenant).filter(r=>managers(u)||r.owner===u.id).map(r=>({...r,data:JSON.parse(r.data)}));}
 get(u,id){const r=this.list(u).find(r=>r.id===id);if(!r)throw error(404,'Task not found');return r;}
 validate(u,action,input){
 requirePermission(u,['create','assign'].includes(action)?'tasks:assign':action==='status'?'tasks:status':'tasks:comment');
 if(!input||typeof input!=='object'||Array.isArray(input))throw error(400,'Task input required');
 const keys={create:['title','description','assignee','due','priority'],assign:['id','assignee','version'],status:['id','status','version'],comment:['id','text','version']}[action];
 if(!keys||Object.keys(input).some(k=>!keys.includes(k)))throw error(400,'Unknown task fields or action');
 if(['create','assign'].includes(action)&&!managers(u))throw error(403,'Only managers can assign tasks');
 let current=action==='create'?null:this.get(u,input.id);
 if(current&&(!Number.isInteger(input.version)||input.version!==current.data.version))throw error(409,'Task changed. Refresh and try again.');
 const data=current?{...current.data}:{};
 if(action==='create'){
 if(typeof input.title!=='string'||!input.title.trim()||input.title.length>200)throw error(400,'Title is required (maximum 200 characters)');
 if(typeof input.description!=='string'||input.description.length>2000)throw error(400,'Description must be at most 2000 characters');
 if(typeof input.due!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.due)||Number.isNaN(Date.parse(input.due))||new Date(input.due).toISOString().slice(0,10)!==input.due)throw error(400,'Valid due date required');
 if(!['Low','Normal','High','Urgent'].includes(input.priority))throw error(400,'Invalid priority');
 Object.assign(data,{title:input.title.trim(),description:input.description,due:input.due,priority:input.priority,status:'To do',creator:u.name,comments:[]});
 }
 if(['create','assign'].includes(action)){const assignee=this.assignees(u).find(a=>a.id===input.assignee);if(!assignee)throw error(400,'Assignee must belong to this workspace');data.assignee=assignee.id;data.assigneeName=assignee.name;}
 if(action==='status'){if(!['To do','In progress','Done'].includes(input.status))throw error(400,'Invalid task status');data.status=input.status;}
 if(action==='comment'){if(typeof input.text!=='string'||!input.text.trim()||input.text.length>2000)throw error(400,'Comment must be 1–2000 characters');if(data.comments.length>=100)throw error(409,'Task comment limit reached');data.comments=[...data.comments,{author:u.name,text:input.text.trim(),at:new Date().toISOString()}];}
 data.version=(current?.data.version||0)+1;
 data.activity=[...(current?.data.activity||[]),{actor:u.name,action,at:new Date().toISOString(),status:data.status,assignee:data.assigneeName}].slice(-100);
 return {current,data};
 }
 apply(u,action,input){const {current,data}=this.validate(u,action,input),id=current?.id||randomUUID(),now=new Date().toISOString();
 if(current)this.db.prepare('UPDATE records SET owner=?,data=?,updated=? WHERE id=? AND tenant=?').run(data.assignee,JSON.stringify(data),now,id,u.tenant);
 else this.db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?)').run(id,u.tenant,'tasks',data.assignee,JSON.stringify(data),now,now);
 this.audit(u,'task:'+action,id);return this.get(u,id);
 }
}
