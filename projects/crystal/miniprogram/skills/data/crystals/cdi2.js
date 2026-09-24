module.exports = {
  "id": "cdi2",
  "name": "CdI₂型",
  "formula": "CdI₂",
  "crystalSystem": "hexagonal",
  "spaceGroup": "P-3m1",
  "structuralUnit": "CdI₂",
  "coordination": "Cd²⁺:6(I⁻); I⁻:3(Cd²⁺)",
  "latticeType": "简单六方(hP)",
  "packingDescription": "I⁻作A3最密堆积，Cd²⁺相间填充其正八面体空隙，正八面体空隙占有率50%。层状结构，正、负离子之间形成离子键（有共价成分），负离子层之间以van der Waals力相结合，属混合键型晶体",
  "description": "CdI₂是典型的层状结构，属混合键型晶体。I⁻构成六方密堆积，Cd²⁺占据每隔一层的八面体空隙，形成I-Cd-I三明治层。层内为离子键（有共价成分），层间为范德华力，易沿层面解理。",
  "lattice": { "a": 4.240, "b": 4.240, "c": 6.840, "alpha": 90, "beta": 90, "gamma": 120 },
  "atoms": [
    {
      "element": "Cd",
      "color": "#FFD98F",
      "radius": 0.95,
      "positions": [
        [0.0, 0.0, 0.0]
      ]
    },
    {
      "element": "I",
      "color": "#940094",
      "radius": 2.20,
      "positions": [
        [0.6667, 0.3333, 0.25], [0.3333, 0.6667, 0.75]
      ]
    }
  ],
  "equivalentSettings": [
    { "label": "顶点为Cd²⁺", "shift": [0, 0, 0] },
    { "label": "顶点为I⁻", "shift": [0.3333, 0.6667, 0.75] }
  ],
  "interstices": {},
  "symmetry": {
    "axes": [
      { "type": "3-fold", "color": "#9C27B0", "direction": [0, 0, 1], "position": [0, 0, 0] },
      { "type": "2-fold", "color": "#2196F3", "direction": [1, 0, 0], "position": [0, 0, 0] }
    ],
    "mirrors": []
  }
}
