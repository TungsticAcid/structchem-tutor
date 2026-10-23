export default {
  "id": "diamond",
  "name": "金刚石型",
  "formula": "C",
  "crystalSystem": "cubic",
  "spaceGroup": "Fd-3m",
  "structuralUnit": "C₂",
  "coordination": "C:4(C)",
  "latticeType": "面心立方(cF)",
  "packingDescription": "两套FCC子晶格沿体对角线方向位移1/4体对角线，A4堆积",
  "description": "金刚石型结构中碳原子以sp³杂化形成共价键，每个碳原子被4个碳原子四面体包围。晶胞中有8个C原子，分别属于两套不等效的等效点系。该结构可视为两套面心立方子晶格沿体对角线方向位移1/4体对角线而成。碳的同素异形体之一，自然界最硬的物质。",
  "lattice": { "a": 3.567, "b": 3.567, "c": 3.567, "alpha": 90, "beta": 90, "gamma": 90 },
  "atoms": [
    {
      "element": "C",
      "color": "#505050",
      "radius": 0.77,
      "positions": [
        [0.0, 0.0, 0.0], [0.0, 0.5, 0.5], [0.5, 0.0, 0.5], [0.5, 0.5, 0.0],
        [0.25, 0.25, 0.25], [0.25, 0.75, 0.75], [0.75, 0.25, 0.75], [0.75, 0.75, 0.25]
      ]
    }
  ],
  "interstices": {},
  // "bonds": [
  //   { "from": [0.0, 0.0, 0.0], "to": [0.25, 0.25, 0.25], "color": "#808080", "dashed": false },
  //   { "from": [0.0, 0.5, 0.5], "to": [0.25, 0.25, 0.25], "color": "#808080", "dashed": false },
  //   { "from": [0.5, 0.0, 0.5], "to": [0.25, 0.25, 0.25], "color": "#808080", "dashed": false },
  //   { "from": [0.5, 0.5, 0.0], "to": [0.25, 0.25, 0.25], "color": "#808080", "dashed": false },
  //   { "from": [0.25, 0.75, 0.75], "to": [0.0, 0.5, 0.5], "color": "#808080", "dashed": false },
  //   { "from": [0.25, 0.75, 0.75], "to": [0.5, 0.5, 0.0], "color": "#808080", "dashed": false },
  //   { "from": [0.25, 0.75, 0.75], "to": [0.0, 0.0, 0.0], "color": "#808080", "dashed": false },
  //   { "from": [0.25, 0.75, 0.75], "to": [0.5, 0.0, 0.5], "color": "#808080", "dashed": false },
  //   { "from": [0.75, 0.25, 0.75], "to": [0.5, 0.0, 0.5], "color": "#808080", "dashed": false },
  //   { "from": [0.75, 0.25, 0.75], "to": [0.0, 0.0, 0.0], "color": "#808080", "dashed": false },
  //   { "from": [0.75, 0.25, 0.75], "to": [0.5, 0.5, 0.0], "color": "#808080", "dashed": false },
  //   { "from": [0.75, 0.25, 0.75], "to": [0.0, 0.5, 0.5], "color": "#808080", "dashed": false },
  //   { "from": [0.75, 0.75, 0.25], "to": [0.5, 0.5, 0.0], "color": "#808080", "dashed": false },
  //   { "from": [0.75, 0.75, 0.25], "to": [0.0, 0.5, 0.5], "color": "#808080", "dashed": false },
  //   { "from": [0.75, 0.75, 0.25], "to": [0.5, 0.0, 0.5], "color": "#808080", "dashed": false },
  //   { "from": [0.75, 0.75, 0.25], "to": [0.0, 0.0, 0.0], "color": "#808080", "dashed": false }
  // ],
  "symmetry": {
    "axes": [
      { "type": "4-fold", "color": "#E91E63", "direction": [0, 0, 1], "position": [0, 0, 0] },
      { "type": "3-fold", "color": "#9C27B0", "direction": [1, 1, 1], "position": [0, 0, 0] },
      { "type": "2-fold", "color": "#2196F3", "direction": [1, 1, 0], "position": [0, 0, 0] }
    ],
    "mirrors": [
      { "color": "rgba(60,60,60,0.35)", "normal": [1, 1, 0], "distance": 0 }
    ]
  }
}
