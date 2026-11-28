const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PASS=new Set(["PASS","FAIL","WITHHELD","MALPRACTICE","ABSENT"]);
const RESULT_SELECT="id,exam_session_id,exam_registration_id,student_id,subject_id,source_semester_id,attempt_type,attempt_number,internal_mark,external_mark,total_mark,pass_status,grade,grade_point,credits_earned,grading_policy_id,result_version,is_published,processed_at,created_at,updated_at";
const SUMMARY_SELECT="id,student_id,exam_session_id,semester_id,total_registered_subjects,total_passed_subjects,total_failed_subjects,total_registered_credits,total_earned_credits,gpa,cgpa,current_arrear_count,total_pending_arrear_count,total_cleared_arrear_count,result_version,is_published,created_at,updated_at";
const uuid=(value,field)=>{if(typeof value!=="string"||!UUID.test(value))throw new TypeError(`A valid PostgreSQL UUID is required for ${field}`);return value.toLowerCase();};
const rows=(value,operation)=>{if(!Array.isArray(value))throw new TypeError(`Supabase ${operation} returned an invalid response`);return value;};
const one=(value,operation)=>{const list=rows(value,operation);if(list.length>1)throw new Error(`Supabase ${operation} returned multiple rows for a unique lookup`);return list[0]??null;};
const num=(value,field)=>{const result=Number(value);if(!Number.isFinite(result)||result<0)throw new TypeError(`${field} must be a finite non-negative number`);return result;};
const mapResult=r=>({_id:r.id,id:r.id,examSessionId:r.exam_session_id,examRegistrationId:r.exam_registration_id,studentId:r.student_id,subjectId:r.subject_id,sourceSemesterId:r.source_semester_id,attemptType:r.attempt_type,attemptNumber:r.attempt_number,internalMark:Number(r.internal_mark),externalMark:Number(r.external_mark),totalMark:Number(r.total_mark),passStatus:r.pass_status,grade:r.grade,gradePoint:Number(r.grade_point),creditsEarned:Number(r.credits_earned),gradingPolicyId:r.grading_policy_id,resultVersion:r.result_version,isPublished:r.is_published,processedAt:r.processed_at,createdAt:r.created_at,updatedAt:r.updated_at});
const mapSummary=r=>({_id:r.id,id:r.id,studentId:r.student_id,examSessionId:r.exam_session_id,semesterId:r.semester_id,totalRegisteredSubjects:r.total_registered_subjects,totalPassedSubjects:r.total_passed_subjects,totalFailedSubjects:r.total_failed_subjects,totalRegisteredCredits:Number(r.total_registered_credits),totalEarnedCredits:Number(r.total_earned_credits),gpa:Number(r.gpa),cgpa:Number(r.cgpa),currentArrearCount:r.current_arrear_count,totalPendingArrearCount:r.total_pending_arrear_count,totalClearedArrearCount:r.total_cleared_arrear_count,resultVersion:r.result_version,isPublished:r.is_published,createdAt:r.created_at,updatedAt:r.updated_at});
const gradeDecision=({mark,subject,policy})=>{
 if(mark.is_malpractice)return{pass_status:"MALPRACTICE",grade:"U",grade_point:0,credits_earned:0};
 if(mark.is_withheld)return{pass_status:"WITHHELD",grade:"U",grade_point:0,credits_earned:0};
 if(mark.is_absent)return{pass_status:"ABSENT",grade:"U",grade_point:0,credits_earned:0};
 if(Number(mark.internal_mark)<Number(policy.internal_min)||Number(mark.external_mark)<Number(policy.external_min)||Number(mark.total_mark)<Number(policy.total_min))return{pass_status:"FAIL",grade:"U",grade_point:0,credits_earned:0};
 if(!Array.isArray(policy.grade_rules)||policy.grade_rules.length===0)throw new TypeError("Active grading policy has no grade rules");
 const rule=policy.grade_rules.find(item=>Number(mark.total_mark)>=Number(item.min)&&Number(mark.total_mark)<=Number(item.max));
 if(!rule)throw new TypeError(`No grade rule found for total mark ${mark.total_mark}`);
 const point=num(rule.point,"Grade point");
 if(point>4)throw new TypeError("Grade point cannot exceed 4");
 return{pass_status:"PASS",grade:String(rule.grade),grade_point:point,credits_earned:num(subject.credits,"Subject credits")};
};
const latestBySubject=items=>{
 const sorted=[...items].sort((a,b)=>{
  const attempt=Number(b.attempt_number||1)-Number(a.attempt_number||1);if(attempt)return attempt;
  const date=new Date(b.processed_at||b.updated_at||b.created_at||0)-new Date(a.processed_at||a.updated_at||a.created_at||0);if(date)return date;
  return Number(b.result_version||0)-Number(a.result_version||0);
 });
 const map=new Map();for(const item of sorted){if(item.subject_id&&!map.has(item.subject_id))map.set(item.subject_id,item);}return [...map.values()];
};
const round2=value=>Number(Number(value||0).toFixed(2));
const average=items=>{
 const weighted=items.reduce((acc,item)=>{const credits=Number(item._subjectCredits??item.subject_credits??0);if(Number.isFinite(credits)&&credits>0){acc.points+=Number(item.grade_point||0)*credits;acc.credits+=credits;}return acc;},{points:0,credits:0});
 return weighted.credits?round2(weighted.points/weighted.credits):0;
};
/**
 * Isolated server-side adapter for result processing. All IDs supplied to this
 * repository must already be PostgreSQL UUIDs resolved through the migration ledger.
 * It deliberately does not wire into the live MongoDB services.
 */
