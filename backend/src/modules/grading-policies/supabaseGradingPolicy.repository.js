const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECT_TYPES = new Set(["THEORY", "THEORY_CUM_LAB", "LABORATORY", "NON_CREDIT"]);
const SELECT = "id,regulation_id,subject_type,internal_max,external_max,total_max,internal_min,external_min,total_min,grade_rules,gpa_formula_type,cgpa_formula_type,effective_from,effective_to,is_active,created_at,updated_at";
const requireUuid = (id, field) => {
 if(typeof id!=="string"||!UUID_PATTERN.test(id)) throw new TypeError(`A valid PostgreSQL UUID is required for ${field}`);
 return id;
};
const requireNumber=(value,field,min,max)=>{
 if(typeof value!=="number"||!Number.isFinite(value)||value<min||value>max) throw new TypeError(`${field} must be a number between ${min} and ${max}`);
 return value;
};
const requireText=(value,field)=>{
 if(typeof value!=="string"||!value.trim()) throw new TypeError(`${field} is required`);
 return value.trim();
};
const normalizeDate=(value,field,{nullable=false}={})=>{
 if(nullable&&(value===null||value===undefined))return null;
 const date=value instanceof Date?value:new Date(value);
 if(Number.isNaN(date.getTime()))throw new TypeError(`${field} must be a valid date`);
 return date.toISOString();
};
const normalizeGradeRules=(rules)=>{
 if(!Array.isArray(rules)||rules.length===0)throw new TypeError("At least one grade rule is required");
 const seen=new Set();
 const normalized=rules.map((rule,index)=>{
  const grade=requireText(rule?.grade,`Grade rule ${index+1} grade`).toUpperCase();
  const min=requireNumber(rule.min,`Grade ${grade} minimum`,0,200);
  const max=requireNumber(rule.max,`Grade ${grade} maximum`,0,200);
  const point=requireNumber(rule.point,`Grade ${grade} point`,0,4);
  if(min>max)throw new TypeError(`Grade rule ${grade}: min cannot be greater than max`);
  if(seen.has(grade))throw new TypeError(`Grade label ${grade} must be unique`);
  seen.add(grade);
  return {grade,min,max,point};
 }).sort((a,b)=>a.min-b.min);
 for(let i=1;i<normalized.length;i++){
  if(normalized[i].min<=normalized[i-1].max)throw new TypeError(`Grade ranges for ${normalized[i-1].grade} and ${normalized[i].grade} overlap`);
 }
 return normalized;
};
const validatePolicy=(p)=>{
 if(!SUBJECT_TYPES.has(p.subjectType))throw new TypeError("Invalid subject type");
 for(const [field,max] of [["internalMax",100],["externalMax",100],["totalMax",200],["internalMin",100],["externalMin",100],["totalMin",200]])requireNumber(p[field],field,max===200?0:0,max);
 if(p.internalMax+p.externalMax!==p.totalMax)throw new TypeError("Internal max + external max must equal total max");
 if(p.internalMin>p.internalMax)throw new TypeError("Internal minimum cannot be greater than internal maximum");
 if(p.externalMin>p.externalMax)throw new TypeError("External minimum cannot be greater than external maximum");
 if(p.totalMin>p.totalMax)throw new TypeError("Total minimum cannot be greater than total maximum");
 const effectiveFrom=normalizeDate(p.effectiveFrom,"Effective from");
 const effectiveTo=normalizeDate(p.effectiveTo,"Effective to",{nullable:true});
 if(effectiveTo&&new Date(effectiveTo)<new Date(effectiveFrom))throw new TypeError("Effective to cannot be earlier than effective from");
 return {gradeRules:normalizeGradeRules(p.gradeRules),effectiveFrom,effectiveTo};
};
const expectRows=(rows,op)=>{if(!Array.isArray(rows))throw new TypeError(`Supabase ${op} returned an invalid response`);return rows;};
const mapPolicy=(r)=>({
 _id:r.id,id:r.id,regulationId:r.regulation_id,subjectType:r.subject_type,
 internalMax:Number(r.internal_max),externalMax:Number(r.external_max),totalMax:Number(r.total_max),
 internalMin:Number(r.internal_min),externalMin:Number(r.external_min),totalMin:Number(r.total_min),
 gradeRules:r.grade_rules,gpaFormulaType:r.gpa_formula_type,cgpaFormulaType:r.cgpa_formula_type,
 effectiveFrom:r.effective_from,effectiveTo:r.effective_to??null,isActive:r.is_active,
 regulation:r.regulation??null,createdAt:r.created_at??null,updatedAt:r.updated_at??null
});
const buildBody=(p)=>{
 const validated=validatePolicy(p);
 return {
  regulation_id:requireUuid(p.regulationId,"regulation ID"),subject_type:p.subjectType,
  internal_max:p.internalMax,external_max:p.externalMax,total_max:p.totalMax,
  internal_min:p.internalMin,external_min:p.externalMin,total_min:p.totalMin,
  grade_rules:validated.gradeRules,
  gpa_formula_type:typeof p.gpaFormulaType==="string"&&p.gpaFormulaType.trim()?p.gpaFormulaType.trim().toUpperCase():"CBCS",
  cgpa_formula_type:typeof p.cgpaFormulaType==="string"&&p.cgpaFormulaType.trim()?p.cgpaFormulaType.trim().toUpperCase():"CBCS",
  effective_from:validated.effectiveFrom,effective_to:validated.effectiveTo,
  ...(p.isActive===undefined?{}:{is_active:typeof p.isActive==="boolean"?p.isActive:(()=>{throw new TypeError("Active status must be a boolean")})()})
 };
};
/** Isolated Supabase grading policy adapter; not wired to production routes. */
export const createSupabaseGradingPolicyRepository=({request}={})=>{
 if(typeof request!=="function")throw new TypeError("A server-side Supabase request function is required");
 const findOne=async(id,op)=>{
  const query=new URLSearchParams({select:SELECT+",regulation:regulations(id,code,name,effective_from_batch_year,effective_to_batch_year,is_active)",id:`eq.${id}`,limit:"2"}).toString();
  const rows=expectRows(await request("grading_policies",{query}),op);
  if(rows.length>1)throw new Error(`Supabase ${op} returned multiple grading policies`);
  return rows.length?mapPolicy(rows[0]):null;
 };
 return Object.freeze({
  listGradingPolicies:async()=>{
   const query=new URLSearchParams({select:SELECT+",regulation:regulations(id,code,name,effective_from_batch_year,effective_to_batch_year,is_active)",order:"created_at.desc"}).toString();
   return expectRows(await request("grading_policies",{query}),"grading policy list").map(mapPolicy);
  },
  findGradingPolicyById:async(id)=>{requireUuid(id,"grading policy ID");return findOne(id,"grading policy lookup");},
  createGradingPolicy:async(payload={})=>{
   const body=buildBody({...payload,isActive:true});
   const rows=expectRows(await request("grading_policies",{method:"POST",query:`select=${SELECT}`,body,prefer:"return=representation"}),"grading policy create");
   if(rows.length!==1)throw new Error("Supabase grading policy create did not return exactly one policy");
   return mapPolicy(rows[0]);
  },
  updateGradingPolicy:async(id,payload={})=>{
   requireUuid(id,"grading policy ID");
   const current=await findOne(id,"grading policy update lookup");
   if(!current)return null;
   const merged={
    regulationId:payload.regulationId??current.regulationId,subjectType:payload.subjectType??current.subjectType,
    internalMax:payload.internalMax??current.internalMax,externalMax:payload.externalMax??current.externalMax,totalMax:payload.totalMax??current.totalMax,
    internalMin:payload.internalMin??current.internalMin,externalMin:payload.externalMin??current.externalMin,totalMin:payload.totalMin??current.totalMin,
    gradeRules:payload.gradeRules??current.gradeRules,gpaFormulaType:payload.gpaFormulaType??current.gpaFormulaType,
    cgpaFormulaType:payload.cgpaFormulaType??current.cgpaFormulaType,effectiveFrom:payload.effectiveFrom??current.effectiveFrom,
    effectiveTo:payload.effectiveTo===undefined?current.effectiveTo:payload.effectiveTo,
    isActive:payload.isActive===undefined?current.isActive:payload.isActive
   };
   const body=buildBody(merged);
   const rows=expectRows(await request("grading_policies",{method:"PATCH",query:new URLSearchParams({id:`eq.${id}`,select:SELECT}).toString(),body,prefer:"return=representation"}),"grading policy update");
   if(rows.length>1)throw new Error("Supabase grading policy update matched multiple rows");
   return rows.length?mapPolicy(rows[0]):null;
  },
  toggleGradingPolicyStatus:async(id)=>{
   requireUuid(id,"grading policy ID");
   const current=await findOne(id,"grading policy status lookup");
   if(!current)return null;
   const rows=expectRows(await request("grading_policies",{method:"PATCH",query:new URLSearchParams({id:`eq.${id}`,select:SELECT}).toString(),body:{is_active:!current.isActive},prefer:"return=representation"}),"grading policy status update");
   if(rows.length>1)throw new Error("Supabase grading policy status update matched multiple rows");
   return rows.length?mapPolicy(rows[0]):null;
  }
 });
};
