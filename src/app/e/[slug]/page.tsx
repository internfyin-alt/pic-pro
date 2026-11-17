import GuestGallery from '@/components/GuestGallery';
export const metadata={title:'Find Your Memories',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Page({params}:{params:Promise<{slug:string}>}){return <GuestGallery slug={(await params).slug}/>}
