export default {
  "id": "fluorite",
  "name": "CaF₂(萤石)型",
  "formula": "CaF₂",
  "crystalSystem": "cubic",
  "spaceGroup": "Fm-3m",
  "structuralUnit": "CaF₂",
  "coordination": "Ca²⁺:8(F⁻); F⁻:4(Ca²⁺)",
  "latticeType": "面心立方(cF)",
  "packingDescription": "F⁻按简单立方堆积，Ca²⁺相间占据其立方体空隙，立方体空隙利用率50%\n或视为：Ca²⁺做A1堆积，F⁻填充其正四面体空隙，正四面体空隙利用率100%",
  "description": "萤石结构中Ca²⁺构成面心立方子晶格，F⁻占据全部8个四面体空隙位置。每个Ca²⁺被8个F⁻包围（立方体配位），每个F⁻被4个Ca²⁺包围（四面体配位）。反萤石结构（如Na₂O）中阳离子与阴离子位置互换。",
  "lattice": { "a": 5.463, "b": 5.463, "c": 5.463, "alpha": 90, "beta": 90, "gamma": 90 },
  "atoms": [
    {
      "element": "Ca",
      "color": "#5C6BC0",
      "radius": 1.00,
      "positions": [
        [0.0, 0.0, 0.0], [0.0, 0.5, 0.5], [0.5, 0.0, 0.5], [0.5, 0.5, 0.0]
      ]
    },
    {
      "element": "F",
      "color": "#7CB342",
      "radius": 1.35,
      "positions": [
        [0.25, 0.25, 0.25], [0.25, 0.75, 0.75], [0.75, 0.25, 0.75], [0.75, 0.75, 0.25],
        [0.75, 0.25, 0.25], [0.25, 0.75, 0.25], [0.25, 0.25, 0.75], [0.75, 0.75, 0.75]
      ]
    }
  ],
  "equivalentSettings": [
    { "label": "顶点为Ca²⁺", "shift": [0, 0, 0] },
    { "label": "顶点为F⁻", "shift": [0.75, 0.75, 0.75] }
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
