---
title: 把桌面 AI 软件变成本地 API：手把手反代教程
date: 2026-09-25
category: 技术
type: tech
description: 桌面端已经登录，但别的工具想用同一个账号的模型？手把手教你把登录态变成 OpenAI 兼容接口——找凭据、修四处协议不匹配、搞清模型名、三步验证，全程不用另外买 API Key。
image: /ai-reverse-proxy-cover.jpg
---

## 先说清楚这篇讲什么

场景很具体：

你电脑上装了腾讯主推的一款 AI 办公软件（下面简称「**该软件**」），已经登录、能正常聊天。但你还想让**别的工具**也用上它的模型——比如编辑器插件、自动化脚本、Agent 框架、测试平台。

正常做法是去申请官方 API Key。但可能要付费、要企业认证、要走审批流程。

**这篇教程讲的是另一条路**：桌面版登录之后，登录凭证就存在你本地的文件里。写一个很小的本地服务读这份凭证，冒充官方客户端向上游发请求，对外暴露一个 **OpenAI 兼容接口**。其他工具连这个本地接口，就等于在用你的账号调模型。

### 需要准备什么

| 项目 | 要求 |
|---|---|
| 桌面端 | 已安装并**成功登录**（能正常聊天） |
| Python | 3.9 以上 |
| 网络 | 能正常访问该软件的服务端 |

### 这篇的组织方式

按"第 1 步、第 2 步"的顺序走。每一步都写清**怎么做**和**看到什么算成功**。最后有错误码对照表和常见坑清单——**卡住了先去那两张表找。**

---

## 第 0 步：先理解原理，只要三步

不用懂代码也能看懂这张图：

```
① 桌面版登录  →  凭证（token）写入本地文件
② 反代启动    →  读取凭证文件，拿到 token
③ 下游请求    →  反代补上协议要求的请求头 → 转发给上游 → 原样返回结果
```

**一个关键设计**：反代**每次启动时**实时读凭证文件，不缓存。

这个特性带来一个好处：**换账号只需要「桌面版重新登录 + 重启反代」**，不用改任何代码。第 9 步会详细讲。

理解了这三步，后面的排查就有方向了——出问题无非是这三个环节之一。

---

## 第 1 步：确认你用的是哪条产品线

产品线搞错的话，后面所有排查都在一个错误的地址上进行——你会反复试 User-Agent 和模型名，怎么试都不对。

这类产品往往有**多个品牌线**，而它们的**网关地址不一样**。用错地址，请求会一直返回 401。

### 1.1 读配置文件（最权威）

安装目录里有个 `product.json`，它的 `endpoint` 字段就是你要用的网关地址。

**【Windows】PowerShell：**

```powershell
python -c "import json,io;d=json.load(io.open(r'<安装目录>\resources\app.asar.unpacked\cli\product.json',encoding='utf-8'));print('endpoint =',d.get('endpoint'));print('productName =',d.get('productName'))"
```

把 `<安装目录>` 换成你实际的安装路径。

**看到什么算成功**：输出里有 `endpoint = https://...` 一行，**把那个地址记下来**，第 5 步要用。

### 1.2 解 JWT 确认账号归属

登录凭证里那个 token 是个 JWT，解开就能看到它属于哪条产品线。

```python
import base64, json

tok = "<你的 accessToken>"
p = tok.split('.')[1]
p += '=' * (-len(p) % 4)
print(json.loads(base64.urlsafe_b64decode(p))['iss'])
```

**怎么看结果：**

| `iss` 里包含 | 结论 |
|---|---|
| 国际域名 | 用的是国际版，网关按 1.1 读出来的填 |
| 国内域名 | 用的是国内版，网关同样以 1.1 为准 |

**两条产品线的网关不一样，以 1.1 读出来的为准。**

---

## 第 2 步：找到登录凭据文件

### 2.1 位置

