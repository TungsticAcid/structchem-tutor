export default {
  "id": "fcc",
  "name": "Cu型晶体",
  "formula": "Cu",
  "crystalSystem": "cubic",
  "spaceGroup": "Fm-3m",
  "structuralUnit": "Cu",
  "coordination": "Cu:12(Cu)",
  "latticeType": "面心立方(cF)",
  "packingDescription": "等径球体以ABCABC...三层重复方式堆积，每个球的配位数为12，空间利用率74.05%。立方最密堆积是等径球体的两种最密堆积方式之一。",
  "spaceUtilization": "74.05%",
  "description": "Cu型晶体为A1立方最密堆积(FCC)结构，空间群Fm-3m。等径球体以ABCABC...层状堆叠，原子占据立方体顶点和面心。每个原子有12个最近邻，空间利用率约74.05%。铜、铝、金、银等许多金属为FCC结构。",
  "lattice": { "a": 3.615, "b": 3.615, "c": 3.615, "alpha": 90, "beta": 90, "gamma": 90 },
  "atoms": [
    {
      "element": "Cu",
      "color": "#D84315",
      "radius": 1.28,
      "positions": [
        [0.0, 0.0, 0.0], [0.0, 0.5, 0.5], [0.5, 0.0, 0.5], [0.5, 0.5, 0.0]
      ]
    }
  ],
  "interstices": {
    "octahedral": {
      "color": "#FFB74D",
      "radius": 0.45,
      "positions": [
        [0.5, 0.5, 0.5], [0.5, 0.0, 0.0], [0.0, 0.5, 0.0], [0.0, 0.0, 0.5]
      ]
    },
    "tetrahedral": {
      "color": "#4FC3F7",
      "radius": 0.3,
      "positions": [
        [0.25, 0.25, 0.25], [0.25, 0.75, 0.75], [0.75, 0.25, 0.75], [0.75, 0.75, 0.25],
        [0.75, 0.25, 0.25], [0.25, 0.75, 0.25], [0.25, 0.25, 0.75], [0.75, 0.75, 0.75]
      ]
    }
  },
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
