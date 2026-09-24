/**
 * 内置示例库
 * 分子示例通过 XYZ 文本经真实解析器构建（顺带验证解析器），晶体示例内联结构对象
 * 分子几何统一参考 NIST CCCBDB 收录的实验几何（来源记录见 ../data/STRUCTURE_SOURCES.md）
 */
import { parseStructure } from '../lib/parsers/index.js'

// ==================== 分子示例（XYZ 文本） ====================

const CH4_XYZ = `5
甲烷 CH4 (Td)
C 0.0000 0.0000 0.0000
H 0.6276 0.6276 0.6276
H -0.6276 -0.6276 0.6276
H -0.6276 0.6276 -0.6276
H 0.6276 -0.6276 -0.6276`

const H2O2_XYZ = `4
过氧化氢 H2O2 (C2)
O -0.7375 0.0000 0.0000
O 0.7375 0.0000 0.0000
H -0.8170 0.0000 0.9467
H 0.8170 0.8807 -0.3469`

const NH3_XYZ = `4
氨 NH3 (C3v)
N 0.0000 0.0000 0.3810
H 0.9375 0.0000 0.0000
H -0.4688 0.8119 0.0000
H -0.4688 -0.8119 0.0000`

const H2O_XYZ = `3
水 H2O (C2v)
O 0.0000 0.0000 0.0000
H 0.5862 0.0000 0.7571
H 0.5862 0.0000 -0.7571`

const CO2_XYZ = `3
二氧化碳 CO2 (D∞h)
C 0.0000 0.0000 0.0000
O 1.1620 0.0000 0.0000
O -1.1620 0.0000 0.0000`

const C6H6_XYZ = `12
苯 C6H6 (D6h)
C 1.3970 0.0000 0.0000
C 0.6985 1.2098 0.0000
C -0.6985 1.2098 0.0000
C -1.3970 0.0000 0.0000
C -0.6985 -1.2098 0.0000
C 0.6985 -1.2098 0.0000
H 2.4810 0.0000 0.0000
H 1.2405 2.1487 0.0000
H -1.2405 2.1487 0.0000
H -2.4810 0.0000 0.0000
H -1.2405 -2.1487 0.0000
H 1.2405 -2.1487 0.0000`

// ===== 点群教学经典分子（几何参考 NIST CCCBDB 收录实验值，来源见 STRUCTURE_SOURCES.md） =====

const HCN_XYZ = `3
氢氰酸 HCN (C∞v)
C 0.0000 0.0000 0.0000
H 0.0000 0.0000 1.0640
N 0.0000 0.0000 -1.1560`

const C2H4_XYZ = `6
乙烯 C2H4 (D2h)
C 0.6695 0.0000 0.0000
C -0.6695 0.0000 0.0000
H 1.2320 0.9290 0.0000
H 1.2320 -0.9290 0.0000
H -1.2320 0.9290 0.0000
H -1.2320 -0.9290 0.0000`

const CH2BRCL_XYZ = `5
氯溴甲烷 CH2BrCl (Cs)
C 0.0000 0.0000 0.0000
Br 1.9280 0.0000 0.0000
Cl -0.6930 0.0000 -1.6130
H -0.3690 0.9100 0.5270
H -0.3690 -0.9100 0.5270`

const TRANSCHCLCHCL_XYZ = `6
反式-1,2-二氯乙烯 C2H2Cl2 (C2h)
C 0.6770 0.0000 0.0000
C -0.6770 0.0000 0.0000
Cl 1.6320 0.0000 1.4280
Cl -1.6320 0.0000 -1.4280
H 1.1520 0.0000 -0.9640
H -1.1520 0.0000 0.9640`

const BF3_XYZ = `4
三氟化硼 BF3 (D3h)
B 0.0000 0.0000 0.0000
F 1.3070 0.0000 0.0000
F -0.6535 1.1320 0.0000
F -0.6535 -1.1320 0.0000`

