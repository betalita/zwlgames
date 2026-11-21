'use strict';
const {createHash}=require('node:crypto');
const {isMediaUrl,isHupuUrl,HUPU_AUTHORS}=require('./high-school-lib/high-school-media-evidence');
const {plain}=require('./high-school-lib/high-school-external');
const LISTING='https://news.zhibo8.com/nba/';
const HUPU_LISTINGS=['https://bbs.hupu.com/cba','https://bbs.hupu.com/764'];
function parseMediaListing(html,names,listing=LISTING){
 const result=new Map();
 const hupu=HUPU_LISTINGS.includes(listing);
 const markup=hupu?[...String(html).matchAll(/<li\b[^>]*class=["'][^"']*\bbbs-sl-web-post-body\b[^"']*["'][^>]*>[\s\S]*?<\/li>/gi)]
  .filter(item=>/<div\b[^>]*class=["']post-auth["'][^>]*>\s*<a\b[^>]*href=["']https:\/\/my\.hupu\.com\/27066519444214["']/i.test(item[0]))
  .map(item=>item[0]).join(''):String(html);
 for(const match of markup.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
  let url;try{url=new URL(match[1].replace(/&amp;/g,'&'),listing).href;}catch{continue;}
  const title=plain(match[2]);
  if(isMediaUrl(url)&&isHupuUrl(url)===hupu&&
    (!isHupuUrl(url)||/class=["'][^"']*\bp-title\b/.test(match[0]))&&names.some(name=>title.includes(name))&&!/预告|回顾|场均|上赛季/.test(title))result.set(url,{url,title});
 }
 return [...result.values()].slice(0,12);
}
function parseHupuPage(input,sourceUrl){
 const script=/<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i.exec(input);
 if(!script)return null;
 let thread;
 try{thread=JSON.parse(script[1]).props.pageProps.detail.thread;}catch{return null;}
 const path=new URL(sourceUrl).pathname;
 if(!thread||thread.url!==path||'/' + thread.tid + '.html'!==path||thread.status!==0||
   thread.visibleRange!=='ALL_SEE'||!Object.hasOwn(HUPU_AUTHORS,thread.authorId)||
   !HUPU_AUTHORS[thread.authorId].includes(thread.fid)||typeof thread.content!=='string'||
   typeof thread.title!=='string'||!Number.isInteger(thread.createdAt))return null;
 const title=plain(thread.title),instant=new Date(thread.createdAt);
 const paragraphs=[...thread.content.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
  .map(m=>plain(m[1])).filter(p=>p&&!/^来源[：:]|^视频来源|^图片来源/.test(p));
 if(!title||!Number.isFinite(instant.getTime())||!paragraphs.length||paragraphs.length>12||
   paragraphs.some(p=>p.length>1000)||paragraphs.join('\n').length>4000)return null;
 return {sourceUrl,title,publishedAt:instant.toISOString(),paragraphs,publisher:thread.authorId,board:thread.fid,
  bodyHash:createHash('sha256').update(paragraphs.join('\n')).digest('hex')};
}
function parseMediaPage(input,sourceUrl){
 if(isHupuUrl(sourceUrl))return parseHupuPage(String(input),sourceUrl);
 if(!isMediaUrl(sourceUrl))return null;
 const html=String(input).replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
 const title=plain(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]||'');
 const stamp=/(?:class=["'][^"']*(?:createtime|media-time)[^"']*["'][^>]*>|ms-controller=["']title_controller["'][^>]*>)\s*(20\d\d-\d\d-\d\d \d\d:\d\d:\d\d)/i.exec(html)?.[1];
 const opening=/<div\b(?=[^>]*\bid=["'](?:content|signals)["'])[^>]*>/i.exec(html);
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
module.exports={LISTING,HUPU_LISTINGS,parseMediaListing,parseMediaPage};