| 平台 | 路径 |
|---|---|
| Windows | `%LOCALAPPDATA%\<产品目录>\Data\Public\auth\` |
| macOS | `~/Library/Application Support/<产品目录>/Data/Public/auth/` |
| Linux | `~/.local/share/<产品目录>/Data/Public/auth/` |

文件名各版本不一样，可能是 `<产品>-desktop.info`，也可能是 `<产品>-desktop-ai.info`。以你实际找到的为准。

### 2.2 一条命令找出来

**【Windows】PowerShell：**

```powershell
Get-ChildItem "$env:LOCALAPPDATA" -Recurse -Filter "*.info" -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match "auth" } |
  Select-Object -ExpandProperty FullName
```

**看到什么算成功**：列出至少一个 `.info` 文件的完整路径。**把它记下来。**

![PowerShell 搜出凭据文件的完整路径](/rp-01-find-credential.png)

如果什么都没输出，说明桌面版还没登录过——回去打开软件登录一次再试。

### 2.3 文件里有什么

用记事本或 VS Code 打开那个文件，是个 JSON：

```json
{
  "auth": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "...",
    "expiresAt": 1234567890
  },
  "account": {
    "uid": "...",
    "email": "..."
  }
}
```

**你要的是 `auth.accessToken` 这个字段的值。**

> ⚠️ **这个文件等于你的登录态。**

---

## 第 3 步：挑一个反代项目

GitHub 上有现成的开源实现，搜关键词 `<产品名>2api` 就能找到几个。

| 类型 | 语言 | 特点 |
|---|---|---|
| **单文件版** | Python | ✅ **首选**：依赖只有 fastapi + uvicorn，支持 tools 透传 |
| 功能全版 | Python | 带账号池、用量统计，但要 MySQL + Redis，部署重 |
| Go 版 | Go | 有现成 exe，但要编译环境 |

**新手直接选第一种**，单文件、依赖少、好排查。

### 3.1 装之前先做安全检查

第三方项目拿到手，**先看它往哪儿发数据**：

```bash
# 列出代码里所有外部地址
grep -ohE "https?://[a-zA-Z0-9._/-]+" *.py | sed 's|\(https\?://[^/]*\).*|\1|' | sort -u

# 找危险调用
grep -nE "\beval\(|\bexec\(|pickle|subprocess|os\.system|upload|webhook" *.py
```

**第一条的判读标准**：结果里**只应该出现 `localhost` 和你用的那个软件的官方域名**。

出现任何陌生的第三方域名，都值得警惕——那可能是把你的凭证往别人服务器上送。

**第二条**：出现 `eval` / `exec` / `pickle` / `subprocess` 不代表一定有问题，但要人工看一眼它到底在干什么。

---

## 第 4 步：装依赖、把服务跑起来

```bash
# 装依赖（一般就这两个）
pip install fastapi uvicorn

# 启动（用 -u，否则日志被缓冲，看不到实时输出）
python -u server.py
```

**看到什么算成功**：终端里出现监听日志，类似：

```
Uvicorn running on http://127.0.0.1:8787
```

**端口默认是 8787，但项目之间不一样，以日志里打印的为准。**

> **关于绑定地址**：默认绑 `127.0.0.1`。绑 `0.0.0.0` 的话，局域网里任何设备都能连上。
> 需要虚拟机访问的话，走第 10 步的 portproxy 方案。

---

## 第 5 步：修四处协议不匹配（最容易卡住的地方）

**这是整篇教程最关键的一步。**

开源项目多半是按旧版本或国内版写的，直接跑会失败。要修的是四个地方：

| 编号 | 问题 | 症状 |
|---|---|---|
| a | 上游 host 写死成旧的 | 401 |
| b | 缺 User-Agent | `code 12403 check ua` |
| c | 首条消息不是 system prompt | `code 11128` |
| d | 模型名不是"档位名" | `code 11102` |

### 5.1 关键做法：不直接改第三方文件

第三方项目还会更新，你改了下一次就冲突。

**正确姿势是写一个自己的启动器**，在运行时 monkey-patch：

```python
import <反代项目的模块名> as _cda

# (a) 强制正确的上游 host
_orig_init = _cda.ApiClient.__init__
def _patched_init(self, base_url, token_info, safe_mode=False):
    _orig_init(self, "https://www.<你的网关域名>", token_info, safe_mode)
_cda.ApiClient.__init__ = _patched_init

