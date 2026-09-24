module.exports = {
  "id": "graphite",
  "name": "六方石墨",
  "formula": "C",
  "crystalSystem": "hexagonal",
  "spaceGroup": "P6₃/mmc",
  "structuralUnit": "C₄",
  "coordination": "C:3(层内C-C共价键，层间为范德华力)",
  "latticeType": "简单六方(hP)",
  "packingDescription": "晶胞中有4个环境各不相同的C原子，其分数坐标分别为(0,0,0), (0,0,1/2), (1/3,2/3,0), (2/3,1/3,1/2)。层内sp²杂化共价键，层间van der Waals力结合",
  "description": "六方石墨是碳的层状同素异形体。层内碳原子以sp²杂化形成六角蜂巢状共价键，层间以弱范德华力结合。AB堆积方式，层内C-C键长1.42Å，层间距3.35Å。因层间结合力弱，石墨具有良好的润滑性和导电各向异性，属混合键型晶体。",
  "lattice": { "a": 2.460, "b": 2.460, "c": 6.710, "alpha": 90, "beta": 90, "gamma": 120 },
  "atoms": [
    {
      "element": "C",
      "color": "#505050",
      "radius": 0.77,
      "positions": [
        [0.0, 0.0, 0.0],
        [0.0, 0.0, 0.5],
        [0.3333, 0.6667, 0.0],
        [0.6667, 0.3333, 0.5]
      ]
    }
  ],
  "interstices": {},
  "bonds": [],
  "symmetry": {
    "axes": [
      { "type": "6-fold", "color": "#FF9800", "direction": [0, 0, 1], "position": [0.0, 0.0, 0.75] },
      { "type": "2-fold", "color": "#2196F3", "direction": [1, 0, 0], "position": [0.0, 0.0, 0.75] },
      { "type": "2-fold", "color": "#2196F3", "direction": [0, 1, 0], "position": [0.0, 0.0, 0.75] },
      { "type": "2-fold", "color": "#2196F3", "direction": [1, -1, 0], "position": [0.0, 0.0, 0.25] }
    ],
    "mirrors": [
      { "color": "rgba(255,255,255,0.3)", "normal": [0, 0, 1], "distance": 0.25 }
    ]
  }
}
