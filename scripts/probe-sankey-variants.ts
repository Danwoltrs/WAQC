import { computeSankeyLayout } from '@/lib/charts/sankey-layout'

// Type 1: 4-col final-buyer (Dunkin)
const t1 = computeSankeyLayout(
  [
    { id: 'sh:Cocatrel', label: 'Cocatrel', column: 0, approvalRate: 95 },
    { id: 'se:Cocatrel', label: 'Cocatrel', column: 1 },
    { id: 'im:CoffeeAm', label: 'Coffee America', column: 2 },
    { id: 'ro:MotherParkers', label: 'Mother Parkers', column: 3 },
  ],
  [
    { source: 'sh:Cocatrel', target: 'se:Cocatrel', value: 1000 },
    { source: 'se:Cocatrel', target: 'im:CoffeeAm', value: 1000 },
    { source: 'im:CoffeeAm', target: 'ro:MotherParkers', value: 1000 },
  ],
  { width: 720, height: 260 },
)
console.log(`Type 1 (final_buyer): ${t1.nodes.length} nodes, ${t1.links.length} links`)
console.log('  columns used:', [...new Set(t1.nodes.map(n => n.column))].sort())

// Type 2: 3-col roaster (Ahold)
const t2 = computeSankeyLayout(
  [
    { id: 'sh:Comexim', label: 'Comexim', column: 0, approvalRate: 100 },
    { id: 'se:Comexim', label: 'Comexim', column: 1 },
    { id: 'im:Ahold', label: 'Ahold', column: 2 },
  ],
  [
    { source: 'sh:Comexim', target: 'se:Comexim', value: 3500 },
    { source: 'se:Comexim', target: 'im:Ahold', value: 3500 },
  ],
  { width: 720, height: 260 },
)
console.log(`Type 2 (roaster): ${t2.nodes.length} nodes, ${t2.links.length} links`)
console.log('  columns used:', [...new Set(t2.nodes.map(n => n.column))].sort())

// Type 3: 2-col importer (Blaser)
const t3 = computeSankeyLayout(
  [
    { id: 'sh:Nucoffee', label: 'Nucoffee', column: 0, approvalRate: 100 },
    { id: 'se:Nucoffee', label: 'Nucoffee', column: 1 },
    { id: 'sh:GranoTrading', label: 'Grano Trading', column: 0, approvalRate: 100 },
    { id: 'se:GranoTrading', label: 'Grano Trading', column: 1 },
  ],
  [
    { source: 'sh:Nucoffee', target: 'se:Nucoffee', value: 1280 },
    { source: 'sh:GranoTrading', target: 'se:GranoTrading', value: 960 },
  ],
  { width: 720, height: 260 },
)
console.log(`Type 3 (importer): ${t3.nodes.length} nodes, ${t3.links.length} links`)
console.log('  columns used:', [...new Set(t3.nodes.map(n => n.column))].sort())
console.log('  type-3 layout check:')
for (const n of t3.nodes) console.log(`    col=${n.column} ${n.label} x=[${n.x0.toFixed(0)},${n.x1.toFixed(0)}] y=[${n.y0.toFixed(0)},${n.y1.toFixed(0)}]`)
