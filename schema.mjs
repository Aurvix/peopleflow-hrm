export const schemas={
 employees:{name:'text',email:'email',department:'text',title:'text',salary:'number',status:['Active','On leave','Inactive'],start:'date'},
 leave:{type:['Annual','Sick','Personal'],start:'date',end:'date',reason:'text'},
 jobs:{name:'text',department:'text',location:'text',status:['Open','Closed']},
 candidates:{name:'text',email:'email',position:'text',status:['New','Screening','Interview','Offer','Hired','Rejected']},
 assets:{name:'text',serial:'text',assignee:'text',status:['Available','Assigned','Maintenance','Retired']},
 goals:{name:'text',assignee:'text',due:'date',progress:'number',status:['Not started','In progress','Complete']},
 onboarding:{name:'text',assignee:'text',due:'date',status:['Not started','In progress','Complete']},
 training:{name:'text',assignee:'text',due:'date',status:['Scheduled','In progress','Complete']},
 meetings:{name:'text',date:'date',time:'time',location:'text',status:['Scheduled','Complete','Cancelled']},
 announcements:{name:'text',message:'text',status:['Draft','Published']},
 timesheets:{name:'text',date:'date',hours:'number'},
 payroll:{month:'month'},
};
export function validate(kind,input){
 const schema=schemas[kind];if(!schema)throw Error('Unknown module');const data={};
 for(const [key,type]of Object.entries(schema)){
 const v=input[key];if(v===undefined||v===null||v==='')throw Error(key+' is required');
 if(Array.isArray(type)){if(!type.includes(v))throw Error('Invalid '+key);data[key]=v;}
 else if(type==='number'){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>100000000)throw Error('Invalid '+key);data[key]=v;}
 else{if(typeof v!=='string'||v.length>2000||v.includes('\u0000'))throw Error('Invalid '+key);data[key]=v.trim();if(!data[key])throw Error(key+' is required');
 if(type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))throw Error('Invalid email');
 if(type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))throw Error('Invalid date');
 if(type==='month'&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(v))throw Error('Invalid month');
 if(type==='time'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))throw Error('Invalid time');}
 }
 if(kind==='leave'&&data.end<data.start)throw Error('End date must follow start date');
 if(kind==='goals'&&data.progress>100)throw Error('Progress must be 0–100');
 if(kind==='timesheets'&&data.hours>24)throw Error('Hours must be 0–24');
 return data;
}
