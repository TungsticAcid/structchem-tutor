module.exports = {
  "id": "quartz",
  "name": "α-石英(α-SiO₂)",
  "formula": "α-SiO₂",
  "crystalSystem": "trigonal",
  "spaceGroup": "P3₂21",
  "structuralUnit": "Si₃O₆",
  "coordination": "Si⁴⁺:4(O²⁻); O²⁻:2(Si⁴⁺)",
  "latticeType": "简单三方(hP)",
  "packingDescription": "Si⁴⁺形成类金刚石网络（四面体配位），O²⁻位于Si-Si连线中点",
  "description": "α-石英是SiO₂最常见的晶型之一，属于三方晶系。每个Si原子被4个O原子包围形成SiO₄四面体，四面体之间通过共顶点连接形成三维网络结构。Si-O键兼具离子性和共价性，使石英具有高硬度（莫氏7）、高熔点和压电效应。石英是地壳中含量最丰富的矿物之一。",
  "lattice": { "a": 4.914, "b": 4.914, "c": 5.405, "alpha": 90, "beta": 90, "gamma": 120 },
  // CPK空间填充模型：使用范德华半径(Si=2.10, O=1.52)配合cpkScale缩放显示
  "cpkScale": 0.443,
  "atoms": [
    {
      "element": "Si",
      "color": "#267DAB",
      // Si范德华半径（CPK空间填充模型），共价半径为1.11
      "radius": 2.10,
      "positions": [
        [0.0000, 0.0000, 0.0000],
        [0.5303, 0.4697, 0.6667],
        [0.0606, 0.5303, 0.3333]
      ]
    },
    {
      "element": "O",
      "color": "#EA4335",
      // O范德华半径（CPK空间填充模型），共价半径为0.66
      "radius": 1.52,
      "positions": [
        [0.9438, 0.2669, 0.1191],
        [0.7972, 0.4135, 0.5476],
        [0.2634, 0.1466, 0.7857],
        [0.1168, 0.8534, 0.2143],
        [0.3837, 0.5865, 0.4524],
        [0.6769, 0.7331, 0.8809]
      ]
    }
  ],
  "interstices": {},
  "symmetry": {
    "axes": [
      { "type": "3-fold", "color": "#9C27B0", "direction": [0, 0, 1], "position": [0.535, 0.0, 0.0] },
      { "type": "2-fold", "color": "#2196F3", "direction": [1, 0, 0], "position": [0.0, 0.0, 0.0] }
    ],
    "mirrors": []
  }
}
