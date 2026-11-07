`

# Mi Home Toolkit 二次开发文档：Yeelight `yeelink.light.lamp15` 控制面板

> 面向 fork 后的功能开发。本文将项目现有架构、`lamp15` 命令协议和建议的 UI 改造方式整理在一起。
>
> **项目基线**：`ApplY3D/mi-home-toolkit` 的 `main` 分支；本文检查时 `package.json` 版本为 `1.4.2`。
> **设备**：Yeelight 显示器挂灯，Model `yeelink.light.lamp15`。
> **整理日期**：2026-11-07。

---

## 1. 目标与范围

当前项目已经提供通用设备管理和 RPC 命令执行功能。针对 `yeelink.light.lamp15`，二次开发的目标是：

1. 在设备卡片或独立控制面板中识别 `yeelink.light.lamp15`。
2. 将常用 RPC 命令封装为按钮、开关、亮度滑块、色温滑块和颜色选择器。
3. 主灯与背景氛围灯分区控制，不混用各自的 RPC 方法。
4. 氛围灯在色温与彩色模式间切换时，UI 能同步切换控制器。
5. 执行命令后读取设备状态，避免界面只显示本地假状态。
6. 保留原有的通用 Execute command 对话框，作为高级调试入口。

本文区分三类信息：

- **源码确认**：可以从项目当前源码直接核对的结构和调用方式。
- **协议定义**：Yeelight 命令协议和 `lamp15` 设备资料中记录的能力。
- **实机确认**：本次对话中设备使用者已反馈 `get_prop` 查询正常。其他命令仍建议在开发时逐项实机回归，不将协议支持等同于本机已测试。

## 2. 项目技术栈与开发环境

项目是桌面应用，不是纯浏览器网页：

| 层       | 技术                         | 用途                                 |
| -------- | ---------------------------- | ------------------------------------ |
| 前端     | Angular 19、TypeScript       | 登录、设备列表、设备卡片和命令对话框 |
| UI       | Tailwind CSS 4、DaisyUI 5    | 页面布局与控件                       |
| 异步数据 | RxJS、TanStack Angular Query | 登录状态、设备查询和 mutation        |
| 桌面桥接 | Tauri 2                      | Angular 调用 Rust 命令               |
| 后端     | Rust 2021、Tokio             | 小米云认证、设备查询和 RPC 转发      |
| 云端     | Xiaomi Mi Cloud              | 登录、设备列表、设备 RPC             |

`package.json` 声明 Node.js `>=18.19.1`、pnpm `>=9`；主要依赖包括 Angular `^19.2.8`、Tauri API `^2.5.0`、TypeScript `~5.5.4`、Tailwind `^4.1.4` 和 DaisyUI `^5.0.28`。Rust workspace 位于 `src-tauri`，edition 为 2021。

### 2.1 Fork 与本地运行

```bash
# 1. Fork GitHub 仓库后，克隆你自己的 fork
 git clone https://github.com/<YOUR_GITHUB_NAME>/mi-home-toolkit.git
cd mi-home-toolkit

# 2. 安装前端依赖
pnpm install

# 3. 启动 Tauri 桌面开发模式
pnpm tauri dev

