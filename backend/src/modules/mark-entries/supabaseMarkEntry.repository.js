const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES=new Set(["DRAFT","VERIFIED","LOCKED"]);
const SELECT="id,exam_registration_id,exam_session_id,student_id,subject_id,internal_mark,external_mark,total_mark,is_absent,is_withheld,is_malpractice,entry_status,entered_by,verified_by,locked_by,version,created_at,updated_at";
const uuid=(v,f)=>{if(typeof v!=="string"||!UUID.test(v))throw new TypeError(`A valid PostgreSQL UUID is required for ${f}`);return v.toLowerCase();};
const finiteMark=(v,f)=>{const n=Number(v);if(!Number.isFinite(n)||n<0)throw new TypeError(`${f} must be a finite non-negative number`);return n;};
const bool=(v,f)=>{if(typeof v!=="boolean")throw new TypeError(`${f} must be a boolean`);return v;};
const expect=(v,op)=>{if(!Array.isArray(v))throw new TypeError(`Supabase ${op} returned an invalid response`);return v;};
const map=r=>({_id:r.id,id:r.id,examRegistrationId:r.exam_registration_id,examSessionId:r.exam_session_id,studentId:r.student_id,subjectId:r.subject_id,internalMark:Number(r.internal_mark),externalMark:Number(r.external_mark),totalMark:Number(r.total_mark),isAbsent:r.is_absent,isWithheld:r.is_withheld,isMalpractice:r.is_malpractice,entryStatus:r.entry_status,enteredBy:r.entered_by??null,verifiedBy:r.verified_by??null,lockedBy:r.locked_by??null,version:r.version,createdAt:r.created_at??null,updatedAt:r.updated_at??null});
const applyFlags=(p)=>{
 const absent=p.isAbsent??false,withheld=p.isWithheld??false,malpractice=p.isMalpractice??false;
 if(typeof absent!=="boolean"||typeof withheld!=="boolean"||typeof malpractice!=="boolean")throw new TypeError("Mark flags must be booleans");
 const internal=finiteMark(p.internalMark??0,"Internal mark"),external=finiteMark(p.externalMark??0,"External mark");
 return absent||withheld||malpractice?{internal_mark:0,external_mark:0,total_mark:0,is_absent:absent,is_withheld:withheld,is_malpractice:malpractice}:{internal_mark:internal,external_mark:external,total_mark:internal+external,is_absent:absent,is_withheld:withheld,is_malpractice:malpractice};
};
/** Isolated mark-entry adapter. Callers must supply UUIDs resolved by the migration ledger; Mongo services remain active. */
export const createSupabaseMarkEntryRepository=({request}={})=>{
 if(typeof request!=="function")throw new TypeError("A server-side Supabase request function is required");
 const findOne=async(id,op="mark entry lookup")=>{const q=new URLSearchParams({select:SELECT,id:`eq.${id}`,limit:"2"}).toString();const rows=expect(await request("mark_entries",{query:q}),op);if(rows.length>1)throw new Error("Multiple mark entries returned for a unique ID");return rows.length?map(rows[0]):null;};
 const getRegistration=async(id)=>{const q=new URLSearchParams({select:"id,exam_session_id,student_id,subject_id",id:`eq.${id}`,limit:"2"}).toString();const rows=expect(await request("exam_registrations",{query:q}),"exam registration lookup");if(rows.length!==1)throw new TypeError("Exam registration not found");return rows[0];};
 const getSubject=async(id)=>{const q=new URLSearchParams({select:"id,internal_max,external_max",id:`eq.${id}`,limit:"2"}).toString();const rows=expect(await request("subjects",{query:q}),"subject lookup");if(rows.length!==1)throw new TypeError("Subject not found");return rows[0];};
 const validateAgainstSubject=(values,subject)=>{
  if(values.internal_mark>Number(subject.internal_max))throw new TypeError(`Internal mark cannot exceed subject internal max (${subject.internal_max})`);
  if(values.external_mark>Number(subject.external_max))throw new TypeError(`External mark cannot exceed subject external max (${subject.external_max})`);
 };
 const updateRow=async(id,body,op)=>{const rows=expect(await request("mark_entries",{method:"PATCH",query:new URLSearchParams({id:`eq.${id}`,select:SELECT}).toString(),body,prefer:"return=representation"}),op);if(rows.length>1)throw new Error("Mark entry update matched multiple rows");return rows.length?map(rows[0]):null;};
 return Object.freeze({
  listMarkEntries:async()=>{const q=new URLSearchParams({select:SELECT,order:"created_at.desc"}).toString();return expect(await request("mark_entries",{query:q}),"mark entry list").map(map);},
  findMarkEntryById:async(id)=>findOne(uuid(id,"mark entry ID")),
  findMarkEntryByRegistrationId:async(id)=>{const rid=uuid(id,"exam registration ID"),q=new URLSearchParams({select:SELECT,exam_registration_id:`eq.${rid}`,limit:"2"}).toString();const rows=expect(await request("mark_entries",{query:q}),"mark entry registration lookup");if(rows.length>1)throw new Error("Multiple mark entries found for one exam registration");return rows.length?map(rows[0]):null;},
  createMarkEntry:async(payload={})=>{
   const registrationId=uuid(payload.examRegistrationId,"exam registration ID"),actor=uuid(payload.enteredBy,"entered by user ID");
   const registration=await getRegistration(registrationId),subject=await getSubject(registration.subject_id);
   const values=applyFlags(payload);validateAgainstSubject(values,subject);
   if(await (async()=>{const q=new URLSearchParams({select:"id",exam_registration_id:`eq.${registrationId}`,limit:"1"}).toString();return expect(await request("mark_entries",{query:q}),"duplicate mark lookup").length>0;})())throw new TypeError("Mark entry already exists for this exam registration");
   const body={exam_registration_id:registration.id,exam_session_id:registration.exam_session_id,student_id:registration.student_id,subject_id:registration.subject_id,...values,entry_status:"DRAFT",entered_by:actor,version:1};
   if(payload.id!==undefined)body.id=uuid(payload.id,"mark entry ID");
   const rows=expect(await request("mark_entries",{method:"POST",query:`select=${SELECT}`,body,prefer:"return=representation"}),"mark entry create");
   if(rows.length!==1)throw new Error("Supabase mark entry create did not return exactly one row");return map(rows[0]);
  },
  updateMarkEntry:async(id,payload={})=>{
   const markId=uuid(id,"mark entry ID"),current=await findOne(markId,"mark entry update lookup");if(!current)return null;
   if(current.entryStatus==="LOCKED")throw new TypeError("Locked mark entry cannot be updated");
   const subject=await getSubject(current.subjectId);
   const values=applyFlags({...current,...payload});
   validateAgainstSubject(values,subject);
   return updateRow(markId,{...values,entry_status:"DRAFT",version:current.version+1},"mark entry update");
  },
  verifyMarkEntry:async(id,actorUserId)=>{
   const markId=uuid(id,"mark entry ID"),actor=uuid(actorUserId,"verified by user ID"),current=await findOne(markId,"mark entry verification lookup");
   if(!current)return null;if(current.entryStatus==="LOCKED")throw new TypeError("Locked mark entry cannot be verified again");
   return updateRow(markId,{entry_status:"VERIFIED",verified_by:actor},"mark entry verification");
  },
  lockMarkEntry:async(id,actorUserId)=>{
   const markId=uuid(id,"mark entry ID"),actor=uuid(actorUserId,"locked by user ID"),current=await findOne(markId,"mark entry lock lookup");
   if(!current)return null;if(current.entryStatus!=="VERIFIED")throw new TypeError("Only verified mark entries can be locked");
   return updateRow(markId,{entry_status:"LOCKED",locked_by:actor},"mark entry lock");
  }
 });
};
