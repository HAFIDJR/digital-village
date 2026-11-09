// Integration smoke test against a disposable, seeded dev database and upload directory.
// Start the dev server with isolated PGLITE_DATA_DIR and UPLOAD_ROOT, run db:seed,
// then execute: node tests/workflow.integration.mjs. This test creates a request.
import assert from 'node:assert/strict';
const root=process.env.TEST_BASE_URL ?? 'http://localhost:3000';
async function req(path,{cookie,body,method='GET'}={}) { let headers = {}; if(cookie) headers.cookie=cookie; if (body && !(body instanceof FormData)) { headers['content-type']='application/json'; body=JSON.stringify(body); } const r=await fetch(root+path,{method,headers,body}); let data=await r.json(); return {r,data}; }
async function login(path,body) { const {r,data}=await req(path,{method:'POST',body}); assert.equal(r.status,200,JSON.stringify(data)); return r.headers.get('set-cookie').split(';')[0]; }
const staff = await login('/api/auth/login',{email:'operator@sukamaju.desa.id',password:'sukamaju-2026',station:'Verifikasi Berkas'});
const kades = await login('/api/auth/login',{email:'kades@sukamaju.desa.id',password:'sukamaju-2026',station:'Ruang Kepala Desa'});
const resident = await login('/api/auth/warga/login',{nik:'3204160101801234',password:'warga-sukamaju-2026'});
let x=await req('/api/requests/bulk-assignment'); assert.equal(x.r.status,401);
x=await req('/api/requests/bulk-assignment',{cookie:resident}); assert.equal(x.r.status,403);
x=await req('/api/requests/bulk-assignment',{cookie:kades}); assert.equal(x.r.status,403);
const staffList=(await req('/api/requests/bulk-assignment',{cookie:staff})).data.staff;
const types=(await req('/api/warga/letter-types',{cookie:resident})).data.letterTypes;
const type=types.find(t=>t.code==='SKD');
const form=new FormData(); form.set('letterTypeId',type.id); form.set('purpose','Pengurusan administrasi keluarga'); form.set('payload','{}');
for(const d of type.requirements.filter(d=>d.mandatory)) form.set('file:'+d.docKey,new File(['%PDF-1.4\nexample'],d.docKey+'.pdf',{type:'application/pdf'}));
x=await req('/api/requests',{cookie:resident,method:'POST',body:form}); assert.equal(x.r.status,200,JSON.stringify(x.data)); const id=x.data.request.id;
let rows=(await req('/api/requests?pageSize=50',{cookie:staff})).data.rows; let row=rows.find(r=>r.id===id); assert.ok(row);
const other=rows.find(r=>r.id!==id); assert.ok(other);
x=await req(`/api/warga/requests/${other.id}/resubmission`,{cookie:resident}); assert.equal(x.r.status,404);
const target=staffList.find(s=>s.id!==row.assignedStaffId).id;
let snapshot={id:row.id,status:row.status,assignedStaffId:row.assignedStaffId,updatedAt:row.updatedAt};
x=await req('/api/requests/bulk-assignment',{cookie:staff,method:'POST',body:{staffId:target,requests:[snapshot,{...snapshot,id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}]}}); assert.equal(x.r.status,200,JSON.stringify(x.data)); assert.deepEqual(x.data.results.map(r=>r.outcome).sort(),['failed','updated']);
x=await req('/api/requests/bulk-assignment',{cookie:staff,method:'POST',body:{staffId:target,requests:[snapshot]}}); assert.equal(x.data.results[0].outcome,'failed');
row=(await req('/api/requests?pageSize=50',{cookie:staff})).data.rows.find(r=>r.id===id); snapshot={id:row.id,status:row.status,assignedStaffId:row.assignedStaffId,updatedAt:row.updatedAt};
x=await req('/api/requests/bulk-assignment',{cookie:staff,method:'POST',body:{staffId:target,requests:[snapshot]}}); assert.equal(x.data.results[0].outcome,'unchanged');
let detail=(await req('/api/requests/'+id,{cookie:staff})).data; const ktp=detail.attachments.find(a=>a.docKey==='KTP');
x=await req(`/api/requests/${id}/verify`,{cookie:staff,method:'POST',body:{action:'minta_perbaikan',note:'KTP tidak jelas',attachments:[{attachmentId:ktp.id,status:'BURAM',defectNote:'Tulisan tidak terbaca'}]}}); assert.equal(x.r.status,200,JSON.stringify(x.data));
x=await req(`/api/warga/requests/${id}/resubmission`,{cookie:resident}); assert.equal(x.r.status,200,JSON.stringify(x.data)); assert.equal(x.data.documents[0].note,'Tulisan tidak terbaca'); const version=x.data.version;
let bad=new FormData();bad.set('version',version);bad.set('file:KK',new File(['%PDF-1.4'], 'KK.pdf',{type:'application/pdf'})); x=await req(`/api/warga/requests/${id}/resubmission`,{cookie:resident,method:'POST',body:bad});assert.equal(x.r.status,409);
const malformed=new FormData(); malformed.set('version',version); malformed.set('file:KTP',new File(['not a pdf'], 'KTP.pdf',{type:'application/pdf'})); x=await req(`/api/warga/requests/${id}/resubmission`,{cookie:resident,method:'POST',body:malformed}); assert.equal(x.r.status,422);
const create=()=> {const f=new FormData();f.set('version',version);f.set('file:KTP',new File(['%PDF-1.4\nreplacement'],'KTP.pdf',{type:'application/pdf'}));return f;};
const results=await Promise.all([req(`/api/warga/requests/${id}/resubmission`,{cookie:resident,method:'POST',body:create()}),req(`/api/warga/requests/${id}/resubmission`,{cookie:resident,method:'POST',body:create()})]); assert.deepEqual(results.map(o=>o.r.status).sort(),[200,409]);
detail=(await req('/api/requests/'+id,{cookie:staff})).data; assert.equal(detail.status,'PENDING_VERIFIKASI'); assert.equal(detail.attachments.find(a=>a.docKey==='KTP').status,'MENUNGGU_VERIFIKASI'); assert.equal(detail.attachmentHistory.find(a=>a.id===ktp.id).defectNote,'Tulisan tidak terbaca');
x=await req(`/api/requests/${id}/verify`,{cookie:staff,method:'POST',body:{action:'setujui',attachments:[{attachmentId:ktp.id,status:'LENGKAP'}]}}); assert.equal(x.r.status,400);
x=await req(`/api/requests/${id}/verify`,{cookie:staff,method:'POST',body:{action:'setujui'}});assert.equal(x.r.status,409,JSON.stringify(x.data));
x=await req(`/api/requests/${id}/verify`,{cookie:staff,method:'POST',body:{action:'setujui',attachments:[{attachmentId:detail.attachments.find(a=>a.docKey==='KTP').id,status:'LENGKAP'}]}});assert.equal(x.r.status,200,JSON.stringify(x.data));
console.log('PASS bulk partial/stale/no-op, access control, resident correction, concurrent submit, history and re-verification');
