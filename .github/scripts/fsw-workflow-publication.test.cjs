'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');

test('FSW publication preserves another collector commit made after checkout',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fsw-workflow-publish-'));
 const env={...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
 function git(cwd,...args){
  const r=spawnSync('git',args,{cwd,env,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);return r.stdout.trim();
 }
 try{
  const remote=path.join(dir,'remote.git'),writer=path.join(dir,'writer'),other=path.join(dir,'other');
  git(dir,'init','--bare','--initial-branch=master',remote);git(dir,'clone',remote,writer);
  git(writer,'config','user.name','Test');git(writer,'config','user.email','test@example.invalid');
  fs.mkdirSync(path.join(writer,'data'));fs.writeFileSync(path.join(writer,'data/fsw-2026-27.json'),'old fsw\n');
  git(writer,'add','.');git(writer,'commit','-m','initial');git(writer,'push','origin','master');
  git(dir,'clone',remote,other);git(other,'config','user.name','Test');git(other,'config','user.email','test@example.invalid');
  fs.writeFileSync(path.join(other,'data/high-school-2026-27.json'),'new high school\n');
  git(other,'add','.');git(other,'commit','-m','other collector');git(other,'push','origin','master');
  fs.writeFileSync(path.join(writer,'data/fsw-2026-27.json'),'new fsw\n');
  const workflow=fs.readFileSync(path.join(__dirname,'../workflows/collect-fsw.yml'),'utf8');
  const step=workflow.split('      - name: Commit JSON snapshot\n')[1].split('      - name: Preserve snapshot artifact')[0];
  const body=step.split('        run: |\n')[1].split('\n').filter(line=>line.startsWith('          ')).map(line=>line.slice(10)).join('\n');
  const r=spawnSync('bash',['-e','-c',body],{cwd:writer,env,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  assert.equal(git(remote,'show','master:data/high-school-2026-27.json'),'new high school');
  assert.equal(git(remote,'show','master:data/fsw-2026-27.json'),'new fsw');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
