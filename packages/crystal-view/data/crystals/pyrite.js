export default {
  "id": "pyrite",
  "name": "FeS₂(黄铁矿)型",
  "formula": "FeS₂",
  "crystalSystem": "cubic",
  "spaceGroup": "Pa-3",
  "structuralUnit": "Fe₄S₈",
  "coordination": "Fe²⁺:6(S⁻); S⁻:4(3Fe²⁺+S⁻)",
  "latticeType": "简单立方(cP)",
  "packingDescription": "Fe²⁺位于FCC位置，S₂²⁻二聚体占据体心和棱心，沿[111]方向取向",
  "description": "黄铁矿是FeS₂最常见的晶型。Fe位于FCC位置，S₂二聚体（哑铃形）占据体心和棱心，沿[111]方向取向。Fe被6个S八面体配位，S被3个Fe和1个S四面体配位。",
  "lattice": { "a": 5.417, "b": 5.417, "c": 5.417, "alpha": 90, "beta": 90, "gamma": 90 },
  "atoms": [
    {
      "element": "Fe",
      "color": "#E65100",
      "radius": 0.61,
      "positions": [
        [0.0, 0.0, 0.0], [0.0, 0.5, 0.5], [0.5, 0.0, 0.5], [0.5, 0.5, 0.0]
      ]
    },
    {
      "element": "S",
      "color": "#FFB300",
      "radius": 1.04,
      "positions": [
        [0.386, 0.386, 0.386], [0.614, 0.614, 0.614],
        [0.386, 0.114, 0.886], [0.614, 0.886, 0.114],
        [0.114, 0.886, 0.386], [0.886, 0.114, 0.614],
        [0.886, 0.386, 0.114], [0.114, 0.614, 0.886]
      ]
    }
  ],
  "interstices": {},
  "bonds": [
    // === S-S 二聚体键（4个S₂哑铃） ===
    { "from": [0.386, 0.386, 0.386], "to": [0.614, 0.614, 0.614], "color": "#FFB300", "dashed": false },
    { "from": [0.386, 0.114, 0.886], "to": [0.614, 0.886, 0.114], "color": "#FFB300", "dashed": false },
    { "from": [0.114, 0.886, 0.386], "to": [0.886, 0.114, 0.614], "color": "#FFB300", "dashed": false },
    { "from": [0.886, 0.386, 0.114], "to": [0.114, 0.614, 0.886], "color": "#FFB300", "dashed": false },

    // === Fe-S 八面体配位键（每个Fe配位6个S，共24条） ===
    // Fe(0,0,0) → 6个最近S
    { "from": [0.0, 0.0, 0.0], "to": [0.386, 0.114, 0.886], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.0, 0.0, 0.0], "to": [0.614, 0.886, 0.114], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.0, 0.0, 0.0], "to": [0.114, 0.886, 0.386], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.0, 0.0, 0.0], "to": [0.886, 0.114, 0.614], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.0, 0.0, 0.0], "to": [0.886, 0.386, 0.114], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.0, 0.0, 0.0], "to": [0.114, 0.614, 0.886], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },

    // Fe(0, 0.5, 0.5) → 6个最近S
    { "from": [0.0, 0.5, 0.5], "to": [0.386, 0.386, 0.386], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.0, 0.5, 0.5], "to": [0.614, 0.614, 0.614], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.0, 0.5, 0.5], "to": [0.114, 0.886, 0.386], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.0, 0.5, 0.5], "to": [0.886, 0.114, 0.614], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.0, 0.5, 0.5], "to": [0.886, 0.386, 0.114], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.0, 0.5, 0.5], "to": [0.114, 0.614, 0.886], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },

    // Fe(0.5, 0, 0.5) → 6个最近S
    { "from": [0.5, 0.0, 0.5], "to": [0.386, 0.386, 0.386], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.5, 0.0, 0.5], "to": [0.614, 0.614, 0.614], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.5, 0.0, 0.5], "to": [0.386, 0.114, 0.886], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.5, 0.0, 0.5], "to": [0.614, 0.886, 0.114], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.5, 0.0, 0.5], "to": [0.114, 0.886, 0.386], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.5, 0.0, 0.5], "to": [0.886, 0.114, 0.614], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },

    // Fe(0.5, 0.5, 0) → 6个最近S
    { "from": [0.5, 0.5, 0.0], "to": [0.386, 0.386, 0.386], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.5, 0.5, 0.0], "to": [0.614, 0.614, 0.614], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.5, 0.5, 0.0], "to": [0.386, 0.114, 0.886], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.5, 0.5, 0.0], "to": [0.614, 0.886, 0.114], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.5, 0.5, 0.0], "to": [0.886, 0.386, 0.114], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false },
    { "from": [0.5, 0.5, 0.0], "to": [0.114, 0.614, 0.886], "color": "#E65100", "from_color": "#E65100", "to_color": "#FFB300", "dashed": false }
  ],
  "symmetry": {
    "axes": [
      { "type": "3-fold", "color": "#9C27B0", "direction": [1, 1, 1], "position": [0, 0, 0] },
      { "type": "2-fold", "color": "#2196F3", "direction": [1, 0, 0], "position": [0, 0, 0] }
    ],
    "mirrors": []
  }
}
