/**
 * 特征标表数据（标准群论数据，参考 Cotton《Chemical Applications of Group Theory》附录）
 * 覆盖 32 个晶体学点群 + 五重轴非晶体学点群 + 连续群（C∞v / D∞h / Kh）
 * 每个群：classes（共轭类）+ irreps（不可约表示：label + characters + linear/quadratic 基函数）
 * 基函数按标准特征标表分为两列：linear（线性函数与旋转 x,y,z,Rx,Ry,Rz）+ quadratic（二次函数 x²,y²,z²,xy,xz,yz）
 */

export const CHARACTER_TABLES = {
  // ==================== 低对称群 ====================
  'C1': {
    classes: ['E'],
    irreps: [
      { label: 'A', characters: [1], linear: 'x, y, z, Rx, Ry, Rz', quadratic: 'x², y², z², xy, xz, yz' }
    ]
  },
  'Ci': {
    classes: ['E', 'i'],
    irreps: [
      { label: 'Ag', characters: [1, 1], linear: 'Rx, Ry, Rz', quadratic: 'x², y², z², xy, xz, yz' },
      { label: 'Au', characters: [1, -1], linear: 'x, y, z', quadratic: '' }
    ]
  },
  'Cs': {
    classes: ['E', 'σh'],
    irreps: [
      { label: "A'", characters: [1, 1], linear: 'x, y, Rz', quadratic: 'x², y², z², xy' },
      { label: "A''", characters: [1, -1], linear: 'z, Rx, Ry', quadratic: 'xz, yz' }
    ]
  },

  // ==================== 单斜 ====================
  'C2': {
    classes: ['E', 'C2'],
    irreps: [
      { label: 'A', characters: [1, 1], linear: 'z, Rz', quadratic: 'x², y², z², xy' },
      { label: 'B', characters: [1, -1], linear: 'x, y, Rx, Ry', quadratic: 'xz, yz' }
    ]
  },
  'C2h': {
    classes: ['E', 'C2', 'i', 'σh'],
    irreps: [
      { label: 'Ag', characters: [1, 1, 1, 1], linear: 'Rz', quadratic: 'x², y², z², xy' },
      { label: 'Bg', characters: [1, -1, 1, -1], linear: 'Rx, Ry', quadratic: 'xz, yz' },
      { label: 'Au', characters: [1, 1, -1, -1], linear: 'z', quadratic: '' },
      { label: 'Bu', characters: [1, -1, -1, 1], linear: 'x, y', quadratic: '' }
    ]
  },

  // ==================== 正交 ====================
  'C2v': {
    classes: ['E', 'C2', 'σv(xz)', 'σv(yz)'],
    irreps: [
      { label: 'A1', characters: [1, 1, 1, 1], linear: 'z', quadratic: 'x², y², z²' },
      { label: 'A2', characters: [1, 1, -1, -1], linear: 'Rz', quadratic: 'xy' },
      { label: 'B1', characters: [1, -1, 1, -1], linear: 'x, Ry', quadratic: 'xz' },
      { label: 'B2', characters: [1, -1, -1, 1], linear: 'y, Rx', quadratic: 'yz' }
    ]
  },
  'D2': {
    classes: ['E', 'C2(z)', 'C2(y)', 'C2(x)'],
    irreps: [
      { label: 'A', characters: [1, 1, 1, 1], linear: '', quadratic: 'x², y², z²' },
      { label: 'B1', characters: [1, 1, -1, -1], linear: 'z, Rz', quadratic: 'xy' },
      { label: 'B2', characters: [1, -1, 1, -1], linear: 'y, Ry', quadratic: 'xz' },
      { label: 'B3', characters: [1, -1, -1, 1], linear: 'x, Rx', quadratic: 'yz' }
    ]
  },
  'D2h': {
    classes: ['E', 'C2(z)', 'C2(y)', 'C2(x)', 'i', 'σ(xy)', 'σ(xz)', 'σ(yz)'],
    irreps: [
      { label: 'Ag', characters: [1, 1, 1, 1, 1, 1, 1, 1], linear: '', quadratic: 'x², y², z²' },
      { label: 'B1g', characters: [1, 1, -1, -1, 1, 1, -1, -1], linear: 'Rz', quadratic: 'xy' },
      { label: 'B2g', characters: [1, -1, 1, -1, 1, -1, 1, -1], linear: 'Ry', quadratic: 'xz' },
      { label: 'B3g', characters: [1, -1, -1, 1, 1, -1, -1, 1], linear: 'Rx', quadratic: 'yz' },
      { label: 'Au', characters: [1, 1, 1, 1, -1, -1, -1, -1], linear: '', quadratic: '' },
      { label: 'B1u', characters: [1, 1, -1, -1, -1, -1, 1, 1], linear: 'z', quadratic: '' },
      { label: 'B2u', characters: [1, -1, 1, -1, -1, 1, -1, 1], linear: 'y', quadratic: '' },
      { label: 'B3u', characters: [1, -1, -1, 1, -1, 1, 1, -1], linear: 'x', quadratic: '' }
    ]
  },

  // ==================== 四方 ====================
  'C4': {
    classes: ['E', 'C4', 'C2', 'C4³'],
    irreps: [
      { label: 'A', characters: [1, 1, 1, 1], linear: 'z, Rz', quadratic: 'x²+y², z²' },
      { label: 'B', characters: [1, -1, 1, -1], linear: '', quadratic: 'x²-y², xy' },
      { label: 'E', characters: [2, 0, -2, 0], linear: '(x,y), (Rx,Ry)', quadratic: '(xz,yz)' }
    ]
  },
  'S4': {
    classes: ['E', 'S4', 'C2', 'S4³'],
    irreps: [
      { label: 'A', characters: [1, 1, 1, 1], linear: 'Rz', quadratic: 'x²+y², z²' },
      { label: 'B', characters: [1, -1, 1, -1], linear: 'z', quadratic: 'x²-y², xy' },
      { label: 'E', characters: [2, 0, -2, 0], linear: '(x,y), (Rx,Ry)', quadratic: '(xz,yz)' }
    ]
  },
  'C4h': {
    classes: ['E', 'C4', 'C2', 'C4³', 'i', 'S4³', 'σh', 'S4'],
    irreps: [
      { label: 'Ag', characters: [1, 1, 1, 1, 1, 1, 1, 1], linear: 'Rz', quadratic: 'x²+y², z²' },
      { label: 'Bg', characters: [1, -1, 1, -1, 1, -1, 1, -1], linear: '', quadratic: 'x²-y², xy' },
      { label: 'Eg', characters: [2, 0, -2, 0, 2, 0, -2, 0], linear: '(Rx,Ry)', quadratic: '(xz,yz)' },
      { label: 'Au', characters: [1, 1, 1, 1, -1, -1, -1, -1], linear: 'z', quadratic: '' },
      { label: 'Bu', characters: [1, -1, 1, -1, -1, 1, -1, 1], linear: '', quadratic: '' },
      { label: 'Eu', characters: [2, 0, -2, 0, -2, 0, 2, 0], linear: '(x,y)', quadratic: '' }
    ]
  },
  'C4v': {
    classes: ['E', '2C4', 'C2', '2σv', '2σd'],
    irreps: [
      { label: 'A1', characters: [1, 1, 1, 1, 1], linear: 'z', quadratic: 'x²+y², z²' },
      { label: 'A2', characters: [1, 1, 1, -1, -1], linear: 'Rz', quadratic: '' },
      { label: 'B1', characters: [1, -1, 1, 1, -1], linear: '', quadratic: 'x²-y²' },
      { label: 'B2', characters: [1, -1, 1, -1, 1], linear: '', quadratic: 'xy' },
      { label: 'E', characters: [2, 0, -2, 0, 0], linear: '(x,y), (Rx,Ry)', quadratic: '(xz,yz)' }
    ]
  },
  'D4': {
    classes: ['E', '2C4', 'C2', '2C2′', '2C2″'],
    irreps: [
      { label: 'A1', characters: [1, 1, 1, 1, 1], linear: '', quadratic: 'x²+y², z²' },
      { label: 'A2', characters: [1, 1, 1, -1, -1], linear: 'z, Rz', quadratic: '' },
      { label: 'B1', characters: [1, -1, 1, 1, -1], linear: '', quadratic: 'x²-y²' },
      { label: 'B2', characters: [1, -1, 1, -1, 1], linear: '', quadratic: 'xy' },
      { label: 'E', characters: [2, 0, -2, 0, 0], linear: '(x,y), (Rx,Ry)', quadratic: '(xz,yz)' }
    ]
  },
  'D2d': {
    classes: ['E', '2S4', 'C2', '2C2′', '2σd'],
    irreps: [
      { label: 'A1', characters: [1, 1, 1, 1, 1], linear: '', quadratic: 'x²+y², z²' },
      { label: 'A2', characters: [1, 1, 1, -1, -1], linear: 'Rz', quadratic: '' },
      { label: 'B1', characters: [1, -1, 1, 1, -1], linear: '', quadratic: 'x²-y²' },
      { label: 'B2', characters: [1, -1, 1, -1, 1], linear: 'z', quadratic: 'xy' },
      { label: 'E', characters: [2, 0, -2, 0, 0], linear: '(x,y), (Rx,Ry)', quadratic: '(xz,yz)' }
    ]
  },
  'D4d': {
    classes: ['E', '2S8', '2C4', '2S8³', 'C2', '4C2′', '4σd'],
    irreps: [
      { label: 'A1', characters: [1, 1, 1, 1, 1, 1, 1], linear: 'z', quadratic: 'x²+y², z²' },
      { label: 'A2', characters: [1, 1, 1, 1, 1, -1, -1], linear: 'Rz', quadratic: '' },
      { label: 'B1', characters: [1, -1, 1, -1, 1, 1, -1], linear: '', quadratic: 'x²-y²' },
      { label: 'B2', characters: [1, -1, 1, -1, 1, -1, 1], linear: '', quadratic: 'xy' },
      { label: 'E1', characters: [2, 1.414, 0, -1.414, -2, 0, 0], linear: '(x,y), (Rx,Ry)', quadratic: '(xz,yz)' },
      { label: 'E2', characters: [2, 0, -2, 0, 2, 0, 0], linear: '', quadratic: '' },
      { label: 'E3', characters: [2, -1.414, 0, 1.414, -2, 0, 0], linear: '', quadratic: '' }
    ]
  },
  'D4h': {
    classes: ['E', '2C4', 'C2', '2C2′', '2C2″', 'i', '2S4', 'σh', '2σv', '2σd'],
    irreps: [
      { label: 'A1g', characters: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], linear: '', quadratic: 'x²+y², z²' },
      { label: 'A2g', characters: [1, 1, 1, -1, -1, 1, 1, 1, -1, -1], linear: 'Rz', quadratic: '' },
      { label: 'B1g', characters: [1, -1, 1, 1, -1, 1, -1, 1, 1, -1], linear: '', quadratic: 'x²-y²' },
      { label: 'B2g', characters: [1, -1, 1, -1, 1, 1, -1, 1, -1, 1], linear: '', quadratic: 'xy' },
      { label: 'Eg', characters: [2, 0, -2, 0, 0, 2, 0, -2, 0, 0], linear: '(Rx,Ry)', quadratic: '(xz,yz)' },
      { label: 'A1u', characters: [1, 1, 1, 1, 1, -1, -1, -1, -1, -1], linear: '', quadratic: '' },
      { label: 'A2u', characters: [1, 1, 1, -1, -1, -1, -1, -1, 1, 1], linear: 'z', quadratic: '' },
      { label: 'B1u', characters: [1, -1, 1, 1, -1, -1, 1, -1, -1, 1], linear: '', quadratic: '' },
      { label: 'B2u', characters: [1, -1, 1, -1, 1, -1, 1, -1, 1, -1], linear: '', quadratic: '' },
      { label: 'Eu', characters: [2, 0, -2, 0, 0, -2, 0, 2, 0, 0], linear: '(x,y)', quadratic: '' }
    ]
  },

  // ==================== 三方 ====================
  'C3': {
    classes: ['E', 'C3', 'C3²'],
    irreps: [
      { label: 'A', characters: [1, 1, 1], linear: 'z, Rz', quadratic: 'x²+y², z²' },
      { label: 'E', characters: [2, -1, -1], linear: '(x,y), (Rx,Ry)', quadratic: '(x²-y²,xy), (xz,yz)' }
    ]
  },
  'S6': {
    classes: ['E', 'C3', 'C3²', 'i', 'S6⁵', 'S6'],
    irreps: [
      { label: 'Ag', characters: [1, 1, 1, 1, 1, 1], linear: 'Rz', quadratic: 'x²+y², z²' },
      { label: 'Eg', characters: [2, -1, -1, 2, -1, -1], linear: '(Rx,Ry)', quadratic: '(x²-y²,xy), (xz,yz)' },
      { label: 'Au', characters: [1, 1, 1, -1, -1, -1], linear: 'z', quadratic: '' },
      { label: 'Eu', characters: [2, -1, -1, -2, 1, 1], linear: '(x,y)', quadratic: '' }
    ]
  },
  'C3v': {
    classes: ['E', '2C3', '3σv'],
    irreps: [
      { label: 'A1', characters: [1, 1, 1], linear: 'z', quadratic: 'x²+y², z²' },
      { label: 'A2', characters: [1, 1, -1], linear: 'Rz', quadratic: '' },
      { label: 'E', characters: [2, -1, 0], linear: '(x,y), (Rx,Ry)', quadratic: '(x²-y²,xy), (xz,yz)' }
    ]
  },
  'D3': {
    classes: ['E', '2C3', '3C2'],
    irreps: [
      { label: 'A1', characters: [1, 1, 1], linear: '', quadratic: 'x²+y², z²' },
      { label: 'A2', characters: [1, 1, -1], linear: 'z, Rz', quadratic: '' },
      { label: 'E', characters: [2, -1, 0], linear: '(x,y), (Rx,Ry)', quadratic: '(x²-y²,xy), (xz,yz)' }
    ]
  },
  'D3d': {
    classes: ['E', '2C3', '3C2', 'i', '2S6', '3σd'],
    irreps: [
      { label: 'A1g', characters: [1, 1, 1, 1, 1, 1], linear: '', quadratic: 'x²+y², z²' },
      { label: 'A2g', characters: [1, 1, -1, 1, 1, -1], linear: 'Rz', quadratic: '' },
      { label: 'Eg', characters: [2, -1, 0, 2, -1, 0], linear: '(Rx,Ry)', quadratic: '(x²-y²,xy), (xz,yz)' },
      { label: 'A1u', characters: [1, 1, 1, -1, -1, -1], linear: '', quadratic: '' },
      { label: 'A2u', characters: [1, 1, -1, -1, -1, 1], linear: 'z', quadratic: '' },
      { label: 'Eu', characters: [2, -1, 0, -2, 1, 0], linear: '(x,y)', quadratic: '' }
    ]
  },

  // ==================== 六方 ====================
  'C6': {
    classes: ['E', 'C6', 'C3', 'C2', 'C3²', 'C6⁵'],
    irreps: [
      { label: 'A', characters: [1, 1, 1, 1, 1, 1], linear: 'z, Rz', quadratic: 'x²+y², z²' },
      { label: 'B', characters: [1, -1, 1, -1, 1, -1], linear: '', quadratic: '' },
      { label: 'E1', characters: [2, 1, -1, -2, -1, 1], linear: '(x,y), (Rx,Ry)', quadratic: '(xz,yz)' },
      { label: 'E2', characters: [2, -1, -1, 2, -1, -1], linear: '', quadratic: '(x²-y²,xy)' }
    ]
  },
  'C3h': {
    classes: ['E', 'C3', 'C3²', 'σh', 'S3', 'S3⁵'],
    irreps: [
      { label: "A'", characters: [1, 1, 1, 1, 1, 1], linear: 'Rz', quadratic: 'x²+y², z²' },
      { label: "E'", characters: [2, -1, -1, 2, -1, -1], linear: '(x,y)', quadratic: '(x²-y²,xy)' },
      { label: "A''", characters: [1, 1, 1, -1, -1, -1], linear: 'z', quadratic: '' },
      { label: "E''", characters: [2, -1, -1, -2, 1, 1], linear: '(Rx,Ry)', quadratic: '(xz,yz)' }
    ]
  },
  'C6h': {
    classes: ['E', 'C6', 'C3', 'C2', 'C3²', 'C6⁵', 'i', 'S3⁵', 'S6⁵', 'σh', 'S6', 'S3'],
    irreps: [
      { label: 'Ag', characters: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], linear: 'Rz', quadratic: 'x²+y², z²' },
      { label: 'Bg', characters: [1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1], linear: '', quadratic: '' },
      { label: 'E1g', characters: [2, 1, -1, -2, -1, 1, 2, 1, -1, -2, -1, 1], linear: '(Rx,Ry)', quadratic: '(xz,yz)' },
      { label: 'E2g', characters: [2, -1, -1, 2, -1, -1, 2, -1, -1, 2, -1, -1], linear: '', quadratic: '(x²-y²,xy)' },
      { label: 'Au', characters: [1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1], linear: 'z', quadratic: '' },
      { label: 'Bu', characters: [1, -1, 1, -1, 1, -1, -1, 1, -1, 1, -1, 1], linear: '', quadratic: '' },
      { label: 'E1u', characters: [2, 1, -1, -2, -1, 1, -2, -1, 1, 2, 1, -1], linear: '(x,y)', quadratic: '' },
      { label: 'E2u', characters: [2, -1, -1, 2, -1, -1, -2, 1, 1, -2, 1, 1], linear: '', quadratic: '' }
    ]
  },
  'C6v': {
    classes: ['E', '2C6', '2C3', 'C2', '3σv', '3σd'],
    irreps: [
      { label: 'A1', characters: [1, 1, 1, 1, 1, 1], linear: 'z', quadratic: 'x²+y², z²' },
      { label: 'A2', characters: [1, 1, 1, 1, -1, -1], linear: 'Rz', quadratic: '' },
      { label: 'B1', characters: [1, -1, 1, -1, 1, -1], linear: '', quadratic: '' },
      { label: 'B2', characters: [1, -1, 1, -1, -1, 1], linear: '', quadratic: '' },
      { label: 'E1', characters: [2, 1, -1, -2, 0, 0], linear: '(x,y), (Rx,Ry)', quadratic: '(xz,yz)' },
      { label: 'E2', characters: [2, -1, -1, 2, 0, 0], linear: '', quadratic: '(x²-y²,xy)' }
    ]
  },
  'D6': {
    classes: ['E', '2C6', '2C3', 'C2', '3C2′', '3C2″'],
    irreps: [
      { label: 'A1', characters: [1, 1, 1, 1, 1, 1], linear: '', quadratic: 'x²+y², z²' },
      { label: 'A2', characters: [1, 1, 1, 1, -1, -1], linear: 'z, Rz', quadratic: '' },
      { label: 'B1', characters: [1, -1, 1, -1, 1, -1], linear: '', quadratic: '' },
      { label: 'B2', characters: [1, -1, 1, -1, -1, 1], linear: '', quadratic: '' },
      { label: 'E1', characters: [2, 1, -1, -2, 0, 0], linear: '(x,y), (Rx,Ry)', quadratic: '(xz,yz)' },
      { label: 'E2', characters: [2, -1, -1, 2, 0, 0], linear: '', quadratic: '(x²-y²,xy)' }
    ]
  },
  'D3h': {
    classes: ['E', '2C3', '3C2', 'σh', '2S3', '3σv'],
    irreps: [
      { label: "A1'", characters: [1, 1, 1, 1, 1, 1], linear: '', quadratic: 'x²+y², z²' },
      { label: "A2'", characters: [1, 1, -1, 1, 1, -1], linear: 'Rz', quadratic: '' },
      { label: "E'", characters: [2, -1, 0, 2, -1, 0], linear: '(x,y)', quadratic: '(x²-y²,xy)' },
      { label: "A1''", characters: [1, 1, 1, -1, -1, -1], linear: '', quadratic: '' },
      { label: "A2''", characters: [1, 1, -1, -1, -1, 1], linear: 'z', quadratic: '' },
      { label: "E''", characters: [2, -1, 0, -2, 1, 0], linear: '(Rx,Ry)', quadratic: '(xz,yz)' }
    ]
  },
  'D6h': {
    classes: ['E', '2C6', '2C3', 'C2', '3C2′', '3C2″', 'i', '2S3', '2S6', 'σh', '3σd', '3σv'],
    irreps: [
      { label: 'A1g', characters: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], linear: '', quadratic: 'x²+y², z²' },
      { label: 'A2g', characters: [1, 1, 1, 1, -1, -1, 1, 1, 1, 1, -1, -1], linear: 'Rz', quadratic: '' },
      { label: 'B1g', characters: [1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1], linear: '', quadratic: '' },
      { label: 'B2g', characters: [1, -1, 1, -1, -1, 1, 1, -1, 1, -1, -1, 1], linear: '', quadratic: '' },
      { label: 'E1g', characters: [2, 1, -1, -2, 0, 0, 2, 1, -1, -2, 0, 0], linear: '(Rx,Ry)', quadratic: '(xz,yz)' },
      { label: 'E2g', characters: [2, -1, -1, 2, 0, 0, 2, -1, -1, 2, 0, 0], linear: '', quadratic: '(x²-y²,xy)' },
      { label: 'A1u', characters: [1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1], linear: '', quadratic: '' },
      { label: 'A2u', characters: [1, 1, 1, 1, -1, -1, -1, -1, -1, -1, 1, 1], linear: 'z', quadratic: '' },
      { label: 'B1u', characters: [1, -1, 1, -1, 1, -1, -1, 1, -1, 1, -1, 1], linear: '', quadratic: '' },
      { label: 'B2u', characters: [1, -1, 1, -1, -1, 1, -1, 1, -1, 1, 1, -1], linear: '', quadratic: '' },
      { label: 'E1u', characters: [2, 1, -1, -2, 0, 0, -2, -1, 1, 2, 0, 0], linear: '(x,y)', quadratic: '' },
      { label: 'E2u', characters: [2, -1, -1, 2, 0, 0, -2, 1, 1, -2, 0, 0], linear: '', quadratic: '' }
    ]
  },

  // ==================== 五重轴非晶体学点群（C5/D5 族） ====================
  'C5': {
    classes: ['E', '2C5', '2C5²'],
    irreps: [
      { label: 'A', characters: [1, 1, 1], linear: 'z, Rz', quadratic: 'x²+y², z²' },
      { label: 'E1', characters: [2, 0.618, -1.618], linear: '(x,y), (Rx,Ry)', quadratic: '(xz,yz)' },
      { label: 'E2', characters: [2, -1.618, 0.618], linear: '', quadratic: '(x²-y², xy)' }
    ]
  },
  'C5v': {
    classes: ['E', '2C5', '2C5²', '5σv'],
    irreps: [
      { label: 'A1', characters: [1, 1, 1, 1], linear: 'z', quadratic: 'x²+y², z²' },
      { label: 'A2', characters: [1, 1, 1, -1], linear: 'Rz', quadratic: '' },
      { label: 'E1', characters: [2, 0.618, -1.618, 0], linear: '(x,y), (Rx,Ry)', quadratic: '(xz,yz)' },
      { label: 'E2', characters: [2, -1.618, 0.618, 0], linear: '', quadratic: '(x²-y², xy)' }
    ]
  },
  'C5h': {
    classes: ['E', '2C5', '2C5²', 'σh', '2S5', '2S5³'],
    irreps: [
      { label: "A'", characters: [1, 1, 1, 1, 1, 1], linear: 'Rz', quadratic: 'x²+y², z²' },
      { label: "E1'", characters: [2, 0.618, -1.618, 2, 0.618, -1.618], linear: '(x,y)', quadratic: '' },
      { label: "E2'", characters: [2, -1.618, 0.618, 2, -1.618, 0.618], linear: '', quadratic: '(x²-y², xy)' },
      { label: "A''", characters: [1, 1, 1, -1, -1, -1], linear: 'z', quadratic: '' },
      { label: "E1''", characters: [2, 0.618, -1.618, -2, -0.618, 1.618], linear: '(Rx,Ry)', quadratic: '(xz,yz)' },
      { label: "E2''", characters: [2, -1.618, 0.618, -2, 1.618, -0.618], linear: '', quadratic: '' }
    ]
  },
  'D5': {
    classes: ['E', '2C5', '2C5²', '5C2'],
    irreps: [
      { label: 'A1', characters: [1, 1, 1, 1], linear: 'z', quadratic: 'x²+y², z²' },
      { label: 'A2', characters: [1, 1, 1, -1], linear: 'Rz', quadratic: '' },
      { label: 'E1', characters: [2, 0.618, -1.618, 0], linear: '(x,y), (Rx,Ry)', quadratic: '(xz,yz)' },
      { label: 'E2', characters: [2, -1.618, 0.618, 0], linear: '', quadratic: '(x²-y², xy)' }
    ]
  },
  'D5h': {
    classes: ['E', '2C5', '2C5²', '5C2', 'σh', '2S5', '2S5³', '5σv'],
    irreps: [
      { label: "A1'", characters: [1, 1, 1, 1, 1, 1, 1, 1], linear: '', quadratic: 'x²+y², z²' },
      { label: "A2'", characters: [1, 1, 1, -1, 1, 1, 1, -1], linear: 'Rz', quadratic: '' },
      { label: "E1'", characters: [2, 0.618, -1.618, 0, 2, 0.618, -1.618, 0], linear: '(x,y)', quadratic: '' },
      { label: "E2'", characters: [2, -1.618, 0.618, 0, 2, -1.618, 0.618, 0], linear: '', quadratic: '(x²-y², xy)' },
      { label: "A1''", characters: [1, 1, 1, 1, -1, -1, -1, -1], linear: '', quadratic: '' },
      { label: "A2''", characters: [1, 1, 1, -1, -1, -1, -1, 1], linear: 'z', quadratic: '' },
      { label: "E1''", characters: [2, 0.618, -1.618, 0, -2, -0.618, 1.618, 0], linear: '(Rx,Ry)', quadratic: '(xz,yz)' },
      { label: "E2''", characters: [2, -1.618, 0.618, 0, -2, 1.618, -0.618, 0], linear: '', quadratic: '' }
    ]
  },
  'D5d': {
    classes: ['E', '2C5', '2C5²', '5C2', 'i', '2S10', '2S10³', '5σd'],
    irreps: [
      { label: 'A1g', characters: [1, 1, 1, 1, 1, 1, 1, 1], linear: '', quadratic: 'x²+y², z²' },
      { label: 'A2g', characters: [1, 1, 1, -1, 1, 1, 1, -1], linear: 'Rz', quadratic: '' },
      { label: 'E1g', characters: [2, 0.618, -1.618, 0, 2, 0.618, -1.618, 0], linear: '(Rx,Ry)', quadratic: '' },
      { label: 'E2g', characters: [2, -1.618, 0.618, 0, 2, -1.618, 0.618, 0], linear: '', quadratic: '(x²-y², xy)' },
      { label: 'A1u', characters: [1, 1, 1, 1, -1, -1, -1, -1], linear: '', quadratic: '' },
      { label: 'A2u', characters: [1, 1, 1, -1, -1, -1, -1, 1], linear: 'z', quadratic: '' },
      { label: 'E1u', characters: [2, 0.618, -1.618, 0, -2, -0.618, 1.618, 0], linear: '(x,y)', quadratic: '' },
      { label: 'E2u', characters: [2, -1.618, 0.618, 0, -2, 1.618, -0.618, 0], linear: '', quadratic: '' }
    ]
  },

  // ==================== 立方 ====================
  'T': {
    classes: ['E', '4C3', '4C3²', '3C2'],
    irreps: [
      { label: 'A', characters: [1, 1, 1, 1], linear: '', quadratic: 'x²+y²+z²' },
      { label: 'E', characters: [2, -1, -1, 2], linear: '', quadratic: '(2z²-x²-y², x²-y²)' },
      { label: 'T', characters: [3, 0, 0, -1], linear: '(x,y,z), (Rx,Ry,Rz)', quadratic: '(xy,xz,yz)' }
    ]
  },
  'Th': {
    classes: ['E', '4C3', '4C3²', '3C2', 'i', '4S6', '4S6⁵', '3σh'],
    irreps: [
      { label: 'Ag', characters: [1, 1, 1, 1, 1, 1, 1, 1], linear: '', quadratic: 'x²+y²+z²' },
      { label: 'Eg', characters: [2, -1, -1, 2, 2, -1, -1, 2], linear: '', quadratic: '(2z²-x²-y², x²-y²)' },
      { label: 'Tg', characters: [3, 0, 0, -1, 3, 0, 0, -1], linear: '(Rx,Ry,Rz)', quadratic: '(xy,xz,yz)' },
      { label: 'Au', characters: [1, 1, 1, 1, -1, -1, -1, -1], linear: '', quadratic: '' },
      { label: 'Eu', characters: [2, -1, -1, 2, -2, 1, 1, -2], linear: '', quadratic: '' },
      { label: 'Tu', characters: [3, 0, 0, -1, -3, 0, 0, 1], linear: '(x,y,z)', quadratic: '' }
    ]
  },
  'Td': {
    classes: ['E', '8C3', '3C2', '6S4', '6σd'],
    irreps: [
      { label: 'A1', characters: [1, 1, 1, 1, 1], linear: '', quadratic: 'x²+y²+z²' },
      { label: 'A2', characters: [1, 1, 1, -1, -1], linear: '', quadratic: '' },
      { label: 'E', characters: [2, -1, 2, 0, 0], linear: '', quadratic: '(2z²-x²-y², x²-y²)' },
      { label: 'T1', characters: [3, 0, -1, 1, -1], linear: '(Rx,Ry,Rz)', quadratic: '' },
      { label: 'T2', characters: [3, 0, -1, -1, 1], linear: '(x,y,z)', quadratic: '(xy,xz,yz)' }
    ]
  },
  'O': {
    classes: ['E', '8C3', '3C2', '6C4', '6C2′'],
    irreps: [
      { label: 'A1', characters: [1, 1, 1, 1, 1], linear: '', quadratic: 'x²+y²+z²' },
      { label: 'A2', characters: [1, 1, 1, -1, -1], linear: '', quadratic: '' },
      { label: 'E', characters: [2, -1, 2, 0, 0], linear: '', quadratic: '(2z²-x²-y², x²-y²)' },
      { label: 'T1', characters: [3, 0, -1, 1, -1], linear: '(x,y,z), (Rx,Ry,Rz)', quadratic: '' },
      { label: 'T2', characters: [3, 0, -1, -1, 1], linear: '', quadratic: '(xy,xz,yz)' }
    ]
  },
  'Oh': {
    classes: ['E', '8C3', '6C2', '6C4', '3C2', 'i', '6S4', '8S6', '3σh', '6σd'],
    irreps: [
      { label: 'A1g', characters: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], linear: '', quadratic: 'x²+y²+z²' },
      { label: 'A2g', characters: [1, 1, -1, -1, 1, 1, -1, 1, 1, -1], linear: '', quadratic: '' },
      { label: 'Eg', characters: [2, -1, 0, 0, 2, 2, 0, -1, 2, 0], linear: '', quadratic: '(2z²-x²-y², x²-y²)' },
      { label: 'T1g', characters: [3, 0, -1, 1, -1, 3, 1, 0, -1, -1], linear: '(Rx,Ry,Rz)', quadratic: '' },
      { label: 'T2g', characters: [3, 0, 1, -1, -1, 3, -1, 0, -1, 1], linear: '', quadratic: '(xy,xz,yz)' },
      { label: 'A1u', characters: [1, 1, 1, 1, 1, -1, -1, -1, -1, -1], linear: '', quadratic: '' },
      { label: 'A2u', characters: [1, 1, -1, -1, 1, -1, 1, -1, -1, 1], linear: '', quadratic: '' },
      { label: 'Eu', characters: [2, -1, 0, 0, 2, -2, 0, 1, -2, 0], linear: '', quadratic: '' },
      { label: 'T1u', characters: [3, 0, -1, 1, -1, -3, -1, 0, 1, 1], linear: '(x,y,z)', quadratic: '' },
      { label: 'T2u', characters: [3, 0, 1, -1, -1, -3, 1, 0, 1, -1], linear: '', quadratic: '' }
    ]
  },
  'I': {
    classes: ['E', '12C5', '12C5²', '20C3', '15C2'],
    irreps: [
      { label: 'A', characters: [1, 1, 1, 1, 1], linear: 's', quadratic: '' },
      { label: 'T1', characters: [3, 0.618, -1.618, 0, -1], linear: '(x,y,z), (Rx,Ry,Rz)', quadratic: '' },
      { label: 'T2', characters: [3, -1.618, 0.618, 0, -1], linear: '', quadratic: '' },
      { label: 'G', characters: [4, -1, -1, 1, 0], linear: '', quadratic: '' },
      { label: 'H', characters: [5, 0, 0, -1, 1], linear: '', quadratic: 'd 轨道' }
    ]
  },
  'Ih': {
    classes: ['E', '12C5', '12C5²', '20C3', '15C2', 'i', '12S10', '12S10³', '20S6', '15σ'],
    irreps: [
      { label: 'Ag', characters: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], linear: 's', quadratic: '' },
      { label: 'T1g', characters: [3, 0.618, -1.618, 0, -1, 3, 0.618, -1.618, 0, -1], linear: '(Rx,Ry,Rz)', quadratic: '' },
      { label: 'T2g', characters: [3, -1.618, 0.618, 0, -1, 3, -1.618, 0.618, 0, -1], linear: '', quadratic: '' },
      { label: 'Gg', characters: [4, -1, -1, 1, 0, 4, -1, -1, 1, 0], linear: '', quadratic: '' },
      { label: 'Hg', characters: [5, 0, 0, -1, 1, 5, 0, 0, -1, 1], linear: '', quadratic: 'd 轨道' },
      { label: 'Au', characters: [1, 1, 1, 1, 1, -1, -1, -1, -1, -1], linear: '', quadratic: '' },
      { label: 'T1u', characters: [3, 0.618, -1.618, 0, -1, -3, -0.618, 1.618, 0, 1], linear: '(x,y,z)', quadratic: '' },
      { label: 'T2u', characters: [3, -1.618, 0.618, 0, -1, -3, 1.618, -0.618, 0, 1], linear: '', quadratic: '' },
      { label: 'Gu', characters: [4, -1, -1, 1, 0, -4, 1, 1, -1, 0], linear: '', quadratic: '' },
      { label: 'Hu', characters: [5, 0, 0, -1, 1, -5, 0, 0, 1, -1], linear: '', quadratic: '' }
    ]
  },

  // ==================== 连续群 ====================
  'C∞v': {
    classes: ['E', '2C∞', '∞σv'],
    irreps: [
      { label: 'A1 (Σ⁺)', characters: [1, 1, 1], linear: 'z', quadratic: 'x²+y², z²' },
      { label: 'A2 (Σ⁻)', characters: [1, 1, -1], linear: 'Rz', quadratic: '' },
      { label: 'E1 (Π)', characters: [2, '2cosφ', 0], linear: '(x,y), (Rx,Ry)', quadratic: '(xz,yz)' },
      { label: 'E2 (Δ)', characters: [2, '2cos2φ', 0], linear: '', quadratic: '(x²-y²,xy)' },
      { label: 'E3 (Φ)', characters: [2, '2cos3φ', 0], linear: '', quadratic: '' }
    ]
  },
  'D∞h': {
    classes: ['E', '2C∞', '∞σv', 'i', '2S∞', '∞C2'],
    irreps: [
      { label: 'A1g (Σg⁺)', characters: [1, 1, 1, 1, 1, 1], linear: '', quadratic: 'x²+y², z²' },
      { label: 'A2g (Σg⁻)', characters: [1, 1, -1, 1, 1, -1], linear: 'Rz', quadratic: '' },
      { label: 'E1g (Πg)', characters: [2, '2cosφ', 0, 2, '-2cosφ', 0], linear: '(Rx,Ry)', quadratic: '(xz,yz)' },
      { label: 'A1u (Σu⁺)', characters: [1, 1, 1, -1, -1, -1], linear: 'z', quadratic: '' },
      { label: 'A2u (Σu⁻)', characters: [1, 1, -1, -1, -1, 1], linear: '', quadratic: '' },
      { label: 'E1u (Πu)', characters: [2, '2cosφ', 0, -2, '2cosφ', 0], linear: '(x,y)', quadratic: '' }
    ]
  },
  'Kh': {
    classes: ['E', '∞C∞', 'i', '∞S∞', '∞σ', '∞C2'],
    irreps: [
      { label: 'A1g (S)', characters: [1, 1, 1, 1, 1, 1], linear: 's', quadratic: 'd, g…（偶）' },
      { label: 'A1u (P)', characters: [1, 1, -1, -1, -1, -1], linear: 'p, f…（奇）', quadratic: '' }
    ]
  }
}

/**
 * 获取点群的特征标表
 * @param {string} symbol - 点群符号
 * @returns {{classes:string[], irreps:Array}|undefined}
 */
export function getCharacterTable(symbol) {
  return CHARACTER_TABLES[symbol]
}
