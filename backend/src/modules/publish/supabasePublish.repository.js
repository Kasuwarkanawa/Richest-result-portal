const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SNAPSHOT_SELECT="id,exam_session_id,snapshot_version,published_by,published_at,total_students,total_subjects,storage_version,rolled_back_at,rolled_back_by,rollback_reason,status,notes,created_at,updated_at,exam_session:exam_sessions(id,name,exam_month,exam_year,session_category,status),published_by_user:users(id,full_name,email,role)";
const uuid=(value,field)=>{
 if(typeof value!=="string"||!UUID.test(value))throw new TypeError(`A valid PostgreSQL UUID is required for ${field}`);
 return value.toLowerCase();
};
const list=(value,operation)=>{
 if(!Array.isArray(value))throw new TypeError(`Supabase ${operation} returned an invalid response`);
 return value;
};
const one=(value,operation)=>{
 const rows=list(value,operation);
 if(rows.length>1)throw new Error(`Supabase ${operation} returned multiple rows for a unique lookup`);
 return rows[0]??null;
};
const text=(value,field,{allowEmpty=false}={})=>{
 if(typeof value!=="string"||(!allowEmpty&&!value.trim()))throw new TypeError(`${field} is required`);
 return value.trim();
};
const mapSnapshot=row=>({
 id:row.id,
 _id:row.id,
 examSessionId:row.exam_session_id,
 snapshotVersion:Number(row.snapshot_version),
 publishedBy:row.published_by,
 publishedAt:row.published_at,
 totalStudents:Number(row.total_students),
 totalSubjects:Number(row.total_subjects),
 storageVersion:Number(row.storage_version),
 rolledBackAt:row.rolled_back_at,
 rolledBackBy:row.rolled_back_by,
 rollbackReason:row.rollback_reason,
 status:row.status,
 notes:row.notes,
 createdAt:row.created_at,
 updatedAt:row.updated_at,
 examSession:row.exam_session??null,
 publishedByUser:row.published_by_user??null
});
const rpcId=result=>{
 const row=Array.isArray(result)?result[0]:result;
 const id=row?.snapshot_id??row?.snapshotId??row?.id??row;
 if(typeof id!=="string"||!UUID.test(id))throw new Error("Publication RPC did not return a valid snapshot UUID");
 return id.toLowerCase();
};

/**
 * Isolated publication adapter. Snapshot writes MUST use the atomic database RPCs;
 * this repository never attempts a multi-request REST transaction.
 *
 * RPC contract (to be installed only after DDL approval):
 * publish_exam_session_snapshot(p_exam_session_id, p_actor_user_id, p_notes)
 * rollback_publish_snapshot(p_snapshot_id, p_actor_user_id, p_reason)
 * Each returns { snapshot_id: uuid } after committing all writes.
 */
export const createSupabasePublishRepository=({request,rpc}={})=>{
 if(typeof request!=="function")throw new TypeError("A server-side Supabase request function is required");
 if(typeof rpc!=="function")throw new TypeError("An atomic Supabase RPC function is required for publication writes");
 const get=async(filters,operation)=>{
  const params=new URLSearchParams({select:SNAPSHOT_SELECT,...filters});
  return list(await request("publish_snapshots",{query:params.toString()}),operation);
 };
 const find=async(id)=>{
  const row=one(await get({id:`eq.${uuid(id,"publish snapshot ID")}`,limit:"2"},"publish snapshot lookup"),"publish snapshot lookup");
  return row?mapSnapshot(row):null;
 };
 return Object.freeze({
  publishExamSession:async({examSessionId,actorUserId,notes=""}={})=>{
   const sessionId=uuid(examSessionId,"exam session ID");
   const actorId=uuid(actorUserId,"publisher user ID");
   const cleanNotes=text(notes,"Snapshot notes",{allowEmpty:true});
   const result=await rpc("publish_exam_session_snapshot",{
    p_exam_session_id:sessionId,
    p_actor_user_id:actorId,
    p_notes:cleanNotes
   });
   return find(rpcId(result));
  },
  rollbackPublishSnapshot:async({publishSnapshotId,actorUserId,reason}={})=>{
   const snapshotId=uuid(publishSnapshotId,"publish snapshot ID");
   const actorId=uuid(actorUserId,"rollback actor user ID");
   const cleanReason=text(reason,"Rollback reason");
   const result=await rpc("rollback_publish_snapshot",{
    p_snapshot_id:snapshotId,
    p_actor_user_id:actorId,
    p_reason:cleanReason
   });
   return find(rpcId(result));
  },
  listPublishSnapshots:async()=>{
   const rows=await get({order:"created_at.desc"},"publish snapshot list");
   return rows.map(mapSnapshot);
  },
  findPublishSnapshotById:find
 });
};
