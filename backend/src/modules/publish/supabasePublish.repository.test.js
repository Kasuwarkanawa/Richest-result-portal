import test from "node:test";
import assert from "node:assert/strict";
import { createSupabasePublishRepository } from "./supabasePublish.repository.js";

const ID={
 session:"10000000-0000-4000-8000-000000000001",
 actor:"20000000-0000-4000-8000-000000000002",
 snapshot:"30000000-0000-4000-8000-000000000003"
};
const snapshot=overrides=>({
 id:ID.snapshot,
 exam_session_id:ID.session,
 snapshot_version:2,
 published_by:ID.actor,
 published_at:"2026-11-28T10:00:00.000Z",
 total_students:12,
 total_subjects:45,
 storage_version:2,
 rolled_back_at:null,
 rolled_back_by:null,
 rollback_reason:"",
 status:"ACTIVE",
 notes:"Exam publication",
 created_at:"2026-11-28T10:00:00.000Z",
 updated_at:"2026-11-28T10:00:00.000Z",
 exam_session:{id:ID.session,name:"November 2026",exam_month:"November",exam_year:2026,session_category:"REGULAR",status:"PUBLISHED"},
 published_by_user:{id:ID.actor,full_name:"Exam Cell Admin",email:"admin@example.test",role:"EXAM_CELL_ADMIN"},
 ...overrides
});
const setup=({rows=[snapshot()],rpcResult=[{snapshot_id:ID.snapshot}],rpcError=null}={})=>{
 const calls={requests:[],rpcs:[]};
 const request=async(table,options={})=>{calls.requests.push({table,options});return rows;};
 const rpc=async(name,args)=>{calls.rpcs.push({name,args});if(rpcError)throw rpcError;return rpcResult;};
 return{repo:createSupabasePublishRepository({request,rpc}),calls};
};

test("requires server-only request and atomic RPC adapters",()=>{
 assert.throws(()=>createSupabasePublishRepository({rpc:async()=>[]}),/server-side/);
 assert.throws(()=>createSupabasePublishRepository({request:async()=>[]}),/atomic Supabase RPC/);
});

test("publishes using one atomic RPC and returns the populated snapshot header",async()=>{
 const{repo,calls}=setup();
 const result=await repo.publishExamSession({examSessionId:ID.session,actorUserId:ID.actor,notes:"  Approved results  "});
 assert.equal(calls.rpcs.length,1);
 assert.equal(calls.rpcs[0].name,"publish_exam_session_snapshot");
 assert.deepEqual(calls.rpcs[0].args,{p_exam_session_id:ID.session,p_actor_user_id:ID.actor,p_notes:"Approved results"});
 assert.equal(result.id,ID.snapshot);
 assert.equal(result.snapshotVersion,2);
 assert.equal(result.storageVersion,2);
 assert.equal(result.examSession.status,"PUBLISHED");
 assert.equal(result.publishedByUser.role,"EXAM_CELL_ADMIN");
 assert.equal(calls.requests.length,1);
 assert.equal(calls.requests[0].table,"publish_snapshots");
});

test("rolls back only through the atomic rollback RPC",async()=>{
 const{repo,calls}=setup({rows:[snapshot({status:"ROLLED_BACK",rolled_back_at:"2026-11-28T11:00:00.000Z",rolled_back_by:ID.actor,rollback_reason:"Correction required"})]});
 const result=await repo.rollbackPublishSnapshot({publishSnapshotId:ID.snapshot,actorUserId:ID.actor,reason:"  Correction required  "});
 assert.equal(calls.rpcs[0].name,"rollback_publish_snapshot");
 assert.deepEqual(calls.rpcs[0].args,{p_snapshot_id:ID.snapshot,p_actor_user_id:ID.actor,p_reason:"Correction required"});
 assert.equal(result.status,"ROLLED_BACK");
 assert.equal(result.rollbackReason,"Correction required");
});

test("lists snapshots newest first and maps metadata without selecting frozen payload columns",async()=>{
 const{repo,calls}=setup({rows:[snapshot(),snapshot({id:"40000000-0000-4000-8000-000000000004",snapshot_version:1})]});
 const rows=await repo.listPublishSnapshots();
 assert.equal(rows.length,2);
 assert.equal(rows[0].snapshotVersion,2);
 assert.match(calls.requests[0].options.query,/order=created_at.desc/);
 assert.doesNotMatch(calls.requests[0].options.query,/frozen_results|frozen_summaries/);
 assert.match(calls.requests[0].options.query,/exam_session/);
 assert.match(calls.requests[0].options.query,/published_by_user/);
});

test("returns null for a missing snapshot and rejects duplicate lookup rows",async()=>{
 const empty=setup({rows:[]});
 assert.equal(await empty.repo.findPublishSnapshotById(ID.snapshot),null);
 const duplicate=setup({rows:[snapshot(),snapshot()]});
 await assert.rejects(duplicate.repo.findPublishSnapshotById(ID.snapshot),/multiple rows/);
});

test("validates UUIDs and rollback reason before making writes",async()=>{
 const{repo,calls}=setup();
 await assert.rejects(repo.publishExamSession({examSessionId:"507f1f77bcf86cd799439011",actorUserId:ID.actor}),/PostgreSQL UUID/);
 await assert.rejects(repo.rollbackPublishSnapshot({publishSnapshotId:ID.snapshot,actorUserId:ID.actor,reason:"  "}),/Rollback reason is required/);
 assert.equal(calls.rpcs.length,0);
});

test("propagates RPC failures without attempting a follow-up read",async()=>{
 const{repo,calls}=setup({rpcError:new Error("transaction rolled back")});
 await assert.rejects(repo.publishExamSession({examSessionId:ID.session,actorUserId:ID.actor}),/transaction rolled back/);
 assert.equal(calls.requests.length,0);
});

test("rejects an RPC response without a snapshot UUID",async()=>{
 const{repo}=setup({rpcResult:{ok:true}});
 await assert.rejects(repo.publishExamSession({examSessionId:ID.session,actorUserId:ID.actor}),/did not return a valid snapshot UUID/);
});
