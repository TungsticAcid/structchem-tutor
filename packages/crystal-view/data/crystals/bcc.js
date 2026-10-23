export default {
  "id": "bcc",
  "name": "α-Fe型晶体",
  "formula": "α-Fe",
  "crystalSystem": "cubic",
  "spaceGroup": "Im-3m",
  "structuralUnit": "Fe",
  "coordination": "Fe:8(Fe)",
  "latticeType": "体心立方(cI)",
  "packingDescription": "等径球体以A2型体心立方堆积，每个球被8个最近邻包围，空间利用率68.02%。立方体顶点的8个球不直接相切，球与体心球相切。",
  "spaceUtilization": "68.02%",
  "description": "α-Fe型晶体为A2立方体心堆积(BCC)结构，空间群Im-3m。原子占据立方体的8个顶点和1个体心。每个原子有8个最近邻，空间利用率约68.02%，低于密堆积结构。铁、钨、铬等金属在室温下为BCC结构。",
  "lattice": { "a": 2.866, "b": 2.866, "c": 2.866, "alpha": 90, "beta": 90, "gamma": 90 },
  "atoms": [
    {
      "element": "Fe",
      "color": "#E65100",
      "radius": 1.26,
      "positions": [
        [0.0, 0.0, 0.0], [0.5, 0.5, 0.5]
      ]
    }
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