# 4. 构建桌面安装包
pnpm tauri build
```

首次构建还需要本机具备 Tauri 对应平台的 Rust、系统编译工具和 WebView 依赖。请以 Tauri 2 的平台安装文档为准：[https://v2.tauri.app/start/prerequisites/](https://v2.tauri.app/start/prerequisites/)。

## 3. 现有项目结构与关键调用链

### 3.1 关键文件

| 文件                                                                           | 现有职责                                    | 二次开发建议                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------ |
| `src/app/pages/devices-page.component.ts`                                    | 查询设备列表、渲染设备卡片、打开命令对话框  | 在此处决定是否打开专用控制面板；或让设备卡片内嵌面板               |
| `src/app/card/device.component.ts`                                           | 设备卡片、设备信息、刷新、Yeelight LAN Mode | 在此处按型号挂载 `lamp15` 专用控件                               |
| `src/app/dialogs/execute-command-dialog/execute-command-dialog.component.ts` | 通用 Method / Params 命令对话框             | 保留作为高级调试入口，不建议把专用灯控逻辑塞进该对话框             |
| `src/app/mi.service.ts`                                                      | Angular 到 Tauri 的统一调用服务             | 现有 `callDevice()` 足以承载灯具 RPC；可增加类型安全的封装方法   |
| `src/app/types.ts`                                                           | `Device` 类型                             | 需要时为 lamp state 添加独立类型，不要把灯具属性硬塞进通用设备类型 |
| `src/app/app.routes.ts`                                                      | 登录页、设备页路由与登录守卫                | 如以后增加独立设备详情页，在此扩展路由                             |
| `src/app/auth.service.ts`                                                    | 登录状态、验证码和二步验证事件              | 修改认证流程时需谨慎，灯控功能通常不必改动                         |
| `src-tauri/src/main.rs`                                                      | Tauri 命令注册；`call_device` Rust 命令   | 当前 RPC 管线已通用，新增普通灯控按钮通常不需要改这里              |
| `src-tauri/miio/src/lib.rs`                                                  | Mi Cloud 协议、登录、设备列表、RPC 请求     | 只有要扩展云端协议/错误处理/连接方式时才需要改                     |

### 3.2 现有调用链

```text
DevicesPageComponent
  ├─ MiService.getDevices()
  ├─ DeviceComponent（每台设备一个卡片）
  │    ├─ MiService.getDevice(did)       // 刷新设备信息
  │    └─ MiService.getProp(...lan_ctrl) // 读取 Yeelight LAN Mode
  └─ ExecuteCommandDialogComponent
       └─ MiService.callDevice({ did, method, params })
            └─ Tauri invoke('call_device', ...)
                 └─ Rust call_device(...)
                      └─ MiCloudProtocol.call_device(...)
                           └─ POST /home/rpc/{did}
                                { method, params }