export const createSupabaseResultRepository=({request}={})=>{
 if(typeof request!=="function")throw new TypeError("A server-side Supabase request function is required");
 const get=async(table,filters,select,operation)=>{
  const params=new URLSearchParams({select,...filters});return rows(await request(table,{query:params.toString()}),operation);
 };
 const findById=async(table,id,select,operation)=>one(await get(table,{id:`eq.${id}`,limit:"2"},select,operation),operation);
 const patch=async(table,filters,body,select,operation)=>one(await request(table,{method:"PATCH",query:new URLSearchParams({...filters,select}).toString(),body,prefer:"return=representation"}),operation);
 const insert=async(table,body,select,operation)=>one(await request(table,{method:"POST",query:new URLSearchParams({select}).toString(),body,prefer:"return=representation"}),operation);
 const fetchSubjects=async(ids)=>{
  const unique=[...new Set(ids.filter(Boolean))];if(!unique.length)return new Map();
  const filter=`in.(${unique.join(",")})`;
  const found=await get("subjects",{id:filter},"id,credits","subject credits lookup");
  return new Map(found.map(s=>[s.id,Number(s.credits||0)]));
 };
 const attachCredits=async(results)=>{
  const subjects=await fetchSubjects(results.map(r=>r.subject_id));
  return results.map(r=>({...r,_subjectCredits:subjects.get(r.subject_id)??0}));
 };
 const summarize=async({studentId,examSessionId,semesterId})=>{
  const semesterRows=await get("processed_results",{student_id:`eq.${studentId}`,exam_session_id:`eq.${examSessionId}`,source_semester_id:`eq.${semesterId}`},RESULT_SELECT,"semester processed results");
  const allRows=await get("processed_results",{student_id:`eq.${studentId}`},RESULT_SELECT,"student processed results");
  const [semesterWithCredits,allWithCredits]=await Promise.all([attachCredits(semesterRows),attachCredits(allRows)]);
  const latestSemester=latestBySubject(semesterWithCredits),latestAll=latestBySubject(allWithCredits);
  const passed=latestSemester.filter(r=>r.pass_status==="PASS");
  const failed=latestSemester.filter(r=>r.pass_status!=="PASS");
  const priorFailedSubjects=new Set(allWithCredits.filter(r=>r.pass_status!=="PASS").map(r=>r.subject_id));
  const cleared=latestAll.filter(r=>r.pass_status==="PASS"&&priorFailedSubjects.has(r.subject_id));
  const summary={
   total_registered_subjects:latestSemester.length,
   total_passed_subjects:passed.length,
   total_failed_subjects:failed.length,
   total_registered_credits:latestSemester.reduce((s,r)=>s+Number(r._subjectCredits||0),0),
   total_earned_credits:latestSemester.reduce((s,r)=>s+Number(r.credits_earned||0),0),
   gpa:average(latestSemester),
   cgpa:average(latestAll),
   current_arrear_count:failed.length,
   total_pending_arrear_count:latestAll.filter(r=>r.pass_status!=="PASS").length,
   total_cleared_arrear_count:cleared.length
  };
  const existing=one(await get("semester_summaries",{student_id:`eq.${studentId}`,exam_session_id:`eq.${examSessionId}`,semester_id:`eq.${semesterId}`,limit:"2"},SUMMARY_SELECT,"semester summary lookup"),"semester summary lookup");
  if(existing?.is_published)throw new Error("A published semester summary cannot be overwritten");
  const saved=existing
   ?await patch("semester_summaries",{id:`eq.${existing.id}`},{...summary,result_version:Number(existing.result_version||1)+1},"*","semester summary update")
   :await insert("semester_summaries",{student_id:studentId,exam_session_id:examSessionId,semester_id:semesterId,...summary,result_version:1,is_published:false},"*","semester summary create");
  if(!saved)throw new Error("Semester summary write did not return a row");
  return mapSummary(saved);
 };
 const processOne=async(markEntryId)=>{
  const markId=uuid(markEntryId,"mark entry ID");
  const mark=await findById("mark_entries",markId,"id,exam_registration_id,exam_session_id,student_id,subject_id,internal_mark,external_mark,total_mark,is_absent,is_withheld,is_malpractice,entry_status","mark entry lookup");
  if(!mark)throw new Error("Mark entry not found");
  if(mark.entry_status!=="LOCKED")throw new Error("Only locked mark entries can be processed");
  const registration=await findById("exam_registrations",uuid(mark.exam_registration_id,"exam registration ID"),"id,exam_session_id,student_id,subject_id,source_semester_id,attempt_type,attempt_number","exam registration lookup");
  if(!registration)throw new Error("Exam registration not found");
  const session=await findById("exam_sessions",uuid(registration.exam_session_id,"exam session ID"),"id,status","exam session lookup");
  if(!session)throw new Error("Exam session not found");
  if(session.status==="PUBLISHED")throw new Error("Results in a published exam session are locked. Roll back publication before processing corrections.");
  const student=await findById("students",uuid(registration.student_id,"student ID"),"id,regulation_id","student lookup");
  if(!student)throw new Error("Student not found");
  const subject=await findById("subjects",uuid(registration.subject_id,"subject ID"),"id,subject_type,credits","subject lookup");
  if(!subject)throw new Error("Subject not found");
  const policies=await get("grading_policies",{regulation_id:`eq.${uuid(student.regulation_id,"regulation ID")}`,subject_type:`eq.${subject.subject_type}`,is_active:"eq.true",limit:"2"},"id,internal_min,external_min,total_min,grade_rules","grading policy lookup");
  if(policies.length!==1)throw new Error(policies.length?"Multiple active grading policies found":"Active grading policy not found for student regulation and subject type");
  const policy=policies[0],decision=gradeDecision({mark,subject,policy});
  const semesterSummary=one(await get("semester_summaries",{student_id:`eq.${registration.student_id}`,exam_session_id:`eq.${registration.exam_session_id}`,semester_id:`eq.${registration.source_semester_id}`,limit:"2"},SUMMARY_SELECT,"semester summary preflight"),"semester summary preflight");
  if(semesterSummary?.is_published)throw new Error("A published semester summary cannot be overwritten");
  const existing=one(await get("processed_results",{exam_registration_id:`eq.${registration.id}`,limit:"2"},RESULT_SELECT,"processed result lookup"),"processed result lookup");
  if(existing?.is_published)throw new Error("A published result cannot be overwritten. Roll back publication before processing corrections.");
  const values={
   exam_session_id:registration.exam_session_id,
   exam_registration_id:registration.id,
   student_id:registration.student_id,
   subject_id:registration.subject_id,
   source_semester_id:registration.source_semester_id,
   attempt_type:registration.attempt_type,
   attempt_number:registration.attempt_number,
   internal_mark:Number(mark.internal_mark),
   external_mark:Number(mark.external_mark),
   total_mark:Number(mark.total_mark),
   ...decision,
   grading_policy_id:policy.id,
   result_version:existing?Number(existing.result_version||1)+1:1,
   is_published:false,
   processed_at:new Date().toISOString()
  };
  const saved=existing
   ?await patch("processed_results",{id:`eq.${existing.id}`},values,RESULT_SELECT,"processed result update")
   :await insert("processed_results",values,RESULT_SELECT,"processed result create");
  if(!saved)throw new Error("Processed result write did not return a row");
  const summary=await summarize({studentId:registration.student_id,examSessionId:registration.exam_session_id,semesterId:registration.source_semester_id});
  return{processedResult:mapResult(saved),semesterSummary:summary};
 };
 return Object.freeze({
  processSingleResult:processOne,
  processExamSessionResults:async(examSessionId)=>{
   const sessionId=uuid(examSessionId,"exam session ID");
   const entries=await get("mark_entries",{exam_session_id:`eq.${sessionId}`,entry_status:"eq.LOCKED",order:"created_at.asc"},"id,exam_registration_id","locked mark entries");
   if(!entries.length)throw new Error("No locked mark entries found for this exam session");
   const summary={totalLockedEntries:entries.length,processedCount:0,skippedCount:0,processedResults:[],skippedRows:[]};
   for(const entry of entries){try{const result=await processOne(entry.id);summary.processedCount++;summary.processedResults.push(result.processedResult);}catch(error){summary.skippedCount++;summary.skippedRows.push({markEntryId:entry.id,examRegistrationId:entry.exam_registration_id,reason:error.message});}}
   return summary;
  },
  listProcessedResults:async()=> (await get("processed_results",{order:"created_at.desc"},RESULT_SELECT,"processed result list")).map(mapResult),
  findProcessedResultById:async(id)=>{const row=await findById("processed_results",uuid(id,"processed result ID"),RESULT_SELECT,"processed result lookup");return row?mapResult(row):null;},
  listSemesterSummaries:async()=> (await get("semester_summaries",{order:"created_at.desc"},SUMMARY_SELECT,"semester summary list")).map(mapSummary),
  findSemesterSummaryById:async(id)=>{const row=await findById("semester_summaries",uuid(id,"semester summary ID"),SUMMARY_SELECT,"semester summary lookup");return row?mapSummary(row):null;}
 });
};
