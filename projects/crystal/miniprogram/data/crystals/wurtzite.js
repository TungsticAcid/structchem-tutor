module.exports = {
  "id": "wurtzite",
  "name": "六方ZnS(纤锌矿)",
  "formula": "ZnS",
  "crystalSystem": "hexagonal",
  "spaceGroup": "P6₃mc",
  "structuralUnit": "Zn₂S₂",
  "coordination": "Zn²⁺:4(S²⁻); S²⁻:4(Zn²⁺)",
  "latticeType": "简单六方(hP)",
  "packingDescription": "S²⁻按A3最密堆积，Zn²⁺相间填充其正四面体空隙，正四面体空隙占有率50%",
  "description": "纤锌矿是ZnS的六方变体，Zn和S各构成六方密堆积子晶格，沿c轴位移3/8。每个Zn被4个S四面体配位，反之亦然。常见于ZnO、CdS、GaN等半导体材料。",
  "lattice": { "a": 3.820, "b": 3.820, "c": 6.260, "alpha": 90, "beta": 90, "gamma": 120 },
  "atoms": [
    {
      "element": "Zn",
      "color": "#78909C",
      "radius": 1.22,  // Zn 共价半径 (sp³ 四面体配位)
      "positions": [
        [0.0, 0.0, 0.0],
        [1/3, 2/3, 0.5]
      ]
    },
    {
      "element": "S",
      "color": "#FFB300",
      "radius": 1.04,
      "positions": [
        [0.0, 0.0, 0.375],
        [1/3, 2/3, 0.875]
      ]
    }
  ],
  "interstices": {},
  "symmetry": {
    "axes": [
      { "type": "6-fold", "color": "#FF6F00", "direction": [0, 0, 1], "position": [0.0, 0.0, 0.0] },
      { "type": "2-fold", "color": "#2196F3", "direction": [1, 0, 0], "position": [0.666667, 0.333333, 0.0] }
    ],
    "mirrors": [
      { "color": "rgba(255,255,255,0.3)", "normal": [1, 0, 0], "distance": 0 }
    ]
  }
}