const XEF4_XYZ = `5
四氟化氙 XeF4 (D4h)
Xe 0.0000 0.0000 0.0000
F 1.9350 0.0000 0.0000
F -1.9350 0.0000 0.0000
F 0.0000 1.9350 0.0000
F 0.0000 -1.9350 0.0000`

const ALLENE_XYZ = `7
丙二烯 C3H4 (D2d)
C 0.0000 0.0000 0.0000
C 0.0000 0.0000 1.3080
C 0.0000 0.0000 -1.3080
H 0.9320 0.0000 1.8660
H -0.9320 0.0000 1.8660
H 0.0000 0.9320 -1.8660
H 0.0000 -0.9320 -1.8660`

const ETHANE_XYZ = `8
乙烷 C2H6 (D3d)
C 0.0000 0.0000 0.7680
C 0.0000 0.0000 -0.7680
H 0.8820 0.5090 1.1570
H -0.8820 0.5090 1.1570
H 0.0000 -1.0190 1.1570
H 0.0000 1.0190 -1.1570
H -0.8820 -0.5090 -1.1570
H 0.8820 -0.5090 -1.1570`

const SF6_XYZ = `7
六氟化硫 SF6 (Oh)
S 0.0000 0.0000 0.0000
F 1.5610 0.0000 0.0000
F -1.5610 0.0000 0.0000
F 0.0000 1.5610 0.0000
F 0.0000 -1.5610 0.0000
F 0.0000 0.0000 1.5610
F 0.0000 0.0000 -1.5610`

const IF5_XYZ = `6
五氟化碘 IF5 (C4v)
I 0.0000 0.0000 0.0000
F 0.0000 0.0000 1.8600
F 1.8700 0.0000 0.0000
F -1.8700 0.0000 0.0000
F 0.0000 1.8700 0.0000
F 0.0000 -1.8700 0.0000`

const CHCLFBR_XYZ = `5
一溴一氯一氟甲烷 CHClFBr (C1)
C 0.0000 0.0000 0.0000
H 1.1000 0.0000 0.0000
F -0.4500 1.2700 0.0000
Cl -0.5930 -0.8380 1.4520
Br -0.6470 -0.9140 -1.5840`

// ===== 大分子（理想对称构建，数据库无实验几何，来源标注见 STRUCTURE_SOURCES.md） =====

const CP_XYZ = `10
环戊二烯基 C5H5- (D5h)
C 0.0000 1.1909 0.0000
H 0.0000 2.1909 0.0000
C -1.1326 0.3680 0.0000
H -2.0837 0.6770 0.0000
C -0.7000 -0.9635 0.0000
H -1.2878 -1.7725 0.0000
C 0.7000 -0.9635 0.0000
H 1.2878 -1.7725 0.0000
C 1.1326 0.3680 0.0000
H 2.0837 0.6770 0.0000`

const S8_XYZ = `8
硫环 S8 (D4d)
S 2.1000 0.0000 -0.8600
S 1.4849 1.4849 0.8600
S 0.0000 2.1000 -0.8600
S -1.4849 1.4849 0.8600
S -2.1000 0.0000 -0.8600
S -1.4849 -1.4849 0.8600
S 0.0000 -2.1000 -0.8600
S 1.4849 -1.4849 0.8600`

const FERROCENE_XYZ = `21
二茂铁 C10H10Fe (D5d)
Fe 0.0000 0.0000 0.0000
C 0.0000 1.1900 1.6500
H 0.0000 2.1900 1.6500
C -1.1318 0.3677 1.6500
H -2.0828 0.6767 1.6500
C -0.6995 -0.9627 1.6500
H -1.2872 -1.7717 1.6500
C 0.6995 -0.9627 1.6500
H 1.2872 -1.7717 1.6500
C 1.1318 0.3677 1.6500
H 2.0828 0.6767 1.6500
C -0.6995 0.9627 -1.6500
H -1.2872 1.7717 -1.6500
C -1.1318 -0.3677 -1.6500
H -2.0828 -0.6767 -1.6500
C 0.0000 -1.1900 -1.6500
H 0.0000 -2.1900 -1.6500
C 1.1318 -0.3677 -1.6500
H 2.0828 -0.6767 -1.6500
C 0.6995 0.9627 -1.6500
H 1.2872 1.7717 -1.6500`