# (b) 补上 User-Agent
_orig_headers = _cda.ApiClient._build_headers
def _patched_headers(self, extra=None, stream=False, model=""):
    h = _orig_headers(self, extra=extra, stream=stream, model=model)
    h.setdefault("User-Agent", "<产品标识>/0.0.0")
    return h
_cda.ApiClient._build_headers = _patched_headers

# (c) 保证首条是 system prompt，并把模型名映射成档位名
_orig_chat = _cda.ApiClient.chat_completion
def _patched_chat(self, messages, model="", **kw):
    model = {"deepseek-v4-flash": "fast-model", "deepseek-v4-pro": "primary-model"}.get(model, model)
    if not messages or (messages[0] or {}).get("role") != "system":
        messages = [{"role": "system", "content": "You are a helpful assistant."}] + list(messages)
    return _orig_chat(self, messages, model=model, **kw)
_cda.ApiClient.chat_completion = _patched_chat

# (d) 只暴露账号真实可用的档位名
TIERS = {"fast-model", "balanced-model", "primary-model", "deep-model"}
_cda.KNOWN_CHAT_MODELS = set(TIERS)
_cda.ALL_SUPPORTED_MODELS = set(TIERS)
_cda.FREE_MODELS = set()
```

### 5.2 两个占位符怎么填

| 占位符 | 从哪来 |
|---|---|
| `<反代项目的模块名>` | 第三方项目里那个主模块的名字，看它的 `import` 或启动文件就知道 |
| `<产品标识>` | 必须和官方客户端**完全一致**。通常就是"产品名/版本号"的形式，从第 1 步读的 `product.json` 里能找到 |

### 5.3 错误码对照表

**排查时对着这张表走：**

| 现象 | 含义 | 怎么修 |
|---|---|---|
| **401** + 返回一页 HTML | 网关地址用错了 | 换成第 1 步读出来的 host |
| `code 12403` "check ua" | 缺 User-Agent | 补上 `<产品标识>/<版本>` |
| `code 11128` | 首条消息不是 system prompt | 注入一条 system 消息 |
| `code 11102` "service info not found" | 模型名不对 | 改用档位名（见第 6 步） |
| `code 11101` | 探活请求太短（网关要求带 system） | 同上，补 system |
| `code 11140` | 套餐权限不足 | 换账号或换套餐 |

三种典型报错长这样：

![三种协议不匹配的报错：401、code 12403、code 11102](/rp-02-error-codes.png)

> **排查顺序是固定的：host → User-Agent → 请求格式 → 模型名。**
> 每一步的报错码都不一样，按顺序走效率最高——直接跳到模型名去试，往往白花半小时。

---

## 第 6 步：搞清楚模型名（第二个大坑）

**你可能会以为可以直接用 `deepseek-v4-flash` 这种具体模型名去调。不行。**

这套账号体系里，模型是按**档位**暴露的。

### 6.1 可用清单只能从报错里拿

故意用一个错的模型名去调，上游会把真实可用的清单告诉你：

```
400 model [xxx] service info not found
Currently supported models for your account:
  - fast-model
  - balanced-model
  - primary-model
  - deep-model
```

### 6.2 四个档位

| 档位名 | 定位 | 相对倍率 |
|---|---|---|
| `fast-model` | 最快最省，日常首选 | x0.34 |
| `balanced-model` | 均衡 | x0.59 |
| `primary-model` | 主力 | x1.70 |
| `deep-model` | 深度推理 | x2.20 |

### 6.3 `/v1/models` 返回的长列表不可靠

那多半是反代项目**内置的兜底列表**，不是你的账号真实可用的模型清单。

实测过：`/v1/models` 返回了 32 个模型，实际能调通的只有 4 个档位名。

**正确做法**：让代理的 `/v1/models` 只暴露这四个档位名——就是第 5 步 monkey-patch 里 (d) 段的作用。

---

## 第 7 步：三步验证

服务跑起来了，现在验证它是不是真的能用。

### 第一步：健康检查

```bash
curl -s --noproxy '*' http://127.0.0.1:8787/health
```

**期望看到类似：**

```json
{"status":"ok","<产品前缀>_configured":true}
```

> 字段名可能带产品前缀，也可能就叫 `configured`。**只要 `status` 是 `ok`，就说明服务起来了。**

> ⚠️ **`--noproxy '*'` 是关键。** 本机开着代理软件时，`HTTP_PROXY` 环境变量会把发往 `127.0.0.1` 的请求也劫走，导致连不上本地服务。

### 第二步：看模型列表

```bash
curl -s --noproxy '*' http://127.0.0.1:8787/v1/models \
  -H "Authorization: Bearer <本地key>"
