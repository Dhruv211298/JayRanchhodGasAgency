const assert = require('assert/strict');
const { replayChain } = require('../scripts/repair-stock.js');
const key = (d,p) => d+'|'+p;
let pass=0, fail=0;
const t=(n,f)=>{try{f();pass++;console.log('  PASS  '+n);}catch(e){fail++;console.log('  FAIL  '+n+'\n         '+e.message);}};

function build(days, pid='p14'){
  const dates = days.map(d=>d.date);
  const stock = new Map(), arrivals = new Map(), credits = new Map();
  for (const d of days){
    stock.set(key(d.date,pid), {
      opening_stock: d.storedOpening, closing_stock: d.storedClosing,
      sell_qty: d.sell||0, online_qty: d.online||0, sbc_qty: d.sbc||0, dbc_qty: d.dbc||0
    });
    if (d.received) arrivals.set(key(d.date,pid), d.received);
    if (d.credit)   credits.set(key(d.date,pid), d.credit);
  }
  return { dates, products:[pid], stock, arrivals, credits, key };
}

console.log('\n── Repair algorithm ──');

t('clean chain with no credit sales needs no correction', ()=>{
  const r = replayChain(build([
    {date:'2026-01-01', storedOpening:100, storedClosing:90, sell:10},
    {date:'2026-01-02', storedOpening:90,  storedClosing:80, sell:10},
    {date:'2026-01-03', storedOpening:80,  storedClosing:75, sell:5},
  ]));
  assert.equal(r.changes.length, 0);
});

t('reproduces and repairs the credit-sale drift', ()=>{
  // Buggy history: day 1 sold 5 on credit but closing was saved without deducting them.
  const r = replayChain(build([
    {date:'2026-01-01', storedOpening:100, storedClosing:90, sell:10, credit:5},
    {date:'2026-01-02', storedOpening:90,  storedClosing:80, sell:10},
  ]));
  assert.equal(r.changes.length, 2);
  assert.equal(r.changes[0].newClosing, 85);          // 100 - 10 - 5
  assert.equal(r.changes[1].newOpening, 85);          // carried forward
  assert.equal(r.changes[1].newClosing, 75);          // 85 - 10
  assert.equal(r.summary.p14.finalDrift, -5);         // system was over-stating by 5
});

t('drift compounds across multiple credit days', ()=>{
  const r = replayChain(build([
    {date:'2026-02-01', storedOpening:200, storedClosing:190, sell:10, credit:4},
    {date:'2026-02-02', storedOpening:190, storedClosing:180, sell:10, credit:6},
    {date:'2026-02-03', storedOpening:180, storedClosing:170, sell:10},
  ]));
  assert.equal(r.changes[2].newClosing, 200-10-4-10-6-10);  // 160
  assert.equal(r.summary.p14.finalDrift, -10);              // total credit cylinders
});

t('first entry seeds the chain and keeps its stored opening', ()=>{
  const r = replayChain(build([
    {date:'2026-03-01', storedOpening:500, storedClosing:495, sell:5},
  ]));
  assert.equal(r.changes.length, 0);
});

t('plant arrivals are added back', ()=>{
  const r = replayChain(build([
    {date:'2026-04-01', storedOpening:50, storedClosing:40, sell:10},
    {date:'2026-04-02', storedOpening:40, storedClosing:30, sell:10, received:100, credit:0},
  ]));
  // day2 correct closing = 40 + 100 - 10 = 130
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0].newClosing, 130);
});

t('gaps in dates do not break the chain', ()=>{
  const r = replayChain(build([
    {date:'2026-05-01', storedOpening:100, storedClosing:95, sell:5, credit:2},
    {date:'2026-05-09', storedOpening:95,  storedClosing:90, sell:5},   // 8-day gap
  ]));
  assert.equal(r.changes[0].newClosing, 93);
  assert.equal(r.changes[1].newOpening, 93);
  assert.equal(r.changes[1].newClosing, 88);
});

t('days where a product was not traded are skipped', ()=>{
  const dates = ['2026-06-01','2026-06-02','2026-06-03'];
  const stock = new Map();
  stock.set(key('2026-06-01','p19'), {opening_stock:20, closing_stock:18, sell_qty:2});
  stock.set(key('2026-06-03','p19'), {opening_stock:18, closing_stock:16, sell_qty:2});
  const r = replayChain({dates, products:['p19'], stock, arrivals:new Map(), credits:new Map(), key});
  assert.equal(r.summary.p19.days, 2);
  assert.equal(r.changes.length, 0);
});

t('multiple products are repaired independently', ()=>{
  const dates=['2026-07-01','2026-07-02'];
  const stock=new Map(), credits=new Map();
  stock.set(key('2026-07-01','p14'),{opening_stock:100,closing_stock:90,sell_qty:10});
  stock.set(key('2026-07-02','p14'),{opening_stock:90, closing_stock:85,sell_qty:5});
  stock.set(key('2026-07-01','p19'),{opening_stock:50, closing_stock:45,sell_qty:5});
  stock.set(key('2026-07-02','p19'),{opening_stock:45, closing_stock:40,sell_qty:5});
  credits.set(key('2026-07-01','p19'), 3);   // only p19 had a credit sale
  const r = replayChain({dates, products:['p14','p19'], stock, arrivals:new Map(), credits, key});
  assert.equal(r.summary.p14.changed, 0, 'p14 should be untouched');
  assert.equal(r.summary.p19.changed, 2);
  assert.equal(r.summary.p19.finalDrift, -3);
});

t('repaired chain is internally consistent (closing[n] == opening[n+1])', ()=>{
  const days=[
    {date:'2026-08-01', storedOpening:300, storedClosing:290, sell:10, credit:3},
    {date:'2026-08-02', storedOpening:290, storedClosing:275, sell:15, credit:2, received:0},
    {date:'2026-08-03', storedOpening:275, storedClosing:365, sell:10, received:100},
    {date:'2026-08-04', storedOpening:365, storedClosing:350, sell:15, credit:5},
  ];
  const r = replayChain(build(days));
  const byDate = Object.fromEntries(r.changes.map(c=>[c.date,c]));
  const seq = days.map(d=>byDate[d.date]).filter(Boolean);
  for (let i=0;i<seq.length-1;i++){
    assert.equal(seq[i].newClosing, seq[i+1].newOpening,
      `closing of ${seq[i].date} != opening of ${seq[i+1].date}`);
  }
  // Conservation: final closing = seed + all received - all out
  const totalOut = days.reduce((s,d)=>s+(d.sell||0)+(d.credit||0),0);
  const totalIn  = days.reduce((s,d)=>s+(d.received||0),0);
  assert.equal(seq[seq.length-1].newClosing, 300 + totalIn - totalOut);
});

t('running twice is idempotent — second run finds nothing', ()=>{
  const days=[
    {date:'2026-09-01', storedOpening:100, storedClosing:90, sell:10, credit:5},
    {date:'2026-09-02', storedOpening:90,  storedClosing:80, sell:10},
  ];
  const first = replayChain(build(days));
  // Apply the corrections, then replay again
  const fixed = days.map(d=>{
    const c = first.changes.find(x=>x.date===d.date);
    return c ? {...d, storedOpening:c.newOpening, storedClosing:c.newClosing} : d;
  });
  const second = replayChain(build(fixed));
  assert.equal(second.changes.length, 0, 'second run should be a no-op');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail);
