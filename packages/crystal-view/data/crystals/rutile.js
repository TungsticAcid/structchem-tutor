export default {
  "id": "rutile",
  "name": "TiO₂(金红石)型",
  "formula": "TiO₂",
  "crystalSystem": "tetragonal",
  "spaceGroup": "P4₂/mnm",
  "structuralUnit": "Ti₂O₄",
  "coordination": "Ti⁴⁺:6(O²⁻); O²⁻:3(Ti⁴⁺)",
  "latticeType": "简单四方(tP)",
  "packingDescription": "O²⁻作近似A3最密堆积，Ti⁴⁺填充其八面体空隙，八面体空隙占有率50%",
  "description": "金红石是TiO₂最常见的晶型。Ti位于体心和顶点（各被6个O八面体配位），O位于3个Ti构成的近似等边三角形中心。Ti-O八面体共边沿c轴形成链状结构。",
  "lattice": { "a": 4.593, "b": 4.593, "c": 2.959, "alpha": 90, "beta": 90, "gamma": 90 },
  "atoms": [
    {
      "element": "Ti",
      "color": "#B0BEC5",
      "radius": 0.605,
      "positions": [
        [0.0, 0.0, 0.0], [0.5, 0.5, 0.5]
      ]
    },
    {
      "element": "O",
      "color": "#EA4335",
      "radius": 1.35,
      "positions": [
        [0.305, 0.305, 0.0], [0.695, 0.695, 0.0],
        [0.805, 0.195, 0.5], [0.195, 0.805, 0.5]
      ]
    }
  ],
  "equivalentSettings": [
    { "label": "顶点为Ti⁴⁺", "shift": [0, 0, 0] },
    { "label": "顶点为O²⁻", "shift": [0.695, 0.695, 0] }
  ],
  "interstices": {},
  "symmetry": {
    "axes": [
      { "type": "4-fold", "color": "#E91E63", "direction": [0, 0, 1], "position": [0, 0, 0] },
      { "type": "2-fold", "color": "#2196F3", "direction": [1, 1, 0], "position": [0, 0, 0] }
    ],
    "mirrors": []
  }
}
