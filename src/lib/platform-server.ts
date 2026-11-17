import {createHash,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {adminDb} from '@/lib/supabase';
import {RekognitionClient,CreateCollectionCommand,IndexFacesCommand,SearchFacesByImageCommand,DetectFacesCommand,DeleteFacesCommand,DeleteCollectionCommand} from '@aws-sdk/client-rekognition';
import sharp from 'sharp';

export class HttpError extends Error {constructor(public status:number,message:string){super(message)}}
export const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function pinHash(pin:string){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(pin,salt,32).toString('hex')}
export function checkPin(pin:string,stored:string){const [salt,value]=stored.split(':');const actual=scryptSync(pin,salt,32);const expected=Buffer.from(value,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected)}
export function must<T>(result:{data:T;error:{message:string}|null}):NonNullable<T> {if(result.error)throw new Error(result.error.message);return result.data!}
export async function actor(request:Request){
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!token)throw new HttpError(401,'Please sign in.');
 const db=adminDb();const {data,error}=await db.auth.getUser(token);
 if(error||!data.user)throw new HttpError(401,'Your session expired. Please sign in again.');
 const profile=must(await db.from('profiles').select('*').eq('id',data.user.id).single());
 if(profile.suspended)throw new HttpError(403,'This account is suspended. Contact the studio.');
 return {...profile,email:data.user.email};
}
export async function owned(request:Request,id:string){const user=await actor(request);const event=must(await adminDb().from('events').select('*').eq('id',id).maybeSingle());if(!event||(event.owner_id!==user.id&&user.role!=='super_admin'))throw new HttpError(404,'Event not found.');return {user,event}}
export async function audit(actorId:string|null,action:string,eventId:string|null=null,details:Record<string,unknown>={}){must(await adminDb().from('audit_logs').insert({actor_id:actorId,action,event_id:eventId,details}))}
export async function limit(key:string,max:number,seconds:number){if(!must(await adminDb().rpc('take_rate_limit',{p_key:key,p_limit:max,p_seconds:seconds})))throw new HttpError(429,'Too many requests. Please try again later.')}
export function ipKey(request:Request){return hash(request.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown')}
export function json(value:unknown,status=200){return NextResponse.json(value,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}})}
export async function readBody(request:Request,maximum:number){if(Number(request.headers.get('content-length'))>maximum)throw new HttpError(413,'Request is too large.');const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'Request body required.');const chunks:Uint8Array[]=[];let total=0;try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maximum){await reader.cancel();throw new HttpError(413,'Request is too large.')}chunks.push(value)}}finally{reader.releaseLock()}return new Uint8Array(Buffer.concat(chunks,total))}
export async function readJson(request:Request){try{return JSON.parse(Buffer.from(await readBody(request,65536)).toString('utf8'))}catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'Invalid JSON body.')}}
export function failure(error:unknown){if(error instanceof HttpError)return json({error:error.message},error.status);if(error instanceof Error&&error.name==='ZodError')return json({error:'Please check the fields and try again.'},400);console.error('Platform request failed:',error instanceof Error?error.message:'unknown');return json({error:'The service could not complete this request. Check server configuration and try again.'},503)}
export function recognition(){if(!process.env.AWS_REGION)throw new HttpError(503,'Face matching is awaiting AWS configuration.');return new RekognitionClient({region:process.env.AWS_REGION})}
export const collection=(eventId:string)=>'picpro-'+eventId;
export async function processPhoto(eventId?:string){
 const db=adminDb();const photos=must(await db.rpc('claim_photo',{p_event:eventId||null}));const photo=photos?.[0];if(!photo)return null;
 try {
  const client=recognition();try{await client.send(new CreateCollectionCommand({CollectionId:collection(photo.event_id)}))}catch(e){if((e as Error).name!=='ResourceAlreadyExistsException')throw e}
  const file=must(await db.storage.from('event-photos').download(photo.storage_path));
  const image=await sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:60000000}).rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
  const result=await client.send(new IndexFacesCommand({CollectionId:collection(photo.event_id),Image:{Bytes:image},ExternalImageId:photo.id,MaxFaces:100,QualityFilter:'AUTO',DetectionAttributes:['DEFAULT']}));
  const ids=(result.FaceRecords||[]).flatMap(x=>x.Face?.FaceId?[x.Face.FaceId]:[]);
  must(await db.from('event_photos').update({status:'ready',face_ids:ids,face_count:ids.length,error:null,locked_at:null}).eq('id',photo.id).eq('status','processing'));
  await audit(null,'photo.indexed',photo.event_id,{photo_id:photo.id,faces:ids.length});return {id:photo.id,status:'ready'};
 }catch(error){console.error('Photo processing failed:',error instanceof Error?error.name:'unknown');must(await db.from('event_photos').update({status:'failed',locked_at:null,error:'Processing failed. Check AWS configuration or retry this photo.'}).eq('id',photo.id).eq('status','processing'));return {id:photo.id,status:'failed'}}
}
export async function matches(eventId:string,bytes:Uint8Array){const client=recognition();const detected=await client.send(new DetectFacesCommand({Image:{Bytes:bytes},Attributes:['DEFAULT']}));if(detected.FaceDetails?.length!==1)throw new HttpError(400,'Use a clear selfie containing exactly one face.');try{const result=await client.send(new SearchFacesByImageCommand({CollectionId:collection(eventId),Image:{Bytes:bytes},FaceMatchThreshold:97,MaxFaces:4096,QualityFilter:'AUTO'}));return [...new Set((result.FaceMatches||[]).flatMap(x=>x.Face?.ExternalImageId?[x.Face.ExternalImageId]:[]))]}catch(error){if((error as Error).name==='ResourceNotFoundException')return [];throw error}}
export async function deletePhoto(photo:{id:string;event_id:string;storage_path:string;face_ids:string[]}){
 const db=adminDb();const current=must(await db.from('event_photos').select('status').eq('id',photo.id).single());if(current.status==='processing')throw new HttpError(409,'This photo is processing. Wait for it to finish before deleting.');
 const claimed=must(await db.from('event_photos').update({status:'deleting'}).eq('id',photo.id).neq('status','processing').select('id').maybeSingle());if(!claimed)throw new HttpError(409,'This photo started processing. Try deletion again when it finishes.');
 if(photo.face_ids.length)await recognition().send(new DeleteFacesCommand({CollectionId:collection(photo.event_id),FaceIds:photo.face_ids}));
 must(await db.storage.from('event-photos').remove([photo.storage_path]));must(await db.from('event_photos').delete().eq('id',photo.id));
}
export async function deleteEvent(id:string){const db=adminDb();must(await db.from('events').update({published:false,status:'deleting'}).eq('id',id));const {count,error}=await db.from('event_photos').select('id',{count:'exact',head:true}).eq('event_id',id).eq('status','processing');if(error)throw error;if(count)throw new HttpError(409,'Deletion paused while photos finish processing. Try deleting again in a few minutes.');
 try{await recognition().send(new DeleteCollectionCommand({CollectionId:collection(id)}))}catch(error){if((error as Error).name!=='ResourceNotFoundException')throw error}
 while(true){const batch=must(await db.from('event_photos').select('id,storage_path').eq('event_id',id).limit(100));if(!batch.length)break;must(await db.storage.from('event-photos').remove(batch.map(x=>x.storage_path)));must(await db.from('event_photos').delete().in('id',batch.map(x=>x.id)))}
 must(await db.from('events').delete().eq('id',id));
}