const C60_XYZ = `60
富勒烯 C60 (Ih)
C 0.0000 0.7000 3.3979
C 0.0000 -0.7000 3.3979
C 0.7000 2.5326 2.2652
C 1.4000 2.9652 1.1326
C -0.7000 2.5326 2.2652
C -1.4000 2.9652 1.1326
C 1.1326 1.4000 2.9652
C 2.2652 0.7000 2.5326
C -1.1326 1.4000 2.9652
C -2.2652 0.7000 2.5326
C 0.0000 0.7000 -3.3979
C 0.0000 -0.7000 -3.3979
C 0.7000 2.5326 -2.2652
C 1.4000 2.9652 -1.1326
C -0.7000 2.5326 -2.2652
C -1.4000 2.9652 -1.1326
C 1.1326 1.4000 -2.9652
C 2.2652 0.7000 -2.5326
C -1.1326 1.4000 -2.9652
C -2.2652 0.7000 -2.5326
C 0.7000 -2.5326 2.2652
C 1.4000 -2.9652 1.1326
C -0.7000 -2.5326 2.2652
C -1.4000 -2.9652 1.1326
C 1.1326 -1.4000 2.9652
C 2.2652 -0.7000 2.5326
C -1.1326 -1.4000 2.9652
C -2.2652 -0.7000 2.5326
C 0.7000 -2.5326 -2.2652
C 1.4000 -2.9652 -1.1326
C -0.7000 -2.5326 -2.2652
C -1.4000 -2.9652 -1.1326
C 1.1326 -1.4000 -2.9652
C 2.2652 -0.7000 -2.5326
C -1.1326 -1.4000 -2.9652
C -2.2652 -0.7000 -2.5326
C 0.7000 3.3979 0.0000
C -0.7000 3.3979 0.0000
C 2.5326 2.2652 0.7000
C 2.9652 1.1326 1.4000
C 2.5326 2.2652 -0.7000
C 2.9652 1.1326 -1.4000
C 0.7000 -3.3979 0.0000
C -0.7000 -3.3979 0.0000
C 2.5326 -2.2652 0.7000
C 2.9652 -1.1326 1.4000
C 2.5326 -2.2652 -0.7000
C 2.9652 -1.1326 -1.4000
C -2.5326 2.2652 0.7000
C -2.9652 1.1326 1.4000
C -2.5326 2.2652 -0.7000
C -2.9652 1.1326 -1.4000
C -2.5326 -2.2652 0.7000
C -2.9652 -1.1326 1.4000
C -2.5326 -2.2652 -0.7000
C -2.9652 -1.1326 -1.4000
C 3.3979 0.0000 0.7000
C 3.3979 0.0000 -0.7000
C -3.3979 0.0000 0.7000
C -3.3979 0.0000 -0.7000`

const BIPHENYL_XYZ = `22
联苯 C12H10 (D2)
C 0.7500 0.0000 0.0000
C 1.4485 0.5113 -1.0965
C 2.8455 0.5113 -1.0965
C 3.5440 0.0000 0.0000
C 2.8455 -0.5113 1.0965
C 1.4485 -0.5113 1.0965
C -0.7500 0.0000 0.0000
C -1.4485 0.5113 1.0965
C -2.8455 0.5113 1.0965
C -3.5440 0.0000 0.0000
C -2.8455 -0.5113 -1.0965
C -1.4485 -0.5113 -1.0965
H 0.9065 0.9080 -1.9473
H -0.9065 0.9080 1.9473
H 3.3875 0.9080 -1.9473
H -3.3875 0.9080 1.9473
H 4.6280 0.0000 0.0000
H -4.6280 0.0000 0.0000
H 3.3875 -0.9080 1.9473
H -3.3875 -0.9080 -1.9473
H 0.9065 -0.9080 1.9473
H -0.9065 -0.9080 -1.9473`

