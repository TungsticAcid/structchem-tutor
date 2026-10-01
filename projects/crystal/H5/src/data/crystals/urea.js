export default {
  "id": "urea",
  "name": "尿素(CO(NH₂)₂)",
  "formula": "CO(NH₂)₂",
  "crystalSystem": "tetragonal",
  "spaceGroup": "P-42₁m",
  "structuralUnit": "[(NH₂)₂CO]₂",
  "coordination": "无经典配位数（分子晶体，分子间为氢键）",
  "latticeType": "简单四方(tP)",
  "packingDescription": "(NH₂)₂CO位于晶胞的顶点和体心，两个分子的取向不同",
  "description": "尿素晶体是典型的有机分子晶体。分子内C=O与两个NH₂基团以共价键连接，分子间通过N-H···O氢键形成三维网络。每个O原子接受4个N-H···O氢键，形成扭曲的四面体氢键环境。尿素是重要的化肥原料和工业化学品。",
  "_molecularCrystal": true,
  "lattice": { "a": 5.576, "b": 5.576, "c": 4.686, "alpha": 90, "beta": 90, "gamma": 90 },
  "atoms": [
    {
      "element": "C",
      "color": "#505050",
      "radius": 0.7,
      "positions": [
        [0.0000, 0.0000, 0.0000],
        [0.5000, 0.5000, 0.3440]
      ],
      "ids": ["C1", "C2"]
    },
    {
      "element": "O",
      "color": "#EA4335",
      "radius": 0.66,
      "positions": [
        [0.0000, 0.0000, 0.2690],
        [0.5000, 0.5000, 0.0750]
      ],
      "ids": ["O1", "O2"]
    },
    {
      "element": "N",
      "color": "#4285F4",
      "radius": 0.7,
      "positions": [
        [0.1450, 0.1450, 0.8510],
        [0.8550, 0.8550, 0.8510],
        [0.3550, 0.6450, 0.4930],
        [0.6450, 0.3550, 0.4930]
      ],
      "ids": ["N1", "N2", "N3", "N4"]
    },
    {
      "element": "H",
      "color": "#FFFFFF",
      "radius": 0.36,
      "positions": [
        [0.2620, 0.2620, 0.9630],
        [0.1290, 0.1290, 0.6300],
        [0.7380, 0.7380, 0.9630],
        [0.8710, 0.8710, 0.6300],
        [0.2380, 0.7620, 0.3810],
        [0.3710, 0.6290, 0.7140],
        [0.7620, 0.2380, 0.3810],
        [0.6290, 0.3710, 0.7140]
      ],
      "ids": ["H1a", "H1b", "H2a", "H2b", "H3a", "H3b", "H4a", "H4b"]
    }
  ],
  "covalentBonds": [
    { "from": "C1", "to": "O1", "color": "#FF6600" },
    { "from": "C1", "to": "N1", "color": "#448AFF" },
    { "from": "C1", "to": "N2", "color": "#448AFF" },
    { "from": "C2", "to": "O2", "color": "#FF6600" },
    { "from": "C2", "to": "N3", "color": "#448AFF" },
    { "from": "C2", "to": "N4", "color": "#448AFF" },
    { "from": "N1", "to": "H1a", "color": "#B0BEC5" },
    { "from": "N1", "to": "H1b", "color": "#B0BEC5" },
    { "from": "N2", "to": "H2a", "color": "#B0BEC5" },
    { "from": "N2", "to": "H2b", "color": "#B0BEC5" },
    { "from": "N3", "to": "H3a", "color": "#B0BEC5" },
    { "from": "N3", "to": "H3b", "color": "#B0BEC5" },
    { "from": "N4", "to": "H4a", "color": "#B0BEC5" },
    { "from": "N4", "to": "H4b", "color": "#B0BEC5" }
  ],
  "hydrogenBonds": [
    { "from": "H1a", "to": "O2", "color": "#FFAB40" },
    { "from": "H1b", "to": "O1", "color": "#FFAB40" },
    { "from": "H2a", "to": "O2", "color": "#FFAB40" },
    { "from": "H2b", "to": "O1", "color": "#FFAB40" },
    { "from": "H3a", "to": "O1", "color": "#FFAB40" },
    { "from": "H3b", "to": "O2", "color": "#FFAB40" },
    { "from": "H4a", "to": "O1", "color": "#FFAB40" },
    { "from": "H4b", "to": "O2", "color": "#FFAB40" }
  ],
  "interstices": {},
  "symmetry": {
    "axes": [
      { "type": "4-fold", "color": "#E91E63", "direction": [0, 0, 1], "position": [0.0000, 0.5000, 0.6720] },
      { "type": "2-fold", "color": "#2196F3", "direction": [1, 1, 0], "position": [0.0000, 0.5000, 0.6720] },
      { "type": "2-fold", "color": "#2196F3", "direction": [1, -1, 0], "position": [0.0000, 0.5000, 0.6720] }
    ],
    "mirrors": [
      { "color": "rgba(60,60,60,0.35)", "normal": [1, 1, 0], "distance": 0 }
    ]
  }
}
