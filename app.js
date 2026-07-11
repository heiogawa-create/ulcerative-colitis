const STORAGE_KEY="uc-condition-records-v1",SETTINGS_KEY="uc-condition-settings-v1";
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const todayString=()=>new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Tokyo"});
const numberOrNull=v=>v===""?null:Number(v);
let records=loadJson(STORAGE_KEY,[]),settings=loadJson(SETTINGS_KEY,{baselineStools:2,careTeamPhone:""});

function loadJson(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function saveJson(key,value){localStorage.setItem(key,JSON.stringify(value))}
function getFormData(){return{date:$("#recordDate").value,stoolCount:Number($("#stoolCount").value||0),looseCount:Number($("#looseCount").value||0),blood:Number($("input[name='blood']:checked").value),urgency:Number($("#urgency").value),nocturnal:$("#nocturnal").checked,temperature:numberOrNull($("#temperature").value),pulse:numberOrNull($("#pulse").value),pain:Number($("#pain").value),hb:numberOrNull($("#hb").value),crp:numberOrNull($("#crp").value),esr:numberOrNull($("#esr").value),weight:numberOrNull($("#weight").value),wbc:numberOrNull($("#wbc").value),medicationTaken:$("#medicationTaken").checked,notes:$("#notes").value.trim(),redFlags:$$('[data-red-flag]:checked').map(e=>e.value),updatedAt:new Date().toISOString()}}

function assessSeverity(r){
  const flags={bowel:r.stoolCount>=5,blood:r.blood>=2,fever:r.temperature!==null&&r.temperature>=37.5,tachycardia:r.pulse!==null&&r.pulse>=90,anemia:r.hb!==null&&r.hb<=10,inflammation:(r.crp!==null&&r.crp>=3)||(r.esr!==null&&r.esr>=30)};
  const count=Object.values(flags).filter(Boolean).length;
  const severe=r.stoolCount>=6&&r.blood===3&&(flags.fever||flags.tachycardia)&&count>=4;
  const fulminant=severe&&r.stoolCount>=15&&r.temperature!==null&&r.temperature>=38.5&&r.wbc!==null&&r.wbc>=10000&&r.pain>=8;
  if((r.redFlags?.length||0)>0||fulminant)return{level:"emergency",title:"今すぐ医療機関へ相談を",chip:"緊急サイン",summary:"選択された症状は、アプリの経過観察だけにしないでください。救急相談または医療機関へ連絡してください。",flags};
  if(severe)return{level:"severe",title:"重症の基準に該当する可能性",chip:"当日中に連絡",summary:"排便回数・多量の血便・全身症状が重なっています。本日中に主治医・IBD外来へ連絡してください。",flags};
  if(count>0){const names=[];if(flags.bowel)names.push("排便5回以上");if(flags.blood)names.push("明らかな血便");if(flags.fever)names.push("37.5℃以上");if(flags.tachycardia)names.push("脈拍90以上");if(flags.anemia)names.push("Hb 10以下");if(flags.inflammation)names.push("炎症反応上昇");return{level:"moderate",title:"中等症の項目に該当",chip:"早めに相談",summary:`${names.join("・")}が該当しています。重症でなくても、悪化が続く・血便が増える場合は早めに主治医へ相談してください。`,flags}}
  const incomplete=[r.temperature,r.pulse,r.hb,r.crp,r.esr].some(v=>v===null);
  return{level:"mild",title:"入力範囲では軽症寄り",chip:incomplete?"検査未入力あり":"軽症の目安",summary:incomplete?"入力された症状は軽症側です。ただし未入力の検査項目があり、寛解を確定するものではありません。":"入力された6項目は軽症側です。症状が続く場合や不安がある場合は主治医へ相談してください。",flags}
}

function updateLiveResult(){const r=assessSeverity(getFormData()),card=$("#resultCard");card.classList.toggle("warning",r.level==="moderate");card.classList.toggle("danger",["severe","emergency"].includes(r.level));$("#resultTitle").textContent=r.title;$("#resultSummary").textContent=r.summary;$("#severityChip").textContent=r.chip}
function symptomScore(r){const base=Number(settings.baselineStools||0);return Math.max(0,r.stoolCount-base)*1.5+r.blood*3+r.urgency*1.3+r.pain*.45+(r.nocturnal?2:0)+(r.temperature>=37.5?2:0)}
function assessTrend(items){
  if(items.length<3)return{level:"neutral",icon:"…",title:"あと少し記録が必要です",text:`経過判定には3日分以上の記録が必要です。現在${items.length}日分あります。`};
  const sorted=[...items].sort((a,b)=>a.date.localeCompare(b.date)),recent=sorted.slice(-3),prior=sorted.slice(-7,-3);
  const recentAvg=recent.reduce((s,r)=>s+symptomScore(r),0)/recent.length,priorAvg=prior.length?prior.reduce((s,r)=>s+symptomScore(r),0)/prior.length:symptomScore(sorted[0]);
  const blood=recent.filter(r=>r.blood>0).length>=2,increase=recent.filter(r=>r.stoolCount>=Number(settings.baselineStools||0)+2).length>=2,delta=priorAvg===0?recentAvg:(recentAvg-priorAvg)/Math.max(priorAvg,1);
  if(delta<=-.2&&!blood)return{level:"improving",icon:"↘",title:"寛解方向の傾向",text:"直近3件では、排便・血便・腹痛などの症状スコアが改善しています。寛解の確定には検査や診察が必要です。"};
  if(delta>=.2||blood||increase)return{level:"danger",icon:"↗",title:"活動性が高まる可能性",text:"排便回数の増加、血便または他の症状の悪化傾向があります。数日続く場合や急に悪化した場合は主治医へ相談してください。"};
  return{level:"neutral",icon:"→",title:"大きな変化はみられません",text:"直近の症状はおおむね横ばいです。自分の普段の状態と比べながら記録を続けてください。"}
}

function renderTrend(){
  const items=[...records].sort((a,b)=>a.date.localeCompare(b.date)).slice(-7),trend=assessTrend(items);
  $("#trendSummary").innerHTML=`<div class="trend-state ${trend.level}"><span class="trend-icon">${trend.icon}</span><div><p class="eyebrow">TREND RESULT</p><h3>${trend.title}</h3><p>${trend.text}</p></div></div>`;
  if(!items.length){$("#trendChart").innerHTML='<div class="empty-state" style="grid-column:1/-1;align-self:center"><b>まだ記録がありません</b>「今日」から最初の記録を保存してください。</div>';return}
  const max=Math.max(6,...items.map(r=>r.stoolCount));
  $("#trendChart").innerHTML=items.map(r=>{const height=Math.max(3,Math.round(r.stoolCount/max*145)),d=new Date(`${r.date}T00:00:00`);return`<div class="chart-column"><span class="chart-value">${r.stoolCount}</span><div class="chart-bar ${r.blood>0?"has-blood":""}" style="height:${height}px" title="排便${r.stoolCount}回"></div><span class="chart-label">${d.getMonth()+1}/${d.getDate()}</span></div>`}).join("")
}

function formatDate(v){const d=new Date(`${v}T00:00:00`);return{main:`${d.getMonth()+1}/${d.getDate()}`,sub:["日","月","火","水","木","金","土"][d.getDay()]+"曜日"}}
function renderHistory(){
  const list=$("#historyList");if(!records.length){list.innerHTML='<div class="empty-state"><b>まだ記録がありません</b>毎日の変化を残すと、診察時にも振り返りやすくなります。</div>';return}
  list.innerHTML=[...records].sort((a,b)=>b.date.localeCompare(a.date)).map(r=>{const result=assessSeverity(r),d=formatDate(r.date),blood=["なし","わずか","明らか","多量"][r.blood],label=result.level==="mild"?"軽症寄り":result.level==="moderate"?"中等症項目":result.level==="severe"?"重症可能性":"緊急サイン";return`<article class="history-item"><div class="history-date">${d.main}<small>${d.sub}</small></div><div class="history-metrics"><span>便 <b>${r.stoolCount}回</b></span><span>血便 <b>${blood}</b></span><span>腹痛 <b>${r.pain}/10</b></span></div><span class="severity-label ${result.level}">${label}</span><button class="delete-record" data-delete="${r.date}" aria-label="${r.date}の記録を削除">削除</button></article>`}).join("");
  $$('[data-delete]').forEach(b=>b.addEventListener("click",()=>deleteRecord(b.dataset.delete)))
}
function deleteRecord(date){if(!confirm(`${date} の記録を削除しますか？`))return;records=records.filter(r=>r.date!==date);saveJson(STORAGE_KEY,records);renderAll();showToast("記録を削除しました")}
function saveRecord(e){e.preventDefault();const r=getFormData();if(!r.date)return;const index=records.findIndex(i=>i.date===r.date);if(index>=0)records[index]=r;else records.push(r);saveJson(STORAGE_KEY,records);renderAll();showToast(index>=0?"記録を更新しました":"今日の記録を保存しました")}
function exportCsv(){
  if(!records.length)return showToast("出力できる記録がありません");
  const header=["日付","排便回数","水様泥状便","血便0-3","便意切迫0-3","夜間排便","体温","脈拍","腹痛0-10","Hb","CRP","赤沈","体重","白血球数","服薬","メモ"],rows=[...records].sort((a,b)=>a.date.localeCompare(b.date)).map(r=>[r.date,r.stoolCount,r.looseCount,r.blood,r.urgency,r.nocturnal?"あり":"なし",r.temperature??"",r.pulse??"",r.pain,r.hb??"",r.crp??"",r.esr??"",r.weight??"",r.wbc??"",r.medicationTaken?"はい":"いいえ",r.notes]),esc=v=>`"${String(v).replaceAll('"','""')}"`,csv="\uFEFF"+[header,...rows].map(row=>row.map(esc).join(",")).join("\r\n"),url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download=`UC症状記録_${todayString()}.csv`;a.click();URL.revokeObjectURL(url)
}

function loadRecordToForm(date){
  const r=records.find(i=>i.date===date);$("#dailyForm").reset();$("#recordDate").value=date;$("#medicationTaken").checked=true;
  if(!r){$("#painOutput").textContent="0 / 10";updateLiveResult();return}
  ["stoolCount","looseCount","urgency","temperature","pulse","pain","hb","crp","esr","weight","wbc","notes"].forEach(k=>{if(r[k]!==null&&r[k]!==undefined)$(`#${k}`).value=r[k]});
  $(`input[name="blood"][value="${r.blood}"]`).checked=true;$("#nocturnal").checked=r.nocturnal;$("#medicationTaken").checked=r.medicationTaken;$$('[data-red-flag]').forEach(i=>i.checked=r.redFlags?.includes(i.value));$("#painOutput").textContent=`${r.pain} / 10`;updateLiveResult()
}
function renderSettings(){
  $("#baselineStools").value=settings.baselineStools;$("#careTeamPhone").value=settings.careTeamPhone||"";const link=$("#careTeamLink");
  if(settings.careTeamPhone){link.hidden=false;link.href=`tel:${settings.careTeamPhone.replace(/[^\d+]/g,"")}`;$("#careTeamNumber").textContent=settings.careTeamPhone}else link.hidden=true
}
function renderAll(){renderTrend();renderHistory();renderSettings()}
function showToast(message){const t=$("#toast");t.textContent=message;t.classList.add("show");clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.remove("show"),2300)}
function init(){
  $("#recordDate").value=todayString();loadRecordToForm($("#recordDate").value);renderAll();
  $("#dailyForm").addEventListener("submit",saveRecord);$("#dailyForm").addEventListener("input",updateLiveResult);$("#pain").addEventListener("input",e=>$("#painOutput").textContent=`${e.target.value} / 10`);$("#recordDate").addEventListener("change",e=>loadRecordToForm(e.target.value));$("#exportCsv").addEventListener("click",exportCsv);$("#openSettings").addEventListener("click",()=>$("#settingsDialog").showModal());
  $("#saveSettings").addEventListener("click",e=>{e.preventDefault();settings={baselineStools:Number($("#baselineStools").value||0),careTeamPhone:$("#careTeamPhone").value.trim()};saveJson(SETTINGS_KEY,settings);renderAll();$("#settingsDialog").close();showToast("設定を保存しました")});
  $("#clearData").addEventListener("click",()=>{if(!confirm("端末内の全記録を削除します。元に戻せません。続けますか？"))return;records=[];saveJson(STORAGE_KEY,records);renderAll();$("#settingsDialog").close();showToast("全記録を削除しました")});
  $$(".tab").forEach(button=>button.addEventListener("click",()=>{$$(".tab").forEach(t=>t.classList.toggle("is-active",t===button));$$(".tab-panel").forEach(p=>p.classList.toggle("is-active",p.id===button.dataset.tab));window.scrollTo({top:0,behavior:"smooth"})}));
  if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{})
}
document.addEventListener("DOMContentLoaded",init);
