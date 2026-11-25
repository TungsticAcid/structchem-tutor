/**
 * i18n-h5.js —— 晶体「上游复用代码」（`projects/crystal/H5/src/**`）的中英词典
 *
 * ---------------------------------------------------------------------------
 * 这一区为什么**几乎全是 `text` 表**
 * ---------------------------------------------------------------------------
 * 本区是**从上游项目逐字忠实移植**过来的代码（pages / components / adapters /
 * lib / data），仓库对移植代码有「逐字忠实」的硬要求。所以默认**一个字节都不改**：
 * 中文原文逐条列进 `text` 表，由应用层的 `startAutoSweep(document.body)` 扫 DOM
 * 换掉。只有「原文里带变量、扫描替换够不着」的少数几处才动了源码（见下面的
 * `zh`/`en` 两张表，以及各文件里的注释）。
 *
 * ★ 除了"带变量"那几处，另有**一处**动了模板而没改变量：`layer-control.js` 的
 *   「晶体信息」把每个值包了一层行内 `<span>`（`点阵型式：${值}` 原先标签与值在
 *   **同一个文本节点**里，登记了也换不掉 —— 扫描替换按整节点比对）。包的是无样式
 *   行内元素，排版逐字不变。全部改动清单见交接报告。
 *
 * ---------------------------------------------------------------------------
 * `text` 表里那几类"看着像数据"的条目，为什么仍然进 `text` 表
 * ---------------------------------------------------------------------------
 *   · `data/elements.js` 的 103 个元素中文名、`data/crystalIndex.js` 的晶体名与
 *     晶系名、`data/crystals/*.js` 的 `latticeType`/`packingDescription` —— 它们
 *     虽然是数据文件里的字段，但**会以文本节点出现在界面上**（卡片、信息面板、
 *     原点选择按钮），正是 `text` 表要管的东西。翻译取的是 `enName`（元素表里本来
 *     就有）与教科书通行的英文名。
 *   · `data/crystals/*.js` 的 `description`（22 段长文）**不进 H5 的 DOM** ——
 *     只有 `modules/crystal/tools.js` 把它当**模型上下文**取走。登记在 `text` 表里
 *     对 H5 运行时没有效果（守卫要它），要让模型读到英文得在消费方按语言取值，
 *     那属于 `crystal` 区。**已如实记在交接报告里。**
 *
 * 本文件必须是**纯数据**：不 import DOM、不 import three、不 import 任何运行时
 * （H5 的代码要 import three，本文件被 Node 侧的守卫 import，绝不能把 three 拖进来）。
 */
// ★ 相对路径！守卫是在 Node 里 import 本文件来读"登记了哪些原文"的，
//   而 `@i18n` 是 vite 别名，Node 不认 —— 用别名守卫会读不了字典（只警告、不报错，
//   于是这块永远显示 0 覆盖）。
import { registerDict } from '../../packages/i18n/index.js'

/**
 * 键 → 中文。
 * ★ 只放**扫描替换救不了**的那些：原文里带变量（模板串）。它们各自在源码里
 *   改成了 `t('key', {…})`，中文原文因此从模板里消失，守卫才认。
 */
export const zh = {
  // —— components/layer-control.js：元素计数「（3种）」 ——
  'h5.layer.elementCount': '（{n}种）',

  // —— pages/compare.js：顶栏标题「NaCl(岩盐)型 - 结构对比」 ——
  'h5.compare.title': '{name} - 结构对比',

  // —— pages/settings.js：取色弹层的标题（颜色名 / 元素符号是变量） ——
  'h5.settings.pickVisualColor': '选择{label}颜色',
  'h5.settings.pickElementColor': '选择 {key} 的颜色',
}

/** 键 → 英文（与上面同键） */
export const en = {
  'h5.layer.elementCount': '({n} types)',
  'h5.compare.title': '{name} — structure comparison',
  'h5.settings.pickVisualColor': 'Choose a color for {label}',
  'h5.settings.pickElementColor': 'Choose a color for {key}',
}

/**
 * 中文原文 → 英文（DOM 扫描替换用）。
 * ★ 键必须与 DOM 里**文本节点的整段内容**逐字一致（首尾空白会被忽略）。
 * ★ 属性值（title/placeholder/aria-label/alt）也走这张表 —— 本区这类串为零，
 *   但规则一样。
 */
