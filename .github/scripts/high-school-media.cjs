'use strict';
const {createHash}=require('node:crypto');
const {isMediaUrl}=require('./high-school-lib/high-school-media-evidence');
const {plain}=require('./high-school-lib/high-school-external');
const LISTING='https://news.zhibo8.com/nba/';
function parseMediaListing(html,names){
 const result=new Map();
 for(const match of String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  let url;try{url=new URL(match[1].replace(/&amp;/g,'&'),LISTING).href;}catch{continue;}
  const title=plain(match[2]);
  if(isMediaUrl(url)&&names.some(name=>title.includes(name))&&!/预告|回顾|场均|上赛季/.test(title))result.set(url,{url,title});
 }
 return [...result.values()].slice(0,12);
}
function parseMediaPage(input,sourceUrl){
 if(!isMediaUrl(sourceUrl))return null;
 const html=String(input).replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
 const title=plain(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]||'');
 const stamp=/(?:class=["'][^"']*(?:createtime|media-time)[^"']*["'][^>]*>|ms-controller=["']title_controller["'][^>]*>)\s*(20\d\d-\d\d-\d\d \d\d:\d\d:\d\d)/i.exec(html)?.[1];
 const opening=/<div\b(?=[^>]*\bid=["']content["'])[^>]*>/i.exec(html);
 if(!title||!stamp||!opening)return null;
 let depth=1,end=null;
 const rest=html.slice(opening.index+opening[0].length);
 for(const tag of rest.matchAll(/<\/?div\b[^>]*>/gi)){
  depth+=/^<\//.test(tag[0])?-1:1;
  if(depth===0){end=tag.index;break;}
 }
 if(end==null)return null;
 const paragraphs=[...rest.slice(0,end).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
  .map(m=>plain(m[1])).filter(p=>p&&!/^视频来源|^图片来源|^点击/.test(p));
 if(!paragraphs.length||paragraphs.length>12||paragraphs.join('\n').length>4000)return null;
 const instant=new Date(stamp.replace(' ','T')+'+08:00');if(!Number.isFinite(instant.getTime()))return null;
 return {sourceUrl,title,publishedAt:instant.toISOString(),paragraphs,
  bodyHash:createHash('sha256').update(paragraphs.join('\n')).digest('hex')};
}
module.exports={LISTING,parseMediaListing,parseMediaPage};
