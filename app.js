const API_URL='https://script.google.com/macros/s/AKfycbzFOY5ul78Q-VOrb_-eXUKjiQdFvv1bckhJ-GQL3EqEB87KgyYHbPTguIX8OepgWUUKkg/exec';

const $=id=>document.getElementById(id);
const searchForm=$('searchForm'),controlInput=$('controlInput'),scanBtn=$('scanBtn'),scannerCard=$('scannerCard'),closeScanner=$('closeScanner'),scannerMessage=$('scannerMessage');
const resultCard=$('resultCard'),statusBadge=$('statusBadge'),resultTitle=$('resultTitle'),resultMessage=$('resultMessage'),details=$('details'),verifyAnother=$('verifyAnother');
let scanner=null,scannerRunning=false,scanLocked=false;

const normalize=v=>String(v??'').trim();
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

function parseDate(record){
 const month=normalize(record['EXPIRATION DATE MONTH']||record['EXPIRATION MONTH']),day=normalize(record['EXPIRATION DATE DAY']||record['EXPIRATION DAY']),year=normalize(record['EXPIRATION DATE YEAR']||record['EXPIRATION YEAR']);
 if(!month||!day||!year)return null;
 const months={JANUARY:0,FEBRUARY:1,MARCH:2,APRIL:3,MAY:4,JUNE:5,JULY:6,AUGUST:7,SEPTEMBER:8,OCTOBER:9,NOVEMBER:10,DECEMBER:11};
 const m=months[month.toUpperCase()]; if(m===undefined)return null;
 const d=new Date(Number(year),m,Number(day),23,59,59); return Number.isNaN(d.getTime())?null:d;
}
function getStatus(record){
 const raw=normalize(record['STATUS']).toUpperCase();
 if(raw==='INACTIVE')return'inactive';
 const expiration=parseDate(record); if(expiration&&expiration<new Date())return'expired';
 if(raw==='ACTIVE')return'active'; return'invalid';
}

function showResult(data,requestedControl){
 resultCard.classList.remove('hidden'); const record=data.record||{};
 if(!data.verified){statusBadge.className='status-badge status-invalid';statusBadge.textContent='INVALID ID';resultTitle.textContent='ID Not Found';resultMessage.textContent=`No record was found for control number ${requestedControl}.`;details.innerHTML='';return;}
 const map={active:['status-active','VALID / VERIFIED','This ID is active and verified.'],inactive:['status-inactive','INACTIVE ID','This ID is currently marked inactive.'],expired:['status-expired','EXPIRED ID','The expiration date has already passed.'],invalid:['status-invalid','INVALID ID','The record status could not be verified.']};
 const [cls,label,message]=map[getStatus(record)]||map.invalid;
 statusBadge.className=`status-badge ${cls}`;statusBadge.textContent=label;resultTitle.textContent='Verification Result';resultMessage.textContent=message;
 const name=[record['FIRST NAME'],record['MIDDLE NAME'],record['SURE NAME']||record['SURNAME']].map(normalize).filter(Boolean).join(' ');
 const acquired=[record['DATE ACQUIRED MONTH'],record['DATE ACQUIRED DAY'],record['DATE ACQUIRED YEAR']].map(normalize).filter(Boolean).join(' ');
 const expiration=[record['EXPIRATION DATE MONTH'],record['EXPIRATION DATE DAY'],record['EXPIRATION DATE YEAR']].map(normalize).filter(Boolean).join(' ');
 const fields=[['Control Number',record['CONTROL NUMBER']],['Name',name],['Designation',record['DESIGNATION']],['Date Acquired',acquired],['Expiration Date',expiration],['Database Status',record['STATUS']]];
 details.innerHTML=fields.map(([label,value])=>`<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(normalize(value)||'—')}</dd></div>`).join('');
}

