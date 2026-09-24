module.exports = {
  "id": "co2",
  "name": "干冰(CO₂)",
  "formula": "CO₂",
  "crystalSystem": "cubic",
  "spaceGroup": "Pa3",
  "structuralUnit": "(CO₂)₄",
  "coordination": "无经典配位数（分子晶体，分子间为范德华力）",
  "latticeType": "简单立方(cP)",
  "packingDescription": "CO₂位于晶胞的顶点和面心，4个CO₂分子的轴线分别平行于晶胞的4条体对角线",
  "description": "固态CO₂（干冰）是典型的分子晶体。CO₂分子为线性O=C=O结构，C=O键长约1.16Å，4个分子沿不同体对角线方向排列。分子间以微弱的范德华力结合。干冰在-78.5°C直接升华，常压下无液态，广泛用作制冷剂。",
  "_molecularCrystal": true,
  "lattice": { "a": 5.624, "b": 5.624, "c": 5.624, "alpha": 90, "beta": 90, "gamma": 90 },
  "atoms": [
    {
      "element": "C",
      "color": "#505050",
      "radius": 0.70,
      "positions": [
        [0.0000, 0.0000, 0.0000],
        [0.0000, 0.5000, 0.5000],
        [0.5000, 0.0000, 0.5000],
        [0.5000, 0.5000, 0.0000]
      ],
      "ids": ["C1", "C2", "C3", "C4"]
    },
    {
      "element": "O",
      "color": "#EA4335",
      "radius": 0.66,
      "positions": [
        [0.1180, 0.1180, 0.1180],
        [0.8820, 0.8820, 0.8820],
        [0.1180, 0.3820, 0.6180],
        [0.8820, 0.6180, 0.3820],
        [0.3820, 0.8820, 0.6180],
        [0.6180, 0.1180, 0.3820],
        [0.6180, 0.3820, 0.8820],
        [0.3820, 0.6180, 0.1180]
      ],
      "ids": ["O1a", "O1b", "O2a", "O2b", "O3a", "O3b", "O4a", "O4b"]
    }
  ],
  "covalentBonds": [
    { "from": "C1", "to": "O1a", "color": "#666666" },
    { "from": "C1", "to": "O1b", "color": "#666666" },
    { "from": "C2", "to": "O2a", "color": "#666666" },
    { "from": "C2", "to": "O2b", "color": "#666666" },
    { "from": "C3", "to": "O3a", "color": "#666666" },
    { "from": "C3", "to": "O3b", "color": "#666666" },
    { "from": "C4", "to": "O4a", "color": "#666666" },
    { "from": "C4", "to": "O4b", "color": "#666666" }
  ],
  "interstices": {},
  "symmetry": {
    "axes": [
      { "type": "3-fold", "color": "#9C27B0", "direction": [1, 1, 1], "position": [0, 0, 0] },
      { "type": "2-fold", "color": "#2196F3", "direction": [1, 0, 0], "position": [0, 0, 0] }
    ],
    "mirrors": []
  }
}
