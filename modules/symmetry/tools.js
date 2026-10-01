/**
 * tools.js — 分子对称性模块的专属工具（给模型用）
 *
 * ★ 与中枢工具的分工：中枢提供那些语义与模块无关的（getSnapshot / loadKnowledge /
 *   applySceneActions…）；本文件只提供**对称性专属**的查询能力。
 *
 * ★ 一条硬约定（CLAUDE.md §一.2）：**数值与符号一律程序算**。
 *   点群符号、对称元素清单、群阶——全部来自 `engine/pointGroup.js` 的识别结果，
 *   模型不得凭记忆回答（"水是 C2v"它当然知道，但"联苯是 D2h 还是 D2d"它未必，
 *   而这类判断正是本模块存在的意义）。
 */
/**
 * 创建工具集。
 *
 * @param {Object} facade  createSymmetryFacade() 的返回值
 * @returns {{ defs: Object, handlers: Object }}  交给 createModule 的形状
 */
export function createSymmetryTools(facade) {
  if (!facade) throw new Error('createSymmetryTools 需要 facade')

  const def = (name, description, properties, required) => ({
    type: 'function',
    function: {
      name, description,
      parameters: { type: 'object', properties: properties || {}, required: required || [] },
    },
  })

  const defs = {
    read: [],
    query: [
      def('listExamples',
        '列出内置的示例分子/晶体（id、名称、化学式）。学生要分析某个结构的对称性时，'
        + '先用它拿到合法的 id——**id 必须来自本工具的返回值，不可编造**。', {}),
      def('queryPointGroup',
        '识别某个结构的**点群**，并给出它全部对称元素（类型、阶数、方向）。'
        + '★ 若该结构是**晶体**（示例里的 NaCl / CsCl），返回的是**空间群**'
        + '（符号、编号、晶系、点群），因为晶体的周期性与分子不是一回事。'
        + '返回的一切都由程序算出，直接引用即可，**不要自己判断点群或空间群**。'
        + '省略 id 则用当前选中的那个。', {
        id: { type: 'string', description: '示例 id（来自 listExamples）；省略则用当前选中的' },
      }, []),
    ],
    hand: [],
    teach: [],
  }

  const handlers = {
    listExamples() {
      const list = facade.listExamples()
      return {
        count: list.length,
        examples: list,
        /**
         * ★ 这一段原先写的是 `note: PUZZLE_HINT` —— 而 `PUZZLE_HINT` **全仓库
         *   从来就没有定义过**（只在那一行被引用）。于是本工具每次调用都抛
         *   `ReferenceError: PUZZLE_HINT is not defined`，**自写下起就是坏的**。
         *
         *   为什么长期没人发现：同源断言（defs 里的名字都有 handler）**只保证
         *   "名字对得上"，不保证"调得动"**。而此前没有任何测试真的调用过这个工具。
         *   现在 test-symmetry-module 里有一条"每个 handler 都调得动"的断言守着这类事。
         */
        note: 'id 必须来自本返回值，不可编造。'
          + '注意 kind：molecule 用点群识别，crystal（NaCl / CsCl）用空间群识别——'
          + '晶体是无限周期结构，没有分子点群，两者不是一回事。',
      }
    },
    /**
     * ★ 本处理器是 **async**：晶体分支要等 WASM 空间群分析。
     *   工具执行链（tool-registry.execute → conversation 的 await executeTool）
     *   本就 await 返回值，所以这里返回 Promise 无需改动上游。
     */
    async queryPointGroup(p) {
      const id = (p && p.id) || null

      // ---- 晶体分支：点群对晶体没有意义，要答的是**空间群** ----
      if (facade.isCrystal(id)) {
        const c = await facade.identifyCrystal(id)
        if (c.error) return { error: c.error }
        return {
          id: c.id,
          title: c.title,
          kind: 'crystal',
          spaceGroup: c.spaceGroupSymbol,
          spaceGroupNumber: c.spaceGroupNumber,
          pointGroup: c.pointGroup,
          crystalSystem: c.crystalSystem,
          pearsonSymbol: c.pearsonSymbol,
          elementCount: c.elementCount,
          elements: c.elements,
          note: '晶体走**空间群**（描述无限周期结构），而不是分子点群（描述有限的分子骨架）。'
            + '空间群编号与符号由 spglib 从晶胞算出，可直接引用。'
            + '讲解时注意区分：点群是空间群去掉平移成分之后剩下的那部分。',
        }
      }

      // ---- 分子分支（原样）----
      const r = facade.identify(id)
      if (!r) {
        return {
          error: id
            ? `未知示例 id：${id}（id 必须来自 listExamples 的返回值）`
            : '当前没有选中的结构（先用 listExamples 挑一个，或让学生打开一个）',
        }
      }
      return {
        id: r.id,
        title: r.title,
        kind: 'molecule',
        pointGroup: r.symbol,
        pointGroupName: r.name,
        elementCount: r.elements.length,
        elements: r.elements.map((e) => ({
          label: e.label,
          type: e.type,
          order: e.order,
          axis: e.axis,
        })),
        // ★ 对称元素的**稳定 key**：`setElementVisible` / `playOperation` 要用它指认
        //   "哪一个"。没有它，模型只能去猜数组下标——而下标换结构就变意思。
        elementKeys: (facade.listSymmetryElements ? facade.listSymmetryElements() : []).map((e) => ({
          key: e.key, label: e.label, type: e.type, defaultVisible: e.defaultVisible,
        })),
        // ★ 原子 key：`selectAtom` 要用它指认"哪个原子"。选中后页面会显示
        //   等价原子与稳定化子——那是对称性最直观的一课。
        atoms: facade.listAtoms ? facade.listAtoms() : [],
        note: '点群符号与对称元素清单均由程序识别所得，可直接引用。'
          + '要让画面动起来，用 applySceneActions 下发动作，元素/原子的 key 就取上面的 '
          + 'elementKeys / atoms —— **不要自己编造 key**。'
          + '若要向学生解释"为什么是这个点群"，可结合 elements 里各元素的类型与方向来讲。',
      }
    },
  }

  return { defs, handlers }
}

export default createSymmetryTools
