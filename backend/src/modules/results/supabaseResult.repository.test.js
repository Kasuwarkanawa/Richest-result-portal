import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseResultRepository } from "./supabaseResult.repository.js";

const ID={
 mark:"10000000-0000-4000-8000-000000000001",
 registration:"20000000-0000-4000-8000-000000000002",
 session:"30000000-0000-4000-8000-000000000003",
 student:"40000000-0000-4000-8000-000000000004",
 subject:"50000000-0000-4000-8000-000000000005",
 semester:"60000000-0000-4000-8000-000000000006",
 regulation:"70000000-0000-4000-8000-000000000007",
 policy:"80000000-0000-4000-8000-000000000008",
 result:"90000000-0000-4000-8000-000000000009",
 summary:"a0000000-0000-4000-8000-00000000000a"
};
const fixture=()=>({
 mark_entries:[{id:ID.mark,exam_registration_id:ID.registration,exam_session_id:ID.session,student_id:ID.student,subject_id:ID.subject,internal_mark:30,external_mark:60,total_mark:90,is_absent:false,is_withheld:false,is_malpractice:false,entry_status:"LOCKED",created_at:"2026-01-01T00:00:00.000Z"}],
 exam_registrations:[{id:ID.registration,exam_session_id:ID.session,student_id:ID.student,subject_id:ID.subject,source_semester_id:ID.semester,attempt_type:"CURRENT",attempt_number:1}],
 exam_sessions:[{id:ID.session,status:"VERIFIED"}],
 students:[{id:ID.student,regulation_id:ID.regulation}],
 subjects:[{id:ID.subject,subject_type:"THEORY",credits:3}],
 grading_policies:[{id:ID.policy,regulation_id:ID.regulation,subject_type:"THEORY",is_active:true,internal_min:15,external_min:25,total_min:40,grade_rules:[{grade:"A",min:80,max:100,point:4},{grade:"B",min:60,max:79,point:3}]}],
 processed_results:[],
 semester_summaries:[]
});
const matches=(row,params)=>{
 for(const [key,value] of params.entries()){
  if(["select","order","limit"].includes(key))continue;
  if(value.startsWith("eq.")&&String(row[key])!==value.slice(3))return false;
  if(value.startsWith("in.(")&&!value.slice(4,-1).split(",").includes(String(row[key])))return false;
 }
 return true;
};
const setup=(initial=fixture())=>{
 const db=initial;
 const request=async(table,options={})=>{
  const list=db[table];if(!list)throw new Error("Unexpected table "+table);
  const params=new URLSearchParams(options.query||"");
  if(options.method==="POST"){
   const row={id:options.body.id||"b0000000-0000-4000-8000-00000000000b",created_at:"2026-01-01T00:00:00.000Z",updated_at:"2026-01-01T00:00:00.000Z",...options.body};
   list.push(row);return[row];
  }
  if(options.method==="PATCH"){
   const row=list.find(item=>matches(item,params));if(!row)return[];
   Object.assign(row,options.body,{updated_at:"2026-01-02T00:00:00.000Z"});return[row];
  }
  return list.filter(row=>matches(row,params));
 };
 return{repo:createSupabaseResultRepository({request}),db};
};

test("requires a server-side Supabase request function",()=>assert.throws(()=>createSupabaseResultRepository(),/server-side/));

test("processes locked marks with the active grading policy and creates a semester summary",async()=>{
 const{repo,db}=setup();
 const result=await repo.processSingleResult(ID.mark);
 assert.equal(result.processedResult.passStatus,"PASS");
 assert.equal(result.processedResult.grade,"A");
 assert.equal(result.processedResult.gradePoint,4);
 assert.equal(result.processedResult.creditsEarned,3);
 assert.equal(result.semesterSummary.totalRegisteredSubjects,1);
 assert.equal(result.semesterSummary.totalPassedSubjects,1);
 assert.equal(result.semesterSummary.totalFailedSubjects,0);
 assert.equal(result.semesterSummary.gpa,4);
 assert.equal(result.semesterSummary.cgpa,4);
 assert.equal(db.processed_results.length,1);
 assert.equal(db.semester_summaries.length,1);
});

test("uses student and subject identity from the locked mark entry",async()=>{
 const data=fixture();
 const markStudent="41000000-0000-4000-8000-000000000004";
 data.mark_entries[0].student_id=markStudent;
 data.students.push({id:markStudent,regulation_id:ID.regulation});
 const{repo}=setup(data);
 const result=await repo.processSingleResult(ID.mark);
 assert.equal(result.processedResult.studentId,markStudent);
 assert.equal(result.semesterSummary.studentId,markStudent);
 assert.equal(data.processed_results[0].student_id,markStudent);
});

test("rejects unlocked marks and published exam sessions",async()=>{
 const unlocked=fixture();unlocked.mark_entries[0].entry_status="DRAFT";
 await assert.rejects(setup(unlocked).repo.processSingleResult(ID.mark),/Only locked/);
 const published=fixture();published.exam_sessions[0].status="PUBLISHED";
 await assert.rejects(setup(published).repo.processSingleResult(ID.mark),/published exam session/);
});

