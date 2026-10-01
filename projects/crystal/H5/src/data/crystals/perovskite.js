export default {
  "id": "perovskite",
  "name": "CaTiO₃(钙钛矿)型",
  "formula": "CaTiO₃",
  "crystalSystem": "cubic",
  "spaceGroup": "Pm-3m",
  "structuralUnit": "CaTiO₃",
  "coordination": "Ca²⁺:12(O²⁻); Ti⁴⁺:6(O²⁻); O²⁻:4(2Ca²⁺+2Ti⁴⁺)",
  "latticeType": "简单立方(cP)",
  "packingDescription": "Ca²⁺与O²⁻共同构成A1堆积（Ca²⁺、O²⁻分别占据晶胞顶点和面心），Ti⁴⁺填充其体心的八面体空隙，八面体空隙利用率25%",
  "description": "钙钛矿结构通式为ABX₃，空间群Pm-3m。Ca²⁺占据立方体顶点，O²⁻占据面心，Ti⁴⁺占据体心。Ti被6个O包围形成八面体配位。该结构是铁电、超导等功能材料的基础，在材料科学中极为重要。",
  "lattice": { "a": 3.840, "b": 3.840, "c": 3.840, "alpha": 90, "beta": 90, "gamma": 90 },
  "atoms": [
    {
      "element": "Ca",
      "color": "#5C6BC0",
      "radius": 1.35,
      "positions": [[0.0, 0.0, 0.0]]
    },
    {
      "element": "Ti",
      "color": "#B0BEC5",
      "radius": 0.61,
      "positions": [[0.5, 0.5, 0.5]]
    },
    {
      "element": "O",
      "color": "#EA4335",
      "radius": 1.40,  // O²⁻ 离子半径, 6配位 (Shannon)
      "positions": [
        [0.5, 0.5, 0.0], [0.5, 0.0, 0.5], [0.0, 0.5, 0.5]
      ]
    }
  ],
  "equivalentSettings": [
    { "label": "顶点为Ca²⁺", "shift": [0, 0, 0] },
    { "label": "顶点为Ti⁴⁺", "shift": [0.5, 0.5, 0.5] },
    { "label": "顶点为O²⁻", "shift": [0.5, 0.5, 0] }
  ],
  "interstices": {},
  "symmetry": {
    "axes": [
      { "type": "4-fold", "color": "#E91E63", "direction": [0, 0, 1], "position": [0, 0, 0] },
      { "type": "4-fold", "color": "#E91E63", "direction": [0, 1, 0], "position": [0, 0, 0] },
      { "type": "4-fold", "color": "#E91E63", "direction": [1, 0, 0], "position": [0, 0, 0] },
      { "type": "3-fold", "color": "#9C27B0", "direction": [1, 1, 1], "position": [0, 0, 0] }
    ],
    "mirrors": [
      { "color": "rgba(60,60,60,0.35)", "normal": [1, 0, 0], "distance": 0 },
      { "color": "rgba(60,60,60,0.35)", "normal": [0, 1, 0], "distance": 0 },
      { "color": "rgba(60,60,60,0.35)", "normal": [0, 0, 1], "distance": 0 }
    ]
  }
}
