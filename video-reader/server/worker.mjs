import {serveDemoVideo} from './media.mjs';
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname==='/assets/video.mp4')return serveDemoVideo(request,env.ASSETS,'/assets/video.mp4');
 return env.ASSETS.fetch(request);
}};
