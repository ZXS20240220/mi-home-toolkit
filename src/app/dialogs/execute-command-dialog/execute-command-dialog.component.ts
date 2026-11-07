import {
  Component,
  computed,
  effect,
  inject,
  model,
  output,
  signal,
} from '@angular/core'
import { injectMutation } from '@tanstack/angular-query-experimental'
import { MiService } from '../../mi.service'
import { CommonModule } from '@angular/common'
import { DialogDirective } from '../dialog.directive'
import { IconComponent } from '../../icon/icon.component'
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms'

@Component({
  selector: 'app-execute-command-dialog',
  template: ` <dialog class="modal" app-dialog [visible]="visible()">
    <form
      class="modal-box"
      [formGroup]="form"
      (submit)="$event.preventDefault(); executeCommand()"
    >
      <button
        type="button"
        (click)="device.set(null)"
        [disabled]="callDeviceMutation.isPending()"
        class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
      >
        ✕
      </button>

      <h3 class="font-bold text-lg mb-4">
        {{ device()?.name }} - Execute command
      </h3>

      <div class="flex flex-col gap-2 items-stretch">
        <input
          type="text"
          placeholder="Method"
          spellcheck="false"
          [formControlName]="'method'"
          class="input w-full"
        />

        <textarea
          class="textarea w-full"
          [formControlName]="'params'"
          spellcheck="false"
          autocorrect="off"
          placeholder="Params"
        ></textarea>

        <textarea
          [readonly]="true"
          class="textarea w-full"
          [ngClass]="{
            'textarea-error': callDeviceMutation.isError(),
            'textarea-success': callDeviceMutation.isSuccess(),
          }"
          placeholder="Result"
          spellcheck="false"
          autocorrect="off"
          [ngModel]="form.controls.result.value"
          [ngModelOptions]="{ standalone: true }"
        ></textarea>
      </div>

      <div class="mt-4 flex items-center justify-between">
        <button
          class="btn"
          type="submit"
          [disabled]="callDeviceMutation.isPending()"
        >
          Execute
        </button>

        <div class="tooltip tooltip-left" data-tip="Refresh device info">
          <button
            type="button"
            class="btn btn-sm btn-circle btn-outline"
            (click)="refreshDevice()"
            [disabled]="
              refreshing() || callDeviceMutation.isPending() || !did()
            "
          >
            @if (refreshing()) {
              <span class="loading loading-spinner loading-xs"></span>
            } @else {
              <app-icon class="w-4 h-4" icon="refresh" />
            }
          </button>
        </div>
      </div>
    </form>
  </dialog>`,
  styles: [``],
  imports: [
    CommonModule,
    DialogDirective,
    FormsModule,
    ReactiveFormsModule,
    IconComponent,
  ],
})
export class ExecuteCommandDialogComponent {
  fb = inject(FormBuilder)
  device = model<{ did: number | string; name: string } | null>(null)
  did = computed(() => this.device()?.did)
  visible = computed(() => !!this.device())

  success = output()

  refreshing = signal(false)

  miService = inject(MiService)

  form = this.fb.group({
    method: '',
    params: '',
    result: '' as any,
  })

  private visibleEffect = effect(() => {
    if (this.visible()) this.callDeviceMutation.reset()
  })

  openCloseEffect = effect(() => this.visible() && this.form.reset())

  callDeviceMutation = injectMutation(() => ({
    mutationFn: (data: {
      did: string
      method: string
      params?: string | null
    }) => this.miService.callDevice(data),
    onSuccess: () => this.success.emit(),
  }))

  callDeviceResultEffect = effect(() => {
    const data = this.callDeviceMutation.data()
    const error = this.callDeviceMutation.error()
    const isError = this.callDeviceMutation.isError()
    const isPending = this.callDeviceMutation.isPending()

    const result = this.form.controls.result

    if (isPending) return result.setValue('Loading...')
    if (isError) return result.setValue(error || 'Error')
    return result.setValue(JSON.stringify(data))
  })

  executeCommand() {
    if (this.callDeviceMutation.isPending()) return
    const did = this.did()?.toString()
    const { method, params } = this.form.value
    if (!did || !method) return
    this.callDeviceMutation.mutate({ did, method, params })
  }

  /** 重新查询该设备的信息，结果写入 Result；同时通知父组件刷新设备卡片 */
  async refreshDevice() {
    const did = this.did()?.toString()
    if (!did || this.refreshing()) return

    const result = this.form.controls.result
    this.refreshing.set(true)
    result.setValue('Loading...')
    try {
      const device = await this.miService.getDevice(did)
      if (!device) throw new Error('设备没有返回信息')
      result.setValue(JSON.stringify(device, null, 2))
      this.success.emit()
    } catch (err) {
      result.setValue(
        typeof err === 'string'
          ? err
          : err instanceof Error
            ? err.message
            : String(err)
      )
    } finally {
      this.refreshing.set(false)
    }
  }
}
