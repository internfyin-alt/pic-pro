export const brand = {name:'PIC PRO VIDEOGRAPHY',tagline:'Every Love Story Deserves a Cinematic Frame.'};
export const photo=(id:string,w=1200)=>`https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=85`;
// Photography is sample imagery, not claimed client work. Replace with licensed studio images before publishing.
export const photos = [
 {id:1,title:'A Beautiful Beginning',category:'Wedding',image:photo('photo-1519741497674-611481863552'),shape:'tall'},
 {id:2,title:'Golden Hour Romance',category:'Pre-Wedding',image:photo('photo-1537633552985-df8429e8048b'),shape:'normal'},
 {id:3,title:'The Wedding Vows',category:'Wedding',image:photo('photo-1511285560929-80b456fea0bc'),shape:'normal'},
 {id:4,title:'Forever in Bloom',category:'Engagement',image:photo('photo-1523438885200-e635ba2c371e'),shape:'tall'},
 {id:5,title:'Moments of Joy',category:'Candid',image:photo('photo-1511795409834-ef04bbd61622'),shape:'normal'},
 {id:6,title:'A Timeless Promise',category:'Pre-Wedding',image:photo('photo-1515934751635-c81c6bc9a2d8'),shape:'normal'},
 {id:7,title:'The Celebration',category:'Wedding',image:photo('photo-1464366400600-7168b8af9bc3'),shape:'normal'},
 {id:8,title:'Love in Every Detail',category:'Bridal',image:photo('photo-1529636798458-92182e662485'),shape:'tall'},
 {id:9,title:'A Day to Remember',category:'Reception',image:photo('photo-1507504031003-b417219a0fde'),shape:'normal'},
];
export const services=[
 {slug:'wedding-photography',title:'Wedding Photography',description:'Every ritual, every emotion, every once-in-a-lifetime detail—captured with intention.',image:photo('photo-1519741497674-611481863552'),icon:'camera'},
 {slug:'wedding-videography',title:'Wedding Videography',description:'Beautifully filmed celebrations that let you relive it all.',image:photo('photo-1511285560929-80b456fea0bc'),icon:'video'},
 {slug:'wedding-cinematography',title:'Wedding Cinematography',description:'Your celebration, transformed into an unforgettable love story on film.',image:photo('photo-1511795409834-ef04bbd61622'),icon:'film'},
 {slug:'pre-wedding-photography',title:'Pre-Wedding Shoots',description:'Beautiful, effortless portraits of the two of you, exactly as you are.',image:photo('photo-1537633552985-df8429e8048b'),icon:'heart'},
 {slug:'candid-photography',title:'Candid Photography',description:'The happy tears, stolen glances and laughter between the big moments.',image:photo('photo-1523438885200-e635ba2c371e'),icon:'aperture'},
 {slug:'engagement-photography',title:'Engagement Photography',description:'A joyful chapter worth celebrating in gorgeous frames.',image:photo('photo-1515934751635-c81c6bc9a2d8'),icon:'gem'},
 {slug:'haldi-mehndi-photography',title:'Haldi & Mehndi',description:'All the bright colour and laughter of your wedding festivities.',image:photo('photo-1464366400600-7168b8af9bc3'),icon:'sun'},
 {slug:'drone-videography',title:'Drone Videography',description:'Spectacular aerial perspectives, subject to venue and local permissions.',image:photo('photo-1507504031003-b417219a0fde'),icon:'plane'},
 {slug:'wedding-albums',title:'Wedding Albums',description:'Thoughtfully designed keepsakes to hold your favourite memories.',image:photo('photo-1529636798458-92182e662485'),icon:'book'},
];
export const packages=[
 {name:'Essential Wedding',eyebrow:'THE CLASSIC',description:'Thoughtful coverage for intimate celebrations.',features:['Personalised consultation','Flexible event coverage','Photography-focused options','Professional editing options','Custom delivery choices']},
 {name:'Signature Wedding',eyebrow:'MOST REQUESTED',description:'For every feeling, detail and celebration.',features:['Personalised creative planning','Photography & videography options','Candid moments coverage','Wedding highlight film options','Album design options']},
 {name:'Royal Cinematic',eyebrow:'THE EXPERIENCE',description:'An elevated cinematic storytelling experience.',features:['Tailored multi-event planning','Cinematic film options','Additional creative crew options','Aerial coverage on request','Premium album options']}
];
export const posts=[
 {slug:'choosing-a-wedding-photographer',title:'How to Choose the Right Wedding Photographer',category:'WEDDING GUIDE',image:photo('photo-1519741497674-611481863552'),intro:'Your wedding photographs will stay with you long after the celebration. Here is how to choose a photographer whose work feels like you.'},
 {slug:'candid-vs-traditional',title:'Candid vs Traditional Wedding Photography',category:'PHOTOGRAPHY TIPS',image:photo('photo-1523438885200-e635ba2c371e'),intro:'Both styles have their own beauty. Discover what makes each approach special and why many couples choose a combination.'},
 {slug:'pre-wedding-shoot-ideas',title:'Beautiful Pre-Wedding Shoot Ideas',category:'INSPIRATION',image:photo('photo-1537633552985-df8429e8048b'),intro:'From quiet sunrise portraits to relaxed city walks, the best session is the one that feels authentic to your story.'}
];
