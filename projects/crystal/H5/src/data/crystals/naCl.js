export default {
  "id": "naCl",
  "name": "NaCl(岩盐)型",
  "formula": "NaCl",
  "crystalSystem": "cubic",
  "spaceGroup": "Fm-3m",
  "structuralUnit": "NaCl",
  "coordination": "Na⁺:6(Cl⁻); Cl⁻:6(Na⁺)",
  "latticeType": "面心立方(cF)",
  "packingDescription": "Cl⁻按A1堆积，Na⁺填充其正八面体空隙，空隙利用率：100%",
  "description": "岩盐结构是典型的离子晶体结构，Na⁺和Cl⁻各构成面心立方子晶格，彼此沿棱边方向位移半个晶胞参数。Na⁺被6个Cl⁻包围（八面体配位），反之亦然。许多碱金属卤化物、氧化物和硫化物均采用此结构。",
  "lattice": { "a": 5.620, "b": 5.620, "c": 5.620, "alpha": 90, "beta": 90, "gamma": 90 },
  "atoms": [
    {
      "element": "Cl",
      "color": "#34A853",
      "radius": 1.81,
      "positions": [
        [0.0, 0.0, 0.0], [0.0, 0.5, 0.5], [0.5, 0.0, 0.5], [0.5, 0.5, 0.0]
      ]
    },
    {
      "element": "Na",
      "color": "#4285F4",
      "radius": 1.02,
      "positions": [
        [0.5, 0.5, 0.5], [0.5, 0.0, 0.0], [0.0, 0.5, 0.0], [0.0, 0.0, 0.5]
      ]
    }
  ],
  "equivalentSettings": [
    { "label": "顶点为Cl⁻", "shift": [0, 0, 0] },
    { "label": "顶点为Na⁺", "shift": [0.5, 0.5, 0.5] }
  ],
  "interstices": {},
  "symmetry": {
    "axes": [
      { "type": "4-fold", "color": "#E91E63", "direction": [0, 0, 1], "position": [0, 0, 0] },
      { "type": "4-fold", "color": "#E91E63", "direction": [0, 1, 0], "position": [0, 0, 0] },
      { "type": "4-fold", "color": "#E91E63", "direction": [1, 0, 0], "position": [0, 0, 0] },
      { "type": "3-fold", "color": "#9C27B0", "direction": [1, 1, 1], "position": [0, 0, 0] },
      { "type": "2-fold", "color": "#2196F3", "direction": [1, 1, 0], "position": [0, 0, 0] }
    ],
    "mirrors": [
      { "color": "rgba(60,60,60,0.35)", "normal": [1, 0, 0], "distance": 0 },
      { "color": "rgba(60,60,60,0.35)", "normal": [0, 1, 0], "distance": 0 },
      { "color": "rgba(60,60,60,0.35)", "normal": [0, 0, 1], "distance": 0 }
    ]
  }
}
