(()=>{
// Find the component root — works even when HTML and JS are separate Webflow embeds
const root = document.querySelector('[data-prospex-calculator]');
if(!root || root.dataset.prospexCalculatorReady === 'true') return;
const instanceId = 'prospex-calc-' + Math.random().toString(36).slice(2, 9);
root.querySelectorAll('[id]').forEach(el=>{
  const originalId = el.id;
  el.dataset.prospexId = originalId;
  el.id = `${originalId}-${instanceId}`;
});
root.querySelectorAll('label[for]').forEach(label=>{
  const originalFor = label.getAttribute('for');
  if(originalFor) label.setAttribute('for', `${originalFor}-${instanceId}`);
});
const $ = id => root.querySelector(`[data-prospex-id="${id}"]`);
const readNum = (id,fallback)=>{ const el=$(id); const value=el ? parseFloat(el.value) : NaN; return Number.isFinite(value) ? value : fallback; };

// Price mode
let mode = 'discount';
function setMode(m, opts={}){
  mode=m;
  if(m==='discount'){
    $('md-discount').style.display='block'; $('md-direct').style.display='none';
    $('btn-disc').classList.add('prospex-calculator_on'); $('btn-dir').classList.remove('prospex-calculator_on');
  } else {
    $('md-discount').style.display='none'; $('md-direct').style.display='block';
    $('btn-dir').classList.add('prospex-calculator_on'); $('btn-disc').classList.remove('prospex-calculator_on');
    if(!opts.preservePrice){
      const p=readNum('i-price',0.45), d=readNum('i-discount',15);
      $('i-rprice').value=(p*(1-d/100)).toFixed(3);
    }
  }
  calc();
}

function issueP(){
  const p=readNum('i-price',0.45);
  if(mode==='discount') return p*(1-readNum('i-discount',15)/100);
  return Math.min(readNum('i-rprice',p*0.85), p);
}

// Sliders
function initSl(id,lvId,fmt){
  const sl=$(id), lv=$(lvId);
  function u(){
    const mn=+sl.min,mx=+sl.max,v=+sl.value,p=((v-mn)/(mx-mn))*100;
    sl.style.background=`linear-gradient(to right,var(--prospex-gold) 0%,var(--prospex-gold) ${p}%,#e4e9f0 ${p}%)`;
    lv.textContent=fmt(v);
  }
  sl.addEventListener('input',()=>{u();calc();}); u();
}
initSl('i-discount','disc-live',v=>v+'%');
initSl('i-royalty', 'roy-live', v=>parseFloat(v).toFixed(2)+'%');
initSl('i-years',   'yr-live',  v=>v+' years');
initSl('i-dr',      'dr-live',  v=>parseFloat(v).toFixed(1)+'%');
initSl('i-margin',  'margin-live',v=>v+'%');
initSl('i-spg',     'spg-live', v=>parseFloat(v).toFixed(1)+'% p.a.');

['i-capital','i-price','i-shares','i-revenue','i-rprice','i-start','i-ded','i-stage','i-commodity'].forEach(id=>{
  const el=$(id); if(el) el.addEventListener('input',calc);
});

// Producing checkbox — toggle pre-production date field and sync stage
$('i-producing').addEventListener('change', function(){
  const producing = this.checked;
  $('preprod-fields').style.display = producing ? 'none' : 'block';
  if(producing) $('i-stage').value = 'prod';
  else if($('i-stage').value === 'prod') $('i-stage').value = 'dev';
  calc();
});
$('i-stage').addEventListener('change', function(){
  if(this.value === 'prod') {
    $('i-producing').checked = true;
    $('preprod-fields').style.display = 'none';
  } else {
    $('i-producing').checked = false;
    $('preprod-fields').style.display = 'block';
  }
  calc();
});
const fM  = (v,dp=1)=>'A$'+v.toFixed(dp)+'M';
const fP  = (v,dp=1)=>v.toFixed(dp)+'%';
const fSh = v=>v.toFixed(1)+'M shares';
const fPB = v => isFinite(v) ? v.toFixed(1)+' yrs' : '> mine life';

// Colour the cheaper option green, more expensive red
function colourPair(eqEl, royEl, eqVal, royVal, lowerIsBetter){
  const eqWin  = lowerIsBetter ? eqVal  < royVal : eqVal  > royVal;
  const royWin = lowerIsBetter ? royVal < eqVal  : royVal > eqVal;
  eqEl.style.color  = eqWin  ? 'var(--prospex-bull-d)' : royWin ? 'var(--prospex-bear-d)' : 'var(--prospex-t2)';
  royEl.style.color = royWin ? 'var(--prospex-bull-d)' : eqWin  ? 'var(--prospex-bear-d)' : 'var(--prospex-t2)';
}

// IRR solver: Newton-Raphson with fallback bisection
function solveIRR(cashflows, guess=0.1){
  // Guard: need at least one sign change
  let hasPos=false, hasNeg=false;
  for(const c of cashflows){ if(c>0) hasPos=true; if(c<0) hasNeg=true; }
  if(!hasPos || !hasNeg) return NaN;

  let r = guess;
  for(let i=0; i<200; i++){
    let npv=0, dnpv=0;
    for(let t=0; t<cashflows.length; t++){
      const denom = Math.pow(1+r, t);
      if(!isFinite(denom) || denom===0) return NaN;
      npv  += cashflows[t] / denom;
      dnpv -= t * cashflows[t] / ((1+r) * denom);
    }
    if(!isFinite(npv) || !isFinite(dnpv) || dnpv===0) return NaN;
    const rNew = r - npv/dnpv;
    if(!isFinite(rNew)) return NaN;
    if(Math.abs(rNew-r) < 1e-8) return rNew;
    r = rNew;
    if(r < -0.999) r = -0.999; // clamp to avoid 1+r <= 0
  }
  return NaN; // didn't converge
}

// ── Default values (used for reset and progress tracking)
const DEFAULTS = {
  'i-price':'0.45','i-shares':'270','i-capital':'25','i-discount':'15',
  'i-rprice':'0.383','i-revenue':'300','i-margin':'20','i-royalty':'2',
  'i-years':'15','i-dr':'8','i-spg':'8','i-ded':'2','i-start':'2027-06',
  'i-stage':'dev','i-commodity':'nonprecious'
};

// ── Reset all inputs to defaults
function resetInputs(){
  Object.entries(DEFAULTS).forEach(([id,val])=>{
    const el=$(id); if(!el) return;
    el.value=val;
    // Re-trigger slider gradients
    el.dispatchEvent(new Event('input'));
  });
  $('i-producing').checked=false;
  $('preprod-fields').style.display='block';
  $('i-stage').value='dev';
  setMode('discount');
  calc();
}

// ── Progress indicator — counts how many key fields differ from defaults
function updateProgress(){
  const keys=['i-price','i-shares','i-capital','i-revenue','i-margin','i-royalty','i-years','i-dr','i-start'];
  const changed = keys.filter(id=>{
    const el=$(id); if(!el) return false;
    return el.value !== DEFAULTS[id];
  }).length;
  const pct    = Math.round((changed / keys.length) * 100);
  $('prog-fill').style.width = Math.min(100,pct)+'%';
  $('prog-pct').textContent  = Math.min(100,pct)+'%';
}

// ── Share URL — encode current inputs as URL params
function shareURL(){
  const params = new URLSearchParams();
  const keys=['i-price','i-shares','i-capital','i-discount','i-rprice','i-revenue','i-margin',
               'i-royalty','i-years','i-dr','i-spg','i-ded','i-start','i-stage','i-commodity'];
  keys.forEach(id=>{ const el=$(id); if(el) params.set(id.replace('i-',''),el.value); });
  params.set('mode', mode);
  if($('i-producing').checked) params.set('producing','1');
  const url = window.location.origin + window.location.pathname + '?' + params.toString();
  const showCopied=()=>{
    const toast=$('share-toast');
    toast.classList.add('prospex-calculator_show');
    setTimeout(()=>toast.classList.remove('prospex-calculator_show'),2500);
  };
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(url).then(showCopied).catch(()=>prompt('Copy this link:', url));
  } else {
    prompt('Copy this link:', url);
  }
}

// ── Load state from URL params on page load
function loadFromURL(){
  const params = new URLSearchParams(window.location.search);
  if(![...params].length) return;
  const map={price:'i-price',shares:'i-shares',capital:'i-capital',discount:'i-discount',
             rprice:'i-rprice',revenue:'i-revenue',margin:'i-margin',royalty:'i-royalty',
             years:'i-years',dr:'i-dr',spg:'i-spg',ded:'i-ded',start:'i-start',
             stage:'i-stage',commodity:'i-commodity'};
  Object.entries(map).forEach(([param,id])=>{
    const val=params.get(param); const el=$(id);
    if(val&&el){ el.value=val; el.dispatchEvent(new Event('input')); }
  });
  if(params.get('mode')==='direct') setMode('direct',{preservePrice: params.has('rprice')});
  if(params.get('producing')==='1'){
    $('i-producing').checked=true;
    $('preprod-fields').style.display='none';
    $('i-stage').value='prod';
  }
}

// PDF export
function exportPDF(){
  const existingStamp = $('print-stamp');
  if(existingStamp) existingStamp.remove();

  document.body.classList.add('prospex-calculator_pdf-mode');
  root.classList.add('prospex-calculator_is-printing');

  // Add a print timestamp line temporarily
  const stamp = document.createElement('div');
  stamp.dataset.prospexId = 'print-stamp';
  stamp.id = `print-stamp-${instanceId}`;
  stamp.className = 'prospex-calculator_print-stamp';
  const dateStr = new Date().toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
  stamp.textContent = `ProspEx Equity vs Royalty Analysis · Generated ${dateStr} · Indicative only, not financial advice`;
  root.querySelector('.prospex-calculator_wrap').prepend(stamp);

  let cleanedUp = false;
  let fallbackTimer;
  const cleanup = () => {
    if(cleanedUp) return;
    cleanedUp = true;
    root.classList.remove('prospex-calculator_is-printing');
    document.body.classList.remove('prospex-calculator_pdf-mode');
    const s=$('print-stamp'); if(s) s.remove();
    if(fallbackTimer) clearTimeout(fallbackTimer);
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup, {once:true});
  window.print();
  fallbackTimer = setTimeout(cleanup, 30000);
}

function calc(){
  try { _calc(); updateProgress(); } catch(e) { console.error('Calc error:', e); }
}

function _calc(){
  const price  = readNum('i-price',0.45);
  const shares = readNum('i-shares',270);
  const cap    = readNum('i-capital',25);
  const rev    = readNum('i-revenue',300);
  const mgn    = readNum('i-margin',20);
  const roy    = readNum('i-royalty',2.0);
  const ded    = readNum('i-ded',2.0);   // allowable deductions as % of revenue
  const yrs    = readNum('i-years',15);
  const dr       = readNum('i-dr',8.0);
  const spg      = readNum('i-spg',8.0);
  const stage     = $('i-stage').value     || 'dev';
  const commodity = $('i-commodity').value || 'nonprecious';
  const producing = $('i-producing').checked;

  // Lead time — zero if already in production
  let lead = 0;
  if(!producing){
    const sv=$('i-start').value;
    if(sv){ const sd=new Date(sv+'-01'); lead=Math.max(0,(sd-new Date())/(365.25*24*3600*1000)); }
    else lead = 1.5;
  }

  // Benchmark NAV multiple ranges from market data (price-to-NAV)
  // Source: typical royalty market ranges by stage and commodity
  const benchmarks = {
    nonprecious: { pfs:[0.2,0.5], dev:[0.5,0.8], prod:[1.0,1.2] },
    precious:    { pfs:[0.4,0.5], dev:[0.6,1.0], prod:[1.4,1.6] }
  };
  const bench = benchmarks[commodity][stage];

  const ip     = issueP();
  const discPct= price>0?(1-ip/price)*100:0;

  // Derived labels
  if(mode==='discount') $('der-price').textContent='A$'+ip.toFixed(3);
  else $('der-disc').textContent=discPct.toFixed(1)+'%';

  // ── Equity fundamentals
  const newSh     = cap/ip;
  const totSh     = shares+newSh;
  const dilPct    = (newSh/totSh)*100;
  const exPct     = 100-dilPct;
  const netProfitM= rev*(mgn/100);
  const epsM      = netProfitM/shares;       // annual net profit per M shares
  const epsCost   = epsM*newSh*yrs;          // total foregone earnings over mine life

  // ── Royalty fundamentals
  const netRevM = rev * (1 - ded/100);
  const royaM   = netRevM * (roy/100);
  const roytM   = royaM * yrs;
  const retPct  = 100 - (royaM/rev*100);

  // ── NAV: DCF of royalty cashflows
  const r = dr/100;
  let nav = 0;
  for(let t=0;t<yrs;t++) nav += royaM / Math.pow(1+r, lead+t+0.5);
  const priceToNav = nav>0 ? cap/nav : 0;

  // ── METRIC 1: IRR
  const eqDivAnnual = newSh * epsM;
  const eqTerminal  = newSh * ip * Math.pow(1+spg/100, yrs);
  const eqCFs = [-cap];
  for(let t=1;t<=yrs;t++) eqCFs.push(eqDivAnnual);
  eqCFs[yrs] += eqTerminal;
  const eqIRR = solveIRR(eqCFs) * 100;

  // Royalty buyer pays cap (not nav) — so their actual IRR is back-calculated from that price
  const royCFs2 = [-cap];
  const startYr = Math.ceil(lead);
  for(let t=1;t<=startYr+yrs;t++) royCFs2.push(t>startYr ? royaM : 0);
  const royIRR = solveIRR(royCFs2, dr/100) * 100;

  // ── METRIC 2: Payback
  const eqPB  = eqDivAnnual>0 ? cap/eqDivAnnual : Infinity;
  const royPB = royaM>0 ? cap/royaM : Infinity;

  // ── METRIC 3: Payout multiple
  const eqMult  = cap>0 ? epsCost/cap : 0;
  const royMult = cap>0 ? roytM/cap   : 0;

  // ── METRIC 4: Cumulative earnings impact — like-for-like
  // Equity: foregone net profit = epsCost (already calculated — EPS reduction × new shares × mine life)
  // Royalty: each royalty payment reduces revenue, which reduces net profit by payment × net margin
  //   With revenue growth, royalty payments also grow — use the same compounded total
  const royEarnImpact = roytM * (mgn/100);  // royalty payments × net margin

  // ── Render equity card
  $('r-newsh').textContent  = fSh(newSh);
  $('r-dil').textContent    = fP(dilPct);
  $('r-ip').textContent     = 'A$'+ip.toFixed(3)+' ('+discPct.toFixed(1)+'% disc.)';
  $('r-eps').textContent    = fM(epsCost);
  $('r-mgn').textContent    = mgn.toFixed(0)+'%';

  // ── Render royalty card
  $('r-roya').textContent  = fM(royaM);
  $('r-royt').textContent  = fM(roytM);
  $('r-ret').textContent   = fP(retPct,1)+' of gross revenue retained';

  // ── Royalty valuation card
  $('r-royprice').textContent  = fM(cap);
  $('r-nav').textContent       = fM(nav);
  $('r-dr-inline').textContent = dr.toFixed(1)+'%';
  const lStr = producing ? 'In production' : lead<0.08?'Imminent':lead<1?Math.round(lead*12)+' months':lead.toFixed(1)+' years';
  $('r-lead').textContent = lStr;

  // Price-to-NAV colour
  const navEl=$('r-navr');
  navEl.textContent = priceToNav.toFixed(2)+'× price-to-NAV';
  navEl.style.color = priceToNav<0.8 ? 'var(--prospex-gold)' : priceToNav<=1.0 ? 'var(--prospex-bull-d)' : 'var(--prospex-bear-d)';

  // ── Benchmark range visualiser
  // Scale: 0× to 2.0× across the track width
  const scaleMax = 2.0;
  const benchLo = bench[0], benchHi = bench[1];
  const fillLeft  = (benchLo/scaleMax*100).toFixed(1)+'%';
  const fillWidth = ((benchHi-benchLo)/scaleMax*100).toFixed(1)+'%';
  const markerLeft= Math.min(99,(priceToNav/scaleMax*100)).toFixed(1)+'%';
  $('bench-range-fill').style.left  = fillLeft;
  $('bench-range-fill').style.width = fillWidth;
  $('bench-marker').style.left      = markerLeft;

  const stageLabel = {pfs:'PFS/DFS', dev:'Development stage', prod:'Operational'}[stage];
  const commLabel  = commodity==='precious' ? 'Precious' : 'Non-precious';
  $('bench-label').textContent =
    `${commLabel} · ${stageLabel} · typical range: ${benchLo.toFixed(1)}× – ${benchHi.toFixed(1)}×`;

  // Marker colour: inside range = gold, below range = orange, above = green
  const inRange  = priceToNav >= benchLo && priceToNav <= benchHi;
  const belowRange = priceToNav < benchLo;
  $('bench-marker').style.background = inRange ? 'var(--prospex-bull-m)' : belowRange ? 'var(--prospex-bear-m)' : 'var(--prospex-bull-d)';

  // ── Context note
  let nn = '';
  const stageNames = {pfs:'PFS/DFS stage', dev:'development stage', prod:'operational'};
  const sn = stageNames[stage];

  if(inRange){
    nn = `At ${priceToNav.toFixed(2)}×, your implied price-to-NAV multiple sits within the typical market range of ${benchLo.toFixed(1)}×–${benchHi.toFixed(1)}× for a ${commLabel.toLowerCase()} ${sn} project. `;
    nn += `This is a commercially realistic transaction — the royalty price is consistent with what informed buyers would expect to pay at this stage.`;
  } else if(belowRange){
    nn = `At ${priceToNav.toFixed(2)}×, your implied multiple is below the typical ${benchLo.toFixed(1)}×–${benchHi.toFixed(1)}× range for a ${commLabel.toLowerCase()} ${sn} project. `;
    nn += `To improve the multiple in the miner's favour, the primary levers are: raising more capital (a larger royalty price relative to the same cashflow stream pushes the multiple up), or accepting a lower royalty rate which reduces the NPV and brings price and value closer together. `;
    nn += `The buyer discount rate will also naturally compress as the project advances — buyers typically apply higher rates to early-stage assets to reflect development risk, reducing toward around 8% once a project is in production. Genuine de-risking through permitting, financing, and construction will move the rate, not negotiation.`;
  } else {
    nn = `At ${priceToNav.toFixed(2)}×, your implied multiple is above the typical ${benchLo.toFixed(1)}×–${benchHi.toFixed(1)}× range for a ${commLabel.toLowerCase()} ${sn} project. `;
    nn += `A sophisticated buyer is unlikely to pay above the market range for this stage and commodity. A lower royalty rate would bring the transaction into a realistic range while still raising the capital required.`;
  }

  if(!producing && lead > 0.5){
    nn += ` With ${lStr} to production, the pre-production discount is the dominant pricing factor — buyers reduce their offer the further a project is from first cashflow, reflecting time value of money and development risk. As the project advances toward production, expect the buyer discount rate to compress and the achievable multiple to improve.`;
  }
  $('nav-note').textContent = nn;

  // ── Ownership bar
  requestAnimationFrame(()=>{
    $('own-ex').style.width=exPct.toFixed(1)+'%';
    $('own-ex-label').textContent=exPct>14?exPct.toFixed(0)+'%':'';
    $('own-nw').style.width=dilPct.toFixed(1)+'%';
    $('own-nw-label').textContent=dilPct>8?dilPct.toFixed(0)+'%':'';
  });

  // ── Cost of capital section — lower cost = green
  $('brd-spg-note').textContent = spg.toFixed(1)+'%';
  $('brd-cap-note').textContent = cap.toFixed(0);

  const eqIRRvalid  = isFinite(eqIRR)  && eqIRR>-50  && eqIRR<500;
  const royIRRvalid = isFinite(royIRR) && royIRR>-50 && royIRR<500;

  // Row 1: Cost of capital — lower IRR = cheaper for miner = green
  const eqIRREl  = $('brd-eq-irr');
  const royIRREl = $('brd-roy-irr');
  eqIRREl.textContent  = eqIRRvalid  ? fP(eqIRR)  : 'N/A';
  royIRREl.textContent = royIRRvalid ? fP(royIRR) : 'N/A';
  if(eqIRRvalid && royIRRvalid) colourPair(eqIRREl, royIRREl, eqIRR, royIRR, true);

  // Row 2: Payback — longer payback = slower drain = better for miner = green
  const eqPBEl  = $('brd-eq-pb');
  const royPBEl = $('brd-roy-pb');
  eqPBEl.textContent  = fPB(eqPB);
  royPBEl.textContent = fPB(royPB);
  if(isFinite(eqPB) && isFinite(royPB))
    colourPair(eqPBEl, royPBEl, eqPB, royPB, false); // higher = better for miner

  // Row 3: Payout multiple — lower = cheaper = green
  const eqMultEl  = $('brd-eq-mult');
  const royMultEl = $('brd-roy-mult');
  eqMultEl.textContent  = eqMult.toFixed(2)+'×';
  royMultEl.textContent = royMult.toFixed(2)+'×';
  colourPair(eqMultEl, royMultEl, eqMult, royMult, true);

  // Row 4: Earnings impact — lower = less drag on net profit = green
  const eqEarnEl  = $('brd-eq-earn');
  const royEarnEl = $('brd-roy-earn');
  eqEarnEl.textContent  = fM(epsCost);
  royEarnEl.textContent = fM(royEarnImpact);
  colourPair(eqEarnEl, royEarnEl, epsCost, royEarnImpact, true);

  // Summary sentence
  const irrDiff  = (eqIRRvalid && royIRRvalid) ? eqIRR - royIRR : null;
  const royWins  = (irrDiff===null||irrDiff>0) && royPB>=eqPB && royMult<=eqMult && royEarnImpact<=epsCost;
  const eqWins   = irrDiff!==null && irrDiff<0 && eqPB<royPB && eqMult<royMult && epsCost<=royEarnImpact;
  const royScore = [irrDiff!==null&&irrDiff>0, royPB>=eqPB, royMult<=eqMult, royEarnImpact<=epsCost].filter(Boolean).length;

  if(royWins){
    $('brd-summary').textContent=`Royalty is the lower cost of capital on all four measures — lower annualised rate, slower payback drain, lower total payout, and less cumulative earnings drag over the mine life.`;
  } else if(eqWins){
    $('brd-summary').textContent=`Equity is lower cost on all four measures at these settings. The share price growth assumption is the key variable — lower assumed growth shifts the advantage to royalty.`;
  } else {
    $('brd-summary').textContent=`Royalty wins ${royScore} of 4 cost metrics. The cost of capital rate and cumulative earnings impact are the most meaningful measures — adjust the share price growth assumption to test sensitivity.`;
  }

  // ── Verdict
  const sav = epsCost - roytM;
  if(sav>0 || royWins){
    $('v-head').textContent=`Royalty finance is the lower cost of capital on a like-for-like basis`;
    $('v-body').textContent=
      `A ${parseFloat(roy).toFixed(2)}% royalty on A$${rev}M revenue costs A$${royaM.toFixed(1)}M per year. `+
      `The royalty buyer, paying A$${cap}M, earns an implied IRR of ${royIRRvalid?fP(royIRR):'—'} — `+
      `versus ${eqIRRvalid?fP(eqIRR):'an estimated '+spg.toFixed(1)+'%+'} for an equity investor assuming ${spg.toFixed(1)}% p.a. share price growth. `+
      `Total royalty payments of A$${roytM.toFixed(1)}M represent a ${royMult.toFixed(2)}× payout multiple, versus ${eqMult.toFixed(2)}× for equity. No dilution, no placement discount, and no permanent transfer of equity ownership.`;
  } else {
    $('v-head').textContent=`Equity may be lower cost — review the share price growth assumption`;
    $('v-body').textContent=
      `At ${spg.toFixed(1)}% assumed annual share price growth, the implied equity IRR is ${eqIRRvalid?fP(eqIRR):'high'}, `+
      `below the royalty buyer's back-calculated IRR of ${royIRRvalid?fP(royIRR):'—'} on a A$${cap}M payment. `+
      `ProspEx can model the crossover growth rate at which royalty becomes the cheaper option for your specific project.`;
  }
} // end _calc

function bindActions(){
  root.querySelectorAll('[data-prospex-mode]').forEach(btn=>{
    btn.addEventListener('click',()=>setMode(btn.dataset.prospexMode));
  });
  root.querySelectorAll('[data-prospex-action="reset"]').forEach(btn=>{
    btn.addEventListener('click',resetInputs);
  });
  root.querySelectorAll('[data-prospex-action="share"]').forEach(btn=>{
    btn.addEventListener('click',shareURL);
  });
  root.querySelectorAll('[data-prospex-action="export-pdf"]').forEach(btn=>{
    btn.addEventListener('click',exportPDF);
  });
  root.querySelectorAll('[data-prospex-action="contact"]').forEach(btn=>{
    btn.addEventListener('click',()=>{ window.location.href = btn.dataset.prospexMailto; });
  });
}

bindActions();
loadFromURL();
calc();
})();
