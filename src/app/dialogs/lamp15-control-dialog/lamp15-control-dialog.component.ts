import {
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
  untracked,
} from '@angular/core'
import { Device } from '../../types'
import { DialogDirective } from '../dialog.directive'
import { IconComponent } from '../../icon/icon.component'
import {
  Lamp15Service,
  hexToHsv,
  hsvToHex,
  rgbIntToHex,
} from '../../lamp15.service'

type Channel =
  | 'main-power'
  | 'main-bright'
  | 'main-ct'
  | 'bg-power'
  | 'bg-bright'
  | 'bg-ct'
  | 'bg-color'

@Component({
  selector: 'app-lamp15-control-dialog',
  template: ` <dialog class="modal" app-dialog [visible]="visible()">
    <div class="modal-box max-w-2xl">
      <button
        type="button"
        (click)="close()"
        class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
      >
        ✕
      </button>

      <div class="mb-4 flex items-center gap-2 pr-10">
        <h3 class="font-bold text-lg">
          {{ device()?.name }} - Light control
        </h3>

        <div class="tooltip tooltip-bottom" data-tip="Refresh state">
          <button
            type="button"
            class="btn btn-sm btn-circle btn-outline"
            (click)="refresh()"
            [disabled]="loading()"
          >
            @if (loading()) {
              <span class="loading loading-spinner loading-xs"></span>
            } @else {
              <app-icon class="w-4 h-4" icon="refresh" />
            }
          </button>
        </div>

        @if (busy()) {
          <span class="loading loading-spinner loading-sm"></span>
        }
      </div>

      @if (!device()?.isOnline) {
        <div class="alert alert-warning mb-3">Device is offline.</div>
      }
      @if (error(); as message) {
        <div class="alert alert-error mb-3">
          <div class="flex-1 whitespace-pre-wrap break-all">{{ message }}</div>
          <button
            type="button"
            class="btn btn-sm"
            (click)="retry()"
            [disabled]="loading()"
          >
            Retry
          </button>
        </div>
      }

      <div class="flex flex-col gap-4">
        <section class="flex flex-col gap-2">
          <h4 class="font-semibold">Main light</h4>

          <label class="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              class="toggle"
              [checked]="power()"
              (change)="toggleMainPower()"
              [disabled]="!device()?.isOnline"
            />
            <span>{{ power() ? 'On' : 'Off' }}</span>
          </label>

          <label class="label py-0">Brightness {{ brightness() }}%</label>
          <input
            type="range"
            class="range"
            min="1"
            max="100"
            step="1"
            [value]="brightness()"
            (input)="brightness.set(+$any($event.target).value)"
            (change)="setMainBrightness()"
            [disabled]="!device()?.isOnline"
          />

          <label class="label py-0">
            Color temperature {{ colorTemperature() }} K
          </label>
          <input
            type="range"
            class="range"
            min="2700"
            max="6500"
            step="50"
            [value]="colorTemperature()"
            (input)="colorTemperature.set(+$any($event.target).value)"
            (change)="setMainColorTemperature()"
            [disabled]="!device()?.isOnline"
          />

          <div class="join">
            @for (value of ctPresets; track value) {
              <button
                type="button"
                class="btn btn-sm join-item"
                [class.btn-active]="colorTemperature() === value"
                (click)="setMainColorTemperature(value)"
                [disabled]="!device()?.isOnline"
              >
                {{ value }}K
              </button>
            }
          </div>
        </section>

        <div class="divider my-0"></div>

        <section class="flex flex-col gap-2">
          <h4 class="font-semibold">Background light</h4>

          <label class="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              class="toggle"
              [checked]="backgroundPower()"
              (change)="toggleBackgroundPower()"
              [disabled]="!device()?.isOnline"
            />
            <span>{{ backgroundPower() ? 'On' : 'Off' }}</span>
          </label>

          <label class="label py-0">
            Brightness {{ backgroundBrightness() }}%
          </label>
          <input
            type="range"
            class="range"
            min="1"
            max="100"
            step="1"
            [value]="backgroundBrightness()"
            (input)="backgroundBrightness.set(+$any($event.target).value)"
            (change)="setBackgroundBrightness()"
            [disabled]="!device()?.isOnline"
          />

          <div class="flex items-center gap-3">
            <span class="label-text">Mode</span>
            <div class="join">
              <button
                type="button"
                class="btn btn-sm join-item"
                [class.btn-active]="backgroundMode() === 'ct'"
                (click)="setBackgroundMode('ct')"
                [disabled]="!device()?.isOnline"
              >
                CT
              </button>
              <button
                type="button"
                class="btn btn-sm join-item"
                [class.btn-active]="backgroundMode() === 'color'"
                (click)="setBackgroundMode('color')"
                [disabled]="!device()?.isOnline"
              >
                Color
              </button>
            </div>
          </div>

          @if (backgroundMode() === 'ct') {
            <label class="label py-0">
              Color temperature {{ backgroundColorTemperature() }} K
            </label>
            <input
              type="range"
              class="range"
              min="2700"
              max="6500"
              step="50"
              [value]="backgroundColorTemperature()"
              (input)="
                backgroundColorTemperature.set(+$any($event.target).value)
              "
              (change)="setBackgroundColorTemperature()"
              [disabled]="!device()?.isOnline"
            />

            <div class="join">
              @for (value of ctPresets; track value) {
                <button
                  type="button"
                  class="btn btn-sm join-item"
                  [class.btn-active]="backgroundColorTemperature() === value"
                  (click)="setBackgroundColorTemperature(value)"
                  [disabled]="!device()?.isOnline"
                >
                  {{ value }}K
                </button>
              }
            </div>
          } @else {
            <div class="flex items-center gap-3">
              <span class="label-text">Color</span>
              <input
                type="color"
                class="h-10 w-16 cursor-pointer rounded border-0 bg-transparent"
                [value]="backgroundColor()"
                (input)="onColorPicked($any($event.target).value)"
                (change)="setBackgroundRgb()"
                [disabled]="!device()?.isOnline"
              />
              <span class="text-sm opacity-70">
                {{ backgroundColor() }} / hue {{ hue() }}°, sat {{ saturation() }}%
              </span>
            </div>

            <label class="label py-0">Hue {{ hue() }}°</label>
            <div class="relative flex w-full items-center">
              <div
                class="pointer-events-none absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full"
                style="background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);"
              ></div>
              <input
                type="range"
                class="range relative w-full"
                style="--range-progress: transparent; --range-bg: transparent;"
                min="0"
                max="359"
                step="1"
                [value]="hue()"
                (input)="onHsvInput('hue', +$any($event.target).value)"
                (change)="setBackgroundHsv()"
                [disabled]="!device()?.isOnline"
              />
            </div>

            <label class="label py-0">Saturation {{ saturation() }}%</label>
            <input
              type="range"
              class="range"
              min="0"
              max="100"
              step="1"
              [value]="saturation()"
              (input)="onHsvInput('sat', +$any($event.target).value)"
              (change)="setBackgroundHsv()"
              [disabled]="!device()?.isOnline"
            />
          }
        </section>
      </div>
    </div>
  </dialog>`,
  styles: [``],
  imports: [DialogDirective, IconComponent],
})
export class Lamp15ControlDialogComponent {
  private lamp = inject(Lamp15Service)

