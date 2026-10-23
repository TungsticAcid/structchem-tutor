/**
 * 晶体索引数据
 * 列出所有可用晶体结构的元信息
 */
const crystalIndex = [
  // ==================== 金属晶体 ====================
  { "id": "fcc", "name": "Cu型晶体", "formula": "Cu", "crystalSystem": "cubic", "category": "metal", "thumbnail": "fcc.png",
    "subtitle": "A1立方最密堆积(FCC)", "systemName": "立方晶系" },
  { "id": "bcc", "name": "α-Fe型晶体", "formula": "Fe", "crystalSystem": "cubic", "category": "metal", "thumbnail": "bcc.png",
    "subtitle": "A2立方体心堆积(BCC)", "systemName": "立方晶系" },
  { "id": "hcp", "name": "Mg型晶体", "formula": "Mg", "crystalSystem": "hexagonal", "category": "metal", "thumbnail": "hcp.png",
    "subtitle": "A3六方最密堆积(HCP)", "systemName": "六方晶系" },
  // ==================== 离子晶体 ====================
  { "id": "naCl", "name": "NaCl(岩盐)型", "formula": "NaCl", "crystalSystem": "cubic", "category": "ionic", "thumbnail": "naCl.png",
    "subtitle": "", "systemName": "立方晶系" },
  { "id": "csCl", "name": "CsCl型", "formula": "CsCl", "crystalSystem": "cubic", "category": "ionic", "thumbnail": "csCl.png",
    "subtitle": "", "systemName": "立方晶系" },
  { "id": "fluorite", "name": "CaF₂(萤石)型", "formula": "CaF₂", "crystalSystem": "cubic", "category": "ionic", "thumbnail": "fluorite.png",
    "subtitle": "", "systemName": "立方晶系" },
  { "id": "perovskite", "name": "CaTiO₃(钙钛矿)型", "formula": "CaTiO₃", "crystalSystem": "cubic", "category": "ionic", "thumbnail": "perovskite.png",
    "subtitle": "", "systemName": "立方晶系" },
  { "id": "nias", "name": "NiAs(红镍矿)型", "formula": "NiAs", "crystalSystem": "hexagonal", "category": "covalent", "thumbnail": "nias.png",
    "subtitle": "", "systemName": "六方晶系" },
  { "id": "rutile", "name": "TiO₂(金红石)型", "formula": "TiO₂", "crystalSystem": "tetragonal", "category": "covalent", "thumbnail": "rutile.png",
    "subtitle": "", "systemName": "四方晶系" },
  { "id": "reo3", "name": "ReO₃型", "formula": "ReO₃", "crystalSystem": "cubic", "category": "ionic", "thumbnail": "reo3.png",
    "subtitle": "", "systemName": "立方晶系" },
  { "id": "pyrite", "name": "FeS₂(黄铁矿)型", "formula": "FeS₂", "crystalSystem": "cubic", "category": "ionic", "thumbnail": "pyrite.png",
    "subtitle": "", "systemName": "立方晶系" },
  // ==================== 共价晶体 ====================
  { "id": "diamond", "name": "金刚石型", "formula": "C", "crystalSystem": "cubic", "category": "covalent", "thumbnail": "diamond.png",
    "subtitle": "A4堆积", "systemName": "立方晶系" },
  { "id": "zincBlende", "name": "立方ZnS(闪锌矿)", "formula": "ZnS", "crystalSystem": "cubic", "category": "covalent", "thumbnail": "zincBlende.png",
    "subtitle": "", "systemName": "立方晶系" },
  { "id": "wurtzite", "name": "六方ZnS(纤锌矿)", "formula": "ZnS", "crystalSystem": "hexagonal", "category": "covalent", "thumbnail": "wurtzite.png",
    "subtitle": "", "systemName": "六方晶系" },
  { "id": "quartz", "name": "α-石英(α-SiO₂)", "formula": "SiO₂", "crystalSystem": "trigonal", "category": "covalent", "thumbnail": "quartz.png",
    "subtitle": "", "systemName": "三方晶系" },
  { "id": "cristobalite", "name": "方石英(白硅石)", "formula": "SiO₂", "crystalSystem": "cubic", "category": "covalent", "thumbnail": "cristobalite.png",
    "subtitle": "", "systemName": "立方晶系" },
  // ==================== 分子晶体 ====================
  { "id": "co2", "name": "干冰(CO₂)", "formula": "CO₂", "crystalSystem": "cubic", "category": "molecular", "thumbnail": "co2.png",
    "subtitle": "", "systemName": "立方晶系" },
  { "id": "ice", "name": "冰(H₂O)", "formula": "H₂O", "crystalSystem": "hexagonal", "category": "molecular", "thumbnail": "ice.png",
    "subtitle": "", "systemName": "六方晶系" },
  { "id": "i2", "name": "碘(I₂)", "formula": "I₂", "crystalSystem": "orthorhombic", "category": "molecular", "thumbnail": "i2.png",
    "subtitle": "", "systemName": "正交晶系" },
  { "id": "urea", "name": "尿素(CO(NH₂)₂)", "formula": "CO(NH₂)₂", "crystalSystem": "tetragonal", "category": "molecular", "thumbnail": "urea.png",
    "subtitle": "", "systemName": "四方晶系" },
  // ==================== 混合键型晶体 ====================
  { "id": "graphite", "name": "六方石墨", "formula": "C", "crystalSystem": "hexagonal", "category": "mixed", "thumbnail": "graphite.png",
    "subtitle": "", "systemName": "六方晶系" },
  { "id": "rhomboGraphite", "name": "三方石墨", "formula": "C", "crystalSystem": "trigonal", "category": "mixed", "thumbnail": "rhomboGraphite.png",
    "subtitle": "", "systemName": "三方晶系" },
  { "id": "cdi2", "name": "CdI₂型", "formula": "CdI₂", "crystalSystem": "hexagonal", "category": "mixed", "thumbnail": "cdi2.png",
    "subtitle": "", "systemName": "六方晶系" }
]

export default crystalIndex
