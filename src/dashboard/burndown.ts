type Event = {taskId:string; toStatus:string; createdAt:Date|string};
type TaskSnapshot = {id:string; createdAt:Date|string};
/** Current sprint membership, reconstructed from persisted task status events (UTC end-of-day). */
export function burndown(start:Date|string,end:Date|string,tasks:TaskSnapshot[],events:Event[],now=new Date()) {
  const from=new Date(start).getTime(),to=new Date(end).getTime();
  const duration=Math.max(1,to-from), steps=Math.min(30,Math.max(1,Math.ceil(duration/86400000)));
  const sorted=[...events].sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());
  return Array.from({length:steps+1},(_,i)=>{
    const at=from+duration*i/steps, cutoff=Math.min(at+86400000-1,now.getTime());
    const states=new Map<string,string>();
    for(const e of sorted) if(new Date(e.createdAt).getTime()<=cutoff) states.set(e.taskId,e.toStatus);
    const actual=at>now.getTime()?null:tasks.filter(t=>new Date(t.createdAt).getTime()<=cutoff&&states.get(t.id)!=='done').length;
    return {date:new Date(at).toISOString(),actual,ideal:Math.round(tasks.length*(1-i/steps)*10)/10};
  });
}
