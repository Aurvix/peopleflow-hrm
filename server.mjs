import {Scheduling} from './scheduling.mjs';
import {TimeOff} from './timeoff.mjs';
import {browseCommerce} from './commerce-query.mjs';
import {Recruitment} from './recruitment.mjs';
import {Payroll} from './payroll.mjs';
import {Pages} from './pages.mjs';
import {Website} from './website.mjs';
import http from 'node:http';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {openDatabase,seed} from './database.mjs';
import {schemas,validate} from './schema.mjs';
import {Tasks} from './tasks.mjs';
import {Leave} from './leave.mjs';
import {Tenants} from './tenants.mjs';
import {Attendance} from './attendance.mjs';
import {Organization} from './organization.mjs';
import {WorkspaceUsers} from './users.mjs';
import {Permissions,permissionCatalog,requirePermission} from './permissions.mjs';
import {Plans} from './plans.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const db=openDatabase(process.env.DB_PATH||join(root,'data','peopleflow.sqlite'));
const password=process.env.SEED_PASSWORD||randomBytes(18).toString('base64url');
if(!db.prepare('SELECT count(*) n FROM users').get().n){seed(db,password);if(!process.env.SEED_PASSWORD)writeFileSync(join(root,'data','sandbox-access.txt'),'Sandbox password: '+password+'\nAccounts: admin@north.test, hr@north.test, employee@north.test, admin@south.test, platform@peopleflow.test\n');}
const port=Number(process.env.PORT||4310),origin=`http://127.0.0.1:${port}`;
const hash=x=>createHash('sha256').update(x).digest('hex');
const audit=(u,action,target)=>db.prepare('INSERT INTO audit(tenant,actor,action,target,at) VALUES(?,?,?,?,?)').run(u.tenant,u.id,action,target,new Date().toISOString());
const plans=new Plans(db,audit);
const website=new Website(db,audit),pages=new Pages(db,audit);
const tasks=new Tasks(db,audit);
const recruitment=new Recruitment(db,audit,plans),payroll=new Payroll(db,audit,plans.commerce);
const timeoff=new TimeOff(db,audit),scheduling=new Scheduling(db,audit);
const leave=new Leave(db,audit,timeoff),tenants=new Tenants(db,audit,plans);
const attendance=new Attendance(db,audit);
const organization=new Organization(db,audit);
const permissions=new Permissions(db,audit);
const workspaceUsers=new WorkspaceUsers(db,audit,plans);
const fail=(status,message)=>Object.assign(Error(message),{status});
const manager=u=>['admin','hr'].includes(u.role);
const all=(kind,u)=>db.prepare('SELECT * FROM records WHERE tenant=? AND kind=? ORDER BY created DESC').all(u.tenant,kind).filter(r=>u.role!=='employee'||(['employees','leave','attendance','timesheets','goals','payroll'].includes(kind)?r.owner===u.id:['meetings','training','announcements','onboarding','documents'].includes(kind))).filter(r=>kind!=='onboarding'||u.role!=='employee'||!JSON.parse(r.data).flow||r.owner===u.id).map(r=>({...r,data:JSON.parse(r.data)}));
function insert(u,kind,data,owner=null){const id=randomUUID(),now=new Date().toISOString();db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?,?)').run(id,u.tenant,kind,owner,JSON.stringify(data),now,now);audit(u,'create:'+kind,id);return id;}
function record(id,u){const r=db.prepare('SELECT * FROM records WHERE id=? AND tenant=?').get(id,u.tenant);if(!r)throw fail(404,'Record not found');r.data=JSON.parse(r.data);return r;}
function update(r,u,data){db.prepare('UPDATE records SET data=?,updated=? WHERE id=? AND tenant=?').run(JSON.stringify(data),new Date().toISOString(),r.id,u.tenant);audit(u,'update:'+r.kind,r.id);}
async function body(req){let n=0,chunks=[];for await(const c of req){n+=c.length;if(n>1500000)throw fail(413,'Request too large');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}')}catch{throw fail(400,'Invalid JSON')}}
const server=http.createServer(async(req,res)=>{
 const send=(status,data,extra={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...extra});res.end(JSON.stringify(data));};
 try{
 if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host))throw fail(403,'Invalid host');
 const url=new URL(req.url,origin),path=url.pathname;plans.expireTrials();
 if(path==='/api/public-website'&&req.method==='GET'){send(200,{...website.public(),pages:pages.public()});return;}
 if(path.startsWith('/api/public-pages/')&&req.method==='GET'){send(200,pages.public(decodeURIComponent(path.slice('/api/public-pages/'.length))));return;}
 if(!path.startsWith('/api/')){const files={'/scheduling-ui.js':'scheduling-ui.js','/timeoff-ui.js':'timeoff-ui.js','/recruitment-ui.js':'recruitment-ui.js','/payroll-ui.js':'payroll-ui.js','/pages-ui.js':'pages-ui.js','/referrals-ui.js':'referrals-ui.js','/website':'website.html','/website-public.js':'website-public.js','/website-ui.js':'website-ui.js','/website.css':'website.css','/':'index.html','/app.js':'app.js','/tasks-ui.js':'tasks-ui.js','/task-filters.js':'task-filters.js','/employees-ui.js':'employees-ui.js','/commerce-ui.js':'commerce-ui.js','/plans-ui.js':'plans-ui.js','/roles-ui.js':'roles-ui.js','/users-ui.js':'users-ui.js','/organization-ui.js':'organization-ui.js','/attendance-ui.js':'attendance-ui.js','/leave-ui.js':'leave-ui.js','/tenant-ui.js':'tenant-ui.js','/reference-theme.css':'reference-theme.css','/mcp-ui.js':'mcp-ui.js','/style.css':'style.css'};if(/^\/website\/pages\/[a-z][a-z0-9-]{2,59}$/.test(path))files[path]='website.html';if(req.method!=='GET'||!files[path])throw fail(404,'Not found');res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'X-Content-Type-Options':'nosniff'});res.end(readFileSync(join(root,'public',files[path])));return;}
 const mut=!['GET','HEAD'].includes(req.method);
 if(path.startsWith('/api/mcp/')){
 if(!['GET','POST'].includes(req.method))throw fail(405,'Unsupported MCP method');
 const bearer=req.headers.authorization?.match(/^Bearer (pfm_[a-f0-9]{64})$/)?.[1];
 const grant=bearer?db.prepare('SELECT * FROM mcp_tokens WHERE hash=? AND expires>?').get(hash(bearer),Date.now()):null;
 if(!grant)throw fail(401,'Invalid or expired MCP token');
 const actor=permissions.hydrate(db.prepare('SELECT id,tenant,name,role FROM users WHERE id=?').get(grant.user));
 const workspace=actor?.tenant?db.prepare('SELECT * FROM tenants WHERE id=?').get(actor.tenant):null;
 if(!actor||!workspaceUsers.active(actor.id)||actor.role==='superadmin'||workspace?.status!=='active')throw fail(403,'Workspace access denied');
 const kind=path.slice('/api/mcp/'.length),scopes=JSON.parse(grant.scopes),allowed=['profile','employees','leave','attendance','goals','payroll','tasks','assignees','leavebalance','regularizations','organization','holidays','leavetypes','calendar','shifts','attendancePolicies','shiftAssignments','attendanceImports'];
 if(['tasks/preview','tasks/apply'].includes(kind)){
 if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json'))throw fail(405,'JSON POST required');
 if(!scopes.includes('tasks:write')){audit(actor,'mcp:denied',kind);throw fail(403,'tasks:write scope required');}
 const b=await body(req);
 if(kind==='tasks/preview'){
 db.prepare('DELETE FROM mcp_proposals WHERE expires<=?').run(Date.now());
 if(db.prepare('SELECT count(*) n FROM mcp_proposals WHERE token=?').get(grant.id).n>=100)throw fail(429,'Too many pending proposals');
 if(Object.keys(b).some(k=>!['action','input'].includes(k)))throw fail(400,'Unknown preview fields');
 const plan=tasks.validate(actor,b.action,b.input),id=randomUUID();db.prepare('INSERT INTO mcp_proposals VALUES(?,?,?,?,?,?)').run(id,grant.id,actor.id,b.action,JSON.stringify(b.input),Date.now()+300000);audit(actor,'mcp:task:preview',id);send(200,{proposal:id,expiresInSeconds:300,action:b.action,preview:plan.data,requiresExplicitApply:true});return;
 }
 if(Object.keys(b).some(k=>k!=='proposal')||typeof b.proposal!=='string')throw fail(400,'Proposal ID required');
 const proposal=db.prepare('SELECT * FROM mcp_proposals WHERE id=? AND token=? AND user=? AND expires>?').get(b.proposal,grant.id,actor.id,Date.now());if(!proposal)throw fail(404,'Proposal expired, consumed, or unavailable');
 db.exec('BEGIN IMMEDIATE');try{const result=tasks.apply(actor,proposal.action,JSON.parse(proposal.payload));db.prepare('DELETE FROM mcp_proposals WHERE id=?').run(proposal.id);audit(actor,'mcp:task:apply',result.id);db.exec('COMMIT');send(200,result);return;}catch(e){db.exec('ROLLBACK');throw e;}
 }
 if(req.method!=='GET')throw fail(405,'This MCP operation is read-only');
 if(!allowed.includes(kind))throw fail(404,'Tool not found');
 const scope=['shifts','attendancePolicies','shiftAssignments','attendanceImports'].includes(kind)?'scheduling:read':['holidays','leavetypes','calendar'].includes(kind)?'timeoff:read':kind==='organization'?'employees:read':kind==='regularizations'?'attendance:read':kind==='leavebalance'?'leave:read':kind==='profile'?'profile':kind==='assignees'?'tasks:read':kind+':read';
 if(!permissions.scope(actor,scope)||!scopes.includes(scope)||(kind==='payroll'&&!manager(actor))){audit(actor,'mcp:denied',kind);throw fail(403,'Scope or role denied');}
 if([...url.searchParams.keys()].some(k=>!['limit','offset',...(kind==='tasks'?['id']:kind==='calendar'?['start','end']:[])].includes(k)))throw fail(400,'Unknown query parameter');
 const limit=Number(url.searchParams.get('limit')||25),offset=Number(url.searchParams.get('offset')||0);
 if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>10000)throw fail(400,'Invalid pagination');
 audit(actor,'mcp:read',kind);
 if(['shifts','attendancePolicies','shiftAssignments','attendanceImports'].includes(kind)){const items=scheduling.list(actor,kind);send(200,{items:items.slice(offset,offset+limit),total:items.length,offset,limit});return;}
 if(['holidays','leavetypes','calendar'].includes(kind)){let list=kind==='calendar'?timeoff.calendar(actor,url.searchParams.get('start'),url.searchParams.get('end')).filter(r=>r.kind!=='Leave'||scopes.includes('leave:read')):timeoff.list(actor,kind==='leavetypes'?'leave-types':'holidays');send(200,{items:list.slice(offset,offset+limit),total:list.length,offset,limit});return;}
 if(kind==='assignees'){if(!manager(actor))throw fail(403,'Manager required');send(200,{items:tasks.assignees(actor)});return;}
 if(kind==='organization'){send(200,{branches:organization.list(actor,'branches'),departments:organization.list(actor,'departments'),designations:organization.list(actor,'designations')});return;}
 if(kind==='regularizations'){const list=attendance.list(actor);send(200,{items:list.slice(offset,offset+limit).map(r=>({id:r.id,name:r.data.name,date:r.data.date,clockIn:r.data.clockIn,clockOut:r.data.clockOut,status:r.data.status})),total:list.length,offset,limit});return;}
 if(kind==='leavebalance'){send(200,{year:new Date().getUTCFullYear(),items:leave.balance(actor,new Date().getUTCFullYear())});return;}
 if(kind==='profile'){send(200,{workspace:workspace.name,role:actor.role,scopes,readOnly:!scopes.includes('tasks:write')});return;}
 if(kind==='tasks'){if(url.searchParams.has('id')){send(200,tasks.get(actor,url.searchParams.get('id')));return;}const list=tasks.list(actor);send(200,{items:list.slice(offset,offset+limit),total:list.length,offset,limit});return;}
 const keys={employees:['name','department','title','status'],leave:['name','type','start','end','status'],attendance:['name','date','in','out','status'],goals:['name','assignee','progress','due','status'],payroll:['month','employees','gross','currency','status','compliance']}[kind];
 const available=all(kind,actor);send(200,{items:available.slice(offset,offset+limit).map(r=>({id:r.id,...Object.fromEntries(keys.map(k=>[k,r.data[k]]))})),total:available.length,offset,limit});return;
 }
 if(mut&&req.headers.origin!==origin&&req.headers.origin!==`http://localhost:${port}`)throw fail(403,'Origin rejected');
 if(mut&&!req.headers['content-type']?.startsWith('application/json'))throw fail(415,'JSON required');
 if(path==='/api/login'&&req.method==='POST'){
 const b=await body(req),key=req.socket.remoteAddress;const a=db.prepare('SELECT * FROM attempts WHERE key=?').get(key);
 if(a&&a.until>Date.now()&&a.count>=10)throw fail(429,'Too many attempts. Try again in 15 minutes.');
 const u=typeof b.email==='string'?db.prepare('SELECT * FROM users WHERE email=?').get(b.email.toLowerCase().trim()):null;
 const [salt,expected]=(u?.password||'dummy:'+ '00'.repeat(64)).split(':');
 const actual=scryptSync(typeof b.password==='string'?b.password.slice(0,512):'',salt,64);
 if(!u||!timingSafeEqual(actual,Buffer.from(expected,'hex'))){db.prepare('INSERT OR REPLACE INTO attempts VALUES(?,?,?)').run(key,a&&a.until>Date.now()?a.count+1:1,Date.now()+900000);throw fail(401,'Email or password is incorrect');}
 if(!workspaceUsers.active(u.id))throw fail(403,'User access suspended');
 db.prepare('DELETE FROM attempts WHERE key=?').run(key);const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
 db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),u.id,csrf,Date.now()+8*3600000);audit(u,'login',u.id);send(200,{ok:true},{'Set-Cookie':`pf_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`});return;
 }
 const token=(req.headers.cookie||'').match(/(?:^|;\s*)pf_session=([a-f0-9]{64})(?:;|$)/)?.[1];
 const session=token?db.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').get(hash(token),Date.now()):null;
 if(!session)throw fail(401,'Please sign in');
 const u=permissions.hydrate(db.prepare('SELECT id,tenant,email,name,role FROM users WHERE id=?').get(session.user));
 if(!workspaceUsers.active(u.id))throw fail(403,'User access suspended');
 const tenant=u.tenant?db.prepare('SELECT * FROM tenants WHERE id=?').get(u.tenant):null;
 if(tenant?.status!=='active'&&u.role!=='superadmin')throw fail(403,'Workspace suspended');
 if(mut&&req.headers['x-csrf-token']!==session.csrf)throw fail(403,'CSRF check failed');
 permissions.route(u,path,req.method);
 if(path==='/api/me'&&req.method==='GET'){send(200,{user:u,tenant,csrf:session.csrf,schemas});return;}
 if(path==='/api/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));send(200,{ok:true},{'Set-Cookie':'pf_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});return;}
 if(path==='/api/mcp-tokens'){
 if(u.role==='superadmin')throw fail(403,'Use a scoped company account');
 if(req.method==='GET'){send(200,db.prepare('SELECT id,scopes,expires,created FROM mcp_tokens WHERE user=?').all(u.id).map(r=>({...r,scopes:JSON.parse(r.scopes)})));return;}
 if(req.method==='POST'){
 const b=await body(req),allowed=['profile','scheduling:read','timeoff:read','employees:read','leave:read','attendance:read','goals:read','tasks:read','tasks:write',...(manager(u)?['payroll:read']:[])];
 if(!Array.isArray(b.scopes)||!b.scopes.length||b.scopes.length>10||b.scopes.some(s=>!allowed.includes(s)||!permissions.scope(u,s)))throw fail(400,'Invalid scopes');
 const count=db.prepare('SELECT count(*) n FROM mcp_tokens WHERE user=? AND expires>?').get(u.id,Date.now()).n;if(count>=5)throw fail(409,'Revoke a token before creating another');
 const secret='pfm_'+randomBytes(32).toString('hex'),id=randomUUID(),expires=Date.now()+86400000;
 db.prepare('INSERT INTO mcp_tokens VALUES(?,?,?,?,?,?)').run(id,hash(secret),u.id,JSON.stringify([...new Set(b.scopes)]),expires,new Date().toISOString());audit(u,'mcp:token:create',id);send(201,{id,token:secret,expires});return;
 }
 if(req.method==='DELETE'){const b=await body(req);if(typeof b.id!=='string')throw fail(400,'Token ID required');const result=db.prepare('DELETE FROM mcp_tokens WHERE id=? AND user=?').run(b.id,u.id);if(!result.changes)throw fail(404,'Token not found');audit(u,'mcp:token:revoke',b.id);send(200,{ok:true});return;}
 }
 if(path==='/api/roles'){if(req.method==='GET'){send(200,{catalog:permissionCatalog,roles:permissions.list(u)});return;}if(req.method==='POST'){send(201,permissions.save(u,await body(req)));return;}}
 if(path.startsWith('/api/roles/')&&req.method==='PATCH'){send(200,permissions.save(u,await body(req),path.split('/').pop()));return;}
 if(path.startsWith('/api/user-role/')&&req.method==='PATCH'){send(200,permissions.assign(u,path.split('/').pop(),await body(req)));return;}
 if(path==='/api/recruitment/assignees'&&req.method==='GET'){send(200,recruitment.assignees(u));return;}
 if(path==='/api/recruitment/onboarding-assignees'&&req.method==='GET'){send(200,recruitment.assignees(u,'onboarding'));return;}
 if(path.startsWith('/api/recruitment/')){const [, , ,kind,id]=path.split('/');if(req.method==='GET'&&!id){send(200,recruitment.list(u,kind));return;}if(kind==='jobs'&&['POST','PATCH'].includes(req.method)){send(id?200:201,recruitment.job(u,await body(req),id));return;}if(kind==='candidates'){if(req.method==='POST'&&!id){send(201,recruitment.application(u,await body(req)));return;}if(req.method==='PATCH'&&id){send(200,recruitment.transition(u,id,await body(req)));return;}}if(kind==='interviews'&&['POST','PATCH'].includes(req.method)){send(id?200:201,recruitment.interview(u,await body(req),id));return;}if(kind==='onboarding'&&req.method==='PATCH'&&id){send(200,recruitment.onboard(u,id,await body(req)));return;}}
 if(path==='/api/payroll-employees'&&req.method==='GET'){send(200,payroll.employees(u));return;}
 if(path==='/api/payroll-components'){if(req.method==='GET'){send(200,payroll.components(u));return;}if(req.method==='POST'){send(201,payroll.component(u,await body(req)));return;}}
 if(path.startsWith('/api/payroll-components/')&&req.method==='PATCH'){send(200,payroll.component(u,await body(req),path.split('/').pop()));return;}
 if(path==='/api/payroll-salaries'){if(req.method==='GET'){send(200,payroll.salaries(u));return;}if(req.method==='POST'){send(200,payroll.salary(u,await body(req)));return;}}
 if(path==='/api/payroll-runs'){if(req.method==='GET'){send(200,payroll.runs(u));return;}if(req.method==='POST'){send(201,payroll.create(u,await body(req)));return;}}
 if(path.startsWith('/api/payroll-runs/')&&req.method==='PATCH'){send(200,payroll.transition(u,path.split('/').pop(),await body(req)));return;}
 if(path==='/api/payroll-statements'&&req.method==='GET'){send(200,payroll.statements(u));return;}
 if(path==='/api/referrals'&&req.method==='GET'){send(200,plans.referrals.dashboard(u));return;}
 if(path==='/api/referrals/settings'&&req.method==='PATCH'){send(200,plans.referrals.save(u,await body(req)));return;}
 if(path==='/api/referrals/payouts'&&req.method==='POST'){send(201,plans.referrals.request(u,await body(req)));return;}
 if(path.startsWith('/api/referrals/payouts/')&&req.method==='PATCH'){send(200,plans.referrals.review(u,path.split('/').pop(),await body(req)));return;}
 if(path==='/api/website-pages'){if(req.method==='GET'){send(200,pages.list(u));return;}if(req.method==='POST'){send(201,pages.save(u,await body(req)));return;}}
 if(path.startsWith('/api/website-pages/')){const bits=path.split('/');if(bits.length===4&&req.method==='PATCH'){send(200,pages.save(u,await body(req),bits[3]));return;}if(bits.length===5&&bits[4]==='state'&&req.method==='POST'){send(200,pages.transition(u,bits[3],await body(req)));return;}}
 if(path==='/api/website'){if(req.method==='GET'){send(200,website.get(u));return;}if(req.method==='PATCH'){send(200,website.save(u,await body(req)));return;}}
 if(path==='/api/website/publish'&&req.method==='POST'){send(200,website.publish(u,await body(req)));return;}
 if(path==='/api/plan-trial'){if(req.method==='GET'){send(200,plans.trial(u));return;}if(req.method==='POST'){send(201,plans.startTrial(u,await body(req)));return;}}
 if(path.startsWith('/api/commerce/')){const bits=path.split('/');if(req.method==='GET'&&bits.length===4){send(200,browseCommerce(plans.commerce,u,bits[3],url.searchParams));return;}if(req.method==='GET'&&bits.length===5&&['currencies','coupons'].includes(bits[3])){send(200,plans.commerce.detail(u,bits[3],decodeURIComponent(bits[4])));return;}}
 if(path==='/api/currencies'){if(req.method==='GET'){send(200,plans.commerce.currencies(u));return;}if(req.method==='POST'){send(201,plans.commerce.saveCurrency(u,await body(req)));return;}}
 if(path.startsWith('/api/currencies/')){const code=decodeURIComponent(path.split('/').pop());if(req.method==='PATCH'){send(200,plans.commerce.saveCurrency(u,await body(req),code));return;}if(req.method==='DELETE'){send(200,plans.commerce.deleteCurrency(u,code,(await body(req)).version));return;}}
 if(path==='/api/coupons'){if(req.method==='GET'){send(200,plans.commerce.coupons(u));return;}if(req.method==='POST'){send(201,plans.commerce.saveCoupon(u,await body(req)));return;}}
 if(path.startsWith('/api/coupons/')){const code=decodeURIComponent(path.split('/').pop());if(req.method==='PATCH'){send(200,plans.commerce.saveCoupon(u,await body(req),code));return;}if(req.method==='DELETE'){send(200,plans.commerce.deleteCoupon(u,code,(await body(req)).version));return;}}
 if(path==='/api/platform-dashboard'&&req.method==='GET'){if(u.role!=='superadmin')throw fail(403,'Platform administrator required');const companies=db.prepare('SELECT * FROM tenants ORDER BY name').all(),catalog=plans.list(u),requests=plans.requests(u);send(200,{companies,plans:catalog,pending:requests.filter(r=>r.status==='Pending').length,orders:plans.orders(u).length});return;}
 if(path==='/api/plans'){if(req.method==='GET'){send(200,plans.list(u));return;}if(req.method==='POST'){send(201,plans.save(u,await body(req)));return;}}
 if(path.startsWith('/api/plans/')&&req.method==='PATCH'){send(200,plans.save(u,await body(req),decodeURIComponent(path.slice('/api/plans/'.length))));return;}
 if(path==='/api/plan-requests'){if(req.method==='GET'){send(200,plans.requests(u));return;}if(req.method==='POST'){send(201,plans.request(u,await body(req)));return;}}
 if(path.startsWith('/api/plan-requests/')&&req.method==='PATCH'){send(200,plans.review(u,path.split('/').pop(),await body(req)));return;}
 if(path==='/api/plan-orders'&&req.method==='GET'){send(200,plans.orders(u));return;}
 if(path==='/api/tenants'){
 if(req.method==='POST'){send(201,tenants.create(u,await body(req)));return;}
 if(u.role!=='superadmin')throw fail(403,'Platform administrator required');
 if(req.method==='GET'){send(200,db.prepare('SELECT * FROM tenants').all());return;}
 if(req.method==='PATCH'){const b=await body(req);if(typeof b.plan!=='string'||!['active','suspended'].includes(b.status))throw fail(400,'Invalid plan or status');plans.fits(b.id,b.plan);plans.endTrial(b.id);const result=db.prepare('UPDATE tenants SET plan=?,status=? WHERE id=?').run(b.plan,b.status,b.id);if(!result.changes)throw fail(404,'Workspace not found');audit(u,'tenant:update',b.id);send(200,{ok:true});return;}
 }
 if(u.role==='superadmin')throw fail(403,'Platform accounts cannot access workforce records');
 if(path==='/api/scheduling/assignees'&&req.method==='GET'){send(200,scheduling.assignees(u));return;}
 if(path==='/api/scheduling/currencies'&&req.method==='GET'){scheduling.access(u);send(200,db.prepare('SELECT code FROM currencies ORDER BY code').all());return;}
 const scheduleRoute=path.match(/^\/api\/scheduling\/(shifts|attendancePolicies|shiftAssignments|attendanceImports)(?:\/([a-zA-Z0-9-]+))?$/);
 if(scheduleRoute){const [,kind,id]=scheduleRoute;if(req.method==='GET'&&!id){send(200,scheduling.list(u,kind));return;}
 if(['shifts','attendancePolicies'].includes(kind)){if(req.method==='POST'&&!id||req.method==='PATCH'&&id){send(id?200:201,scheduling.save(u,kind,await body(req),id));return;}if(req.method==='DELETE'&&id){send(200,scheduling.remove(u,kind,id,(await body(req)).version));return;}}
 if(kind==='shiftAssignments'){if(req.method==='POST'&&!id){send(201,scheduling.assign(u,await body(req)));return;}if(req.method==='PATCH'&&id){send(200,scheduling.cancel(u,id,(await body(req)).version));return;}}
 if(kind==='attendanceImports'){if(req.method==='POST'&&!id){send(201,scheduling.preview(u,await body(req)));return;}if(req.method==='POST'&&id){send(200,scheduling.apply(u,id));return;}}}
 if(path==='/api/timeoff/calendar'&&req.method==='GET'){send(200,timeoff.calendar(u,url.searchParams.get('start'),url.searchParams.get('end')));return;}
 if(path==='/api/timeoff/branches'&&req.method==='GET'){send(200,timeoff.branches(u));return;}
 const timeRoute=path.match(/^\/api\/timeoff\/(leave-types|holidays)(?:\/([a-zA-Z0-9-]+))?$/);
 if(timeRoute){const [,kind,id]=timeRoute;if(req.method==='GET'&&!id){send(200,timeoff.list(u,kind));return;}if(req.method==='POST'&&!id||req.method==='PATCH'&&id){send(id?200:201,timeoff.save(u,kind,await body(req),id));return;}if(req.method==='DELETE'&&id){send(200,timeoff.remove(u,kind,id,(await body(req)).version));return;}}
 const orgRoute=path.match(/^\/api\/organization\/(branches|departments|designations)(?:\/([a-f0-9-]+))?$/);
 if(orgRoute){const [,kind,id]=orgRoute;if(req.method==='GET'&&!id){send(200,organization.list(u,kind));return;}if((req.method==='POST'&&!id)||(req.method==='PATCH'&&id)){send(id?200:201,organization.save(u,kind,await body(req),id));return;}}
 if(path==='/api/attendance-regularizations'){
  if(req.method==='GET'){send(200,attendance.list(u));return;}
  if(req.method==='POST'){send(201,attendance.request(u,await body(req)));return;}
 }
 if(path.startsWith('/api/attendance-regularizations/')&&req.method==='PATCH'){send(200,attendance.review(u,path.split('/').pop(),await body(req)));return;}
 if(path==='/api/leave-summary'&&req.method==='GET'){const year=Number(url.searchParams.get('year')||new Date().getUTCFullYear());if(!Number.isInteger(year)||year<2020||year>2100)throw fail(400,'Invalid policy year');send(200,{year,types:timeoff.types(u).filter(t=>t.data.status==='Active').map(t=>t.data.name),policies:leave.policies(u,year),balances:leave.balance(u,year)});return;}
 if(path==='/api/leave-policies'&&req.method==='POST'){send(200,leave.savePolicy(u,await body(req)));return;}
 if(path==='/api/task-assignees'&&req.method==='GET'){if(!manager(u))throw fail(403,'Manager required');send(200,tasks.assignees(u));return;}
 if(path==='/api/tasks'){
 if(req.method==='GET'){send(200,tasks.list(u));return;}
 if(req.method==='POST'){send(201,tasks.apply(u,'create',await body(req)));return;}
 if(req.method==='PATCH'){const b=await body(req);if(Object.keys(b).some(k=>!['action','input'].includes(k)))throw fail(400,'Unknown task fields');send(200,tasks.apply(u,b.action,b.input));return;}
 }
 if(path==='/api/audit'&&req.method==='GET'){if(!manager(u))throw fail(403,'Manager required');send(200,db.prepare('SELECT * FROM audit WHERE tenant=? ORDER BY id DESC LIMIT 100').all(u.tenant));return;}
 if(path==='/api/users'){if(req.method==='GET'){send(200,workspaceUsers.list(u));return;}if(req.method==='POST'){send(201,workspaceUsers.create(u,await body(req)));return;}}
 if(path.startsWith('/api/users/')&&req.method==='PATCH'){send(200,workspaceUsers.update(u,path.split('/').pop(),await body(req)));return;}
 if(path==='/api/attendance'&&req.method==='POST'){
 const b=await body(req);if(!['in','out'].includes(b.action))throw fail(400,'Invalid clock action');if(scheduling.clock(u,b.action)){send(200,{ok:true});return;}const today=new Date().toISOString().slice(0,10);const existing=all('attendance',{...u,role:'employee'}).find(r=>r.data.date===today);
 if(b.action==='in'){if(existing)throw fail(409,'Already clocked in today');insert(u,'attendance',{name:u.name,date:today,in:new Date().toISOString(),out:'',status:'Working'},u.id);}else{if(!existing||existing.data.out)throw fail(409,'No open attendance session');update(existing,u,{...existing.data,out:new Date().toISOString(),status:'Complete'});}send(200,{ok:true});return;
 }
 if(path==='/api/documents'&&req.method==='POST'){
 if(!manager(u))throw fail(403,'Manager required');const b=await body(req);
 if(typeof b.name!=='string'||!/^[-\w .]{1,100}\.(txt|pdf)$/i.test(b.name)||typeof b.content!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.content))throw fail(400,'Only safe .txt and .pdf filenames are allowed');
 const bytes=Buffer.from(b.content,'base64');if(bytes.length===0||bytes.length>1048576)throw fail(400,'File must be 1 byte–1 MB');const pdf=b.name.toLowerCase().endsWith('.pdf');
 if(pdf&&bytes.subarray(0,5).toString()!=='%PDF-')throw fail(400,'Invalid PDF signature');if(!pdf&&(bytes.includes(0)||Buffer.from(bytes.toString('utf8'),'utf8').compare(bytes)!==0))throw fail(400,'Invalid UTF-8 text');
 plans.fits(u.tenant,tenant.plan,{storageBytes:bytes.length});const id=randomUUID();db.exec('BEGIN');try{db.prepare('INSERT INTO files VALUES(?,?,?,?,?,?)').run(id,u.tenant,u.id,b.name,pdf?'application/pdf':'text/plain',bytes);insert(u,'documents',{name:b.name,file:id,size:bytes.length,status:'Available'},u.id);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e;}send(201,{id});return;
 }
 if(path.startsWith('/api/files/')&&req.method==='GET'){
 const f=db.prepare('SELECT * FROM files WHERE id=? AND tenant=?').get(path.split('/').pop(),u.tenant);if(!f)throw fail(404,'File not found');res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${f.name}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(f.body);return;
 }
 const m=path.match(/^\/api\/records\/([a-z]+)(?:\/([a-f0-9-]+))?$/);
 if(m){const [,kind,id]=m;if(!schemas[kind]&&!['attendance','documents'].includes(kind))throw fail(404,'Module not found');
 if(req.method==='GET'){if(['candidates','jobs','assets'].includes(kind)&&!manager(u))throw fail(403,'Manager required');send(200,all(kind,u));return;}
 if(!manager(u)&&!['leave','timesheets'].includes(kind))throw fail(403,'Manager required');
 if(req.method==='POST'&&!id){if(kind==='leave'){send(201,leave.request(u,await body(req)));return;}const input=await body(req),data=validate(kind,input);if(kind==='employees')Object.assign(data,organization.employee(u,input));let owner=null;
 if(['leave','timesheets'].includes(kind)){owner=u.id;data.name=u.name;data.status=kind==='leave'?'Pending':'Submitted';}
 if(kind==='leave'){const overlap=all('leave',{...u,role:'employee'}).some(r=>r.data.status!=='Rejected'&&r.data.start<=data.end&&r.data.end>=data.start);if(overlap)throw fail(409,'Overlapping leave request');}
 if(kind==='payroll'){if(all('payroll',u).some(r=>r.data.month===data.month))throw fail(409,'Payroll draft already exists');const staff=all('employees',u).filter(r=>r.data.status==='Active');data.gross=staff.reduce((sum,r)=>sum+Math.round(r.data.salary*100/12),0)/100;data.employees=staff.length;data.status='Draft';data.compliance='Not configured';data.currency='USD';}
 if(kind==='employees')plans.fits(u.tenant,tenant.plan,{employees:1});
 const result=insert(u,kind,data,owner);send(201,{id:result});return;}
 if(req.method==='PATCH'&&id&&kind==='leave'){const b=await body(req);send(200,leave.transition(u,id,b.status));return;}
 if(req.method==='PATCH'&&id){const r=record(id,u);if(r.kind!==kind)throw fail(404,'Record not found');if(!manager(u))throw fail(403,'Manager required');const b=await body(req);if(['jobs','candidates','onboarding'].includes(kind)&&r.data.flow==='linked')throw fail(409,'Use the linked recruitment workflow');
 if(kind==='leave'){if(r.owner===u.id)throw fail(403,'Cannot approve your own request');if(r.data.status!=='Pending'||!['Approved','Rejected'].includes(b.status))throw fail(409,'Invalid leave transition');update(r,u,{...r.data,status:b.status,reviewer:u.name});}
 else{if(['payroll','attendance','documents'].includes(kind))throw fail(405,'This record cannot be edited');const data=validate(kind,b);if(kind==='employees')Object.assign(data,organization.employee(u,b,r.data));update(r,u,data);}send(200,{ok:true});return;}
 }
 throw fail(404,'Not found');
 }catch(e){send(e.status||400,{error:e.status?e.message:(e.code?'Request could not be completed':e.message)});}
});
server.listen(port,'127.0.0.1',()=>console.log('Peopleflow ready at '+origin));
process.on('SIGTERM',()=>server.close(()=>{db.close();process.exit(0)}));
