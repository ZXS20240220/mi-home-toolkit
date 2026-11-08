import { Injectable, inject } from '@angular/core'
import { MiService } from './mi.service'

/** 显示器挂灯的精确型号，避免误匹配其他 Yeelight 设备 */
export const LAMP15_MODEL = 'yeelink.light.lamp15'

const LAMP15_PROPS = [
  'power',
  'main_power',
  'bright',
  'ct',
  'color_mode',
  'bg_power',
  'bg_bright',
  'bg_ct',
  'bg_rgb',
  'bg_hue',
  'bg_sat',
] as const

type Lamp15Prop = (typeof LAMP15_PROPS)[number]

/** get_prop 按请求顺序返回数组，用名称到索引的映射取值，避免手写魔法数字 */
const PROP_INDEX = Object.fromEntries(
  LAMP15_PROPS.map((name, index) => [name, index])
) as Record<Lamp15Prop, number>

export type Lamp15State = {
  power: boolean
  brightness: number
  colorTemperature: number
  backgroundPower: boolean
  backgroundBrightness: number
  backgroundColorTemperature: number
  backgroundRgb: number
}

/** 空字符串是 Yeelight 表示“该属性当前不可用”，不能按 Number('') === 0 处理 */
function toNumber(value: unknown, fallback: number) {
  if (value == null) return fallback
  if (typeof value === 'string' && value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** 背景灯在非彩色模式下 `bg_rgb` 会返回 "" 或 "0"，统一回退到白色 */
const DEFAULT_BACKGROUND_RGB = 0xffffff

/** Yeelight 用 "on"/"off" 表示开关；空字符串或未知值表示该属性不可用 */
function toPower(value: unknown): boolean | null {
  const text = String(value ?? '').trim().toLowerCase()
  if (text === 'on' || text === '1' || text === 'true') return true
  if (text === 'off' || text === '0' || text === 'false') return false
  return null
}

/** Yeelight 的 get_prop 返回值可能是字符串形式的数组，这里统一做类型归一化 */
export function parseLamp15State(raw: unknown): Lamp15State {
  const values = Array.isArray(raw) ? raw : []
  const at = (name: Lamp15Prop) => values[PROP_INDEX[name]]

  // 双灯设备（如挂灯）的 `power` 是设备总状态：只开背景灯时它也会返回 on，
  // 主灯的真实状态必须读 `main_power`。固件不支持该属性时回退到 `power`。
  const mainPower = toPower(at('main_power')) ?? toPower(at('power'))

  return {
    power: mainPower ?? false,
    brightness: toNumber(at('bright'), 100),
    colorTemperature: toNumber(at('ct'), 4000),
    backgroundPower: toPower(at('bg_power')) ?? false,
    backgroundBrightness: toNumber(at('bg_bright'), 100),
    backgroundColorTemperature: toNumber(at('bg_ct'), 4000),
    backgroundRgb:
      toNumber(at('bg_rgb'), DEFAULT_BACKGROUND_RGB) || DEFAULT_BACKGROUND_RGB,
  }
}

export function rgbIntToHex(rgb: number) {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`
}

/**
 * Yeelight 的命令成功时通常返回 `["ok"]`。固件拒绝执行时可能返回
 * `["error"]`、带错误码的对象或纯字符串错误信息。
 * 这里统一检查结果，避免把设备端失败当成成功、UI 静默回弹。
 */
export function assertCommandOk(result: unknown) {
  if (result == null || result === '') {
    throw new Error('设备没有返回执行结果')
  }

  if (typeof result === 'string') {
    if (result.toLowerCase() === 'ok') return
    throw new Error(`设备返回：${result}`)
  }

  if (Array.isArray(result)) {
    const failed = result.find(
      (item) => typeof item === 'string' && item.toLowerCase().includes('error')
    )
    if (failed) {
      throw new Error('设备拒绝了该命令，可能不支持此方法或参数')
    }
    return
  }

  if (typeof result === 'object') {
    const { code, message } = result as { code?: unknown; message?: unknown }
    if (code != null && Number(code) !== 0) {
      throw new Error(
        `设备返回错误码 ${String(code)}${message ? `：${String(message)}` : ''}`
      )
    }
  }
}

/**
 * #rrggbb 转十进制 RGB。lamp15 的后灯带经验协议明确说明 `0x000000`
 * 属于未定义行为，应避免下发；这里把纯黑抬到最小合法值 1。
 */
export function hexToRgbInt(hex: string) {
  const normalized = hex.replace('#', '').trim()
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return DEFAULT_BACKGROUND_RGB
  const value = Number.parseInt(normalized, 16)
  return value === 0 ? 1 : value
}

/** HSV 转 #rrggbb，用于在 UI 中预览色相/饱和度控件的结果 */
export function hsvToHex(hue: number, saturation: number, value = 100) {
  const h = ((hue % 360) + 360) % 360
  const s = Math.max(0, Math.min(100, saturation)) / 100
  const v = Math.max(0, Math.min(100, value)) / 100

  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c

  const [r1, g1, b1] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`
}

/** #rrggbb 转 HSV，用于用户直接选色后同步色相/饱和度滑块 */
export function hexToHsv(hex: string) {
  const normalized = hex.replace('#', '')
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255
  if (![r, g, b].every(Number.isFinite)) return { hue: 0, saturation: 0 }

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let hue = 0
  if (delta !== 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6)
    else if (max === g) hue = 60 * ((b - r) / delta + 2)
    else hue = 60 * ((r - g) / delta + 4)
  }

  return {
    hue: Math.round((hue + 360) % 360),
    saturation: Math.round(max === 0 ? 0 : (delta / max) * 100),
  }
}

@Injectable({ providedIn: 'root' })
export class Lamp15Service {
  private mi = inject(MiService)

  private call(did: string, method: string, params: unknown[] = []) {
    return this.mi
      .callDevice({ did, method, params: JSON.stringify(params) })
      .then((result) => {
        assertCommandOk(result)
        return result
      })
  }

  getState(did: string) {
    return this.mi.getProp({ did, name: [...LAMP15_PROPS] }).then((raw) => {
      // 至少要有到 bg_rgb 的返回值，否则说明设备返回了不完整的状态
      if (!Array.isArray(raw) || raw.length <= PROP_INDEX.bg_rgb) {
        throw new Error(`读取灯光状态失败，设备返回：${JSON.stringify(raw)}`)
      }
      return parseLamp15State(raw)
    })
  }

  /**
   * 尽力读取背景灯当前模式。`bg_color_mode` 属于未完全验证的扩展属性，
   * 读取失败或返回非预期值时返回 `null`，由 UI 保留上一次的模式选择。
   */
  async getBackgroundMode(did: string): Promise<'ct' | 'color' | null> {
    try {
      const raw = await this.mi.getProp({ did, name: ['bg_color_mode'] })
      const value = Number(Array.isArray(raw) ? raw[0] : raw)
      if (value === 1 || value === 3) return 'color'
      if (value === 2) return 'ct'
      return null
    } catch {
      return null
    }
  }

  // 主灯
  setMainPower(did: string, on: boolean) {
    return this.call(did, 'set_power', [on ? 'on' : 'off', 'smooth', 300])
  }

  /** 同时切换主灯与背景灯，切换后的目标状态由设备决定 */
  toggleAll(did: string) {
    return this.call(did, 'dev_toggle')
  }

  setMainBrightness(did: string, value: number) {
    return this.call(did, 'set_bright', [clamp(value, 1, 100), 'smooth', 300])
  }

  setMainColorTemperature(did: string, kelvin: number) {
    return this.call(did, 'set_ct_abx', [clamp(kelvin, 2700, 6500), 'smooth', 300])
  }

  // 背景氛围灯（bg_ 前缀，不能与主灯方法混用）
  setBackgroundPower(did: string, on: boolean) {
    return this.call(did, 'bg_set_power', [on ? 'on' : 'off', 'smooth', 300])
  }

  setBackgroundBrightness(did: string, value: number) {
    return this.call(did, 'bg_set_bright', [clamp(value, 1, 100), 'smooth', 300])
  }

  setBackgroundColorTemperature(did: string, kelvin: number) {
    return this.call(did, 'bg_set_ct_abx', [
      clamp(kelvin, 2700, 6500),
      'smooth',
      300,
    ])
  }

  /**
   * 背景灯颜色一律走 `bg_set_rgb`，不要用 `bg_set_hsv`。
   * 实机日志证实：背景灯进入 HSV 模式（`bg_lmode=3`）后再关闭/打开，
   * 固件会卡死——所有 bg_* 命令都返回 ok 但状态不再变化，只能断电重置恢复。
   * 因此色相/饱和度控件在本地换算成 RGB 后调用本方法。
   */
  setBackgroundRgb(did: string, hex: string) {
    const rgb = hexToRgbInt(hex)
    return this.call(did, 'bg_set_rgb', [rgb, 'smooth', 300])
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}
