import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseCurriculumMappingRepository } from "./supabaseCurriculumMapping.repository.js";
const ID = "a0b1c2d3-e4f5-4678-9012-abcdef123456";
const REF = "b0b1c2d3-e4f5-4678-9012-abcdef123456";
const row = (overrides = {}) => ({
 id:ID,batch_id:REF,program_id:REF,regulation_id:REF,semester_id:REF,subject_id:REF,
 sequence_no:2,is_elective:false,is_active:true,created_at:null,updated_at:null,
 batch:{id:REF,label:"2023-2027"},program:{id:REF,code:"CHEW"},regulation:{id:REF,code:"R2025"},
 semester:{id:REF,number:1},subject:{id:REF,code:"CHE101"},...overrides
});
const valid = (overrides={}) => ({
 batchId:REF,programId:REF,regulationId:REF,semesterId:REF,subjectId:REF,...overrides
});
test("requires injected server-side request",()=>assert.throws(()=>createSupabaseCurriculumMappingRepository(),/server-side/));
test("lists and maps curriculum mappings with referenced academic entities",async()=>{
 let call;
 const repo=createSupabaseCurriculumMappingRepository({request:async(t,o)=>{call={t,o};return[row()];}});
 const result=await repo.listCurriculumMappings();
 assert.equal(call.t,"curriculum_mappings");
 assert.match(new URLSearchParams(call.o.query).get("select"),/batch:batches/);
 assert.equal(result[0].batch.label,"2023-2027");
 assert.equal(result[0].subject.code,"CHE101");
 assert.equal(result[0].sequenceNo,2);
});
test("looks up by PostgreSQL UUID and rejects Mongo ObjectIds",async()=>{
 const repo=createSupabaseCurriculumMappingRepository({request:async()=>[row()]});
 assert.equal((await repo.findCurriculumMappingById(ID)).id,ID);
 await assert.rejects(repo.findCurriculumMappingById("507f1f77bcf86cd799439011"),/UUID/);
});
test("creates with defaults and validates all five foreign keys",async()=>{
 let options;
 const repo=createSupabaseCurriculumMappingRepository({request:async(_t,o)=>{options=o;return[row()];}});
 await repo.createCurriculumMapping(valid());
 assert.equal(options.method,"POST");
 assert.equal(options.body.sequence_no,0);
 assert.equal(options.body.is_elective,false);
 assert.equal(options.body.is_active,true);
 for(const field of ["batchId","programId","regulationId","semesterId","subjectId"]){
  await assert.rejects(repo.createCurriculumMapping(valid({[field]:"507f1f77bcf86cd799439011"})),/UUID/);
 }
});
test("validates sequence and boolean fields",async()=>{
 const repo=createSupabaseCurriculumMappingRepository({request:async()=>[row()]});
 await assert.rejects(repo.createCurriculumMapping(valid({sequenceNo:-1})),/non-negative/);
 await assert.rejects(repo.createCurriculumMapping(valid({sequenceNo:1.2})),/non-negative/);
 await assert.rejects(repo.createCurriculumMapping(valid({isElective:"yes"})),/boolean/);
});
test("updates merged record and preserves omitted fields",async()=>{
 const calls=[];
 const repo=createSupabaseCurriculumMappingRepository({request:async(_t,o)=>{calls.push(o);return o.method?[row({sequence_no:5})]:[row()];}});
 const result=await repo.updateCurriculumMapping(ID,{sequenceNo:5});
 assert.equal(result.sequenceNo,5);
 assert.equal(calls[1].body.batch_id,REF);
 assert.equal(calls[1].body.sequence_no,5);
 assert.equal(calls[1].body.is_active,true);
});
test("toggles active state and returns null for missing rows",async()=>{
 const calls=[];
 const repo=createSupabaseCurriculumMappingRepository({request:async(_t,o)=>{calls.push(o);return o.method?[row({is_active:false})]:[row()];}});
 assert.equal((await repo.toggleCurriculumMappingStatus(ID)).isActive,false);
 assert.equal(calls[1].body.is_active,false);
 const empty=createSupabaseCurriculumMappingRepository({request:async()=>[]});
 assert.equal(await empty.updateCurriculumMapping(ID,{sequenceNo:1}),null);
 assert.equal(await empty.toggleCurriculumMappingStatus(ID),null);
});
test("rejects invalid response shapes and multiple matches",async()=>{
 const invalid=createSupabaseCurriculumMappingRepository({request:async()=>({})});
 await assert.rejects(invalid.listCurriculumMappings(),/invalid response/);
 const multiple=createSupabaseCurriculumMappingRepository({request:async()=>[row(),row()]});
 await assert.rejects(multiple.findCurriculumMappingById(ID),/multiple curriculum mappings/);
});