```

**期望只看到 4 个档位名。** 如果返回一长串，说明第 5 步的 (d) 段没生效。

### 第三步：真实调用

```bash
curl -s --noproxy '*' -X POST http://127.0.0.1:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <本地key>" \
  -d '{"model":"fast-model","messages":[{"role":"user","content":"1+1=?"}],"stream":false}'
```

**期望** `choices[0].message.content` 是 `"2"`。

三次请求的完整输出长这样：

![三步验证的完整输出：/health、/v1/models、真实调用](/rp-03-verify.png)

用 `stream: false`（非流式）测试更容易看清返回结构。通了之后再切流式。

> **如果返回的是固定占位内容**（比如永远是"（完成）"这种），说明**请求根本没打到上游**，反代走了 fallback 分支。回到第 5.3 节的错误码表按顺序排查。

---

## 第 8 步：接进你的工具里

三步验证都过了，就可以把它接到别的工具上了。要填的就三个值：

| 字段 | 填什么 |
|---|---|
| Base URL / API 地址 | `http://127.0.0.1:8787/v1` |
| API Key | 反代自己设定的那个本地 key（**不是**你的账号 token） |
| Model | 四个档位名之一，比如 `fast-model` |

**几个容易填错的地方：**

- **Base URL 结尾带不带 `/v1`** —— 看工具的说明。有的工具要求填到 `/v1`，有的只填到端口，然后自己在后面拼路径。填错了会 404
- **地址填本机** —— 有些工具默认让你填 API 域名，这里要填的是本机地址
- **API Key 是反代发给下游的**，跟你的账号无关。在反代的配置里能看到或自定义

**看到什么算成功**：工具里发一条消息，能正常返回内容。

---

## 第 9 步：换账号

**原理**：反代每次启动实时读凭证，不缓存。所以换号只要两步。

### 步骤 1：桌面端换账号

打开桌面版 → **退出登录** → 用新账号登录。

这会把新 token 写进第 2 步找到的那个凭据文件。

### 步骤 2：重启反代

```bash
# 找到旧实例
netstat -ano | grep :8787

# 杀掉（把 <pid> 换成上面查到的进程号）
taskkill /PID <pid> /F

# 按原来的方式重新启动
python -u server.py
```

**不重启就还在用旧 token。**

### 怎么确认真的换了账号

`/health` 只能说明"已配置"，**不能说明是哪个账号**。

要确认，解 JWT 看 `iss` 和 `account`：

```python
import json, io, glob, os, base64

d = os.path.expandvars(r'%LOCALAPPDATA%\<产品目录>\Data\Public\auth')
for f in glob.glob(d + r'\*.info'):
    j = json.load(io.open(f, encoding='utf-8'))
    tok = (j.get('auth') or {}).get('accessToken', '')
    p = tok.split('.')[1]
    p += '=' * (-len(p) % 4)
    pl = json.loads(base64.urlsafe_b64decode(p))
    print(f)
    print('  iss     =', pl.get('iss'))
    print('  account =', j.get('account'))
```

### 换号后要复查的两件事

1. **新账号的可用模型可能不同** —— 档位名一样，权限不一定一样。报 `code 11140` 就是新账号套餐不够
2. **下游工具里写死的模型名可能要改** —— 如果某个工具里固定填了具体模型名，而新账号没有这个模型，请求会直接失败

---

## 第 10 步：让虚拟机 / 局域网也能用

如果反代绑在 `127.0.0.1`，虚拟机是访问不到的。两个方案。

### 方案 A：改绑定地址（简单，但不安全）

启动时绑 `0.0.0.0`，虚拟机通过宿主机 IP 访问。

**代价**：局域网里任何设备都能连上。