  device = model<Device | null>(null)
  visible = computed(() => !!this.device())
  did = computed(() => this.device()?.did)

  loading = signal(false)
  busy = signal(false)
  error = signal<string | null>(null)

  power = signal(false)
  brightness = signal(100)
  colorTemperature = signal(4000)
  backgroundPower = signal(false)
  backgroundBrightness = signal(100)
  backgroundColorTemperature = signal(4000)
  backgroundColor = signal('#ffffff')
  hue = signal(0)
  saturation = signal(100)
  backgroundMode = signal<'ct' | 'color'>('ct')

  ctPresets = [2700, 4000, 5000, 6500]

  /**
   * 待执行命令按“通道”合并：滑块连续变化或连点按钮时只保留最新的一条，
   * 避免拖动过程中堆积大量 RPC 请求。
   */
  private pending = new Map<Channel, () => Promise<unknown>>()
  /** 电源开关的目标状态，用于在命令结束后核对设备是否真正执行 */
  private expectedPower = new Map<Channel, boolean>()
  private draining = false
  private drainPromise: Promise<void> | null = null

  private visibleEffect = effect(() => {
    if (!this.visible()) return
    untracked(() => {
      this.error.set(null)
      this.pending.clear()
      void this.loadState(true)
    })
  })

  retry() {
    void this.refresh()
  }

  /** 手动刷新设备状态；有未完成命令时先等队列结束，避免读到中间值 */
  async refresh() {
    if (this.loading()) return
    this.error.set(null)
    await this.drainPromise?.catch(() => undefined)
    await this.loadState(true)
  }

  /** 打开面板或命令成功后读取设备真实状态 */
  private async loadState(showSpinner = false) {
    const did = this.did()
    if (!did) return
    if (showSpinner) this.loading.set(true)
    try {
      const [state, mode] = await Promise.all([
        this.lamp.getState(did),
        this.lamp.getBackgroundMode(did),
      ])
      this.power.set(state.power)
      this.brightness.set(state.brightness)
      this.colorTemperature.set(state.colorTemperature)
      this.backgroundPower.set(state.backgroundPower)
      this.backgroundBrightness.set(state.backgroundBrightness)
      this.backgroundColorTemperature.set(state.backgroundColorTemperature)
      this.backgroundColor.set(rgbIntToHex(state.backgroundRgb))
      const hsv = hexToHsv(rgbIntToHex(state.backgroundRgb))
      this.hue.set(hsv.hue)
      this.saturation.set(hsv.saturation)
      if (mode) this.backgroundMode.set(mode)
    } catch (err) {
      this.error.set(this.describeError(err))
    } finally {
      if (showSpinner) this.loading.set(false)
    }
  }

