import {randomUUID} from 'node:crypto';
const fail=(status,message)=>Object.assign(Error(message),{status});
const both=['hr','employee'],hr=['hr'];
export const permissionCatalog=[
 ['scheduling:read','Read shifts, policies and own assignments',both],['scheduling:write','Configure shifts, assign and import synthetic attendance',hr],
 ['timeoff:read','Read holidays, leave types and calendar',both],['timeoff:write','Manage holidays and leave types',hr],
 ['interviews:read','Read permitted interviews',both],['interviews:write','Schedule or complete permitted interviews',both],['onboarding:complete','Complete own linked checklist',both],['statements:read','Read own approved simulation statements',both],
 ['employees:read','Read permitted employees',both],['employees:write','Create/edit employees',hr],
 ['organization:read','Read organization structure',hr],['organization:write','Create/edit organization structure',hr],
 ['tasks:read','Read permitted tasks',both],['tasks:assign','Create/reassign tasks',hr],['tasks:status','Update permitted task status',both],['tasks:comment','Comment on permitted tasks',both],
 ['leave:read','Read permitted leave and own balance',both],['leave:request','Request own leave',both],['leave:review','Review other employees’ leave',hr],['leave:cancel','Cancel permitted leave requests',both],
 ['attendance:read','Read permitted attendance/corrections',both],['attendance:clock','Clock own attendance',both],['attendance:request','Request own attendance correction',both],['attendance:review','Review other employees’ corrections',hr],
 ...['timesheets','jobs','candidates','onboarding','goals','training','payroll','assets','meetings','announcements','documents'].flatMap(k=>[[k+':read','Read permitted '+k,['jobs','candidates','payroll','assets'].includes(k)?hr:both],[k+':write','Create/edit '+k,k==='timesheets'?both:hr]]),
 ['reports:read','Read workforce reports',hr],['audit:read','Read workspace audit log',hr],['mcp:connect','Create own scoped MCP tokens',both],
].map(([key,label,bases])=>({key,label,bases}));
export const can=(u,key)=>!u.customRole||u.permissions?.includes(key);
export function requirePermission(u,key){if(!can(u,key))throw fail(403,'Permission denied: '+key);}
export class Permissions {
 constructor(db,audit){this.db=db;this.audit=audit;db.exec("CREATE TABLE IF NOT EXISTS custom_roles(id TEXT PRIMARY KEY,tenant TEXT NOT NULL REFERENCES tenants(id),name TEXT NOT NULL,description TEXT NOT NULL,base TEXT NOT NULL,grants TEXT NOT NULL,version INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS user_custom_roles(user TEXT PRIMARY KEY REFERENCES users(id),role TEXT NOT NULL REFERENCES custom_roles(id))");}
 admin(u){if(u.role!=='admin'||u.customRole)throw fail(403,'Built-in company administrator required');}
 hydrate(u){if(!u)return u;const assignment=this.db.prepare('SELECT r.* FROM user_custom_roles a JOIN custom_roles r ON r.id=a.role WHERE a.user=? AND r.tenant=?').get(u.id,u.tenant);return assignment?{...u,role:assignment.base,customRole:{id:assignment.id,name:assignment.name,version:assignment.version},permissions:JSON.parse(assignment.grants)}:u;}
 list(u){this.admin(u);return this.db.prepare('SELECT * FROM custom_roles WHERE tenant=? ORDER BY name').all(u.tenant).map(r=>({...r,grants:JSON.parse(r.grants),assigned:this.db.prepare('SELECT count(*) n FROM user_custom_roles WHERE role=?').get(r.id).n}));}
 revoke(id){this.db.prepare('DELETE FROM sessions WHERE user=?').run(id);this.db.prepare('DELETE FROM mcp_proposals WHERE user=?').run(id);this.db.prepare('DELETE FROM mcp_tokens WHERE user=?').run(id);}
 save(u,b,id){this.admin(u);if(!b||Object.keys(b).some(k=>!['name','description','base','grants','version'].includes(k))||typeof b.name!=='string'||!b.name.trim()||b.name.length>100||typeof b.description!=='string'||b.description.length>1000||!['hr','employee'].includes(b.base)||!Array.isArray(b.grants)||b.grants.length>permissionCatalog.length||new Set(b.grants).size!==b.grants.length||b.grants.some(key=>!permissionCatalog.some(p=>p.key===key&&p.bases.includes(b.base))))throw fail(400,'Invalid role or permissions');
  for(const key of b.grants){const [module,action]=key.split(':');if(!['read','connect'].includes(action)&&!b.grants.includes(module+':read'))throw fail(400,'Action requires '+module+':read');}if(b.grants.includes('employees:write')&&!b.grants.includes('organization:read'))throw fail(400,'Employee editing requires organization:read');
  if(b.grants.includes('reports:read')&&['employees:read','leave:read','attendance:read'].some(k=>!b.grants.includes(k)))throw fail(400,'Reports require employees:read, leave:read and attendance:read');
  const old=id?this.list(u).find(r=>r.id===id):null;if(id&&!old)throw fail(404,'Role not found');if(old&&old.version!==b.version)throw fail(409,'Role changed; reload');if(old&&old.base!==b.base&&old.assigned)throw fail(409,'Cannot change scope while users are assigned');
  if(this.db.prepare('SELECT id FROM custom_roles WHERE tenant=? AND lower(name)=lower(?) AND id<>?').get(u.tenant,b.name.trim(),id||''))throw fail(409,'Role name already exists');const roleId=id||randomUUID();this.db.exec('BEGIN IMMEDIATE');try{if(old)this.db.prepare('UPDATE custom_roles SET name=?,description=?,base=?,grants=?,version=version+1 WHERE id=? AND tenant=?').run(b.name.trim(),b.description.trim(),b.base,JSON.stringify(b.grants),roleId,u.tenant);else this.db.prepare('INSERT INTO custom_roles VALUES(?,?,?,?,?,?,1)').run(roleId,u.tenant,b.name.trim(),b.description.trim(),b.base,JSON.stringify(b.grants));for(const a of this.db.prepare('SELECT user FROM user_custom_roles WHERE role=?').all(roleId))this.revoke(a.user);this.audit(u,'role:'+(id?'update':'create'),roleId);this.db.exec('COMMIT');return this.list(u).find(r=>r.id===roleId);}catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 assign(u,userId,b){this.admin(u);if(!b||Object.keys(b).some(k=>!['role','version'].includes(k)))throw fail(400,'Invalid role assignment');const target=this.db.prepare('SELECT * FROM users WHERE id=? AND tenant=?').get(userId,u.tenant);if(!target)throw fail(404,'User not found');if(target.role==='admin')throw fail(409,'Keep administrators on built-in access; change their built-in role first');const role=b.role===null?null:this.list(u).find(r=>r.id===b.role);if(b.role!==null&&!role)throw fail(404,'Role not found');const access=this.db.prepare('SELECT * FROM user_access WHERE user=?').get(userId);if(b.version!==(access?.version||1))throw fail(409,'User changed; reload');
  this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('DELETE FROM user_custom_roles WHERE user=?').run(userId);if(role){this.db.prepare('INSERT INTO user_custom_roles VALUES(?,?)').run(userId,role.id);this.db.prepare('UPDATE users SET role=? WHERE id=?').run(role.base,userId);}else this.db.prepare("UPDATE users SET role='employee' WHERE id=?").run(userId);this.db.prepare('INSERT INTO user_access VALUES(?,?,?) ON CONFLICT(user) DO UPDATE SET version=excluded.version').run(userId,access?.status||'active',(access?.version||1)+1);this.revoke(userId);this.audit(u,'role:assign',userId);this.db.exec('COMMIT');return {ok:true};}catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 route(u,path,method){if(!u.customRole)return;const read=method==='GET';if(['/api/me','/api/logout'].includes(path))return;
  if(path.startsWith('/api/scheduling/'))return requirePermission(u,'scheduling:'+(read?'read':'write'));
  if(path.startsWith('/api/timeoff/'))return requirePermission(u,'timeoff:'+(read?'read':'write'));
  if(path.startsWith('/api/recruitment/')){const kind=path.split('/')[3];if(kind==='assignees')return requirePermission(u,'interviews:write');if(kind==='onboarding-assignees')return requirePermission(u,'onboarding:write');return requirePermission(u,kind+':'+(read?'read':kind==='onboarding'&&u.role==='employee'?'complete':'write'));}
  if(path==='/api/payroll-statements')return requirePermission(u,u.role==='employee'?'statements:read':'payroll:read');
  if(path.startsWith('/api/payroll-'))return requirePermission(u,'payroll:'+(read?'read':'write'));
  if(path==='/api/mcp-tokens')return requirePermission(u,'mcp:connect');
  if(path.startsWith('/api/organization/'))return requirePermission(u,'organization:'+(read?'read':'write'));
  if(path==='/api/tasks'||path==='/api/task-assignees')return requirePermission(u,'tasks:read');
  if(path==='/api/leave-summary')return requirePermission(u,'leave:read');
  if(path==='/api/attendance')return requirePermission(u,'attendance:clock');
  if(path.startsWith('/api/attendance-regularizations'))return requirePermission(u,'attendance:'+(read?'read':method==='POST'?'request':'review'));
  if(path==='/api/reports'||path==='/api/audit')return requirePermission(u,path.slice(5)+':read');
  if(path.startsWith('/api/files/'))return requirePermission(u,'documents:read');if(path==='/api/documents')return requirePermission(u,'documents:write');
  const r=path.match(/^\/api\/records\/([a-z]+)/);if(r){if(r[1]==='leave'&&!read)return;return requirePermission(u,r[1]+':'+(read?'read':'write'));}
  throw fail(403,'This operation is unavailable to custom roles');
 }
 scope(u,scope){if(!u.customRole||scope==='profile')return true;if(scope==='tasks:write')return ['tasks:assign','tasks:status','tasks:comment'].some(k=>can(u,k));return can(u,scope);}
}
