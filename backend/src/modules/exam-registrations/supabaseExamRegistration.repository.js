const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ATTEMPTS=new Set(["CURRENT","ARREAR"]);
const REGISTRATION_STATUSES=new Set(["REGISTERED","HALLTICKET_ISSUED","ABSENT","COMPLETED"]);
const SELECT="id,exam_session_id,student_id,subject_id,source_semester_id,attempt_type,attempt_number,registration_status,is_eligible,remarks,created_at,updated_at";
const requireUuid=(v,f)=>{if(typeof v!=="string"||!UUID.test(v))throw new TypeError(`A valid PostgreSQL UUID is required for ${f}`);return v.toLowerCase();};
const requireText=(v,f)=>{if(typeof v!=="string"||!v.trim())throw new TypeError(`${f} is required`);return v.trim();};
const normalizeAttempt=(v)=>{const s=requireText(v,"Attempt type").toUpperCase();if(!ATTEMPTS.has(s))throw new TypeError("Attempt type must be CURRENT or ARREAR");return s;};
const normalizeStatus=(v)=>{const s=requireText(v,"Registration status").toUpperCase();if(!REGISTRATION_STATUSES.has(s))throw new TypeError("Invalid registration status");return s;};
const normalizeAttemptNumber=(v)=>{if(!Number.isInteger(v)||v<1)throw new TypeError("Attempt number must be a positive integer");return v;};
const normalizeBoolean=(v,f)=>{if(typeof v!=="boolean")throw new TypeError(`${f} must be a boolean`);return v;};
const expectRows=(r,op)=>{if(!Array.isArray(r))throw new TypeError(`Supabase ${op} returned an invalid response`);return r;};
const mapRegistration=r=>({_id:r.id,id:r.id,examSessionId:r.exam_session_id,studentId:r.student_id,subjectId:r.subject_id,sourceSemesterId:r.source_semester_id,attemptType:r.attempt_type,attemptNumber:r.attempt_number,registrationStatus:r.registration_status,isEligible:r.is_eligible,remarks:r.remarks,createdAt:r.created_at??null,updatedAt:r.updated_at??null});
const normalize=(p,{partial=false}={})=>{
 const b={},set=(key,val,fn)=>{if(!partial||val!==undefined)b[key]=fn(val);};
 set("exam_session_id",p.examSessionId,v=>requireUuid(v,"exam session ID"));
 set("student_id",p.studentId,v=>requireUuid(v,"student ID"));
 set("subject_id",p.subjectId,v=>requireUuid(v,"subject ID"));
 set("source_semester_id",p.sourceSemesterId,v=>requireUuid(v,"source semester ID"));
 set("attempt_type",p.attemptType,normalizeAttempt);
 set("attempt_number",p.attemptNumber??(partial?undefined:1),normalizeAttemptNumber);
 set("registration_status",p.registrationStatus??(partial?undefined:"REGISTERED"),normalizeStatus);
 set("is_eligible",p.isEligible??(partial?undefined:true),v=>normalizeBoolean(v,"Eligibility"));
 set("remarks",p.remarks??(partial?undefined:""),v=>v===null?"":String(v).trim());
 return b;
};
/** Isolated Supabase adapter. Higher-level curriculum/arrear business rules remain in services and must be migrated before runtime cutover. */
export const createSupabaseExamRegistrationRepository=({request}={})=>{
 if(typeof request!=="function")throw new TypeError("A server-side Supabase request function is required");
 const queryForId=id=>new URLSearchParams({select:SELECT,id:`eq.${id}`,limit:"2"}).toString();
 const findOne=async(query,op)=>{const rows=expectRows(await request("exam_registrations",{query}),op);if(rows.length>1)throw new Error(`Supabase ${op} returned multiple exam registrations`);return rows.length?mapRegistration(rows[0]):null;};
 const ensureNoDuplicate=async(values,excludeId=null)=>{
  const q={select:"id",exam_session_id:`eq.${values.exam_session_id}`,student_id:`eq.${values.student_id}`,subject_id:`eq.${values.subject_id}`,limit:"2"};
  if(excludeId)q.id=`neq.${excludeId}`;
  const rows=expectRows(await request("exam_registrations",{query:new URLSearchParams(q).toString()}),"duplicate registration lookup");
  if(rows.length)throw new TypeError("An exam registration already exists for this student, session and subject");
 };
 return Object.freeze({
  listExamRegistrations:async()=>{const q=new URLSearchParams({select:SELECT,order:"created_at.desc"}).toString();return expectRows(await request("exam_registrations",{query:q}),"exam registration list").map(mapRegistration);},
  findExamRegistrationById:async(id)=>findOne(queryForId(requireUuid(id,"exam registration ID")),"exam registration lookup"),
  findBySessionStudentSubject:async({examSessionId,studentId,subjectId}={})=>findOne(new URLSearchParams({select:SELECT,exam_session_id:`eq.${requireUuid(examSessionId,"exam session ID")}`,student_id:`eq.${requireUuid(studentId,"student ID")}`,subject_id:`eq.${requireUuid(subjectId,"subject ID")}`,limit:"2"}).toString(),"registration natural-key lookup"),
  createExamRegistration:async(payload={})=>{
   const b=normalize(payload);await ensureNoDuplicate(b);
   if(payload.id!==undefined)b.id=requireUuid(payload.id,"exam registration ID");
   const rows=expectRows(await request("exam_registrations",{method:"POST",query:`select=${SELECT}`,body:b,prefer:"return=representation"}),"exam registration create");
   if(rows.length!==1)throw new Error("Supabase exam registration create did not return exactly one row");
   return mapRegistration(rows[0]);
  },
  updateExamRegistration:async(id,payload={})=>{
   const registrationId=requireUuid(id,"exam registration ID");
   const current=await findOne(queryForId(registrationId),"exam registration update lookup");if(!current)return null;
   const b=normalize(payload,{partial:true});if(!Object.keys(b).length)throw new TypeError("At least one exam registration field must be supplied");
   const merged={exam_session_id:b.exam_session_id??current.examSessionId,student_id:b.student_id??current.studentId,subject_id:b.subject_id??current.subjectId};
   if(b.exam_session_id!==undefined||b.student_id!==undefined||b.subject_id!==undefined)await ensureNoDuplicate(merged,registrationId);
   const rows=expectRows(await request("exam_registrations",{method:"PATCH",query:new URLSearchParams({id:`eq.${registrationId}`,select:SELECT}).toString(),body:b,prefer:"return=representation"}),"exam registration update");
   if(rows.length>1)throw new Error("Supabase exam registration update matched multiple rows");return rows.length?mapRegistration(rows[0]):null;
  },
  toggleEligibility:async(id)=>{
   const registrationId=requireUuid(id,"exam registration ID"),current=await findOne(queryForId(registrationId),"exam registration eligibility lookup");if(!current)return null;
   const rows=expectRows(await request("exam_registrations",{method:"PATCH",query:new URLSearchParams({id:`eq.${registrationId}`,select:SELECT}).toString(),body:{is_eligible:!current.isEligible},prefer:"return=representation"}),"exam registration eligibility update");
   if(rows.length>1)throw new Error("Supabase eligibility update matched multiple rows");return rows.length?mapRegistration(rows[0]):null;
  }
 });
};
