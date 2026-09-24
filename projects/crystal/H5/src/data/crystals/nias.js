export default {
  "id": "nias",
  "name": "NiAs(红镍矿)型",
  "formula": "NiAs",
  "crystalSystem": "hexagonal",
  "spaceGroup": "P6₃/mmc",
  "structuralUnit": "Ni₂As₂",
  "coordination": "Ni:6(As); As:6(Ni)",
  "latticeType": "简单六方(hP)",
  "packingDescription": "As作A3最密堆积，Ni填充其全部正八面体空隙，正八面体空隙占有率100%\n或视为：Ni做简单六方堆积，As填充其正三棱柱空隙，空隙利用率50%",
  "description": "NiAs型结构是过渡金属砷化物的典型共价晶体。As作六方密堆积，Ni填充全部八面体空隙。每个Ni被6个As形成八面体配位，每个As被6个Ni形成三方棱柱配位。Ni-As间为极性共价键，具有金属光泽和导电性。",
  "lattice": { "a": 3.602, "b": 3.602, "c": 5.009, "alpha": 90, "beta": 90, "gamma": 120 },
  "atoms": [
    {
      "element": "Ni",
      "color": "#50D050",
      "radius": 1.25,
      "positions": [
        [0.0, 0.0, 0.0],
        [0.0, 0.0, 0.5]
      ]
    },
    {
      "element": "As",
      "color": "#BD80E3",
      "radius": 1.21,
      "positions": [
        [0.3333, 0.6667, 0.25],
        [0.6667, 0.3333, 0.75]
      ]
    }
  ],
  "equivalentSettings": [
    { "label": "顶点为Ni", "shift": [0, 0, 0] },
    { "label": "顶点为As", "shift": [0.6667, 0.3333, 0.75] }
  ],
  "interstices": {},
  "symmetry": {
    "axes": [
      { "type": "6-fold", "color": "#FF6F00", "direction": [0, 0, 1], "position": [0, 0, 0] },
      { "type": "2-fold", "color": "#2196F3", "direction": [1, 0, 0], "position": [0, 0, 0] }
    ],
    "mirrors": [
      { "color": "rgba(255,255,255,0.3)", "normal": [1, 0, 0], "distance": 0 }
    ]
  }
}
