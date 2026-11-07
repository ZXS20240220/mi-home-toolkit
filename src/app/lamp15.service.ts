import { Injectable, inject } from '@angular/core'
import { MiService } from './mi.service'

/** 显示器挂灯的精确型号，避免误匹配其他 Yeelight 设备 */
export const LAMP15_MODEL = 'yeelink.light.lamp15'

const LAMP15_PROPS = [
  'power',
  'bright',
  'ct',
  'color_mode',
  'bg_power',
  'bg_bright',
  'bg_ct',
  'bg_rgb',
  'bg_hue',
  'bg_sat',
]

export type Lamp15State = {
  power: boolean
  brightness: number
  colorTemperature: number
  backgroundPower: boolean
  backgroundBrightness: number
  backgroundColorTemperature: number
  backgroundRgb: number
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** Yeelight 的 get_prop 返回值可能是字符串形式的数组，这里统一做类型归一化 */
export function parseLamp15State(raw: unknown): Lamp15State {
  const values = Array.isArray(raw) ? raw : []
  return {
    power: values[0] === 'on',
    brightness: toNumber(values[1], 100),
    colorTemperature: toNumber(values[2], 4000),
    backgroundPower: values[4] === 'on',
    backgroundBrightness: toNumber(values[5], 100),
    backgroundColorTemperature: toNumber(values[6], 4000),
    backgroundRgb: toNumber(values[7], 0xffffff),
  }
}

export function rgbIntToHex(rgb: number) {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`
}

export function hexToRgbInt(hex: string) {
  const normalized = hex.replace('#', '')
  const value = Number.parseInt(normalized, 16)
  return Number.isFinite(value) ? value : 0xffffff
}

@Injectable({ providedIn: 'root' })
export class Lamp15Service {
  private mi = inject(MiService)

  private call(did: string, method: string, params: unknown[] = []) {
    return this.mi.callDevice({ did, method, params: JSON.stringify(params) })
  }

  getState(did: string) {
    return this.mi
      .getProp({ did, name: LAMP15_PROPS })
      .then((raw) => parseLamp15State(raw))
  }

  // 主灯
  setMainPower(did: string, on: boolean) {
    return this.call(did, 'set_power', [on ? 'on' : 'off', 'smooth', 300])
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

  setBackgroundRgb(did: string, hex: string) {
    return this.call(did, 'bg_set_rgb', [hexToRgbInt(hex), 'smooth', 300])
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)))
}