test("uses the exact absent, withheld and malpractice outcomes",async()=>{
 for(const flag of ["is_absent","is_withheld","is_malpractice"]){
  const data=fixture();data.mark_entries[0][flag]=true;
  const{repo}=setup(data);const{processedResult}=await repo.processSingleResult(ID.mark);
  assert.equal(processedResult.passStatus,flag==="is_absent"?"ABSENT":flag==="is_withheld"?"WITHHELD":"MALPRACTICE");
  assert.equal(processedResult.grade,"U");
  assert.equal(processedResult.gradePoint,0);
  assert.equal(processedResult.creditsEarned,0);
 }
});

test("applies minimum pass marks before grade-band selection",async()=>{
 const data=fixture();data.mark_entries[0].internal_mark=10;data.mark_entries[0].external_mark=60;data.mark_entries[0].total_mark=70;
 const{repo}=setup(data);const{processedResult}=await repo.processSingleResult(ID.mark);
 assert.equal(processedResult.passStatus,"FAIL");
 assert.equal(processedResult.grade,"U");
});

test("rejects missing active grading policy and missing grade bands",async()=>{
 const noPolicy=fixture();noPolicy.grading_policies=[];
 await assert.rejects(setup(noPolicy).repo.processSingleResult(ID.mark),/Active grading policy not found/);
 const noBands=fixture();noBands.grading_policies[0].grade_rules=[];
 await assert.rejects(setup(noBands).repo.processSingleResult(ID.mark),/no grade rules/);
});

test("increments result and summary versions when reprocessing an unpublished result",async()=>{
 const data=fixture();
 data.processed_results.push({id:ID.result,exam_session_id:ID.session,exam_registration_id:ID.registration,student_id:ID.student,subject_id:ID.subject,source_semester_id:ID.semester,attempt_type:"CURRENT",attempt_number:1,internal_mark:25,external_mark:55,total_mark:80,pass_status:"PASS",grade:"A",grade_point:4,credits_earned:3,grading_policy_id:ID.policy,result_version:3,is_published:false,processed_at:"2026-01-01T00:00:00.000Z"});
 data.semester_summaries.push({id:ID.summary,student_id:ID.student,exam_session_id:ID.session,semester_id:ID.semester,total_registered_subjects:1,total_passed_subjects:1,total_failed_subjects:0,total_registered_credits:3,total_earned_credits:3,gpa:4,cgpa:4,current_arrear_count:0,total_pending_arrear_count:0,total_cleared_arrear_count:0,result_version:2,is_published:false});
 const{repo}=setup(data);const result=await repo.processSingleResult(ID.mark);
 assert.equal(result.processedResult.resultVersion,4);
 assert.equal(result.semesterSummary.resultVersion,3);
});

test("does not overwrite a published result or published summary",async()=>{
 const publishedResult=fixture();publishedResult.processed_results.push({id:ID.result,exam_registration_id:ID.registration,is_published:true,result_version:1});
 await assert.rejects(setup(publishedResult).repo.processSingleResult(ID.mark),/published result cannot be overwritten/);
 const publishedSummary=fixture();publishedSummary.semester_summaries.push({id:ID.summary,student_id:ID.student,exam_session_id:ID.session,semester_id:ID.semester,is_published:true,result_version:1});
 const summaryGuard=setup(publishedSummary);
 await assert.rejects(summaryGuard.repo.processSingleResult(ID.mark),/published semester summary cannot be overwritten/);
 assert.equal(summaryGuard.db.processed_results.length,0,"a published summary must block result writes before they occur");
});

test("processes all locked entries and reports per-entry failures",async()=>{
 const data=fixture();data.mark_entries.push({...data.mark_entries[0],id:"11000000-0000-4000-8000-000000000011",exam_registration_id:"21000000-0000-4000-8000-000000000021"});
 data.exam_registrations.push({...data.exam_registrations[0],id:"21000000-0000-4000-8000-000000000021"});
 const{repo}=setup(data);const result=await repo.processExamSessionResults(ID.session);
 assert.equal(result.totalLockedEntries,2);
 assert.equal(result.processedCount,2);
 assert.equal(result.skippedCount,0);
});

test("maps processed result and semester summary reads",async()=>{
 const{repo}=setup();await repo.processSingleResult(ID.mark);
 const results=await repo.listProcessedResults();
 const summaries=await repo.listSemesterSummaries();
 assert.equal(results.length,1);
 assert.equal((await repo.findProcessedResultById(results[0].id)).id,results[0].id);
 assert.equal(summaries.length,1);
 assert.equal((await repo.findSemesterSummaryById(summaries[0].id)).id,summaries[0].id);
 assert.equal(await repo.findProcessedResultById("507f1f77bcf86cd799439011").catch(e=>e.message).then(v=>v.includes("UUID")),true);
});