```

### 3.3 命令参数如何传递

`MiService.callDevice()` 的接口为：

```ts
callDevice(data: {
  did: string
  method: string
  params?: string | null
})
```

其中 `params` 是**序列化后的 JSON 字符串**，不是 JavaScript 数组本身。Rust 的 Tauri 命令收到字符串后用 `serde_json` 解析成 JSON `Value`，再交给 `MiCloudProtocol.call_device()`。

因此，前端新增控件时应这样调用：

```ts
this.miService.callDevice({
  did,
  method: 'set_bright',
  params: JSON.stringify([80, 'smooth', 500]),
})
```

不要把数组直接放进 `params`，也不要把 JSON 数组额外包成字符串数组。

现有 `MiService` 还封装了：

```ts
getProp({ did, name }) // 自动 JSON.stringify 属性名数组，并调用 get_prop
setProp({ did, name, value }) // 调用 set_ps，主要用于 cfg_lan_ctrl
```

灯具的 `set_power`、`set_bright`、`bg_set_rgb` 等方法应使用 `callDevice()`，而不是误用 `setProp()`。

### 3.4 哪些代码通常不需要改

如果只是增加 `lamp15` 的按钮和滑块：

- 不需要重新实现小米账号登录。
- 不需要修改验证码或 2FA 逻辑。
- 不需要新增一个 Rust 命令。
- 不需要改写 Mi Cloud RPC 端点。

优先在 Angular 中新增 `Lamp15ControlComponent` 和一层 `Lamp15Service`（或命令 helper），复用现有 `MiService.callDevice()`。

## 4. `yeelink.light.lamp15` 的控制模型

该型号需要按两个逻辑灯区处理：

| 灯区                | 典型功能                           | RPC 方法前缀                    |
| ------------------- | ---------------------------------- | ------------------------------- |
| 主灯 / 前照明       | 开关、亮度、色温                   | 无前缀，例如 `set_bright`     |
| 背景氛围灯 / 后灯带 | 独立开关、亮度、色温、RGB/HSV 彩色 | `bg_`，例如 `bg_set_bright` |

**重要规则**：主灯与背景氛围灯的方法不能混用。氛围灯色温和 RGB/HSV 彩色模式互斥；设置色温会切换到白光色温模式，设置 RGB/HSV 会切换到彩色模式。主灯以白光色温控制为主，不要把主灯 RGB 控件直接暴露给用户。

## 5. 已整理的 RPC 命令

所有命令都在 Toolkit 的 Execute command 对话框中分开填写：

- `Method`：命令名称。
- `Params`：JSON 数组。

UI 代码中则通过 `callDevice()` 发送同样的 method 和参数数组。

### 5.1 主灯

| 功能     | Method         | Params                   |
| -------- | -------------- | ------------------------ |
| 打开     | `set_power`  | `["on","smooth",500]`  |
| 关闭     | `set_power`  | `["off","smooth",500]` |
| 切换     | `toggle`     | `[]`                   |
| 设置亮度 | `set_bright` | `[80,"smooth",500]`    |
| 设置色温 | `set_ct_abx` | `[4000,"smooth",500]`  |

建议 UI 范围：亮度 1–100%；色温 2700–6500 K。色温滑块可提供 2700 K、4000 K、5000 K、6500 K 快捷按钮。

### 5.2 背景氛围灯：开关和亮度

| 功能     | Method            | Params                   |
| -------- | ----------------- | ------------------------ |
| 打开     | `bg_set_power`  | `["on","smooth",500]`  |
| 关闭     | `bg_set_power`  | `["off","smooth",500]` |
| 切换     | `bg_toggle`     | `[]`                   |
| 设置亮度 | `bg_set_bright` | `[50,"smooth",500]`    |

背景灯亮度独立于 RGB/HSV 数值。设置颜色时不要试图通过改变 RGB 数值来调节亮度，亮度统一使用 `bg_set_bright`。

### 5.3 背景氛围灯：色温模式

```text
Method: bg_set_ct_abx
Params: [4000,"smooth",500]
```

参数含义：`[色温 Kelvin, 过渡类型, 过渡毫秒]`。

已使用的常见色温值：2700、4000、5000、6500 K。第三方 Yeelight 命令参考资料列出背景通道 1700–6500 K，但建议 UI 初版先使用 2700–6500 K；以后可以尝试读取 `bg_min_ct` / `bg_max_ct` 后按设备返回值动态设置范围。

### 5.4 背景氛围灯：RGB 模式

```text
Method: bg_set_rgb
Params: [16711680,"smooth",500]
```

RGB 需要转成一个十进制整数：

```ts
function rgbToInt(red: number, green: number, blue: number): number {
  return (red << 16) | (green << 8) | blue
}

// #FF0000 -> 16711680
const red = rgbToInt(255, 0, 0)
```

常用值：

| 颜色 | HEX         |   十进制 RGB |
| ---- | ----------- | -----------: |
| 红   | `#FF0000` | `16711680` |
| 绿   | `#00FF00` |    `65280` |
| 蓝   | `#0000FF` |      `255` |
| 黄   | `#FFFF00` | `16776960` |
| 紫   | `#8000FF` |  `8388863` |
| 青   | `#00FFFF` |    `65535` |
| 白   | `#FFFFFF` | `16777215` |

### 5.5 背景氛围灯：HSV 模式

```text
Method: bg_set_hsv
Params: [240,100,"smooth",500]
```

参数含义：`[Hue, Saturation, 过渡类型, 过渡毫秒]`。

- Hue：0–359，色相。
- Saturation：0–100，饱和度。
- 亮度仍由 `bg_set_bright` 单独控制。

常用色相：红 0°、黄 60°、绿 120°、青 180°、蓝 240°、紫 270°。

### 5.6 设备整体切换