  private submit(channel: Channel, action: () => Promise<unknown>) {
    this.error.set(null)
    this.pending.set(channel, action)
    this.drainPromise ??= this.drain().finally(() => {
      this.drainPromise = null
    })
  }

  private async drain() {
    if (this.draining) return
    this.draining = true
    this.busy.set(true)
    try {
      while (this.pending.size) {
        const entry = this.pending.entries().next().value as [
          Channel,
          () => Promise<unknown>,
        ]
        this.pending.delete(entry[0])
        try {
          await entry[1]()
        } catch (err) {
          this.error.set(this.describeError(err))
          continue
        }
      }
      await this.loadState()
      this.verifyPowerApplied()
    } finally {
      this.draining = false
      this.busy.set(false)
    }
  }

  /**
   * 设备可能对命令返回 `ok` 却不真正执行（例如背景灯供电异常时）。
   * 这里核对开关状态是否与用户请求一致，不一致就明确报错，而不是静默回弹。
   */
  private verifyPowerApplied() {
    if (this.error()) return

    const failures: string[] = []
    const main = this.expectedPower.get('main-power')
    if (main != null && this.power() !== main) {
      failures.push(`主灯未能${main ? '开启' : '关闭'}`)
    }
    const background = this.expectedPower.get('bg-power')
    if (background != null && this.backgroundPower() !== background) {
      failures.push(`背景灯未能${background ? '开启' : '关闭'}`)
    }
    this.expectedPower.clear()

    if (failures.length) {
      this.error.set(
        `设备返回成功，但状态没有改变：${failures.join('；')}。` +
          '请检查设备供电、固件版本，或改用米家 App 验证。'
      )
    }
  }

  private describeError(err: unknown) {
    if (typeof err === 'string') return err
    if (err instanceof Error) return err.message
    return String(err)
  }

  close() {
    this.device.set(null)
  }

  toggleMainPower() {
    const did = this.did()
    if (!did) return
    const previous = this.power()
    const target = !previous
    this.power.set(target)
    this.expectedPower.set('main-power', target)
    this.submit('main-power', async () => {
      try {
        await this.lamp.setMainPower(did, target)
      } catch (err) {
        this.expectedPower.delete('main-power')
        this.power.set(previous)
        throw err
      }
    })
  }

  setMainBrightness() {
    const did = this.did()
    const value = this.brightness()
    if (!did) return
    this.submit('main-bright', () => this.lamp.setMainBrightness(did, value))
  }

  setMainColorTemperature(value = this.colorTemperature()) {
    const did = this.did()
    if (!did) return
    this.colorTemperature.set(value)
    this.submit('main-ct', () => this.lamp.setMainColorTemperature(did, value))
  }

  toggleBackgroundPower() {
    const did = this.did()
    if (!did) return
    const previous = this.backgroundPower()
    const target = !previous
    this.backgroundPower.set(target)
    this.expectedPower.set('bg-power', target)
    this.submit('bg-power', async () => {
      try {
        await this.lamp.setBackgroundPower(did, target)
      } catch (err) {
        this.expectedPower.delete('bg-power')
        this.backgroundPower.set(previous)
        throw err
      }
    })
  }

  setBackgroundBrightness() {
    const did = this.did()
    const value = this.backgroundBrightness()
    if (!did) return
    this.submit('bg-bright', () =>
      this.lamp.setBackgroundBrightness(did, value)
    )
  }

  setBackgroundColorTemperature(value = this.backgroundColorTemperature()) {
    const did = this.did()
    if (!did) return
    this.backgroundColorTemperature.set(value)
    this.submit('bg-ct', () =>
      this.lamp.setBackgroundColorTemperature(did, value)
    )
  }

  /** 切换色温/彩色模式时，立即发送一次对应命令，确保设备模式与面板一致 */
  setBackgroundMode(mode: 'ct' | 'color') {
    if (!this.did()) return
    this.backgroundMode.set(mode)
    if (mode === 'ct') {
      this.setBackgroundColorTemperature()
    } else {
      this.setBackgroundRgb()
    }
  }

  onColorPicked(hex: string) {
    this.backgroundColor.set(hex)
    const hsv = hexToHsv(hex)
    this.hue.set(hsv.hue)
    this.saturation.set(hsv.saturation)
  }

  onHsvInput(field: 'hue' | 'sat', value: number) {
    if (field === 'hue') this.hue.set(value)
    else this.saturation.set(value)
    this.backgroundColor.set(hsvToHex(this.hue(), this.saturation()))
  }

  setBackgroundRgb() {
    const did = this.did()
    const color = this.backgroundColor()
    if (!did) return
    this.submit('bg-color', () => this.lamp.setBackgroundRgb(did, color))
  }

  setBackgroundHsv() {
    const did = this.did()
    const hue = this.hue()
    const saturation = this.saturation()
    if (!did) return
    this.submit('bg-color', () =>
      this.lamp.setBackgroundHsv(did, hue, saturation)
    )
  }
}
