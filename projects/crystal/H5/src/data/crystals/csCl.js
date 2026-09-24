export default {
  "id": "csCl",
  "name": "CsCl型",
  "formula": "CsCl",
  "crystalSystem": "cubic",
  "spaceGroup": "Pm-3m",
  "structuralUnit": "CsCl",
  "coordination": "Cs⁺:8(Cl⁻); Cl⁻:8(Cs⁺)",
  "latticeType": "简单立方(cP)",
  "packingDescription": "Cl⁻按简单立方堆积，Cs⁺填充其立方体空隙，立方体空隙利用率：100%",
  "description": "CsCl型结构为体心立方点阵，Cs⁺占据立方体顶点，Cl⁻占据体心（或互换）。配位数为8，每个离子被8个异号离子包围形成立方体配位。CsCl本身在高温下会转变为NaCl结构。",
  "lattice": { "a": 4.123, "b": 4.123, "c": 4.123, "alpha": 90, "beta": 90, "gamma": 90 },
  "atoms": [
    {
      "element": "Cs",
      "color": "#9C27B0",
      "radius": 1.67,
      "positions": [[0.5, 0.5, 0.5]]
    },
    {
      "element": "Cl",
      "color": "#34A853",
      "radius": 1.81,
      "positions": [[0.0, 0.0, 0.0]]
    }
  ],
  "equivalentSettings": [
    { "label": "顶点为Cs⁺", "shift": [0.5, 0.5, 0.5] },
    { "label": "顶点为Cl⁻", "shift": [0, 0, 0] }
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
      { "color": "rgba(255,255,255,0.3)", "normal": [1, 0, 0], "distance": 0 },
      { "color": "rgba(255,255,255,0.3)", "normal": [0, 1, 0], "distance": 0 },
      { "color": "rgba(255,255,255,0.3)", "normal": [0, 0, 1], "distance": 0 }
    ]
  }
}