### 方案 B：portproxy 转发（推荐）

保持服务绑在 `127.0.0.1`，用 Windows 自带的端口转发把请求转进来。

**第一步：确认虚拟机的网络模式**，找到对应的宿主机 IP：

| 虚拟机网络模式 | 宿主机 IP 是哪个 |
|---|---|
| VMware NAT | VMnet8 的地址 |
| 仅主机（Host-Only） | VMnet1 的地址 |
| 桥接（Bridged） | 真实网卡的地址 |

**第二步：【Windows】用管理员身份打开 PowerShell**，执行：

```powershell
# 添加转发规则：<宿主机IP>:8787 → 127.0.0.1:8787
netsh interface portproxy add v4tov4 listenaddress=<宿主机IP> listenport=8787 connectaddress=127.0.0.1 connectport=8787

# 放行防火墙
netsh advfirewall firewall add rule name="AI Proxy 8787" dir=in action=allow protocol=TCP localport=8787

# 查看已生效的规则
netsh interface portproxy show all
```

**看到什么算成功**：`show all` 能列出你刚加的那条规则。

**第三步：【虚拟机】里验证：**

```bash
curl -s http://<宿主机IP>:8787/health
```

返回 `status: ok` 就通了。

> **注意**：portproxy 规则**重启后依然存在**（持久化的），不用每次开机重配。但如果宿主机 IP 变了（换了网络环境），规则要重建。

---

## 常见坑清单

| 坑 | 症状 | 解决 |
|---|---|---|
| 系统代理劫持本地请求 | 连 `127.0.0.1` 都超时 | 命令加 `--noproxy '*'` |
| 端口被旧实例占用 | 启动报地址已被占用 | `netstat -ano` 找 PID 后杀掉 |
| 日志看不到 | 启动后没有任何输出 | 用 `python -u` |
| 启动后进程被回收 | 自动化环境里刚起来就没了 | 在同一个命令里完成启动 + 测试 |
| token 过期 | 突然开始 401 | 桌面版重新登录，重启反代 |
| 模型名报 11102 | 调用失败 | 改用档位名 |
| 返回固定占位内容 | 内容永远是同一句 | 请求没打到上游，按错误码表排查 |
| 换了账号没生效 | 额度还是旧账号的 | 忘了重启反代 |

---

## 结语

整个过程的核心其实就三句话：

1. **先分清产品线** —— 网关地址错了，一切都是白搭
2. **四处协议不匹配要补** —— host、User-Agent、system prompt、模型名，每一步的报错码都不一样
3. **模型只认档位名** —— `/v1/models` 返回的长列表不可靠

做完之后，你的其他工具就能连 `http://127.0.0.1:8787/v1`，用桌面端账号里的模型了。

这篇里的每一步都写清了"看到什么算成功"，也给了错误码对照表和坑清单。但实际操作中总会遇到环境差异——你的版本号、安装路径、工具界面都可能跟示例不一样。

**真卡住了就把报错原样贴给 AI，让它带你定位。**

---

## 附：不想自己一步步操作？把这段丢给 Claude

下面这段整段复制给 Claude（Claude Code、Claude 桌面版都行），它会替你执行——自己找文件、装依赖、跑验证、看报错。遇到必须你本人配合的，它会告诉你。

```text
帮我把这台电脑上已登录的 <软件名> 桌面版做成一个本地 OpenAI 兼容接口，你全程执行。

1. 找到它的安装目录，读 product.json，拿到 endpoint 和产品标识
2. 在 %LOCALAPPDATA% 下搜路径含 auth 的 *.info 文件，读出 accessToken
3. 从 GitHub 找 <软件名>2api 项目并下载，先做安全检查（列出代码里所有外部域名，应该只有 localhost 和官方域名）
4. 装依赖，写一个启动器 monkey-patch 四处不匹配：上游 host、User-Agent、首条 system prompt、模型名映射
5. 启动服务，三步验证：/health、/v1/models（应只有 4 个档位名）、真实调用一次
6. 把 base_url、本地 key 和可用模型名给我

报错按 host → User-Agent → 请求格式 → 模型名 的顺序排查，需要我做什么直接说。
```
