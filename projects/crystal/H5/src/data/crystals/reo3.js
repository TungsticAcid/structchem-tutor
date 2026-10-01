export default {
  "id": "reo3",
  "name": "ReO₃型",
  "formula": "ReO₃",
  "crystalSystem": "cubic",
  "spaceGroup": "Pm-3m",
  "structuralUnit": "ReO₃",
  "coordination": "Re⁶⁺:6(O²⁻); O²⁻:2(Re⁶⁺)",
  "latticeType": "简单立方(cP)",
  "packingDescription": "Re⁶⁺按简单立方排列，O²⁻位于立方体每条棱的中心",
  "description": "ReO₃结构可视为钙钛矿去掉A位阳离子（如BaTiO₃去掉Ba）。Re在顶点，O在棱中点，形成ReO₆八面体共顶点连接的3D网络。中心位置为空，可容纳插层离子。",
  "lattice": { "a": 3.740, "b": 3.740, "c": 3.740, "alpha": 90, "beta": 90, "gamma": 90 },
  "atoms": [
    {
      "element": "Re",
      "color": "#267DAB",
      "radius": 0.55,  // Re⁶⁺ 离子半径, 6配位 (Shannon)
      "positions": [
        [0.0, 0.0, 0.0]
      ]
    },
    {
      "element": "O",
      "color": "#EA4335",
      "radius": 1.35,
      "positions": [
        [0.5, 0.0, 0.0], [0.0, 0.5, 0.0], [0.0, 0.0, 0.5]
      ]
    }
  ],
  "equivalentSettings": [
    { "label": "顶点为Re⁶⁺", "shift": [0, 0, 0] },
    { "label": "顶点为O²⁻", "shift": [0.5, 0, 0] }
  ],
  "interstices": {},
  "symmetry": {
    "axes": [
      { "type": "4-fold", "color": "#E91E63", "direction": [0, 0, 1], "position": [0, 0, 0] },
      { "type": "4-fold", "color": "#E91E63", "direction": [1, 0, 0], "position": [0, 0, 0] },
      { "type": "4-fold", "color": "#E91E63", "direction": [0, 1, 0], "position": [0, 0, 0] }
    ],
    "mirrors": [
      { "color": "rgba(60,60,60,0.35)", "normal": [1, 0, 0], "distance": 0 },
      { "color": "rgba(60,60,60,0.35)", "normal": [0, 1, 0], "distance": 0 },
      { "color": "rgba(60,60,60,0.35)", "normal": [0, 0, 1], "distance": 0 }
    ]
  }
}
