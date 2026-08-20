# Measured agreement — the only validated part of this dataset

Charts 34 and 105 were transcribed independently 3x and 2x by readers who
could not see each other's output. This is the raw diff. **99 unit rows.**
The other 4,244 rows in this dataset have no equivalent measurement.

Every disagreement below is representational — glyph spelling, separator
style, or which row a straddling note belongs to. There were no substantive
disagreements about what a chart says. Those findings produced
`../CONVENTIONS.md`, which the full 122-chart run then followed, so the
`period` and `notes` rates below should be read as *before* that fix.

Regenerate with: `python3 ../tools/diffpass.py 034 105`

```

=== chart 034 ===
  passA_034.json     45 units
  passB_034.json     45 units
  passC_034.json     45 units
  cell agreement: 254/270 = 94.07%
    row                44/45    97.78%
    period             38/45    84.44%
    parent_unit        45/45   100.00%
    unit_name          45/45   100.00%
    thickness_text     45/45   100.00%
    notes              37/45    82.22%
  16 disagreeing cells:
    seq   3 period         'o-m-p' | 'φ-m-p' | 'φ-m-p'
    seq   3 notes          'post 17 m.y., not exposed / basin-range unco' | 'post 17 m.y., not exposed; basin-range uncon' | 'post 17 m.y., not exposed'
    seq   4 period         'o-m-p' | 'φ-m-p' | 'φ-m-p'
    seq   4 notes          'salt lake salient' | 'salt lake salient' | 'basin-range unconformity; salt lake salient'
    seq   5 period         'o-m-p' | 'φ-m-p' | 'φ-m-p'
    seq   6 period         'o-m-p' | 'φ-m-p' | 'φ-m-p'
    seq  16 notes          'greenish-gray' | '' | ''
    seq  17 notes          'marine beds' | 'greenish-gray; marine beds' | 'greenish-gray; marine beds'
    seq  27 notes          'conodonts: neospathodus, platyvillosus, neog' | 'conodonts; neospathodus; platyvillosus; neog' | 'conodonts; neospathodus; platyvillosus; neog'
    seq  31 period         'p' | 'penn' | 'penn'
    seq  33 row            '31' | '32' | '32'
    seq  41 notes          'reddish-purple, feldspathic quartzite' | 'reddish-purple; feldspathic quartzite' | 'reddish-purple; feldspathic quartzite'
    seq  42 notes          'glacial till & mudstone with microfossils' | 'glacial till & mudstone; with microfossils' | 'glacial till & mudstone with microfossils'
    seq  43 notes          'bavelinella; interbedded quartzites & argill' | 'bavelinella; interbedded quartzites; & argil' | 'bavelinella; interbedded quartzites & argill'
    seq  44 period         'pp' | 'pp*' | 'pp*'
    seq  45 period         'pp' | 'pp*' | 'pp*'

=== chart 105 ===
  passB_105.json     54 units
  passC_105.json     54 units
  cell agreement: 303/324 = 93.52%
    row                54/54   100.00%
    period             52/54    96.30%
    parent_unit        53/54    98.15%
    unit_name          54/54   100.00%
    thickness_text     54/54   100.00%
    notes              36/54    66.67%
  21 disagreeing cells:
    seq   1 notes          'large landslides sometimes; dam the river in' | 'large landslides sometimes dam the river in '
    seq   3 notes          '0.18 ± 0.028; ar/ar; these 9' | '0.18 ± 0.028; ar/ar; these 9 flows near zion'
    seq   4 notes          '0.22- 0.31; flows near zion' | '0.22- 0.31'
    seq   5 notes          '0.74 ± 0.05; are only a few; of the many flo' | '0.74 ± 0.05'
    seq   6 notes          '0.84 - 0.88; younger than 2' | '0.84 - 0.88'
    seq   7 notes          '1.03 ± 0.06; m.y. found in' | '1.03 ± 0.06'
    seq   8 notes          '1.05 ± 0.05; southwestern' | '1.05 ± 0.05'
    seq   9 notes          '1.02 - 1.14; utah; their ages; help date fau' | '1.02 - 1.14'
    seq  10 notes          '1.44 m.y.; activity' | '1.44 m.y'
    seq  13 notes          'vertical cliffs, "gray cliffs of the; grand ' | 'vertical cliffs, "gray cliffs of the grand s'
    seq  24 notes          'j-1 unconformity; upper third: white cross-b' | 'j-1 unconformity; upper third: white cross-b'
    seq  25 parent_unit    '' | 'kayenta fm'
    seq  27 notes          'red (vermilion) siltstone with; interbeds of' | 'red (vermilion) siltstone with interbeds of '
    seq  31 notes          'j-0 unconformity; varicolored claystone, slt' | 'j-0 unconformity; varicolored claystone, slt'
    seq  34 notes          'interbedded red siltstone &; white gypsum; b' | 'interbedded red siltstone & white gypsum; ba'
    seq  35 notes          'reddish-brown siltstone,; mudstone & sandsto' | 'reddish-brown siltstone, mudstone & sandston'
    seq  39 notes          'chert-pebble conglomerate; tr-1 unconformity' | 'chert-pebble conglomerate'
    seq  40 notes          'gypsum & limestone' | 'tr-1 unconformity; gypsum & limestone'
    seq  45 notes          'tan & red sandstone; subsurface at zion np; ' | 'tan & red sandstone; subsurface at zion np k'
    seq  47 period         'ip' | 'p'
    seq  54 period         'pꞓ' | 'pє'

=== OVERALL: 557/594 = 93.77% cell agreement ===
```
