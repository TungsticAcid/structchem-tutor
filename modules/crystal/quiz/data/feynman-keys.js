/**
 * feynman-keys.js — 费曼式复述的**评分要点**（本地可判定的那部分）
 *
 * 每个知识点定义若干**概念组**，组内是同一个要点的不同说法（命中任一即算覆盖该组）。
 * 学生复述时本地匹配一遍，得到"覆盖了哪几组、漏了哪几组"——
 *
 *   · **零 token**：不调模型就能给出结构化结果
 *   · **可复现**：同样的复述得到同样的判定（不像模型评价那样有随机性）
 *   · **可追问**：漏掉的组直接就是"该追问什么"（`missingKeywords`）
 *
 * ★ 但它**不是判决**：关键词匹配绕过语义——学生说"每个碳周围有四个最近邻"
 *   可能漏判"4 配位"。故本表的结果只作**参考**交给模型，由它结合语义给最终评价。
 *   工具给事实、模型组织语言。
 *
 * ★ 为什么不用知识条目的 `keywords` 字段代替：
 *   那是**检索词**（用来在清单里找到条目），而这里是**复述应覆盖的要点**——
 *   语义不同。例如 C1-3 的检索词含"经典易错"，但学生复述"为什么是简单立方"时
 *   不该被要求说出"经典易错"这四个字。
 */

/**
 * 知识点 id → 概念组数组。
 * 每组是一个候选词数组：复述里出现**任一**即视为覆盖该组。
 *
 * 设计原则：
 *   · 每组对应**一个可独立判定的要点**，而不是一句话的所有细节
 *   · 组内包含学生**可能使用的不同表述**（术语与口语都列）
 *   · 组数控制在 3–5 组：太少无法区分"懂了"与"背了"，太多会变成挑字眼
 */
export const FEYNMAN_KEYS = {
  // 点阵型式：核心是"点阵点"与"带心"，以及它与晶系的区分
  'crystal:C1': [
    ['点阵', '平移', '周期性', '重复'],
    ['简单', '体心', '面心', '底心', '带心'],
    ['晶系', '晶胞形状', 'a=b=c', '夹角'],
    ['布拉维', '14'],
  ],

  // 结构基元：核心是"一个点阵点代表什么"，以及金刚石那个易错点
  'crystal:C2': [
    ['基元', '结构基元', '重复单元'],
    ['点阵点', '一个点'],
    ['平均', '相除', '除以', '个数'],
    ['金刚石', 'C2', '两组', '两套'],
  ],

  // 堆积方式：层序 + 空间利用率 + A2 的例外 + 相切方向
  'crystal:C3': [
    ['ABC', 'ABAB', '层序', '密置层'],
    ['空间利用率', '74', '68', '密堆积'],
    ['12', '配位数'],
    ['体对角线', '面对角线', '相切', '半径'],
  ],

  // 配位环境：配位数与构型、半径比、分子晶体的例外
  'crystal:C4': [
    ['配位数', '最近邻', '几个离子', '几个原子'],
    ['构型', '多面体', '八面体', '四面体', '立方体'],
    ['半径比', '半径'],
    ['分子晶体', '无经典配位数', '范德华'],
  ],

  // 空隙分布：两类空隙 + 那个最高危的问法区分
  'crystal:C5': [
    ['四面体', '八面体'],
    ['晶胞内', '每个球', '周围'],
    ['1:2:1', '比例', '两倍'],
    ['填隙', '占有率', '填满', '一半'],
  ],

  // 空间群与对称元素：符号读法 + 点群/空间群之别 + 带平移的对称元素
  'crystal:C6': [
    ['空间群', '点阵型式', '第一位', '首字母'],
    ['点群', '宏观', '微观'],
    ['螺旋', '滑移', '平移'],
    ['旋转轴', '镜面', '反演'],
  ],

  // 晶胞参数：参数特征 + 体积公式 + Z 的陷阱 + 镜像
  'crystal:C7': [
    ['a', 'b', 'c', 'α', 'β', 'γ', '夹角'],
    ['体积', 'abc', '公式'],
    ['密度', 'Z', '化学式单位', '摩尔质量'],
    ['最近邻', '镜像', '相邻晶胞', '周期性'],
  ],

  // 结构—性能关联：推理链条 + 两个经典例 + 同质多象
  'crystal:C8': [
    ['成键', '结构', '性质'],
    ['金刚石', '石墨'],
    ['层内', '层间', '各向异性'],
    ['同素异形体', '同质多象', '条件'],
  ],
}

/**
 * 评估一次复述（**本地匹配**）。
 *
 * @param {string} kp 知识点 id（'crystal:C5' 或裸 'C5'）
 * @param {string} transcript 学生的复述原文
 * @returns {Object} 结构化结果：命中/缺失的概念组，以及一个**参考性**的判定
 */
export function evaluateTranscript(kp, transcript) {
  const key = String(kp || '').includes(':') ? String(kp) : `crystal:${kp}`
  const groups = FEYNMAN_KEYS[key] || []
  const t = String(transcript || '')
  if (!groups.length) {
    return { knowledgePoint: key, totalGroups: 0, hitGroups: 0, missing: [], verdict: 'unknown', note: '该知识点没有预置复述要点，请完全依据语义判断。' }
  }
  const hits = groups.map((g) => g.some((k) => t.includes(k)))
  const hitCount = hits.filter(Boolean).length
  const missing = groups.filter((_, i) => !hits[i]).map((g) => g[0])
  const verdict = hitCount === groups.length ? 'complete'
    : (hitCount >= Math.ceil(groups.length / 2) ? 'partial' : 'insufficient')

  return {
    knowledgePoint: key,
    totalGroups: groups.length,
    hitGroups: hitCount,
    hitKeywords: groups.filter((_, i) => hits[i]).map((g) => g[0]),
    missing,
    /** 仅供参考的判定：**最终评价由模型结合语义给出** */
    verdictHint: verdict,
    suggestedMasteryDelta: verdict === 'complete' ? 2 : (verdict === 'partial' ? 1 : 0),
    note: '以上是**关键词匹配**的结果（可能漏判同义表述）。请结合语义给最终评价；'
      + (missing.length ? `若确属缺失，针对这些点追问——但**不要直接说出答案**。` : ''),
  }
}

/** 列出哪些知识点已预置复述要点 */
export function coveredKnowledgePoints() {
  return Object.keys(FEYNMAN_KEYS)
}

export default { FEYNMAN_KEYS, evaluateTranscript, coveredKnowledgePoints }