| 功能                 | Method         | Params |
| -------------------- | -------------- | ------ |
| 同时切换主灯与背景灯 | `dev_toggle` | `[]` |

### 5.7 查询设备状态：`get_prop`

`get_prop` 的 `Params` 是要查询的属性名称数组；**不传空数组，也不代表查询全部属性**。

主灯与背景灯常用属性：

```json
[
  "power",
  "bright",
  "ct",
  "color_mode",
  "bg_power",
  "bg_bright",
  "bg_ct",
  "bg_rgb",
  "bg_hue",
  "bg_sat"
]
```

本次设备使用者已反馈，上述属性查询在 `yeelink.light.lamp15` 上正常。

| 属性           | 含义                  |
| -------------- | --------------------- |
| `power`      | 主灯开关状态          |
| `bright`     | 主灯亮度              |
| `ct`         | 主灯色温              |
| `color_mode` | 主灯色彩模式          |
| `bg_power`   | 背景氛围灯开关        |
| `bg_bright`  | 背景氛围灯亮度        |
| `bg_ct`      | 背景氛围灯色温        |
| `bg_rgb`     | 背景氛围灯 RGB 值     |
| `bg_hue`     | 背景氛围灯 Hue        |
| `bg_sat`     | 背景氛围灯 Saturation |

建议开发时将查询拆成两组：

```ts
const MAIN_PROPS = ['power', 'bright', 'ct', 'color_mode']
const BACKGROUND_PROPS = [
  'bg_power', 'bg_bright', 'bg_ct', 'bg_rgb', 'bg_hue', 'bg_sat',
]
```

可选的扩展诊断属性（不同协议实现/固件可能有差异，需实测后再作为正式 UI 依赖）：`bg_color_mode`、`bg_min_ct`、`bg_max_ct`、`min_ct`、`max_ct`、`main_power`。

**状态解析提醒**：Yeelight 属性值可能以字符串形式返回，例如 `"on"`、`"off"`、`"80"`、`"4000"`。解析亮度和色温时使用 `Number(value)`，开关状态则比较字符串或统一正规化，不能直接把 `"off"` 当作布尔值使用。

## 6. 建议的 UI 设计

建议在设备卡片上增加“灯光控制”按钮，打开一个独立的控制面板。相比把所有控件都塞进通用 Execute command 对话框，这样更容易扩展，也不影响其他型号设备。

### 6.1 主灯区域

| UI 控件      | 行为                              |
| ------------ | --------------------------------- |
| 电源开关     | `set_power` on/off              |
| 亮度滑块     | 1–100，提交时调用 `set_bright` |
| 色温滑块     | 2700–6500 K，调用 `set_ct_abx` |
| 色温快捷按钮 | 2700 / 4000 / 5000 / 6500 K       |

### 6.2 氛围灯区域

| UI 控件               | 行为                                                  |
| --------------------- | ----------------------------------------------------- |
| 电源开关              | `bg_set_power` on/off                               |
| 亮度滑块              | 1–100，调用 `bg_set_bright`                        |
| 模式切换              | “色温 / 彩色”两个选项                               |
| 色温滑块              | 仅色温模式显示，调用 `bg_set_ct_abx`                |
| 颜色选择器            | 仅彩色模式显示，调用 `bg_set_rgb` 或 `bg_set_hsv` |
| Hue / Saturation 控件 | 可选；调用 `bg_set_hsv`                             |

建议初版先使用 HTML 原生 `<input type="color">`，将颜色值转换成 RGB 整数后调用 `bg_set_rgb`。后续如需更细腻的选色体验，再换成色盘 + 饱和度控件。

### 6.3 推荐交互规则