const MESOTART_XYZ = `12
内消旋酒石酸 C4H6O6 (Ci)
C 0.7500 0.0000 0.0000
C -0.7500 0.0000 0.0000
H 1.0780 0.9621 0.3936
H -1.0780 -0.9621 -0.3936
O 1.3943 -0.5012 1.1741
O -1.3943 0.5012 -1.1741
C 1.5744 -0.7495 -1.0043
C -1.5744 0.7495 1.0043
O 2.8020 -0.7034 -0.9425
O -2.8020 0.7034 0.9425
O 0.9679 -1.4641 -1.9619
O -0.9679 1.4641 1.9619`

const TRIPHENYL_XYZ = `35
三苯甲烷 C19H16 (C3)
C 0.0000 0.0000 0.0000
H 0.0000 0.0000 -1.0900
C 2.7322 0.0000 0.9654
C 1.7434 -0.6939 1.6671
H 1.9982 -1.2324 2.5728
C 0.4262 -0.6939 1.2017
H -0.3410 -1.2324 1.7462
C 0.0978 0.0000 0.0346
H -0.9243 0.0000 -0.3266
C 1.0866 0.6939 -0.6671
H 0.8318 1.2324 -1.5728
C 2.4038 0.6939 -0.2017
H 3.1710 1.2324 -0.7462
C -1.3661 2.3661 0.9654
C -0.2707 1.8568 1.6671
H 0.0682 2.3467 2.5728
C 0.3879 0.7161 1.2017
H 1.2378 0.3209 1.7462
C -0.0489 0.0847 0.0346
H 0.4621 -0.8004 -0.3266
C -1.1443 0.5940 -0.6671
H -1.4832 0.1041 -1.5728
C -1.8029 1.7348 -0.2017
H -2.6528 2.1300 -0.7462
C -1.3661 -2.3661 0.9654
C -1.4727 -1.1629 1.6671
H -2.0664 -1.1143 2.5728
C -0.8141 -0.0222 1.2017
H -0.8968 0.9115 1.7462
C -0.0489 -0.0847 0.0346
H 0.4621 0.8004 -0.3266
C 0.0577 -1.2880 -0.6671
H 0.6514 -1.3365 -1.5728
C -0.6009 -2.4287 -0.2017
H -0.5182 -3.3624 -0.7462`

const CORANNULENE_XYZ = `30
碗烯 C20H10 (C5v)
C 1.1900 0.0000 0.0000
C 0.3677 1.1318 0.0000
C -0.9627 0.6995 0.0000
C -0.9627 -0.6995 0.0000
C 0.3677 -1.1318 0.0000
C 2.0000 0.0000 1.1400
C 0.6180 1.9021 1.1400
C -1.6180 1.1756 1.1400
C -1.6180 -1.1756 1.1400
C 0.6180 -1.9021 1.1400
C 0.8342 0.7000 1.4700
C -0.4079 1.0097 1.4700
C -1.0863 -0.0760 1.4700
C -0.2635 -1.0567 1.4700
C 0.9235 -0.5771 1.4700
C 0.8342 -0.7000 1.4700
C 0.9235 0.5771 1.4700
C -0.2635 1.0567 1.4700
C -1.0863 0.0760 1.4700
C -0.4079 -1.0097 1.4700
H 1.5988 1.3416 1.8825
H -0.7819 1.9352 1.8825
H -2.0821 -0.1456 1.8825
H -0.5049 -2.0251 1.8825
H 1.7700 -1.1060 1.8825
H 1.5988 -1.3416 1.8825
H 1.7700 1.1060 1.8825
H -0.5049 2.0251 1.8825
H -2.0821 0.1456 1.8825
H -0.7819 -1.9352 1.8825`

