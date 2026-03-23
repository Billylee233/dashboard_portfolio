'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { getChColor } from '@/lib/channelColors';
import { useTheme } from '@/components/ui/ThemeEditor';
import { isLightColor } from '@/lib/theme';
import { useSearchParams } from 'next/navigation';
import { thStyle, tdStyle } from '@/lib/tableStyles';

const JOB_TYPES_AR = ['Helper','HL','MCL','FA','FO','CPF','S-FA'] as const;
function hexToRgbAR(hex: string) {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return [14, 165, 233];
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
type JobTypeAR = typeof JOB_TYPES_AR[number];
const JOB_GROUP_AR: Record<string, JobTypeAR[]> = {
  '전체': JOB_TYPES_AR as unknown as JobTypeAR[],
  '일용직': ['Helper'],
  '계약직': ['HL','MCL','FA','FO','CPF','S-FA'],
};

const CHANNELS = [
  'Brand_Search_Naver','SA_Carrot','SA_Daum','SA_Google','SA_Naver',
  'Kakao_Tokchannel','Carrot Market','Criteo','Demandgen',
  'Google_pmax','Instagram','Tiktok','toss',
];

const DEFAULT_TYPES = [
  { name:'예산',        description:'일예산, 월예산 증감' },
  { name:'입찰',        description:'입찰가, 타겟 CPA 변경' },
  { name:'소재',        description:'이미지/텍스트 소재 교체, 추가, 중단' },
  { name:'타겟팅',      description:'오디언스, 지역, 디바이스 변경' },
  { name:'캠페인 구조', description:'캠페인/그룹 신설, 중단, 재개' },
  { name:'A/B 테스트',  description:'테스트 시작, 종료, 결과 반영' },
  { name:'채널',        description:'신규 채널 온보딩, 채널 일시정지' },
  { name:'기타',        description:'위 분류에 해당하지 않는 변경' },
];

// 채널 컬러는 lib/channelColors.ts에서 공통 관리

const SUBSTITUTE_ELIGIBLE = new Set(['삼일절','어린이날','광복절','개천절','한글날','성탄절','부처님오신날','설날','추석','설날연휴','추석연휴']);
const BASE_HOLIDAYS: Record<string,string> = {
  '2025-01-01':'신정','2025-01-28':'설날연휴','2025-01-29':'설날','2025-01-30':'설날연휴',
  '2025-03-01':'삼일절','2025-05-05':'어린이날','2025-05-06':'부처님오신날','2025-06-06':'현충일',
  '2025-08-15':'광복절','2025-10-03':'개천절','2025-10-05':'추석연휴','2025-10-06':'추석',
  '2025-10-07':'추석연휴','2025-10-09':'한글날','2025-12-25':'성탄절',
  '2026-01-01':'신정','2026-01-28':'설날연휴','2026-01-29':'설날','2026-01-30':'설날연휴',
  '2026-03-01':'삼일절','2026-05-05':'어린이날','2026-05-24':'부처님오신날','2026-06-06':'현충일',
  '2026-08-15':'광복절','2026-09-24':'추석연휴','2026-09-25':'추석','2026-09-26':'추석연휴',
  '2026-10-03':'개천절','2026-10-09':'한글날','2026-12-25':'성탄절',
};
function d2s(y:number,m:number,d:number){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function calcKRHolidays():Map<string,string>{
  const map=new Map<string,string>(Object.entries(BASE_HOLIDAYS));
  const all=new Set(map.keys());
  for(const [ds,name] of Object.entries(BASE_HOLIDAYS)){
    if(!SUBSTITUTE_ELIGIBLE.has(name))continue;
    const d=new Date(ds+'T00:00:00');const dow=d.getDay();
    if(dow===0||dow===6){
      const c=new Date(d);c.setDate(c.getDate()+1);
      while(c.getDay()===0||c.getDay()===6||all.has(d2s(c.getFullYear(),c.getMonth()+1,c.getDate())))c.setDate(c.getDate()+1);
      const k=d2s(c.getFullYear(),c.getMonth()+1,c.getDate());
      if(!map.has(k)){map.set(k,name+' 대체');all.add(k);}
    }
  }
  return map;
}
const KR_HOLIDAYS=calcKRHolidays();
const DOW_KR=['일','월','화','수','목','금','토'];

interface ActionRecord { id:string;channel:string;date:string;type:string;description:string;job_type:string;created_at:string; }
interface ActionType { id?:string;name:string;description:string; }

// ─── 라벨 내장 드롭다운 필터 ─────────────────────────────────────────────────
function FilterSelect({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v:string)=>void;
}) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)}
      style={{
        backgroundColor: 'var(--color-surface-1)',
        border: '1px solid var(--color-accent)',
        borderRadius: 6,
        padding: '4px 10px',
        fontSize: 'var(--font-small)',
        fontWeight: 700,
        color: 'var(--color-accent)',
        cursor: 'pointer',
        outline: 'none',
        minHeight: 32,
        width: '100%',
      }}>
      <option value="">{label}</option>
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ─── ActionCalendar ───────────────────────────────────────────────────────────
function ActionCalendar({ records, onCellClick }: {
  records: ActionRecord[];
  onCellClick: (channel:string, date:string, ids:string[])=>void;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const theme = useTheme();
  const isDark = !isLightColor(theme.colorBg);

  const prevMonth=()=>{ if(viewMonth===0){setViewYear(y=>y-1);setViewMonth(11);}else setViewMonth(m=>m-1); };
  const nextMonth=()=>{ if(viewMonth===11){setViewYear(y=>y+1);setViewMonth(0);}else setViewMonth(m=>m+1); };

  const usedChannels = Array.from(new Set(records.map(r=>r.channel).filter(Boolean)));
  const filteredRecords = selectedChannels.size===0 ? records : records.filter(r=>selectedChannels.has(r.channel));

  const firstDay=new Date(viewYear,viewMonth,1);
  const daysInMonth=new Date(viewYear,viewMonth+1,0).getDate();
  const startDow=firstDay.getDay();
  const cells:(number|null)[]=[];
  for(let i=0;i<startDow;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(d);
  while(cells.length%7!==0)cells.push(null);
  const weeks=[];
  for(let i=0;i<cells.length;i+=7)weeks.push(cells.slice(i,i+7));
  const todayStr=d2s(today.getFullYear(),today.getMonth()+1,today.getDate());

  const getDayGroups=(day:number)=>{
    const ds=d2s(viewYear,viewMonth+1,day);
    const byChannel=new Map<string,ActionRecord[]>();
    for(const r of filteredRecords.filter(r=>r.date.slice(0,10)===ds)){
      if(!byChannel.has(r.channel))byChannel.set(r.channel,[]);
      byChannel.get(r.channel)!.push(r);
    }
    return byChannel;
  };
  const toggleCh=(ch:string)=>setSelectedChannels(prev=>{const n=new Set(prev);n.has(ch)?n.delete(ch):n.add(ch);return n;});

  return (
    <div style={{backgroundColor:'var(--color-surface-1)',border:'1px solid var(--color-border-subtle)',borderRadius:12,overflow:'hidden'}}>
      <div style={{display:'flex'}}>
        <div style={{width:160,flexShrink:0,borderRight:'1px solid var(--color-border-subtle)'}}>
          <div style={{height:44,display:'flex',flexDirection:'column',justifyContent:'flex-end',padding:'0 16px 8px',borderBottom:'1px solid var(--color-border-subtle)'}}>
            <span style={{fontSize:'var(--font-label)',fontWeight:700,color:'var(--color-text-muted)',letterSpacing:'var(--tracking-wide)',textTransform:'uppercase'}}>채널 필터</span>
            <span style={{fontSize:'var(--font-tiny)',color:'var(--color-text-muted)',opacity:0.6,marginTop:2}}>복수 선택 가능</span>
          </div>
          <div style={{padding:'10px 12px',display:'flex',flexDirection:'column',gap:6}}>
            {usedChannels.map(ch=>{
              const c=getChColor(ch, isDark);const active=selectedChannels.has(ch);
              return (
                <label key={ch} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',opacity:active||selectedChannels.size===0?1:0.4,transition:'opacity 0.15s'}}>
                  <input type="checkbox" checked={active} onChange={()=>toggleCh(ch)} style={{display:'none'}}/>
                  <div style={{width:12,height:12,borderRadius:3,border:`2px solid ${c.border}`,backgroundColor:active?c.bg:'transparent',flexShrink:0,transition:'all 0.15s'}}/>
                  <span style={{fontSize:'var(--font-label)',color:'var(--color-text-secondary)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:110}}>{ch}</span>
                </label>
              );
            })}
            {selectedChannels.size>0&&<button onClick={()=>setSelectedChannels(new Set())} style={{marginTop:4,fontSize:'var(--font-tiny)',color:'var(--color-text-muted)',background:'none',border:'none',cursor:'pointer',textAlign:'left',padding:0,opacity:0.7}}>전체 해제</button>}
          </div>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{height:44,display:'flex',alignItems:'center',borderBottom:'1px solid var(--color-border-subtle)',justifyContent:'center',gap:8}}>
            <button onClick={prevMonth} style={{background:'none',border:'none',cursor:'pointer',color:'var(--color-text-muted)',fontSize:'var(--font-page-title)',fontWeight:700,padding:'4px 6px',borderRadius:6}}>‹</button>
            <span style={{fontSize:'var(--font-body)',fontWeight:700,color:'var(--color-text-primary)',minWidth:100,textAlign:'center'}}>{viewYear}년 {viewMonth+1}월</span>
            <button onClick={nextMonth} style={{background:'none',border:'none',cursor:'pointer',color:'var(--color-text-muted)',fontSize:'var(--font-page-title)',fontWeight:700,padding:'4px 6px',borderRadius:6}}>›</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',borderBottom:'1px solid var(--color-border-subtle)'}}>
            {DOW_KR.map((d,i)=><div key={d} style={{textAlign:'center',fontSize:'var(--font-label)',fontWeight:600,padding:'6px 0',color:i===0?'#f87171':i===6?'#60a5fa':'var(--color-text-muted)'}}>{d}</div>)}
          </div>
          {weeks.map((week,wi)=>(
            <div key={wi} style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',borderBottom:wi<weeks.length-1?'1px solid var(--color-border-subtle)':'none'}}>
              {week.map((day,di)=>{
                if(!day)return <div key={`e-${di}`} style={{minHeight:72,borderRight:di<6?'1px solid var(--color-border-subtle)':'none',backgroundColor:'color-mix(in srgb, var(--color-surface-1) 98%, transparent)'}}/>;
                const ds=d2s(viewYear,viewMonth+1,day);
                const isToday=ds===todayStr,isHol=KR_HOLIDAYS.has(ds),holName=KR_HOLIDAYS.get(ds),dow=di;
                const groups=getDayGroups(day);
                return (
                  <div key={day} style={{minHeight:72,borderRight:di<6?'1px solid var(--color-border-subtle)':'none',padding:'4px 4px 4px 6px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:3,marginBottom:2}}>
                      <span style={{fontSize:'var(--font-body)',fontWeight:isToday?700:500,color:isToday?'#fff':isHol||dow===0?'#f87171':dow===6?'#60a5fa':'var(--color-text-muted)',backgroundColor:isToday?'var(--color-accent)':'transparent',borderRadius:isToday?'50%':0,width:isToday?22:undefined,height:isToday?22:undefined,display:isToday?'flex':'inline',alignItems:'center',justifyContent:'center'}}>
                        {day===1?`${viewMonth+1}/${day}`:String(day)}
                      </span>
                      {isHol&&<span style={{fontSize:'var(--font-tiny)',color:'var(--color-delta-neg)',fontWeight:500}}>{holName}</span>}
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:2}}>
                      {[...groups.entries()].map(([ch,recs])=>{
                        const c=getChColor(ch, isDark);
                        const jobLabel = recs[0].job_type ? `${recs[0].job_type} | ` : '';
                        const label=recs.length>1?`${jobLabel}${ch} (${recs.length})`:`${jobLabel}${ch} | ${recs[0].type||'기타'}`;
                        const tooltip=recs.map(r=>`[${r.type||'기타'}] ${r.description}`).join('\n');
                        return (
                          <div key={ch} title={tooltip} onClick={()=>onCellClick(ch,ds,recs.map(r=>r.id))}
                            style={{fontSize:'var(--font-tiny)',fontWeight:600,color:c.text,backgroundColor:c.bg,border:`1px solid ${c.border}`,borderRadius:4,padding:'1px 5px',cursor:'pointer',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',transition:'opacity 0.15s'}}
                            onMouseEnter={e=>e.currentTarget.style.opacity='0.7'}
                            onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                            {label}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function makeId(){ return 'r_'+Math.random().toString(36).slice(2); }
function todayStr(){ return new Date().toISOString().slice(0,10); }

function ActionRecordPageInner() {
  const [records, setRecords] = useState<ActionRecord[]>([]);
  const [types, setTypes] = useState<ActionType[]>([]);
  const [saving, setSaving] = useState(false);
  const theme = useTheme();
  const isDark = !isLightColor(theme.colorBg);
  const [newRows, setNewRows] = useState<{id:string;channel:string;date:string;type:string;description:string;job_type:string}[]>([]);
  const [editId, setEditId] = useState<string|null>(null);
  const [editData, setEditData] = useState<Partial<ActionRecord>>({});

  const [filterDate, setFilterDate] = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [jobGroupFilter, setJobGroupFilterAR] = useState<'전체'|'일용직'|'계약직'>('전체');
  const [activeJobTypes, setActiveJobTypesAR] = useState<Set<JobTypeAR>>(new Set(JOB_TYPES_AR));
  const handleJobGroupClickAR = (g: '전체'|'일용직'|'계약직') => {
    setJobGroupFilterAR(g);
    if (g==='전체') setActiveJobTypesAR(new Set(JOB_TYPES_AR));
    else if (g==='일용직') setActiveJobTypesAR(new Set(['Helper']));
    else setActiveJobTypesAR(new Set(JOB_TYPES_AR.filter(j=>j!=='Helper')));
  };
  const toggleJobTypeAR = (jt: JobTypeAR) => {
    setActiveJobTypesAR(prev => {
      const next = new Set(prev);
      if (next.has(jt)) {
        next.delete(jt);
        if (jobGroupFilter==='일용직') { setJobGroupFilterAR('전체'); return new Set(JOB_TYPES_AR); }
        if (jobGroupFilter==='전체' && jt==='Helper') { setJobGroupFilterAR('계약직'); return new Set(JOB_TYPES_AR.filter(j=>j!=='Helper')); }
      } else {
        next.add(jt);
        if (jobGroupFilter==='계약직' && jt==='Helper') { setJobGroupFilterAR('전체'); return new Set(JOB_TYPES_AR); }
      }
      const arr = [...next];
      if (arr.length===JOB_TYPES_AR.length) setJobGroupFilterAR('전체');
      else if (arr.length===1&&arr[0]==='Helper') setJobGroupFilterAR('일용직');
      else if (!arr.includes('Helper')&&arr.length===JOB_TYPES_AR.length-1) setJobGroupFilterAR('계약직');
      return next;
    });
  };
  const [filterType, setFilterType] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');

  const [typeOpen, setTypeOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeDesc, setNewTypeDesc] = useState('');
  const [typeError, setTypeError] = useState('');

  const rowRefs = useRef<Record<string,HTMLTableRowElement|null>>({});
  const typeRef = useRef<HTMLDivElement|null>(null);

  useEffect(()=>{
    function handleOutside(e: MouseEvent){
      if(typeRef.current && !typeRef.current.contains(e.target as Node)) setTypeOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return ()=>document.removeEventListener('mousedown', handleOutside);
  },[]);

  const allTypes: ActionType[] = [
    ...DEFAULT_TYPES.filter(d=>!types.some(t=>t.name===d.name)),
    ...types,
  ];
  const typeNames = allTypes.map(t=>t.name);

  const fetchData = useCallback(async()=>{
    const res = await fetch('/api/action-record');
    const json = await res.json();
    setRecords((json.records??[]).map((r:any)=>({...r,date:(r.date??'').slice(0,10)})));
    setTypes(json.types??[]);
  },[]);
  useEffect(()=>{ fetchData(); },[fetchData]);

  // ── highlight from Overview link ─────────────────────────────────────────
  const searchParams  = useSearchParams();
  const highlightId   = searchParams.get('highlight');
  const [highlighted, setHighlighted] = useState<string|null>(null);

  useEffect(() => {
    if (!highlightId || records.length === 0) return;
    setHighlighted(highlightId);
    setTimeout(() => {
      rowRefs.current[highlightId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    const timer = setTimeout(() => setHighlighted(null), 5000);
    return () => clearTimeout(timer);
  }, [highlightId, records.length]);

  const handleCalendarClick=(channel:string,date:string,ids:string[])=>{
    if(ids.length===1){
      setFilterDate('');setFilterChannel('');setFilterType('');setFilterKeyword('');
      setTimeout(()=>{ rowRefs.current[ids[0]]?.scrollIntoView({behavior:'smooth',block:'center'}); },100);
    } else {
      setFilterChannel(channel);setFilterDate('');setFilterType('');setFilterKeyword('');
      setTimeout(()=>{ document.getElementById('action-table')?.scrollIntoView({behavior:'smooth',block:'start'}); },100);
    }
  };

  const addNewRow=()=>setNewRows(prev=>[...prev,{id:makeId(),channel:CHANNELS[0],date:todayStr(),type:allTypes[0]?.name??'',description:'',job_type:''}]);
  const updateNewRow=(id:string,patch:any)=>setNewRows(prev=>prev.map(r=>r.id===id?{...r,...patch}:r));
  const saveNewRow=async(id:string)=>{
    const row=newRows.find(r=>r.id===id);
    if(!row?.description.trim()){alert('변경사항을 입력해주세요.');return;}
    setSaving(true);
    try{
      const res=await fetch('/api/action-record',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify([{channel:row.channel,date:row.date,type:row.type,description:row.description,job_type:row.job_type??''}])});
      if(!res.ok){alert('저장 실패');return;}
      setNewRows(prev=>prev.filter(r=>r.id!==id));fetchData();
    }finally{setSaving(false);}
  };

  const startEdit=(row:ActionRecord)=>{ setEditId(row.id);setEditData({channel:row.channel,date:row.date,type:row.type,description:row.description}); };
  const cancelEdit=()=>{ setEditId(null);setEditData({}); };
  const saveEdit=async()=>{
    if(!editData.description?.trim()){alert('변경사항을 입력해주세요.');return;}
    setSaving(true);
    try{
      const res=await fetch('/api/action-record',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:editId,...editData})});
      if(!res.ok){alert('저장 실패');return;}
      setEditId(null);setEditData({});fetchData();
    }finally{setSaving(false);}
  };

  const deleteRecord=async(id:string)=>{
    if(!confirm('삭제하시겠습니까?'))return;
    await fetch('/api/action-record',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
    fetchData();
  };

  const addType=async()=>{
    if(!newTypeName.trim()){setTypeError('유형명을 입력해주세요.');return;}
    if(!newTypeDesc.trim()){setTypeError('설명을 입력해주세요.');return;}
    const res=await fetch('/api/action-record',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({addType:true,name:newTypeName.trim(),description:newTypeDesc.trim()})});
    if(!res.ok){setTypeError('저장 실패');return;}
    setNewTypeName('');setNewTypeDesc('');setTypeError('');fetchData();
  };
  const deleteType=async(id:string)=>{
    if(!confirm('삭제하시겠습니까?'))return;
    await fetch('/api/action-record',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deleteType:true,id})});
    fetchData();
  };

  // 날짜 목록 (연-월 단위)
  const usedDates = Array.from(new Set(records.map(r=>r.date.slice(0,7)))).sort().reverse();
  const usedChannels = Array.from(new Set(records.map(r=>r.channel)));
  const usedTypes = Array.from(new Set(records.map(r=>r.type).filter(Boolean)));
  const hasFilter = filterDate||filterChannel||filterType||filterKeyword||jobGroupFilter!=='전체';

  const filtered=records.filter(r=>{
    if(filterDate && !r.date.startsWith(filterDate)) return false;
    if(filterChannel && r.channel!==filterChannel) return false;
    if(filterType && r.type!==filterType) return false;
    if(jobGroupFilter!=='전체') { const jt = (r.job_type||'') as string; if(jt && !activeJobTypes.has(jt as JobTypeAR)) return false; }
    if(filterKeyword && !r.description.toLowerCase().includes(filterKeyword.toLowerCase())) return false;
    return true;
  });

  const selectSt = (): React.CSSProperties => ({
    backgroundColor: 'var(--color-surface-1)',
    border: '1px solid var(--color-accent)',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 'var(--font-label)',
    fontWeight: 700,
    color: 'var(--color-accent)',
    cursor: 'pointer',
    outline: 'none',
    minHeight: 32,
  });
  const inp="bg-surface-2 border border-def rounded px-2 py-1.5 text-text-secondary focus:border-accent focus:outline-none";
  const selInp:React.CSSProperties={backgroundColor:'var(--color-bg)',border:'1px solid var(--color-border-subtle)',borderRadius:6,padding:'5px 8px',fontSize:'var(--font-body)',color:'var(--color-text-secondary)',outline:'none',cursor:'pointer'};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-text-primary" style={{fontSize:'var(--font-page-title)'}}>📝 Action Record</h1>
        <p className="text-text-tertiary mt-1" style={{fontSize:'var(--font-table-body)'}}>채널별 운영 변경사항을 기록합니다. 저장된 내용은 BigQuery에 영구 보존됩니다.</p>
      </div>

      {/* 달력 */}
      <div style={{overflowX:'auto'}}>
        <ActionCalendar records={records} onCellClick={handleCalendarClick}/>
      </div>

      <div id="action-table" className="space-y-3" style={{position:'relative', zIndex:1}}>
        {/* 필터 바 */}
        <div style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:8}}>
          {/* + 행 추가 버튼 (A/B 테스트 등록 스타일) */}
          <button onClick={addNewRow}
            style={{fontSize:'var(--font-body)',backgroundColor:'var(--color-accent)',color:'#fff',border:'none',cursor:'pointer',borderRadius:6,padding:'3px 10px',fontWeight:600,display:'flex',alignItems:'center',gap:4}}>
            + 행 추가
          </button>
          {/* 구분선 */}
          <span style={{width:2,height:18,backgroundColor:'var(--color-border-subtle)',borderRadius:1,opacity:0.8}} />
          {/* 일자 드롭다운 */}
          <select value={filterDate} onChange={e=>setFilterDate(e.target.value)} style={selectSt()}>
            <option value="">일자</option>
            {usedDates.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
          {/* 채널 드롭다운 */}
          <select value={filterChannel} onChange={e=>setFilterChannel(e.target.value)} style={selectSt()}>
            <option value="">채널</option>
            {usedChannels.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          {/* 직무 드롭다운 삭제 — 아래 xx건 옆 버튼으로 이동 */}
          {/* 유형 드롭다운 */}
          <select value={filterType} onChange={e=>setFilterType(e.target.value)} style={selectSt()}>
            <option value="">유형</option>
            {usedTypes.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          {/* 키워드 검색 */}
          <input value={filterKeyword} onChange={e=>setFilterKeyword(e.target.value)} placeholder="변경사항 키워드 검색..."
            style={{fontSize:'var(--font-body)',padding:'4px 10px',borderRadius:6,border:'1px solid var(--color-border-subtle)',backgroundColor:'var(--color-surface-1)',color:'var(--color-text-secondary)',outline:'none',minWidth:200,minHeight:32}}/>
          {hasFilter&&<button onClick={()=>{setFilterDate('');setFilterChannel('');setFilterType('');setFilterKeyword('');setJobGroupFilterAR('전체');setActiveJobTypesAR(new Set(JOB_TYPES_AR));}}
            style={{fontSize:'var(--font-body)',color:'var(--color-text-secondary)',background:'transparent',border:'1px solid var(--color-border-subtle)',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontWeight:500,minHeight:32}}>
            초기화
          </button>}
          <span style={{fontSize:'var(--font-body)',color:'var(--color-text-muted)',marginLeft:4}}>{filtered.length}건</span>
          {/* 구분선 */}
          <span style={{width:2,height:18,backgroundColor:'var(--color-border-subtle)',borderRadius:1,opacity:0.8,marginLeft:4}}/>
          {/* 직무 그룹 */}
          {(['전체','일용직','계약직'] as const).map(g => {
            const active = jobGroupFilter === g;
            return (
              <button key={g} onClick={()=>handleJobGroupClickAR(g)}
                style={{fontSize:'var(--font-label)',cursor:'pointer',borderRadius:6,padding:'3px 10px',fontWeight:600,
                  backgroundColor:active?'var(--color-accent)':'transparent',
                  color:active?'#fff':'var(--color-text-secondary)',
                  border:'none',
                }}>{g}</button>
            );
          })}
          {/* 구분선 */}
          <span style={{width:2,height:18,backgroundColor:'var(--color-border-subtle)',borderRadius:1,opacity:0.8}}/>
          {/* 직무 개별 */}
          {JOB_TYPES_AR.map(jt => {
            const active = activeJobTypes.has(jt);
            return (
              <button key={jt} onClick={()=>toggleJobTypeAR(jt)}
                style={{fontSize:'var(--font-label)',cursor:'pointer',borderRadius:6,padding:'3px 10px',fontWeight:600,
                  backgroundColor:active?'var(--color-accent)':'transparent',
                  color:active?'#fff':'var(--color-text-secondary)',
                  border:'none',
                }}>{jt}</button>
            );
          })}

          {/* 유형 관리 — 우측 */}
          <div ref={typeRef} style={{marginLeft:'auto',position:'relative'}}>
            <button onClick={()=>setTypeOpen(p=>!p)}
              style={{fontSize:'var(--font-body)',fontWeight:600,color:'var(--color-accent)',backgroundColor:'color-mix(in srgb, var(--color-accent) 10%, transparent)',border:'1px solid var(--color-accent)',borderRadius:6,padding:'4px 10px',cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
              ⚙ 유형 관리
            </button>
            {typeOpen&&(
              <div style={{position:'absolute',right:0,top:'calc(100% + 6px)',zIndex:50,width:500,backgroundColor:'var(--color-surface-1)',border:'1px solid var(--color-border-subtle)',borderRadius:12,padding:16,boxShadow:'var(--shadow-lg)'}}>
                <div style={{fontSize:'var(--font-body)',fontWeight:700,color:'var(--color-text-primary)',marginBottom:10}}>유형 목록</div>
                <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:14}}>
                  {allTypes.map(t=>(
                    <div key={t.id??t.name} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:6,backgroundColor:'color-mix(in srgb, var(--color-border-subtle) 30%, transparent)'}}>
                      <span style={{fontSize:'var(--font-body)',fontWeight:600,color:'var(--color-text-secondary)',minWidth:90}}>{t.name}</span>
                      <span style={{fontSize:'var(--font-label)',color:'var(--color-text-muted)',flex:1}}>{t.description}</span>
                      {t.id&&<button onClick={()=>deleteType(t.id!)} style={{fontSize:'var(--font-label)',color:'var(--color-delta-neg)',background:'none',border:'none',cursor:'pointer',flexShrink:0}}>삭제</button>}
                    </div>
                  ))}
                </div>
                <div style={{fontSize:'var(--font-body)',fontWeight:700,color:'var(--color-text-primary)',marginBottom:8}}>새 유형 추가</div>
                {typeError&&<div style={{fontSize:'var(--font-label)',color:'var(--color-delta-neg)',marginBottom:6}}>{typeError}</div>}
                <div style={{display:'flex',gap:6}}>
                  <input value={newTypeName} onChange={e=>setNewTypeName(e.target.value)} placeholder="유형명 *" style={{...selInp,width:110}}/>
                  <input value={newTypeDesc} onChange={e=>setNewTypeDesc(e.target.value)} placeholder="설명 *" style={{...selInp,flex:1}}/>
                  <button onClick={addType} style={{fontSize:'var(--font-body)',fontWeight:600,backgroundColor:'var(--color-accent)',color:'#fff',border:'none',borderRadius:6,padding:'5px 16px',cursor:'pointer'}}>추가</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 표 */}
        <div style={{backgroundColor:'var(--color-surface-1)',border:'1px solid var(--color-border-subtle)',borderRadius:12,overflow:'visible'}}>
          <div className="overflow-x-auto">
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr>
                  <th style={{...thStyle,width:110}}>일자</th>
                  <th style={{...thStyle,width:110}}>직무</th>
                  <th style={{...thStyle,width:160}}>채널</th>
                  <th style={{...thStyle,width:110}}>유형</th>
                  <th style={thStyle}>변경사항</th>
                  <th style={{...thStyle,width:120,textAlign:'center'}}>편집 / 삭제</th>
                </tr>
              </thead>
              <tbody>
                {/* 신규 입력 행 */}
                {newRows.map(row=>(
                  <tr key={row.id} style={{backgroundColor:'color-mix(in srgb, var(--color-accent) 4%, transparent)'}}>
                    <td style={tdStyle}>
                      <input type="date" value={row.date} onChange={e=>updateNewRow(row.id,{date:e.target.value})}
                        onClick={e=>(e.currentTarget as any).showPicker?.()}
                        className={inp} style={{width:130}}/>
                    </td>
                    <td style={tdStyle}>
                      <select value={row.job_type??''} onChange={e=>updateNewRow(row.id,{job_type:e.target.value})} style={{...selInp,width:'100%'}}>
                        <option value="">직무</option>
                        {JOB_TYPES_AR.map(j=><option key={j} value={j}>{j}</option>)}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <select value={row.channel} onChange={e=>updateNewRow(row.id,{channel:e.target.value})} style={{...selInp,width:'100%'}}>
                        {CHANNELS.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <select value={row.type} onChange={e=>updateNewRow(row.id,{type:e.target.value})} style={{...selInp,width:'100%'}}>
                        {typeNames.map(t=><option key={t} value={t} title={allTypes.find(x=>x.name===t)?.description}>{t}</option>)}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <div style={{display:'flex',gap:6,alignItems:'center'}}>
                        <input type="text" value={row.description} onChange={e=>updateNewRow(row.id,{description:e.target.value})}
                          placeholder="변경사항 입력" className={`${inp} w-full`}
                          onKeyDown={e=>{if(e.key==='Enter')saveNewRow(row.id);}}/>
                        <button onClick={()=>saveNewRow(row.id)} disabled={saving}
                          style={{flexShrink:0,fontSize:'var(--font-body)',fontWeight:600,backgroundColor:'var(--color-accent)',color:'#fff',border:'none',borderRadius:6,padding:'5px 14px',cursor:'pointer',opacity:saving?0.5:1,whiteSpace:'nowrap'}}>
                          저장
                        </button>
                      </div>
                    </td>
                    <td style={{...tdStyle,textAlign:'center'}}>
                      <button onClick={()=>setNewRows(p=>p.filter(r=>r.id!==row.id))}
                        style={{fontSize:'var(--font-body)',color:'var(--color-text-muted)',background:'none',border:'none',cursor:'pointer'}}>✕</button>
                    </td>
                  </tr>
                ))}

                {filtered.length===0&&newRows.length===0&&(
                  <tr>
                    <td colSpan={6} style={{ padding: 'var(--space-10) var(--space-4)', textAlign: 'center' }}>
                      <span style={{ fontSize: 'var(--font-body)', display: 'block', marginBottom: 'var(--space-2)' }}>
                        {records.length === 0 ? '📝' : '🔍'}
                      </span>
                      <span style={{ fontSize: 'var(--font-body)', color: 'var(--color-text-muted)' }}>
                        {records.length === 0 ? '아직 기록이 없습니다. 행 추가 버튼을 눌러 시작하세요.' : '검색 결과가 없습니다.'}
                      </span>
                    </td>
                  </tr>
                )}

                {filtered.map(row=>{
                  const c=getChColor(row.channel, isDark);
                  const isEditing=editId===row.id;
                  return (
                    <tr key={row.id} ref={el=>{rowRefs.current[row.id]=el;}}
                      style={{backgroundColor: isEditing?'color-mix(in srgb, var(--color-accent) 4%, transparent)':'transparent',transition:'background-color 0.2s',
                        outline: highlighted===row.id ? '2px solid #ef4444' : 'none', outlineOffset: '-2px'}}
                      onMouseEnter={e=>{ if(!isEditing) e.currentTarget.style.backgroundColor='color-mix(in srgb, var(--color-border-subtle) 25%, transparent)'; }}
                      onMouseLeave={e=>{ if(!isEditing) e.currentTarget.style.backgroundColor='transparent'; }}>
                      {isEditing ? (
                        <>
                          <td style={tdStyle}>
                            <input type="date" value={editData.date??''} onChange={e=>setEditData(p=>({...p,date:e.target.value}))}
                              onClick={e=>(e.currentTarget as any).showPicker?.()}
                              className={inp} style={{width:130}}/>
                          </td>
                          <td style={tdStyle}>
                            <select value={editData.job_type??''} onChange={e=>setEditData(p=>({...p,job_type:e.target.value}))} style={{...selInp,width:'100%'}}>
                              <option value="">직무</option>
                              {JOB_TYPES_AR.map(j=><option key={j} value={j}>{j}</option>)}
                            </select>
                          </td>
                          <td style={tdStyle}>
                            <select value={editData.channel??''} onChange={e=>setEditData(p=>({...p,channel:e.target.value}))} style={{...selInp,width:'100%'}}>
                              {CHANNELS.map(ch=><option key={ch} value={ch}>{ch}</option>)}
                            </select>
                          </td>
                          <td style={tdStyle}>
                            <select value={editData.type??''} onChange={e=>setEditData(p=>({...p,type:e.target.value}))} style={{...selInp,width:'100%'}}>
                              {typeNames.map(t=><option key={t} value={t}>{t}</option>)}
                            </select>
                          </td>
                          <td style={tdStyle}>
                            <div style={{display:'flex',gap:6,alignItems:'center'}}>
                              <input type="text" value={editData.description??''} onChange={e=>setEditData(p=>({...p,description:e.target.value}))}
                                className={`${inp} w-full`} onKeyDown={e=>{if(e.key==='Enter')saveEdit();}}/>
                              <button onClick={saveEdit} disabled={saving}
                                style={{flexShrink:0,fontSize:'var(--font-body)',fontWeight:600,backgroundColor:'var(--color-accent)',color:'#fff',border:'none',borderRadius:6,padding:'5px 14px',cursor:'pointer',opacity:saving?0.5:1,whiteSpace:'nowrap'}}>
                                저장
                              </button>
                              <button onClick={cancelEdit}
                                style={{flexShrink:0,fontSize:'var(--font-body)',color:'var(--color-text-muted)',background:'none',border:'1px solid var(--color-border-subtle)',borderRadius:6,padding:'5px 10px',cursor:'pointer',whiteSpace:'nowrap'}}>
                                취소
                              </button>
                            </div>
                          </td>
                          <td style={{...tdStyle,textAlign:'center'}}>
                            <button onClick={cancelEdit} style={{fontSize:13,color:'var(--color-text-muted)',background:'none',border:'none',cursor:'pointer'}}>✕</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{...tdStyle,color:'var(--color-text-muted)',fontSize:'var(--font-body)'}}>{row.date}</td>
                          <td style={tdStyle}>
                            {row.job_type
                              ? <span style={{fontSize:'var(--font-label)',fontWeight:600,padding:'3px 8px',borderRadius:12,backgroundColor:'color-mix(in srgb, var(--color-accent) 12%, transparent)',border:'1px solid color-mix(in srgb, var(--color-accent) 35%, transparent)',color:'var(--color-accent)',whiteSpace:'nowrap'}}>{row.job_type}</span>
                              : <span style={{color:'var(--color-text-muted)',fontSize:'var(--font-label)'}}>—</span>}
                          </td>
                          <td style={tdStyle}>
                            <span style={{fontSize:'var(--font-label)',fontWeight:600,padding:'3px 10px',borderRadius:12,backgroundColor:c.bg,border:`1px solid ${c.border}`,color:c.text,whiteSpace:'nowrap'}}>{row.channel}</span>
                          </td>
                          <td style={tdStyle}>
                            <span style={{fontSize:'var(--font-label)',color:'var(--color-text-muted)',padding:'3px 8px',borderRadius:12,border:'1px solid var(--color-border-subtle)',whiteSpace:'nowrap'}}>{row.type||'—'}</span>
                          </td>
                          <td style={{...tdStyle,color:'var(--color-text-secondary)'}}>{row.description}</td>
                          <td style={{...tdStyle,textAlign:'center'}}>
                            <div style={{display:'flex',gap:6,justifyContent:'center'}}>
                              <button onClick={()=>startEdit(row)}
                                style={{fontSize:'var(--font-body)',fontWeight:600,color:'var(--color-accent)',backgroundColor:'color-mix(in srgb, var(--color-accent) 10%, transparent)',border:'1px solid var(--color-accent)',borderRadius:6,padding:'4px 12px',cursor:'pointer',transition:'all 0.15s',whiteSpace:'nowrap'}}
                                onMouseEnter={e=>{e.currentTarget.style.backgroundColor='var(--color-accent)';e.currentTarget.style.color='#fff';}}
                                onMouseLeave={e=>{e.currentTarget.style.backgroundColor='color-mix(in srgb, var(--color-accent) 10%, transparent)';e.currentTarget.style.color='var(--color-accent)';}}>
                                편집
                              </button>
                              <button onClick={()=>deleteRecord(row.id)}
                                style={{fontSize:'var(--font-body)',fontWeight:600,color:'var(--color-delta-neg)',backgroundColor:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.4)',borderRadius:6,padding:'4px 12px',cursor:'pointer',transition:'all 0.15s',whiteSpace:'nowrap'}}
                                onMouseEnter={e=>{e.currentTarget.style.backgroundColor='#f87171';e.currentTarget.style.color='#fff';}}
                                onMouseLeave={e=>{e.currentTarget.style.backgroundColor='rgba(248,113,113,0.08)';e.currentTarget.style.color='#f87171';}}>
                                삭제
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ActionRecordPage() {
  return (
    <React.Suspense fallback={null}>
      <ActionRecordPageInner />
    </React.Suspense>
  );
}