1. 控制面板打开时执行一次 `get_prop`，显示真实状态。
2. 控件变化时不要假设设备命令一定成功；收到 RPC 成功响应后再更新确认状态，或先乐观更新、失败后回滚。
3. 每次命令成功后，重新读取对应灯区的属性，避免 UI 与设备不同步。
4. 滑块拖动时不要每移动 1 像素就发 RPC。建议在 `change` / `pointerup` 时提交，或做约 250–350 ms 防抖。
5. 某个灯区命令正在执行时，暂时禁用该灯区相关控件或合并待执行值，防止快速拖动造成命令堆积。
6. 背景灯在“色温 / 彩色”模式间切换时，切换显示的控件，并只调用对应模式的 RPC 方法。
7. 保留 `Execute command` 入口，方便以后调试固件新增的属性或命令。

## 7. 推荐代码组织

不要让 Angular 组件直接拼接大量 method 字符串。建议新增独立服务或 helper：

```text
src/app/
  card/
    device.component.ts
    lamp15-control.component.ts       # 新增：灯控 UI
  services/
    lamp15.service.ts                 # 新增：lamp15 命令封装（目录可按项目习惯调整）
  mi.service.ts                       # 复用现有 callDevice/getProp
  types/
    lamp15.types.ts                   # 可选：灯具状态和模式类型
```

示例封装（可按现有代码风格微调）：

```ts
import { Injectable, inject } from '@angular/core'
import { MiService } from '../mi.service'

type Effect = 'smooth' | 'sudden'

@Injectable({ providedIn: 'root' })
export class Lamp15Service {
  private mi = inject(MiService)

  private call(did: string, method: string, params: unknown[] = []) {
    return this.mi.callDevice({ did, method, params: JSON.stringify(params) })
  }

  getState(did: string) {
    const props = [
      'power', 'bright', 'ct', 'color_mode',
      'bg_power', 'bg_bright', 'bg_ct', 'bg_rgb', 'bg_hue', 'bg_sat',
    ]
    return this.mi.getProp({ did, name: props })
  }

  setMainPower(did: string, on: boolean, effect: Effect = 'smooth') {
    return this.call(did, 'set_power', [on ? 'on' : 'off', effect, 300])
  }

  setMainBrightness(did: string, value: number) {
    const brightness = Math.max(1, Math.min(100, Math.round(value)))
    return this.call(did, 'set_bright', [brightness, 'smooth', 300])
  }

  setMainColorTemperature(did: string, kelvin: number) {
    const ct = Math.max(2700, Math.min(6500, Math.round(kelvin)))
    return this.call(did, 'set_ct_abx', [ct, 'smooth', 300])
  }

  setBackgroundPower(did: string, on: boolean) {
    return this.call(did, 'bg_set_power', [on ? 'on' : 'off', 'smooth', 300])
  }

  setBackgroundBrightness(did: string, value: number) {
    const brightness = Math.max(1, Math.min(100, Math.round(value)))
    return this.call(did, 'bg_set_bright', [brightness, 'smooth', 300])
  }

  setBackgroundColorTemperature(did: string, kelvin: number) {
    const ct = Math.max(2700, Math.min(6500, Math.round(kelvin)))
    return this.call(did, 'bg_set_ct_abx', [ct, 'smooth', 300])
  }

  setBackgroundRgb(did: string, hex: string) {
    const normalized = hex.replace('#', '')
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      throw new Error('Expected a six-digit hex color, e.g. #FF8800')
    }
    const rgb = Number.parseInt(normalized, 16)
    return this.call(did, 'bg_set_rgb', [rgb, 'smooth', 300])
  }

  setBackgroundHsv(did: string, hue: number, saturation: number) {
    const h = Math.max(0, Math.min(359, Math.round(hue)))
    const s = Math.max(0, Math.min(100, Math.round(saturation)))
    return this.call(did, 'bg_set_hsv', [h, s, 'smooth', 300])
  }
}
```

说明：上面是建议封装，不是仓库现有代码。代码示例将滑块值限制在安全范围，并统一由 `Lamp15Service` 负责 JSON 参数序列化。

## 8. 在设备卡片中按型号显示专属面板

