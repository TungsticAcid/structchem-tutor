export default {
  "id": "ice",
  "name": "冰(H₂O)",
  "formula": "H₂O",
  "crystalSystem": "hexagonal",
  "spaceGroup": "P6₃/mmc",
  "structuralUnit": "(H₂O)₄",
  "coordination": "无经典配位数（分子晶体，分子间为氢键）",
  "latticeType": "简单六方(hP)",
  "packingDescription": "晶胞中有4个H₂O分子，取向各不相同，相邻水分子间以氢键连接",
  "description": "冰是自然界最常见的冰晶型，O原子形成类纤锌矿的四面体骨架。晶胞含4个H₂O分子。O原子处于近似四面体配位中。每个水分子内O-H键长约0.96Å，HOH角约109.5°。每个O原子与2个H以共价键结合（O-H），并通过另外2个O···H-O氢键接受质子。冰的开放结构使其密度（0.917g/cm³）低于液态水，因此冰浮于水上。",
  "_molecularCrystal": true,
  "lattice": {
    "a": 4.523, "b": 4.523, "c": 7.367,
    "alpha": 90, "beta": 90, "gamma": 120
  },
  "atoms": [
    {
      "element": "O",
      "color": "#EA4335",
      "radius": 0.73,
      "positions": [
        [0.0000, 0.0000, 0.0000],
        [0.3333, 0.6667, 0.5000],
        [0.3333, 0.6667, 0.8736],
        [0.0000, 0.0000, 0.3736]
      ],
      "ids": ["O1", "O2", "O3", "O4"]
    },
    {
      "element": "H",
      "color": "#FFFFFF",
      "radius": 0.25,
      "positions": [
        [0.0000, 0.0000, 0.1303],
        [0.1154, 0.2308, 0.9562],
        [0.3333, 0.6667, 0.6303],
        [0.2179, 0.4358, 0.4562],
        [0.5642, 0.7821, 0.9174],
        [0.2179, 0.7821, 0.9174],
        [0.7691, 0.8846, 0.4174],
        [0.1154, 0.8846, 0.4174]
      ],
      "ids": ["H1a", "H1b", "H2a", "H2b", "H3a", "H3b", "H4a", "H4b"]
    }
  ],
  "covalentBonds": [
    { "from": "O1", "to": "H1a", "color": "#FFFFFF" },
    { "from": "O1", "to": "H1b", "color": "#FFFFFF" },
    { "from": "O2", "to": "H2a", "color": "#FFFFFF" },
    { "from": "O2", "to": "H2b", "color": "#FFFFFF" },
    { "from": "O3", "to": "H3a", "color": "#FFFFFF" },
    { "from": "O3", "to": "H3b", "color": "#FFFFFF" },
    { "from": "O4", "to": "H4a", "color": "#FFFFFF" },
    { "from": "O4", "to": "H4b", "color": "#FFFFFF" }
  ],
  "hydrogenBonds": [
    { "from": "H1a", "to": "O4", "color": "#64B5F6" },
    { "from": "H1b", "to": "O3", "color": "#64B5F6" },
    { "from": "H2a", "to": "O3", "color": "#64B5F6" },
    { "from": "H2b", "to": "O4", "color": "#64B5F6" },
    { "from": "H3a", "to": "O1", "color": "#64B5F6" },
    { "from": "H3b", "to": "O1", "color": "#64B5F6" },
    { "from": "H4a", "to": "O2", "color": "#64B5F6" },
    { "from": "H4b", "to": "O2", "color": "#64B5F6" }
  ],
  "interstices": {},
  "symmetry": {
    "axes": [
      { "type": "6-fold", "color": "#FF9800", "direction": [0, 0, 1], "position": [0.6667, 0.3333, 0.1868] },
      { "type": "2-fold", "color": "#2196F3", "direction": [1, 0, 0], "position": [0.6667, 0.3333, 0.1868] },
      { "type": "2-fold", "color": "#2196F3", "direction": [0, 1, 0], "position": [0.6667, 0.3333, 0.1868] }
    ],
    "mirrors": [
      { "color": "rgba(60,60,60,0.35)", "normal": [0, 0, 1], "distance": 0.25 }
    ]
  }
}
