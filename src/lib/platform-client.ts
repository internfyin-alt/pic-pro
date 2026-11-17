'use client';
import {createClient} from '@supabase/supabase-js';
let instance: ReturnType<typeof createClient> | undefined;
export function browserDb() {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key) throw new Error('Connect Supabase to enable accounts. See SETUP.md.');
 return instance ||= createClient(url,key);
}
export async function api(path:string, init:RequestInit={}) {
 const {data}=await browserDb().auth.getSession();
 const response=await fetch('/api/platform/'+path,{...init,headers:{'Content-Type':'application/json',Authorization:'Bearer '+(data.session?.access_token||''),...init.headers},cache:'no-store'});
 const result=await response.json();
 if(!response.ok) throw new Error(result.error||'The request could not be completed.');
 return result;
}
export type EventRecord={id:string;slug:string;title:string;event_type:string;event_date:string;location:string;description:string;published:boolean;downloads_enabled:boolean;expires_at:string|null;has_pin?:boolean;status:string};
export type PhotoRecord={id:string;filename:string;bytes:number;status:string;face_count:number;error:string|null;url?:string};
