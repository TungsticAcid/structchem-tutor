/**
 * 原子信息弹窗组件
 * 显示元素符号、名称、坐标等关键信息
 */
Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer: 'onVisibleChanged'
    },
    atomData: {
      type: Object,
      value: null
    }
  },

  data: {
    show: false,
    animate: false
  },

  methods: {
    onVisibleChanged(val) {
      if (val) {
        this.setData({ show: true })
        // 延迟触发动画
        setTimeout(() => this.setData({ animate: true }), 50)
      } else {
        this.setData({ animate: false })
        setTimeout(() => this.setData({ show: false }), 300)
      }
    },

    /** 关闭弹窗 */
    onClose() {
      this.triggerEvent('close')
    },

    /** 阻止冒泡 */
    onStopPropagation() {
      // 阻止点击弹窗内容时关闭
    }
  }
})
