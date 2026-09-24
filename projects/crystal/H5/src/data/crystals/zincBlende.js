export default {
  "id": "zincBlende",
  "name": "立方ZnS(闪锌矿)",
  "formula": "ZnS",
  "crystalSystem": "cubic",
  "spaceGroup": "F-43m",
  "structuralUnit": "ZnS",
  "coordination": "Zn²⁺:4(S²⁻); S²⁻:4(Zn²⁺)",
  "latticeType": "面心立方(cF)",
  "packingDescription": "S²⁻按A1最密堆积，Zn²⁺相间填充其正四面体空隙，正四面体空隙占有率50%",
  "description": "闪锌矿结构与金刚石结构类似，两套面心立方子晶格分别由Zn和S占据。每个Zn被4个S四面体包围，每个S同样被4个Zn包围。与金刚石的区别在于两种原子不同，因此缺乏反演中心。",
  "lattice": { "a": 5.409, "b": 5.409, "c": 5.409, "alpha": 90, "beta": 90, "gamma": 90 },
  "atoms": [
    {
      "element": "Zn",
      "color": "#78909C",
      "radius": 1.22,  // Zn 共价半径 (sp³ 四面体配位)
      "positions": [
        [0.0, 0.0, 0.0], [0.0, 0.5, 0.5], [0.5, 0.0, 0.5], [0.5, 0.5, 0.0]
      ]
    },
    {
      "element": "S",
      "color": "#FFB300",
      "radius": 1.04,
      "positions": [
        [0.25, 0.25, 0.25], [0.25, 0.75, 0.75], [0.75, 0.25, 0.75], [0.75, 0.75, 0.25]
      ]
    }
  ],
  "equivalentSettings": [
    { "label": "顶点为Zn²⁺", "shift": [0, 0, 0] },
    { "label": "顶点为S²⁻", "shift": [0.75, 0.75, 0.75] }
  ],
  "interstices": {},
  "symmetry": {
    "axes": [
      { "type": "4-fold", "color": "#E91E63", "direction": [0, 0, 1], "position": [0, 0, 0] },
      { "type": "3-fold", "color": "#9C27B0", "direction": [1, 1, 1], "position": [0, 0, 0] },
      { "type": "2-fold", "color": "#2196F3", "direction": [1, 1, 0], "position": [0, 0, 0] }
    ],
    "mirrors": [
      { "color": "rgba(255,255,255,0.3)", "normal": [1, 1, 0], "distance": 0 }
    ]
  }
}