async function verify(control){
 const value=normalize(control); if(!value){controlInput.focus();return;}
 resultCard.classList.remove('hidden');statusBadge.className='status-badge';statusBadge.textContent='CHECKING…';resultTitle.textContent='Verifying ID';resultMessage.textContent='Connecting to the official verification database…';details.innerHTML='';
 try{
  const response=await fetch(`${API_URL}?control=${encodeURIComponent(value)}&t=${Date.now()}`,{cache:'no-store'});
  if(!response.ok)throw new Error(`Verification server returned ${response.status}.`);
  const data=await response.json(); if(!data||(!data.success&&!data.verified))throw new Error(data?.message||'Verification service error.');
  showResult(data,value);
 }catch(error){statusBadge.className='status-badge status-invalid';statusBadge.textContent='ERROR';resultTitle.textContent='Verification Unavailable';resultMessage.textContent=error?.message||'Unable to connect to the verification database. Please try again.';details.innerHTML='';console.error('Verification error:',error);}
}

function extractControl(text){
 const value=normalize(text); if(!value)return'';
 try{const url=new URL(value);const control=url.searchParams.get('control')||url.searchParams.get('CONTROL')||url.searchParams.get('control_number')||url.searchParams.get('id');if(control)return normalize(control);}catch(_){ }
 const match=value.match(/(?:CONTROL(?:\s+NUMBER)?|ID)\s*[:#=\-]?\s*([A-Za-z0-9\-]+)/i); return match?.[1]?normalize(match[1]):value;
}

function cameraErrorMessage(error){
 const name=error?.name||'';
 if(name==='NotAllowedError'||name==='PermissionDeniedError')return'Camera permission was denied. Allow camera access in your browser settings, then tap Scan QR Code again.';
 if(name==='NotFoundError'||name==='DevicesNotFoundError')return'No camera was found on this device.';
 if(name==='NotReadableError'||name==='TrackStartError')return'The camera is currently being used by another app. Close Camera, Messenger, Meet, Zoom, or another camera app and try again.';
 if(name==='SecurityError')return'Camera access requires HTTPS. Open the website using its HTTPS address.';
 if(name==='NotSupportedError')return'This browser does not support camera scanning.';
 return'Unable to start the camera. '+(error?.message||'Please check camera permission and try again.');
}

async function startScanner(){
 if(scannerRunning)return;
 scanLocked=false;scannerCard.classList.remove('hidden');scannerMessage.textContent='Starting camera…';
 try{
  if(!window.isSecureContext)throw new DOMException('HTTPS is required.','SecurityError');
  if(!navigator.mediaDevices?.getUserMedia)throw new DOMException('Camera API unavailable.','NotSupportedError');
  if(!window.Html5Qrcode){scannerMessage.textContent='QR scanner is still loading. Please wait a moment and try again.';return;}
  if(!scanner)scanner=new Html5Qrcode('reader');
  await scanner.start({facingMode:'environment'},{fps:10,qrbox:(w,h)=>{const size=Math.min(Math.max(Math.min(w,h)*.68,220),320);return{width:size,height:size};},aspectRatio:1,rememberLastUsedCamera:true,showTorchButtonIfSupported:true},async(decodedText)=>{
   if(scanLocked||!scannerRunning)return; scanLocked=true;scannerMessage.textContent='QR code detected. Verifying…';
   const control=extractControl(decodedText); if(!control){scanLocked=false;scannerMessage.textContent='QR code detected, but no Control Number was found. Try again.';return;}
   controlInput.value=control;await stopScanner();await verify(control);
  },()=>{});
  scannerRunning=true;scannerMessage.textContent='Point the rear camera at the QR code on the ID.';
 }catch(error){scannerRunning=false;scannerMessage.textContent=cameraErrorMessage(error);console.error('Scanner error:',error);}
}

async function stopScanner(){
 scannerRunning=false;scanLocked=true;
 if(scanner){try{const state=scanner.getState?.();if(state===2||state===3)await scanner.stop();}catch(error){console.warn('Scanner stop warning:',error);}}
 scannerCard.classList.add('hidden');
}

searchForm.addEventListener('submit',async e=>{e.preventDefault();await stopScanner();await verify(controlInput.value);});
scanBtn.addEventListener('click',startScanner);closeScanner.addEventListener('click',stopScanner);
verifyAnother.addEventListener('click',async()=>{await stopScanner();resultCard.classList.add('hidden');controlInput.value='';controlInput.focus();});
window.addEventListener('beforeunload',()=>{if(scanner){try{scanner.stop();}catch(_){}}});

const initialControl=new URLSearchParams(location.search).get('control');
if(initialControl){controlInput.value=normalize(initialControl);verify(initialControl);}