当前 `DeviceComponent` 已拿到完整的 `device` 对象，且 `device.model` 是设备型号字符串。最小改造方式是在卡片模板里按精确型号挂载组件：

```ts
const isLamp15 = this.deviceComputed().model === 'yeelink.light.lamp15'
```

模板逻辑示意：

```html
@if (device.model === 'yeelink.light.lamp15') {
  <app-lamp15-control [deviceId]="device.did" />
}
```

正式实现时需要将 `Lamp15ControlComponent` 加入父组件的 `imports`，并定义好 `deviceId` input。不要仅用 `model.startsWith('yeelink.light')` 判定 `lamp15`，否则会把通用 Yeelight 灯泡的控件错误显示出来。

也可以让设备卡片只显示“控制”按钮，然后由 `DevicesPageComponent` 像现有 Execute command 对话框一样控制专用面板的打开/关闭状态。这种方式更适合控制区域比较大的 UI。

## 9. 状态管理与刷新建议

建议把读取状态和发送命令分开：

- Query：读取 `get_prop`，例如 query key `['lamp15-state', did]`。
- Mutation：发送单条 RPC 命令。
- Mutation 成功：invalidate / refetch 当前 `did` 的 lamp state query。
- Mutation 失败：显示错误消息，保留已确认状态；不要吞掉错误。

目前项目在 `DevicesPageComponent.invalidateDevice()` 中会刷新设备信息卡片，但这不等于读取灯具的 `power` / `bright` / `bg_*` 状态。新增灯控面板后，应自行刷新 lamp state。

对于命令失败，至少区分：

- 设备离线或云端调用失败。
- method 不受固件支持。
- params JSON 格式错误。
- 参数越界或参数类型错误。
- 账号登录态 / 区域服务器问题。

`callDevice()` 会将 Rust 错误传回前端；UI 应将错误内容显示在面板中，方便定位。

## 10. LAN Mode 与后续扩展

当前设备卡片对 `yeelink.light` 型号提供 LAN Mode 开关：

- 查询属性：`get_prop`，参数 `['lan_ctrl']`。
- 写入配置：`set_ps`，参数 `['cfg_lan_ctrl', '1']` 开启，`['cfg_lan_ctrl', '0']` 关闭。

现有设备卡片已经实现这部分逻辑，一般不需要重复造轮子。

要区分：

- Toolkit 目前的 `callDevice()`：通过 Xiaomi Mi Cloud 的 `/home/rpc/{did}` 进行设备 RPC。
- Yeelight LAN Control：打开设备局域网控制后，可研究从本地网络直连控制的方案。

一些第三方 Yeelight 协议资料还记录了 `lamp15` 后灯带左右分区的 `set_segment_rgb(left_rgb, right_rgb)`。该能力属于额外的经验性协议资料，不能直接视为当前 Toolkit 的云端 RPC 已验证支持。建议作为独立实验：先确认本机固件、LAN 控制和实际返回，再决定是否加入左右分区 UI。

## 11. 安全与工程注意事项

1. 设备 `token`、小米账号密码、`serviceToken`、`ssecurity` 等都属于敏感凭证，不要提交到 Git、截图公开或写入调试日志。
2. 当前 `DeviceComponent` 模板会直接展示 `device.token`。fork 后建议默认隐藏 Token，只提供显式点击后短暂显示或复制的能力。
3. 新增控件按精确 model 判断；不要将 lamp15 专属 RPC 应用到其他 Yeelight 设备。
4. 参数统一从类型化 helper 生成，避免在模板中硬编码 JSON 字符串。
5. 色温、亮度、Hue 和 Saturation 在调用前都做范围限制。
6. 不要在滑块拖动的每个像素变化时都发送云端请求；做防抖或在释放滑块时提交。
7. 不要把“RPC 返回成功”理解为所有状态一定立即同步；命令后复读设备属性，必要时提示“设备状态更新中”。

## 12. 建议开发顺序

### 第一阶段：最小可用面板

