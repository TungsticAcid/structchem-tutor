export default {
  "id": "i2",
  "name": "碘(I₂)",
  "formula": "I₂",
  "crystalSystem": "orthorhombic",
  "spaceGroup": "Cmce",
  "_molecularCrystal": true,
  "structuralUnit": "(I₂)₂",
  "coordination": "无经典配位数（分子晶体，分子间为范德华力）",
  "latticeType": "底心正交(oC)",
  "packingDescription": "晶胞中有4个I₂分子（8个I原子），分子质心位于顶点和面心。顶点与上下底面心分子长轴∥c轴，侧面心分子长轴∥a轴，两种取向相互垂直。I-I键长约2.72Å。",
  "description": "碘晶体是典型的分子晶体，属正交晶系Cmce空间群。晶胞中含4个I₂分子，分子质心分别位于顶点、C心和面心。分子取向分两种且相互垂直：位于顶点和上下底面心的分子长轴平行于c轴，位于四个侧面心的分子长轴平行于a轴。I-I键长约2.72Å，分子间以van der Waals力结合。",
  "lattice": { "a": 7.180, "b": 4.710, "c": 9.810, "alpha": 90, "beta": 90, "gamma": 90 },
  "atoms": [
    {
      "element": "I",
      "color": "#940094",
      "radius": 1.36,
      "positions": [
        [0.0, 0.0, 0.1384],
        [0.0, 0.0, 0.8616],
        [0.5, 0.5, 0.1384],
        [0.5, 0.5, 0.8616],
        [0.1891, 0.5, 0.5],
        [0.8109, 0.5, 0.5],
        [0.3109, 0.0, 0.5],
        [0.6891, 0.0, 0.5]
      ],
      "ids": ["I1b", "I1a", "I2b", "I2a", "I3b", "I3a", "I4a", "I4b"]
    }
  ],
  "covalentBonds": [
    { "from": "I1a", "to": "I1b", "color": "#940094" },
    { "from": "I2a", "to": "I2b", "color": "#940094" },
    { "from": "I3a", "to": "I3b", "color": "#940094" },
    { "from": "I4a", "to": "I4b", "color": "#940094" }
  ],
  "interstices": {},
  "symmetry": {
    "axes": [
      { "type": "2-fold", "color": "#2196F3", "direction": [0, 1, 0], "position": [0, 0, 0] },
      { "type": "2-fold", "color": "#2196F3", "direction": [1, 0, 0], "position": [0, 0.25, 0.25] }
    ],
    "mirrors": [
      { "color": "rgba(60,60,60,0.35)", "normal": [0, 1, 0], "distance": 0 }
    ]
  }
}
