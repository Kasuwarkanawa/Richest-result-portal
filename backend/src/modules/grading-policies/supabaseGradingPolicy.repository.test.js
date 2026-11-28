import test from "node:test";
import assert from "node:assert/strict";
import {createSupabaseGradingPolicyRepository} from "./supabaseGradingPolicy.repository.js";
const ID="a0b1c2d3-e4f5-4678-9012-abcdef123456";
const REF="b0b1c2d3-e4f5-4678-9012-abcdef123456";
const rules=[{grade:"F",min:0,max:39,point:0},{grade:"A",min:40,max:100,point:4}];
const valid=(overrides={})=>({
 regulationId:REF,subjectType:"THEORY",internalMax:20,externalMax:80,totalMax:100,
 internalMin:8,externalMin:32,totalMin:40,gradeRules:rules,effectiveFrom:"2026-01-01T00:00:00.000Z",...overrides
});
const row=(overrides={})=>({
 id:ID,regulation_id:REF,subject_type:"THEORY",internal_max:"20",external_max:"80",total_max:"100",
 internal_min:"8",external_min:"32",total_min:"40",grade_rules:rules,gpa_formula_type:"CBCS",
 cgpa_formula_type:"CBCS",effective_from:"2026-01-01T00:00:00.000Z",effective_to:null,is_active:true,
 regulation:{id:REF,code:"REG-26"},...overrides
});
test("requires injected server-only request",()=>assert.throws(()=>createSupabaseGradingPolicyRepository(),/server-side/));
test("lists policies and maps numeric/json fields",async()=>{
 let call;
 const repo=createSupabaseGradingPolicyRepository({request:async(t,o)=>{call={t,o};return[row()];}});
 const items=await repo.listGradingPolicies();
 assert.equal(call.t,"grading_policies");assert.equal(items[0].internalMax,20);
 assert.equal(items[0].gradeRules[1].grade,"A");assert.equal(items[0].regulation.code,"REG-26");
});
test("finds by UUID and rejects ObjectId",async()=>{
 const repo=createSupabaseGradingPolicyRepository({request:async()=>[row()]});
 assert.equal((await repo.findGradingPolicyById(ID)).id,ID);
 await assert.rejects(repo.findGradingPolicyById("507f1f77bcf86cd799439011"),/UUID/);
});
test("creates normalized grade rules and defaults formula fields",async()=>{
 let call;
 const repo=createSupabaseGradingPolicyRepository({request:async(_t,o)=>{call=o;return[row()];}});
 await repo.createGradingPolicy(valid({gradeRules:[{grade:" a ",min:40,max:100,point:4},{grade:" f ",min:0,max:39,point:0}]}));
 assert.equal(call.method,"POST");assert.equal(call.body.gpa_formula_type,"CBCS");
 assert.deepEqual(call.body.grade_rules,rules);assert.equal(call.body.is_active,true);
});
test("enforces marks, minimums, grade ranges, uniqueness and subject type",async()=>{
 const repo=createSupabaseGradingPolicyRepository({request:async()=>[row()]});
 await assert.rejects(repo.createGradingPolicy(valid({subjectType:"INVALID"})),/Invalid subject type/);
 await assert.rejects(repo.createGradingPolicy(valid({totalMax:99})),/must equal/);
 await assert.rejects(repo.createGradingPolicy(valid({internalMin:21})),/minimum cannot be greater/);
 await assert.rejects(repo.createGradingPolicy(valid({gradeRules:[{grade:"A",min:50,max:40,point:4}]})),/min cannot be greater/);
 await assert.rejects(repo.createGradingPolicy(valid({gradeRules:[{grade:"A",min:0,max:40,point:4},{grade:"a",min:41,max:80,point:3}]})),/must be unique/);
 await assert.rejects(repo.createGradingPolicy(valid({gradeRules:[{grade:"A",min:0,max:50,point:4},{grade:"B",min:50,max:80,point:3}]})),/overlap/);
 await assert.rejects(repo.createGradingPolicy(valid({effectiveFrom:"2026-05-01",effectiveTo:"2026-01-01"})),/earlier/);
});
test("updates partial values using merged policy and toggles status",async()=>{
 const calls=[];
 const repo=createSupabaseGradingPolicyRepository({request:async(_t,o)=>{calls.push(o);return o.method?[row({total_min:"45",is_active:false})]:[row()];}});
 const updated=await repo.updateGradingPolicy(ID,{totalMin:45,isActive:false});
 assert.equal(updated.totalMin,45);assert.equal(calls[1].body.internal_max,20);
 assert.equal(calls[1].body.total_min,45);assert.equal(calls[1].body.is_active,false);
 const toggled=await repo.toggleGradingPolicyStatus(ID);
 assert.equal(toggled.isActive,false);assert.equal(calls[3].body.is_active,false);
});
test("returns null for missing policy and rejects invalid response",async()=>{
 const empty=createSupabaseGradingPolicyRepository({request:async()=>[]});
 assert.equal(await empty.updateGradingPolicy(ID,{totalMin:40}),null);
 assert.equal(await empty.toggleGradingPolicyStatus(ID),null);
 const bad=createSupabaseGradingPolicyRepository({request:async()=>({})});
 await assert.rejects(bad.listGradingPolicies(),/invalid response/);
});