- [X] 新增 `Lamp15Service` 命令封装。
- [X] 精确识别 `yeelink.light.lamp15`。
- [X] 增加主灯开关、亮度滑块、色温滑块。
- [X] 增加氛围灯开关、亮度滑块。
- [X] 增加氛围灯“色温 / 彩色”模式切换。
- [X] 增加氛围灯色温滑块和 HTML color picker。
- [X] 命令成功后重新读取状态。

### 第二阶段：体验优化

- [X] 加入色温预设按钮。
- [X] 增加 HSV 色相 / 饱和度控件。
- [X] 增加命令 loading、失败提示和重试。
- [X] 优化滑块防抖、命令并发和状态回滚。
- [ ] 将控制面板抽成可复用的型号插件配置。

### 第三阶段：设备能力扩展

- [ ] 验证 `bg_color_mode`、`bg_min_ct`、`bg_max_ct` 等扩展属性。
- [ ] 实验 `set_segment_rgb` 左右分区控制（仅在确认固件和传输路径支持后）。
- [ ] 评估 LAN 直连控制，与 Mi Cloud 控制形成可选的传输策略。

## 13. 实机验收清单

开发时逐条检查，不要仅凭 UI 数值变化判断成功：

- [ ] `get_prop` 主灯属性返回正常。
- [ ] `get_prop` 背景灯属性返回正常。
- [ ] 主灯开 / 关独立生效。
- [ ] 主灯亮度改变，背景灯亮度不被改变。
- [ ] 主灯色温改变，背景灯色温不被改变。
- [ ] 氛围灯开 / 关独立生效。
- [ ] 氛围灯亮度改变，主灯亮度不被改变。
- [ ] 氛围灯色温模式可正常切换。
- [ ] 氛围灯 RGB 模式可正常切换。
- [ ] HSV Hue / Saturation 值正确映射。
- [ ] RGB 与 CT 切换后，面板显示的模式与设备实际状态一致。
- [ ] 设备离线、登录过期或错误参数时，UI 能显示错误而不是假装成功。
- [ ] 连续拖动滑块不会造成明显请求堆积或 UI 卡顿。

---

## 14. 参考资料与源码入口

### 项目源码

- [mi-home-toolkit 仓库](https://github.com/ApplY3D/mi-home-toolkit)
- [README](https://github.com/ApplY3D/mi-home-toolkit#readme)
- [package.json](https://github.com/ApplY3D/mi-home-toolkit/blob/main/package.json)
- [MiService](https://github.com/ApplY3D/mi-home-toolkit/blob/main/src/app/mi.service.ts)
- [DeviceComponent](https://github.com/ApplY3D/mi-home-toolkit/blob/main/src/app/card/device.component.ts)
- [DevicesPageComponent](https://github.com/ApplY3D/mi-home-toolkit/blob/main/src/app/pages/devices-page.component.ts)
- [ExecuteCommandDialogComponent](https://github.com/ApplY3D/mi-home-toolkit/blob/main/src/app/dialogs/execute-command-dialog/execute-command-dialog.component.ts)
- [Tauri main.rs](https://github.com/ApplY3D/mi-home-toolkit/blob/main/src-tauri/src/main.rs)
- [miio Rust library](https://github.com/ApplY3D/mi-home-toolkit/blob/main/src-tauri/miio/src/lib.rs)

### 设备与协议

- [MIoT Spec：`yeelink.light.lamp15`](https://home.miot-spec.com/spec/yeelink.light.lamp15)
- [Yeelight Inter-Operation Specification PDF](https://www.yeelight.com/download/Yeelight_Inter-Operation_Spec.pdf)
- [Yeelight 命令参考（含背景通道和 lamp15 经验性扩展）](https://numberonebot.github.io/yeelight-client/commands)

> 协议资料只能说明通用方法或社区观察到的能力；最终仍以 `yeelink.light.lamp15` 当前固件通过 Toolkit 实机返回的结果为准。