const COEN3_XYZ = `19
三乙二胺合钴 [Co(en)3]3+ (D3)
Co 0.0000 0.0000 0.0000
N 1.9500 0.0000 0.0000
N 0.0000 1.9500 0.0000
N 0.0000 -1.9500 0.0000
N 0.0000 0.0000 1.9500
N -1.9500 0.0000 0.0000
N 0.0000 0.0000 -1.9500
C 3.0040 0.6027 0.8276
C 0.8276 3.0040 0.6027
C -0.6027 -3.0040 -0.8276
C 0.6027 0.8276 3.0040
C -3.0040 -0.8276 -0.6027
C -0.8276 -0.6027 -3.0040
H 3.7519 1.0107 1.5075
H 1.5075 3.7519 1.0107
H -1.0107 -3.7519 -1.5075
H 1.0107 1.5075 3.7519
H -3.7519 -1.5075 -1.0107
H -1.5075 -1.0107 -3.7519`

// ==================== 分子示例构建（含辅助几何声明） ====================

const CH4 = parseStructure(CH4_XYZ, 'methane.xyz')
// 辅助立方体：碳在立方体中心，4 个氢在立方体 4 个顶点（C-H = 1.0870 Å，半边长 = 1.0870/√3）
// 便于观察 Td 对称元素：体对角线 = C3 轴、面心连线 = S4（与 C2 重合）轴、过相对棱平面 = σd
CH4.aux = { type: 'cube', halfSize: 0.6276 }

const H2O2 = parseStructure(H2O2_XYZ, 'h2o2.xyz')
// 辅助二面角矩形：两个半透明矩形各包住一个 O-H 键（H1-O1 与 H2-O2），共用 O-O 轴，
// 两矩形平面夹角即 H-O-O-H 二面角（气相实验值 111.5°），便于直观理解二面角
H2O2.aux = { type: 'dihedral', indices: [2, 0, 1, 3] }

// ==================== 晶体示例已在小程序版移除（仅保留分子 + 点群教学） ====================

