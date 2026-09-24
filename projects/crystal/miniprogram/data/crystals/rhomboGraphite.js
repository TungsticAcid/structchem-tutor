module.exports = {
  "id": "rhomboGraphite",
  "name": "三方石墨",
  "formula": "C",
  "crystalSystem": "trigonal",
  "spaceGroup": "R-3m",
  "structuralUnit": "C₂",
  "coordination": "C:3(层内C-C共价键，层间为范德华力)",
  "latticeType": "R心六方(hR)",
  "packingDescription": "晶胞中有6个C原子，分别属于两套不等效的等效点系，分数坐标分别为(0,0,0), (1/3,2/3,1/3), (2/3,1/3,2/3)；(0,0,1/2), (1/3,2/3,5/6), (2/3,1/3,1/6)。层内sp²杂化共价键，层间van der Waals力结合",
  "description": "三方石墨是碳的另一种层状同素异形体，属三方晶系，R心六方点阵。与六方石墨（AB堆积）不同，三方石墨采用ABC堆积方式。层内碳原子以sp²杂化形成六角蜂巢状共价键（配位数3），层间以弱范德华力结合。石墨具有良好的润滑性和导电各向异性，属混合键型晶体。",
  "lattice": { "a": 2.460, "b": 2.460, "c": 10.060, "alpha": 90, "beta": 90, "gamma": 120 },
  "atoms": [
    {
      "element": "C",
      "color": "#505050",
      "radius": 0.77,
      "positions": [
        [0.0, 0.0, 0.0],
        [0.3333, 0.6667, 0.3333],
        [0.6667, 0.3333, 0.6667],
        [0.3333, 0.6667, 0],
        [0.6667, 0.3333, 0.3333],
        [0, 0, 0.6667]
      ]
    }
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
