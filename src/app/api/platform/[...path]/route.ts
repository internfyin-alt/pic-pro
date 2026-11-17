import {NextRequest} from 'next/server';
import {randomBytes,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import QRCode from 'qrcode';
import sharp from 'sharp';
import {adminDb} from '@/lib/supabase';
import {actor,owned,must,audit,limit,ipKey,json,failure,HttpError,pinHash,checkPin,hash,processPhoto,matches,deletePhoto,deleteEvent,readBody,readJson} from '@/lib/platform-server';

export const runtime='nodejs';
export const maxDuration=60;
type Context={params:Promise<{path:string[]}>};
const uuid=z.string().uuid();
const eventInput=z.object({title:z.string().trim().min(1).max(120),event_type:z.enum(['Wedding','Engagement','Birthday','Corporate','College','Festival','Other']),event_date:z.string().date().nullable().optional(),location:z.string().trim().max(200).default(''),description:z.string().trim().max(2000).default(''),published:z.boolean().default(false),downloads_enabled:z.boolean().default(true),pin:z.string().regex(/^\d{4,8}$/).or(z.literal('')).optional(),expires_at:z.string().datetime().nullable().optional()});
function safeEvent(event:Record<string,unknown>){const {pin_hash,...rest}=event;return {...rest,has_pin:!!pin_hash}}
async function liveEvent(slug:string){const event=must(await adminDb().from('events').select('*,profiles!owner_id(suspended)').eq('slug',slug).eq('published',true).eq('status','active').maybeSingle());if(!event||event.profiles?.suspended||(event.expires_at&&new Date(event.expires_at)<=new Date()))throw new HttpError(404,'This gallery is unavailable or has expired.');return event}
async function guestSession(req:NextRequest,slug:string){const event=await liveEvent(slug);const token=req.cookies.get('picpro_guest_'+slug)?.value;if(!token)throw new HttpError(401,'Take a selfie to start a new matching session.');const session=must(await adminDb().from('guest_sessions').select('*').eq('token_hash',hash(token)).eq('event_id',event.id).gt('expires_at',new Date().toISOString()).maybeSingle());if(!session)throw new HttpError(401,'Your session has expired. Take another selfie.');return {session,event}}
async function admin(req:Request){const user=await actor(req);if(user.role!=='super_admin')throw new HttpError(403,'Super administrator access required.');return user}
export async function GET(req:NextRequest,context:Context){try{
 const p=(await context.params).path;const db=adminDb();
 if(p[0]==='me'){const user=await actor(req);return json({user})}
 if(p[0]==='events'){
  if(!p[1]){const user=await actor(req);return json({events:must(await db.from('events').select('*').eq('owner_id',user.id).order('created_at',{ascending:false})).map(safeEvent)})}
  const id=uuid.parse(p[1]);const {event}=await owned(req,id);
  if(p[2]==='qr'){const origin=process.env.NEXT_PUBLIC_SITE_URL;if(!origin)throw new HttpError(503,'Set NEXT_PUBLIC_SITE_URL before sharing QR codes.');const url=new URL('/e/'+event.slug,origin).href;return json({url,qr:await QRCode.toDataURL(url,{width:900,margin:3,color:{dark:'#151515',light:'#ffffff'},errorCorrectionLevel:'M'})})}
  if(p[2]==='photos'){
   const page=Math.max(0,Number(req.nextUrl.searchParams.get('page'))||0);const photos=must(await db.from('event_photos').select('*').eq('event_id',id).order('created_at',{ascending:false}).range(page*60,page*60+59));
   const signed=photos.length?must(await db.storage.from('event-photos').createSignedUrls(photos.map(x=>x.storage_path),120)):[];
   const counts=await Promise.all(['uploading','queued','processing','ready','failed','deleting'].map(async status=>{const result=await db.from('event_photos').select('id',{count:'exact',head:true}).eq('event_id',id).eq('status',status);if(result.error)throw result.error;return [status,result.count||0]}));
   return json({photos:photos.map((photo,i)=>({...photo,url:signed[i]?.signedUrl})),counts:Object.fromEntries(counts)})
  }
  const stats=must(await db.rpc('event_statistics',{p_event:id}));return json({event:safeEvent(event),stats})
 }
 if(p[0]==='guest'){
  const slug=z.string().regex(/^[a-f0-9]{36}$/).parse(p[1]);
  if(p[2]==='session'){
   const {session,event}=await guestSession(req,slug);await limit('results:'+session.id,120,3600);const results:{id:string;filename:string;url:string}[]=[];
   for(let start=0;start<session.photo_ids.length;start+=100){const ids=session.photo_ids.slice(start,start+100);const photos=must(await db.from('event_photos').select('id,filename,storage_path').eq('event_id',event.id).eq('status','ready').in('id',ids));if(!photos.length)continue;const signed=must(await db.storage.from('event-photos').createSignedUrls(photos.map(x=>x.storage_path),60));for(let i=0;i<photos.length;i++){if(signed[i]?.signedUrl)results.push({id:photos[i].id,filename:photos[i].filename,url:signed[i].signedUrl!})}}
   return json({photos:results,downloads_enabled:event.downloads_enabled,expires_at:session.expires_at})
  }
  if(p[2]==='download'){
   const {session,event}=await guestSession(req,slug);if(!event.downloads_enabled)throw new HttpError(403,'Downloads are disabled for this event.');const id=uuid.parse(req.nextUrl.searchParams.get('id'));if(!session.photo_ids.includes(id))throw new HttpError(403,'Photo is not in your matches.');await limit('download:'+session.id,200,3600);
   const photo=must(await db.from('event_photos').select('storage_path,filename').eq('id',id).eq('event_id',event.id).eq('status','ready').single());const file=must(await db.storage.from('event-photos').download(photo.storage_path));await audit(null,'photo.download',event.id,{photo_id:id});return new Response(file,{headers:{'Content-Type':file.type,'Content-Disposition':`attachment; filename="${photo.filename.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})
  }
  const event=await liveEvent(slug);return json({event:{title:event.title,event_type:event.event_type,event_date:event.event_date,location:event.location,description:event.description,has_pin:!!event.pin_hash,downloads_enabled:event.downloads_enabled}})
 }
 if(p[0]==='admin'){await admin(req);const page=z.coerce.number().int().min(0).max(100000).parse(req.nextUrl.searchParams.get('page')||0);const [users,events,logs,settings,stats]=await Promise.all([db.from('profiles').select('*').order('created_at',{ascending:false}).range(page*200,page*200+199),db.from('events').select('*').order('created_at',{ascending:false}).range(page*200,page*200+199),db.from('audit_logs').select('*').order('created_at',{ascending:false}).range(page*100,page*100+99),db.from('platform_settings').select('*').single(),db.rpc('platform_statistics')]);return json({users:must(users),events:must(events).map(safeEvent),logs:must(logs),settings:must(settings),stats:must(stats)})}
 throw new HttpError(404,'Not found.');
 }catch(error){return failure(error)}}

export async function POST(req:NextRequest,context:Context){try{
 const p=(await context.params).path;const db=adminDb();
 if(p[0]==='register'){
  await limit('register:'+ipKey(req),5,3600);const settings=must(await db.from('platform_settings').select('registration_enabled').single());if(!settings.registration_enabled)throw new HttpError(403,'New registrations are currently closed.');
  const input=z.object({email:z.string().email().max(254),password:z.string().min(12).max(128),display_name:z.string().trim().min(1).max(100)}).parse(await readJson(req));
  const publicClient=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false}});const {error}=await publicClient.auth.signUp({email:input.email,password:input.password,options:{data:{display_name:input.display_name}}});if(error)throw new HttpError(400,error.message);return json({message:'Check your email to confirm your account, then sign in.'},201)
 }
 if(p[0]==='events'){
  if(!p[1]){const user=await actor(req);await limit('events:'+user.id,20,3600);const input=eventInput.parse(await readJson(req));const {pin,...rest}=input;const event=must(await db.from('events').insert({...rest,owner_id:user.id,pin_hash:pin?pinHash(pin):null}).select('*').single());await audit(user.id,'event.created',event.id);return json({event:safeEvent(event)},201)}
  const id=uuid.parse(p[1]);const {user,event}=await owned(req,id);if(event.status!=='active')throw new HttpError(409,'This event is being deleted.');
  if(p[2]==='upload'){
   await limit('uploads:'+user.id,600,3600);const input=z.object({filename:z.string().min(1).max(200),bytes:z.number().int().min(1).max(25*1024*1024),type:z.enum(['image/jpeg','image/png'])}).parse(await readJson(req));const photoId=randomUUID();const path=id+'/'+photoId+(input.type==='image/png'?'.png':'.jpg');
   must(await db.rpc('reserve_photo',{p_event:id,p_id:photoId,p_path:path,p_filename:input.filename,p_bytes:input.bytes}));
   try{const signed=must(await db.storage.from('event-photos').createSignedUploadUrl(path));return json({id:photoId,path,token:signed.token},201)}catch(error){await db.from('event_photos').delete().eq('id',photoId);throw error}
  }
  if(p[2]==='complete'){
   const {photo_id}=z.object({photo_id:uuid}).parse(await readJson(req));const photo=must(await db.from('event_photos').select('*').eq('id',photo_id).eq('event_id',id).eq('status','uploading').single());const info=must(await db.storage.from('event-photos').info(photo.storage_path));if(Number(info.metadata?.size)!==Number(photo.bytes))throw new HttpError(400,'Upload size does not match. Delete this photo and upload again.');must(await db.from('event_photos').update({status:'queued'}).eq('id',photo_id).eq('status','uploading'));return json({queued:true})
  }
  if(p[2]==='process'){await limit('process:'+user.id,600,3600);return json({photo:await processPhoto(id)})}
  if(p[2]==='retry'){const {photo_id}=z.object({photo_id:uuid}).parse(await readJson(req));must(await db.from('event_photos').update({status:'queued',attempts:0,error:null}).eq('id',photo_id).eq('event_id',id).eq('status','failed'));return json({ok:true})}
 }
 if(p[0]==='guest'&&p[2]==='match'){
  const slug=z.string().regex(/^[a-f0-9]{36}$/).parse(p[1]);await limit('match-ip:'+ipKey(req),15,3600);const event=await liveEvent(slug);await limit('match-event:'+event.id,500,3600);const settings=must(await db.from('platform_settings').select('matching_enabled').single());if(!settings.matching_enabled)throw new HttpError(503,'Face matching is temporarily paused.');
  if(Number(req.headers.get('content-length'))>5*1024*1024)throw new HttpError(413,'Use a selfie smaller than 4 MB.');const form=await new Response(await readBody(req,5*1024*1024),{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData();if(form.get('consent')!=='biometric-v1')throw new HttpError(400,'Please accept biometric processing consent.');if(event.pin_hash&&!checkPin(z.string().max(8).parse(form.get('pin')||''),event.pin_hash))throw new HttpError(403,'Incorrect event access code.');
  const file=form.get('selfie');if(!(file instanceof File)||file.size>4*1024*1024||!['image/jpeg','image/png'].includes(file.type))throw new HttpError(400,'Choose a JPEG or PNG selfie under 4 MB.');
  const bytes=await sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:20000000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:90}).toBuffer();const photoIds=await matches(event.id,bytes);
  const token=randomBytes(32).toString('hex');const old=req.cookies.get('picpro_guest_'+slug)?.value;if(old)must(await db.from('guest_sessions').delete().eq('token_hash',hash(old)));
  must(await db.from('guest_sessions').insert({event_id:event.id,token_hash:hash(token),consent_version:'biometric-v1',photo_ids:photoIds}));await audit(null,'guest.match',event.id,{matches:photoIds.length});const response=json({count:photoIds.length});response.cookies.set('picpro_guest_'+slug,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/platform/guest/'+slug,maxAge:3600});return response
 }
 if(p[0]==='jobs'){
  if(!process.env.CRON_SECRET||req.headers.get('authorization')!=='Bearer '+process.env.CRON_SECRET)throw new HttpError(401,'Unauthorized.');
  // Small batches stay below request duration; invoke every minute with an external scheduler.
  const results=[];for(let i=0;i<3;i++){const photo=await processPhoto();if(!photo)break;results.push(photo)}
  must(await db.from('guest_sessions').delete().lt('expires_at',new Date().toISOString()));must(await db.from('rate_limits').delete().lt('expires_at',new Date().toISOString()));
  const abandoned=must(await db.from('event_photos').select('*').eq('status','uploading').lt('created_at',new Date(Date.now()-3*3600000).toISOString()).limit(100));for(const photo of abandoned)await deletePhoto(photo);
  return json({processed:results})
 }
 throw new HttpError(404,'Not found.');
 }catch(error){return failure(error)}}

export async function PATCH(req:NextRequest,context:Context){try{
 const p=(await context.params).path;const db=adminDb();
 if(p[0]==='me'){const user=await actor(req);const input=z.object({display_name:z.string().trim().min(1).max(100)}).parse(await readJson(req));must(await db.from('profiles').update(input).eq('id',user.id));return json({ok:true})}
 if(p[0]==='events'){const id=uuid.parse(p[1]);const {user,event}=await owned(req,id);if(event.status!=='active')throw new HttpError(409,'Event is being deleted.');const {pin,...input}=eventInput.partial().parse(await readJson(req));must(await db.from('events').update({...input,...(pin!==undefined?{pin_hash:pin?pinHash(pin):null}:{})}).eq('id',id));if(pin!==undefined||input.published===false||input.expires_at!==undefined)must(await db.from('guest_sessions').delete().eq('event_id',id));await audit(user.id,'event.updated',id);return json({ok:true})}
 if(p[0]==='admin'){
  const user=await admin(req);
  if(p[1]==='settings'){const input=z.object({registration_enabled:z.boolean(),matching_enabled:z.boolean(),max_photos_per_event:z.number().int().min(1).max(50000)}).parse(await readJson(req));must(await db.from('platform_settings').update(input).eq('id',true));await audit(user.id,'settings.updated',null,input);return json({ok:true})}
  if(p[1]==='users'){const input=z.object({id:uuid,suspended:z.boolean()}).parse(await readJson(req));if(input.id===user.id)throw new HttpError(400,'You cannot suspend your own account.');must(await db.from('profiles').update({suspended:input.suspended}).eq('id',input.id).neq('role','super_admin'));await audit(user.id,'account.updated',null,input);return json({ok:true})}
 }
 throw new HttpError(404,'Not found.');
 }catch(error){return failure(error)}}

export async function DELETE(req:NextRequest,context:Context){try{
 const p=(await context.params).path;const db=adminDb();
 if(p[0]==='guest'){const slug=z.string().regex(/^[a-f0-9]{36}$/).parse(p[1]);const token=req.cookies.get('picpro_guest_'+slug)?.value;if(token)must(await db.from('guest_sessions').delete().eq('token_hash',hash(token)));const response=json({ok:true});response.cookies.set('picpro_guest_'+slug,'',{httpOnly:true,path:'/api/platform/guest/'+slug,maxAge:0});return response}
 if(p[0]==='events'){const id=uuid.parse(p[1]);const {user}=await owned(req,id);if(p[2]==='photos'){const photo=must(await db.from('event_photos').select('*').eq('id',uuid.parse(p[3])).eq('event_id',id).single());await deletePhoto(photo);await audit(user.id,'photo.deleted',id,{photo_id:photo.id})}else{await deleteEvent(id);await audit(user.id,'event.deleted',id)}return json({ok:true})}
 throw new HttpError(404,'Not found.');
 }catch(error){return failure(error)}}
