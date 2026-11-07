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
import { Lamp15Service, rgbIntToHex } from '../../lamp15.service'

@Component({
  selector: 'app-lamp15-control-dialog',
  template: ` <dialog class="modal" app-dialog [visible]="visible()">
    <div class="modal-box max-w-2xl">
      <button
        type="button"
        (click)="close()"
        [disabled]="busy()"
        class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
      >
        ✕
      </button>

      <h3 class="font-bold text-lg mb-4">
        {{ device()?.name }} - Light control
        @if (loading()) {
          <span class="loading loading-spinner loading-sm ml-2"></span>
        }
      </h3>

      @if (!device()?.isOnline) {
        <div class="alert alert-warning mb-3">Device is offline.</div>
      }
      @if (error()) {
        <div class="alert alert-error mb-3 whitespace-pre-wrap break-all">
          {{ error() }}
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
              [disabled]="disabled()"
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
            [disabled]="disabled()"
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
            [disabled]="disabled()"
          />

          <div class="join">
            @for (value of ctPresets; track value) {
              <button
                type="button"
                class="btn btn-sm join-item"
                (click)="setMainColorTemperature(value)"
                [disabled]="disabled()"
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
              [disabled]="disabled()"
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
            [disabled]="disabled()"
          />

          <div class="flex items-center gap-3">
            <span class="label-text">Mode</span>
            <div class="join">
              <button
                type="button"
                class="btn btn-sm join-item"
                [class.btn-active]="backgroundMode() === 'ct'"
                (click)="setBackgroundMode('ct')"
                [disabled]="disabled()"
              >
                CT
              </button>
              <button
                type="button"
                class="btn btn-sm join-item"
                [class.btn-active]="backgroundMode() === 'color'"
                (click)="setBackgroundMode('color')"
                [disabled]="disabled()"
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
              [disabled]="disabled()"
            />
          } @else {
            <div class="flex items-center gap-3">
              <span class="label-text">Color</span>
              <input
                type="color"
                class="h-10 w-16 cursor-pointer rounded border-0 bg-transparent"
                [value]="backgroundColor()"
                (input)="backgroundColor.set($any($event.target).value)"
                (change)="setBackgroundRgb()"
                [disabled]="disabled()"
              />
            </div>
          }
        </section>
      </div>
    </div>
  </dialog>`,
  styles: [``],
  imports: [DialogDirective],
})
export class Lamp15ControlDialogComponent {
  private lamp = inject(Lamp15Service)

  device = model<Device | null>(null)
  visible = computed(() => !!this.device())
  did = computed(() => this.device()?.did)
  disabled = computed(() => this.busy() || !this.device()?.isOnline)

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
  backgroundMode = signal<'ct' | 'color'>('ct')

  ctPresets = [2700, 4000, 5000, 6500]

  private visibleEffect = effect(() => {
    if (!this.visible()) return
    untracked(() => {
      this.error.set(null)
      void this.loadState(true)
    })
  })

  /** 打开面板或命令成功后读取设备真实状态 */
  private async loadState(showSpinner = false) {
    const did = this.did()
    if (!did) return
    if (showSpinner) this.loading.set(true)
    try {
      const state = await this.lamp.getState(did)
      this.power.set(state.power)
      this.brightness.set(state.brightness)
      this.colorTemperature.set(state.colorTemperature)
      this.backgroundPower.set(state.backgroundPower)
      this.backgroundBrightness.set(state.backgroundBrightness)
      this.backgroundColorTemperature.set(state.backgroundColorTemperature)
      this.backgroundColor.set(rgbIntToHex(state.backgroundRgb))
      this.error.set(null)
    } catch (err) {
      this.error.set(this.describeError(err))
    } finally {
      if (showSpinner) this.loading.set(false)
    }
  }

  private async run(action: Promise<unknown>) {
    if (this.busy()) return false
    this.busy.set(true)
    this.error.set(null)
    try {
      await action
      await this.loadState()
      return true
    } catch (err) {
      this.error.set(this.describeError(err))
      return false
    } finally {
      this.busy.set(false)
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
    void this.run(this.lamp.setMainPower(did, target)).then((ok) => {
      if (!ok) this.power.set(previous)
    })
  }

  setMainBrightness() {
    const did = this.did()
    if (did) void this.run(this.lamp.setMainBrightness(did, this.brightness()))
  }

  setMainColorTemperature(value = this.colorTemperature()) {
    const did = this.did()
    if (!did) return
    this.colorTemperature.set(value)
    void this.run(this.lamp.setMainColorTemperature(did, value))
  }

  toggleBackgroundPower() {
    const did = this.did()
    if (!did) return
    const previous = this.backgroundPower()
    const target = !previous
    this.backgroundPower.set(target)
    void this.run(this.lamp.setBackgroundPower(did, target)).then((ok) => {
      if (!ok) this.backgroundPower.set(previous)
    })
  }

  setBackgroundBrightness() {
    const did = this.did()
    if (did) {
      void this.run(this.lamp.setBackgroundBrightness(did, this.backgroundBrightness()))
    }
  }

  setBackgroundColorTemperature() {
    const did = this.did()
    if (did) {
      void this.run(
        this.lamp.setBackgroundColorTemperature(
          did,
          this.backgroundColorTemperature()
        )
      )
    }
  }

  /** 切换色温/彩色模式时，立即发送一次对应命令，确保设备模式与面板一致 */
  setBackgroundMode(mode: 'ct' | 'color') {
    const did = this.did()
    if (!did) return
    this.backgroundMode.set(mode)
    if (mode === 'ct') {
      void this.run(
        this.lamp.setBackgroundColorTemperature(
          did,
          this.backgroundColorTemperature()
        )
      )
    } else {
      void this.run(this.lamp.setBackgroundRgb(did, this.backgroundColor()))
    }
  }

  setBackgroundRgb() {
    const did = this.did()
    if (did) void this.run(this.lamp.setBackgroundRgb(did, this.backgroundColor()))
  }
}
