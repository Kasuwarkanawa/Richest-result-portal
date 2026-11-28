const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set(["REGULAR", "REVALUATION"]);
const STATUSES = new Set(["DRAFT", "OPEN", "VERIFIED", "APPROVED", "PUBLISHED", "CLOSED"]);
const SELECT = "id,name,exam_month,exam_year,session_category,parent_exam_session_id,status,applicable_regulation_ids,applicable_batch_ids,result_published_at,result_published_by,notes,created_at,updated_at";
const text = (v, field) => { if(typeof v!=="string"||!v.trim()) throw new TypeError(`${field} is required`); return v.trim(); };
const uuid = (v, field) => { if(typeof v!=="string"||!UUID.test(v)) throw new TypeError(`A valid PostgreSQL UUID is required for ${field}`); return v.toLowerCase(); };
const uuidArray = (v, field) => {
 if(!Array.isArray(v))throw new TypeError(`${field} must be an array of UUIDs`);
 const ids=v.map((id)=>uuid(id,field));
 if(new Set(ids).size!==ids.length)throw new TypeError(`${field} must not contain duplicate IDs`);
 return ids;
};
const mapSession=(r)=>({_id:r.id,id:r.id,name:r.name,examMonth:r.exam_month,examYear:r.exam_year,sessionCategory:r.session_category,parentExamSessionId:r.parent_exam_session_id??null,status:r.status,applicableRegulationIds:r.applicable_regulation_ids??[],applicableBatchIds:r.applicable_batch_ids??[],resultPublishedAt:r.result_published_at??null,resultPublishedBy:r.result_published_by??null,notes:r.notes,createdAt:r.created_at??null,updatedAt:r.updated_at??null});
const expectRows=(r,op)=>{if(!Array.isArray(r))throw new TypeError(`Supabase ${op} returned an invalid response`);return r;};
const normalizeYear=(v)=>{if(!Number.isInteger(v)||v<1900||v>3000)throw new TypeError("Exam year must be an integer between 1900 and 3000");return v;};
const normalizeMonth=(v)=>{if(v===null||v===undefined||v==="")return null;return text(v,"Exam month").toUpperCase();};
const normalizeStatus=(v)=>{const s=text(v,"Status").toUpperCase();if(!STATUSES.has(s))throw new TypeError("Invalid exam session status");return s;};
const normalizeCategory=(v)=>{const s=text(v,"Session category").toUpperCase();if(!CATEGORIES.has(s))throw new TypeError("Session category must be REGULAR or REVALUATION");return s;};
const normalizeDate=(v)=>{if(v===null||v===undefined||v==="")return null;const d=new Date(v);if(Number.isNaN(d.getTime()))throw new TypeError("Result published date must be valid");return d.toISOString();};
const validateRules=(p)=>{
 if(p.sessionCategory==="REGULAR"&&!p.examMonth)throw new TypeError("Exam month is required for REGULAR sessions");
 if(p.sessionCategory==="REVALUATION"&&!p.parentExamSessionId)throw new TypeError("Parent exam session is required for REVALUATION sessions");
 if(p.parentExamSessionId&&p.id&&p.parentExamSessionId===p.id)throw new TypeError("Exam session cannot be its own parent");
};
const bodyFrom=(p,{partial=false}={})=>{
 const b={}, set=(key,value,fn)=>{if(!partial||value!==undefined)b[key]=fn(value);};
 set("name",p.name,v=>text(v,"Exam session name"));
 set("exam_month",p.examMonth,normalizeMonth);
 set("exam_year",p.examYear,normalizeYear);
 set("session_category",p.sessionCategory,normalizeCategory);
 set("parent_exam_session_id",p.parentExamSessionId,v=>v===null||v===""?null:uuid(v,"parent exam session ID"));
 set("status",p.status??(partial?undefined:"DRAFT"),normalizeStatus);
 set("applicable_regulation_ids",p.applicableRegulationIds??(partial?undefined:[]),v=>uuidArray(v,"Applicable regulation IDs"));
 set("applicable_batch_ids",p.applicableBatchIds??(partial?undefined:[]),v=>uuidArray(v,"Applicable batch IDs"));
 set("result_published_at",p.resultPublishedAt,normalizeDate);
 set("result_published_by",p.resultPublishedBy,v=>v===null||v===""?null:uuid(v,"result publisher user ID"));
 set("notes",p.notes??(partial?undefined:""),v=>v===null?"":String(v).trim());
 return b;
};
/** Isolated Supabase exam-session adapter. Mongo-backed application services remain unchanged. */
export const createSupabaseExamSessionRepository=({request}={})=>{
 if(typeof request!=="function")throw new TypeError("A server-side Supabase request function is required");
 const findOne=async(id,op)=>{
  const query=new URLSearchParams({select:SELECT,id:`eq.${id}`,limit:"2"}).toString();
  const rows=expectRows(await request("exam_sessions",{query}),op);
  if(rows.length>1)throw new Error(`Supabase ${op} returned multiple exam sessions`);
  return rows.length?mapSession(rows[0]):null;
 };
 return Object.freeze({
  listExamSessions:async()=>{
   const query=new URLSearchParams({select:SELECT,order:"created_at.desc"}).toString();
   return expectRows(await request("exam_sessions",{query}),"exam session list").map(mapSession);
  },
  findExamSessionById:async(id)=>findOne(uuid(id,"exam session ID"),"exam session lookup"),
  createExamSession:async(payload={})=>{
   const b=bodyFrom(payload);
   validateRules({...payload,id:payload.id??null,sessionCategory:b.session_category,examMonth:b.exam_month,parentExamSessionId:b.parent_exam_session_id});
   if(payload.id!==undefined)b.id=uuid(payload.id,"exam session ID");
   if(b.parent_exam_session_id){
    const parent=await findOne(b.parent_exam_session_id,"parent exam session lookup");
    if(!parent)throw new TypeError("Parent exam session not found");
    if(b.session_category==="REVALUATION"&&parent.sessionCategory==="REVALUATION")throw new TypeError("Revaluation session cannot use another revaluation session as parent");
   }
   const rows=expectRows(await request("exam_sessions",{method:"POST",query:`select=${SELECT}`,body:b,prefer:"return=representation"}),"exam session create");
   if(rows.length!==1)throw new Error("Supabase exam session create did not return exactly one session");
   return mapSession(rows[0]);
  },
  updateExamSession:async(id,payload={})=>{
   const sessionId=uuid(id,"exam session ID"),current=await findOne(sessionId,"exam session update lookup");
   if(!current)return null;
   const merged={...current,...payload};
   const b=bodyFrom(merged,{partial:true});
   if(!Object.keys(b).length)throw new TypeError("At least one exam session field must be supplied");
   validateRules({...merged,id:sessionId,sessionCategory:b.session_category??current.sessionCategory,examMonth:b.exam_month===undefined?current.examMonth:b.exam_month,parentExamSessionId:b.parent_exam_session_id===undefined?current.parentExamSessionId:b.parent_exam_session_id});
   const parentId=b.parent_exam_session_id===undefined?current.parentExamSessionId:b.parent_exam_session_id;
   if(parentId){
    const parent=await findOne(parentId,"parent exam session lookup");
    if(!parent)throw new TypeError("Parent exam session not found");
    if((b.session_category??current.sessionCategory)==="REVALUATION"&&parent.sessionCategory==="REVALUATION")throw new TypeError("Revaluation session cannot use another revaluation session as parent");
   }
   const rows=expectRows(await request("exam_sessions",{method:"PATCH",query:new URLSearchParams({id:`eq.${sessionId}`,select:SELECT}).toString(),body:b,prefer:"return=representation"}),"exam session update");
   if(rows.length>1)throw new Error("Supabase exam session update matched multiple rows");
   return rows.length?mapSession(rows[0]):null;
  },
  toggleExamSessionStatus:async(id)=>{
   const sessionId=uuid(id,"exam session ID"),current=await findOne(sessionId,"exam session status lookup");
   if(!current)return null;
   const rows=expectRows(await request("exam_sessions",{method:"PATCH",query:new URLSearchParams({id:`eq.${sessionId}`,select:SELECT}).toString(),body:{status:current.status==="DRAFT"?"OPEN":"DRAFT"},prefer:"return=representation"}),"exam session status update");
   if(rows.length>1)throw new Error("Supabase exam session status update matched multiple rows");
   return rows.length?mapSession(rows[0]):null;
  }
 });
};
