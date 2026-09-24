export default {
  "id": "hcp",
  "name": "Mg型晶体",
  "formula": "Mg",
  "crystalSystem": "hexagonal",
  "spaceGroup": "P6₃/mmc",
  "structuralUnit": "Mg₂",
  "coordination": "Mg:12(Mg)",
  "latticeType": "简单六方(hP)",
  "packingDescription": "等径球体以ABAB...两层重复方式堆积，每个球的配位数为12，空间利用率74.05%。六方最密堆积是等径球体的两种最密堆积方式之一，轴比c/a理想值为1.633。",
  "spaceUtilization": "74.05%",
  "description": "Mg型晶体为A3六方最密堆积(HCP)结构，空间群P6₃/mmc。等径球体以ABAB...层状堆叠，每个原子有12个最近邻。空间利用率约为74.05%，与面心立方相同。轴比c/a理想值为1.633。",
  "lattice": {
    "a": 3.209, "b": 3.209, "c": 5.211,
    "alpha": 90, "beta": 90, "gamma": 120
  },
  "atoms": [
    {
      "element": "Mg",
      "color": "#228B22",
      "radius": 1.6,
      "positions": [
        [0.0, 0.0, 0.0],
        [1/3, 2/3, 0.5]
      ]
    }
  ],
  "interstices": {
    "octahedral": {
      "color": "#FFB74D",
      "radius": 0.45,
      "positions": [
        [0.666667, 0.333333, 0.25],
        [0.666667, 0.333333, 0.75]
      ]
    },
    "tetrahedral": {
      "color": "#4FC3F7",
      "radius": 0.3,
      "positions": [
        [0.0, 0.0, 0.375],
        [0.0, 0.0, 0.625],
        [0.333333, 0.666667, 0.125],
        [0.333333, 0.666667, 0.875]
      ]
    }
  },
  "symmetry": {
    "axes": [
      { "type": "6-fold", "color": "#FF9800", "direction": [0, 0, 1], "position": [0.666667, 0.333333, 0.75] },
      { "type": "2-fold", "color": "#2196F3", "direction": [1, 0, 0], "position": [0.666667, 0.333333, 0.75] },
      { "type": "2-fold", "color": "#2196F3", "direction": [0, 1, 0], "position": [0.666667, 0.333333, 0.75] },
      { "type": "2-fold", "color": "#2196F3", "direction": [1, -1, 0], "position": [0.666667, 0.333333, 0.25] }
    ],
    "mirrors": [
      { "color": "rgba(255,255,255,0.3)", "normal": [0, 0, 1], "distance": 0.25 }
    ]
  }
}