/** 示例清单 */
export const EXAMPLES = [
  { id: 'methane', title: '甲烷', titleEn: 'Methane', formula: 'CH4', category: 'molecule', structure: CH4 },
  { id: 'h2o2', title: '过氧化氢', titleEn: 'Hydrogen peroxide', formula: 'H2O2', category: 'molecule', structure: H2O2 },
  { id: 'benzene', title: '苯', titleEn: 'Benzene', formula: 'C6H6', category: 'molecule', structure: parseStructure(C6H6_XYZ, 'benzene.xyz') },
  { id: 'ammonia', title: '氨', titleEn: 'Ammonia', formula: 'NH3', category: 'molecule', structure: parseStructure(NH3_XYZ, 'ammonia.xyz') },
  { id: 'water', title: '水', titleEn: 'Water', formula: 'H2O', category: 'molecule', structure: parseStructure(H2O_XYZ, 'water.xyz') },
  { id: 'co2', title: '二氧化碳', titleEn: 'Carbon dioxide', formula: 'CO2', category: 'molecule', structure: parseStructure(CO2_XYZ, 'co2.xyz') },
  // ===== 点群教学经典分子（几何参考 NIST CCCBDB） =====
  { id: 'hcn', title: '氢氰酸', titleEn: 'Hydrogen cyanide', formula: 'HCN', category: 'molecule', structure: parseStructure(HCN_XYZ, 'hcn.xyz') },
  { id: 'ethylene', title: '乙烯', titleEn: 'Ethylene', formula: 'C2H4', category: 'molecule', structure: parseStructure(C2H4_XYZ, 'ethylene.xyz') },
  { id: 'ch2brcl', title: '氯溴甲烷', titleEn: 'Bromochloromethane', formula: 'CH2BrCl', category: 'molecule', structure: parseStructure(CH2BRCL_XYZ, 'ch2brcl.xyz') },
  { id: 'trans-dce', title: '(E)-1,2-二氯乙烯', titleEn: '(E)-1,2-Dichloroethene', formula: 'C2H2Cl2', category: 'molecule', structure: parseStructure(TRANSCHCLCHCL_XYZ, 'trans-dce.xyz') },
  { id: 'bf3', title: '三氟化硼', titleEn: 'Boron trifluoride', formula: 'BF3', category: 'molecule', structure: parseStructure(BF3_XYZ, 'bf3.xyz') },
  { id: 'xef4', title: '四氟化氙', titleEn: 'Xenon tetrafluoride', formula: 'XeF4', category: 'molecule', structure: parseStructure(XEF4_XYZ, 'xef4.xyz') },
  { id: 'allene', title: '丙二烯', titleEn: 'Allene (propadiene)', formula: 'C3H4', category: 'molecule', structure: parseStructure(ALLENE_XYZ, 'allene.xyz') },
  { id: 'ethane', title: '乙烷（交叉式构象）', titleEn: 'Ethane (staggered)', formula: 'C2H6', category: 'molecule', structure: parseStructure(ETHANE_XYZ, 'ethane.xyz') },
  { id: 'sf6', title: '六氟化硫', titleEn: 'Sulfur hexafluoride', formula: 'SF6', category: 'molecule', structure: parseStructure(SF6_XYZ, 'sf6.xyz') },
  { id: 'if5', title: '五氟化碘', titleEn: 'Iodine pentafluoride', formula: 'IF5', category: 'molecule', structure: parseStructure(IF5_XYZ, 'if5.xyz') },
  { id: 'chclfbr', title: '一溴一氯一氟甲烷', titleEn: 'Bromochlorofluoromethane', formula: 'CHClFBr', category: 'molecule', structure: parseStructure(CHCLFBR_XYZ, 'chclfbr.xyz') },
  // ===== 大分子（理想对称构建，数据库无实验几何） =====
  { id: 'cp', title: '茂', titleEn: 'Cyclopentadienyl anion', formula: 'C5H5⁻', category: 'molecule', structure: parseStructure(CP_XYZ, 'cp.xyz') },
  { id: 's8', title: '环八硫', titleEn: 'Octasulfur', formula: 'S8', category: 'molecule', structure: parseStructure(S8_XYZ, 's8.xyz') },
  { id: 'ferrocene', title: '二茂铁', titleEn: 'Ferrocene', formula: 'C10H10Fe', category: 'molecule', structure: parseStructure(FERROCENE_XYZ, 'ferrocene.xyz') },
  { id: 'c60', title: '富勒烯', titleEn: 'Buckminsterfullerene', formula: 'C60', category: 'molecule', structure: parseStructure(C60_XYZ, 'c60.xyz') },
  { id: 'biphenyl', title: '联苯（扭曲构象）', titleEn: 'Biphenyl (twisted)', formula: 'C12H10', category: 'molecule', structure: parseStructure(BIPHENYL_XYZ, 'biphenyl.xyz') },
  { id: 'meso-tartaric', title: '内消旋酒石酸', titleEn: 'meso-Tartaric acid', formula: 'C4H6O6', category: 'molecule', structure: parseStructure(MESOTART_XYZ, 'meso-tartaric.xyz') },
  { id: 'triphenylmethane', title: '三苯甲烷', titleEn: 'Triphenylmethane', formula: 'C19H16', category: 'molecule', structure: parseStructure(TRIPHENYL_XYZ, 'triphenylmethane.xyz') },
  { id: 'corannulene', title: '碗烯', titleEn: 'Corannulene', formula: 'C20H10', category: 'molecule', structure: parseStructure(CORANNULENE_XYZ, 'corannulene.xyz') },
  { id: 'coen3', title: '三乙二胺合钴', titleEn: 'Tris(ethylenediamine)cobalt(III)', formula: '[Co(en)3]³⁺', category: 'molecule', structure: parseStructure(COEN3_XYZ, 'coen3.xyz') }
]

/**
 * 按 id 获取示例
 * @param {string} id
 * @returns {Object|undefined} { id, title, formula, category, structure }
 */
export function getExample(id) {
  return EXAMPLES.find(e => e.id === id)
}