export const text = {
  // ---------------------------------------------------------------------
  // 通用
  // ---------------------------------------------------------------------
  '页面不存在': 'Page not found',
  '取消': 'Cancel',
  '确定': 'OK',
  '加载中...': 'Loading...',
  '对比': 'Compare',
  '← 返回': '← Back',
  '关闭': 'Close',

  // ---------------------------------------------------------------------
  // 晶系（卡片角标 / 设置页 / 查看页三处共用同一批字）
  // ---------------------------------------------------------------------
  '立方晶系': 'Cubic',
  '六方晶系': 'Hexagonal',
  '四方晶系': 'Tetragonal',
  '正交晶系': 'Orthorhombic',
  '单斜晶系': 'Monoclinic',
  '三斜晶系': 'Triclinic',
  '三方晶系': 'Trigonal',
  '立方': 'Cubic',
  '六方': 'Hexagonal',
  '四方': 'Tetragonal',
  '正交': 'Orthorhombic',
  '单斜': 'Monoclinic',
  '三斜': 'Triclinic',
  '三方': 'Trigonal',

  // ---------------------------------------------------------------------
  // 点阵型式（晶体数据字段 + 三维场景里的点阵点图例）
  // ---------------------------------------------------------------------
  '面心立方(cF)': 'Face-centered cubic (cF)',
  '简单立方(cP)': 'Simple cubic (cP)',
  '简单六方(hP)': 'Simple hexagonal (hP)',
  '简单四方(tP)': 'Simple tetragonal (tP)',
  '简单三方(hP)': 'Simple trigonal (hP)',
  '底心正交(oC)': 'Base-centered orthorhombic (oC)',
  'R心六方(hR)': 'R-centered hexagonal (hR)',
  '体心立方(cI)': 'Body-centered cubic (cI)',
  '简单立方 P': 'Simple cubic P',
  '体心立方 I': 'Body-centered cubic I',
  '面心立方 F': 'Face-centered cubic F',
  '金刚石型 F': 'Diamond type F',
  '六方 H': 'Hexagonal H',
  '底心 C': 'Base-centered C',
  'R心六方': 'R-centered hexagonal',
  '未知': 'Unknown',
  '底心': 'Base-centered',
  'c心': 'C-centered',
  '体心': 'Body-centered',
  '面心': 'Face-centered',
  'r心': 'R-centered',
  '金刚石': 'Diamond',

  // ---------------------------------------------------------------------
  // 配位数（分子晶体那两条是数据里逐字写死的整句）
  // ---------------------------------------------------------------------
  '无经典配位数（分子晶体，分子间为范德华力）':
    'No classical coordination number (molecular crystal; van der Waals forces between molecules)',
  '无经典配位数（分子晶体，分子间为氢键）':
    'No classical coordination number (molecular crystal; hydrogen bonds between molecules)',
  'C:3(层内C-C共价键，层间为范德华力)':
    'C:3 (C–C covalent bonds within a layer, van der Waals forces between layers)',

  // ---------------------------------------------------------------------
  // 晶体名（列表卡片、查看页标题、对比页标题共用）
  // ---------------------------------------------------------------------
  'Cu型晶体': 'Copper (Cu) type',
  'α-Fe型晶体': 'α-Fe type',
  'Mg型晶体': 'Magnesium (Mg) type',
  'NaCl(岩盐)型': 'NaCl (rock-salt) type',
  'CsCl型': 'CsCl type',
  'CaF₂(萤石)型': 'CaF₂ (fluorite) type',
  'CaTiO₃(钙钛矿)型': 'CaTiO₃ (perovskite) type',
  'NiAs(红镍矿)型': 'NiAs (nickeline) type',
  'TiO₂(金红石)型': 'TiO₂ (rutile) type',
  'ReO₃型': 'ReO₃ type',
  'FeS₂(黄铁矿)型': 'FeS₂ (pyrite) type',
  '金刚石型': 'Diamond type',
  '立方ZnS(闪锌矿)': 'Cubic ZnS (zinc blende)',
  '六方ZnS(纤锌矿)': 'Hexagonal ZnS (wurtzite)',
  'α-石英(α-SiO₂)': 'α-Quartz (α-SiO₂)',
  '方石英(白硅石)': 'Cristobalite',
  '干冰(CO₂)': 'Dry ice (CO₂)',
  '冰(H₂O)': 'Ice (H₂O)',
  '碘(I₂)': 'Iodine (I₂)',
  '尿素(CO(NH₂)₂)': 'Urea (CO(NH₂)₂)',
  '六方石墨': 'Hexagonal graphite',
  '三方石墨': 'Rhombohedral graphite',
  'CdI₂型': 'CdI₂ type',

  // ---------------------------------------------------------------------
  // 堆积方式（卡片副标题）
  // ---------------------------------------------------------------------
  'A1立方最密堆积(FCC)': 'A1 cubic close packing (FCC)',
  'A2立方体心堆积(BCC)': 'A2 body-centered cubic packing (BCC)',
  'A3六方最密堆积(HCP)': 'A3 hexagonal close packing (HCP)',
  'A4堆积': 'A4 packing',

  // ---------------------------------------------------------------------
  // 变换晶胞原点的按钮（`equivalentSettings[].label`）
  // ---------------------------------------------------------------------
  '顶点为Cd²⁺': 'Cd²⁺ at corners',
  '顶点为I⁻': 'I⁻ at corners',
  '顶点为Cs⁺': 'Cs⁺ at corners',
  '顶点为Cl⁻': 'Cl⁻ at corners',
  '顶点为Ca²⁺': 'Ca²⁺ at corners',
  '顶点为F⁻': 'F⁻ at corners',
  '顶点为Na⁺': 'Na⁺ at corners',
  '顶点为Ni': 'Ni at corners',
  '顶点为As': 'As at corners',
  '顶点为Ti⁴⁺': 'Ti⁴⁺ at corners',
  '顶点为O²⁻': 'O²⁻ at corners',
  '顶点为Re⁶⁺': 'Re⁶⁺ at corners',
  '顶点为Zn²⁺': 'Zn²⁺ at corners',
  '顶点为S²⁻': 'S²⁻ at corners',

  // ---------------------------------------------------------------------
  // 堆积描述（`packingDescription`，信息面板「堆积方式」那一行）
  // ---------------------------------------------------------------------
  '等径球体以A2型体心立方堆积，每个球被8个最近邻包围，空间利用率68.02%。立方体顶点的8个球不直接相切，球与体心球相切。':
    'Equal spheres pack in the A2 body-centered cubic arrangement; each sphere has 8 nearest neighbours and the packing efficiency is 68.02%. The 8 spheres at the cube corners do not touch one another — each touches the sphere at the body centre.',
  '等径球体以ABCABC...三层重复方式堆积，每个球的配位数为12，空间利用率74.05%。立方最密堆积是等径球体的两种最密堆积方式之一。':
    'Equal spheres stack in the ABCABC… three-layer repeat; every sphere has 12 nearest neighbours and the packing efficiency is 74.05%. Cubic close packing is one of the two closest packings of equal spheres.',
  '等径球体以ABAB...两层重复方式堆积，每个球的配位数为12，空间利用率74.05%。六方最密堆积是等径球体的两种最密堆积方式之一，轴比c/a理想值为1.633。':
    'Equal spheres stack in the ABAB… two-layer repeat; every sphere has 12 nearest neighbours and the packing efficiency is 74.05%. Hexagonal close packing is the other closest packing of equal spheres; the ideal c/a ratio is 1.633.',
  'I⁻作A3最密堆积，Cd²⁺相间填充其正八面体空隙，正八面体空隙占有率50%。层状结构，正、负离子之间形成离子键（有共价成分），负离子层之间以van der Waals力相结合，属混合键型晶体':
    'The I⁻ ions form an A3 close packing and the Cd²⁺ ions fill every other octahedral void, an octahedral-site occupancy of 50%. The structure is layered: the ions are held by ionic bonds (with some covalent character) within a layer, while the iodide layers are held together by van der Waals forces — a mixed-bonding crystal.',
  'CO₂位于晶胞的顶点和面心，4个CO₂分子的轴线分别平行于晶胞的4条体对角线':
    'The CO₂ molecules sit at the corners and face centres of the cell, and the axes of the 4 molecules are parallel to the 4 body diagonals of the cell.',
  '晶胞中有8个Si原子（与金刚石中C原子位置相同）、16个O原子（位于Si-Si连线的中点）':
    'The cell contains 8 Si atoms (at the positions of the C atoms in diamond) and 16 O atoms (at the midpoints of the Si–Si lines).',
  'Cl⁻按简单立方堆积，Cs⁺填充其立方体空隙，立方体空隙利用率：100%':
    'The Cl⁻ ions form a simple cubic packing and the Cs⁺ ions fill every cubic void: cubic-site occupancy 100%.',
  '两套FCC子晶格沿体对角线方向位移1/4体对角线，A4堆积':
    'Two FCC sublattices displaced by 1/4 of the body diagonal along that diagonal — A4 packing.',
  // ★★ 下面这两条各有**两个键**，原因是一处**守卫的转义缺陷**（已报给 Lead）：
  //   数据里写的是 `…50%\n或视为…`（真换行），而守卫的词法扫描把 `\n` 读成了
  //   **字母 n**，于是它按 `…50%n或视为…` 报未覆盖。带真换行的那条才是运行时
  //   `sweep()` 真正会命中的（DOM 文本节点里是真换行），带字母 n 的那条只为对齐
  //   守卫的口径。删掉任一条都会留下一个"看着绿、其实没生效"或"一直红"的坑。
  'F⁻按简单立方堆积，Ca²⁺相间占据其立方体空隙，立方体空隙利用率50%\n或视为：Ca²⁺做A1堆积，F⁻填充其正四面体空隙，正四面体空隙利用率100%':
    'The F⁻ ions form a simple cubic packing and the Ca²⁺ ions occupy every other cubic void, a cubic-site occupancy of 50%; equivalently, the Ca²⁺ ions form an A1 packing and the F⁻ ions fill all of its tetrahedral voids, a tetrahedral-site occupancy of 100%.',
  'F⁻按简单立方堆积，Ca²⁺相间占据其立方体空隙，立方体空隙利用率50%n或视为：Ca²⁺做A1堆积，F⁻填充其正四面体空隙，正四面体空隙利用率100%':
    'The F⁻ ions form a simple cubic packing and the Ca²⁺ ions occupy every other cubic void, a cubic-site occupancy of 50%; equivalently, the Ca²⁺ ions form an A1 packing and the F⁻ ions fill all of its tetrahedral voids, a tetrahedral-site occupancy of 100%.',
  '晶胞中有4个环境各不相同的C原子，其分数坐标分别为(0,0,0), (0,0,1/2), (1/3,2/3,0), (2/3,1/3,1/2)。层内sp²杂化共价键，层间van der Waals力结合':
    'The cell contains 4 crystallographically distinct C atoms at the fractional coordinates (0,0,0), (0,0,1/2), (1/3,2/3,0) and (2/3,1/3,1/2). Within a layer the atoms are joined by sp² covalent bonds, while the layers are held by van der Waals forces.',
  '晶胞中有4个I₂分子（8个I原子），分子质心位于顶点和面心。顶点与上下底面心分子长轴∥c轴，侧面心分子长轴∥a轴，两种取向相互垂直。I-I键长约2.72Å。':
    'The cell contains 4 I₂ molecules (8 I atoms), with their centres of mass at the corners and face centres. The molecules at the corners and the top/bottom face centres have their long axis ∥ c, those at the four side face centres have it ∥ a — the two orientations are perpendicular. The I–I bond length is about 2.72 Å.',
  '晶胞中有4个H₂O分子，取向各不相同，相邻水分子间以氢键连接':
    'The cell contains 4 H₂O molecules with different orientations, linked to their neighbours by hydrogen bonds.',
  'Cl⁻按A1堆积，Na⁺填充其正八面体空隙，空隙利用率：100%':
    'The Cl⁻ ions form an A1 packing and the Na⁺ ions fill all of its octahedral voids — a void occupancy of 100%.',
  'As作A3最密堆积，Ni填充其全部正八面体空隙，正八面体空隙占有率100%\n或视为：Ni做简单六方堆积，As填充其正三棱柱空隙，空隙利用率50%':
    'The As atoms form an A3 close packing and the Ni atoms fill all of its octahedral voids, an octahedral-site occupancy of 100%; equivalently, the Ni atoms form a simple hexagonal packing and the As atoms fill its trigonal-prismatic voids, a void occupancy of 50%.',
  'As作A3最密堆积，Ni填充其全部正八面体空隙，正八面体空隙占有率100%n或视为：Ni做简单六方堆积，As填充其正三棱柱空隙，空隙利用率50%':
    'The As atoms form an A3 close packing and the Ni atoms fill all of its octahedral voids, an octahedral-site occupancy of 100%; equivalently, the Ni atoms form a simple hexagonal packing and the As atoms fill its trigonal-prismatic voids, a void occupancy of 50%.',
  'Ca²⁺与O²⁻共同构成A1堆积（Ca²⁺、O²⁻分别占据晶胞顶点和面心），Ti⁴⁺填充其体心的八面体空隙，八面体空隙利用率25%':
    'Ca²⁺ and O²⁻ together form an A1 packing (Ca²⁺ at the corners, O²⁻ at the face centres) and Ti⁴⁺ fills the octahedral void at the body centre — an octahedral-site occupancy of 25%.',
  'Fe²⁺位于FCC位置，S₂²⁻二聚体占据体心和棱心，沿[111]方向取向':
    'The Fe²⁺ ions occupy the FCC positions and the S₂²⁻ dimers occupy the body centre and the edge centres, oriented along [111].',
  'Si⁴⁺形成类金刚石网络（四面体配位），O²⁻位于Si-Si连线中点':
    'The Si⁴⁺ ions form a diamond-like network (tetrahedral coordination) and the O²⁻ ions sit at the midpoints of the Si–Si lines.',
  'Re⁶⁺按简单立方排列，O²⁻位于立方体每条棱的中心':
    'The Re⁶⁺ ions are arranged on a simple cubic lattice and the O²⁻ ions sit at the centre of every edge of the cube.',
  'S²⁻按A1最密堆积，Zn²⁺相间填充其正四面体空隙，正四面体空隙占有率50%':
    'The S²⁻ ions form an A1 close packing and the Zn²⁺ ions fill every other tetrahedral void — a tetrahedral-site occupancy of 50%.',
  'S²⁻按A3最密堆积，Zn²⁺相间填充其正四面体空隙，正四面体空隙占有率50%':
    'The S²⁻ ions form an A3 close packing and the Zn²⁺ ions fill every other tetrahedral void — a tetrahedral-site occupancy of 50%.',
  'O²⁻作近似A3最密堆积，Ti⁴⁺填充其八面体空隙，八面体空隙占有率50%':
    'The O²⁻ ions form an approximately A3 close packing and the Ti⁴⁺ ions fill half of its octahedral voids — an octahedral-site occupancy of 50%.',
  '(NH₂)₂CO位于晶胞的顶点和体心，两个分子的取向不同':
    'The (NH₂)₂CO molecules sit at the corners and the body centre of the cell, and the two orientations differ.',
  '晶胞中有6个C原子，分别属于两套不等效的等效点系，分数坐标分别为(0,0,0), (1/3,2/3,1/3), (2/3,1/3,2/3)；(0,0,1/2), (1/3,2/3,5/6), (2/3,1/3,1/6)。层内sp²杂化共价键，层间van der Waals力结合':
    'The cell contains 6 C atoms belonging to two inequivalent sets of equivalent positions, at (0,0,0), (1/3,2/3,1/3), (2/3,1/3,2/3) and at (0,0,1/2), (1/3,2/3,5/6), (2/3,1/3,1/6). Within a layer the atoms are joined by sp² covalent bonds, while the layers are held by van der Waals forces.',

  // ---------------------------------------------------------------------
  // 晶体描述（`description`）—— ★ 这 22 段**不进 H5 的 DOM**（只有
  //   `modules/crystal/tools.js` 把它当模型上下文取走）。登记在此是守卫要求，
  //   对 H5 运行时没有替换效果。见文件头的说明。
  // ---------------------------------------------------------------------
  'Cu型晶体为A1立方最密堆积(FCC)结构，空间群Fm-3m。等径球体以ABCABC...层状堆叠，原子占据立方体顶点和面心。每个原子有12个最近邻，空间利用率约74.05%。铜、铝、金、银等许多金属为FCC结构。':
    'The Cu-type crystal has the A1 cubic close-packed (FCC) structure, space group Fm-3m. Equal spheres stack in ABCABC… layers, with atoms at the corners and face centres of the cube. Every atom has 12 nearest neighbours and the packing efficiency is about 74.05%. Many metals — copper, aluminium, gold, silver — adopt the FCC structure.',
  'α-Fe型晶体为A2立方体心堆积(BCC)结构，空间群Im-3m。原子占据立方体的8个顶点和1个体心。每个原子有8个最近邻，空间利用率约68.02%，低于密堆积结构。铁、钨、铬等金属在室温下为BCC结构。':
    'The α-Fe-type crystal has the A2 body-centered cubic (BCC) structure, space group Im-3m. The atoms occupy the 8 corners and the body centre of the cube. Every atom has 8 nearest neighbours and the packing efficiency is about 68.02%, lower than that of a close-packed structure. Metals such as iron, tungsten and chromium adopt the BCC structure at room temperature.',
  'Mg型晶体为A3六方最密堆积(HCP)结构，空间群P6₃/mmc。等径球体以ABAB...层状堆叠，每个原子有12个最近邻。空间利用率约为74.05%，与面心立方相同。轴比c/a理想值为1.633。':
    'The Mg-type crystal has the A3 hexagonal close-packed (HCP) structure, space group P6₃/mmc. Equal spheres stack in ABAB… layers and every atom has 12 nearest neighbours. The packing efficiency is about 74.05%, the same as for face-centered cubic. The ideal c/a ratio is 1.633.',
  '岩盐结构是典型的离子晶体结构，Na⁺和Cl⁻各构成面心立方子晶格，彼此沿棱边方向位移半个晶胞参数。Na⁺被6个Cl⁻包围（八面体配位），反之亦然。许多碱金属卤化物、氧化物和硫化物均采用此结构。':
    'The rock-salt structure is a classic ionic structure: the Na⁺ and Cl⁻ ions each form a face-centered cubic sublattice, displaced from one another by half a cell edge. Each Na⁺ is surrounded by 6 Cl⁻ (octahedral coordination) and vice versa. Many alkali halides, oxides and sulfides adopt this structure.',
  'CsCl型结构中 Cl⁻ 位于立方体顶点、Cs⁺ 位于体心（或互换）。点阵型式为简单立方(cP) —— Cs⁺ 与 Cl⁻ 是不同种离子，顶点与体心的环境不同、不能靠点阵平移互相重合，「体心」只是这一组离子排列的外观。配位数为8，每个离子被8个异号离子包围形成立方体配位。CsCl本身在高温下会转变为NaCl结构。':
    'In the CsCl-type structure the Cl⁻ ions are at the corners of the cube and the Cs⁺ ion at the body centre (or vice versa). The lattice type is simple cubic (cP): Cs⁺ and Cl⁻ are different ions, so the corner and body-centre sites are not equivalent and cannot be mapped onto one another by a lattice translation — the "body centre" is only how this particular arrangement looks. The coordination number is 8: each ion is surrounded by 8 counter-ions in cubic coordination. CsCl itself converts to the NaCl structure at high temperature.',
  '萤石结构中Ca²⁺构成面心立方子晶格，F⁻占据全部8个四面体空隙位置。每个Ca²⁺被8个F⁻包围（立方体配位），每个F⁻被4个Ca²⁺包围（四面体配位）。反萤石结构（如Na₂O）中阳离子与阴离子位置互换。':
    'In the fluorite structure the Ca²⁺ ions form a face-centered cubic sublattice and the F⁻ ions occupy all 8 tetrahedral voids. Each Ca²⁺ is surrounded by 8 F⁻ (cubic coordination) and each F⁻ by 4 Ca²⁺ (tetrahedral coordination). In the anti-fluorite structure (e.g. Na₂O) the cation and anion positions are interchanged.',
  '钙钛矿结构通式为ABX₃，空间群Pm-3m。Ca²⁺占据立方体顶点，O²⁻占据面心，Ti⁴⁺占据体心。Ti被6个O包围形成八面体配位。该结构是铁电、超导等功能材料的基础，在材料科学中极为重要。':
    'The perovskite structure has the general formula ABX₃, space group Pm-3m. Ca²⁺ occupies the corners of the cube, O²⁻ the face centres and Ti⁴⁺ the body centre. Ti is surrounded by 6 O atoms in octahedral coordination. This structure underlies ferroelectric and superconducting functional materials and is extremely important in materials science.',
  'NiAs型结构是过渡金属砷化物的典型共价晶体。As作六方密堆积，Ni填充全部八面体空隙。每个Ni被6个As形成八面体配位，每个As被6个Ni形成三方棱柱配位。Ni-As间为极性共价键，具有金属光泽和导电性。':
    'The NiAs-type structure is a typical covalent crystal of the transition-metal arsenides. The As atoms form a hexagonal close packing and the Ni atoms fill all the octahedral voids. Each Ni is octahedrally coordinated by 6 As and each As is trigonal-prismatically coordinated by 6 Ni. The Ni–As bonds are polar covalent; the crystals have a metallic lustre and conduct electricity.',
  '金红石是TiO₂最常见的晶型。Ti位于体心和顶点（各被6个O八面体配位），O位于3个Ti构成的近似等边三角形中心。Ti-O八面体共边沿c轴形成链状结构。':
    'Rutile is the most common form of TiO₂. The Ti atoms sit at the body centre and the corners (each octahedrally coordinated by 6 O) and the O atoms sit at the centres of nearly equilateral triangles formed by 3 Ti. Edge-sharing TiO₆ octahedra form chains along the c axis.',
  '黄铁矿是FeS₂最常见的晶型。Fe位于FCC位置，S₂二聚体（哑铃形）占据体心和棱心，沿[111]方向取向。Fe被6个S八面体配位，S被3个Fe和1个S四面体配位。':
    'Pyrite is the most common form of FeS₂. The Fe atoms occupy the FCC positions and the dumbbell-shaped S₂ dimers occupy the body centre and the edge centres, oriented along [111]. Fe is octahedrally coordinated by 6 S, and each S is tetrahedrally coordinated by 3 Fe and 1 S.',
  'ReO₃结构可视为钙钛矿去掉A位阳离子（如BaTiO₃去掉Ba）。Re在顶点，O在棱中点，形成ReO₆八面体共顶点连接的3D网络。中心位置为空，可容纳插层离子。':
    'The ReO₃ structure can be seen as a perovskite with the A-site cation removed (as if Ba were removed from BaTiO₃). Re sits at the corners and O at the edge midpoints, forming a 3D network of corner-sharing ReO₆ octahedra. The centre of the cell is empty and can accommodate intercalated ions.',
  '金刚石型结构中碳原子以sp³杂化形成共价键，每个碳原子被4个碳原子四面体包围。晶胞中有8个C原子，分别属于两套不等效的等效点系。该结构可视为两套面心立方子晶格沿体对角线方向位移1/4体对角线而成。碳的同素异形体之一，自然界最硬的物质。':
    'In the diamond structure the carbon atoms form sp³ covalent bonds and each carbon is tetrahedrally surrounded by 4 others. The cell contains 8 C atoms belonging to two inequivalent sets of equivalent positions. The structure can be seen as two face-centered cubic sublattices displaced by 1/4 of the body diagonal. It is one of the allotropes of carbon and the hardest natural substance.',
  '闪锌矿结构与金刚石结构类似，两套面心立方子晶格分别由Zn和S占据。每个Zn被4个S四面体包围，每个S同样被4个Zn包围。与金刚石的区别在于两种原子不同，因此缺乏反演中心。':
    'The zinc blende structure resembles the diamond structure, with the two face-centered cubic sublattices occupied by Zn and S respectively. Each Zn is tetrahedrally surrounded by 4 S and each S likewise by 4 Zn. Unlike diamond the two kinds of atom differ, so the structure lacks a centre of inversion.',
  '纤锌矿是ZnS的六方变体，Zn和S各构成六方密堆积子晶格，沿c轴位移3/8。每个Zn被4个S四面体配位，反之亦然。常见于ZnO、CdS、GaN等半导体材料。':
    'Wurtzite is the hexagonal polymorph of ZnS: Zn and S each form a hexagonal close-packed sublattice, displaced by 3/8 along the c axis. Each Zn is tetrahedrally coordinated by 4 S and vice versa. It is common in semiconductors such as ZnO, CdS and GaN.',
  'α-石英是SiO₂最常见的晶型之一，属于三方晶系。每个Si原子被4个O原子包围形成SiO₄四面体，四面体之间通过共顶点连接形成三维网络结构。Si-O键兼具离子性和共价性，使石英具有高硬度（莫氏7）、高熔点和压电效应。石英是地壳中含量最丰富的矿物之一。':
    'α-Quartz is one of the most common forms of SiO₂ and belongs to the trigonal system. Each Si atom is surrounded by 4 O atoms to form an SiO₄ tetrahedron, and the tetrahedra share corners to build a three-dimensional network. The Si–O bond is partly ionic and partly covalent, which gives quartz its high hardness (Mohs 7), high melting point and piezoelectric effect. Quartz is one of the most abundant minerals in the Earth\u2019s crust.',
  '方石英（白硅石）是SiO₂的高温变体之一，属立方晶系。Si原子占据金刚石结构中C原子位置（两套FCC子晶格沿体对角线位移1/4），O原子位于每对相邻Si原子的连线中点。每个Si被4个O四面体包围，每个O连接2个Si形成Si-O-Si桥键。结构与金刚石拓扑相同，但Si-Si之间有O桥接。':
    'Cristobalite is one of the high-temperature forms of SiO₂ and is cubic. The Si atoms occupy the positions of the C atoms in the diamond structure (two FCC sublattices displaced by 1/4 of the body diagonal) and the O atoms sit at the midpoints between neighbouring Si atoms. Each Si is tetrahedrally surrounded by 4 O and each O bridges 2 Si to form a Si–O–Si linkage. The topology is that of diamond, but with O bridging every Si–Si pair.',
  '固态CO₂（干冰）是典型的分子晶体。CO₂分子为线性O=C=O结构，C=O键长约1.16Å，4个分子沿不同体对角线方向排列。分子间以微弱的范德华力结合。干冰在-78.5°C直接升华，常压下无液态，广泛用作制冷剂。':
    'Solid CO₂ (dry ice) is a typical molecular crystal. The CO₂ molecule is linear, O=C=O, with a C=O bond length of about 1.16 Å, and the 4 molecules in the cell point along different body diagonals. The molecules are held together only by weak van der Waals forces. Dry ice sublimes directly at −78.5 °C and has no liquid phase at ordinary pressure; it is widely used as a refrigerant.',
  '冰是自然界最常见的冰晶型，O原子形成类纤锌矿的四面体骨架。晶胞含4个H₂O分子。O原子处于近似四面体配位中。每个水分子内O-H键长约0.96Å，HOH角约109.5°。每个O原子与2个H以共价键结合（O-H），并通过另外2个O···H-O氢键接受质子。冰的开放结构使其密度（0.917g/cm³）低于液态水，因此冰浮于水上。':
    'Ice is the most common ice polymorph in nature: the O atoms form a wurtzite-like tetrahedral framework. The cell contains 4 H₂O molecules and each O atom is in approximately tetrahedral coordination. Within a water molecule the O–H bond length is about 0.96 Å and the HOH angle about 109.5°. Every O is covalently bonded to 2 H (O–H) and accepts protons through 2 further O···H–O hydrogen bonds. This open structure makes ice (0.917 g/cm³) less dense than liquid water, so ice floats.',
  '碘晶体是典型的分子晶体，属正交晶系Cmce空间群。晶胞中含4个I₂分子，分子质心分别位于顶点、C心和面心。分子取向分两种且相互垂直：位于顶点和上下底面心的分子长轴平行于c轴，位于四个侧面心的分子长轴平行于a轴。I-I键长约2.72Å，分子间以van der Waals力结合。':
    'Iodine crystals are a typical molecular crystal, orthorhombic, space group Cmce. The cell contains 4 I₂ molecules with their centres of mass at the corners, the C face centre and the face centres. There are two perpendicular orientations: the molecules at the corners and on the top and bottom faces have their long axis parallel to c, while those on the four side faces have it parallel to a. The I–I bond length is about 2.72 Å and the molecules are held by van der Waals forces.',
  '尿素晶体是典型的有机分子晶体。分子内C=O与两个NH₂基团以共价键连接，分子间通过N-H···O氢键形成三维网络。每个O原子接受4个N-H···O氢键，形成扭曲的四面体氢键环境。尿素是重要的化肥原料和工业化学品。':
    'Urea crystals are a typical organic molecular crystal. Within a molecule the C=O group is covalently bonded to two NH₂ groups, and the molecules are linked into a three-dimensional network by N–H···O hydrogen bonds. Every O atom accepts 4 N–H···O hydrogen bonds, forming a distorted tetrahedral hydrogen-bonding environment. Urea is an important fertilizer feedstock and industrial chemical.',
  '六方石墨是碳的层状同素异形体。层内碳原子以sp²杂化形成六角蜂巢状共价键，层间以弱范德华力结合。AB堆积方式，层内C-C键长1.42Å，层间距3.35Å。因层间结合力弱，石墨具有良好的润滑性和导电各向异性，属混合键型晶体。':
    'Hexagonal graphite is a layered allotrope of carbon. Within a layer the carbon atoms form a hexagonal honeycomb network of sp² covalent bonds, while the layers are held by weak van der Waals forces. The stacking is AB; the in-layer C–C bond length is 1.42 Å and the interlayer spacing 3.35 Å. Because the interlayer forces are weak, graphite is a good lubricant and conducts electricity anisotropically — a mixed-bonding crystal.',
  '三方石墨是碳的另一种层状同素异形体，属三方晶系，R心六方点阵。与六方石墨（AB堆积）不同，三方石墨采用ABC堆积方式。层内碳原子以sp²杂化形成六角蜂巢状共价键（配位数3），层间以弱范德华力结合。石墨具有良好的润滑性和导电各向异性，属混合键型晶体。':
    'Rhombohedral graphite is another layered allotrope of carbon; it is trigonal, with an R-centered hexagonal lattice. Unlike hexagonal graphite (AB stacking) it uses ABC stacking. Within a layer the carbon atoms form a hexagonal honeycomb network of sp² covalent bonds (coordination number 3), while the layers are held by weak van der Waals forces. Graphite is a good lubricant and conducts electricity anisotropically — a mixed-bonding crystal.',
  'CdI₂是典型的层状结构，属混合键型晶体。I⁻构成六方密堆积，Cd²⁺占据每隔一层的八面体空隙，形成I-Cd-I三明治层。层内为离子键（有共价成分），层间为范德华力，易沿层面解理。':
    'CdI₂ has a classic layered structure and is a mixed-bonding crystal. The I⁻ ions form a hexagonal close packing and the Cd²⁺ ions occupy the octahedral voids in every other layer, giving I–Cd–I sandwich layers. The bonding within a layer is ionic (with some covalent character) and van der Waals forces act between layers, so the crystal cleaves easily along the layers.',

  // ---------------------------------------------------------------------
  // 元素名（`data/elements.js` 的 name 字段；英文名与表里本就有的 enName 一致）
  // ---------------------------------------------------------------------
  '氢': 'Hydrogen',
  '氦': 'Helium',
  '锂': 'Lithium',
  '铍': 'Beryllium',
  '硼': 'Boron',
  '碳': 'Carbon',
  '氮': 'Nitrogen',
  '氧': 'Oxygen',
  '氟': 'Fluorine',
  '氖': 'Neon',
  '钠': 'Sodium',
  '镁': 'Magnesium',
  '铝': 'Aluminum',
  '硅': 'Silicon',
  '磷': 'Phosphorus',
  '硫': 'Sulfur',
  '氯': 'Chlorine',
  '氩': 'Argon',
  '钾': 'Potassium',
  '钙': 'Calcium',
  '钪': 'Scandium',
  '钛': 'Titanium',
  '钒': 'Vanadium',
  '铬': 'Chromium',
  '锰': 'Manganese',
  '铁': 'Iron',
  '钴': 'Cobalt',
  '镍': 'Nickel',
  '铜': 'Copper',
  '锌': 'Zinc',
  '镓': 'Gallium',
  '锗': 'Germanium',
  '砷': 'Arsenic',
  '硒': 'Selenium',
  '溴': 'Bromine',
  '氪': 'Krypton',
  '铷': 'Rubidium',
  '锶': 'Strontium',
  '钇': 'Yttrium',
  '锆': 'Zirconium',
  '铌': 'Niobium',
  '钼': 'Molybdenum',
  '锝': 'Technetium',
  '钌': 'Ruthenium',
  '铑': 'Rhodium',
  '钯': 'Palladium',
  '银': 'Silver',
  '镉': 'Cadmium',
  '铟': 'Indium',
  '锡': 'Tin',
  '锑': 'Antimony',
  '碲': 'Tellurium',
  '碘': 'Iodine',
  '氙': 'Xenon',
  '铯': 'Cesium',
  '钡': 'Barium',
  '镧': 'Lanthanum',
  '铈': 'Cerium',
  '镨': 'Praseodymium',
  '钕': 'Neodymium',
  '钷': 'Promethium',
  '钐': 'Samarium',
  '铕': 'Europium',
  '钆': 'Gadolinium',
  '铽': 'Terbium',
  '镝': 'Dysprosium',
  '钬': 'Holmium',
  '铒': 'Erbium',
  '铥': 'Thulium',
  '镱': 'Ytterbium',
  '镥': 'Lutetium',
  '铪': 'Hafnium',
  '钽': 'Tantalum',
  '钨': 'Tungsten',
  '铼': 'Rhenium',
  '锇': 'Osmium',
  '铱': 'Iridium',
  '铂': 'Platinum',
  '金': 'Gold',
  '汞': 'Mercury',
  '铊': 'Thallium',
  '铅': 'Lead',
  '铋': 'Bismuth',
  '钋': 'Polonium',
  '砹': 'Astatine',
  '氡': 'Radon',
  '钫': 'Francium',
  '镭': 'Radium',
  '锕': 'Actinium',
  '钍': 'Thorium',
  '镤': 'Protactinium',
  '铀': 'Uranium',
  '镎': 'Neptunium',
  '钚': 'Plutonium',
  '镅': 'Americium',
  '锔': 'Curium',
  '锫': 'Berkelium',
  '锎': 'Californium',
  '锿': 'Einsteinium',
  '镄': 'Fermium',
  '钔': 'Mendelevium',
  '锘': 'Nobelium',
  '铹': 'Lawrencium',

  // ---------------------------------------------------------------------
  // 晶体列表页（pages/index.js）
  // ---------------------------------------------------------------------
  '晶体结构库': 'Crystal structure library',
  '全部': 'All',
  '金属晶体': 'Metallic crystals',
  '离子晶体': 'Ionic crystals',
  '共价晶体': 'Covalent crystals',
  '分子晶体': 'Molecular crystals',
  '混合键型': 'Mixed bonding',
  '卡片组件加载失败，请刷新页面重试': 'Failed to load the card component — please refresh the page',
  '暂无该分类的晶体数据': 'No crystals in this category yet',
  // ★ 守卫**看不见**这一条：上面那段的模板串里嵌了注释反引号，词法扫描在那里错位
  //   （同一处错位还漏掉了 `暂无该分类的晶体数据` 的第 86 行出现）。它是用户真能
  //   看到的首屏占位，所以手工补登 —— 见交接报告里的"守卫盲区"一节。
  '正在加载晶体预览…': 'Loading crystal previews…',

  // ---------------------------------------------------------------------
  // 查看页（pages/viewer.js）
  // ---------------------------------------------------------------------
  '晶体结构': 'Crystal structure',

  // ---------------------------------------------------------------------
  // 对比页（pages/compare.js）
  // ---------------------------------------------------------------------
  'CPK空间填充': 'CPK space-filling',
  '球棍模型': 'Ball-and-stick',
  '☰竖屏': '☰ Portrait',
  '▮横屏': '▮ Landscape',
  '🔗联动': '🔗 Linked',
  '🔓独立': '🔓 Independent',
  '↺对齐视角': '↺ Align view',
  '≡对齐样式': '≡ Align style',
  '⚙设置': '⚙ Settings',
  '⚙收起': '⚙ Collapse',
  '视角已对齐': 'Views aligned',
  '样式已对齐': 'Styles aligned',
  '左侧设置': 'Left settings',
  '右侧设置': 'Right settings',
  '上侧设置': 'Top settings',
  '下侧设置': 'Bottom settings',
  '共享设置（两侧同步）': 'Shared settings (synced on both sides)',
  '裁剪': 'Clip',
  '元素筛选': 'Element filter',
  '标签': 'Labels',
  '键': 'Bonds',
  '轴': 'Axes',
  '体对角': 'Body diag.',
  '面对角': 'Face diag.',
  '图层': 'Layers',

  // ---------------------------------------------------------------------
  // 设置页（pages/settings.js）
  // ---------------------------------------------------------------------
  '全局设置': 'Global settings',
  '视觉颜色': 'Visual colors',
  '恢复默认': 'Reset',
  '自定义3D视图中的背景、线框、空隙等颜色':
    'Customize the background, wireframe and void colors of the 3D view',
  '元素颜色': 'Element colors',
  '点击元素可自定义其在3D视图中的显示颜色':
    'Click an element to customize how it is displayed in the 3D view',
  '周期表': 'Periodic table',
  '列表': 'List',
  '自定义': 'Custom',
  '重置为默认颜色': 'Reset to default color',
  '背景颜色': 'Background color',
  '晶胞线框颜色': 'Cell wireframe color',
  '八面体空隙颜色': 'Octahedral void color',
  '四面体空隙颜色': 'Tetrahedral void color',
  '点阵点颜色': 'Lattice point color',
  '体对角线颜色': 'Body diagonal color',
  '面对角线颜色': 'Face diagonal color',
  '氢键颜色': 'Hydrogen bond color',
  '确定要恢复所有视觉元素的默认颜色吗？':
    'Restore the default colors of all visual elements?',
  '确定要恢复所有元素的默认颜色吗？':
    'Restore the default colors of all elements?',
  '请输入有效的十六进制颜色 (#RRGGBB)':
    'Enter a valid hexadecimal color (#RRGGBB)',

  // ---------------------------------------------------------------------
  // 图层面板（components/layer-control.js）
  // ---------------------------------------------------------------------
  '控制面板': 'Control panel',
  '分元素控制': 'Per-element controls',
  '显示模型': 'Display model',
  '球棍': 'Ball-and-stick',
  '外观': 'Appearance',
  '原子缩放': 'Atom scale',
  '原子透明度': 'Atom opacity',
  '调高可看清被原子挡住的对称元素、空隙':
    'Raise it to see the symmetry elements and voids hidden behind the atoms',
  '氢键': 'Hydrogen bonds',
  '显示在原子上方': 'Draw above the atoms',
  '变换晶胞原点': 'Change cell origin',
  '晶胞裁剪': 'Clip cell',
  '晶体信息': 'Crystal information',
  '图层显示': 'Layers',
  '原子': 'Atoms',
  '原子标签': 'Atom labels',
  '点阵型式': 'Lattice type',
  '化学键': 'Bonds',
  '坐标轴': 'Axes',
  '体对角线': 'Body diagonal',
  '面对角线': 'Face diagonal',
  '八面体空隙': 'Octahedral void',
  '四面体空隙': 'Tetrahedral void',
  // ★ 信息面板的标签：源码里把值单独包了一层 span（见 layer-control.js 里 render()
  //   的说明），标签与值因此各是一个文本节点、可以分别替换。
  '化学式：': 'Formula: ',
  '晶系：': 'Crystal system: ',
  '空间群：': 'Space group: ',
  '点阵型式：': 'Lattice type: ',
  '结构基元：': 'Structural unit: ',
  '配位数：': 'Coordination number: ',
  '空间利用率：': 'Packing efficiency: ',
  '堆积方式：': 'Packing: ',
  '晶胞参数：': 'Cell parameters: ',

  // ---------------------------------------------------------------------
  // 原子信息弹窗（components/atom-info-popup.js）
  // ★ 整个文件的标签都在守卫的**盲区**里（嵌套模板串让词法扫描错位，见交接报告），
  //   所以只报了其中 5 条。这些标签各自是独立的文本节点，登记即可翻译 —— 手工补登。
  // ---------------------------------------------------------------------
  '未选中任何原子': 'No atom selected',
  '点阵点': 'Lattice point',
  '空隙类型': 'Void type',
  '分数坐标': 'Fractional coordinates',
  '元素名称': 'Element',
  '英文名称': 'English name',
  '原子序数': 'Atomic number',
  '相对原子质量': 'Relative atomic mass',
  '电子排布': 'Electron configuration',
  '电负性': 'Electronegativity',
  '原子半径': 'Atomic radius',
}

registerDict('crystal-h5', { zh, en, text })
